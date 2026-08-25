import baseWorker from './world-map-editor.js';

const GM_ROLES = new Set(['gm', 'admin']);
const ENTITY_TYPES = new Set(['character', 'monster_instance', 'boss_instance']);
const VISIBILITY_MODES = new Set(['default', 'visible', 'hidden']);
const DOOR_STATES = new Set(['open', 'closed', 'locked', 'broken']);
let runtimeSchemaPromise = null;
let worldSchemaReady = false;

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

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw Object.assign(new Error(`${label} 必須為整數。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

function checkedVisibility(value = 'default') {
  const mode = String(value || 'default').toLowerCase();
  if (!VISIBILITY_MODES.has(mode)) {
    throw Object.assign(new Error('Visibility mode 無效。'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return mode;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function ensureWorldSchema(request, env) {
  if (worldSchemaReady) return;
  const internal = new Request(new URL('/api/gm/world-maps', request.url), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
  });
  const response = await baseWorker.fetch(internal, env);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw Object.assign(new Error(payload?.error?.message || 'World Map schema unavailable.'), {
      status: response.status,
      code: payload?.error?.code || 'WORLD_MAP_SCHEMA_UNAVAILABLE'
    });
  }
  worldSchemaReady = true;
}

async function ensureRuntimeSchema(request, env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  await ensureWorldSchema(request, env);
  if (!runtimeSchemaPromise) {
    runtimeSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS scenario_runs (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'aborted')),
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS scene_runs (
        id TEXT PRIMARY KEY,
        scenario_run_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'aborted')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (scenario_run_id) REFERENCES scenario_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_map_instances (
        id TEXT PRIMARY KEY,
        scene_run_id TEXT NOT NULL UNIQUE,
        scenario_run_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        map_template_id TEXT NOT NULL,
        source_map_version INTEGER NOT NULL,
        map_name_snapshot TEXT NOT NULL,
        location_name_snapshot TEXT NOT NULL,
        width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 200),
        height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 200),
        background_asset_ref TEXT NOT NULL DEFAULT '',
        scene_config_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        closed_at INTEGER,
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (scenario_run_id) REFERENCES scenario_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE RESTRICT,
        FOREIGN KEY (location_id) REFERENCES world_locations(id) ON DELETE RESTRICT,
        FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_map_cells (
        map_instance_id TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        is_walkable INTEGER NOT NULL DEFAULT 1 CHECK (is_walkable IN (0, 1)),
        terrain_key TEXT NOT NULL DEFAULT 'floor',
        gm_notes TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (map_instance_id, x, y),
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_map_edges (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        source_edge_id TEXT,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('N', 'E', 'S', 'W')),
        edge_type TEXT NOT NULL CHECK (edge_type IN ('wall', 'door')),
        blocks_movement INTEGER NOT NULL DEFAULT 1 CHECK (blocks_movement IN (0, 1)),
        door_state TEXT CHECK (door_state IS NULL OR door_state IN ('open', 'closed', 'locked', 'broken')),
        gm_notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (map_instance_id, x, y, direction),
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_map_zones (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        source_zone_id TEXT,
        name TEXT NOT NULL,
        zone_type TEXT NOT NULL DEFAULT 'area' CHECK (zone_type IN ('area', 'room', 'trigger', 'custom')),
        player_visible INTEGER NOT NULL DEFAULT 1 CHECK (player_visible IN (0, 1)),
        gm_notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_map_zone_cells (
        runtime_zone_id TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        PRIMARY KEY (runtime_zone_id, x, y),
        FOREIGN KEY (runtime_zone_id) REFERENCES runtime_map_zones(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_map_spawn_points (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        source_spawn_point_id TEXT,
        name TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        spawn_type TEXT NOT NULL DEFAULT 'any' CHECK (spawn_type IN ('any', 'character', 'monster', 'boss')),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        gm_notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (map_instance_id, name),
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_entity_positions (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'monster_instance', 'boss_instance')),
        entity_id TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        visibility_mode TEXT NOT NULL DEFAULT 'default' CHECK (visibility_mode IN ('default', 'visible', 'hidden')),
        placed_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (map_instance_id, entity_type, entity_id),
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (placed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scenario_runs_scenario_status ON scenario_runs(scenario_id, status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scene_runs_scenario_run_status ON scene_runs(scenario_run_id, status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_scene_runs_scene ON scene_runs(scene_id, status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_maps_status ON runtime_map_instances(status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_cells_map ON runtime_map_cells(map_instance_id, y, x)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_edges_map ON runtime_map_edges(map_instance_id, y, x, direction)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_zones_map ON runtime_map_zones(map_instance_id, name)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_zone_cells_zone ON runtime_map_zone_cells(runtime_zone_id, y, x)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_spawns_map ON runtime_map_spawn_points(map_instance_id, spawn_type, name)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_positions_map ON runtime_entity_positions(map_instance_id, y, x, entity_type)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_positions_entity ON runtime_entity_positions(entity_type, entity_id, updated_at)')
    ]).catch(error => {
      runtimeSchemaPromise = null;
      throw error;
    });
  }
  await runtimeSchemaPromise;
}

function mapInstancePayload(row) {
  return {
    id: row.id,
    sceneRunId: row.scene_run_id,
    scenarioRunId: row.scenario_run_id,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name || '',
    sceneId: row.scene_id,
    sceneName: row.scene_name || '',
    locationId: row.location_id,
    locationName: row.location_name_snapshot,
    mapTemplateId: row.map_template_id,
    sourceMapVersion: Number(row.source_map_version),
    mapName: row.map_name_snapshot,
    width: Number(row.width),
    height: Number(row.height),
    backgroundAssetRef: row.background_asset_ref || '',
    status: row.status,
    positionCount: Number(row.position_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at
  };
}

async function runtimeOverview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureRuntimeSchema(request, env);

  const [boundScenes, mapInstances, scenarioRuns] = await Promise.all([
    env.DB.prepare(`
      SELECT s.id AS scene_id, s.name AS scene_name, s.status AS scene_status,
             sc.id AS scenario_id, sc.name AS scenario_name,
             smb.location_id, wl.name AS location_name,
             smb.map_template_id, mt.name AS map_template_name, mt.width, mt.height, mt.version
      FROM scene_map_bindings smb
      JOIN scenes s ON s.id = smb.scene_id
      JOIN scenarios sc ON sc.id = s.scenario_id
      JOIN world_locations wl ON wl.id = smb.location_id
      JOIN map_templates mt ON mt.id = smb.map_template_id
      WHERE mt.status = 'active' AND wl.status = 'active'
      ORDER BY sc.sort_order, sc.created_at, s.sort_order, s.created_at, s.id
    `).all(),
    env.DB.prepare(`
      SELECT rmi.*, s.name AS scene_name, sc.id AS scenario_id, sc.name AS scenario_name,
             (SELECT COUNT(*) FROM runtime_entity_positions rep WHERE rep.map_instance_id = rmi.id) AS position_count
      FROM runtime_map_instances rmi
      JOIN scenes s ON s.id = rmi.scene_id
      JOIN scenarios sc ON sc.id = s.scenario_id
      ORDER BY CASE rmi.status WHEN 'active' THEN 0 ELSE 1 END, rmi.updated_at DESC, rmi.created_at DESC
    `).all(),
    env.DB.prepare(`
      SELECT sr.id, sr.scenario_id, sr.label, sr.status, sr.created_at, sr.updated_at,
             sc.name AS scenario_name,
             (SELECT COUNT(*) FROM scene_runs scr WHERE scr.scenario_run_id = sr.id AND scr.status = 'active') AS active_scene_count
      FROM scenario_runs sr
      JOIN scenarios sc ON sc.id = sr.scenario_id
      ORDER BY CASE sr.status WHEN 'active' THEN 0 ELSE 1 END, sr.updated_at DESC
    `).all()
  ]);

  return json({
    ok: true,
    boundScenes: (boundScenes.results || []).map(row => ({
      sceneId: row.scene_id,
      sceneName: row.scene_name,
      sceneStatus: row.scene_status,
      scenarioId: row.scenario_id,
      scenarioName: row.scenario_name,
      locationId: row.location_id,
      locationName: row.location_name,
      mapTemplateId: row.map_template_id,
      mapTemplateName: row.map_template_name,
      width: Number(row.width),
      height: Number(row.height),
      mapVersion: Number(row.version)
    })),
    mapInstances: (mapInstances.results || []).map(mapInstancePayload),
    scenarioRuns: (scenarioRuns.results || []).map(row => ({
      id: row.id,
      scenarioId: row.scenario_id,
      scenarioName: row.scenario_name,
      label: row.label || '',
      status: row.status,
      activeSceneCount: Number(row.active_scene_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  });
}

function sceneConfigOverrides(rawJson) {
  let parsed = {};
  try { parsed = JSON.parse(rawJson || '{}'); } catch { parsed = {}; }
  const root = safeObject(parsed);
  const doors = safeObject(root.doors);
  const zoneVisibility = safeObject(root.zoneVisibility);
  const spawnEnabled = safeObject(root.spawnEnabled);
  return { root, doors, zoneVisibility, spawnEnabled };
}

function overrideStatements(env, mapInstanceId, config, now) {
  const statements = [];
  for (const [sourceEdgeId, rawState] of Object.entries(config.doors).slice(0, 500)) {
    const state = String(rawState || '').toLowerCase();
    if (!DOOR_STATES.has(state)) continue;
    const blocks = state === 'closed' || state === 'locked' ? 1 : 0;
    statements.push(env.DB.prepare(`
      UPDATE runtime_map_edges
      SET door_state = ?, blocks_movement = ?, updated_at = ?
      WHERE map_instance_id = ? AND source_edge_id = ? AND edge_type = 'door'
    `).bind(state, blocks, now, mapInstanceId, cleanText(sourceEdgeId, 140)));
  }
  for (const [sourceZoneId, rawVisible] of Object.entries(config.zoneVisibility).slice(0, 500)) {
    statements.push(env.DB.prepare(`
      UPDATE runtime_map_zones SET player_visible = ?, updated_at = ?
      WHERE map_instance_id = ? AND source_zone_id = ?
    `).bind(rawVisible ? 1 : 0, now, mapInstanceId, cleanText(sourceZoneId, 140)));
  }
  for (const [sourceSpawnId, rawEnabled] of Object.entries(config.spawnEnabled).slice(0, 1000)) {
    statements.push(env.DB.prepare(`
      UPDATE runtime_map_spawn_points SET enabled = ?, updated_at = ?
      WHERE map_instance_id = ? AND source_spawn_point_id = ?
    `).bind(rawEnabled ? 1 : 0, now, mapInstanceId, cleanText(sourceSpawnId, 140)));
  }
  return statements;
}

async function startSceneRuntime(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureRuntimeSchema(request, env);
  const body = await readBody(request);
  const sceneId = cleanText(body.sceneId, 120);
  if (!sceneId) return apiError('Scene 必須選擇。', 400, 'VALIDATION_ERROR');

  const source = await env.DB.prepare(`
    SELECT s.id AS scene_id, s.name AS scene_name, s.status AS scene_status,
           sc.id AS scenario_id, sc.name AS scenario_name,
           smb.location_id, smb.map_template_id, smb.scene_config_json,
           wl.name AS location_name, wl.status AS location_status,
           mt.name AS map_template_name, mt.width, mt.height, mt.version,
           mt.background_asset_ref, mt.status AS map_status
    FROM scenes s
    JOIN scenarios sc ON sc.id = s.scenario_id
    JOIN scene_map_bindings smb ON smb.scene_id = s.id
    JOIN world_locations wl ON wl.id = smb.location_id
    JOIN map_templates mt ON mt.id = smb.map_template_id
    WHERE s.id = ?
    LIMIT 1
  `).bind(sceneId).first();
  if (!source) return apiError('Scene 未綁定 Structured Map。', 404, 'SCENE_MAP_BINDING_REQUIRED');
  if (source.map_status !== 'active' || source.location_status !== 'active') {
    return apiError('Scene 綁定的 Location / Map Template 必須為 active。', 409, 'RUNTIME_SOURCE_INACTIVE');
  }

  let scenarioRunId = cleanText(body.scenarioRunId, 140);
  const now = Date.now();
  const createScenarioRun = !scenarioRunId;
  if (scenarioRunId) {
    const existing = await env.DB.prepare(`
      SELECT id FROM scenario_runs WHERE id = ? AND scenario_id = ? AND status = 'active'
    `).bind(scenarioRunId, source.scenario_id).first();
    if (!existing) return apiError('Scenario Run 不存在、已結束或屬於另一個 Scenario。', 409, 'SCENARIO_RUN_INVALID');
  } else {
    scenarioRunId = `scenario_run_${crypto.randomUUID()}`;
  }

  const sceneRunId = `scene_run_${crypto.randomUUID()}`;
  const mapInstanceId = `runtime_map_${crypto.randomUUID()}`;
  const label = cleanText(body.label, 160) || `${source.scenario_name} Run`;
  const config = sceneConfigOverrides(source.scene_config_json);

  const statements = [];
  if (createScenarioRun) {
    statements.push(env.DB.prepare(`
      INSERT INTO scenario_runs
        (id, scenario_id, label, status, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).bind(scenarioRunId, source.scenario_id, label, user.id, now, now));
  }
  statements.push(
    env.DB.prepare(`
      INSERT INTO scene_runs (id, scenario_run_id, scene_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).bind(sceneRunId, scenarioRunId, source.scene_id, now, now),
    env.DB.prepare(`
      INSERT INTO runtime_map_instances
        (id, scene_run_id, scenario_run_id, scene_id, location_id, map_template_id,
         source_map_version, map_name_snapshot, location_name_snapshot, width, height,
         background_asset_ref, scene_config_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      mapInstanceId, sceneRunId, scenarioRunId, source.scene_id, source.location_id,
      source.map_template_id, Number(source.version), source.map_template_name, source.location_name,
      Number(source.width), Number(source.height), source.background_asset_ref || '',
      JSON.stringify(config.root), now, now
    ),
    env.DB.prepare(`
      INSERT INTO runtime_map_cells (map_instance_id, x, y, is_walkable, terrain_key, gm_notes)
      SELECT ?, x, y, is_walkable, terrain_key, gm_notes
      FROM map_cells WHERE map_template_id = ?
    `).bind(mapInstanceId, source.map_template_id),
    env.DB.prepare(`
      INSERT INTO runtime_map_edges
        (id, map_instance_id, source_edge_id, x, y, direction, edge_type, blocks_movement,
         door_state, gm_notes, created_at, updated_at)
      SELECT 'runtime_edge_' || lower(hex(randomblob(16))), ?, id, x, y, direction, edge_type,
             blocks_movement, door_default_state, gm_notes, ?, ?
      FROM map_edges WHERE map_template_id = ?
    `).bind(mapInstanceId, now, now, source.map_template_id),
    env.DB.prepare(`
      INSERT INTO runtime_map_zones
        (id, map_instance_id, source_zone_id, name, zone_type, player_visible, gm_notes, created_at, updated_at)
      SELECT 'runtime_zone_' || lower(hex(randomblob(16))), ?, id, name, zone_type,
             player_visible_default, gm_notes, ?, ?
      FROM map_zones WHERE map_template_id = ?
    `).bind(mapInstanceId, now, now, source.map_template_id),
    env.DB.prepare(`
      INSERT INTO runtime_map_zone_cells (runtime_zone_id, x, y)
      SELECT rz.id, mzc.x, mzc.y
      FROM map_zone_cells mzc
      JOIN runtime_map_zones rz
        ON rz.map_instance_id = ? AND rz.source_zone_id = mzc.zone_id
      JOIN map_zones mz ON mz.id = mzc.zone_id
      WHERE mz.map_template_id = ?
    `).bind(mapInstanceId, source.map_template_id),
    env.DB.prepare(`
      INSERT INTO runtime_map_spawn_points
        (id, map_instance_id, source_spawn_point_id, name, x, y, spawn_type, enabled, gm_notes, created_at, updated_at)
      SELECT 'runtime_spawn_' || lower(hex(randomblob(16))), ?, id, name, x, y, spawn_type, 1, gm_notes, ?, ?
      FROM map_spawn_points WHERE map_template_id = ?
    `).bind(mapInstanceId, now, now, source.map_template_id)
  );
  statements.push(...overrideStatements(env, mapInstanceId, config, now));

  await env.DB.batch(statements);
  return runtimeMapDetail(request, env, mapInstanceId, 201);
}

