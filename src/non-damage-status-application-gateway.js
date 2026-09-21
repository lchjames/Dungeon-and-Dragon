import baseWorker from './ability-gateway.js';
import {
  applySettlementStatusProfile,
  ensureNonDamageStatusApplicationAuthority,
  listNonDamageStatusApplications
} from './non-damage-status-application-authority.js';

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
    throw Object.assign(new Error('此 User 目前不可套用 Settlement Status。'), { status: 403, code: 'USER_NOT_ACTIVE' });
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
      if (pathname !== '/api/gm/non-damage-status-applications') return baseWorker.fetch(request, env);
      const gm = await requireGM(request, env);
      await ensureNonDamageStatusApplicationAuthority(env);
      if (request.method === 'GET') {
        const limit = new URL(request.url).searchParams.get('limit') || 50;
        return json({ ok: true, applications: await listNonDamageStatusApplications(env, { limit }) });
      }
      if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
      if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
      const result = await applySettlementStatusProfile(env, await readBody(request), gm.id);
      return json({ ok: true, ...result }, result.idempotent ? 200 : 201);
    } catch (error) {
      console.error('Non-damage Status Application gateway error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'NON_DAMAGE_STATUS_APPLICATION_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Non-damage Status Application 暫時無法完成要求。', 500, error?.code || 'NON_DAMAGE_STATUS_APPLICATION_SERVICE_ERROR');
    }
  }
};