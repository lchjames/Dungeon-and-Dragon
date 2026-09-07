import { ensureRuntimeEncounterSchema } from './runtime-encounter-state.js';
import { processPendingRuntimeStoryLifecycleEvents } from './runtime-story-lifecycle.js';
import { processSceneRunStartStoryEvents } from './scene-run-start-story.js';
import { normalizeStoryFlagKey } from './story-event-rules.js';

const MODES = new Set(['next_scene', 'complete_scenario']);
const DOOR_STATES = new Set(['open', 'closed', 'locked', 'broken']);
let schemaPromise = null;

function fail(message, status, code, extra = {}) {
  throw Object.assign(new Error(message), { status, code, ...extra });
}

function cleanText(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function sceneConfig(rawJson) {
  const root = safeObject(parseJson(rawJson, {}));
  return {
    root,
    doors: safeObject(root.doors),
    zoneVisibility: safeObject(root.zoneVisibility),
    spawnEnabled: safeObject(root.spawnEnabled)
  };
}

function normalizeFlagKeys(raw) {
  const values = Array.isArray(raw) ? raw : [];
  if (values.length > 50) fail('Scene transition 最多可以攜帶 50 個 Story flags。', 400, 'SCENE_TRANSITION_FLAG_LIMIT');
  const keys = [];
  const seen = new Set();
  for (const value of values) {
    let key;
    try { key = normalizeStoryFlagKey(value); }
    catch { fail('carryFlagKeys 包含無效 Story flag key。', 400, 'SCENE_TRANSITION_FLAG_INVALID'); }
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function normalizeRequest(body = {}) {
  const mode = String(body?.mode || '').trim().toLowerCase();
  if (!MODES.has(mode)) fail('Scene transition mode 必須為 next_scene 或 complete_scenario。', 400, 'SCENE_TRANSITION_MODE_INVALID');
  const carryFlagKeys = normalizeFlagKeys(body?.carryFlagKeys);
  const carryCharacters = mode === 'next_scene' ? body?.carryCharacters !== false : false;
  const nextSceneId = mode === 'next_scene' ? cleanText(body?.nextSceneId, 180) : '';
  const targetSourceSpawnPointId = mode === 'next_scene' ? cleanText(body?.targetSourceSpawnPointId, 180) : '';
  if (mode === 'next_scene' && !nextSceneId) fail('next_scene transition 必須指定 nextSceneId。', 400, 'SCENE_TRANSITION_NEXT_SCENE_REQUIRED');
  if (mode === 'complete_scenario' && carryFlagKeys.length) {
    fail('complete_scenario 不可攜帶 Scene-scoped Story flags。', 400, 'SCENE_TRANSITION_TERMINAL_CARRY_INVALID');
  }
  return { mode, carryFlagKeys, carryCharacters, nextSceneId, targetSourceSpawnPointId };
}

export async function ensureRuntimeSceneTransitionSchema(env) {
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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_scene_transition_log (
        id TEXT PRIMARY KEY,
        scenario_run_id TEXT NOT NULL,
        from_scene_run_id TEXT NOT NULL UNIQUE,
        from_map_instance_id TEXT NOT NULL UNIQUE,
        from_scene_id TEXT NOT NULL,
        transition_mode TEXT NOT NULL CHECK (transition_mode IN ('next_scene', 'complete_scenario')),
        to_scene_run_id TEXT,
        to_map_instance_id TEXT,
        to_scene_id TEXT,
        carry_flag_keys_json TEXT NOT NULL DEFAULT '[]',
        carried_character_ids_json TEXT NOT NULL DEFAULT '[]',
        target_source_spawn_point_id TEXT,
        skipped_encounter_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_encounter_count >= 0),
        cancelled_rest_count INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_rest_count >= 0),
        actor_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        CHECK (
          (transition_mode = 'next_scene' AND to_scene_run_id IS NOT NULL AND to_map_instance_id IS NOT NULL AND to_scene_id IS NOT NULL)
          OR
          (transition_mode = 'complete_scenario' AND to_scene_run_id IS NULL AND to_map_instance_id IS NULL AND to_scene_id IS NULL)
        ),
        FOREIGN KEY (scenario_run_id) REFERENCES scenario_runs(id) ON DELETE RESTRICT,
        FOREIGN KEY (from_scene_run_id) REFERENCES scene_runs(id) ON DELETE RESTRICT,
        FOREIGN KEY (from_map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE RESTRICT,
        FOREIGN KEY (from_scene_id) REFERENCES scenes(id) ON DELETE RESTRICT,
        FOREIGN KEY (to_scene_run_id) REFERENCES scene_runs(id) ON DELETE RESTRICT,
        FOREIGN KEY (to_map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE RESTRICT,
        FOREIGN KEY (to_scene_id) REFERENCES scenes(id) ON DELETE RESTRICT,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_scene_transition_scenario ON runtime_scene_transition_log(scenario_run_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_scene_transition_destination ON runtime_scene_transition_log(to_scene_run_id, created_at)')
    ]).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function tableExists(env, name) {
  const row = await env.DB.prepare(`SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).bind(name).first();
  return Boolean(row?.present);
}

async function sourceContext(env, mapInstanceId) {
  return env.DB.prepare(`
    SELECT rmi.id AS map_instance_id, rmi.status AS map_status,
           rmi.scene_run_id, rmi.scenario_run_id, rmi.scene_id,
           sr.status AS scene_run_status,
           scr.status AS scenario_run_status, scr.scenario_id,
           s.name AS scene_name, sc.name AS scenario_name
    FROM runtime_map_instances rmi
    JOIN scene_runs sr ON sr.id = rmi.scene_run_id
    JOIN scenario_runs scr ON scr.id = rmi.scenario_run_id
    JOIN scenes s ON s.id = rmi.scene_id
    JOIN scenarios sc ON sc.id = scr.scenario_id
    WHERE rmi.id = ?
    LIMIT 1
  `).bind(mapInstanceId).first();
}

function transitionPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    scenarioRunId: row.scenario_run_id,
    fromSceneRunId: row.from_scene_run_id,
    fromMapInstanceId: row.from_map_instance_id,
    fromSceneId: row.from_scene_id,
    mode: row.transition_mode,
    toSceneRunId: row.to_scene_run_id || null,
    toMapInstanceId: row.to_map_instance_id || null,
    toSceneId: row.to_scene_id || null,
    carryFlagKeys: parseJson(row.carry_flag_keys_json, []),
    carriedCharacterIds: parseJson(row.carried_character_ids_json, []),
    targetSourceSpawnPointId: row.target_source_spawn_point_id || null,
    skippedEncounterCount: Number(row.skipped_encounter_count || 0),
    cancelledRestCount: Number(row.cancelled_rest_count || 0),
    actorUserId: row.actor_user_id,
    createdAt: row.created_at
  };
}

async function existingTransition(env, sceneRunId) {
  const row = await env.DB.prepare(`SELECT * FROM runtime_scene_transition_log WHERE from_scene_run_id = ? LIMIT 1`).bind(sceneRunId).first();
  return transitionPayload(row);
}

async function targetScene(env, nextSceneId, scenarioId) {
  return env.DB.prepare(`
    SELECT s.id AS scene_id, s.name AS scene_name, s.status AS scene_status,
           sc.id AS scenario_id, sc.status AS scenario_status,
           smb.location_id, smb.map_template_id, smb.scene_config_json,
           wl.name AS location_name, wl.status AS location_status,
           mt.name AS map_template_name, mt.width, mt.height, mt.version,
           mt.background_asset_ref, mt.status AS map_status
    FROM scenes s
    JOIN scenarios sc ON sc.id = s.scenario_id
    JOIN scene_map_bindings smb ON smb.scene_id = s.id
    JOIN world_locations wl ON wl.id = smb.location_id
    JOIN map_templates mt ON mt.id = smb.map_template_id
    WHERE s.id = ? AND sc.id = ?
    LIMIT 1
  `).bind(nextSceneId, scenarioId).first();
}

async function carriedFlags(env, sceneRunId, keys) {
  if (!keys.length) return [];
  const placeholders = keys.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT flag_key, value_json
    FROM runtime_story_flags
    WHERE scene_run_id = ? AND flag_key IN (${placeholders})
    ORDER BY flag_key
  `).bind(sceneRunId, ...keys).all();
  const found = rows.results || [];
  const foundKeys = new Set(found.map(row => row.flag_key));
  const missing = keys.filter(key => !foundKeys.has(key));
  if (missing.length) fail(`以下 Story flag 不存在於目前 Scene Run：${missing.join(', ')}`, 409, 'SCENE_TRANSITION_FLAG_NOT_FOUND', { missingFlagKeys: missing });
  return found;
}

async function positionedCharacters(env, mapInstanceId) {
  const rows = await env.DB.prepare(`
    SELECT rep.entity_id, rep.visibility_mode, c.name, c.status
    FROM runtime_entity_positions rep
    JOIN characters c ON c.id = rep.entity_id
    WHERE rep.map_instance_id = ? AND rep.entity_type = 'character'
    ORDER BY rep.created_at, rep.entity_id
  `).bind(mapInstanceId).all();
  return rows.results || [];
}

function addSceneConfigOverrides(env, statements, mapInstanceId, config, now) {
  for (const [sourceEdgeId, rawState] of Object.entries(config.doors).slice(0, 500)) {
    const state = String(rawState || '').toLowerCase();
    if (!DOOR_STATES.has(state)) continue;
    const blocks = state === 'closed' || state === 'locked' ? 1 : 0;
    statements.push(env.DB.prepare(`
      UPDATE runtime_map_edges
      SET door_state = ?, blocks_movement = ?, updated_at = ?
      WHERE map_instance_id = ? AND source_edge_id = ? AND edge_type = 'door'
    `).bind(state, blocks, now, mapInstanceId, cleanText(sourceEdgeId, 160)));
  }
  for (const [sourceZoneId, rawVisible] of Object.entries(config.zoneVisibility).slice(0, 500)) {
    statements.push(env.DB.prepare(`
      UPDATE runtime_map_zones SET player_visible = ?, updated_at = ?
      WHERE map_instance_id = ? AND source_zone_id = ?
    `).bind(rawVisible ? 1 : 0, now, mapInstanceId, cleanText(sourceZoneId, 160)));
  }
  for (const [sourceSpawnId, rawEnabled] of Object.entries(config.spawnEnabled).slice(0, 1000)) {
    statements.push(env.DB.prepare(`
      UPDATE runtime_map_spawn_points SET enabled = ?, updated_at = ?
      WHERE map_instance_id = ? AND source_spawn_point_id = ?
    `).bind(rawEnabled ? 1 : 0, now, mapInstanceId, cleanText(sourceSpawnId, 180)));
  }
}

function lifecycleGroups(events = []) {
  const unique = [];
  const seen = new Set();
  for (const event of events.filter(Boolean)) {
    const key = [event.triggerType || '', event.occurrenceId || '', event.eventId || '', event.executionId || '', event.status || ''].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return {
    storyLifecycleEvents: unique,
    encounterActivatedStoryEvents: unique.filter(event => event.triggerType === 'encounter_activated'),
    combatStartedStoryEvents: unique.filter(event => event.triggerType === 'combat_started'),
    combatEndedStoryEvents: unique.filter(event => event.triggerType === 'combat_ended'),
    encounterResolvedStoryEvents: unique.filter(event => event.triggerType === 'encounter_resolved'),
    flagChangedStoryEvents: unique.filter(event => event.triggerType === 'flag_changed')
  };
}

async function destinationMapPayload(env, mapInstanceId) {
  if (!mapInstanceId) return null;
  const row = await env.DB.prepare(`
    SELECT rmi.*, s.name AS scene_name, sc.name AS scenario_name
    FROM runtime_map_instances rmi
    JOIN scenes s ON s.id = rmi.scene_id
    JOIN scenarios sc ON sc.id = s.scenario_id
    WHERE rmi.id = ? LIMIT 1
  `).bind(mapInstanceId).first();
  if (!row) return null;
  return {
    id: row.id,
    sceneRunId: row.scene_run_id,
    scenarioRunId: row.scenario_run_id,
    sceneId: row.scene_id,
    sceneName: row.scene_name,
    scenarioName: row.scenario_name,
    locationId: row.location_id,
    locationName: row.location_name_snapshot,
    mapTemplateId: row.map_template_id,
    sourceMapVersion: Number(row.source_map_version),
    mapName: row.map_name_snapshot,
    width: Number(row.width),
    height: Number(row.height),
    status: row.status,
    createdAt: row.created_at
  };
}

export async function transitionRuntimeScene(env, {
  mapInstanceId,
  actor,
  body
}) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!actor?.id) fail('Scene transition actor is required.', 401, 'UNAUTHENTICATED');
  await ensureRuntimeSceneTransitionSchema(env);
  await ensureRuntimeEncounterSchema(env);

  const request = normalizeRequest(body);
  const source = await sourceContext(env, mapInstanceId);
  if (!source) fail('Runtime Map 不存在。', 404, 'RUNTIME_MAP_NOT_FOUND');

  const prior = await existingTransition(env, source.scene_run_id);
  if (prior) {
    return {
      ok: true,
      idempotent: true,
      transition: prior,
      destinationMap: await destinationMapPayload(env, prior.toMapInstanceId),
      sceneRunStartStoryEvents: [],
      ...lifecycleGroups([])
    };
  }

  if (source.map_status !== 'active') fail('只有 active Runtime Map 可以完成 Scene transition。', 409, 'RUNTIME_MAP_CLOSED');
  if (source.scene_run_status !== 'active') fail('Scene Run 已經結束。', 409, 'SCENE_RUN_CLOSED');
  if (source.scenario_run_status !== 'active') fail('Scenario Run 已經結束。', 409, 'SCENARIO_RUN_CLOSED');

  const activeSceneCount = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM scene_runs WHERE scenario_run_id = ? AND status = 'active'
  `).bind(source.scenario_run_id).first();
  if (Number(activeSceneCount?.count || 0) !== 1) {
    fail('Scenario Run 必須只有目前一個 active Scene Run 才可以 transition。', 409, 'SCENARIO_RUN_ACTIVE_SCENE_CONFLICT');
  }

  const activeCombat = await env.DB.prepare(`
    SELECT rec.combat_id
    FROM runtime_encounter_combats rec
    JOIN combats c ON c.id = rec.combat_id
    WHERE rec.map_instance_id = ? AND c.status = 'active'
    LIMIT 1
  `).bind(mapInstanceId).first();
  if (activeCombat?.combat_id) {
    fail('Active Combat 必須先結束先可以完成 Scene。', 409, 'SCENE_TRANSITION_ACTIVE_COMBAT', { activeCombatId: activeCombat.combat_id });
  }

  const activeEncounter = await env.DB.prepare(`
    SELECT encounter_id FROM runtime_encounter_states
    WHERE scene_run_id = ? AND status = 'active'
    ORDER BY updated_at, encounter_id LIMIT 1
  `).bind(source.scene_run_id).first();
  if (activeEncounter?.encounter_id) {
    fail('Active Runtime Encounter 必須先 resolve / skip 先可以完成 Scene。', 409, 'SCENE_TRANSITION_ACTIVE_ENCOUNTER', { activeEncounterId: activeEncounter.encounter_id });
  }

  const plannedCountRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM runtime_encounter_states WHERE scene_run_id = ? AND status = 'planned'
  `).bind(source.scene_run_id).first();
  const skippedEncounterCount = Number(plannedCountRow?.count || 0);
  const flags = await carriedFlags(env, source.scene_run_id, request.carryFlagKeys);
  const characters = request.carryCharacters ? await positionedCharacters(env, mapInstanceId) : [];
  const invalidCharacter = characters.find(character => character.status !== 'active');
  if (invalidCharacter) {
    fail(`${invalidCharacter.name || invalidCharacter.entity_id} 已唔係 active Character，不能自動帶入下一 Scene。`, 409, 'SCENE_TRANSITION_CHARACTER_NOT_ACTIVE', { characterId: invalidCharacter.entity_id });
  }

  let destination = null;
  let destinationConfig = null;
  let targetSpawn = null;
  if (request.mode === 'next_scene') {
    if (request.nextSceneId === source.scene_id) fail('下一 Scene 不可與目前 Scene 相同。', 409, 'SCENE_TRANSITION_SAME_SCENE');
    destination = await targetScene(env, request.nextSceneId, source.scenario_id);
    if (!destination) fail('下一 Scene 不存在、屬於另一 Scenario，或未綁定 Structured Map。', 404, 'SCENE_TRANSITION_TARGET_NOT_FOUND');
    if (destination.scenario_status !== 'active') fail('下一 Scene 所屬 Scenario Definition 必須為 active。', 409, 'SCENE_TRANSITION_SCENARIO_INACTIVE');
    if (destination.scene_status !== 'active') fail('下一 Scene Definition 必須為 active；locked / completed Scene 不可直接 transition。', 409, 'SCENE_TRANSITION_TARGET_INACTIVE');
    if (destination.location_status !== 'active' || destination.map_status !== 'active') {
      fail('下一 Scene 綁定的 Location / Map Template 必須為 active。', 409, 'SCENE_TRANSITION_TARGET_MAP_INACTIVE');
    }
    destinationConfig = sceneConfig(destination.scene_config_json);

    if (characters.length) {
      if (!request.targetSourceSpawnPointId) fail('攜帶 Character 去下一 Scene 必須指定 targetSourceSpawnPointId。', 400, 'SCENE_TRANSITION_SPAWN_REQUIRED');
      targetSpawn = await env.DB.prepare(`
        SELECT id, name, x, y, spawn_type
        FROM map_spawn_points
        WHERE id = ? AND map_template_id = ?
        LIMIT 1
      `).bind(request.targetSourceSpawnPointId, destination.map_template_id).first();
      if (!targetSpawn) fail('指定嘅 Character Spawn Point 不屬於下一 Scene Map。', 404, 'SCENE_TRANSITION_SPAWN_NOT_FOUND');
      if (targetSpawn.spawn_type !== 'any' && targetSpawn.spawn_type !== 'character') {
        fail('下一 Scene Spawn Point 類型唔接受 Character。', 409, 'SCENE_TRANSITION_SPAWN_TYPE_MISMATCH');
      }
      if (destinationConfig.spawnEnabled[targetSpawn.id] === false) {
        fail('下一 Scene 指定 Spawn Point 已被 Scene config 停用。', 409, 'SCENE_TRANSITION_SPAWN_DISABLED');
      }
    }
  }

  const hasRestState = await tableExists(env, 'character_rest_state');
  const hasRestLog = await tableExists(env, 'character_rest_log');
  const activeRests = hasRestState
    ? ((await env.DB.prepare(`
        SELECT * FROM character_rest_state
        WHERE map_instance_id = ? AND status = 'active'
        ORDER BY started_at, character_id
      `).bind(mapInstanceId).all()).results || [])
    : [];

  const now = Date.now();
  const transitionId = `scene_transition_${crypto.randomUUID()}`;
  const toSceneRunId = request.mode === 'next_scene' ? `scene_run_${crypto.randomUUID()}` : null;
  const toMapInstanceId = request.mode === 'next_scene' ? `runtime_map_${crypto.randomUUID()}` : null;
  const carriedCharacterIds = characters.map(character => character.entity_id);
  const statements = [];

  if (request.mode === 'next_scene') {
    statements.push(
      env.DB.prepare(`
        INSERT INTO scene_runs (id, scenario_run_id, scene_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?)
      `).bind(toSceneRunId, source.scenario_run_id, destination.scene_id, now, now),
      env.DB.prepare(`
        INSERT INTO runtime_map_instances (
          id, scene_run_id, scenario_run_id, scene_id, location_id, map_template_id,
          source_map_version, map_name_snapshot, location_name_snapshot, width, height,
          background_asset_ref, scene_config_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).bind(
        toMapInstanceId, toSceneRunId, source.scenario_run_id, destination.scene_id,
        destination.location_id, destination.map_template_id, Number(destination.version),
        destination.map_template_name, destination.location_name, Number(destination.width), Number(destination.height),
        destination.background_asset_ref || '', JSON.stringify(destinationConfig.root), now, now
      ),
      env.DB.prepare(`
        INSERT INTO runtime_map_cells (map_instance_id, x, y, is_walkable, terrain_key, gm_notes)
        SELECT ?, x, y, is_walkable, terrain_key, gm_notes
        FROM map_cells WHERE map_template_id = ?
      `).bind(toMapInstanceId, destination.map_template_id),
      env.DB.prepare(`
        INSERT INTO runtime_map_edges (
          id, map_instance_id, source_edge_id, x, y, direction, edge_type, blocks_movement,
          door_state, gm_notes, created_at, updated_at
        )
        SELECT 'runtime_edge_' || lower(hex(randomblob(16))), ?, id, x, y, direction, edge_type,
               blocks_movement, door_default_state, gm_notes, ?, ?
        FROM map_edges WHERE map_template_id = ?
      `).bind(toMapInstanceId, now, now, destination.map_template_id),
      env.DB.prepare(`
        INSERT INTO runtime_map_zones (
          id, map_instance_id, source_zone_id, name, zone_type, player_visible, gm_notes, created_at, updated_at
        )
        SELECT 'runtime_zone_' || lower(hex(randomblob(16))), ?, id, name, zone_type,
               player_visible_default, gm_notes, ?, ?
        FROM map_zones WHERE map_template_id = ?
      `).bind(toMapInstanceId, now, now, destination.map_template_id),
      env.DB.prepare(`
        INSERT INTO runtime_map_zone_cells (runtime_zone_id, x, y)
        SELECT rz.id, mzc.x, mzc.y
        FROM map_zone_cells mzc
        JOIN runtime_map_zones rz ON rz.map_instance_id = ? AND rz.source_zone_id = mzc.zone_id
        JOIN map_zones mz ON mz.id = mzc.zone_id
        WHERE mz.map_template_id = ?
      `).bind(toMapInstanceId, destination.map_template_id),
      env.DB.prepare(`
        INSERT INTO runtime_map_spawn_points (
          id, map_instance_id, source_spawn_point_id, name, x, y, spawn_type, enabled, gm_notes, created_at, updated_at
        )
        SELECT 'runtime_spawn_' || lower(hex(randomblob(16))), ?, id, name, x, y, spawn_type, 1, gm_notes, ?, ?
        FROM map_spawn_points WHERE map_template_id = ?
      `).bind(toMapInstanceId, now, now, destination.map_template_id)
    );
    addSceneConfigOverrides(env, statements, toMapInstanceId, destinationConfig, now);

    for (const flag of flags) {
      statements.push(env.DB.prepare(`
        INSERT INTO runtime_story_flags (
          scene_run_id, flag_key, value_json, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(toSceneRunId, flag.flag_key, flag.value_json, actor.id, now, now));
    }

    if (targetSpawn) {
      for (const character of characters) {
        statements.push(env.DB.prepare(`
          INSERT INTO runtime_entity_positions (
            id, map_instance_id, entity_type, entity_id, x, y, visibility_mode,
            placed_by_user_id, created_at, updated_at
          ) VALUES (?, ?, 'character', ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          `runtime_position_${crypto.randomUUID()}`, toMapInstanceId, character.entity_id,
          Number(targetSpawn.x), Number(targetSpawn.y), character.visibility_mode || 'default', actor.id, now, now
        ));
      }
    }
  }

  statements.push(
    env.DB.prepare(`
      UPDATE runtime_encounter_states
      SET status = 'skipped', updated_at = ?
      WHERE scene_run_id = ? AND status = 'planned'
    `).bind(now, source.scene_run_id)
  );

  for (const rest of activeRests) {
    statements.push(env.DB.prepare(`
      UPDATE character_rest_state
      SET status = 'cancelled', interrupted_reason = 'scene_transition', completed_at = ?, updated_at = ?
      WHERE character_id = ? AND rest_session_id = ? AND map_instance_id = ? AND status = 'active'
    `).bind(now, now, rest.character_id, rest.rest_session_id, mapInstanceId));
    if (hasRestLog) {
      statements.push(env.DB.prepare(`
        INSERT INTO character_rest_log (
          id, rest_session_id, character_id, map_instance_id, round_number,
          event_type, rest_type, resource_key, progress_rounds, required_rounds,
          recovery_applied, detail, created_at
        )
        SELECT ?, rest_session_id, character_id, map_instance_id, last_progress_round,
               'cancelled', rest_type, resource_key, progress_rounds, required_rounds,
               0, 'scene_transition', ?
        FROM character_rest_state
        WHERE character_id = ? AND rest_session_id = ? AND status = 'cancelled' AND updated_at = ?
      `).bind(`restlog_${crypto.randomUUID()}`, now, rest.character_id, rest.rest_session_id, now));
    }
  }

  statements.push(
    env.DB.prepare(`
      UPDATE runtime_map_instances
      SET status = 'closed', updated_at = ?, closed_at = ?
      WHERE id = ? AND status = 'active'
    `).bind(now, now, mapInstanceId),
    env.DB.prepare(`
      UPDATE scene_runs
      SET status = 'completed', updated_at = ?, completed_at = ?
      WHERE id = ? AND status = 'active'
    `).bind(now, now, source.scene_run_id)
  );

  if (request.mode === 'complete_scenario') {
    statements.push(env.DB.prepare(`
      UPDATE scenario_runs
      SET status = 'completed', updated_at = ?, completed_at = ?
      WHERE id = ? AND status = 'active'
    `).bind(now, now, source.scenario_run_id));
  } else {
    statements.push(env.DB.prepare(`
      UPDATE scenario_runs SET updated_at = ? WHERE id = ? AND status = 'active'
    `).bind(now, source.scenario_run_id));
  }

  statements.push(env.DB.prepare(`
    INSERT INTO runtime_scene_transition_log (
      id, scenario_run_id, from_scene_run_id, from_map_instance_id, from_scene_id,
      transition_mode, to_scene_run_id, to_map_instance_id, to_scene_id,
      carry_flag_keys_json, carried_character_ids_json, target_source_spawn_point_id,
      skipped_encounter_count, cancelled_rest_count, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    transitionId, source.scenario_run_id, source.scene_run_id, mapInstanceId, source.scene_id,
    request.mode, toSceneRunId, toMapInstanceId, destination?.scene_id || null,
    JSON.stringify(request.carryFlagKeys), JSON.stringify(carriedCharacterIds), targetSpawn?.id || null,
    skippedEncounterCount, activeRests.length, actor.id, now
  ));

  await env.DB.batch(statements);

  let sceneRunStartStoryEvents = [];
  let sceneRunStartStoryWarning = null;
  let lifecycleEvents = [];
  let storyLifecycleWarning = null;
  if (request.mode === 'next_scene') {
    try {
      sceneRunStartStoryEvents = await processSceneRunStartStoryEvents(env, {
        actor,
        sceneRunId: toSceneRunId,
        sceneId: destination.scene_id,
        mapInstanceId: toMapInstanceId
      });
    } catch (error) {
      console.error('Scene transition committed but scene_run_start Story processing failed', {
        transitionId,
        toSceneRunId,
        code: error?.code || null,
        message: String(error?.message || error)
      });
      sceneRunStartStoryWarning = { code: error?.code || 'STORY_SCENE_RUN_START_TRIGGER_ERROR' };
    }
    try {
      lifecycleEvents = await processPendingRuntimeStoryLifecycleEvents(env, { sceneRunId: toSceneRunId });
    } catch (error) {
      console.error('Scene transition committed but downstream Story lifecycle drain failed', {
        transitionId,
        toSceneRunId,
        code: error?.code || null,
        message: String(error?.message || error)
      });
      storyLifecycleWarning = { code: error?.code || 'STORY_LIFECYCLE_DRAIN_ERROR' };
    }
  }

  const transition = await existingTransition(env, source.scene_run_id);
  return {
    ok: true,
    idempotent: false,
    transition,
    destinationMap: await destinationMapPayload(env, toMapInstanceId),
    sceneRunStartStoryEvents,
    ...(sceneRunStartStoryWarning ? { sceneRunStartStoryWarning } : {}),
    ...lifecycleGroups(lifecycleEvents),
    ...(storyLifecycleWarning ? { storyLifecycleWarning } : {})
  };
}