async function loadMapRow(env, mapInstanceId) {
  return env.DB.prepare(`
    SELECT rmi.*, s.name AS scene_name, sc.id AS scenario_id, sc.name AS scenario_name,
           (SELECT COUNT(*) FROM runtime_entity_positions rep WHERE rep.map_instance_id = rmi.id) AS position_count
    FROM runtime_map_instances rmi
    JOIN scenes s ON s.id = rmi.scene_id
    JOIN scenarios sc ON sc.id = s.scenario_id
    WHERE rmi.id = ?
    LIMIT 1
  `).bind(mapInstanceId).first();
}

function entitySpawnType(entityType) {
  if (entityType === 'character') return 'character';
  if (entityType === 'monster_instance') return 'monster';
  return 'boss';
}

async function availableEntities(env, sceneId) {
  const [characters, monsters, bosses] = await Promise.all([
    env.DB.prepare(`SELECT id, name, status FROM characters ORDER BY name, created_at, id`).all(),
    env.DB.prepare(`
      SELECT mi.id, mi.display_name AS name, mi.status
      FROM monster_instances mi
      JOIN encounters e ON e.id = mi.encounter_id
      WHERE e.scene_id = ? AND mi.status <> 'removed'
      ORDER BY e.sort_order, mi.created_at, mi.id
    `).bind(sceneId).all(),
    env.DB.prepare(`
      SELECT bi.id, bi.display_name AS name, bi.status
      FROM boss_instances bi
      JOIN encounters e ON e.id = bi.encounter_id
      WHERE e.scene_id = ? AND bi.status <> 'removed'
      ORDER BY e.sort_order, bi.created_at, bi.id
    `).bind(sceneId).all()
  ]);
  return [
    ...(characters.results || []).map(row => ({ entityType: 'character', id: row.id, name: row.name, status: row.status })),
    ...(monsters.results || []).map(row => ({ entityType: 'monster_instance', id: row.id, name: row.name, status: row.status })),
    ...(bosses.results || []).map(row => ({ entityType: 'boss_instance', id: row.id, name: row.name, status: row.status }))
  ];
}

