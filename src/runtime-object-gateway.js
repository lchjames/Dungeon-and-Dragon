import baseWorker from './runtime-story-lifecycle-gateway.js';
import {
  ensureRuntimeStoryLifecycleAuthoritySchema,
  processPendingRuntimeStoryLifecycleEvents
} from './runtime-story-lifecycle.js';
import { processPendingObjectStoryEvents } from './runtime-object-story.js';

const GM_ROLES = new Set(['gm', 'admin']);
const STATE_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const OBJECT_TYPE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
let objectSchemaPromise = null;

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

function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
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

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (String(user.status || '').toLowerCase() !== 'active') {
    throw Object.assign(new Error('此 User 目前不可進行 Object Interaction。'), { status: 403, code: 'USER_NOT_ACTIVE' });
  }
  return user;
}

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

function cleanText(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function requiredText(value, label, max = 120) {
  const output = cleanText(value, max);
  if (!output) throw Object.assign(new Error(`${label} 必須填寫。`), { status: 400, code: 'VALIDATION_ERROR' });
  return output;
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw Object.assign(new Error(`${label} 必須為整數。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

function boolInt(value, fallback = false) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function stateKey(value, fallback = 'ready') {
  const key = String(value ?? fallback).trim().toLowerCase();
  if (!STATE_KEY.test(key)) {
    throw Object.assign(new Error('Object stateKey 格式無效。'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return key;
}

function objectType(value, fallback = 'object') {
  const type = String(value ?? fallback).trim().toLowerCase();
  if (!OBJECT_TYPE.test(type)) {
    throw Object.assign(new Error('Object type 格式無效。'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return type;
}

async function ensureRuntimeObjectAuthority(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  await ensureRuntimeStoryLifecycleAuthoritySchema(env);
  if (!objectSchemaPromise) {
    objectSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_exploration_state (
        map_instance_id TEXT PRIMARY KEY,
        round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_exploration_character_state (
        map_instance_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
        action_available INTEGER NOT NULL DEFAULT 1 CHECK (action_available IN (0, 1)),
        move_available INTEGER NOT NULL DEFAULT 1 CHECK (move_available IN (0, 1)),
        turn_completed INTEGER NOT NULL DEFAULT 0 CHECK (turn_completed IN (0, 1)),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (map_instance_id, character_id),
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_objects (
        id TEXT PRIMARY KEY,
        map_template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        object_type TEXT NOT NULL DEFAULT 'object',
        player_visible_default INTEGER NOT NULL DEFAULT 1 CHECK (player_visible_default IN (0, 1)),
        interactable_default INTEGER NOT NULL DEFAULT 1 CHECK (interactable_default IN (0, 1)),
        interaction_range INTEGER NOT NULL DEFAULT 1 CHECK (interaction_range IN (0, 1)),
        single_use INTEGER NOT NULL DEFAULT 0 CHECK (single_use IN (0, 1)),
        initial_state_key TEXT NOT NULL DEFAULT 'ready',
        gm_notes TEXT NOT NULL DEFAULT '',
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (map_template_id, name),
        FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_map_objects (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        source_object_id TEXT NOT NULL,
        name_snapshot TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        object_type TEXT NOT NULL DEFAULT 'object',
        player_visible INTEGER NOT NULL DEFAULT 1 CHECK (player_visible IN (0, 1)),
        interactable INTEGER NOT NULL DEFAULT 1 CHECK (interactable IN (0, 1)),
        interaction_range INTEGER NOT NULL DEFAULT 1 CHECK (interaction_range IN (0, 1)),
        single_use INTEGER NOT NULL DEFAULT 0 CHECK (single_use IN (0, 1)),
        state_key TEXT NOT NULL DEFAULT 'ready',
        interaction_count INTEGER NOT NULL DEFAULT 0 CHECK (interaction_count >= 0),
        last_interacted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (map_instance_id, source_object_id),
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_object_interaction_log (
        id TEXT PRIMARY KEY,
        scene_run_id TEXT NOT NULL,
        map_instance_id TEXT NOT NULL,
        runtime_object_id TEXT NOT NULL,
        source_object_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        interaction_mode TEXT NOT NULL CHECK (interaction_mode IN ('exploration', 'combat')),
        exploration_round_number INTEGER,
        combat_id TEXT,
        combat_round_number INTEGER,
        from_state_key TEXT NOT NULL,
        to_state_key TEXT NOT NULL,
        object_interaction_count_before INTEGER NOT NULL CHECK (object_interaction_count_before >= 0),
        created_at INTEGER NOT NULL,
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (runtime_object_id) REFERENCES runtime_map_objects(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE RESTRICT,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE SET NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_object_state_log (
        id TEXT PRIMARY KEY,
        scene_run_id TEXT NOT NULL,
        map_instance_id TEXT NOT NULL,
        runtime_object_id TEXT NOT NULL,
        source_object_id TEXT NOT NULL,
        from_state_key TEXT NOT NULL,
        to_state_key TEXT NOT NULL,
        change_reason TEXT NOT NULL CHECK (change_reason IN ('interaction', 'gm_override')),
        changed_by_user_id TEXT NOT NULL,
        interaction_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (runtime_object_id) REFERENCES runtime_map_objects(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (interaction_id) REFERENCES runtime_object_interaction_log(id) ON DELETE SET NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_map_objects_template ON map_objects(map_template_id, y, x, name)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_objects_map ON runtime_map_objects(map_instance_id, y, x, player_visible, interactable)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_object_interactions_scene ON runtime_object_interaction_log(scene_run_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_object_interactions_object ON runtime_object_interaction_log(runtime_object_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_object_state_object ON runtime_object_state_log(runtime_object_id, created_at)'),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_map_clone_objects
        AFTER INSERT ON runtime_map_instances
        BEGIN
          INSERT OR IGNORE INTO runtime_map_objects (
            id, map_instance_id, source_object_id, name_snapshot, x, y, object_type,
            player_visible, interactable, interaction_range, single_use, state_key,
            interaction_count, last_interacted_at, created_at, updated_at
          )
          SELECT
            'runtime_object_' || lower(hex(randomblob(16))), NEW.id, mo.id, mo.name,
            mo.x, mo.y, mo.object_type, mo.player_visible_default, mo.interactable_default,
            mo.interaction_range, mo.single_use, mo.initial_state_key, 0, NULL,
            NEW.created_at, NEW.created_at
          FROM map_objects mo WHERE mo.map_template_id = NEW.map_template_id;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_consume_exploration_action
        AFTER INSERT ON runtime_object_interaction_log
        WHEN NEW.interaction_mode = 'exploration'
        BEGIN
          UPDATE runtime_exploration_character_state
          SET action_available = 0, updated_at = NEW.created_at
          WHERE map_instance_id = NEW.map_instance_id AND character_id = NEW.character_id
            AND round_number = NEW.exploration_round_number AND action_available = 1 AND turn_completed = 0;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_consume_combat_action
        AFTER INSERT ON runtime_object_interaction_log
        WHEN NEW.interaction_mode = 'combat'
        BEGIN
          UPDATE combatants
          SET action_available = 0, updated_at = NEW.created_at
          WHERE combat_id = NEW.combat_id AND entity_type = 'character' AND entity_id = NEW.character_id
            AND controller_user_id = NEW.actor_user_id AND action_available = 1;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_apply_object
        AFTER INSERT ON runtime_object_interaction_log
        BEGIN
          UPDATE runtime_map_objects
          SET state_key = NEW.to_state_key, interaction_count = interaction_count + 1,
              last_interacted_at = NEW.created_at,
              interactable = CASE WHEN single_use = 1 THEN 0 ELSE interactable END,
              updated_at = NEW.created_at
          WHERE id = NEW.runtime_object_id AND map_instance_id = NEW.map_instance_id
            AND interaction_count = NEW.object_interaction_count_before;
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_state_log
        AFTER INSERT ON runtime_object_interaction_log
        WHEN NEW.from_state_key IS NOT NEW.to_state_key
        BEGIN
          INSERT INTO runtime_object_state_log (
            id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
            from_state_key, to_state_key, change_reason, changed_by_user_id, interaction_id, created_at
          ) VALUES (
            'runtime_object_state_' || lower(hex(randomblob(16))), NEW.scene_run_id, NEW.map_instance_id,
            NEW.runtime_object_id, NEW.source_object_id, NEW.from_state_key, NEW.to_state_key,
            'interaction', NEW.actor_user_id, NEW.id, NEW.created_at
          );
        END`),
      env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_story_occurrence
        AFTER INSERT ON runtime_object_interaction_log
        BEGIN
          INSERT OR IGNORE INTO runtime_story_lifecycle_occurrences (
            id, scene_run_id, trigger_type, subject_type, subject_id, source_at, actor_user_id,
            lease_token, lease_at, completed_at, created_at, updated_at
          ) VALUES (
            'story_lifecycle_' || lower(hex(randomblob(16))), NEW.scene_run_id, 'interact_object',
            'object_interaction', NEW.id, NEW.created_at, NEW.actor_user_id,
            NULL, NULL, NULL, NEW.created_at, NEW.created_at
          );
        END`)
    ]).catch(error => {
      objectSchemaPromise = null;
      throw error;
    });
  }
  await objectSchemaPromise;
}

function definitionPayload(row) {
  return {
    id: row.id,
    mapTemplateId: row.map_template_id,
    name: row.name,
    x: Number(row.x),
    y: Number(row.y),
    objectType: row.object_type,
    playerVisibleDefault: Boolean(row.player_visible_default),
    interactableDefault: Boolean(row.interactable_default),
    interactionRange: Number(row.interaction_range),
    singleUse: Boolean(row.single_use),
    initialStateKey: row.initial_state_key,
    gmNotes: row.gm_notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function runtimePayload(row) {
  return {
    id: row.id,
    mapInstanceId: row.map_instance_id,
    sourceObjectId: row.source_object_id,
    name: row.name_snapshot,
    x: Number(row.x),
    y: Number(row.y),
    objectType: row.object_type,
    playerVisible: Boolean(row.player_visible),
    interactable: Boolean(row.interactable),
    interactionRange: Number(row.interaction_range),
    singleUse: Boolean(row.single_use),
    stateKey: row.state_key,
    interactionCount: Number(row.interaction_count || 0),
    lastInteractedAt: row.last_interacted_at,
    updatedAt: row.updated_at
  };
}

async function mapTemplate(env, mapId) {
  return env.DB.prepare(`
    SELECT id, name, width, height, status, version FROM map_templates WHERE id = ? LIMIT 1
  `).bind(mapId).first();
}

async function validateDefinitionPosition(env, mapId, map, xValue, yValue) {
  const x = integer(xValue, 'Object X');
  const y = integer(yValue, 'Object Y');
  if (x < 0 || y < 0 || x >= Number(map.width) || y >= Number(map.height)) {
    throw Object.assign(new Error('Object 座標超出 Map 範圍。'), { status: 400, code: 'MAP_COORDINATE_OUT_OF_BOUNDS' });
  }
  const cell = await env.DB.prepare(`
    SELECT is_walkable FROM map_cells WHERE map_template_id = ? AND x = ? AND y = ? LIMIT 1
  `).bind(mapId, x, y).first();
  if (cell && !Boolean(cell.is_walkable)) {
    throw Object.assign(new Error('Object 不可放在 blocked Cell。'), { status: 400, code: 'OBJECT_ON_BLOCKED_CELL' });
  }
  return { x, y };
}

function normalizeDefinitionBody(body) {
  const range = integer(body.interactionRange ?? 1, 'interactionRange');
  if (range < 0 || range > 1) {
    throw Object.assign(new Error('Alpha interactionRange 只支援 0 或 1。'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return {
    name: requiredText(body.name, 'Object Name', 120),
    objectType: objectType(body.objectType || 'object'),
    playerVisibleDefault: boolInt(body.playerVisibleDefault, true),
    interactableDefault: boolInt(body.interactableDefault, true),
    interactionRange: range,
    singleUse: boolInt(body.singleUse, false),
    initialStateKey: stateKey(body.initialStateKey || 'ready'),
    gmNotes: cleanText(body.gmNotes, 1000)
  };
}

async function listDefinitionObjects(request, env, mapId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  const map = await mapTemplate(env, mapId);
  if (!map) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  const rows = await env.DB.prepare(`
    SELECT * FROM map_objects WHERE map_template_id = ? ORDER BY y, x, name, id
  `).bind(mapId).all();
  return json({
    ok: true,
    mapTemplate: {
      id: map.id,
      name: map.name,
      width: Number(map.width),
      height: Number(map.height),
      status: map.status,
      version: Number(map.version)
    },
    objects: (rows.results || []).map(definitionPayload)
  });
}

async function createDefinitionObject(request, env, mapId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  const body = await readBody(request);
  const map = await mapTemplate(env, mapId);
  if (!map) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  if (map.status !== 'active') return apiError('Archived Map Template 不可新增 Object。', 409, 'MAP_TEMPLATE_ARCHIVED');
  const expectedVersion = integer(body.expectedVersion, 'expectedVersion');
  if (expectedVersion !== Number(map.version)) return apiError('Map Template 已更新，請重新載入。', 409, 'MAP_TEMPLATE_CHANGED');
  const definition = normalizeDefinitionBody(body);
  const position = await validateDefinitionPosition(env, mapId, map, body.x, body.y);
  const id = `object_${crypto.randomUUID()}`;
  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO map_objects (
        id, map_template_id, name, x, y, object_type, player_visible_default,
        interactable_default, interaction_range, single_use, initial_state_key,
        gm_notes, created_by_user_id, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM map_templates WHERE id = ? AND version = ? AND status = 'active'
      )
    `).bind(
      id, mapId, definition.name, position.x, position.y, definition.objectType,
      definition.playerVisibleDefault, definition.interactableDefault, definition.interactionRange,
      definition.singleUse, definition.initialStateKey, definition.gmNotes, user.id, now, now,
      mapId, expectedVersion
    ),
    env.DB.prepare(`
      UPDATE map_templates SET version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status = 'active'
    `).bind(now, mapId, expectedVersion)
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    return apiError('Map Template 已更新，Object 未建立。', 409, 'MAP_TEMPLATE_CHANGED');
  }
  const row = await env.DB.prepare('SELECT * FROM map_objects WHERE id = ?').bind(id).first();
  return json({ ok: true, object: definitionPayload(row), mapVersion: expectedVersion + 1 }, 201);
}

