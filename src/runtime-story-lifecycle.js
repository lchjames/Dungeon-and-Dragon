import { evaluateStoryConditions, normalizeStoryTrigger } from './story-event-rules.js';
import {
  activateRuntimeEncounter,
  ensureRuntimeEncounterSchema,
  loadRuntimeEncounterMap
} from './runtime-encounter-state.js';
import {
  spawnRuntimeBoss,
  spawnRuntimeMonster,
  startRuntimeEncounterCombat
} from './runtime-encounter-service.js';

const SUPPORTED_TRIGGER_TYPES = Object.freeze(['encounter_activated', 'combat_started']);
const SUPPORTED_TRIGGER_SET = new Set(SUPPORTED_TRIGGER_TYPES);
const MAX_OCCURRENCES_PER_DRAIN = 50;
const LEASE_TIMEOUT_MS = 5 * 60 * 1000;
let authoritySchemaPromise = null;
let storySchemaPromise = null;

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function cleanError(error) {
  return {
    code: String(error?.code || 'STORY_EFFECT_EXECUTION_FAILED').slice(0, 120),
    message: String(error?.message || error || 'Story Event effect execution failed.').slice(0, 1000)
  };
}

export async function ensureRuntimeStoryLifecycleAuthoritySchema(env) {
  await ensureRuntimeEncounterSchema(env);
  if (!authoritySchemaPromise) {
    authoritySchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_combat_started_story_occurrence
        AFTER INSERT ON runtime_encounter_combats
        BEGIN
          INSERT OR IGNORE INTO runtime_story_lifecycle_occurrences (
            id, scene_run_id, trigger_type, subject_type, subject_id,
            source_at, actor_user_id, lease_token, lease_at, completed_at,
            created_at, updated_at
          )
          SELECT
            'story_lifecycle_' || lower(hex(randomblob(16))),
            NEW.scene_run_id,
            'combat_started',
            'combat',
            NEW.combat_id,
            COALESCE(c.started_at, NEW.linked_at),
            NEW.linked_by_user_id,
            NULL,
            NULL,
            NULL,
            NEW.linked_at,
            NEW.linked_at
          FROM combats c
          WHERE c.id = NEW.combat_id;
        END`)
    ]).catch(error => {
      authoritySchemaPromise = null;
      throw error;
    });
  }
  await authoritySchemaPromise;
}

async function ensureStorySchema(env) {
  await ensureRuntimeStoryLifecycleAuthoritySchema(env);
  if (!storySchemaPromise) {
    storySchemaPromise = env.DB.batch([
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
      storySchemaPromise = null;
      throw error;
    });
  }
  await storySchemaPromise;
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
    oncePerSceneRun: Boolean(row.once_per_scene_run),
    createdAt: row.created_at
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
    if ((effect.type === 'activate_encounter' || effect.type === 'spawn_monster' || effect.type === 'spawn_boss' || effect.type === 'start_combat') && !encounters.has(effect.encounterId)) {
      throw Object.assign(new Error(`Runtime Encounter target not found: ${effect.encounterId}`), { code: 'STORY_EFFECT_ENCOUNTER_NOT_FOUND' });
    }
    if ((effect.type === 'spawn_monster' || effect.type === 'spawn_boss') && !targets.spawnBySource.has(effect.sourceSpawnPointId)) {
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
  if (effect.type === 'spawn_boss') {
    const spawned = await spawnRuntimeBoss(env, {
      mapInstanceId: context.mapInstanceId,
      sceneRunId: context.sceneRunId,
      sceneId: context.sceneId,
      encounterId: effect.encounterId,
      profileId: effect.profileId,
      sourceSpawnPointId: effect.sourceSpawnPointId,
      displayName: effect.displayName || '',
      actorUserId: context.actor.id,
      storyEventId: context.event.oncePerSceneRun ? context.event.id : null,
      storyEffectIndex: context.event.oncePerSceneRun ? effectIndex : null
    });
    if (spawned.runtimeEncounter) context.encounters.set(effect.encounterId, spawned.runtimeEncounter);
    return {
      type: effect.type, encounterId: effect.encounterId, bossId: spawned.boss.id,
      profileId: spawned.boss.profileId, displayName: spawned.boss.displayName,
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

async function writeDispatch(env, occurrenceId, eventId, result) {
  const now = Date.now();
  const failure = result.status === 'failed'
    ? { code: result.code || null, message: result.message || null }
    : { code: result.code || null, message: null };
  await env.DB.prepare(`
    INSERT OR IGNORE INTO runtime_story_lifecycle_dispatches (
      id, occurrence_id, story_event_id, status, execution_id, result_code, result_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `story_dispatch_${crypto.randomUUID()}`, occurrenceId, eventId, result.status,
    result.executionId || null, failure.code, failure.message, now, now
  ).run();
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

async function claimNextOccurrence(env, sceneRunId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = Date.now();
    const staleBefore = now - LEASE_TIMEOUT_MS;
    const row = await env.DB.prepare(`
      SELECT rowid AS occurrence_sequence, *
      FROM runtime_story_lifecycle_occurrences
      WHERE scene_run_id = ?
        AND trigger_type IN ('encounter_activated', 'combat_started')
        AND completed_at IS NULL
        AND (lease_token IS NULL OR lease_at IS NULL OR lease_at < ?)
      ORDER BY source_at, created_at, occurrence_sequence
      LIMIT 1
    `).bind(sceneRunId, staleBefore).first();
    if (!row) return null;
    const leaseToken = `story_lease_${crypto.randomUUID()}`;
    const result = await env.DB.prepare(`
      UPDATE runtime_story_lifecycle_occurrences
      SET lease_token = ?, lease_at = ?, updated_at = ?
      WHERE id = ? AND completed_at IS NULL
        AND (lease_token IS NULL OR lease_at IS NULL OR lease_at < ?)
    `).bind(leaseToken, now, now, row.id, staleBefore).run();
    if (Number(result?.meta?.changes || 0) === 1) return { ...row, lease_token: leaseToken, lease_at: now };
  }
  return null;
}

async function releaseOccurrence(env, occurrence) {
  await env.DB.prepare(`
    UPDATE runtime_story_lifecycle_occurrences
    SET lease_token = NULL, lease_at = NULL, updated_at = ?
    WHERE id = ? AND lease_token = ? AND completed_at IS NULL
  `).bind(Date.now(), occurrence.id, occurrence.lease_token).run();
}

async function completeOccurrence(env, occurrence) {
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE runtime_story_lifecycle_occurrences
    SET completed_at = ?, lease_token = NULL, lease_at = NULL, updated_at = ?
    WHERE id = ? AND lease_token = ? AND completed_at IS NULL
  `).bind(now, now, occurrence.id, occurrence.lease_token).run();
  if (Number(result?.meta?.changes || 0) !== 1) {
    throw Object.assign(new Error('Story lifecycle occurrence lease changed before completion.'), {
      code: 'STORY_LIFECYCLE_LEASE_LOST'
    });
  }
}

async function occurrenceDispatchIds(env, occurrenceId) {
  const rows = await env.DB.prepare(`
    SELECT story_event_id FROM runtime_story_lifecycle_dispatches WHERE occurrence_id = ?
  `).bind(occurrenceId).all();
  return new Set((rows.results || []).map(row => row.story_event_id));
}

async function runtimeContext(env, sceneRunId) {
  const sceneRun = await env.DB.prepare('SELECT id, scene_id, status FROM scene_runs WHERE id = ? LIMIT 1').bind(sceneRunId).first();
  if (!sceneRun || sceneRun.status !== 'active') return null;
  const map = await env.DB.prepare(`
    SELECT id, scene_id, status FROM runtime_map_instances
    WHERE scene_run_id = ? AND status = 'active'
    LIMIT 1
  `).bind(sceneRunId).first();
  if (!map || map.scene_id !== sceneRun.scene_id) return null;
  return { sceneRun, map };
}

async function occurrenceSubject(env, occurrence, encounters, mapInstanceId) {
  if (occurrence.trigger_type === 'encounter_activated') {
    if (occurrence.subject_type !== 'encounter') {
      throw Object.assign(new Error('encounter_activated occurrence has an invalid subject type.'), {
        code: 'STORY_LIFECYCLE_SUBJECT_INVALID'
      });
    }
    const encounter = encounters.get(occurrence.subject_id);
    if (!encounter || encounter.status !== 'active') {
      throw Object.assign(new Error('Lifecycle occurrence no longer points to an active Runtime Encounter.'), {
        code: 'STORY_LIFECYCLE_ENCOUNTER_INVALID'
      });
    }
    return {
      triggerType: occurrence.trigger_type,
      encounterId: occurrence.subject_id,
      combatId: null
    };
  }

  if (occurrence.trigger_type === 'combat_started') {
    if (occurrence.subject_type !== 'combat') {
      throw Object.assign(new Error('combat_started occurrence has an invalid subject type.'), {
        code: 'STORY_LIFECYCLE_SUBJECT_INVALID'
      });
    }
    const linked = await env.DB.prepare(`
      SELECT rec.encounter_id, rec.map_instance_id, rec.combat_id, rec.linked_at,
             c.status AS combat_status, c.started_at, c.ended_at
      FROM runtime_encounter_combats rec
      JOIN combats c ON c.id = rec.combat_id
      WHERE rec.scene_run_id = ? AND rec.combat_id = ?
      LIMIT 1
    `).bind(occurrence.scene_run_id, occurrence.subject_id).first();
    if (!linked || linked.map_instance_id !== mapInstanceId || !encounters.has(linked.encounter_id)) {
      throw Object.assign(new Error('combat_started occurrence cannot resolve its Runtime Encounter Combat link.'), {
        code: 'STORY_LIFECYCLE_COMBAT_INVALID'
      });
    }
    return {
      triggerType: occurrence.trigger_type,
      encounterId: linked.encounter_id,
      combatId: linked.combat_id,
      combatStatus: linked.combat_status,
      combatStartedAt: linked.started_at,
      combatEndedAt: linked.ended_at
    };
  }

  throw Object.assign(new Error(`Unsupported Runtime Story lifecycle trigger: ${occurrence.trigger_type}`), {
    code: 'STORY_LIFECYCLE_TRIGGER_UNSUPPORTED'
  });
}

async function processOccurrence(env, occurrence) {
  if (!SUPPORTED_TRIGGER_SET.has(occurrence.trigger_type)) {
    throw Object.assign(new Error(`Unsupported Runtime Story lifecycle trigger: ${occurrence.trigger_type}`), {
      code: 'STORY_LIFECYCLE_TRIGGER_UNSUPPORTED'
    });
  }
  const runtime = await runtimeContext(env, occurrence.scene_run_id);
  if (!runtime) {
    throw Object.assign(new Error('Active Runtime Map is unavailable for Story lifecycle dispatch.'), {
      code: 'STORY_LIFECYCLE_RUNTIME_UNAVAILABLE'
    });
  }
  const { sceneRun, map } = runtime;
  const [eventRows, targets, flags, counts, encounters, alreadyDispatched] = await Promise.all([
    env.DB.prepare(`
      SELECT * FROM story_events
      WHERE scene_id = ? AND status = 'active' AND trigger_type = ? AND created_at <= ?
      ORDER BY created_at, id
    `).bind(sceneRun.scene_id, occurrence.trigger_type, occurrence.source_at).all(),
    loadTargets(env, map.id),
    loadFlags(env, sceneRun.id),
    appliedCounts(env, sceneRun.id),
    loadRuntimeEncounterMap(env, sceneRun.id, sceneRun.scene_id),
    occurrenceDispatchIds(env, occurrence.id)
  ]);
  const subject = await occurrenceSubject(env, occurrence, encounters, map.id);
  const shared = {
    actor: { id: occurrence.actor_user_id },
    sceneRunId: sceneRun.id,
    sceneRunStatus: sceneRun.status,
    sceneId: sceneRun.scene_id,
    mapInstanceId: map.id,
    targets,
    flags,
    doors: doorStates(targets),
    encounters,
    lifecycleTriggerType: occurrence.trigger_type,
    lifecycleEncounterId: subject.encounterId,
    lifecycleCombatId: subject.combatId
  };
  const results = [];
  for (const row of eventRows.results || []) {
    const event = eventPayload(row);
    let trigger;
    try {
      trigger = normalizeStoryTrigger(occurrence.trigger_type, event.trigger);
    } catch (error) {
      if (!alreadyDispatched.has(event.id)) {
        const failed = {
          eventId: event.id,
          name: event.name,
          status: 'failed',
          ...cleanError(Object.assign(error, { code: 'STORY_TRIGGER_INVALID' }))
        };
        await writeDispatch(env, occurrence.id, event.id, failed);
        results.push({
          ...failed,
          triggerType: occurrence.trigger_type,
          encounterId: subject.encounterId,
          combatId: subject.combatId,
          occurrenceId: occurrence.id
        });
      }
      continue;
    }
    if (trigger.encounterId !== subject.encounterId || alreadyDispatched.has(event.id)) continue;
    const firedCount = counts.get(event.id) || 0;
    const result = await executeEvent(env, shared, event, firedCount);
    await writeDispatch(env, occurrence.id, event.id, result);
    if (result.status === 'applied') counts.set(event.id, firedCount + 1);
    results.push({
      ...result,
      triggerType: occurrence.trigger_type,
      encounterId: subject.encounterId,
      combatId: subject.combatId,
      occurrenceId: occurrence.id
    });
  }
  return results;
}

export async function processPendingRuntimeStoryLifecycleEvents(env, { sceneRunId } = {}) {
  if (!sceneRunId) return [];
  await ensureStorySchema(env);
  const allResults = [];
  for (let processed = 0; processed < MAX_OCCURRENCES_PER_DRAIN; processed += 1) {
    const occurrence = await claimNextOccurrence(env, sceneRunId);
    if (!occurrence) return allResults;
    try {
      const results = await processOccurrence(env, occurrence);
      allResults.push(...results);
      await completeOccurrence(env, occurrence);
    } catch (error) {
      await releaseOccurrence(env, occurrence).catch(() => null);
      throw error;
    }
  }
  const pending = await env.DB.prepare(`
    SELECT id FROM runtime_story_lifecycle_occurrences
    WHERE scene_run_id = ?
      AND trigger_type IN ('encounter_activated', 'combat_started')
      AND completed_at IS NULL
    LIMIT 1
  `).bind(sceneRunId).first();
  if (pending) {
    throw Object.assign(new Error('Runtime Story lifecycle cascade exceeded the per-request safety limit.'), {
      code: 'STORY_LIFECYCLE_CASCADE_LIMIT'
    });
  }
  return allResults;
}

export const RUNTIME_STORY_LIFECYCLE_TRIGGER_TYPES = SUPPORTED_TRIGGER_TYPES;