async function runtimeMapDetail(request, env, mapInstanceId, status = 200) {
  if (request.method !== 'GET' && status === 200) return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureRuntimeSchema(request, env);
  const mapRow = await loadMapRow(env, mapInstanceId);
  if (!mapRow) return apiError('Runtime Map 不存在。', 404, 'RUNTIME_MAP_NOT_FOUND');

  const [cells, edges, zones, zoneCells, spawns, positions, entities] = await Promise.all([
    env.DB.prepare(`SELECT x, y, is_walkable, terrain_key, gm_notes FROM runtime_map_cells WHERE map_instance_id = ? ORDER BY y, x`).bind(mapInstanceId).all(),
    env.DB.prepare(`SELECT id, source_edge_id, x, y, direction, edge_type, blocks_movement, door_state, gm_notes FROM runtime_map_edges WHERE map_instance_id = ? ORDER BY y, x, direction, id`).bind(mapInstanceId).all(),
    env.DB.prepare(`SELECT id, source_zone_id, name, zone_type, player_visible, gm_notes FROM runtime_map_zones WHERE map_instance_id = ? ORDER BY created_at, id`).bind(mapInstanceId).all(),
    env.DB.prepare(`
      SELECT rzc.runtime_zone_id, rzc.x, rzc.y
      FROM runtime_map_zone_cells rzc
      JOIN runtime_map_zones rz ON rz.id = rzc.runtime_zone_id
      WHERE rz.map_instance_id = ?
      ORDER BY rzc.runtime_zone_id, rzc.y, rzc.x
    `).bind(mapInstanceId).all(),
    env.DB.prepare(`SELECT id, source_spawn_point_id, name, x, y, spawn_type, enabled, gm_notes FROM runtime_map_spawn_points WHERE map_instance_id = ? ORDER BY created_at, id`).bind(mapInstanceId).all(),
    env.DB.prepare(`SELECT id, entity_type, entity_id, x, y, visibility_mode, created_at, updated_at FROM runtime_entity_positions WHERE map_instance_id = ? ORDER BY y, x, entity_type, entity_id`).bind(mapInstanceId).all(),
    availableEntities(env, mapRow.scene_id)
  ]);

  const zoneCellsById = new Map();
  for (const row of zoneCells.results || []) {
    if (!zoneCellsById.has(row.runtime_zone_id)) zoneCellsById.set(row.runtime_zone_id, []);
    zoneCellsById.get(row.runtime_zone_id).push({ x: Number(row.x), y: Number(row.y) });
  }
  const entityName = new Map(entities.map(entity => [`${entity.entityType}:${entity.id}`, entity.name]));

  return json({
    ok: true,
    mapInstance: mapInstancePayload(mapRow),
    cells: (cells.results || []).map(row => ({
      x: Number(row.x), y: Number(row.y), isWalkable: Boolean(row.is_walkable),
      terrainKey: row.terrain_key || 'floor', gmNotes: row.gm_notes || ''
    })),
    edges: (edges.results || []).map(row => ({
      id: row.id, sourceEdgeId: row.source_edge_id, x: Number(row.x), y: Number(row.y),
      direction: row.direction, edgeType: row.edge_type, blocksMovement: Boolean(row.blocks_movement),
      doorState: row.door_state, gmNotes: row.gm_notes || ''
    })),
    zones: (zones.results || []).map(row => ({
      id: row.id, sourceZoneId: row.source_zone_id, name: row.name, zoneType: row.zone_type,
      playerVisible: Boolean(row.player_visible), gmNotes: row.gm_notes || '',
      cells: zoneCellsById.get(row.id) || []
    })),
    spawnPoints: (spawns.results || []).map(row => ({
      id: row.id, sourceSpawnPointId: row.source_spawn_point_id, name: row.name,
      x: Number(row.x), y: Number(row.y), spawnType: row.spawn_type,
      enabled: Boolean(row.enabled), gmNotes: row.gm_notes || ''
    })),
    positions: (positions.results || []).map(row => ({
      id: row.id, entityType: row.entity_type, entityId: row.entity_id,
      displayName: entityName.get(`${row.entity_type}:${row.entity_id}`) || row.entity_id,
      x: Number(row.x), y: Number(row.y), visibilityMode: row.visibility_mode,
      createdAt: row.created_at, updatedAt: row.updated_at
    })),
    availableEntities: entities
  }, status);
}