async function updateDefinitionObject(request, env, mapId, objectId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  const body = await readBody(request);
  const map = await mapTemplate(env, mapId);
  if (!map) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  if (map.status !== 'active') return apiError('Archived Map Template 不可編輯 Object。', 409, 'MAP_TEMPLATE_ARCHIVED');
  const expectedVersion = integer(body.expectedVersion, 'expectedVersion');
  if (expectedVersion !== Number(map.version)) return apiError('Map Template 已更新，請重新載入。', 409, 'MAP_TEMPLATE_CHANGED');
  const existing = await env.DB.prepare(`
    SELECT * FROM map_objects WHERE id = ? AND map_template_id = ? LIMIT 1
  `).bind(objectId, mapId).first();
  if (!existing) return apiError('Map Object 不存在。', 404, 'MAP_OBJECT_NOT_FOUND');
  const definition = normalizeDefinitionBody({
    name: body.name ?? existing.name,
    objectType: body.objectType ?? existing.object_type,
    playerVisibleDefault: body.playerVisibleDefault ?? Boolean(existing.player_visible_default),
    interactableDefault: body.interactableDefault ?? Boolean(existing.interactable_default),
    interactionRange: body.interactionRange ?? Number(existing.interaction_range),
    singleUse: body.singleUse ?? Boolean(existing.single_use),
    initialStateKey: body.initialStateKey ?? existing.initial_state_key,
    gmNotes: body.gmNotes ?? existing.gm_notes
  });
  const position = await validateDefinitionPosition(env, mapId, map, body.x ?? existing.x, body.y ?? existing.y);
  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE map_objects
      SET name = ?, x = ?, y = ?, object_type = ?, player_visible_default = ?,
          interactable_default = ?, interaction_range = ?, single_use = ?, initial_state_key = ?,
          gm_notes = ?, updated_at = ?
      WHERE id = ? AND map_template_id = ?
        AND EXISTS (SELECT 1 FROM map_templates WHERE id = ? AND version = ? AND status = 'active')
    `).bind(
      definition.name, position.x, position.y, definition.objectType,
      definition.playerVisibleDefault, definition.interactableDefault, definition.interactionRange,
      definition.singleUse, definition.initialStateKey, definition.gmNotes, now,
      objectId, mapId, mapId, expectedVersion
    ),
    env.DB.prepare(`
      UPDATE map_templates SET version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status = 'active'
    `).bind(now, mapId, expectedVersion)
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    return apiError('Map Template 已更新，Object 未修改。', 409, 'MAP_TEMPLATE_CHANGED');
  }
  const row = await env.DB.prepare('SELECT * FROM map_objects WHERE id = ?').bind(objectId).first();
  return json({ ok: true, object: definitionPayload(row), mapVersion: expectedVersion + 1 });
}

async function deleteDefinitionObject(request, env, mapId, objectId) {
  if (request.method !== 'DELETE') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  const body = await readBody(request);
  const map = await mapTemplate(env, mapId);
  if (!map) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  const expectedVersion = integer(body.expectedVersion, 'expectedVersion');
  if (expectedVersion !== Number(map.version)) return apiError('Map Template 已更新，請重新載入。', 409, 'MAP_TEMPLATE_CHANGED');
  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM map_objects
      WHERE id = ? AND map_template_id = ?
        AND EXISTS (SELECT 1 FROM map_templates WHERE id = ? AND version = ? AND status = 'active')
    `).bind(objectId, mapId, mapId, expectedVersion),
    env.DB.prepare(`
      UPDATE map_templates SET version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status = 'active'
    `).bind(now, mapId, expectedVersion)
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    return apiError('Map Object 不存在或 Template 已更新。', 409, 'MAP_OBJECT_DELETE_CONFLICT');
  }
  return json({ ok: true, deletedObjectId: objectId, mapVersion: expectedVersion + 1 });
}

