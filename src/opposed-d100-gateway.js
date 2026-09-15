import baseWorker from './currency-exchange-gateway.js';
import {
  ensureOpposedD100Authority,
  listOpposedD100Checks,
  resolveAndRecordOpposedD100
} from './opposed-d100-authority.js';

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
    throw Object.assign(new Error('此 User 目前不可使用 Opposed D100。'), { status: 403, code: 'USER_NOT_ACTIVE' });
  }
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}
async function requireCharacter(env, characterId, side) {
  const id = String(characterId || '').trim();
  if (!id) throw Object.assign(new Error(`${side} Character ID is required.`), { status: 400, code: 'OPPOSED_D100_VALIDATION_ERROR' });
  const row = await env.DB.prepare('SELECT id, name, status FROM characters WHERE id=? LIMIT 1').bind(id).first();
  if (!row) throw Object.assign(new Error(`${side} Character not found.`), { status: 404, code: 'CHARACTER_NOT_FOUND' });
  return row;
}
async function assertCharacterUnlocked(env, character, side) {
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='character_life_states' LIMIT 1").first();
  if (!table) return;
  const life = await env.DB.prepare('SELECT character_locked FROM character_life_states WHERE character_id=? LIMIT 1').bind(character.id).first();
  if (Number(life?.character_locked || 0) === 1) {
    throw Object.assign(new Error(`${side} Character 已死亡鎖定，不能參與正式 Opposed D100。`), { status: 423, code: 'CHARACTER_LOCKED_DEAD' });
  }
}

async function handleOpposed(request, env) {
  const gm = await requireGM(request, env);
  await ensureOpposedD100Authority(env);
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const checks = await listOpposedD100Checks(env, {
      characterId: url.searchParams.get('characterId') || '',
      limit: url.searchParams.get('limit') || 30
    });
    return json({ ok: true, checks });
  }
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const body = await readBody(request);
  const [sourceCharacter, resistanceCharacter] = await Promise.all([
    requireCharacter(env, body?.source?.characterId, 'Source'),
    requireCharacter(env, body?.resistance?.characterId, 'Resistance')
  ]);
  await Promise.all([
    assertCharacterUnlocked(env, sourceCharacter, 'Source'),
    assertCharacterUnlocked(env, resistanceCharacter, 'Resistance')
  ]);
  const result = await resolveAndRecordOpposedD100(env, body, gm.id);
  return json({ ok: true, ...result }, 201);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/basic-skill-opposed-checks') return await handleOpposed(request, env);
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Opposed D100 gateway error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'OPPOSED_D100_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      return apiError('Opposed D100 暫時無法完成要求。', 500, error?.code || 'OPPOSED_D100_SERVICE_ERROR');
    }
  }
};