async function validateEntity(env, mapRow, entityType, entityId) {
  if (!ENTITY_TYPES.has(entityType)) return null;
  if (entityType === 'character') {
    return env.DB.prepare('SELECT id, name, status FROM characters WHERE id = ? LIMIT 1').bind(entityId).first();
  }
  if (entityType === 'monster_instance') {
    return env.DB.prepare(`
      SELECT mi.id, mi.display_name AS name, mi.status
      FROM monster_instances mi JOIN encounters e ON e.id = mi.encounter_id
      WHERE mi.id = ? AND e.scene_id = ? LIMIT 1
    `).bind(entityId, mapRow.scene_id).first();
  }
  return env.DB.prepare(`
    SELECT bi.id, bi.display_name AS name, bi.status
    FROM boss_instances bi JOIN encounters e ON e.id = bi.encounter_id
    WHERE bi.id = ? AND e.scene_id = ? LIMIT 1
  `).bind(entityId, mapRow.scene_id).first();
}

async function resolvePlacement(request, env, mapRow, entityType, body) {
  let x;
  let y;
  if (body.spawnPointId) {
    const spawn = await env.DB.prepare(`
      SELECT id, x, y, spawn_type, enabled
      FROM runtime_map_spawn_points WHERE id = ? AND map_instance_id = ? LIMIT 1
    `).bind(cleanText(body.spawnPointId, 160), mapRow.id).first();
    if (!spawn || !spawn.enabled) return { error: apiError('Spawn Point 不存在或已停用。', 404, 'RUNTIME_SPAWN_NOT_FOUND') };
    const requiredType = entitySpawnType(entityType);
    if (spawn.spawn_type !== 'any' && spawn.spawn_type !== requiredType) {
      return { error: apiError('Spawn Point 類型與 Entity 不相容。', 409, 'SPAWN_TYPE_MISMATCH') };
    }
    x = Number(spawn.x);
    y = Number(spawn.y);
  } else {
    x = integer(body.x, 'X');
    y = integer(body.y, 'Y');
  }
  if (x < 0 || y < 0 || x >= Number(mapRow.width) || y >= Number(mapRow.height)) {
    return { error: apiError('Position 超出 Runtime Map 範圍。', 400, 'MAP_COORDINATE_OUT_OF_BOUNDS') };
  }
  const blocked = await env.DB.prepare(`
    SELECT 1 AS blocked FROM runtime_map_cells
    WHERE map_instance_id = ? AND x = ? AND y = ? AND is_walkable = 0 LIMIT 1
  `).bind(mapRow.id, x, y).first();
  if (blocked) return { error: apiError('不可將 Entity 放在 blocked Cell。', 409, 'POSITION_BLOCKED') };
  return { x, y };
}

