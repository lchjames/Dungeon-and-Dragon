import { evaluateStoryConditions, normalizeStoryTrigger } from './story-event-rules.js';
import {
  activateRuntimeEncounter,
  loadRuntimeEncounterMap
} from './runtime-encounter-state.js';
import {
  spawnRuntimeMonster,
  startRuntimeEncounterCombat
} from './runtime-encounter-service.js';

let schemaPromise = null;

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function cleanError(error) {
  return {
    code: String(error?.code || 'STORY_EFFECT_EXECUTION_FAILED').slice(0, 120),
    message: String(error?.message || error || 'Story Event effect execution failed.').slice(0, 1000)
  };
}

async function ensureSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_story_flags (
        scene_run_id TEXT NOT NULL,
        flag_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scene_run_id, flag_key),
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_story_narratives (
        id TEXT PRIMARY KEY,
        scene_run_id TEXT NOT NULL,
        story_event_id TEXT NOT NULL,
        narrative_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_story_event_executions (
        id TEXT PRIMARY KEY,
        story_event_id TEXT NOT NULL,
        scene_run_id TEXT NOT NULL,
        map_instance_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('applied', 'failed')),
        trigger_type TEXT NOT NULL,
        effects_applied_json TEXT NOT NULL DEFAULT '[]',
        error_code TEXT,
        error_message TEXT,
        activated_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE CASCADE,
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_door_state_log (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        runtime_edge_id TEXT NOT NULL,
        from_state TEXT NOT NULL CHECK (from_state IN ('open', 'closed', 'locked', 'broken')),
        to_state TEXT NOT NULL CHECK (to_state IN ('open', 'closed', 'locked', 'broken')),
        changed_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (runtime_edge_id) REFERENCES runtime_map_edges(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_exec_scene_event ON runtime_story_event_executions(scene_run_id, story_event_id, status, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_door_state_log_edge ON runtime_door_state_log(runtime_edge_id, created_at)')
    ]).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function eventPayload(row) {
  return {
    id: row.id,
    sceneId: row.scene_id,
    name: row.name,
    triggerType: row.trigger_type,
    trigger: parseJson(row.trigger_json, {}),
    conditions: parseJson(row.conditions_json, []),
    effects: parseJson(row.effects_json, []),
    oncePerSceneRun: Boolean(row.once_per_scene_run)
  };
}

async function loadTargets(env, mapInstanceId) {
  const [zones, doors, spawns] = await Promise.all([
    env.DB.prepare(`
      SELECT id, source_zone_id, name, player_visible
      FROM runtime_map_zones
      WHERE map_instance_id = ? AND source_zone_id IS NOT NULL
      ORDER BY created_at, id
    `).bind(mapInstanceId).all(),
    env.DB.prepare(`
      SELECT id, source_edge_id, x, y, direction, door_state, blocks_movement
      FROM runtime_map_edges
      WHERE map_instance_id = ? AND edge_type = 'door' AND source_edge_id IS NOT NULL
      ORDER BY y, x, direction, id
    `).bind(mapInstanceId).all(),
    env.DB.prepare(`
      SELECT id, source_spawn_point_id, name, x, y, spawn_type, enabled
      FROM runtime_map_spawn_points
      WHERE map_instance_id = ? AND source_spawn_point_id IS NOT NULL
      ORDER BY created_at, id
    `).bind(mapInstanceId).all()
  ]);
  return {
    zoneBySource: new Map((zones.results || []).map(row => [row.source_zone_id, {
      id: row.id, sourceZoneId: row.source_zone_id, name: row.name, playerVisible: Boolean(row.player_visible)
    }])),
    doorBySource: new Map((doors.results || []).map(row => [row.source_edge_id, {
      id: row.id, sourceEdgeId: row.source_edge_id, x: Number(row.x), y: Number(row.y), direction: row.direction,
      doorState: row.door_state || 'closed', blocksMovement: Boolean(row.blocks_movement)
    }])),
    spawnBySource: new Map((spawns.results || []).map(row => [row.source_spawn_point_id, {
      id: row.id, sourceSpawnPointId: row.source_spawn_point_id, name: row.name,
      x: Number(row.x), y: Number(row.y), spawnType: row.spawn_type, enabled: Boolean(row.enabled)
    }]))
  };
}

function doorStates(targets) {
  return new Map([...targets.doorBySource].map(([id, edge]) => [id, edge.doorState || 'closed']));
}

async function loadFlags(env, sceneRunId) {
  const rows = await env.DB.prepare('SELECT flag_key, value_json FROM runtime_story_flags WHERE scene_run_id = ?').bind(sceneRunId).all();
  return new Map((rows.results || []).map(row => [row.flag_key, parseJson(row.value_json, null)]));
}

async function appliedCounts(env, sceneRunId) {
  const rows = await env.DB.prepare(`
    SELECT story_event_id, COUNT(*) AS count
    FROM runtime_story_event_executions
    WHERE scene_run_id = ? AND status = 'applied'
    GROUP BY story_event_id
  `).bind(sceneRunId).all();
  return new Map((rows.results || []).map(row => [row.story_event_id, Number(row.count || 0)]));
}

function validateTargets(event, targets, encounters) {
  for (const condition of event.conditions || []) {
    if (condition.type === 'encounter_status' && !encounters.has(condition.encounterId)) {
      throw Object.assign(new Error(`Runtime Encounter target not found: ${condition.encounterId}`), { code: 'STORY_CONDITION_ENCOUNTER_NOT_FOUND' });
    }
    if (condition.type === 'door_state' && !targets.doorBySource.has(condition.sourceEdgeId)) {
      throw Object.assign(new Error(`Runtime Door target not found: ${condition.sourceEdgeId}`), { code: 'STORY_CONDITION_DOOR_NOT_FOUND' });
    }
  }
  for (const effect of event.effects || []) {
    if ((effect.type === 'activate_encounter' || effect.type === 'spawn_monster' || effect.type === 'start_combat') && !encounters.has(effect.encounterId)) {
      throw Object.assign(new Error(`Runtime Encounter target not found: ${effect.encounterId}`), { code: 'STORY_EFFECT_ENCOUNTER_NOT_FOUND' });
    }
    if (effect.type === 'spawn_monster' && !targets.spawnBySource.has(effect.sourceSpawnPointId)) {
      throw Object.assign(new Error(`Runtime Spawn Point target not found: ${effect.sourceSpawnPointId}`), { code: 'STORY_EFFECT_SPAWN_POINT_NOT_FOUND' });
    }
    if (effect.type === 'reveal_zone' && !targets.zoneBySource.has(effect.sourceZoneId)) {
      throw Object.assign(new Error(`Runtime Zone target not found: ${effect.sourceZoneId}`), { code: 'STORY_EFFECT_ZONE_NOT_FOUND' });
    }
    if ((effect.type === 'open_door' || effect.type === 'close_door') && !targets.doorBySource.has(effect.sourceEdgeId)) {
      throw Object.assign(new Error(`Runtime Door target not found: ${effect.sourceEdgeId}`), { code: 'STORY_EFFECT_DOOR_NOT_FOUND' });
    }
  }
}

function blocksMovementForDoorState(state) {
  return state === 'closed' || state === 'locked';
}

async function applyDoorEffect(env, context, edge, nextState) {
  const previousState = edge.doorState || 'closed';
  if (previousState === nextState) {
    return { sourceEdgeId: edge.sourceEdgeId, runtimeEdgeId: edge.id, state: nextState, unchanged: true };
  }
  const now = Date.now();
  const blocksMovement = blocksMovementForDoorState(nextState) ? 1 : 0;
  const auditId = `runtime_door_log_${crypto.randomUUID()}`;
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE runtime_map_edges
      SET door_state = ?, blocks_movement = ?, updated_at = ?
      WHERE id = ? AND map_instance_id = ? AND edge_type = 'door'
        AND COALESCE(door_state, 'closed') = ?
        AND EXISTS (SELECT 1 FROM runtime_map_instances WHERE id = ? AND status = 'active')
    `).bind(nextState, blocksMovement, now, edge.id, context.mapInstanceId, previousState, context.mapInstanceId),
    env.DB.prepare(`
      INSERT INTO runtime_door_state_log (
        id, map_instance_id, runtime_edge_id, from_state, to_state, changed_by_user_id, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM runtime_map_edges
        WHERE id = ? AND map_instance_id = ? AND edge_type = 'door'
          AND door_state = ? AND updated_at = ?
      )
    `).bind(auditId, context.mapInstanceId, edge.id, previousState, nextState, context.actor.id, now,
      edge.id, context.mapInstanceId, nextState, now)
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    throw Object.assign(new Error('Runtime Door changed before Story effect execution.'), { code: 'STORY_EFFECT_DOOR_CHANGED' });
  }
  edge.doorState = nextState;
  edge.blocksMovement = Boolean(blocksMovement);
  context.doors.set(edge.sourceEdgeId, nextState);
  return { sourceEdgeId: edge.sourceEdgeId, runtimeEdgeId: edge.id, state: nextState, unchanged: false, auditId };
}

async function applyEffect(env, context, effect, effectIndex) {
  const now = Date.now();
  if (effect.type === 'show_narrative') {
    const id = `story_narrative_${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO runtime_story_narratives (id, scene_run_id, story_event_id, narrative_text, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, context.sceneRunId, context.event.id, effect.text, now).run();
    return { type: effect.type, narrativeId: id };
  }
  if (effect.type === 'set_flag') {
    await env.DB.prepare(`
      INSERT INTO runtime_story_flags (scene_run_id, flag_key, value_json, updated_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(scene_run_id, flag_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = excluded.updated_at
    `).bind(context.sceneRunId, effect.key, JSON.stringify(effect.value), context.actor.id, now, now).run();
    context.flags.set(effect.key, effect.value);
    return { type: effect.type, key: effect.key, value: effect.value };
  }
  if (effect.type === 'reveal_zone') {
    const zone = context.targets.zoneBySource.get(effect.sourceZoneId);
    const result = await env.DB.prepare(`
      UPDATE runtime_map_zones SET player_visible = 1, updated_at = ?
      WHERE id = ? AND map_instance_id = ?
        AND EXISTS (SELECT 1 FROM runtime_map_instances WHERE id = ? AND status = 'active')
    `).bind(now, zone.id, context.mapInstanceId, context.mapInstanceId).run();
    if (Number(result?.meta?.changes || 0) !== 1) {
      throw Object.assign(new Error('Runtime Zone changed before Story effect execution.'), { code: 'STORY_EFFECT_ZONE_CHANGED' });
    }
    zone.playerVisible = true;
    return { type: effect.type, sourceZoneId: effect.sourceZoneId, runtimeZoneId: zone.id };
  }
  if (effect.type === 'open_door' || effect.type === 'close_door') {
    const edge = context.targets.doorBySource.get(effect.sourceEdgeId);
    return { type: effect.type, ...(await applyDoorEffect(env, context, edge, effect.type === 'open_door' ? 'open' : 'closed')) };
  }
  if (effect.type === 'activate_encounter') {
    const activated = await activateRuntimeEncounter(env, {
      sceneRunId: context.sceneRunId,
      sceneId: context.sceneId,
      encounterId: effect.encounterId,
      actorUserId: context.actor.id,
      storyEventId: context.event.id
    });
    context.encounters.set(effect.encounterId, activated);
    return {
      type: effect.type, encounterId: effect.encounterId, runtimeEncounterId: activated.id,
      status: activated.status, unchanged: Boolean(activated.unchanged)
    };
  }
  if (effect.type === 'spawn_monster') {
    const spawned = await spawnRuntimeMonster(env, {
      mapInstanceId: context.mapInstanceId,
      sceneRunId: context.sceneRunId,
      sceneId: context.sceneId,
      encounterId: effect.encounterId,
      templateId: effect.templateId,
      level: effect.level,
      sourceSpawnPointId: effect.sourceSpawnPointId,
      displayName: effect.displayName || '',
      actorUserId: context.actor.id,
      storyEventId: context.event.oncePerSceneRun ? context.event.id : null,
      storyEffectIndex: context.event.oncePerSceneRun ? effectIndex : null
    });
    if (spawned.runtimeEncounter) context.encounters.set(effect.encounterId, spawned.runtimeEncounter);
    return {
      type: effect.type, encounterId: effect.encounterId, monsterId: spawned.monster.id,
      templateId: spawned.monster.templateId, displayName: spawned.monster.displayName,
      sourceSpawnPointId: spawned.spawnPoint.sourceSpawnPointId,
      x: spawned.position.x, y: spawned.position.y, unchanged: Boolean(spawned.unchanged)
    };
  }
  if (effect.type === 'start_combat') {
    const started = await startRuntimeEncounterCombat(env, {
      mapInstanceId: context.mapInstanceId,
      sceneRunId: context.sceneRunId,
      sceneId: context.sceneId,
      encounterId: effect.encounterId,
      actorUserId: context.actor.id
    });
    if (started.runtimeEncounter) context.encounters.set(effect.encounterId, started.runtimeEncounter);
    return {
      type: effect.type, encounterId: effect.encounterId,
      combatId: started.combat?.id || started.runtimeEncounter?.combat?.combatId || null,
      mapInstanceId: started.mapInstanceId, unchanged: Boolean(started.unchanged)
    };
  }
  throw Object.assign(new Error(`Unsupported approved Story Effect: ${effect.type}`), { code: 'STORY_EFFECT_UNSUPPORTED' });
}

async function recordExecution(env, context, status, effectsApplied, error = null) {
  const executionId = `story_exec_${crypto.randomUUID()}`;
  const failure = error ? cleanError(error) : { code: null, message: null };
  await env.DB.prepare(`
    INSERT INTO runtime_story_event_executions (
      id, story_event_id, scene_run_id, map_instance_id, status, trigger_type,
      effects_applied_json, error_code, error_message, activated_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    executionId, context.event.id, context.sceneRunId, context.mapInstanceId, status,
    context.event.triggerType, JSON.stringify(effectsApplied), failure.code, failure.message,
    context.actor.id, Date.now()
  ).run();
  return executionId;
}

async function executeEvent(env, shared, event, firedCount) {
  if (event.oncePerSceneRun && firedCount > 0) {
    return { eventId: event.id, name: event.name, status: 'skipped', code: 'STORY_EVENT_ALREADY_FIRED' };
  }
  try {
    validateTargets(event, shared.targets, shared.encounters);
  } catch (error) {
    const executionId = await recordExecution(env, { ...shared, event }, 'failed', [], error).catch(() => null);
    return { eventId: event.id, name: event.name, status: 'failed', executionId, ...cleanError(error) };
  }
  const conditions = evaluateStoryConditions(event.conditions, {
    flags: shared.flags,
    eventAlreadyFired: firedCount > 0,
    storyEventId: event.id,
    sceneRunStatus: shared.sceneRunStatus,
    doors: shared.doors,
    encounters: shared.encounters
  });
  if (!conditions.ok) {
    return {
      eventId: event.id, name: event.name, status: 'skipped', code: 'STORY_EVENT_CONDITIONS_NOT_MET',
      failures: conditions.failures
    };
  }

  const effectsApplied = [];
  const context = { ...shared, event };
  try {
    for (const [effectIndex, effect] of (event.effects || []).entries()) {
      effectsApplied.push(await applyEffect(env, context, effect, effectIndex));
    }
    const executionId = await recordExecution(env, context, 'applied', effectsApplied);
    return { eventId: event.id, name: event.name, status: 'applied', executionId, effectsApplied };
  } catch (error) {
    const executionId = await recordExecution(env, context, 'failed', effectsApplied, error).catch(() => null);
    return { eventId: event.id, name: event.name, status: 'failed', executionId, effectsApplied, ...cleanError(error) };
  }
}

export async function processEncounterResolvedStoryEvents(env, {
  actor,
  sceneRunId,
  sceneId,
  mapInstanceId,
  encounterId
}) {
  if (!actor?.id || !sceneRunId || !sceneId || !mapInstanceId || !encounterId) return [];
  await ensureSchema(env);
  const [sceneRun, eventRows, targets, flags, counts, encounters] = await Promise.all([
    env.DB.prepare('SELECT id, status FROM scene_runs WHERE id = ? LIMIT 1').bind(sceneRunId).first(),
    env.DB.prepare(`
      SELECT * FROM story_events
      WHERE scene_id = ? AND status = 'active' AND trigger_type = 'encounter_resolved'
      ORDER BY created_at, id
    `).bind(sceneId).all(),
    loadTargets(env, mapInstanceId),
    loadFlags(env, sceneRunId),
    appliedCounts(env, sceneRunId),
    loadRuntimeEncounterMap(env, sceneRunId, sceneId)
  ]);
  if (!sceneRun || sceneRun.status !== 'active') return [];

  const shared = {
    actor,
    sceneRunId,
    sceneRunStatus: sceneRun.status,
    sceneId,
    mapInstanceId,
    targets,
    flags,
    doors: doorStates(targets),
    encounters,
    resolvedEncounterId: encounterId
  };
  const results = [];
  for (const row of eventRows.results || []) {
    const event = eventPayload(row);
    let trigger;
    try {
      trigger = normalizeStoryTrigger('encounter_resolved', event.trigger);
    } catch (error) {
      console.error('Invalid encounter_resolved Story Event trigger definition', {
        eventId: event.id,
        message: String(error?.message || error)
      });
      continue;
    }
    if (trigger.encounterId !== encounterId) continue;
    const firedCount = counts.get(event.id) || 0;
    const result = await executeEvent(env, shared, event, firedCount);
    if (result.status === 'applied') counts.set(event.id, firedCount + 1);
    results.push({ ...result, encounterId });
  }
  return results;
}
