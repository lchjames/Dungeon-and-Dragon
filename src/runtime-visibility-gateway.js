import baseWorker from './hostile-combat-movement-gateway.js';
import { normalizeViewerVisibility, runtimeTokenVisible } from './runtime-visibility-rules.js';

const GM_ROLES = new Set(['gm', 'admin']);
const ENTITY_TYPES = new Set(['character', 'monster_instance', 'boss_instance']);
let visibilitySchemaPromise = null;
let baseRuntimeSchemaReady = false;

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
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
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

async function ensureBaseRuntimeSchema(request, env) {
  if (baseRuntimeSchemaReady) return;
  const response = await baseWorker.fetch(new Request(new URL('/api/gm/world/runtime', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw Object.assign(new Error(payload?.error?.message || 'Runtime Map schema unavailable.'), {
      status: response.status,
      code: payload?.error?.code || 'RUNTIME_MAP_SCHEMA_UNAVAILABLE'
    });
  }
  baseRuntimeSchemaReady = true;
}

async function ensureVisibilitySchema(request, env, { ensureRuntime = true } = {}) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (ensureRuntime) await ensureBaseRuntimeSchema(request, env);
  if (!visibilitySchemaPromise) {
    visibilitySchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_entity_visibility_overrides (
        position_id TEXT NOT NULL,
        viewer_user_id TEXT NOT NULL,
        visibility_mode TEXT NOT NULL CHECK (visibility_mode IN ('visible', 'hidden')),
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (position_id, viewer_user_id),
        FOREIGN KEY (position_id) REFERENCES runtime_entity_positions(id) ON DELETE CASCADE,
        FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_visibility_viewer ON runtime_entity_visibility_overrides(viewer_user_id, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_visibility_position ON runtime_entity_visibility_overrides(position_id, updated_at)')
    ]).catch(error => {
      visibilitySchemaPromise = null;
      throw error;
    });
  }
  await visibilitySchemaPromise;
}

async function enrichRuntimeDetail(request, env, response, mapInstanceId) {
  if (!response.ok) return response;
  const payload = await response.json();
  if (!payload?.mapInstance?.id) return json(payload, response.status);
  await ensureVisibilitySchema(request, env, { ensureRuntime: false });

  const [viewers, overrides, owners] = await Promise.all([
    env.DB.prepare(`
      SELECT DISTINCT u.id, u.display_name
      FROM runtime_entity_positions rep
      JOIN characters c ON rep.entity_type = 'character' AND c.id = rep.entity_id
      JOIN users u ON u.id = c.owner_user_id
      WHERE rep.map_instance_id = ?
        AND u.role = 'player'
        AND u.status = 'active'
      ORDER BY u.display_name COLLATE NOCASE, u.id
    `).bind(mapInstanceId).all(),
    env.DB.prepare(`
      SELECT rvo.position_id, rvo.viewer_user_id, rvo.visibility_mode,
             u.display_name AS viewer_display_name
      FROM runtime_entity_visibility_overrides rvo
      JOIN runtime_entity_positions rep ON rep.id = rvo.position_id
      JOIN users u ON u.id = rvo.viewer_user_id
      WHERE rep.map_instance_id = ?
      ORDER BY rep.entity_type, rep.entity_id, u.display_name COLLATE NOCASE, u.id
    `).bind(mapInstanceId).all(),
    env.DB.prepare(`
      SELECT rep.id AS position_id, c.owner_user_id
      FROM runtime_entity_positions rep
      LEFT JOIN characters c ON rep.entity_type = 'character' AND c.id = rep.entity_id
      WHERE rep.map_instance_id = ?
    `).bind(mapInstanceId).all()
  ]);

  const ownerByPosition = new Map((owners.results || []).map(row => [row.position_id, row.owner_user_id || '']));
  return json({
    ...payload,
    positions: (payload.positions || []).map(position => ({
      ...position,
      ownerUserId: ownerByPosition.get(position.id) || ''
    })),
    playerViewers: (viewers.results || []).map(row => ({
      userId: row.id,
      displayName: row.display_name || row.id
    })),
    visibilityOverrides: (overrides.results || []).map(row => ({
      positionId: row.position_id,
      viewerUserId: row.viewer_user_id,
      viewerDisplayName: row.viewer_display_name || row.viewer_user_id,
      visibilityMode: row.visibility_mode
    }))
  }, response.status);
}

async function rebuildPlayerTokens(request, env, response, ownCharacterId) {
  if (!response.ok) return response;
  const payload = await response.json();
  const mapInstanceId = payload?.map?.id;
  if (!mapInstanceId) return json(payload, response.status);
  const user = await currentUser(request, env);
  if (!user) return apiError('未登入。', 401, 'UNAUTHENTICATED');
  await ensureVisibilitySchema(request, env, { ensureRuntime: false });

  const rows = await env.DB.prepare(`
    SELECT rep.id AS position_id, rep.entity_type, rep.entity_id, rep.x, rep.y,
           rep.visibility_mode,
           c.name AS character_name,
           mi.display_name AS monster_name,
           bi.display_name AS boss_name,
           rvo.visibility_mode AS viewer_override
    FROM runtime_entity_positions rep
    LEFT JOIN characters c ON rep.entity_type = 'character' AND c.id = rep.entity_id
    LEFT JOIN monster_instances mi ON rep.entity_type = 'monster_instance' AND mi.id = rep.entity_id
    LEFT JOIN boss_instances bi ON rep.entity_type = 'boss_instance' AND bi.id = rep.entity_id
    LEFT JOIN runtime_entity_visibility_overrides rvo
      ON rvo.position_id = rep.id AND rvo.viewer_user_id = ?
    WHERE rep.map_instance_id = ?
    ORDER BY rep.y, rep.x, rep.entity_type, rep.entity_id
  `).bind(user.id, mapInstanceId).all();

  const tokens = [];
  for (const row of rows.results || []) {
    if (!runtimeTokenVisible({
      entityType: row.entity_type,
      entityId: row.entity_id,
      ownCharacterId,
      globalVisibility: row.visibility_mode,
      viewerOverride: row.viewer_override || ''
    })) continue;
    tokens.push({
      entityType: row.entity_type,
      entityId: row.entity_id,
      displayName: row.character_name || row.monster_name || row.boss_name || row.entity_id,
      x: Number(row.x),
      y: Number(row.y),
      own: row.entity_type === 'character' && row.entity_id === ownCharacterId
    });
  }

  return json({ ...payload, tokens }, response.status);
}

async function mutateViewerVisibility(request, env, mapInstanceId, entityTypeRaw, entityIdRaw, viewerUserIdRaw) {
  if (!['PUT', 'DELETE'].includes(request.method)) return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const gm = await requireGM(request, env);
  await ensureVisibilitySchema(request, env);

  const entityType = String(entityTypeRaw || '').trim().toLowerCase();
  const entityId = String(entityIdRaw || '').trim();
  const viewerUserId = String(viewerUserIdRaw || '').trim();
  if (!ENTITY_TYPES.has(entityType) || !entityId || !viewerUserId) {
    return apiError('Entity / Viewer 無效。', 400, 'VALIDATION_ERROR');
  }

  const position = await env.DB.prepare(`
    SELECT rep.id, rep.entity_type, rep.entity_id, c.owner_user_id
    FROM runtime_entity_positions rep
    LEFT JOIN characters c ON rep.entity_type = 'character' AND c.id = rep.entity_id
    JOIN runtime_map_instances rmi ON rmi.id = rep.map_instance_id
    WHERE rep.map_instance_id = ? AND rep.entity_type = ? AND rep.entity_id = ?
      AND rmi.status = 'active'
    LIMIT 1
  `).bind(mapInstanceId, entityType, entityId).first();
  if (!position) return apiError('Active Runtime token 不存在。', 404, 'RUNTIME_ENTITY_POSITION_NOT_FOUND');

  const viewer = await env.DB.prepare(`
    SELECT id, display_name, role, status
    FROM users
    WHERE id = ? AND role = 'player' AND status = 'active'
    LIMIT 1
  `).bind(viewerUserId).first();
  if (!viewer) return apiError('Viewer Player 不存在或目前不可用。', 404, 'PLAYER_VIEWER_NOT_FOUND');

  if (entityType === 'character' && position.owner_user_id && position.owner_user_id === viewerUserId) {
    return apiError('Character owner 永遠可以見到自己嘅 token。', 409, 'SELF_VISIBILITY_ALWAYS_VISIBLE');
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare(`
      DELETE FROM runtime_entity_visibility_overrides
      WHERE position_id = ? AND viewer_user_id = ?
    `).bind(position.id, viewerUserId).run();
    return json({ ok: true, cleared: true, positionId: position.id, viewerUserId });
  }

  const body = await readBody(request);
  let visibilityMode;
  try {
    visibilityMode = normalizeViewerVisibility(body?.visibilityMode);
  } catch (error) {
    return apiError(error.message, 400, 'VISIBILITY_OVERRIDE_INVALID');
  }
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO runtime_entity_visibility_overrides
      (position_id, viewer_user_id, visibility_mode, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(position_id, viewer_user_id) DO UPDATE SET
      visibility_mode = excluded.visibility_mode,
      created_by_user_id = excluded.created_by_user_id,
      updated_at = excluded.updated_at
  `).bind(position.id, viewerUserId, visibilityMode, gm.id, now, now).run();

  return json({
    ok: true,
    override: {
      positionId: position.id,
      viewerUserId,
      viewerDisplayName: viewer.display_name || viewerUserId,
      visibilityMode
    }
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const overrideMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/entities\/([^/]+)\/([^/]+)\/visibility\/([^/]+)$/);
      if (overrideMatch) {
        return await mutateViewerVisibility(
          request,
          env,
          decodeURIComponent(overrideMatch[1]),
          decodeURIComponent(overrideMatch[2]),
          decodeURIComponent(overrideMatch[3]),
          decodeURIComponent(overrideMatch[4])
        );
      }

      const gmDetail = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)$/);
      if (gmDetail && request.method === 'GET') {
        const response = await baseWorker.fetch(request, env);
        return await enrichRuntimeDetail(request, env, response, decodeURIComponent(gmDetail[1]));
      }

      const playerWorld = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)(?:\/.*)?$/);
      if (playerWorld) {
        const response = await baseWorker.fetch(request, env);
        const contentType = response.headers.get('Content-Type') || '';
        if (!response.ok || !contentType.toLowerCase().includes('application/json')) return response;
        return await rebuildPlayerTokens(request, env, response, decodeURIComponent(playerWorld[1]));
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Runtime visibility gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'RUNTIME_VISIBILITY_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Runtime token visibility service 暫時無法使用。', 500, 'RUNTIME_VISIBILITY_SERVICE_ERROR');
    }
  }
};