async function mutatePosition(request, env, mapInstanceId, entityTypeRaw, entityIdRaw) {
  if (!['PUT', 'DELETE'].includes(request.method)) return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureRuntimeSchema(request, env);
  const entityType = String(entityTypeRaw || '').toLowerCase();
  const entityId = cleanText(entityIdRaw, 160);
  if (!ENTITY_TYPES.has(entityType) || !entityId) return apiError('Entity Type / ID 無效。', 400, 'VALIDATION_ERROR');
  const mapRow = await loadMapRow(env, mapInstanceId);
  if (!mapRow) return apiError('Runtime Map 不存在。', 404, 'RUNTIME_MAP_NOT_FOUND');
  if (mapRow.status !== 'active') return apiError('已關閉的 Runtime Map 不可修改 Position。', 409, 'RUNTIME_MAP_CLOSED');
  const entity = await validateEntity(env, mapRow, entityType, entityId);
  if (!entity) return apiError('Entity 不存在，或 Monster/Boss 不屬於此 Scene。', 404, 'RUNTIME_ENTITY_NOT_FOUND');

  if (request.method === 'DELETE') {
    await env.DB.prepare(`
      DELETE FROM runtime_entity_positions
      WHERE map_instance_id = ? AND entity_type = ? AND entity_id = ?
    `).bind(mapInstanceId, entityType, entityId).run();
    return json({ ok: true, removed: true, entityType, entityId });
  }

  const body = await readBody(request);
  const placement = await resolvePlacement(request, env, mapRow, entityType, body);
  if (placement.error) return placement.error;
  const allowOccupied = body.allowOccupied === true;
  if (!allowOccupied) {
    const occupied = await env.DB.prepare(`
      SELECT entity_type, entity_id FROM runtime_entity_positions
      WHERE map_instance_id = ? AND x = ? AND y = ?
        AND NOT (entity_type = ? AND entity_id = ?)
      LIMIT 1
    `).bind(mapInstanceId, placement.x, placement.y, entityType, entityId).first();
    if (occupied) {
      return apiError('目的 Cell 已有另一個 Entity。GM 如確定要疊位，可使用 allowOccupied override。', 409, 'MAP_POSITION_OCCUPIED');
    }
  }

  const now = Date.now();
  const visibilityMode = checkedVisibility(body.visibilityMode);
  const positionId = `runtime_position_${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO runtime_entity_positions
      (id, map_instance_id, entity_type, entity_id, x, y, visibility_mode, placed_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(map_instance_id, entity_type, entity_id) DO UPDATE SET
      x = excluded.x,
      y = excluded.y,
      visibility_mode = excluded.visibility_mode,
      placed_by_user_id = excluded.placed_by_user_id,
      updated_at = excluded.updated_at
  `).bind(
    positionId, mapInstanceId, entityType, entityId, placement.x, placement.y,
    visibilityMode, user.id, now, now
  ).run();

  const row = await env.DB.prepare(`
    SELECT id, entity_type, entity_id, x, y, visibility_mode, created_at, updated_at
    FROM runtime_entity_positions
    WHERE map_instance_id = ? AND entity_type = ? AND entity_id = ?
  `).bind(mapInstanceId, entityType, entityId).first();
  return json({
    ok: true,
    position: {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      displayName: entity.name,
      x: Number(row.x),
      y: Number(row.y),
      visibilityMode: row.visibility_mode,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  });
}

