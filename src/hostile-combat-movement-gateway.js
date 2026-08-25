import baseWorker from './runtime-door-gateway.js';

const GM_ROLES = new Set(['gm', 'admin']);
const HOSTILE_TYPES = new Set(['monster_instance', 'boss_instance']);
let hostileSchemaPromise = null;

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
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
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

async function ensureCombatRuntime(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/gm/combat', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (response.ok) return;
  const payload = await response.json().catch(() => null);
  throw Object.assign(new Error(payload?.error?.message || 'Combat runtime unavailable.'), {
    status: response.status,
    code: payload?.error?.code || 'COMBAT_RUNTIME_UNAVAILABLE'
  });
}

async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try { return await request.json(); }
  catch { throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' }); }
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw Object.assign(new Error(`${label} 必須為整數。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

function mapKey(x, y) { return `${x},${y}`; }
function edgeKey(x, y, direction) { return `${x},${y},${direction}`; }

function canonicalEdgeSlot(x, y, direction, width, height) {
  if (direction === 'E' && x < width - 1) return { x: x + 1, y, direction: 'W' };
  if (direction === 'S' && y < height - 1) return { x, y: y + 1, direction: 'N' };
  return { x, y, direction };
}

function directionBetween(fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  return '';
}

async function currentCombatant(env) {
  return env.DB.prepare(`
    SELECT c.id AS combat_id, c.round_number, c.current_turn_index,
           cb.id AS combatant_id, cb.entity_type, cb.entity_id, cb.display_name,
           cb.action_available, cb.move_available, cb.turn_completed
    FROM combats c
    JOIN combatants cb
      ON cb.combat_id = c.id AND cb.initiative_order = c.current_turn_index
    WHERE c.status = 'active'
    ORDER BY c.started_at DESC
    LIMIT 1
  `).first();
}

async function hostileStatus(env, entityType, entityId) {
  if (entityType === 'monster_instance') {
    return env.DB.prepare('SELECT id, display_name AS name, status FROM monster_instances WHERE id = ? LIMIT 1').bind(entityId).first();
  }
  return env.DB.prepare('SELECT id, display_name AS name, status FROM boss_instances WHERE id = ? LIMIT 1').bind(entityId).first();
}

async function hostileActivePosition(env, entityType, entityId) {
  const rows = await env.DB.prepare(`
    SELECT rep.id AS position_id, rep.map_instance_id, rep.x, rep.y,
           rmi.width, rmi.height, rmi.map_name_snapshot, rmi.location_name_snapshot,
           rmi.scene_id, rmi.status AS map_status
    FROM runtime_entity_positions rep
    JOIN runtime_map_instances rmi ON rmi.id = rep.map_instance_id
    WHERE rep.entity_type = ? AND rep.entity_id = ? AND rmi.status = 'active'
    ORDER BY rep.updated_at DESC, rep.id
  `).bind(entityType, entityId).all();
  return rows.results || [];
}

async function loadMapModel(env, position) {
  const [cells, edges, positions] = await Promise.all([
    env.DB.prepare(`
      SELECT x, y, is_walkable, terrain_key
      FROM runtime_map_cells WHERE map_instance_id = ?
    `).bind(position.map_instance_id).all(),
    env.DB.prepare(`
      SELECT id, x, y, direction, edge_type, blocks_movement, door_state
      FROM runtime_map_edges WHERE map_instance_id = ?
    `).bind(position.map_instance_id).all(),
    env.DB.prepare(`
      SELECT entity_type, entity_id, x, y
      FROM runtime_entity_positions WHERE map_instance_id = ?
    `).bind(position.map_instance_id).all()
  ]);
  return {
    width: Number(position.width),
    height: Number(position.height),
    cellMap: new Map((cells.results || []).map(row => [mapKey(Number(row.x), Number(row.y)), {
      isWalkable: Boolean(row.is_walkable), terrainKey: row.terrain_key || 'floor'
    }])),
    edgeMap: new Map((edges.results || []).map(row => [edgeKey(Number(row.x), Number(row.y), row.direction), {
      id: row.id, x: Number(row.x), y: Number(row.y), direction: row.direction,
      edgeType: row.edge_type, blocksMovement: Boolean(row.blocks_movement), doorState: row.door_state
    }])),
    positions: (positions.results || []).map(row => ({
      entityType: row.entity_type, entityId: row.entity_id,
      x: Number(row.x), y: Number(row.y)
    }))
  };
}

function cellWalkable(model, x, y) {
  if (x < 0 || y < 0 || x >= model.width || y >= model.height) return false;
  return model.cellMap.get(mapKey(x, y))?.isWalkable !== false;
}

function blockingEdge(model, fromX, fromY, toX, toY) {
  const direction = directionBetween(fromX, fromY, toX, toY);
  if (!direction) return null;
  const slot = canonicalEdgeSlot(fromX, fromY, direction, model.width, model.height);
  const edge = model.edgeMap.get(edgeKey(slot.x, slot.y, slot.direction)) || null;
  return edge?.blocksMovement ? edge : null;
}

function orthogonalPathOpen(model, fromX, fromY, toX, toY) {
  if (!cellWalkable(model, toX, toY)) return false;
  return !blockingEdge(model, fromX, fromY, toX, toY);
}

function movementLegality(model, selfType, selfId, fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === 0) return { ok: false, code: 'MOVE_SAME_CELL', message: 'Move 必須前往相鄰 Cell。' };
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) {
    return { ok: false, code: 'MOVE_NOT_ADJACENT', message: '一個 Move 只可以移動到八方向其中一個相鄰 Cell。' };
  }
  if (toX < 0 || toY < 0 || toX >= model.width || toY >= model.height) {
    return { ok: false, code: 'MOVE_OUT_OF_BOUNDS', message: '目的 Cell 超出 Map 範圍。' };
  }
  if (!cellWalkable(model, toX, toY)) {
    return { ok: false, code: 'MOVE_CELL_BLOCKED', message: '目的 Cell 不可通行。' };
  }
  const occupied = model.positions.find(position => position.x === toX && position.y === toY
    && !(position.entityType === selfType && position.entityId === selfId));
  if (occupied) return { ok: false, code: 'MOVE_CELL_OCCUPIED', message: '目的 Cell 已被另一個 Entity 佔用。' };

  if (dx === 0 || dy === 0) {
    if (blockingEdge(model, fromX, fromY, toX, toY)) {
      return { ok: false, code: 'MOVE_EDGE_BLOCKED', message: '牆或目前關閉的門阻擋移動。' };
    }
    return { ok: true };
  }

  const viaHorizontal = orthogonalPathOpen(model, fromX, fromY, toX, fromY)
    && orthogonalPathOpen(model, toX, fromY, toX, toY);
  const viaVertical = orthogonalPathOpen(model, fromX, fromY, fromX, toY)
    && orthogonalPathOpen(model, fromX, toY, toX, toY);
  if (!viaHorizontal && !viaVertical) {
    return { ok: false, code: 'MOVE_DIAGONAL_CORNER_BLOCKED', message: '對角移動不可穿過完全封閉的牆角。' };
  }
  return { ok: true };
}

function legalDestinations(model, hostile, position) {
  if (!hostile.moveAvailable) return [];
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = Number(position.x) + dx;
      const y = Number(position.y) + dy;
      const legal = movementLegality(model, hostile.entityType, hostile.entityId, Number(position.x), Number(position.y), x, y);
      if (legal.ok) result.push({ x, y, dx, dy });
    }
  }
  return result;
}

async function ensureHostileSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!hostileSchemaPromise) {
    hostileSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_hostile_movement_log (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('monster_instance', 'boss_instance')),
        entity_id TEXT NOT NULL,
        combat_id TEXT NOT NULL,
        combatant_id TEXT NOT NULL,
        combat_round_number INTEGER NOT NULL,
        from_x INTEGER NOT NULL,
        from_y INTEGER NOT NULL,
        to_x INTEGER NOT NULL,
        to_y INTEGER NOT NULL,
        moved_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (combatant_id) REFERENCES combatants(id) ON DELETE CASCADE,
        FOREIGN KEY (moved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_hostile_movement_log_combat ON runtime_hostile_movement_log(combat_id, combat_round_number, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_hostile_movement_log_entity ON runtime_hostile_movement_log(entity_type, entity_id, created_at)')
    ]).catch(error => {
      hostileSchemaPromise = null;
      throw error;
    });
  }
  await hostileSchemaPromise;
}

async function hostileContext(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureCombatRuntime(request, env);
  const current = await currentCombatant(env);
  if (!current) return json({ ok: true, hostile: null, reason: 'NO_ACTIVE_COMBAT' });
  if (!HOSTILE_TYPES.has(current.entity_type)) {
    return json({ ok: true, hostile: null, reason: 'CURRENT_TURN_NOT_HOSTILE', combatId: current.combat_id, roundNumber: Number(current.round_number) });
  }
  const entity = await hostileStatus(env, current.entity_type, current.entity_id);
  if (!entity || entity.status !== 'active') {
    return json({ ok: true, hostile: null, reason: 'HOSTILE_NOT_ACTIVE', combatId: current.combat_id, roundNumber: Number(current.round_number) });
  }
  const positions = await hostileActivePosition(env, current.entity_type, current.entity_id);
  if (!positions.length) {
    return json({ ok: true, hostile: null, reason: 'HOSTILE_NOT_POSITIONED', combatId: current.combat_id, roundNumber: Number(current.round_number) });
  }
  if (positions.length > 1) return apiError('Current hostile 同時存在於多個 Active Runtime Map。', 409, 'MULTIPLE_ACTIVE_MAP_POSITIONS');
  const position = positions[0];
  const model = await loadMapModel(env, position);
  const hostile = {
    combatId: current.combat_id,
    combatantId: current.combatant_id,
    roundNumber: Number(current.round_number),
    entityType: current.entity_type,
    entityId: current.entity_id,
    displayName: entity.name || current.display_name,
    moveAvailable: Boolean(current.move_available),
    actionAvailable: Boolean(current.action_available),
    position: { x: Number(position.x), y: Number(position.y) },
    map: {
      id: position.map_instance_id,
      mapName: position.map_name_snapshot,
      locationName: position.location_name_snapshot,
      width: Number(position.width),
      height: Number(position.height)
    }
  };
  return json({ ok: true, hostile, legalMoves: legalDestinations(model, hostile, position) });
}

async function moveCurrentHostile(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureCombatRuntime(request, env);
  const current = await currentCombatant(env);
  if (!current) return apiError('目前沒有 Active Combat。', 409, 'NO_ACTIVE_COMBAT');
  if (!HOSTILE_TYPES.has(current.entity_type)) return apiError('Current Turn 唔係 Monster / Boss。', 409, 'CURRENT_TURN_NOT_HOSTILE');
  if (!Boolean(current.move_available)) return apiError('Current hostile 嘅 Move 已經使用。', 409, 'MOVE_ALREADY_SPENT');
  const entity = await hostileStatus(env, current.entity_type, current.entity_id);
  if (!entity || entity.status !== 'active') return apiError('Current hostile 已非 active。', 409, 'HOSTILE_NOT_ACTIVE');
  const positions = await hostileActivePosition(env, current.entity_type, current.entity_id);
  if (!positions.length) return apiError('Current hostile 尚未放置於 Active Runtime Map。', 409, 'HOSTILE_NOT_POSITIONED');
  if (positions.length > 1) return apiError('Current hostile 同時存在於多個 Active Runtime Map。', 409, 'MULTIPLE_ACTIVE_MAP_POSITIONS');
  const position = positions[0];
  const body = await readBody(request);
  const toX = integer(body?.x, 'X');
  const toY = integer(body?.y, 'Y');
  const model = await loadMapModel(env, position);
  const legal = movementLegality(
    model, current.entity_type, current.entity_id,
    Number(position.x), Number(position.y), toX, toY
  );
  if (!legal.ok) return apiError(legal.message, 409, legal.code);

  await ensureHostileSchema(env);
  const now = Date.now();
  const auditId = `hostile_move_${crypto.randomUUID()}`;
  const fromX = Number(position.x);
  const fromY = Number(position.y);
  const expectedRound = Number(current.round_number);
  const expectedIndex = Number(current.current_turn_index);
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE combatants
      SET move_available = 0, updated_at = ?
      WHERE id = ? AND combat_id = ? AND entity_type = ? AND entity_id = ? AND move_available = 1
        AND EXISTS (
          SELECT 1 FROM combats
          WHERE id = ? AND status = 'active'
            AND round_number = ? AND current_turn_index = ?
        )
        AND EXISTS (
          SELECT 1
          FROM runtime_entity_positions rep
          JOIN runtime_map_instances rmi ON rmi.id = rep.map_instance_id
          WHERE rep.id = ? AND rep.map_instance_id = ?
            AND rep.entity_type = ? AND rep.entity_id = ?
            AND rep.x = ? AND rep.y = ? AND rmi.status = 'active'
        )
        AND NOT EXISTS (
          SELECT 1 FROM runtime_entity_positions occupied
          WHERE occupied.map_instance_id = ? AND occupied.x = ? AND occupied.y = ?
            AND NOT (occupied.entity_type = ? AND occupied.entity_id = ?)
        )
    `).bind(
      now, current.combatant_id, current.combat_id, current.entity_type, current.entity_id,
      current.combat_id, expectedRound, expectedIndex,
      position.position_id, position.map_instance_id, current.entity_type, current.entity_id, fromX, fromY,
      position.map_instance_id, toX, toY, current.entity_type, current.entity_id
    ),
    env.DB.prepare(`
      UPDATE runtime_entity_positions
      SET x = ?, y = ?, placed_by_user_id = ?, updated_at = ?
      WHERE id = ? AND map_instance_id = ? AND entity_type = ? AND entity_id = ?
        AND x = ? AND y = ?
        AND EXISTS (
          SELECT 1 FROM combatants cb
          JOIN combats c ON c.id = cb.combat_id
          WHERE cb.id = ? AND cb.combat_id = ?
            AND cb.entity_type = ? AND cb.entity_id = ?
            AND cb.move_available = 0 AND cb.updated_at = ?
            AND c.status = 'active' AND c.round_number = ? AND c.current_turn_index = ?
        )
    `).bind(
      toX, toY, user.id, now,
      position.position_id, position.map_instance_id, current.entity_type, current.entity_id,
      fromX, fromY,
      current.combatant_id, current.combat_id, current.entity_type, current.entity_id,
      now, expectedRound, expectedIndex
    ),
    env.DB.prepare(`
      INSERT INTO runtime_hostile_movement_log (
        id, map_instance_id, entity_type, entity_id,
        combat_id, combatant_id, combat_round_number,
        from_x, from_y, to_x, to_y, moved_by_user_id, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM runtime_entity_positions
        WHERE id = ? AND x = ? AND y = ? AND updated_at = ?
      )
        AND EXISTS (
          SELECT 1 FROM combatants
          WHERE id = ? AND combat_id = ? AND move_available = 0 AND updated_at = ?
        )
    `).bind(
      auditId, position.map_instance_id, current.entity_type, current.entity_id,
      current.combat_id, current.combatant_id, expectedRound,
      fromX, fromY, toX, toY, user.id, now,
      position.position_id, toX, toY, now,
      current.combatant_id, current.combat_id, now
    )
  ]);

  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[2]?.meta?.changes || 0) !== 1) {
    return apiError('Combat / Map state 已由另一個操作更新，請重新載入。', 409, 'COMBAT_MAP_STATE_CHANGED');
  }

  return json({
    ok: true,
    auditId,
    movement: {
      combatId: current.combat_id,
      combatantId: current.combatant_id,
      roundNumber: expectedRound,
      entityType: current.entity_type,
      entityId: current.entity_id,
      displayName: entity.name || current.display_name,
      mapInstanceId: position.map_instance_id,
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      moveAvailable: false
    }
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/combat/hostile-movement') return await hostileContext(request, env);
      if (pathname === '/api/gm/combat/hostile-movement/move') return await moveCurrentHostile(request, env);
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Hostile Combat movement gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'HOSTILE_MOVEMENT_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Hostile Combat movement service 暫時無法使用。', 500, 'HOSTILE_MOVEMENT_SERVICE_ERROR');
    }
  }
};
