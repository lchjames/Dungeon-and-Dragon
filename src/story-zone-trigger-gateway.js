import baseWorker from './story-event-gateway.js';
import { evaluateStoryConditions, normalizeStoryTrigger } from './story-event-rules.js';
import {
  activateRuntimeEncounter,
  loadRuntimeEncounterMap
} from './runtime-encounter-state.js';
import {
  spawnRuntimeMonster,
  startRuntimeEncounterCombat
} from './runtime-encounter-service.js';

let autoStorySchemaPromise = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function cleanError(error) {
  return {
    code: String(error?.code || 'STORY_EFFECT_EXECUTION_FAILED').slice(0, 120),
    message: String(error?.message || error || 'Story Event effect execution failed.').slice(0, 1000)
  };
}

async function ensureAutoStorySchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!autoStorySchemaPromise) {
    autoStorySchemaPromise = env.DB.batch([
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
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_door_state_log_edge ON runtime_door_state_log(runtime_edge_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_door_state_log_map ON runtime_door_state_log(map_instance_id, created_at)')
    ]).catch(error => {
      autoStorySchemaPromise = null;
      throw error;
    });
  }
  await autoStorySchemaPromise;
}

async function currentUser(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.user || null;
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

async function enteredRuntimeZones(env, mapInstanceId, from, to) {
  const rows = await env.DB.prepare(`
    SELECT rz.id, rz.source_zone_id, rz.name, rz.player_visible
    FROM runtime_map_zones rz
    JOIN runtime_map_zone_cells destination
      ON destination.runtime_zone_id = rz.id
     AND destination.x = ? AND destination.y = ?
    LEFT JOIN runtime_map_zone_cells origin
      ON origin.runtime_zone_id = rz.id
     AND origin.x = ? AND origin.y = ?
    WHERE rz.map_instance_id = ?
      AND rz.source_zone_id IS NOT NULL
      AND TRIM(rz.source_zone_id) <> ''
      AND origin.runtime_zone_id IS NULL
    ORDER BY rz.created_at, rz.id
  `).bind(to.x, to.y, from.x, from.y, mapInstanceId).all();
  return (rows.results || []).map(row => ({
    runtimeZoneId: row.id,
    sourceZoneId: row.source_zone_id,
    name: row.name,
    playerVisible: Boolean(row.player_visible)
  }));
}

async function loadRuntimeTargets(env, mapInstanceId) {
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
  const zoneBySource = new Map((zones.results || []).map(row => [row.source_zone_id, {
    id: row.id,
    sourceZoneId: row.source_zone_id,
    name: row.name,
    playerVisible: Boolean(row.player_visible)
  }]));
  const doorBySource = new Map((doors.results || []).map(row => [row.source_edge_id, {
    id: row.id,
    sourceEdgeId: row.source_edge_id,
    x: Number(row.x),
    y: Number(row.y),
    direction: row.direction,
    doorState: row.door_state || 'closed',
    blocksMovement: Boolean(row.blocks_movement)
  }]));
  const spawnBySource = new Map((spawns.results || []).map(row => [row.source_spawn_point_id, {
    id: row.id,
    sourceSpawnPointId: row.source_spawn_point_id,
    name: row.name,
    x: Number(row.x),
    y: Number(row.y),
    spawnType: row.spawn_type,
    enabled: Boolean(row.enabled)
  }]));
  return { zoneBySource, doorBySource, spawnBySource };
}

function doorStates(targets) {
  return new Map([...targets.doorBySource].map(([id, edge]) => [id, edge.doorState || 'closed']));
}

function validateTargets(event, targets, encounters) {
  for (const condition of event.conditions || []) {
    if (condition.type === 'encounter_status' && !encounters.has(condition.encounterId)) {
      throw Object.assign(new Error(`Runtime Encounter target not found: ${condition.encounterId}`), {
        code: 'STORY_CONDITION_ENCOUNTER_NOT_FOUND'
      });
    }
    if (condition.type === 'door_state' && !targets.doorBySource.has(condition.sourceEdgeId)) {
      throw Object.assign(new Error(`Runtime Door source target not found: ${condition.sourceEdgeId}`), {
        code: 'STORY_CONDITION_DOOR_NOT_FOUND'
      });
    }
  }
  for (const effect of event.effects || []) {
    if ((effect.type === 'activate_encounter' || effect.type === 'spawn_monster' || effect.type === 'start_combat') && !encounters.has(effect.encounterId)) {
      throw Object.assign(new Error(`Runtime Encounter target not found: ${effect.encounterId}`), {
        code: 'STORY_EFFECT_ENCOUNTER_NOT_FOUND'
      });
    }
    if (effect.type === 'spawn_monster' && !targets.spawnBySource.has(effect.sourceSpawnPointId)) {
      throw Object.assign(new Error(`Runtime Spawn Point source target not found: ${effect.sourceSpawnPointId}`), {
        code: 'STORY_EFFECT_SPAWN_POINT_NOT_FOUND'
      });
    }
    if (effect.type === 'reveal_zone' && !targets.zoneBySource.has(effect.sourceZoneId)) {
      throw Object.assign(new Error(`Runtime Zone source target not found: ${effect.sourceZoneId}`), {
        code: 'STORY_EFFECT_ZONE_NOT_FOUND'
      });
    }
    if ((effect.type === 'open_door' || effect.type === 'close_door') && !targets.doorBySource.has(effect.sourceEdgeId)) {
      throw Object.assign(new Error(`Runtime Door source target not found: ${effect.sourceEdgeId}`), {
        code: 'STORY_EFFECT_DOOR_NOT_FOUND'
      });
    }
  }
}

async function loadFlags(env, sceneRunId) {
  const rows = await env.DB.prepare(`
    SELECT flag_key, value_json FROM runtime_story_flags WHERE scene_run_id = ?
  `).bind(sceneRunId).all();
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

function blocksMovementForDoorState(state) {
  return state === 'closed' || state === 'locked';
}

async function applyDoorEffect(env, context, edge, nextState) {
  const previousState = edge.doorState || 'closed';
  if (previousState === nextState) {
    return {
      sourceEdgeId: edge.sourceEdgeId,
      runtimeEdgeId: edge.id,
      state: nextState,
      unchanged: true
    };
  }
  await ensureAutoStorySchema(env);
  const now = Date.now();
  const blocksMovement = blocksMovementForDoorState(nextState) ? 1 : 0;
  const auditId = `runtime_door_log_${crypto.randomUUID()}`;
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE runtime_map_edges
      SET door_state = ?, blocks_movement = ?, updated_at = ?
      WHERE id = ? AND map_instance_id = ? AND edge_type = 'door'
        AND COALESCE(door_state, 'closed') = ?
        AND EXISTS (
          SELECT 1 FROM runtime_map_instances WHERE id = ? AND status = 'active'
        )
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
    `).bind(
      auditId, context.mapInstanceId, edge.id, previousState, nextState, context.actor.id, now,
      edge.id, context.mapInstanceId, nextState, now
    )
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    throw Object.assign(new Error('Runtime Door state changed before Story Event effect execution.'), {
      code: 'STORY_EFFECT_DOOR_CHANGED'
    });
  }
  edge.doorState = nextState;
  edge.blocksMovement = Boolean(blocksMovement);
  context.doors.set(edge.sourceEdgeId, nextState);
  return {
    sourceEdgeId: edge.sourceEdgeId,
    runtimeEdgeId: edge.id,
    state: nextState,
    unchanged: false,
    auditId
  };
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
      UPDATE runtime_map_zones
      SET player_visible = 1, updated_at = ?
      WHERE id = ? AND map_instance_id = ?
        AND EXISTS (
          SELECT 1 FROM runtime_map_instances WHERE id = ? AND status = 'active'
        )
    `).bind(now, zone.id, context.mapInstanceId, context.mapInstanceId).run();
    if (Number(result?.meta?.changes || 0) !== 1) {
      throw Object.assign(new Error('Runtime Zone reveal target changed before Story Event effect execution.'), {
        code: 'STORY_EFFECT_ZONE_CHANGED'
      });
    }
    zone.playerVisible = true;
    return { type: effect.type, sourceZoneId: effect.sourceZoneId, runtimeZoneId: zone.id };
  }
  if (effect.type === 'open_door' || effect.type === 'close_door') {
    const edge = context.targets.doorBySource.get(effect.sourceEdgeId);
    const nextState = effect.type === 'open_door' ? 'open' : 'closed';
    return { type: effect.type, ...(await applyDoorEffect(env, context, edge, nextState)) };
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
      type: effect.type,
      encounterId: effect.encounterId,
      runtimeEncounterId: activated.id,
      status: activated.status,
      unchanged: Boolean(activated.unchanged)
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
      type: effect.type,
      encounterId: effect.encounterId,
      monsterId: spawned.monster.id,
      templateId: spawned.monster.templateId,
      displayName: spawned.monster.displayName,
      sourceSpawnPointId: spawned.spawnPoint.sourceSpawnPointId,
      x: spawned.position.x,
      y: spawned.position.y,
      unchanged: Boolean(spawned.unchanged)
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
      type: effect.type,
      encounterId: effect.encounterId,
      combatId: started.combat?.id || started.runtimeEncounter?.combat?.combatId || null,
      mapInstanceId: started.mapInstanceId,
      unchanged: Boolean(started.unchanged)
    };
  }
  throw Object.assign(new Error(`Unsupported approved Story Effect: ${effect.type}`), {
    code: 'STORY_EFFECT_UNSUPPORTED'
  });
}

