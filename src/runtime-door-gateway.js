import baseWorker from './player-map-gateway.js';

const GM_ROLES = new Set(['gm', 'admin']);
const DOOR_STATES = new Set(['open', 'closed', 'locked', 'broken']);
let doorSchemaPromise = null;

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

async function ensureRuntimeMapReady(request, env, mapInstanceId) {
  const internal = new Request(new URL(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`, request.url), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
  });
  const response = await baseWorker.fetch(internal, env);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || 'Runtime Map unavailable.'), {
      status: response.status,
      code: payload?.error?.code || 'RUNTIME_MAP_UNAVAILABLE'
    });
  }
  return payload;
}

async function ensureDoorSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!doorSchemaPromise) {
    doorSchemaPromise = env.DB.batch([
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
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_door_state_log_edge ON runtime_door_state_log(runtime_edge_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_door_state_log_map ON runtime_door_state_log(map_instance_id, created_at)')
    ]).catch(error => {
      doorSchemaPromise = null;
      throw error;
    });
  }
  await doorSchemaPromise;
}

function normalizeState(value) {
  const state = String(value || '').toLowerCase();
  if (!DOOR_STATES.has(state)) {
    throw Object.assign(new Error('Door state 必須為 open / closed / locked / broken。'), {
      status: 400,
      code: 'DOOR_STATE_INVALID'
    });
  }
  return state;
}

function blocksMovementForDoorState(state) {
  return state === 'closed' || state === 'locked';
}

async function mutateDoorState(request, env, mapInstanceId, edgeId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  const detail = await ensureRuntimeMapReady(request, env, mapInstanceId);
  if (detail?.mapInstance?.status !== 'active') {
    return apiError('已關閉的 Runtime Map 不可修改 Door state。', 409, 'RUNTIME_MAP_CLOSED');
  }
  const door = (detail?.edges || []).find(edge => edge.id === edgeId);
  if (!door) return apiError('Runtime Edge 不存在。', 404, 'RUNTIME_EDGE_NOT_FOUND');
  if (door.edgeType !== 'door') return apiError('只有 Door edge 可以修改 Door state。', 409, 'RUNTIME_EDGE_NOT_DOOR');

  const body = await readBody(request);
  const nextState = normalizeState(body?.state);
  const previousState = normalizeState(door.doorState || 'closed');
  if (nextState === previousState) {
    return json({
      ok: true,
      unchanged: true,
      door: {
        id: door.id,
        mapInstanceId,
        x: Number(door.x),
        y: Number(door.y),
        direction: door.direction,
        state: previousState,
        blocksMovement: blocksMovementForDoorState(previousState)
      }
    });
  }

  await ensureDoorSchema(env);
  const now = Date.now();
  const blocksMovement = blocksMovementForDoorState(nextState) ? 1 : 0;
  const auditId = `runtime_door_log_${crypto.randomUUID()}`;
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE runtime_map_edges
      SET door_state = ?, blocks_movement = ?, updated_at = ?
      WHERE id = ? AND map_instance_id = ? AND edge_type = 'door' AND door_state = ?
        AND EXISTS (
          SELECT 1 FROM runtime_map_instances
          WHERE id = ? AND status = 'active'
        )
    `).bind(nextState, blocksMovement, now, edgeId, mapInstanceId, previousState, mapInstanceId),
    env.DB.prepare(`
      INSERT INTO runtime_door_state_log (
        id, map_instance_id, runtime_edge_id,
        from_state, to_state, changed_by_user_id, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM runtime_map_edges
        WHERE id = ? AND map_instance_id = ? AND edge_type = 'door'
          AND door_state = ? AND updated_at = ?
      )
    `).bind(
      auditId, mapInstanceId, edgeId, previousState, nextState, user.id, now,
      edgeId, mapInstanceId, nextState, now
    )
  ]);

  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    return apiError('Door state 已由另一個操作更新，請重新載入。', 409, 'RUNTIME_DOOR_STATE_CHANGED');
  }

  return json({
    ok: true,
    unchanged: false,
    auditId,
    door: {
      id: edgeId,
      mapInstanceId,
      x: Number(door.x),
      y: Number(door.y),
      direction: door.direction,
      state: nextState,
      blocksMovement: Boolean(blocksMovement),
      updatedAt: now
    }
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const match = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/edges\/([^/]+)\/door-state$/);
    try {
      if (match) {
        return await mutateDoorState(
          request,
          env,
          decodeURIComponent(match[1]),
          decodeURIComponent(match[2])
        );
      }
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Runtime Door gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'RUNTIME_DOOR_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Runtime Door service 暫時無法使用。', 500, 'RUNTIME_DOOR_SERVICE_ERROR');
    }
  }
};