async function playerMapContext(request, env, characterId) {
  const response = await baseWorker.fetch(new Request(new URL(`/api/player/world/characters/${encodeURIComponent(characterId)}`, request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || 'Player Map context unavailable.'), {
      status: response.status,
      code: payload?.error?.code || 'PLAYER_MAP_CONTEXT_UNAVAILABLE'
    });
  }
  return payload;
}

async function activeRest(env, characterId) {
  try {
    return await env.DB.prepare(`
      SELECT rest_session_id FROM character_rest_state WHERE character_id = ? AND status = 'active' LIMIT 1
    `).bind(characterId).first();
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (message.includes('no such table') && message.includes('character_rest_state')) return null;
    throw error;
  }
}

async function edgeBlocks(env, mapInstanceId, x, y, direction, width, height) {
  let slotX = x;
  let slotY = y;
  let slotDirection = direction;
  if (direction === 'E' && x < width - 1) {
    slotX = x + 1;
    slotDirection = 'W';
  } else if (direction === 'S' && y < height - 1) {
    slotY = y + 1;
    slotDirection = 'N';
  }
  const row = await env.DB.prepare(`
    SELECT blocks_movement FROM runtime_map_edges
    WHERE map_instance_id = ? AND x = ? AND y = ? AND direction = ? LIMIT 1
  `).bind(mapInstanceId, slotX, slotY, slotDirection).first();
  return Boolean(row?.blocks_movement);
}