async function recordExecution(env, context, status, effectsApplied, error = null) {
  const executionId = `story_exec_${crypto.randomUUID()}`;
  const failure = error ? cleanError(error) : { code: null, message: null };
  await env.DB.prepare(`
    INSERT INTO runtime_story_event_executions (
      id, story_event_id, scene_run_id, map_instance_id, status, trigger_type,
      effects_applied_json, error_code, error_message, activated_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, 'enter_zone', ?, ?, ?, ?, ?)
  `).bind(
    executionId,
    context.event.id,
    context.sceneRunId,
    context.mapInstanceId,
    status,
    JSON.stringify(effectsApplied),
    failure.code,
    failure.message,
    context.actor.id,
    Date.now()
  ).run();
  return executionId;
}

async function executeEnteredZoneEvent(env, shared, event, firedCount) {
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
    sceneRunStatus: shared.sceneRunStatus,
    doors: shared.doors,
    encounters: shared.encounters
  });
  if (!conditions.ok) {
    return {
      eventId: event.id,
      name: event.name,
      status: 'skipped',
      code: 'STORY_EVENT_CONDITIONS_NOT_MET',
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
    return {
      eventId: event.id,
      name: event.name,
      status: 'failed',
      executionId,
      effectsApplied,
      ...cleanError(error)
    };
  }
}

