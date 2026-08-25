import baseWorker from './world-map.js';

const GM_ROLES = new Set(['gm', 'admin']);
const DIRECTIONS = new Set(['N', 'E', 'S', 'W']);
const EDGE_TYPES = new Set(['wall', 'door']);
const DOOR_STATES = new Set(['open', 'closed', 'locked', 'broken']);
const ZONE_TYPES = new Set(['area', 'room', 'trigger', 'custom']);
const SPAWN_TYPES = new Set(['any', 'character', 'monster', 'boss']);
const ID_PATTERN = /^(edge|zone|spawn)_[A-Za-z0-9_-]{8,120}$/;
const LIMITS = Object.freeze({ cells: 40000, edges: 20000, zones: 500, zoneCells: 40000, spawns: 2000 });
let baseSchemaReady = false;

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

function arrayValue(value, label) {
  if (!Array.isArray(value)) {
    throw Object.assign(new Error(`${label} 必須為 array。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return value;
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw Object.assign(new Error(`${label} 必須為整數。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

function coordinate(value, max, label) {
  const number = integer(value, label);
  if (number < 0 || number >= max) {
    throw Object.assign(new Error(`${label} 超出 Map 範圍。`), { status: 400, code: 'MAP_COORDINATE_OUT_OF_BOUNDS' });
  }
  return number;
}

function boolInt(value, fallback = false) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function stableId(value, prefix) {
  const supplied = cleanText(value, 140);
  if (!supplied) return `${prefix}_${crypto.randomUUID()}`;
  if (!ID_PATTERN.test(supplied) || !supplied.startsWith(`${prefix}_`)) {
    throw Object.assign(new Error(`${prefix} ID 格式錯誤。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return supplied;
}

function uniquePush(set, key, message) {
  if (set.has(key)) {
    throw Object.assign(new Error(message), { status: 400, code: 'VALIDATION_ERROR' });
  }
  set.add(key);
}

async function ensureBaseSchema(request, env) {
  if (baseSchemaReady) return;
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
  baseSchemaReady = true;
}

async function readTemplate(env, mapId) {
  return env.DB.prepare(`
    SELECT mt.*, wl.name AS location_name
    FROM map_templates mt
    JOIN world_locations wl ON wl.id = mt.location_id
    WHERE mt.id = ?
    LIMIT 1
  `).bind(mapId).first();
}

function templatePayload(row) {
  return {
    id: row.id,
    locationId: row.location_id,
    locationName: row.location_name,
    name: row.name,
    width: Number(row.width),
    height: Number(row.height),
    backgroundAssetRef: row.background_asset_ref || '',
    status: row.status,
    version: Number(row.version || 1),
    updatedAt: row.updated_at
  };
}

async function loadGridEditor(request, env, mapId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureBaseSchema(request, env);
  const template = await readTemplate(env, mapId);
  if (!template) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');

  const [cells, edges, zones, zoneCells, spawns] = await Promise.all([
    env.DB.prepare(`
      SELECT x, y, is_walkable, terrain_key, gm_notes
      FROM map_cells WHERE map_template_id = ? ORDER BY y, x
    `).bind(mapId).all(),
    env.DB.prepare(`
      SELECT id, x, y, direction, edge_type, blocks_movement, door_default_state, gm_notes
      FROM map_edges WHERE map_template_id = ? ORDER BY y, x, direction, id
    `).bind(mapId).all(),
    env.DB.prepare(`
      SELECT id, name, zone_type, player_visible_default, gm_notes
      FROM map_zones WHERE map_template_id = ? ORDER BY created_at, id
    `).bind(mapId).all(),
    env.DB.prepare(`
      SELECT mzc.zone_id, mzc.x, mzc.y
      FROM map_zone_cells mzc
      JOIN map_zones mz ON mz.id = mzc.zone_id
      WHERE mz.map_template_id = ?
      ORDER BY mzc.zone_id, mzc.y, mzc.x
    `).bind(mapId).all(),
    env.DB.prepare(`
      SELECT id, name, x, y, spawn_type, gm_notes
      FROM map_spawn_points WHERE map_template_id = ? ORDER BY created_at, id
    `).bind(mapId).all()
  ]);

  const zoneCellMap = new Map();
  for (const row of zoneCells.results || []) {
    if (!zoneCellMap.has(row.zone_id)) zoneCellMap.set(row.zone_id, []);
    zoneCellMap.get(row.zone_id).push({ x: Number(row.x), y: Number(row.y) });
  }

  return json({
    ok: true,
    mapTemplate: templatePayload(template),
    cells: (cells.results || []).map(row => ({
      x: Number(row.x),
      y: Number(row.y),
      isWalkable: Boolean(row.is_walkable),
      terrainKey: row.terrain_key || 'floor',
      gmNotes: row.gm_notes || ''
    })),
    edges: (edges.results || []).map(row => ({
      id: row.id,
      x: Number(row.x),
      y: Number(row.y),
      direction: row.direction,
      edgeType: row.edge_type,
      blocksMovement: Boolean(row.blocks_movement),
      doorDefaultState: row.door_default_state,
      gmNotes: row.gm_notes || ''
    })),
    zones: (zones.results || []).map(row => ({
      id: row.id,
      name: row.name,
      zoneType: row.zone_type,
      playerVisibleDefault: Boolean(row.player_visible_default),
      gmNotes: row.gm_notes || '',
      cells: zoneCellMap.get(row.id) || []
    })),
    spawnPoints: (spawns.results || []).map(row => ({
      id: row.id,
      name: row.name,
      x: Number(row.x),
      y: Number(row.y),
      spawnType: row.spawn_type,
      gmNotes: row.gm_notes || ''
    }))
  });
}

function normalizeCells(value, width, height) {
  const rows = arrayValue(value, 'cells');
  if (rows.length > LIMITS.cells) throw Object.assign(new Error('Cell override 數量過多。'), { status: 413, code: 'MAP_EDITOR_LIMIT_EXCEEDED' });
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const x = coordinate(row?.x, width, 'Cell X');
    const y = coordinate(row?.y, height, 'Cell Y');
    uniquePush(seen, `${x},${y}`, '同一 Cell 不可重複。');
    const isWalkable = boolInt(row?.isWalkable, true);
    const terrainKey = cleanText(row?.terrainKey || 'floor', 80) || 'floor';
    const gmNotes = cleanText(row?.gmNotes, 1000);
    // Default floor cells are implicit and do not need a sparse override row.
    if (isWalkable === 1 && terrainKey === 'floor' && !gmNotes) continue;
    result.push({ x, y, isWalkable, terrainKey, gmNotes });
  }
  return result;
}

function canonicalEdgeCoordinate(x, y, direction, width, height) {
  if (direction === 'E' && x < width - 1) return { x: x + 1, y, direction: 'W' };
  if (direction === 'S' && y < height - 1) return { x, y: y + 1, direction: 'N' };
  return { x, y, direction };
}

function normalizeEdges(value, width, height) {
  const rows = arrayValue(value, 'edges');
  if (rows.length > LIMITS.edges) throw Object.assign(new Error('Edge 數量過多。'), { status: 413, code: 'MAP_EDITOR_LIMIT_EXCEEDED' });
  const seenSlots = new Set();
  const seenIds = new Set();
  const result = [];
  for (const row of rows) {
    const rawX = coordinate(row?.x, width, 'Edge X');
    const rawY = coordinate(row?.y, height, 'Edge Y');
    const rawDirection = String(row?.direction || '').toUpperCase();
    if (!DIRECTIONS.has(rawDirection)) {
      throw Object.assign(new Error('Edge Direction 無效。'), { status: 400, code: 'VALIDATION_ERROR' });
    }
    const slot = canonicalEdgeCoordinate(rawX, rawY, rawDirection, width, height);
    uniquePush(seenSlots, `${slot.x},${slot.y},${slot.direction}`, '同一實體 Edge 不可重複定義。');
    const id = stableId(row?.id, 'edge');
    uniquePush(seenIds, id, 'Edge ID 不可重複。');
    const edgeType = String(row?.edgeType || '').toLowerCase();
    if (!EDGE_TYPES.has(edgeType)) {
      throw Object.assign(new Error('Edge Type 必須為 wall 或 door。'), { status: 400, code: 'VALIDATION_ERROR' });
    }
    let doorDefaultState = null;
    let blocksMovement = 1;
    if (edgeType === 'door') {
      doorDefaultState = String(row?.doorDefaultState || 'closed').toLowerCase();
      if (!DOOR_STATES.has(doorDefaultState)) {
        throw Object.assign(new Error('Door default state 無效。'), { status: 400, code: 'VALIDATION_ERROR' });
      }
      blocksMovement = doorDefaultState === 'closed' || doorDefaultState === 'locked' ? 1 : 0;
    }
    result.push({
      id,
      x: slot.x,
      y: slot.y,
      direction: slot.direction,
      edgeType,
      blocksMovement,
      doorDefaultState,
      gmNotes: cleanText(row?.gmNotes, 1000)
    });
  }
  return result;
}

function normalizeZones(value, width, height) {
  const rows = arrayValue(value, 'zones');
  if (rows.length > LIMITS.zones) throw Object.assign(new Error('Zone 數量過多。'), { status: 413, code: 'MAP_EDITOR_LIMIT_EXCEEDED' });
  const seenIds = new Set();
  const seenNames = new Set();
  let zoneCellCount = 0;
  const result = [];
  for (const row of rows) {
    const id = stableId(row?.id, 'zone');
    uniquePush(seenIds, id, 'Zone ID 不可重複。');
    const name = requiredName(row?.name, 'Zone Name');
    uniquePush(seenNames, name.toLocaleLowerCase(), 'Zone Name 不可重複。');
    const zoneType = String(row?.zoneType || 'area').toLowerCase();
    if (!ZONE_TYPES.has(zoneType)) {
      throw Object.assign(new Error('Zone Type 無效。'), { status: 400, code: 'VALIDATION_ERROR' });
    }
    const cells = arrayValue(row?.cells || [], 'Zone cells');
    const cellSeen = new Set();
    const normalizedCells = [];
    for (const cell of cells) {
      const x = coordinate(cell?.x, width, 'Zone Cell X');
      const y = coordinate(cell?.y, height, 'Zone Cell Y');
      uniquePush(cellSeen, `${x},${y}`, '同一 Zone Cell 不可重複。');
      normalizedCells.push({ x, y });
    }
    zoneCellCount += normalizedCells.length;
    if (zoneCellCount > LIMITS.zoneCells) {
      throw Object.assign(new Error('Zone Cell 數量過多。'), { status: 413, code: 'MAP_EDITOR_LIMIT_EXCEEDED' });
    }
    result.push({
      id,
      name,
      zoneType,
      playerVisibleDefault: boolInt(row?.playerVisibleDefault, true),
      gmNotes: cleanText(row?.gmNotes, 1000),
      cells: normalizedCells
    });
  }
  return result;
}

function normalizeSpawns(value, width, height, blockedCells) {
  const rows = arrayValue(value, 'spawnPoints');
  if (rows.length > LIMITS.spawns) throw Object.assign(new Error('Spawn Point 數量過多。'), { status: 413, code: 'MAP_EDITOR_LIMIT_EXCEEDED' });
  const seenIds = new Set();
  const seenNames = new Set();
  const result = [];
  for (const row of rows) {
    const id = stableId(row?.id, 'spawn');
    uniquePush(seenIds, id, 'Spawn ID 不可重複。');
    const name = requiredName(row?.name, 'Spawn Name');
    uniquePush(seenNames, name.toLocaleLowerCase(), 'Spawn Name 不可重複。');
    const x = coordinate(row?.x, width, 'Spawn X');
    const y = coordinate(row?.y, height, 'Spawn Y');
    if (blockedCells.has(`${x},${y}`)) {
      throw Object.assign(new Error(`Spawn Point ${name} 不可放在 blocked Cell。`), { status: 400, code: 'SPAWN_ON_BLOCKED_CELL' });
    }
    const spawnType = String(row?.spawnType || 'any').toLowerCase();
    if (!SPAWN_TYPES.has(spawnType)) {
      throw Object.assign(new Error('Spawn Type 無效。'), { status: 400, code: 'VALIDATION_ERROR' });
    }
    result.push({ id, name, x, y, spawnType, gmNotes: cleanText(row?.gmNotes, 1000) });
  }
  return result;
}

async function saveGridEditor(request, env, mapId) {
  if (request.method !== 'PUT') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureBaseSchema(request, env);
  const template = await readTemplate(env, mapId);
  if (!template) return apiError('Map Template 不存在。', 404, 'MAP_TEMPLATE_NOT_FOUND');
  if (template.status !== 'active') return apiError('Archived Map Template 不可編輯。', 409, 'MAP_TEMPLATE_ARCHIVED');

  const body = await readBody(request);
  const expectedVersion = integer(body.expectedVersion, 'expectedVersion');
  if (expectedVersion !== Number(template.version || 1)) {
    return apiError('Map Template 已被其他操作更新。請 Reload Grid 後再編輯。', 409, 'MAP_TEMPLATE_CHANGED');
  }

  const width = Number(template.width);
  const height = Number(template.height);
  const cells = normalizeCells(body.cells || [], width, height);
  const blockedCells = new Set(cells.filter(cell => !cell.isWalkable).map(cell => `${cell.x},${cell.y}`));
  const edges = normalizeEdges(body.edges || [], width, height);
  const zones = normalizeZones(body.zones || [], width, height);
  const spawns = normalizeSpawns(body.spawnPoints || [], width, height, blockedCells);
  const now = Date.now();

  const cellsJson = JSON.stringify(cells);
  const edgesJson = JSON.stringify(edges);
  const zonesJson = JSON.stringify(zones);
  const spawnsJson = JSON.stringify(spawns);

  try {
    await env.DB.batch([
      env.DB.prepare(`
        DELETE FROM map_zone_cells
        WHERE zone_id IN (SELECT id FROM map_zones WHERE map_template_id = ?)
      `).bind(mapId),
      env.DB.prepare('DELETE FROM map_zones WHERE map_template_id = ?').bind(mapId),
      env.DB.prepare('DELETE FROM map_cells WHERE map_template_id = ?').bind(mapId),
      env.DB.prepare('DELETE FROM map_edges WHERE map_template_id = ?').bind(mapId),
      env.DB.prepare('DELETE FROM map_spawn_points WHERE map_template_id = ?').bind(mapId),
      env.DB.prepare(`
        INSERT INTO map_cells (map_template_id, x, y, is_walkable, terrain_key, gm_notes)
        SELECT ?,
               CAST(json_extract(value, '$.x') AS INTEGER),
               CAST(json_extract(value, '$.y') AS INTEGER),
               CAST(json_extract(value, '$.isWalkable') AS INTEGER),
               json_extract(value, '$.terrainKey'),
               json_extract(value, '$.gmNotes')
        FROM json_each(?)
      `).bind(mapId, cellsJson),
      env.DB.prepare(`
        INSERT INTO map_edges
          (id, map_template_id, x, y, direction, edge_type, blocks_movement, door_default_state, gm_notes, created_at, updated_at)
        SELECT json_extract(value, '$.id'), ?,
               CAST(json_extract(value, '$.x') AS INTEGER),
               CAST(json_extract(value, '$.y') AS INTEGER),
               json_extract(value, '$.direction'),
               json_extract(value, '$.edgeType'),
               CAST(json_extract(value, '$.blocksMovement') AS INTEGER),
               json_extract(value, '$.doorDefaultState'),
               json_extract(value, '$.gmNotes'), ?, ?
        FROM json_each(?)
      `).bind(mapId, now, now, edgesJson),
      env.DB.prepare(`
        INSERT INTO map_zones
          (id, map_template_id, name, zone_type, player_visible_default, gm_notes, created_at, updated_at)
        SELECT json_extract(value, '$.id'), ?,
               json_extract(value, '$.name'),
               json_extract(value, '$.zoneType'),
               CAST(json_extract(value, '$.playerVisibleDefault') AS INTEGER),
               json_extract(value, '$.gmNotes'), ?, ?
        FROM json_each(?)
      `).bind(mapId, now, now, zonesJson),
      env.DB.prepare(`
        INSERT INTO map_zone_cells (zone_id, x, y)
        SELECT json_extract(zone.value, '$.id'),
               CAST(json_extract(cell.value, '$.x') AS INTEGER),
               CAST(json_extract(cell.value, '$.y') AS INTEGER)
        FROM json_each(?) AS zone
        JOIN json_each(json_extract(zone.value, '$.cells')) AS cell
      `).bind(zonesJson),
      env.DB.prepare(`
        INSERT INTO map_spawn_points
          (id, map_template_id, name, x, y, spawn_type, gm_notes, created_at, updated_at)
        SELECT json_extract(value, '$.id'), ?,
               json_extract(value, '$.name'),
               CAST(json_extract(value, '$.x') AS INTEGER),
               CAST(json_extract(value, '$.y') AS INTEGER),
               json_extract(value, '$.spawnType'),
               json_extract(value, '$.gmNotes'), ?, ?
        FROM json_each(?)
      `).bind(mapId, now, now, spawnsJson),
      env.DB.prepare(`
        UPDATE map_templates
        SET version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).bind(now, mapId, expectedVersion)
    ]);
  } catch (error) {
    console.error('Map editor snapshot save failed', {
      mapId,
      name: error?.name || 'Error',
      message: String(error?.message || error)
    });
    return apiError('Map Grid 儲存失敗；原有 Map 定義未應被部分套用。請 Reload 後再試。', 409, 'MAP_EDITOR_SAVE_FAILED');
  }

  const refreshed = await readTemplate(env, mapId);
  return json({
    ok: true,
    mapTemplate: templatePayload(refreshed),
    counts: {
      cellOverrides: cells.length,
      edges: edges.length,
      zones: zones.length,
      zoneCells: zones.reduce((total, zone) => total + zone.cells.length, 0),
      spawnPoints: spawns.length
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const match = pathname.match(/^\/api\/gm\/world\/maps\/([^/]+)\/editor$/);
    if (!match) return baseWorker.fetch(request, env);

    const mapId = decodeURIComponent(match[1]);
    try {
      if (request.method === 'GET') return await loadGridEditor(request, env, mapId);
      if (request.method === 'PUT') return await saveGridEditor(request, env, mapId);
      return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    } catch (error) {
      console.error('World Map editor API error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message || 'Map editor request failed.', error.status, error.code || 'MAP_EDITOR_ERROR');
      if (String(error?.message || '').includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Map editor service 暫時無法使用。', 500, 'MAP_EDITOR_SERVICE_ERROR');
    }
  }
};