async function cellWalkable(env, mapInstanceId, x, y, width, height) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const row = await env.DB.prepare(`
    SELECT is_walkable FROM runtime_map_cells WHERE map_instance_id = ? AND x = ? AND y = ? LIMIT 1
  `).bind(mapInstanceId, x, y).first();
  return row ? Boolean(row.is_walkable) : true;
}

function directionBetween(fromX, fromY, toX, toY) {
  if (toX === fromX + 1 && toY === fromY) return 'E';
  if (toX === fromX - 1 && toY === fromY) return 'W';
  if (toX === fromX && toY === fromY + 1) return 'S';
  if (toX === fromX && toY === fromY - 1) return 'N';
  return '';
}

async function orthogonalLegOpen(env, mapInstanceId, fromX, fromY, toX, toY, width, height) {
  if (!(await cellWalkable(env, mapInstanceId, toX, toY, width, height))) return false;
  const direction = directionBetween(fromX, fromY, toX, toY);
  if (!direction) return false;
  return !(await edgeBlocks(env, mapInstanceId, fromX, fromY, direction, width, height));
}

async function interactionReachable(env, context, object) {
  const fromX = Number(context.position.x);
  const fromY = Number(context.position.y);
  const toX = Number(object.x);
  const toY = Number(object.y);
  const range = Number(object.interaction_range);
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > range) return false;
  if (dx === 0 && dy === 0) return true;
  if (range === 0) return false;
  const width = Number(context.map.width);
  const height = Number(context.map.height);
  if (dx === 0 || dy === 0) {
    const direction = directionBetween(fromX, fromY, toX, toY);
    return direction
      ? !(await edgeBlocks(env, object.map_instance_id, fromX, fromY, direction, width, height))
      : false;
  }
  if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) return false;
  const viaHorizontal = (await orthogonalLegOpen(env, object.map_instance_id, fromX, fromY, toX, fromY, width, height))
    && (await orthogonalLegOpen(env, object.map_instance_id, toX, fromY, toX, toY, width, height));
  const viaVertical = (await orthogonalLegOpen(env, object.map_instance_id, fromX, fromY, fromX, toY, width, height))
    && (await orthogonalLegOpen(env, object.map_instance_id, fromX, toY, toX, toY, width, height));
  return viaHorizontal || viaVertical;
}