async function closeRuntimeMap(request, env, mapInstanceId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureRuntimeSchema(request, env);
  const mapRow = await loadMapRow(env, mapInstanceId);
  if (!mapRow) return apiError('Runtime Map 不存在。', 404, 'RUNTIME_MAP_NOT_FOUND');
  if (mapRow.status === 'closed') return json({ ok: true, alreadyClosed: true, mapInstance: mapInstancePayload(mapRow) });
  const body = await readBody(request);
  const now = Date.now();
  const statements = [
    env.DB.prepare(`UPDATE runtime_map_instances SET status = 'closed', updated_at = ?, closed_at = ? WHERE id = ?`).bind(now, now, mapInstanceId),
    env.DB.prepare(`UPDATE scene_runs SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?`).bind(now, now, mapRow.scene_run_id)
  ];
  if (body.completeScenarioRun === true) {
    statements.push(env.DB.prepare(`UPDATE scenario_runs SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?`).bind(now, now, mapRow.scenario_run_id));
  }
  await env.DB.batch(statements);
  const refreshed = await loadMapRow(env, mapInstanceId);
  return json({ ok: true, mapInstance: mapInstancePayload(refreshed) });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/world/runtime') return await runtimeOverview(request, env);
      if (pathname === '/api/gm/world/runtime/scene-runs') return await startSceneRuntime(request, env);

      const detailMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)$/);
      if (detailMatch) return await runtimeMapDetail(request, env, decodeURIComponent(detailMatch[1]));

      const closeMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/close$/);
      if (closeMatch) return await closeRuntimeMap(request, env, decodeURIComponent(closeMatch[1]));

      const positionMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/entities\/([^/]+)\/([^/]+)\/position$/);
      if (positionMatch) {
        return await mutatePosition(
          request,
          env,
          decodeURIComponent(positionMatch[1]),
          decodeURIComponent(positionMatch[2]),
          decodeURIComponent(positionMatch[3])
        );
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Runtime Map API error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message || 'Runtime Map request failed.', error.status, error.code || 'RUNTIME_MAP_ERROR');
      if (String(error?.message || '').includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Runtime Map service 暫時無法使用。', 500, 'RUNTIME_MAP_SERVICE_ERROR');
    }
  }
};
