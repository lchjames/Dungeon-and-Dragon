import baseWorker from './runtime-story-lifecycle-gateway.js';

const GM_ROLES = new Set(['gm', 'admin']);
const OBJECT_TYPE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const OBJECT_ID_PATTERN = /^object_[A-Za-z0-9_-]{8,120}$/;
const MAX_OBJECTS = 5000;
const MAX_STATE_JSON = 10000;
let schemaPromise = null;

function json(data, status = 200, sourceHeaders = null) {
  const headers = new Headers(sourceHeaders || undefined);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}

function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
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

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function checkedState(value) {
  const state = value == null ? {} : value;
  if (!plainObject(state)) {
    throw Object.assign(new Error('Object initial state 必須為 JSON object。'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  const encoded = JSON.stringify(state);
  if (encoded.length > MAX_STATE_JSON) {
    throw Object.assign(new Error('Object initial state 過大。'), { status: 400, code: 'OBJECT_STATE_TOO_LARGE' });
  }
  return { value: state, encoded };
}

function parseState(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return plainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
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

async function currentUser(request, env) {
  const authRequest = new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
  });
  const response = await baseWorker.fetch(authRequest, env);
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.user || null;
}

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function ensureDownstreamRuntimeSchema(request, env) {
  const internal = new Request(new URL('/api/gm/world/runtime', request.url), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
  });
  const response = await baseWorker.fetch(internal, env);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw Object.assign(new Error(payload?.error?.message || 'Runtime Map schema unavailable.'), {
      status: response.status,
      code: payload?.error?.code || 'RUNTIME_MAP_SCHEMA_UNAVAILABLE'
    });
  }
}