async function loadRuntimeObject(env, mapInstanceId, objectId) {
  return env.DB.prepare(`
    SELECT rmo.*, rmi.scene_run_id, rmi.scene_id, rmi.status AS map_status
    FROM runtime_map_objects rmo
    JOIN runtime_map_instances rmi ON rmi.id = rmo.map_instance_id
    WHERE rmo.id = ? AND rmo.map_instance_id = ?
    LIMIT 1
  `).bind(objectId, mapInstanceId).first();
}

function interactionAvailability({ context, object, resting, reachable }) {
  if (!object.player_visible) return { canInteract: false, reason: 'OBJECT_HIDDEN' };
  if (!object.interactable) return { canInteract: false, reason: 'OBJECT_NOT_INTERACTABLE' };
  if (resting) return { canInteract: false, reason: 'CHARACTER_RESTING' };
  if (!reachable) return { canInteract: false, reason: 'OBJECT_OUT_OF_REACH' };
  if (context.character?.status !== 'active' || context.character?.lifeState !== 'alive' || context.character?.characterLocked) {
    return { canInteract: false, reason: 'CHARACTER_ACTION_LOCKED' };
  }
  if (!context.turn?.isOwnTurn) return { canInteract: false, reason: 'NOT_OWN_TURN' };
  if (!context.turn?.actionAvailable) return { canInteract: false, reason: 'ACTION_ALREADY_SPENT' };
  return { canInteract: true, reason: null };
}