async function processEnterZoneTriggers(request, env, payload) {
  const map = payload?.map;
  const movement = payload?.movement;
  if (!map?.id || !map?.sceneRunId || !map?.sceneId || !movement?.from || !movement?.to) return [];

  const enteredZones = await enteredRuntimeZones(env, map.id, movement.from, movement.to);
  if (!enteredZones.length) return [];
  const enteredSourceIds = new Set(enteredZones.map(zone => zone.sourceZoneId));

  const [actor, sceneRun, eventRows, targets, flags, counts, encounters] = await Promise.all([
    currentUser(request, env),
    env.DB.prepare('SELECT id, status FROM scene_runs WHERE id = ? LIMIT 1').bind(map.sceneRunId).first(),
    env.DB.prepare(`
      SELECT * FROM story_events
      WHERE scene_id = ? AND status = 'active' AND trigger_type = 'enter_zone'
      ORDER BY created_at, id
    `).bind(map.sceneId).all(),
    loadRuntimeTargets(env, map.id),
    loadFlags(env, map.sceneRunId),
    appliedCounts(env, map.sceneRunId),
    loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId)
  ]);
  if (!actor || !sceneRun || sceneRun.status !== 'active') return [];

  const shared = {
    actor,
    sceneRunId: map.sceneRunId,
    sceneRunStatus: sceneRun.status,
    sceneId: map.sceneId,
    mapInstanceId: map.id,
    targets,
    flags,
    doors: doorStates(targets),
    encounters,
    enteredZones,
    movement
  };

  const results = [];
  for (const row of eventRows.results || []) {
    const event = eventPayload(row);
    let trigger;
    try {
      trigger = normalizeStoryTrigger('enter_zone', event.trigger);
    } catch (error) {
      console.error('Invalid enter_zone Story Event trigger definition', {
        eventId: event.id,
        message: String(error?.message || error)
      });
      continue;
    }
    if (!enteredSourceIds.has(trigger.sourceZoneId)) continue;
    const firedCount = counts.get(event.id) || 0;
    const result = await executeEnteredZoneEvent(env, shared, event, firedCount);
    if (result.status === 'applied') counts.set(event.id, firedCount + 1);
    results.push({ ...result, sourceZoneId: trigger.sourceZoneId });
  }
  return results;
}

async function refreshPlayerWorld(request, env, characterId) {
  const response = await baseWorker.fetch(new Request(new URL(`/api/player/world/characters/${encodeURIComponent(characterId)}`, request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function handlePlayerMove(request, env, characterId) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;
  const payload = await response.json();
  if (!payload?.movement || !payload?.map?.id) return json(payload, response.status);

  let storyEventsTriggered = [];
  try {
    storyEventsTriggered = await processEnterZoneTriggers(request, env, payload);
  } catch (error) {
    console.error('Automatic enter-zone Story Event processing failed after committed Player movement', {
      characterId,
      mapInstanceId: payload?.map?.id || null,
      movementId: payload?.movement?.id || null,
      message: String(error?.message || error)
    });
    return json({
      ...payload,
      storyEventsTriggered: [],
      storyTriggerWarning: { code: 'STORY_ENTER_ZONE_TRIGGER_ERROR' }
    }, response.status);
  }

  if (!storyEventsTriggered.length) return json({ ...payload, storyEventsTriggered }, response.status);
  const refreshed = await refreshPlayerWorld(request, env, characterId).catch(() => null);
  return json({
    ...(refreshed || payload),
    movement: payload.movement,
    storyEventsTriggered
  }, response.status);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const moveMatch = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/move$/);
    if (moveMatch && request.method === 'POST') {
      return handlePlayerMove(request, env, decodeURIComponent(moveMatch[1]));
    }
    return baseWorker.fetch(request, env);
  }
};
