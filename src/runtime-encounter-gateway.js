import baseWorker from './story-zone-trigger-gateway.js';
import {
  spawnRuntimeMonster,
  startRuntimeEncounterCombat
} from './runtime-encounter-service.js';

const GM_ROLES = new Set(['gm', 'admin']);

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

function apiError(message, status = 400, code = 'BAD_REQUEST', extra = {}) {
  return json({ ok: false, error: { code, message, ...extra } }, status);
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

function errorExtra(error) {
  const extra = {};
  for (const key of ['occupiedBy', 'missingPositions', 'activeCombatId']) {
    if (error?.[key] !== undefined) extra[key] = error[key];
  }
  return extra;
}

async function spawnRuntimeMonsterRoute(request, env, mapInstanceId, encounterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const gm = await requireGM(request, env);
  const body = await readBody(request);
  const result = await spawnRuntimeMonster(env, {
    mapInstanceId,
    encounterId,
    templateId: body?.templateId,
    level: body?.level,
    sourceSpawnPointId: body?.sourceSpawnPointId,
    displayName: body?.displayName,
    actorUserId: gm.id
  });
  return json({ ok: true, ...result }, result.unchanged ? 200 : 201);
}

async function startRuntimeCombatRoute(request, env, mapInstanceId, encounterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const gm = await requireGM(request, env);
  const result = await startRuntimeEncounterCombat(env, {
    mapInstanceId,
    encounterId,
    actorUserId: gm.id
  });
  return json({ ok: true, ...result }, result.unchanged ? 200 : 201);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const spawnMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/encounters\/([^/]+)\/monsters$/);
      if (spawnMatch) {
        return await spawnRuntimeMonsterRoute(request, env, decodeURIComponent(spawnMatch[1]), decodeURIComponent(spawnMatch[2]));
      }

      const combatMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/encounters\/([^/]+)\/start-combat$/);
      if (combatMatch) {
        return await startRuntimeCombatRoute(request, env, decodeURIComponent(combatMatch[1]), decodeURIComponent(combatMatch[2]));
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Runtime Encounter gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'RUNTIME_ENCOUNTER_ERROR', errorExtra(error));
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Runtime Encounter service 暫時無法使用。', 500, 'RUNTIME_ENCOUNTER_SERVICE_ERROR');
    }
  }
};
