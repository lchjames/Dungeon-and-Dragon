import baseWorker from './runtime-map.js';
import { defaultLifeState, loadCharacterLifeState } from './combat-life.js';

const DIRECTIONS = Object.freeze({
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
});
let movementSchemaPromise = null;

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

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (String(user.status || '').toLowerCase() !== 'active') {
    throw Object.assign(new Error('此 User 目前不可使用 Map。'), { status: 403, code: 'USER_NOT_ACTIVE' });
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

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    throw Object.assign(new Error(`${label} 必須為整數。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

function isMissingRuntimeTable(errorValue) {
  const message = String(errorValue?.message || errorValue).toLowerCase();
  return message.includes('no such table') && (
    message.includes('runtime_map_instances') ||
    message.includes('runtime_entity_positions') ||
    message.includes('runtime_exploration_state')
  );
}

async function ensureMovementSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!movementSchemaPromise) {
    movementSchemaPromise = env.DB.batch([
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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_movement_log (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type = 'character'),
        entity_id TEXT NOT NULL,
        from_x INTEGER NOT NULL,
        from_y INTEGER NOT NULL,
        to_x INTEGER NOT NULL,
        to_y INTEGER NOT NULL,
        movement_mode TEXT NOT NULL CHECK (movement_mode IN ('exploration', 'combat')),
        exploration_round_number INTEGER,
        combat_id TEXT,
        combat_round_number INTEGER,
        actor_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (entity_id) REFERENCES characters(id) ON DELETE CASCADE,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE SET NULL,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_exploration_character_round ON runtime_exploration_character_state(map_instance_id, round_number, turn_completed, character_id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_movement_entity ON runtime_movement_log(entity_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_movement_map ON runtime_movement_log(map_instance_id, created_at)')
    ]).catch(error => {
      movementSchemaPromise = null;
      throw error;
    });
  }
  await movementSchemaPromise;
}

async function ownedCharacter(env, userId, characterId) {
  return env.DB.prepare(`
    SELECT id, name, status, owner_user_id
    FROM characters
    WHERE id = ? AND owner_user_id = ?
    LIMIT 1
  `).bind(characterId, userId).first();
}

async function safeLifeState(env, characterId) {
  try {
    return await loadCharacterLifeState(env, characterId);
  } catch (errorValue) {
    const message = String(errorValue?.message || errorValue).toLowerCase();
    if (message.includes('no such table') && message.includes('character_life_states')) {
      return defaultLifeState(characterId);
    }
    throw errorValue;
  }
}

async function activePositionsForCharacter(env, characterId) {
  const rows = await env.DB.prepare(`
    SELECT rep.id AS position_id, rep.map_instance_id, rep.x, rep.y, rep.visibility_mode,
           rmi.scene_run_id, rmi.scenario_run_id, rmi.scene_id,
           rmi.location_id, rmi.map_template_id, rmi.source_map_version,
           rmi.map_name_snapshot, rmi.location_name_snapshot,
           rmi.width, rmi.height, rmi.background_asset_ref,
           s.name AS scene_name, sc.id AS scenario_id, sc.name AS scenario_name
    FROM runtime_entity_positions rep
    JOIN runtime_map_instances rmi ON rmi.id = rep.map_instance_id
    JOIN scenes s ON s.id = rmi.scene_id
    JOIN scenarios sc ON sc.id = s.scenario_id
    WHERE rep.entity_type = 'character'
      AND rep.entity_id = ?
      AND rmi.status = 'active'
    ORDER BY rep.updated_at DESC, rmi.created_at DESC, rmi.id
  `).bind(characterId).all();
  return rows.results || [];
}

async function playerWorldOverview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  const user = await requireUser(request, env);
  try {
    await ensureMovementSchema(env);
    const rows = await env.DB.prepare(`
      SELECT c.id, c.name, c.status,
             COUNT(rmi.id) AS active_map_count,
             MAX(rep.updated_at) AS last_position_update
      FROM characters c
      LEFT JOIN runtime_entity_positions rep
        ON rep.entity_type = 'character' AND rep.entity_id = c.id
      LEFT JOIN runtime_map_instances rmi
        ON rmi.id = rep.map_instance_id AND rmi.status = 'active'
      WHERE c.owner_user_id = ?
      GROUP BY c.id, c.name, c.status
      ORDER BY c.name COLLATE NOCASE, c.created_at, c.id
    `).bind(user.id).all();

    return json({
      ok: true,
      characters: (rows.results || []).map(row => ({
        id: row.id,
        name: row.name,
        status: row.status,
        activeMapCount: Number(row.active_map_count || 0),
        hasCurrentMap: Number(row.active_map_count || 0) === 1,
        locationConflict: Number(row.active_map_count || 0) > 1,
        lastPositionUpdate: row.last_position_update
      }))
    });
  } catch (errorValue) {
    if (isMissingRuntimeTable(errorValue)) {
      const rows = await env.DB.prepare(`
        SELECT id, name, status FROM characters WHERE owner_user_id = ? ORDER BY name COLLATE NOCASE, created_at, id
      `).bind(user.id).all();
      return json({
        ok: true,
        characters: (rows.results || []).map(row => ({
          id: row.id, name: row.name, status: row.status,
          activeMapCount: 0, hasCurrentMap: false, locationConflict: false, lastPositionUpdate: null
        }))
      });
    }
    throw errorValue;
  }
}

async function loadActiveCombat(env) {
  try {
    return await env.DB.prepare(`
      SELECT id, round_number, current_turn_index, updated_at
      FROM combats WHERE status = 'active' ORDER BY started_at DESC LIMIT 1
    `).first();
  } catch (errorValue) {
    const message = String(errorValue?.message || errorValue).toLowerCase();
    if (message.includes('no such table') && message.includes('combats')) return null;
    throw errorValue;
  }
}

async function combatStateForCharacter(env, combat, characterId, userId) {
  if (!combat) return null;
  const combatant = await env.DB.prepare(`
    SELECT id, entity_type, entity_id, controller_user_id, display_name,
           initiative_order, action_available, move_available, turn_completed
    FROM combatants
    WHERE combat_id = ? AND entity_type = 'character' AND entity_id = ?
    LIMIT 1
  `).bind(combat.id, characterId).first();
  if (!combatant) {
    return {
      combatId: combat.id,
      roundNumber: Number(combat.round_number),
      currentTurnIndex: Number(combat.current_turn_index),
      participant: false,
      isOwnTurn: false,
      actionAvailable: false,
      moveAvailable: false,
      turnCompleted: false
    };
  }
  const ownTurn = Number(combatant.initiative_order) === Number(combat.current_turn_index)
    && combatant.controller_user_id === userId;
  return {
    combatId: combat.id,
    combatantId: combatant.id,
    roundNumber: Number(combat.round_number),
    currentTurnIndex: Number(combat.current_turn_index),
    initiativeOrder: Number(combatant.initiative_order),
    participant: true,
    isOwnTurn: ownTurn,
    actionAvailable: ownTurn && Boolean(combatant.action_available),
    moveAvailable: ownTurn && Boolean(combatant.move_available),
    turnCompleted: Boolean(combatant.turn_completed)
  };
}

async function ensureExplorationParticipants(env, mapInstanceId) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO runtime_exploration_state (map_instance_id, round_number, updated_at)
    VALUES (?, 1, ?)
  `).bind(mapInstanceId, now).run();
  const state = await env.DB.prepare(`
    SELECT map_instance_id, round_number, updated_at
    FROM runtime_exploration_state WHERE map_instance_id = ?
  `).bind(mapInstanceId).first();
  const round = Number(state?.round_number || 1);

  await env.DB.prepare(`
    INSERT OR IGNORE INTO runtime_exploration_character_state
      (map_instance_id, character_id, round_number, action_available, move_available, turn_completed, updated_at)
    SELECT ?, c.id, ?, 1, 1, 0, ?
    FROM runtime_entity_positions rep
    JOIN characters c ON c.id = rep.entity_id
    LEFT JOIN character_life_states cls ON cls.character_id = c.id
    WHERE rep.map_instance_id = ?
      AND rep.entity_type = 'character'
      AND c.status = 'active'
      AND c.owner_user_id IS NOT NULL
      AND COALESCE(cls.life_state, 'alive') = 'alive'
  `).bind(mapInstanceId, round, now, mapInstanceId).run();

  await env.DB.prepare(`
    UPDATE runtime_exploration_character_state
    SET round_number = ?, action_available = 1, move_available = 1,
        turn_completed = 0, updated_at = ?
    WHERE map_instance_id = ? AND round_number <> ?
  `).bind(round, now, mapInstanceId, round).run();

  return env.DB.prepare(`
    SELECT map_instance_id, round_number, updated_at
    FROM runtime_exploration_state WHERE map_instance_id = ?
  `).bind(mapInstanceId).first();
}

async function explorationCharacterState(env, mapInstanceId, characterId) {
  const root = await ensureExplorationParticipants(env, mapInstanceId);
  const row = await env.DB.prepare(`
    SELECT map_instance_id, character_id, round_number, action_available, move_available,
           turn_completed, updated_at
    FROM runtime_exploration_character_state
    WHERE map_instance_id = ? AND character_id = ?
    LIMIT 1
  `).bind(mapInstanceId, characterId).first();
  return {
    roundNumber: Number(root?.round_number || 1),
    actionAvailable: Boolean(row?.action_available),
    moveAvailable: Boolean(row?.move_available),
    turnCompleted: Boolean(row?.turn_completed),
    tracked: Boolean(row)
  };
}

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

function mapKey(x, y) {
  return `${x},${y}`;
}

function edgeKey(x, y, direction) {
  return `${x},${y},${direction}`;
}

async function loadMapModel(env, mapPosition) {
  const [cells, edges, positions, zones, zoneCells] = await Promise.all([
    env.DB.prepare(`
      SELECT x, y, is_walkable, terrain_key
      FROM runtime_map_cells WHERE map_instance_id = ?
      ORDER BY y, x
    `).bind(mapPosition.map_instance_id).all(),
    env.DB.prepare(`
      SELECT id, x, y, direction, edge_type, blocks_movement, door_state
      FROM runtime_map_edges WHERE map_instance_id = ?
      ORDER BY y, x, direction, id
    `).bind(mapPosition.map_instance_id).all(),
    env.DB.prepare(`
      SELECT rep.id, rep.entity_type, rep.entity_id, rep.x, rep.y, rep.visibility_mode,
             c.name AS character_name,
             mi.display_name AS monster_name,
             bi.display_name AS boss_name
      FROM runtime_entity_positions rep
      LEFT JOIN characters c ON rep.entity_type = 'character' AND c.id = rep.entity_id
      LEFT JOIN monster_instances mi ON rep.entity_type = 'monster_instance' AND mi.id = rep.entity_id
      LEFT JOIN boss_instances bi ON rep.entity_type = 'boss_instance' AND bi.id = rep.entity_id
      WHERE rep.map_instance_id = ?
      ORDER BY rep.y, rep.x, rep.entity_type, rep.entity_id
    `).bind(mapPosition.map_instance_id).all(),
    env.DB.prepare(`
      SELECT id, name, zone_type, player_visible
      FROM runtime_map_zones
      WHERE map_instance_id = ? AND player_visible = 1
      ORDER BY created_at, id
    `).bind(mapPosition.map_instance_id).all(),
    env.DB.prepare(`
      SELECT rzc.runtime_zone_id, rzc.x, rzc.y
      FROM runtime_map_zone_cells rzc
      JOIN runtime_map_zones rz ON rz.id = rzc.runtime_zone_id
      WHERE rz.map_instance_id = ? AND rz.player_visible = 1
      ORDER BY rzc.runtime_zone_id, rzc.y, rzc.x
    `).bind(mapPosition.map_instance_id).all()
  ]);

  const cellMap = new Map((cells.results || []).map(row => [mapKey(Number(row.x), Number(row.y)), {
    x: Number(row.x), y: Number(row.y), isWalkable: Boolean(row.is_walkable), terrainKey: row.terrain_key || 'floor'
  }]));
  const edgeMap = new Map((edges.results || []).map(row => [edgeKey(Number(row.x), Number(row.y), row.direction), {
    id: row.id, x: Number(row.x), y: Number(row.y), direction: row.direction,
    edgeType: row.edge_type, blocksMovement: Boolean(row.blocks_movement), doorState: row.door_state
  }]));
  const positionRows = (positions.results || []).map(row => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    x: Number(row.x),
    y: Number(row.y),
    visibilityMode: row.visibility_mode,
    displayName: row.character_name || row.monster_name || row.boss_name || row.entity_id
  }));
  const zoneCellsById = new Map();
  for (const row of zoneCells.results || []) {
    if (!zoneCellsById.has(row.runtime_zone_id)) zoneCellsById.set(row.runtime_zone_id, []);
    zoneCellsById.get(row.runtime_zone_id).push({ x: Number(row.x), y: Number(row.y) });
  }
  return {
    width: Number(mapPosition.width),
    height: Number(mapPosition.height),
    cellMap,
    edgeMap,
    positions: positionRows,
    zones: (zones.results || []).map(row => ({
      id: row.id,
      name: row.name,
      zoneType: row.zone_type,
      cells: zoneCellsById.get(row.id) || []
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

function movementLegality(model, selfEntityId, fromX, fromY, toX, toY) {
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
    && !(position.entityType === 'character' && position.entityId === selfEntityId));
  if (occupied) {
    return { ok: false, code: 'MOVE_CELL_OCCUPIED', message: '目的 Cell 已被另一個 Entity 佔用。' };
  }

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

function legalDestinations(model, characterId, position, canMove) {
  if (!canMove) return [];
  const destinations = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = Number(position.x) + dx;
      const y = Number(position.y) + dy;
      const legal = movementLegality(model, characterId, Number(position.x), Number(position.y), x, y);
      if (legal.ok) destinations.push({ x, y, dx, dy });
    }
  }
  return destinations;
}

function publicTokens(model, ownCharacterId) {
  return model.positions.filter(position => {
    if (position.entityType === 'character') {
      return position.entityId === ownCharacterId || position.visibilityMode !== 'hidden';
    }
    return position.visibilityMode === 'visible';
  }).map(position => ({
    entityType: position.entityType,
    entityId: position.entityId,
    displayName: position.displayName,
    x: position.x,
    y: position.y,
    own: position.entityType === 'character' && position.entityId === ownCharacterId
  }));
}

function publicEdges(model) {
  return [...model.edgeMap.values()].map(edge => ({
    x: edge.x,
    y: edge.y,
    direction: edge.direction,
    edgeType: edge.edgeType,
    blocksMovement: edge.blocksMovement,
    doorState: edge.edgeType === 'door'
      ? (edge.doorState === 'locked' ? 'closed' : edge.doorState)
      : null
  }));
}

async function characterMapContext(request, env, characterId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  const user = await requireUser(request, env);
  await ensureMovementSchema(env);
  const character = await ownedCharacter(env, user.id, characterId);
  if (!character) return apiError('Character 不存在或唔屬於你。', 404, 'CHARACTER_NOT_FOUND');
  const life = await safeLifeState(env, character.id);
  const positions = await activePositionsForCharacter(env, character.id);
  if (!positions.length) {
    return json({
      ok: true,
      character: { id: character.id, name: character.name, status: character.status, lifeState: life.lifeState },
      map: null,
      reason: 'CHARACTER_NOT_POSITIONED'
    });
  }
  if (positions.length > 1) {
    return apiError('Character 同時存在於多個 Active Runtime Map；請由 GM 修正位置。', 409, 'MULTIPLE_ACTIVE_MAP_POSITIONS');
  }

  const position = positions[0];
  const model = await loadMapModel(env, position);
  const activeCombat = await loadActiveCombat(env);
  const combat = await combatStateForCharacter(env, activeCombat, character.id, user.id);
  let turn;
  if (activeCombat) {
    turn = {
      mode: 'combat',
      roundNumber: Number(activeCombat.round_number),
      participant: Boolean(combat?.participant),
      isOwnTurn: Boolean(combat?.isOwnTurn),
      actionAvailable: life.lifeState === 'alive' && Boolean(combat?.actionAvailable),
      moveAvailable: life.lifeState === 'alive' && Boolean(combat?.moveAvailable),
      turnCompleted: Boolean(combat?.turnCompleted),
      combatId: activeCombat.id
    };
  } else {
    const exploration = await explorationCharacterState(env, position.map_instance_id, character.id);
    turn = {
      mode: 'exploration',
      roundNumber: exploration.roundNumber,
      participant: exploration.tracked,
      isOwnTurn: exploration.tracked && !exploration.turnCompleted,
      actionAvailable: life.lifeState === 'alive' && exploration.actionAvailable && !exploration.turnCompleted,
      moveAvailable: life.lifeState === 'alive' && exploration.moveAvailable && !exploration.turnCompleted,
      turnCompleted: exploration.turnCompleted,
      combatId: null
    };
  }

  const canMove = character.status === 'active' && life.lifeState === 'alive' && turn.moveAvailable && turn.isOwnTurn;
  return json({
    ok: true,
    character: {
      id: character.id,
      name: character.name,
      status: character.status,
      lifeState: life.lifeState,
      characterLocked: life.characterLocked
    },
    map: {
      id: position.map_instance_id,
      scenarioRunId: position.scenario_run_id,
      sceneRunId: position.scene_run_id,
      scenarioId: position.scenario_id,
      scenarioName: position.scenario_name,
      sceneId: position.scene_id,
      sceneName: position.scene_name,
      locationId: position.location_id,
      locationName: position.location_name_snapshot,
      mapTemplateId: position.map_template_id,
      mapName: position.map_name_snapshot,
      sourceMapVersion: Number(position.source_map_version),
      width: Number(position.width),
      height: Number(position.height),
      backgroundAssetRef: position.background_asset_ref || ''
    },
    position: { x: Number(position.x), y: Number(position.y) },
    turn,
    legalMoves: legalDestinations(model, character.id, position, canMove),
    cells: [...model.cellMap.values()].map(cell => ({
      x: cell.x, y: cell.y, isWalkable: cell.isWalkable, terrainKey: cell.terrainKey
    })),
    edges: publicEdges(model),
    zones: model.zones,
    tokens: publicTokens(model, character.id)
  });
}

async function contextForMutation(request, env, characterId) {
  const user = await requireUser(request, env);
  await ensureMovementSchema(env);
  const character = await ownedCharacter(env, user.id, characterId);
  if (!character) return { error: apiError('Character 不存在或唔屬於你。', 404, 'CHARACTER_NOT_FOUND') };
  if (character.status !== 'active') return { error: apiError('Character 目前唔係 active。', 409, 'CHARACTER_NOT_ACTIVE') };
  const life = await safeLifeState(env, character.id);
  if (life.lifeState !== 'alive' || life.characterLocked) {
    return { error: apiError('只有 ALIVE 且未鎖定的 Character 可以移動。', 409, 'CHARACTER_CANNOT_MOVE') };
  }
  const positions = await activePositionsForCharacter(env, character.id);
  if (!positions.length) return { error: apiError('Character 尚未放置於 Active Runtime Map。', 409, 'CHARACTER_NOT_POSITIONED') };
  if (positions.length > 1) return { error: apiError('Character 同時存在於多個 Active Runtime Map；請由 GM 修正位置。', 409, 'MULTIPLE_ACTIVE_MAP_POSITIONS') };
  const position = positions[0];
  const model = await loadMapModel(env, position);
  const activeCombat = await loadActiveCombat(env);
  const combat = await combatStateForCharacter(env, activeCombat, character.id, user.id);
  return { user, character, life, position, model, activeCombat, combat };
}

async function moveCharacter(request, env, characterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const loaded = await contextForMutation(request, env, characterId);
  if (loaded.error) return loaded.error;
  const { user, character, position, model, activeCombat, combat } = loaded;
  const body = await readBody(request);
  const toX = integer(body.x, 'X');
  const toY = integer(body.y, 'Y');
  const fromX = Number(position.x);
  const fromY = Number(position.y);
  const legal = movementLegality(model, character.id, fromX, fromY, toX, toY);
  if (!legal.ok) return apiError(legal.message, 409, legal.code);
  const now = Date.now();
  const movementId = `movement_${crypto.randomUUID()}`;

  if (activeCombat) {
    if (!combat?.participant || !combat.isOwnTurn) {
      return apiError('Combat 進行中；而家唔係呢個 Character 嘅 Turn。', 403, 'NOT_OWN_TURN');
    }
    if (!combat.moveAvailable) return apiError('呢個 Turn 嘅 Move 已經使用。', 409, 'MOVE_ALREADY_SPENT');

    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE runtime_entity_positions
        SET x = ?, y = ?, updated_at = ?
        WHERE id = ? AND map_instance_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM runtime_entity_positions other
            WHERE other.map_instance_id = ? AND other.x = ? AND other.y = ? AND other.id <> ?
          )
          AND EXISTS (
            SELECT 1 FROM combatants cb JOIN combats co ON co.id = cb.combat_id
            WHERE cb.id = ? AND cb.entity_type = 'character' AND cb.entity_id = ?
              AND cb.controller_user_id = ? AND cb.move_available = 1
              AND co.id = ? AND co.status = 'active' AND co.round_number = ?
              AND co.current_turn_index = ? AND cb.initiative_order = co.current_turn_index
          )
      `).bind(
        toX, toY, now, position.position_id, position.map_instance_id,
        position.map_instance_id, toX, toY, position.position_id,
        combat.combatantId, character.id, user.id, activeCombat.id,
        Number(activeCombat.round_number), Number(activeCombat.current_turn_index)
      ),
      env.DB.prepare(`
        UPDATE combatants SET move_available = 0, updated_at = ?
        WHERE id = ? AND combat_id = ? AND controller_user_id = ?
          AND entity_type = 'character' AND entity_id = ? AND move_available = 1
          AND EXISTS (
            SELECT 1 FROM combats
            WHERE id = ? AND status = 'active' AND round_number = ? AND current_turn_index = ?
          )
      `).bind(
        now, combat.combatantId, activeCombat.id, user.id, character.id,
        activeCombat.id, Number(activeCombat.round_number), Number(activeCombat.current_turn_index)
      ),
      env.DB.prepare(`
        INSERT INTO runtime_movement_log
          (id, map_instance_id, entity_type, entity_id, from_x, from_y, to_x, to_y,
           movement_mode, exploration_round_number, combat_id, combat_round_number, actor_user_id, created_at)
        SELECT ?, ?, 'character', ?, ?, ?, ?, ?, 'combat', NULL, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM runtime_entity_positions WHERE id = ? AND x = ? AND y = ? AND updated_at = ?
        ) AND EXISTS (
          SELECT 1 FROM combatants WHERE id = ? AND move_available = 0 AND updated_at = ?
        )
      `).bind(
        movementId, position.map_instance_id, character.id, fromX, fromY, toX, toY,
        activeCombat.id, Number(activeCombat.round_number), user.id, now,
        position.position_id, toX, toY, now, combat.combatantId, now
      )
    ]);
    if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
      return apiError('Combat / Map state 已改變；Move 未完成，請重新載入。', 409, 'MAP_MOVE_STATE_CHANGED');
    }
  } else {
    const exploration = await explorationCharacterState(env, position.map_instance_id, character.id);
    if (!exploration.tracked || exploration.turnCompleted) {
      return apiError('呢個 Exploration Round 已經完成。', 409, 'EXPLORATION_TURN_COMPLETED');
    }
    if (!exploration.moveAvailable) return apiError('呢個 Exploration Round 嘅 Move 已經使用。', 409, 'MOVE_ALREADY_SPENT');

    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE runtime_entity_positions
        SET x = ?, y = ?, updated_at = ?
        WHERE id = ? AND map_instance_id = ?
          AND NOT EXISTS (SELECT 1 FROM combats WHERE status = 'active')
          AND NOT EXISTS (
            SELECT 1 FROM runtime_entity_positions other
            WHERE other.map_instance_id = ? AND other.x = ? AND other.y = ? AND other.id <> ?
          )
          AND EXISTS (
            SELECT 1 FROM runtime_exploration_character_state ecs
            JOIN runtime_exploration_state es ON es.map_instance_id = ecs.map_instance_id
            WHERE ecs.map_instance_id = ? AND ecs.character_id = ?
              AND ecs.round_number = ? AND es.round_number = ?
              AND ecs.move_available = 1 AND ecs.turn_completed = 0
          )
      `).bind(
        toX, toY, now, position.position_id, position.map_instance_id,
        position.map_instance_id, toX, toY, position.position_id,
        position.map_instance_id, character.id, exploration.roundNumber, exploration.roundNumber
      ),
      env.DB.prepare(`
        UPDATE runtime_exploration_character_state
        SET move_available = 0, updated_at = ?
        WHERE map_instance_id = ? AND character_id = ? AND round_number = ?
          AND move_available = 1 AND turn_completed = 0
          AND EXISTS (
            SELECT 1 FROM runtime_exploration_state
            WHERE map_instance_id = ? AND round_number = ?
          )
          AND NOT EXISTS (SELECT 1 FROM combats WHERE status = 'active')
      `).bind(
        now, position.map_instance_id, character.id, exploration.roundNumber,
        position.map_instance_id, exploration.roundNumber
      ),
      env.DB.prepare(`
        INSERT INTO runtime_movement_log
          (id, map_instance_id, entity_type, entity_id, from_x, from_y, to_x, to_y,
           movement_mode, exploration_round_number, combat_id, combat_round_number, actor_user_id, created_at)
        SELECT ?, ?, 'character', ?, ?, ?, ?, ?, 'exploration', ?, NULL, NULL, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM runtime_entity_positions WHERE id = ? AND x = ? AND y = ? AND updated_at = ?
        ) AND EXISTS (
          SELECT 1 FROM runtime_exploration_character_state
          WHERE map_instance_id = ? AND character_id = ? AND round_number = ?
            AND move_available = 0 AND updated_at = ?
        )
      `).bind(
        movementId, position.map_instance_id, character.id, fromX, fromY, toX, toY,
        exploration.roundNumber, user.id, now,
        position.position_id, toX, toY, now,
        position.map_instance_id, character.id, exploration.roundNumber, now
      )
    ]);
    if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
      return apiError('Exploration / Map state 已改變；Move 未完成，請重新載入。', 409, 'MAP_MOVE_STATE_CHANGED');
    }
  }

  const response = await characterMapContext(new Request(request.url, {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env, character.id);
  const payload = await response.json();
  return json({ ...payload, movement: { id: movementId, from: { x: fromX, y: fromY }, to: { x: toX, y: toY } } });
}

async function consumeExplorationAction(request, env, characterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const loaded = await contextForMutation(request, env, characterId);
  if (loaded.error) return loaded.error;
  if (loaded.activeCombat) return apiError('Combat 進行中；請使用 Combat Action resolver。', 409, 'COMBAT_ACTIVE');
  const exploration = await explorationCharacterState(env, loaded.position.map_instance_id, characterId);
  if (!exploration.tracked || exploration.turnCompleted) return apiError('Exploration Turn 已完成。', 409, 'EXPLORATION_TURN_COMPLETED');
  if (!exploration.actionAvailable) return apiError('Action 已經使用。', 409, 'ACTION_ALREADY_SPENT');
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE runtime_exploration_character_state
    SET action_available = 0, updated_at = ?
    WHERE map_instance_id = ? AND character_id = ? AND round_number = ?
      AND action_available = 1 AND turn_completed = 0
      AND NOT EXISTS (SELECT 1 FROM combats WHERE status = 'active')
  `).bind(now, loaded.position.map_instance_id, characterId, exploration.roundNumber).run();
  if (Number(result?.meta?.changes || 0) !== 1) return apiError('Exploration state 已改變，請重新載入。', 409, 'EXPLORATION_STATE_CHANGED');
  return characterMapContext(new Request(request.url, {
    method: 'GET', headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env, characterId);
}

async function pendingExplorationActors(env, mapInstanceId, roundNumber) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS pending
    FROM runtime_entity_positions rep
    JOIN characters c ON c.id = rep.entity_id
    LEFT JOIN character_life_states cls ON cls.character_id = c.id
    LEFT JOIN runtime_exploration_character_state ecs
      ON ecs.map_instance_id = rep.map_instance_id AND ecs.character_id = c.id
    WHERE rep.map_instance_id = ?
      AND rep.entity_type = 'character'
      AND c.status = 'active'
      AND c.owner_user_id IS NOT NULL
      AND COALESCE(cls.life_state, 'alive') = 'alive'
      AND (
        ecs.character_id IS NULL OR ecs.round_number <> ? OR ecs.turn_completed <> 1
      )
  `).bind(mapInstanceId, roundNumber).first();
  return Number(row?.pending || 0);
}