async function listPlayerObjects(request, env, characterId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireUser(request, env);
  await ensureRuntimeObjectAuthority(env);
  const context = await playerMapContext(request, env, characterId);
  if (!context.map) return json({ ok: true, characterId, map: null, objects: [] });
  const rows = await env.DB.prepare(`
    SELECT * FROM runtime_map_objects
    WHERE map_instance_id = ? AND player_visible = 1
    ORDER BY y, x, name_snapshot, id
  `).bind(context.map.id).all();
  const resting = Boolean(await activeRest(env, characterId));
  const objects = [];
  for (const row of rows.results || []) {
    const reachable = await interactionReachable(env, context, row);
    const availability = interactionAvailability({ context, object: row, resting, reachable });
    objects.push({
      ...runtimePayload(row),
      reachable,
      canInteract: availability.canInteract,
      interactionBlockedReason: availability.reason
    });
  }
  return json({
    ok: true,
    characterId,
    map: { id: context.map.id, sceneRunId: context.map.sceneRunId },
    position: context.position,
    turn: context.turn,
    resting,
    objects
  });
}

function eventIdentity(event) {
  return [event?.triggerType || '', event?.occurrenceId || '', event?.eventId || '', event?.executionId || '', event?.status || ''].join(':');
}

function lifecycleGroups(events) {
  const seen = new Set();
  const all = [];
  for (const event of events || []) {
    const id = eventIdentity(event);
    if (seen.has(id)) continue;
    seen.add(id);
    all.push(event);
  }
  return {
    storyLifecycleEvents: all,
    interactObjectStoryEvents: all.filter(event => event?.triggerType === 'interact_object'),
    encounterActivatedStoryEvents: all.filter(event => event?.triggerType === 'encounter_activated'),
    combatStartedStoryEvents: all.filter(event => event?.triggerType === 'combat_started'),
    combatEndedStoryEvents: all.filter(event => event?.triggerType === 'combat_ended'),
    encounterResolvedStoryEvents: all.filter(event => event?.triggerType === 'encounter_resolved'),
    flagChangedStoryEvents: all.filter(event => event?.triggerType === 'flag_changed')
  };
}

