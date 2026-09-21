import baseWorker from './ability-gateway.js';
import {
  createNonDamageStatusProfile,
  ensureNonDamageStatusProfileAuthority,
  listNonDamageStatusProfiles,
  updateNonDamageStatusProfile
} from './non-damage-status-profile-authority.js';

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
  try { return await request.json(); }
  catch { throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' }); }
}

async function currentUser(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  return (await response.json())?.user || null;
}

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (String(user.status || '').toLowerCase() !== 'active') {
    throw Object.assign(new Error('此 User 目前不可管理 Non-damage Status Profile。'), { status: 403, code: 'USER_NOT_ACTIVE' });
  }
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (!pathname.startsWith('/api/gm/non-damage-status-profiles')) return baseWorker.fetch(request, env);
      const gm = await requireGM(request, env);
      await ensureNonDamageStatusProfileAuthority(env);

      if (pathname === '/api/gm/non-damage-status-profiles') {
        if (request.method === 'GET') {
          const status = new URL(request.url).searchParams.get('status') || 'ALL';
          return json({ ok: true, profiles: await listNonDamageStatusProfiles(env, { status }) });
        }
        if (request.method === 'POST') {
          if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
          return json({ ok: true, profile: await createNonDamageStatusProfile(env, await readBody(request), gm.id) }, 201);
        }
        return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
      }

      const match = pathname.match(/^\/api\/gm\/non-damage-status-profiles\/([^/]+)$/);
      if (match) {
        if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
        if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
        return json({
          ok: true,
          profile: await updateNonDamageStatusProfile(env, decodeURIComponent(match[1]), await readBody(request), gm.id)
        });
      }
      return apiError('Profile route not found.', 404, 'NON_DAMAGE_STATUS_PROFILE_ROUTE_NOT_FOUND');
    } catch (error) {
      console.error('Non-damage Status Profile gateway error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'NON_DAMAGE_STATUS_PROFILE_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Non-damage Status Profile 暫時無法完成要求。', 500, error?.code || 'NON_DAMAGE_STATUS_PROFILE_SERVICE_ERROR');
    }
  }
};
