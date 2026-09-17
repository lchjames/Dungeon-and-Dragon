import baseWorker from './currency-exchange-gateway.js';
import {
  advanceCharacterStatusRound,
  applyStatusEffectToCharacter,
  createStatusEffectDefinition,
  ensureStatusEffectAuthority,
  listCharacterStatusEffectAudit,
  listCharacterStatusEffects,
  listStatusEffectDefinitions,
  removeRuntimeStatusEffect,
  updateStatusEffectDefinition
} from './status-effect-authority.js';

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
    throw Object.assign(new Error('此 User 目前不可管理 Status Effect。'), { status: 403, code: 'USER_NOT_ACTIVE' });
  }
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

function requireWriteOrigin(request) {
  if (!validOrigin(request)) throw Object.assign(new Error('來源驗證失敗。'), { status: 403, code: 'ORIGIN_REJECTED' });
}

async function handleDefinitions(request, env, gm) {
  await ensureStatusEffectAuthority(env);
  if (request.method === 'GET') {
    const status = new URL(request.url).searchParams.get('status') || 'ALL';
    return json({ ok: true, definitions: await listStatusEffectDefinitions(env, { status }) });
  }
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  requireWriteOrigin(request);
  const body = await readBody(request);
  const definition = await createStatusEffectDefinition(env, body, gm.id);
  return json({ ok: true, definition }, 201);
}

async function handleDefinition(request, env, gm, definitionId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  requireWriteOrigin(request);
  const body = await readBody(request);
  const definition = await updateStatusEffectDefinition(env, definitionId, body, gm.id);
  return json({ ok: true, definition });
}

async function handleCharacterEffects(request, env, gm, characterId) {
  await ensureStatusEffectAuthority(env);
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const includeHistory = ['1', 'true', 'yes'].includes(String(url.searchParams.get('includeHistory') || '').toLowerCase());
    const [state, audit] = await Promise.all([
      listCharacterStatusEffects(env, characterId, { includeHistory }),
      listCharacterStatusEffectAudit(env, characterId, { limit: url.searchParams.get('auditLimit') || 50 })
    ]);
    return json({ ok: true, ...state, audit });
  }
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  requireWriteOrigin(request);
  const body = await readBody(request);
  const result = await applyStatusEffectToCharacter(env, characterId, body, gm.id);
  return json({ ok: true, ...result }, result.operation === 'CREATE' ? 201 : 200);
}

async function handleTickRound(request, env, gm, characterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  requireWriteOrigin(request);
  const body = await readBody(request);
  const result = await advanceCharacterStatusRound(env, characterId, body, gm.id);
  return json({ ok: true, ...result });
}

async function handleRemove(request, env, gm, instanceId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  requireWriteOrigin(request);
  const body = await readBody(request);
  const effect = await removeRuntimeStatusEffect(env, instanceId, body, gm.id);
  return json({ ok: true, effect });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (!pathname.startsWith('/api/gm/status-effects') && !/^\/api\/gm\/characters\/[^/]+\/status-effects(?:\/|$)/.test(pathname)) {
        return baseWorker.fetch(request, env);
      }
      const gm = await requireGM(request, env);
      if (pathname === '/api/gm/status-effects/definitions') return await handleDefinitions(request, env, gm);

      let match = pathname.match(/^\/api\/gm\/status-effects\/definitions\/([^/]+)$/);
      if (match) return await handleDefinition(request, env, gm, decodeURIComponent(match[1]));

      match = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/status-effects\/tick-round$/);
      if (match) return await handleTickRound(request, env, gm, decodeURIComponent(match[1]));

      match = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/status-effects$/);
      if (match) return await handleCharacterEffects(request, env, gm, decodeURIComponent(match[1]));

      match = pathname.match(/^\/api\/gm\/status-effects\/instances\/([^/]+)\/remove$/);
      if (match) return await handleRemove(request, env, gm, decodeURIComponent(match[1]));

      return apiError('Status Effect route not found.', 404, 'STATUS_EFFECT_ROUTE_NOT_FOUND');
    } catch (error) {
      console.error('Status Effect gateway error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'STATUS_EFFECT_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      return apiError('Status Effect 暫時無法完成要求。', 500, error?.code || 'STATUS_EFFECT_SERVICE_ERROR');
    }
  }
};
