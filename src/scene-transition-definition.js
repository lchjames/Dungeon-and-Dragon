import {
  evaluateStoryConditions,
  normalizeStoryCondition,
  normalizeStoryFlagKey
} from './story-event-rules.js';
import { ensureRuntimeSceneTransitionSchema } from './runtime-scene-transition.js';

const STATUSES = new Set(['draft', 'active', 'archived']);
const MODES = new Set(['next_scene', 'complete_scenario']);
const CONDITION_TYPES = new Set([
  'flag_equals',
  'flag_not_equals',
  'door_state',
  'object_state',
  'encounter_status'
]);
let schemaPromise = null;

function fail(message, status = 400, code = 'SCENE_TRANSITION_DEFINITION_INVALID', extra = {}) {
  throw Object.assign(new Error(message), { status, code, ...extra });
}

function cleanText(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeName(value) {
  const name = cleanText(value, 120);
  if (!name) fail('Transition Definition Name 必須填寫。', 400, 'SCENE_TRANSITION_DEFINITION_NAME_REQUIRED');
  return name;
}

function normalizeStatus(value, fallback = 'draft') {
  const status = String(value || fallback).trim().toLowerCase();
  if (!STATUSES.has(status)) fail('Transition Definition status 無效。', 400, 'SCENE_TRANSITION_DEFINITION_STATUS_INVALID');
  return status;
}

function normalizeMode(value, fallback = 'next_scene') {
  const mode = String(value || fallback).trim().toLowerCase();
  if (!MODES.has(mode)) fail('Transition Definition mode 無效。', 400, 'SCENE_TRANSITION_DEFINITION_MODE_INVALID');
  return mode;
}

function normalizeSortOrder(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function normalizeFlagKeys(raw) {
  const values = Array.isArray(raw) ? raw : [];
  if (values.length > 50) fail('Transition Definition 最多可以攜帶 50 個 Story flags。', 400, 'SCENE_TRANSITION_DEFINITION_FLAG_LIMIT');
  const output = [];
  const seen = new Set();
  for (const value of values) {
    let key;
    try { key = normalizeStoryFlagKey(value); }
    catch { fail('Transition Definition 包含無效 Story flag key。', 400, 'SCENE_TRANSITION_DEFINITION_FLAG_INVALID'); }
    if (!seen.has(key)) {
      seen.add(key);
      output.push(key);
    }
  }
  return output;
}

function normalizeConditions(raw) {
  const values = Array.isArray(raw) ? raw : [];
  if (values.length > 20) fail('Transition Definition 最多可以有 20 個 conditions。', 400, 'SCENE_TRANSITION_DEFINITION_CONDITION_LIMIT');
  return values.map(value => {
    let condition;
    try { condition = normalizeStoryCondition(value); }
    catch (error) { fail(error?.message || 'Transition condition 無效。', 400, 'SCENE_TRANSITION_DEFINITION_CONDITION_INVALID'); }
    if (!CONDITION_TYPES.has(condition.type)) {
      fail(`Transition Definition 不支援 condition type: ${condition.type}`, 400, 'SCENE_TRANSITION_DEFINITION_CONDITION_UNSUPPORTED');
    }
    return condition;
  });
}

function definitionPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    fromSceneId: row.from_scene_id,
    name: row.name,
    status: row.status,
    mode: row.transition_mode,
    toSceneId: row.to_scene_id || null,
    conditions: parseJson(row.conditions_json, []),
    carryFlagKeys: parseJson(row.carry_flag_keys_json, []),
    carryCharacters: Boolean(row.carry_characters),
    targetSourceSpawnPointId: row.target_source_spawn_point_id || null,
    sortOrder: Number(row.sort_order || 0),
    gmNotes: row.gm_notes || '',
    version: Number(row.version || 1),
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function ensureSceneTransitionDefinitionSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  await ensureRuntimeSceneTransitionSchema(env);
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS scene_transition_definitions (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL,
        from_scene_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
        transition_mode TEXT NOT NULL CHECK (transition_mode IN ('next_scene', 'complete_scenario')),
        to_scene_id TEXT,
        conditions_json TEXT NOT NULL DEFAULT '[]',
        carry_flag_keys_json TEXT NOT NULL DEFAULT '[]',
        carry_characters INTEGER NOT NULL DEFAULT 1 CHECK (carry_characters IN (0, 1)),
        target_source_spawn_point_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        gm_notes TEXT NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (from_scene_id, name),
        CHECK (
          (transition_mode = 'next_scene' AND to_scene_id IS NOT NULL)
          OR
          (transition_mode = 'complete_scenario' AND to_scene_id IS NULL AND carry_characters = 0 AND target_source_spawn_point_id IS NULL)
        ),
        FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
        FOREIGN KEY (from_scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
        FOREIGN KEY (to_scene_id) REFERENCES scenes(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_scene_transition_definition_links (
        transition_id TEXT PRIMARY KEY,
        definition_id TEXT,
        definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
        definition_snapshot_json TEXT NOT NULL,
        linked_by_user_id TEXT NOT NULL,
        linked_at INTEGER NOT NULL,
        FOREIGN KEY (transition_id) REFERENCES runtime_scene_transition_log(id) ON DELETE RESTRICT,
        FOREIGN KEY (definition_id) REFERENCES scene_transition_definitions(id) ON DELETE SET NULL,
        FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scene_transition_definitions_source ON scene_transition_definitions(from_scene_id, status, sort_order, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scene_transition_definitions_destination ON scene_transition_definitions(to_scene_id, status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scene_transition_definitions_scenario ON scene_transition_definitions(scenario_id, status, updated_at)')
    ]).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function sceneContext(env, sceneId) {
  return env.DB.prepare(`
    SELECT s.id, s.scenario_id, s.name, s.status,
           smb.map_template_id, smb.scene_config_json,
           mt.status AS map_status, wl.status AS location_status
    FROM scenes s
    LEFT JOIN scene_map_bindings smb ON smb.scene_id = s.id
    LEFT JOIN map_templates mt ON mt.id = smb.map_template_id
    LEFT JOIN world_locations wl ON wl.id = smb.location_id
    WHERE s.id = ? LIMIT 1
  `).bind(sceneId).first();
}

async function validateConditionTargets(env, source, conditions) {
  for (const condition of conditions) {
    if (condition.type === 'encounter_status') {
      const row = await env.DB.prepare('SELECT id FROM encounters WHERE id = ? AND scene_id = ? LIMIT 1')
        .bind(condition.encounterId, source.id).first();
      if (!row) fail('Transition condition Encounter 唔屬於 source Scene。', 409, 'SCENE_TRANSITION_DEFINITION_ENCOUNTER_INVALID', { encounterId: condition.encounterId });
    }
    if (condition.type === 'door_state') {
      if (!source.map_template_id) fail('Source Scene 未綁定 Structured Map，不能使用 door_state condition。', 409, 'SCENE_TRANSITION_DEFINITION_SOURCE_MAP_REQUIRED');
      const row = await env.DB.prepare(`SELECT id FROM map_edges WHERE id = ? AND map_template_id = ? AND edge_type = 'door' LIMIT 1`)
        .bind(condition.sourceEdgeId, source.map_template_id).first();
      if (!row) fail('Transition condition Door 唔屬於 source Scene Map。', 409, 'SCENE_TRANSITION_DEFINITION_DOOR_INVALID', { sourceEdgeId: condition.sourceEdgeId });
    }
    if (condition.type === 'object_state') {
      if (!source.map_template_id) fail('Source Scene 未綁定 Structured Map，不能使用 object_state condition。', 409, 'SCENE_TRANSITION_DEFINITION_SOURCE_MAP_REQUIRED');
      const row = await env.DB.prepare('SELECT id FROM map_objects WHERE id = ? AND map_template_id = ? LIMIT 1')
        .bind(condition.sourceObjectId, source.map_template_id).first();
      if (!row) fail('Transition condition Object 唔屬於 source Scene Map。', 409, 'SCENE_TRANSITION_DEFINITION_OBJECT_INVALID', { sourceObjectId: condition.sourceObjectId });
    }
  }
}

async function targetContext(env, sceneId, scenarioId) {
  return env.DB.prepare(`
    SELECT s.id, s.scenario_id, s.name, s.status AS scene_status,
           smb.map_template_id, smb.scene_config_json,
           mt.status AS map_status, wl.status AS location_status
    FROM scenes s
    LEFT JOIN scene_map_bindings smb ON smb.scene_id = s.id
    LEFT JOIN map_templates mt ON mt.id = smb.map_template_id
    LEFT JOIN world_locations wl ON wl.id = smb.location_id
    WHERE s.id = ? AND s.scenario_id = ? LIMIT 1
  `).bind(sceneId, scenarioId).first();
}

async function validateTargetPolicy(env, source, values, { requireRuntimeReady = false } = {}) {
  if (values.mode === 'complete_scenario') {
    if (values.carryFlagKeys.length) fail('complete_scenario Definition 不可攜帶 Scene-scoped Story flags。', 400, 'SCENE_TRANSITION_DEFINITION_TERMINAL_FLAGS_INVALID');
    return { target: null, spawn: null };
  }
  if (!values.toSceneId) fail('next_scene Definition 必須指定 toSceneId。', 400, 'SCENE_TRANSITION_DEFINITION_TARGET_REQUIRED');
  if (values.toSceneId === source.id) fail('Transition Definition target 不可與 source Scene 相同。', 409, 'SCENE_TRANSITION_DEFINITION_SAME_SCENE');
  const target = await targetContext(env, values.toSceneId, source.scenario_id);
  if (!target) fail('Transition Definition target 必須屬於同一 Scenario。', 409, 'SCENE_TRANSITION_DEFINITION_TARGET_INVALID');
  if (requireRuntimeReady) {
    if (target.scene_status !== 'active') fail('Active Transition Definition target Scene 必須為 active。', 409, 'SCENE_TRANSITION_DEFINITION_TARGET_INACTIVE');
    if (!target.map_template_id || target.map_status !== 'active' || target.location_status !== 'active') {
      fail('Active Transition Definition target 必須有 active Structured Map binding。', 409, 'SCENE_TRANSITION_DEFINITION_TARGET_MAP_INACTIVE');
    }
  }
  let spawn = null;
  if (values.carryCharacters) {
    if (!values.targetSourceSpawnPointId) fail('carryCharacters=true 必須指定 targetSourceSpawnPointId。', 400, 'SCENE_TRANSITION_DEFINITION_SPAWN_REQUIRED');
    if (!target.map_template_id) fail('Target Scene 未綁定 Structured Map，不能指定 Character entry Spawn。', 409, 'SCENE_TRANSITION_DEFINITION_TARGET_MAP_REQUIRED');
    spawn = await env.DB.prepare(`
      SELECT id, spawn_type FROM map_spawn_points WHERE id = ? AND map_template_id = ? LIMIT 1
    `).bind(values.targetSourceSpawnPointId, target.map_template_id).first();
    if (!spawn) fail('Transition Definition Spawn Point 唔屬於 target Scene Map。', 409, 'SCENE_TRANSITION_DEFINITION_SPAWN_INVALID');
    if (spawn.spawn_type !== 'character' && spawn.spawn_type !== 'any') {
      fail('Transition Definition Spawn Point 必須接受 character / any。', 409, 'SCENE_TRANSITION_DEFINITION_SPAWN_TYPE_INVALID');
    }
    const config = parseJson(target.scene_config_json, {});
    if (config?.spawnEnabled?.[spawn.id] === false) fail('Transition Definition Spawn Point 已被 target Scene config 停用。', 409, 'SCENE_TRANSITION_DEFINITION_SPAWN_DISABLED');
  }
  return { target, spawn };
}

function normalizedValues(body, existing = null) {
  const mode = normalizeMode(body?.mode, existing?.transition_mode || 'next_scene');
  const status = normalizeStatus(body?.status, existing?.status || 'draft');
  const carryCharacters = mode === 'next_scene'
    ? (body?.carryCharacters === undefined ? Boolean(existing ? existing.carry_characters : true) : body.carryCharacters !== false)
    : false;
  const toSceneId = mode === 'next_scene'
    ? cleanText(body?.toSceneId === undefined ? existing?.to_scene_id : body.toSceneId, 180)
    : '';
  const targetSourceSpawnPointId = mode === 'next_scene' && carryCharacters
    ? cleanText(body?.targetSourceSpawnPointId === undefined ? existing?.target_source_spawn_point_id : body.targetSourceSpawnPointId, 180)
    : '';
  return {
    name: body?.name === undefined && existing ? existing.name : normalizeName(body?.name),
    status,
    mode,
    toSceneId,
    conditions: body?.conditions === undefined && existing ? parseJson(existing.conditions_json, []) : normalizeConditions(body?.conditions),
    carryFlagKeys: body?.carryFlagKeys === undefined && existing ? parseJson(existing.carry_flag_keys_json, []) : normalizeFlagKeys(body?.carryFlagKeys),
    carryCharacters,
    targetSourceSpawnPointId,
    sortOrder: body?.sortOrder === undefined && existing ? Number(existing.sort_order || 0) : normalizeSortOrder(body?.sortOrder),
    gmNotes: body?.gmNotes === undefined && existing ? existing.gm_notes : cleanText(body?.gmNotes, 5000)
  };
}

async function validateDefinition(env, source, values) {
  await validateConditionTargets(env, source, values.conditions);
  await validateTargetPolicy(env, source, values, { requireRuntimeReady: values.status === 'active' });
}

export async function listSceneTransitionDefinitions(env, { sceneId = null } = {}) {
  await ensureSceneTransitionDefinitionSchema(env);
  const rows = sceneId
    ? await env.DB.prepare(`SELECT * FROM scene_transition_definitions WHERE from_scene_id = ? ORDER BY sort_order, created_at, id`).bind(sceneId).all()
    : await env.DB.prepare(`SELECT * FROM scene_transition_definitions ORDER BY scenario_id, from_scene_id, sort_order, created_at, id`).all();
  return (rows.results || []).map(definitionPayload);
}

export async function createSceneTransitionDefinition(env, { sceneId, actorUserId, body }) {
  await ensureSceneTransitionDefinitionSchema(env);
  const source = await sceneContext(env, sceneId);
  if (!source) fail('Source Scene 不存在。', 404, 'SCENE_NOT_FOUND');
  const values = normalizedValues(body);
  await validateDefinition(env, source, values);
  const now = Date.now();
  const id = `scene_transition_def_${crypto.randomUUID()}`;
  try {
    await env.DB.prepare(`
      INSERT INTO scene_transition_definitions (
        id, scenario_id, from_scene_id, name, status, transition_mode, to_scene_id,
        conditions_json, carry_flag_keys_json, carry_characters, target_source_spawn_point_id,
        sort_order, gm_notes, version, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(
      id, source.scenario_id, source.id, values.name, values.status, values.mode, values.toSceneId || null,
      JSON.stringify(values.conditions), JSON.stringify(values.carryFlagKeys), values.carryCharacters ? 1 : 0,
      values.targetSourceSpawnPointId || null, values.sortOrder, values.gmNotes,
      actorUserId, actorUserId, now, now
    ).run();
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes('unique')) {
      fail('同一 Source Scene 內 Transition Definition Name 不可重複。', 409, 'SCENE_TRANSITION_DEFINITION_NAME_CONFLICT');
    }
    throw error;
  }
  return definitionPayload(await env.DB.prepare('SELECT * FROM scene_transition_definitions WHERE id = ? LIMIT 1').bind(id).first());
}

export async function updateSceneTransitionDefinition(env, { definitionId, actorUserId, body }) {
  await ensureSceneTransitionDefinitionSchema(env);
  const existing = await env.DB.prepare('SELECT * FROM scene_transition_definitions WHERE id = ? LIMIT 1').bind(definitionId).first();
  if (!existing) fail('Transition Definition 不存在。', 404, 'SCENE_TRANSITION_DEFINITION_NOT_FOUND');
  const expectedVersion = Number(body?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) fail('expectedVersion 必須提供。', 400, 'SCENE_TRANSITION_DEFINITION_VERSION_REQUIRED');
  if (expectedVersion !== Number(existing.version)) fail('Transition Definition 已被其他編輯更新，請重新載入。', 409, 'SCENE_TRANSITION_DEFINITION_VERSION_CONFLICT');
  const source = await sceneContext(env, existing.from_scene_id);
  if (!source) fail('Source Scene 不存在。', 409, 'SCENE_TRANSITION_DEFINITION_SOURCE_MISSING');
  const values = normalizedValues(body, existing);
  await validateDefinition(env, source, values);
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE scene_transition_definitions
    SET name = ?, status = ?, transition_mode = ?, to_scene_id = ?, conditions_json = ?,
        carry_flag_keys_json = ?, carry_characters = ?, target_source_spawn_point_id = ?,
        sort_order = ?, gm_notes = ?, version = version + 1, updated_by_user_id = ?, updated_at = ?
    WHERE id = ? AND version = ?
  `).bind(
    values.name, values.status, values.mode, values.toSceneId || null, JSON.stringify(values.conditions),
    JSON.stringify(values.carryFlagKeys), values.carryCharacters ? 1 : 0, values.targetSourceSpawnPointId || null,
    values.sortOrder, values.gmNotes, actorUserId, now, definitionId, expectedVersion
  ).run();
  if (Number(result?.meta?.changes || 0) !== 1) fail('Transition Definition 已被其他編輯更新，請重新載入。', 409, 'SCENE_TRANSITION_DEFINITION_VERSION_CONFLICT');
  return definitionPayload(await env.DB.prepare('SELECT * FROM scene_transition_definitions WHERE id = ? LIMIT 1').bind(definitionId).first());
}

export async function deleteDraftSceneTransitionDefinition(env, { definitionId, expectedVersion }) {
  await ensureSceneTransitionDefinitionSchema(env);
  const version = Number(expectedVersion);
  if (!Number.isInteger(version) || version < 1) fail('expectedVersion 必須提供。', 400, 'SCENE_TRANSITION_DEFINITION_VERSION_REQUIRED');
  const existing = await env.DB.prepare('SELECT * FROM scene_transition_definitions WHERE id = ? LIMIT 1').bind(definitionId).first();
  if (!existing) fail('Transition Definition 不存在。', 404, 'SCENE_TRANSITION_DEFINITION_NOT_FOUND');
  if (existing.status !== 'draft') fail('只有 draft Transition Definition 可以刪除；active / archived 請保留歷史 identity。', 409, 'SCENE_TRANSITION_DEFINITION_DELETE_REQUIRES_DRAFT');
  const result = await env.DB.prepare(`DELETE FROM scene_transition_definitions WHERE id = ? AND version = ? AND status = 'draft'`)
    .bind(definitionId, version).run();
  if (Number(result?.meta?.changes || 0) !== 1) fail('Transition Definition 已被其他編輯更新，請重新載入。', 409, 'SCENE_TRANSITION_DEFINITION_VERSION_CONFLICT');
  return { id: definitionId };
}

async function runtimeContext(env, mapInstanceId) {
  const map = await env.DB.prepare(`
    SELECT rmi.id, rmi.scene_run_id, rmi.scene_id, rmi.scenario_run_id, sr.status AS scene_run_status
    FROM runtime_map_instances rmi
    JOIN scene_runs sr ON sr.id = rmi.scene_run_id
    WHERE rmi.id = ? LIMIT 1
  `).bind(mapInstanceId).first();
  if (!map) fail('Runtime Map 不存在。', 404, 'RUNTIME_MAP_NOT_FOUND');
  const [flags, doors, objects, encounters, combat] = await Promise.all([
    env.DB.prepare('SELECT flag_key, value_json FROM runtime_story_flags WHERE scene_run_id = ?').bind(map.scene_run_id).all(),
    env.DB.prepare(`SELECT source_edge_id, door_state FROM runtime_map_edges WHERE map_instance_id = ? AND edge_type = 'door' AND source_edge_id IS NOT NULL`).bind(mapInstanceId).all(),
    env.DB.prepare(`SELECT source_object_id, state_key FROM runtime_map_objects WHERE map_instance_id = ?`).bind(mapInstanceId).all(),
    env.DB.prepare(`SELECT encounter_id, status FROM runtime_encounter_states WHERE scene_run_id = ?`).bind(map.scene_run_id).all(),
    env.DB.prepare(`
      SELECT rec.combat_id FROM runtime_encounter_combats rec JOIN combats c ON c.id = rec.combat_id
      WHERE rec.map_instance_id = ? AND c.status = 'active' LIMIT 1
    `).bind(mapInstanceId).first()
  ]);
  return {
    map,
    flags: new Map((flags.results || []).map(row => [row.flag_key, parseJson(row.value_json, null)])),
    doors: new Map((doors.results || []).map(row => [row.source_edge_id, row.door_state])),
    objects: new Map((objects.results || []).map(row => [row.source_object_id, row.state_key])),
    encounters: new Map((encounters.results || []).map(row => [row.encounter_id, { status: row.status }])),
    activeCombatId: combat?.combat_id || null
  };
}

async function routeRuntimeReadiness(env, source, definition) {
  const values = {
    mode: definition.mode,
    toSceneId: definition.toSceneId || '',
    carryFlagKeys: definition.carryFlagKeys || [],
    carryCharacters: Boolean(definition.carryCharacters),
    targetSourceSpawnPointId: definition.targetSourceSpawnPointId || ''
  };
  try {
    await validateTargetPolicy(env, source, values, { requireRuntimeReady: true });
    return { ok: true, failures: [] };
  } catch (error) {
    return { ok: false, failures: [{ type: 'definition_readiness', reason: error?.code || 'SCENE_TRANSITION_DEFINITION_NOT_READY', message: error?.message || 'Definition not runtime-ready.' }] };
  }
}

export async function loadRuntimeSceneTransitionOptions(env, { mapInstanceId }) {
  await ensureSceneTransitionDefinitionSchema(env);
  const context = await runtimeContext(env, mapInstanceId);
  const source = await sceneContext(env, context.map.scene_id);
  const definitions = (await listSceneTransitionDefinitions(env, { sceneId: context.map.scene_id })).filter(item => item.status === 'active');
  const activeEncounter = [...context.encounters.entries()].find(([, value]) => value?.status === 'active');
  const globalBlockers = [];
  if (context.activeCombatId) globalBlockers.push({ reason: 'active_combat', combatId: context.activeCombatId });
  if (activeEncounter) globalBlockers.push({ reason: 'active_encounter', encounterId: activeEncounter[0] });
  const options = [];
  for (const definition of definitions) {
    const conditions = evaluateStoryConditions(definition.conditions, {
      flags: context.flags,
      doors: context.doors,
      objects: context.objects,
      encounters: context.encounters,
      sceneRunStatus: context.map.scene_run_status
    });
    const readiness = await routeRuntimeReadiness(env, source, definition);
    options.push({
      definition,
      eligible: conditions.ok && readiness.ok && globalBlockers.length === 0,
      conditionFailures: conditions.failures,
      readinessFailures: readiness.failures
    });
  }
  return {
    mapInstanceId,
    sceneRunId: context.map.scene_run_id,
    sceneId: context.map.scene_id,
    globalBlockers,
    options
  };
}

export async function resolveRuntimeSceneTransitionDefinition(env, { mapInstanceId, definitionId }) {
  await ensureSceneTransitionDefinitionSchema(env);
  const context = await runtimeContext(env, mapInstanceId);
  const row = await env.DB.prepare('SELECT * FROM scene_transition_definitions WHERE id = ? LIMIT 1').bind(definitionId).first();
  const definition = definitionPayload(row);
  if (!definition) fail('Transition Definition 不存在。', 404, 'SCENE_TRANSITION_DEFINITION_NOT_FOUND');
  if (definition.status !== 'active') fail('只有 active Transition Definition 可以執行。', 409, 'SCENE_TRANSITION_DEFINITION_NOT_ACTIVE');
  if (definition.fromSceneId !== context.map.scene_id) fail('Transition Definition 唔屬於目前 Runtime Scene。', 409, 'SCENE_TRANSITION_DEFINITION_SOURCE_MISMATCH');
  const options = await loadRuntimeSceneTransitionOptions(env, { mapInstanceId });
  const option = options.options.find(item => item.definition.id === definition.id);
  if (!option) fail('Transition Definition 唔係目前 Runtime Scene可用 route。', 409, 'SCENE_TRANSITION_DEFINITION_UNAVAILABLE');
  if (!option.eligible) {
    fail('Transition Definition conditions / readiness 未滿足。', 409, 'SCENE_TRANSITION_DEFINITION_NOT_ELIGIBLE', {
      conditionFailures: option.conditionFailures,
      readinessFailures: option.readinessFailures,
      globalBlockers: options.globalBlockers
    });
  }
  return {
    definition,
    transitionBody: definition.mode === 'complete_scenario'
      ? { mode: 'complete_scenario', carryFlagKeys: [] }
      : {
          mode: 'next_scene',
          nextSceneId: definition.toSceneId,
          carryFlagKeys: definition.carryFlagKeys,
          carryCharacters: definition.carryCharacters,
          targetSourceSpawnPointId: definition.targetSourceSpawnPointId || ''
        }
  };
}

export async function recordRuntimeSceneTransitionDefinitionLink(env, { transitionId, definition, actorUserId }) {
  await ensureSceneTransitionDefinitionSchema(env);
  if (!transitionId || !definition?.id) return null;
  const snapshot = {
    id: definition.id,
    version: definition.version,
    scenarioId: definition.scenarioId,
    fromSceneId: definition.fromSceneId,
    name: definition.name,
    status: definition.status,
    mode: definition.mode,
    toSceneId: definition.toSceneId,
    conditions: definition.conditions,
    carryFlagKeys: definition.carryFlagKeys,
    carryCharacters: definition.carryCharacters,
    targetSourceSpawnPointId: definition.targetSourceSpawnPointId,
    sortOrder: definition.sortOrder
  };
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO runtime_scene_transition_definition_links (
      transition_id, definition_id, definition_version, definition_snapshot_json, linked_by_user_id, linked_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(transition_id) DO NOTHING
  `).bind(transitionId, definition.id, definition.version, JSON.stringify(snapshot), actorUserId, now).run();
  const row = await env.DB.prepare(`SELECT * FROM runtime_scene_transition_definition_links WHERE transition_id = ? LIMIT 1`).bind(transitionId).first();
  return row ? {
    transitionId: row.transition_id,
    definitionId: row.definition_id || null,
    definitionVersion: Number(row.definition_version),
    definitionSnapshot: parseJson(row.definition_snapshot_json, {}),
    linkedByUserId: row.linked_by_user_id,
    linkedAt: row.linked_at
  } : null;
}