async function interactWithObject(request, env, characterId, objectId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  await ensureRuntimeObjectAuthority(env);
  await readBody(request);
  const context = await playerMapContext(request, env, characterId);
  if (!context.map) return apiError('Character 尚未放置於 Active Runtime Map。', 409, 'CHARACTER_NOT_POSITIONED');
  const object = await loadRuntimeObject(env, context.map.id, objectId);
  if (!object || object.map_status !== 'active') return apiError('Runtime Object 不存在。', 404, 'RUNTIME_OBJECT_NOT_FOUND');
  const resting = Boolean(await activeRest(env, characterId));
  const reachable = await interactionReachable(env, context, object);
  const availability = interactionAvailability({ context, object, resting, reachable });
  if (!availability.canInteract) {
    const messages = {
      OBJECT_HIDDEN: 'Object 對 Player 不可見。',
      OBJECT_NOT_INTERACTABLE: 'Object 目前不可互動。',
      CHARACTER_RESTING: 'Rest 中的 Character 不可進行一般 Object Interaction。',
      OBJECT_OUT_OF_REACH: 'Object 不在可互動距離，或被牆／關閉門阻隔。',
      CHARACTER_ACTION_LOCKED: 'Character 目前不可使用一般 Action。',
      NOT_OWN_TURN: '而家唔係呢個 Character 可以行動的時機。',
      ACTION_ALREADY_SPENT: '呢個 Round / Turn 嘅 Action 已經使用。'
    };
    return apiError(messages[availability.reason] || 'Object Interaction 不可用。', 409, availability.reason || 'OBJECT_INTERACTION_BLOCKED');
  }

  const now = Date.now();
  const interactionId = `runtime_object_interaction_${crypto.randomUUID()}`;
  const toState = Boolean(object.single_use) ? 'used' : object.state_key;
  let result;
  if (context.turn.mode === 'combat') {
    const combatId = context.turn.combatId;
    result = await env.DB.prepare(`
      INSERT INTO runtime_object_interaction_log (
        id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
        character_id, actor_user_id, interaction_mode, exploration_round_number,
        combat_id, combat_round_number, from_state_key, to_state_key,
        object_interaction_count_before, created_at
      )
      SELECT ?, rmi.scene_run_id, rmo.map_instance_id, rmo.id, rmo.source_object_id,
             ?, ?, 'combat', NULL, c.id, c.round_number, rmo.state_key, ?, rmo.interaction_count, ?
      FROM runtime_map_objects rmo
      JOIN runtime_map_instances rmi ON rmi.id = rmo.map_instance_id AND rmi.status = 'active'
      JOIN runtime_entity_positions rep ON rep.map_instance_id = rmo.map_instance_id
        AND rep.entity_type = 'character' AND rep.entity_id = ?
      JOIN combats c ON c.id = ? AND c.status = 'active'
      JOIN combatants cb ON cb.combat_id = c.id AND cb.entity_type = 'character'
        AND cb.entity_id = ? AND cb.controller_user_id = ?
      WHERE rmo.id = ? AND rmo.map_instance_id = ? AND rmo.player_visible = 1 AND rmo.interactable = 1
        AND rmo.updated_at = ? AND rep.x = ? AND rep.y = ?
        AND cb.action_available = 1 AND cb.turn_completed = 0
        AND cb.initiative_order = c.current_turn_index AND c.round_number = ?
    `).bind(
      interactionId, characterId, user.id, toState, now,
      characterId, combatId, characterId, user.id,
      object.id, context.map.id, object.updated_at,
      Number(context.position.x), Number(context.position.y), Number(context.turn.roundNumber)
    ).run();
  } else {
    result = await env.DB.prepare(`
      INSERT INTO runtime_object_interaction_log (
        id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
        character_id, actor_user_id, interaction_mode, exploration_round_number,
        combat_id, combat_round_number, from_state_key, to_state_key,
        object_interaction_count_before, created_at
      )
      SELECT ?, rmi.scene_run_id, rmo.map_instance_id, rmo.id, rmo.source_object_id,
             ?, ?, 'exploration', es.round_number, NULL, NULL, rmo.state_key, ?, rmo.interaction_count, ?
      FROM runtime_map_objects rmo
      JOIN runtime_map_instances rmi ON rmi.id = rmo.map_instance_id AND rmi.status = 'active'
      JOIN runtime_entity_positions rep ON rep.map_instance_id = rmo.map_instance_id
        AND rep.entity_type = 'character' AND rep.entity_id = ?
      JOIN runtime_exploration_state es ON es.map_instance_id = rmo.map_instance_id
      JOIN runtime_exploration_character_state ecs ON ecs.map_instance_id = es.map_instance_id
        AND ecs.character_id = ? AND ecs.round_number = es.round_number
      WHERE rmo.id = ? AND rmo.map_instance_id = ? AND rmo.player_visible = 1 AND rmo.interactable = 1
        AND rmo.updated_at = ? AND rep.x = ? AND rep.y = ?
        AND ecs.action_available = 1 AND ecs.turn_completed = 0 AND es.round_number = ?
        AND NOT EXISTS (SELECT 1 FROM combats WHERE status = 'active')
    `).bind(
      interactionId, characterId, user.id, toState, now,
      characterId, characterId,
      object.id, context.map.id, object.updated_at,
      Number(context.position.x), Number(context.position.y), Number(context.turn.roundNumber)
    ).run();
  }
  if (Number(result?.meta?.changes || 0) !== 1) {
    return apiError('Action / Object state 已改變；Interaction 未完成，請重新載入。', 409, 'OBJECT_INTERACTION_STATE_CHANGED');
  }

  let objectEvents = [];
  let genericEvents = [];
  let storyLifecycleWarning = null;
  try {
    objectEvents = await processPendingObjectStoryEvents(env, { sceneRunId: object.scene_run_id });
    genericEvents = await processPendingRuntimeStoryLifecycleEvents(env, { sceneRunId: object.scene_run_id });
  } catch (error) {
    console.error('Runtime Object Story lifecycle drain failed after committed interaction', {
      interactionId,
      code: error?.code || null,
      message: String(error?.message || error)
    });
    storyLifecycleWarning = { code: error?.code || 'STORY_LIFECYCLE_DRAIN_ERROR' };
  }
  const updated = await loadRuntimeObject(env, context.map.id, object.id);
  return json({
    ok: true,
    interaction: {
      id: interactionId,
      characterId,
      runtimeObjectId: object.id,
      sourceObjectId: object.source_object_id,
      interactionMode: context.turn.mode,
      roundNumber: Number(context.turn.roundNumber),
      fromStateKey: object.state_key,
      toStateKey: updated?.state_key || toState,
      actionSpent: true,
      createdAt: now
    },
    object: runtimePayload(updated),
    ...lifecycleGroups([...objectEvents, ...genericEvents]),
    ...(storyLifecycleWarning ? { storyLifecycleWarning } : {})
  });
}

async function listRuntimeObjects(request, env, mapId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  const map = await env.DB.prepare(`SELECT id, scene_run_id, status FROM runtime_map_instances WHERE id = ? LIMIT 1`).bind(mapId).first();
  if (!map) return apiError('Runtime Map 不存在。', 404, 'RUNTIME_MAP_NOT_FOUND');
  const rows = await env.DB.prepare(`SELECT * FROM runtime_map_objects WHERE map_instance_id = ? ORDER BY y, x, name_snapshot, id`).bind(mapId).all();
  return json({ ok: true, mapInstanceId: mapId, sceneRunId: map.scene_run_id, mapStatus: map.status, objects: (rows.results || []).map(runtimePayload) });
}