async function ensureObjectSchema(request, env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await ensureDownstreamRuntimeSchema(request, env);
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_objects (
          id TEXT PRIMARY KEY,
          map_template_id TEXT NOT NULL,
          name TEXT NOT NULL,
          object_type TEXT NOT NULL DEFAULT 'prop',
          x INTEGER NOT NULL,
          y INTEGER NOT NULL,
          interaction_range INTEGER NOT NULL DEFAULT 1 CHECK (interaction_range BETWEEN 1 AND 20),
          player_visible_default INTEGER NOT NULL DEFAULT 1 CHECK (player_visible_default IN (0, 1)),
          enabled_default INTEGER NOT NULL DEFAULT 1 CHECK (enabled_default IN (0, 1)),
          initial_state_json TEXT NOT NULL DEFAULT '{}',
          gm_notes TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE (map_template_id, name),
          FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_map_objects (
          id TEXT PRIMARY KEY,
          map_instance_id TEXT NOT NULL,
          source_object_id TEXT NOT NULL,
          name_snapshot TEXT NOT NULL,
          object_type TEXT NOT NULL DEFAULT 'prop',
          x INTEGER NOT NULL,
          y INTEGER NOT NULL,
          interaction_range INTEGER NOT NULL DEFAULT 1 CHECK (interaction_range BETWEEN 1 AND 20),
          player_visible INTEGER NOT NULL DEFAULT 1 CHECK (player_visible IN (0, 1)),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          state_json TEXT NOT NULL DEFAULT '{}',
          gm_notes TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE (map_instance_id, source_object_id),
          FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_map_objects_template ON map_objects(map_template_id, y, x, object_type, name)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_map_objects_map ON runtime_map_objects(map_instance_id, y, x, object_type, enabled)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_map_objects_source ON runtime_map_objects(source_object_id, map_instance_id)'),
        env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_map_object_snapshot
          AFTER INSERT ON runtime_map_instances
          BEGIN
            INSERT INTO runtime_map_objects
              (id, map_instance_id, source_object_id, name_snapshot, object_type, x, y,
               interaction_range, player_visible, enabled, state_json, gm_notes,
               created_at, updated_at)
            SELECT 'runtime_object_' || lower(hex(randomblob(16))), NEW.id, mo.id, mo.name,
                   mo.object_type, mo.x, mo.y, mo.interaction_range,
                   mo.player_visible_default, mo.enabled_default, mo.initial_state_json,
                   mo.gm_notes, NEW.created_at, NEW.created_at
            FROM map_objects mo
            WHERE mo.map_template_id = NEW.map_template_id;
          END`)
      ]);
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function mapTemplate(env, mapId) {
  return env.DB.prepare(`
    SELECT mt.id, mt.name, mt.location_id, mt.width, mt.height, mt.version,
           mt.status, mt.updated_at, wl.name AS location_name
    FROM map_templates mt
    JOIN world_locations wl ON wl.id = mt.location_id
    WHERE mt.id = ?
    LIMIT 1
  `).bind(mapId).first();
}

function definitionObjectPayload(row) {
  return {
    id: row.id,
    name: row.name,
    objectType: row.object_type || 'prop',
    x: Number(row.x),
    y: Number(row.y),
    interactionRange: Number(row.interaction_range || 1),
    playerVisibleDefault: Boolean(row.player_visible_default),
    enabledDefault: Boolean(row.enabled_default),
    initialState: parseState(row.initial_state_json),
    gmNotes: row.gm_notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function runtimeObjectPayload(row) {
  return {
    id: row.id,
    sourceObjectId: row.source_object_id,
    name: row.name_snapshot,
    objectType: row.object_type || 'prop',
    x: Number(row.x),
    y: Number(row.y),
    interactionRange: Number(row.interaction_range || 1),
    playerVisible: Boolean(row.player_visible),
    enabled: Boolean(row.enabled),
    state: parseState(row.state_json),
    gmNotes: row.gm_notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeObjects(value, width, height) {
  if (!Array.isArray(value)) {
    throw Object.assign(new Error('objects 必須為 array。'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  if (value.length > MAX_OBJECTS) {
    throw Object.assign(new Error('Map Object 數量過多。'), { status: 413, code: 'MAP_OBJECT_LIMIT_EXCEEDED' });
  }
  const ids = new Set();
  const names = new Set();
  return value.map(raw => {
    const suppliedId = cleanText(raw?.id, 140);
    const id = suppliedId || `object_${crypto.randomUUID()}`;
    if (!OBJECT_ID_PATTERN.test(id)) {
      throw Object.assign(new Error('Object ID 格式錯誤。'), { status: 400, code: 'VALIDATION_ERROR' });
    }
    if (ids.has(id)) throw Object.assign(new Error('Object ID 不可重複。'), { status: 400, code: 'VALIDATION_ERROR' });
    ids.add(id);

    const name = cleanText(raw?.name, 120);
    if (!name) throw Object.assign(new Error('Object Name 必須填寫。'), { status: 400, code: 'VALIDATION_ERROR' });
    const nameKey = name.toLocaleLowerCase();
    if (names.has(nameKey)) throw Object.assign(new Error('Object Name 不可重複。'), { status: 400, code: 'VALIDATION_ERROR' });
    names.add(nameKey);

    const objectType = cleanText(raw?.objectType || 'prop', 80).toLowerCase() || 'prop';
    if (!OBJECT_TYPE_PATTERN.test(objectType)) {
      throw Object.assign(new Error('Object Type 只可使用小寫英數、_、-。'), { status: 400, code: 'VALIDATION_ERROR' });
    }
    const x = integer(raw?.x, 'Object X');
    const y = integer(raw?.y, 'Object Y');
    if (x < 0 || y < 0 || x >= width || y >= height) {
      throw Object.assign(new Error(`Object ${name} 超出 Map 範圍。`), { status: 400, code: 'MAP_COORDINATE_OUT_OF_BOUNDS' });
    }
    const interactionRange = integer(raw?.interactionRange ?? 1, 'Interaction Range');
    if (interactionRange < 1 || interactionRange > 20) {
      throw Object.assign(new Error('Interaction Range 必須為 1–20。'), { status: 400, code: 'VALIDATION_ERROR' });
    }
    const state = checkedState(raw?.initialState);
    return {
      id,
      name,
      objectType,
      x,
      y,
      interactionRange,
      playerVisibleDefault: boolInt(raw?.playerVisibleDefault, true),
      enabledDefault: boolInt(raw?.enabledDefault, true),
      initialState: state.value,
      initialStateJson: state.encoded,
      gmNotes: cleanText(raw?.gmNotes, 2000)
    };
  });
}

async function loadDefinitionObjects(request, env, mapId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureObjectSchema(request, env);
  const template = await mapTemplate(env, mapId);
  if (!template) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  const objects = await env.DB.prepare(`
    SELECT * FROM map_objects WHERE map_template_id = ? ORDER BY created_at, id
  `).bind(mapId).all();
  return json({
    ok: true,
    mapTemplate: {
      id: template.id,
      name: template.name,
      locationId: template.location_id,
      locationName: template.location_name,
      width: Number(template.width),
      height: Number(template.height),
      version: Number(template.version),
      status: template.status,
      updatedAt: template.updated_at
    },
    objects: (objects.results || []).map(definitionObjectPayload)
  });
}

async function saveDefinitionObjects(request, env, mapId) {
  if (request.method !== 'PUT') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureObjectSchema(request, env);
  const template = await mapTemplate(env, mapId);
  if (!template) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  if (template.status !== 'active') return apiError('Archived Map Template 不可編輯。', 409, 'MAP_TEMPLATE_ARCHIVED');

  const body = await readBody(request);
  const expectedVersion = integer(body.expectedVersion, 'expectedVersion');
  if (expectedVersion !== Number(template.version)) {
    return apiError('Map Template 已被其他操作更新。請 Reload Objects 後再編輯。', 409, 'MAP_TEMPLATE_CHANGED');
  }
  const objects = normalizeObjects(body.objects || [], Number(template.width), Number(template.height));
  const objectsJson = JSON.stringify(objects);
  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM map_objects
      WHERE map_template_id = ?
        AND EXISTS (SELECT 1 FROM map_templates WHERE id = ? AND version = ?)
    `).bind(mapId, mapId, expectedVersion),
    env.DB.prepare(`
      INSERT INTO map_objects
        (id, map_template_id, name, object_type, x, y, interaction_range,
         player_visible_default, enabled_default, initial_state_json, gm_notes,
         created_at, updated_at)
      SELECT json_extract(value, '$.id'), ?,
             json_extract(value, '$.name'),
             json_extract(value, '$.objectType'),
             CAST(json_extract(value, '$.x') AS INTEGER),
             CAST(json_extract(value, '$.y') AS INTEGER),
             CAST(json_extract(value, '$.interactionRange') AS INTEGER),
             CAST(json_extract(value, '$.playerVisibleDefault') AS INTEGER),
             CAST(json_extract(value, '$.enabledDefault') AS INTEGER),
             json_extract(value, '$.initialStateJson'),
             json_extract(value, '$.gmNotes'), ?, ?
      FROM json_each(?)
      WHERE EXISTS (SELECT 1 FROM map_templates WHERE id = ? AND version = ?)
    `).bind(mapId, now, now, objectsJson, mapId, expectedVersion),
    env.DB.prepare(`
      UPDATE map_templates SET version = version + 1, updated_at = ?
      WHERE id = ? AND version = ?
    `).bind(now, mapId, expectedVersion)
  ]);
  const changed = Number(results?.[2]?.meta?.changes || 0);
  if (changed !== 1) {
    return apiError('Map Template 已被其他操作更新。請 Reload Objects 後再編輯。', 409, 'MAP_TEMPLATE_CHANGED');
  }
  return loadDefinitionObjects(new Request(request.url, { method: 'GET', headers: request.headers }), env, mapId);
}

