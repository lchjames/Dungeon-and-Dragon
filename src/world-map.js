import baseWorker from './live-diagnostic-gateway.js';

const GM_ROLES = new Set(['gm', 'admin']);
const DEFINITION_STATUSES = new Set(['active', 'archived']);
const MAX_MAP_DIMENSION = 200;
let worldMapSchemaPromise = null;

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
  const authRequest = new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
  });
  const response = await baseWorker.fetch(authRequest, env);
  if (!response.ok) return null;
  const payload = await response.json();
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

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function requiredName(value, label = 'Name') {
  const name = cleanText(value, 120);
  if (!name) throw Object.assign(new Error(`${label} 必須填寫。`), { status: 400, code: 'VALIDATION_ERROR' });
  return name;
}

function checkedStatus(value, fallback = 'active') {
  const status = String(value || fallback).toLowerCase();
  if (!DEFINITION_STATUSES.has(status)) {
    throw Object.assign(new Error(`無效 status: ${status}`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return status;
}

function checkedDimension(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_MAP_DIMENSION) {
    throw Object.assign(new Error(`${label} 必須為 1–${MAX_MAP_DIMENSION} 的整數。`), {
      status: 400,
      code: 'VALIDATION_ERROR'
    });
  }
  return number;
}

function checkedConfig(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Scene Map Configuration 必須為 object。'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  const encoded = JSON.stringify(value);
  if (encoded.length > 20000) {
    throw Object.assign(new Error('Scene Map Configuration 過大。'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return value;
}

async function ensureWorldMapSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!worldMapSchemaPromise) {
    worldMapSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS world_locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        gm_notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_templates (
        id TEXT PRIMARY KEY,
        location_id TEXT NOT NULL,
        name TEXT NOT NULL,
        width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 200),
        height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 200),
        background_asset_ref TEXT NOT NULL DEFAULT '',
        gm_notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (location_id) REFERENCES world_locations(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_cells (
        map_template_id TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        is_walkable INTEGER NOT NULL DEFAULT 1 CHECK (is_walkable IN (0, 1)),
        terrain_key TEXT NOT NULL DEFAULT 'floor',
        gm_notes TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (map_template_id, x, y),
        FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_edges (
        id TEXT PRIMARY KEY,
        map_template_id TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('N', 'E', 'S', 'W')),
        edge_type TEXT NOT NULL CHECK (edge_type IN ('wall', 'door')),
        blocks_movement INTEGER NOT NULL DEFAULT 1 CHECK (blocks_movement IN (0, 1)),
        door_default_state TEXT CHECK (door_default_state IS NULL OR door_default_state IN ('open', 'closed', 'locked', 'broken')),
        gm_notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (map_template_id, x, y, direction),
        FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_zones (
        id TEXT PRIMARY KEY,
        map_template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        zone_type TEXT NOT NULL DEFAULT 'area' CHECK (zone_type IN ('area', 'room', 'trigger', 'custom')),
        player_visible_default INTEGER NOT NULL DEFAULT 1 CHECK (player_visible_default IN (0, 1)),
        gm_notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_zone_cells (
        zone_id TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        PRIMARY KEY (zone_id, x, y),
        FOREIGN KEY (zone_id) REFERENCES map_zones(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS map_spawn_points (
        id TEXT PRIMARY KEY,
        map_template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        spawn_type TEXT NOT NULL DEFAULT 'any' CHECK (spawn_type IN ('any', 'character', 'monster', 'boss')),
        gm_notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (map_template_id, name),
        FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS scene_map_bindings (
        scene_id TEXT PRIMARY KEY,
        location_id TEXT NOT NULL,
        map_template_id TEXT NOT NULL,
        scene_config_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES world_locations(id) ON DELETE RESTRICT,
        FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_world_locations_status_name ON world_locations(status, name, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_map_templates_location_status ON map_templates(location_id, status, name, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_map_cells_template ON map_cells(map_template_id, y, x)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_map_edges_template ON map_edges(map_template_id, y, x, direction)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_map_zones_template ON map_zones(map_template_id, name)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_map_zone_cells_zone ON map_zone_cells(zone_id, y, x)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_map_spawn_points_template ON map_spawn_points(map_template_id, spawn_type, name)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scene_map_bindings_template ON scene_map_bindings(map_template_id, scene_id)')
    ]).catch(error => {
      worldMapSchemaPromise = null;
      throw error;
    });
  }
  await worldMapSchemaPromise;
}

function mapLocation(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    gmNotes: row.gm_notes || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTemplate(row) {
  return {
    id: row.id,
    locationId: row.location_id,
    locationName: row.location_name || '',
    name: row.name,
    width: Number(row.width),
    height: Number(row.height),
    backgroundAssetRef: row.background_asset_ref || '',
    gmNotes: row.gm_notes || '',
    status: row.status,
    version: Number(row.version || 1),
    cellOverrideCount: Number(row.cell_override_count || 0),
    edgeCount: Number(row.edge_count || 0),
    zoneCount: Number(row.zone_count || 0),
    spawnPointCount: Number(row.spawn_point_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapBinding(row) {
  let configuration = {};
  try { configuration = JSON.parse(row.scene_config_json || '{}'); } catch { configuration = {}; }
  return {
    sceneId: row.scene_id,
    sceneName: row.scene_name,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    locationId: row.location_id,
    locationName: row.location_name,
    mapTemplateId: row.map_template_id,
    mapTemplateName: row.map_template_name,
    configuration,
    updatedAt: row.updated_at
  };
}

async function overview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureWorldMapSchema(env);

  const [locations, templates, scenes, bindings] = await Promise.all([
    env.DB.prepare('SELECT * FROM world_locations ORDER BY status, name, created_at, id').all(),
    env.DB.prepare(`
      SELECT mt.*, wl.name AS location_name,
             (SELECT COUNT(*) FROM map_cells mc WHERE mc.map_template_id = mt.id) AS cell_override_count,
             (SELECT COUNT(*) FROM map_edges me WHERE me.map_template_id = mt.id) AS edge_count,
             (SELECT COUNT(*) FROM map_zones mz WHERE mz.map_template_id = mt.id) AS zone_count,
             (SELECT COUNT(*) FROM map_spawn_points sp WHERE sp.map_template_id = mt.id) AS spawn_point_count
      FROM map_templates mt
      JOIN world_locations wl ON wl.id = mt.location_id
      ORDER BY mt.status, wl.name, mt.name, mt.created_at, mt.id
    `).all(),
    env.DB.prepare(`
      SELECT s.id, s.name, s.status, s.scenario_id, sc.name AS scenario_name
      FROM scenes s
      JOIN scenarios sc ON sc.id = s.scenario_id
      ORDER BY sc.sort_order, sc.created_at, s.sort_order, s.created_at, s.id
    `).all(),
    env.DB.prepare(`
      SELECT smb.*, s.name AS scene_name, s.scenario_id, sc.name AS scenario_name,
             wl.name AS location_name, mt.name AS map_template_name
      FROM scene_map_bindings smb
      JOIN scenes s ON s.id = smb.scene_id
      JOIN scenarios sc ON sc.id = s.scenario_id
      JOIN world_locations wl ON wl.id = smb.location_id
      JOIN map_templates mt ON mt.id = smb.map_template_id
      ORDER BY sc.sort_order, s.sort_order, s.created_at, s.id
    `).all()
  ]);

  return json({
    ok: true,
    locations: (locations.results || []).map(mapLocation),
    mapTemplates: (templates.results || []).map(mapTemplate),
    scenes: (scenes.results || []).map(row => ({
      id: row.id,
      name: row.name,
      status: row.status,
      scenarioId: row.scenario_id,
      scenarioName: row.scenario_name
    })),
    sceneBindings: (bindings.results || []).map(mapBinding)
  });
}

async function createLocation(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureWorldMapSchema(env);
  const body = await readBody(request);
  const now = Date.now();
  const id = `location_${crypto.randomUUID()}`;
  const name = requiredName(body.name, 'Location Name');

  await env.DB.prepare(`
    INSERT INTO world_locations
      (id, name, description, gm_notes, status, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    name,
    cleanText(body.description, 5000),
    cleanText(body.gmNotes, 5000),
    checkedStatus(body.status),
    user.id,
    now,
    now
  ).run();

  const row = await env.DB.prepare('SELECT * FROM world_locations WHERE id = ?').bind(id).first();
  return json({ ok: true, location: mapLocation(row) }, 201);
}

async function updateLocation(request, env, id) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureWorldMapSchema(env);
  const current = await env.DB.prepare('SELECT * FROM world_locations WHERE id = ?').bind(id).first();
  if (!current) return apiError('Location 不存在。', 404, 'LOCATION_NOT_FOUND');
  const body = await readBody(request);
  const now = Date.now();

  await env.DB.prepare(`
    UPDATE world_locations
    SET name = ?, description = ?, gm_notes = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    body.name === undefined ? current.name : requiredName(body.name, 'Location Name'),
    body.description === undefined ? current.description : cleanText(body.description, 5000),
    body.gmNotes === undefined ? current.gm_notes : cleanText(body.gmNotes, 5000),
    body.status === undefined ? current.status : checkedStatus(body.status, current.status),
    now,
    id
  ).run();

  const row = await env.DB.prepare('SELECT * FROM world_locations WHERE id = ?').bind(id).first();
  return json({ ok: true, location: mapLocation(row) });
}

async function createMapTemplate(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureWorldMapSchema(env);
  const body = await readBody(request);
  const locationId = cleanText(body.locationId, 100);
  if (!locationId) return apiError('Location 必須選擇。', 400, 'VALIDATION_ERROR');
  const location = await env.DB.prepare("SELECT id FROM world_locations WHERE id = ? AND status = 'active'").bind(locationId).first();
  if (!location) return apiError('Active Location 不存在。', 404, 'LOCATION_NOT_FOUND');

  const now = Date.now();
  const id = `map_${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO map_templates
      (id, location_id, name, width, height, background_asset_ref, gm_notes, status, version,
       created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).bind(
    id,
    locationId,
    requiredName(body.name, 'Map Name'),
    checkedDimension(body.width, 'Width'),
    checkedDimension(body.height, 'Height'),
    cleanText(body.backgroundAssetRef, 2000),
    cleanText(body.gmNotes, 5000),
    checkedStatus(body.status),
    user.id,
    now,
    now
  ).run();

  const row = await env.DB.prepare(`
    SELECT mt.*, wl.name AS location_name, 0 AS cell_override_count, 0 AS edge_count,
           0 AS zone_count, 0 AS spawn_point_count
    FROM map_templates mt JOIN world_locations wl ON wl.id = mt.location_id
    WHERE mt.id = ?
  `).bind(id).first();
  return json({ ok: true, mapTemplate: mapTemplate(row) }, 201);
}

async function updateMapTemplate(request, env, id) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureWorldMapSchema(env);
  const current = await env.DB.prepare('SELECT * FROM map_templates WHERE id = ?').bind(id).first();
  if (!current) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  const body = await readBody(request);
  const locationId = body.locationId === undefined ? current.location_id : cleanText(body.locationId, 100);
  const location = await env.DB.prepare('SELECT id FROM world_locations WHERE id = ?').bind(locationId).first();
  if (!location) return apiError('Location 不存在。', 404, 'LOCATION_NOT_FOUND');

  const width = body.width === undefined ? Number(current.width) : checkedDimension(body.width, 'Width');
  const height = body.height === undefined ? Number(current.height) : checkedDimension(body.height, 'Height');
  if ((width !== Number(current.width) || height !== Number(current.height))) {
    const outside = await env.DB.prepare(`
      SELECT 1 AS found FROM (
        SELECT x, y FROM map_cells WHERE map_template_id = ?
        UNION ALL SELECT x, y FROM map_edges WHERE map_template_id = ?
        UNION ALL SELECT x, y FROM map_spawn_points WHERE map_template_id = ?
        UNION ALL
        SELECT mzc.x, mzc.y FROM map_zone_cells mzc
        JOIN map_zones mz ON mz.id = mzc.zone_id
        WHERE mz.map_template_id = ?
      ) WHERE x < 0 OR y < 0 OR x >= ? OR y >= ? LIMIT 1
    `).bind(id, id, id, id, width, height).first();
    if (outside) {
      return apiError('縮細 Map 會令現有 Cell / Edge / Zone / Spawn Point 超出範圍。請先移除或搬移相關資料。', 409, 'MAP_RESIZE_CONFLICT');
    }
  }

  const now = Date.now();
  await env.DB.prepare(`
    UPDATE map_templates
    SET location_id = ?, name = ?, width = ?, height = ?, background_asset_ref = ?,
        gm_notes = ?, status = ?, version = version + 1, updated_at = ?
    WHERE id = ?
  `).bind(
    locationId,
    body.name === undefined ? current.name : requiredName(body.name, 'Map Name'),
    width,
    height,
    body.backgroundAssetRef === undefined ? current.background_asset_ref : cleanText(body.backgroundAssetRef, 2000),
    body.gmNotes === undefined ? current.gm_notes : cleanText(body.gmNotes, 5000),
    body.status === undefined ? current.status : checkedStatus(body.status, current.status),
    now,
    id
  ).run();

  const row = await env.DB.prepare(`
    SELECT mt.*, wl.name AS location_name,
           (SELECT COUNT(*) FROM map_cells mc WHERE mc.map_template_id = mt.id) AS cell_override_count,
           (SELECT COUNT(*) FROM map_edges me WHERE me.map_template_id = mt.id) AS edge_count,
           (SELECT COUNT(*) FROM map_zones mz WHERE mz.map_template_id = mt.id) AS zone_count,
           (SELECT COUNT(*) FROM map_spawn_points sp WHERE sp.map_template_id = mt.id) AS spawn_point_count
    FROM map_templates mt JOIN world_locations wl ON wl.id = mt.location_id
    WHERE mt.id = ?
  `).bind(id).first();
  return json({ ok: true, mapTemplate: mapTemplate(row) });
}

async function bindSceneMap(request, env, sceneId) {
  if (request.method !== 'PUT') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureWorldMapSchema(env);
  const body = await readBody(request);
  const mapTemplateId = cleanText(body.mapTemplateId, 100);
  if (!mapTemplateId) return apiError('Map Template 必須選擇。', 400, 'VALIDATION_ERROR');

  const [scene, template] = await Promise.all([
    env.DB.prepare('SELECT id FROM scenes WHERE id = ?').bind(sceneId).first(),
    env.DB.prepare(`
      SELECT mt.id, mt.location_id, mt.status, wl.status AS location_status
      FROM map_templates mt JOIN world_locations wl ON wl.id = mt.location_id
      WHERE mt.id = ?
    `).bind(mapTemplateId).first()
  ]);
  if (!scene) return apiError('Scene 不存在。', 404, 'SCENE_NOT_FOUND');
  if (!template) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  if (template.status !== 'active' || template.location_status !== 'active') {
    return apiError('Scene 只可以綁定 Active Location / Map Template。', 409, 'MAP_TEMPLATE_INACTIVE');
  }

  const configuration = checkedConfig(body.configuration);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO scene_map_bindings
      (scene_id, location_id, map_template_id, scene_config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(scene_id) DO UPDATE SET
      location_id = excluded.location_id,
      map_template_id = excluded.map_template_id,
      scene_config_json = excluded.scene_config_json,
      updated_at = excluded.updated_at
  `).bind(sceneId, template.location_id, mapTemplateId, JSON.stringify(configuration), now, now).run();

  const row = await env.DB.prepare(`
    SELECT smb.*, s.name AS scene_name, s.scenario_id, sc.name AS scenario_name,
           wl.name AS location_name, mt.name AS map_template_name
    FROM scene_map_bindings smb
    JOIN scenes s ON s.id = smb.scene_id
    JOIN scenarios sc ON sc.id = s.scenario_id
    JOIN world_locations wl ON wl.id = smb.location_id
    JOIN map_templates mt ON mt.id = smb.map_template_id
    WHERE smb.scene_id = ?
  `).bind(sceneId).first();
  return json({ ok: true, sceneBinding: mapBinding(row) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === '/api/gm/world-maps') return await overview(request, env);
      if (pathname === '/api/gm/world/locations') return await createLocation(request, env);

      const locationMatch = pathname.match(/^\/api\/gm\/world\/locations\/([^/]+)$/);
      if (locationMatch) return await updateLocation(request, env, decodeURIComponent(locationMatch[1]));

      if (pathname === '/api/gm/world/maps') return await createMapTemplate(request, env);
      const mapMatch = pathname.match(/^\/api\/gm\/world\/maps\/([^/]+)$/);
      if (mapMatch) return await updateMapTemplate(request, env, decodeURIComponent(mapMatch[1]));

      const sceneBindingMatch = pathname.match(/^\/api\/gm\/scenes\/([^/]+)\/map-binding$/);
      if (sceneBindingMatch) return await bindSceneMap(request, env, decodeURIComponent(sceneBindingMatch[1]));

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('World Map API error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) {
        return apiError(error.message || 'World Map request failed.', error.status, error.code || 'WORLD_MAP_ERROR');
      }
      if (String(error?.message || '').includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('World / Map service 暫時無法使用。', 500, 'WORLD_MAP_SERVICE_ERROR');
    }
  }
};