async function patchRuntimeObject(request, env, mapId, objectId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  const body = await readBody(request);
  const existing = await loadRuntimeObject(env, mapId, objectId);
  if (!existing) return apiError('Runtime Object 不存在。', 404, 'RUNTIME_OBJECT_NOT_FOUND');
  if (existing.map_status !== 'active') return apiError('Closed Runtime Map 不可修改 Object。', 409, 'RUNTIME_MAP_CLOSED');
  const nextState = body.stateKey === undefined ? existing.state_key : stateKey(body.stateKey);
  const nextVisible = body.playerVisible === undefined ? Number(existing.player_visible) : boolInt(body.playerVisible);
  const nextInteractable = body.interactable === undefined ? Number(existing.interactable) : boolInt(body.interactable);
  const now = Date.now();
  const stateLogId = `runtime_object_state_${crypto.randomUUID()}`;
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE runtime_map_objects
      SET state_key = ?, player_visible = ?, interactable = ?, updated_at = ?
      WHERE id = ? AND map_instance_id = ? AND updated_at = ?
        AND EXISTS (SELECT 1 FROM runtime_map_instances WHERE id = ? AND status = 'active')
    `).bind(nextState, nextVisible, nextInteractable, now, objectId, mapId, existing.updated_at, mapId),
    env.DB.prepare(`
      INSERT INTO runtime_object_state_log (
        id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
        from_state_key, to_state_key, change_reason, changed_by_user_id, interaction_id, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, 'gm_override', ?, NULL, ?
      WHERE ? IS NOT ? AND EXISTS (
        SELECT 1 FROM runtime_map_objects WHERE id = ? AND map_instance_id = ? AND updated_at = ?
      )
    `).bind(
      stateLogId, existing.scene_run_id, mapId, objectId, existing.source_object_id,
      existing.state_key, nextState, user.id, now,
      existing.state_key, nextState, objectId, mapId, now
    )
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
    return apiError('Runtime Object state 已改變，請重新載入。', 409, 'RUNTIME_OBJECT_STATE_CHANGED');
  }
  const updated = await loadRuntimeObject(env, mapId, objectId);
  return json({ ok: true, object: runtimePayload(updated), stateAuditId: existing.state_key === nextState ? null : stateLogId });
}

async function enrichRuntimeMapDetail(request, env, mapId) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok || request.method !== 'GET') return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;
  await ensureRuntimeObjectAuthority(env);
  const payload = await response.json();
  const rows = await env.DB.prepare(`SELECT * FROM runtime_map_objects WHERE map_instance_id = ? ORDER BY y, x, name_snapshot, id`).bind(mapId).all();
  return json({ ...payload, runtimeObjects: (rows.results || []).map(runtimePayload) }, response.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    try {
      const definitionCollection = pathname.match(/^\/api\/gm\/world\/maps\/([^/]+)\/objects$/);
      if (definitionCollection) {
        const mapId = decodeURIComponent(definitionCollection[1]);
        if (request.method === 'GET') return await listDefinitionObjects(request, env, mapId);
        if (request.method === 'POST') return await createDefinitionObject(request, env, mapId);
        return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
      }

      const definitionItem = pathname.match(/^\/api\/gm\/world\/maps\/([^/]+)\/objects\/([^/]+)$/);
      if (definitionItem) {
        const mapId = decodeURIComponent(definitionItem[1]);
        const objectId = decodeURIComponent(definitionItem[2]);
        if (request.method === 'PATCH') return await updateDefinitionObject(request, env, mapId, objectId);
        if (request.method === 'DELETE') return await deleteDefinitionObject(request, env, mapId, objectId);
        return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
      }

      const playerObjects = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/objects$/);
      if (playerObjects) return await listPlayerObjects(request, env, decodeURIComponent(playerObjects[1]));

      const playerInteraction = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/objects\/([^/]+)\/interact$/);
      if (playerInteraction) {
        return await interactWithObject(
          request,
          env,
          decodeURIComponent(playerInteraction[1]),
          decodeURIComponent(playerInteraction[2])
        );
      }

      const runtimeObjects = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/objects$/);
      if (runtimeObjects) return await listRuntimeObjects(request, env, decodeURIComponent(runtimeObjects[1]));

      const runtimeObjectItem = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/objects\/([^/]+)$/);
      if (runtimeObjectItem) {
        return await patchRuntimeObject(request, env, decodeURIComponent(runtimeObjectItem[1]), decodeURIComponent(runtimeObjectItem[2]));
      }

      const runtimeMapDetail = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)$/);
      if (runtimeMapDetail && request.method === 'GET') {
        return await enrichRuntimeMapDetail(request, env, decodeURIComponent(runtimeMapDetail[1]));
      }

      if (pathname === '/api/gm/world/runtime/scene-runs' && request.method === 'POST') {
        await ensureRuntimeObjectAuthority(env);
      }
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Runtime Object API error', {
        path: pathname,
        code: error?.code || null,
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message || 'Runtime Object request failed.', error.status, error.code || 'RUNTIME_OBJECT_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Runtime Object service 暫時無法使用。', 500, 'RUNTIME_OBJECT_SERVICE_ERROR');
    }
  }
};

export { ensureRuntimeObjectAuthority };