async function endExplorationTurn(request, env, characterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const loaded = await contextForMutation(request, env, characterId);
  if (loaded.error) return loaded.error;
  if (loaded.activeCombat) return apiError('Combat 進行中；請使用 Combat End Turn。', 409, 'COMBAT_ACTIVE');
  const mapInstanceId = loaded.position.map_instance_id;
  const exploration = await explorationCharacterState(env, mapInstanceId, characterId);
  if (!exploration.tracked) return apiError('Character 唔係目前 Exploration participant。', 409, 'EXPLORATION_PARTICIPANT_REQUIRED');
  if (exploration.turnCompleted) return apiError('Exploration Turn 已經完成。', 409, 'EXPLORATION_TURN_COMPLETED');
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE runtime_exploration_character_state
    SET action_available = 0, move_available = 0, turn_completed = 1, updated_at = ?
    WHERE map_instance_id = ? AND character_id = ? AND round_number = ? AND turn_completed = 0
      AND NOT EXISTS (SELECT 1 FROM combats WHERE status = 'active')
  `).bind(now, mapInstanceId, characterId, exploration.roundNumber).run();
  if (Number(result?.meta?.changes || 0) !== 1) return apiError('Exploration state 已改變，請重新載入。', 409, 'EXPLORATION_STATE_CHANGED');

  await ensureExplorationParticipants(env, mapInstanceId);
  const pending = await pendingExplorationActors(env, mapInstanceId, exploration.roundNumber);
  let roundAdvanced = false;
  if (pending === 0) {
    const nextRound = exploration.roundNumber + 1;
    const resetAt = Date.now();
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE runtime_exploration_state
        SET round_number = ?, updated_at = ?
        WHERE map_instance_id = ? AND round_number = ?
      `).bind(nextRound, resetAt, mapInstanceId, exploration.roundNumber),
      env.DB.prepare(`
        UPDATE runtime_exploration_character_state
        SET round_number = ?, action_available = 1, move_available = 1,
            turn_completed = 0, updated_at = ?
        WHERE map_instance_id = ? AND round_number = ?
      `).bind(nextRound, resetAt, mapInstanceId, exploration.roundNumber)
    ]);
    roundAdvanced = Number(results?.[0]?.meta?.changes || 0) === 1;
  }

  const response = await characterMapContext(new Request(request.url, {
    method: 'GET', headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env, characterId);
  const payload = await response.json();
  return json({ ...payload, roundAdvanced });
}

async function handleCharacterWorldApi(request, env, pathname) {
  const detailMatch = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)$/);
  if (detailMatch) return characterMapContext(request, env, decodeURIComponent(detailMatch[1]));

  const moveMatch = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/move$/);
  if (moveMatch) return moveCharacter(request, env, decodeURIComponent(moveMatch[1]));

  const actionMatch = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/consume-action$/);
  if (actionMatch) return consumeExplorationAction(request, env, decodeURIComponent(actionMatch[1]));

  const endMatch = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/end-exploration-turn$/);
  if (endMatch) return endExplorationTurn(request, env, decodeURIComponent(endMatch[1]));

  return apiError('Not found.', 404, 'NOT_FOUND');
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/player/world') return await playerWorldOverview(request, env);
      if (pathname.startsWith('/api/player/world/characters/')) return await handleCharacterWorldApi(request, env, pathname);
      return baseWorker.fetch(request, env);
    } catch (errorValue) {
      console.error('Player Map API error', {
        path: pathname,
        name: errorValue?.name || 'Error',
        message: String(errorValue?.message || errorValue)
      });
      if (errorValue?.status) return apiError(errorValue.message, errorValue.status, errorValue.code || 'PLAYER_MAP_ERROR');
      if (isMissingRuntimeTable(errorValue)) return apiError('Runtime Map 尚未初始化。', 409, 'RUNTIME_MAP_NOT_INITIALIZED');
      if (String(errorValue?.message || errorValue).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Player Map service 暫時無法使用。', 500, 'PLAYER_MAP_SERVICE_ERROR');
    }
  }
};