async function runtimeObjects(env, mapInstanceId) {
  const rows = await env.DB.prepare(`
    SELECT * FROM runtime_map_objects
    WHERE map_instance_id = ?
    ORDER BY y, x, created_at, id
  `).bind(mapInstanceId).all();
  return (rows.results || []).map(runtimeObjectPayload);
}

async function loadRuntimeObjects(request, env, mapInstanceId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureObjectSchema(request, env);
  const map = await env.DB.prepare(`
    SELECT id, map_name_snapshot, scene_id, scene_run_id, status, width, height,
           source_map_version
    FROM runtime_map_instances WHERE id = ? LIMIT 1
  `).bind(mapInstanceId).first();
  if (!map) return apiError('Runtime Map 不存在。', 404, 'RUNTIME_MAP_NOT_FOUND');
  return json({
    ok: true,
    mapInstance: {
      id: map.id,
      mapName: map.map_name_snapshot,
      sceneId: map.scene_id,
      sceneRunId: map.scene_run_id,
      status: map.status,
      width: Number(map.width),
      height: Number(map.height),
      sourceMapVersion: Number(map.source_map_version)
    },
    objects: await runtimeObjects(env, mapInstanceId)
  });
}

async function augmentRuntimeResponse(response, env) {
  if (!response.ok || !(response.headers.get('Content-Type') || '').includes('application/json')) return response;
  const payload = await response.json().catch(() => null);
  const mapInstanceId = payload?.mapInstance?.id;
  if (!mapInstanceId) return json(payload, response.status, response.headers);
  return json({ ...payload, objects: await runtimeObjects(env, mapInstanceId) }, response.status, response.headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const definitionMatch = pathname.match(/^\/api\/gm\/world\/maps\/([^/]+)\/objects$/);
    const runtimeObjectsMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/objects$/);
    const runtimeDetailMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)$/);
    const startsRuntime = pathname === '/api/gm/world/runtime/scene-runs' && request.method === 'POST';

    try {
      if (definitionMatch) {
        const mapId = decodeURIComponent(definitionMatch[1]);
        if (request.method === 'GET') return await loadDefinitionObjects(request, env, mapId);
        if (request.method === 'PUT') return await saveDefinitionObjects(request, env, mapId);
        return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
      }
      if (runtimeObjectsMatch) {
        return await loadRuntimeObjects(request, env, decodeURIComponent(runtimeObjectsMatch[1]));
      }
      if (startsRuntime || (runtimeDetailMatch && request.method === 'GET')) {
        await ensureObjectSchema(request, env);
        const response = await baseWorker.fetch(request, env);
        return await augmentRuntimeResponse(response, env);
      }
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Runtime Map Object gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message || 'Object request failed.', error.status, error.code || 'MAP_OBJECT_ERROR');
      if (String(error?.message || '').includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Runtime Map Object service 暫時無法使用。', 500, 'MAP_OBJECT_SERVICE_ERROR');
    }
  }
};
