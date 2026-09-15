import baseWorker from './opposed-d100-gateway.js';
import {
  ensureBasicSkillCheckAuthority,
  listBasicSkillChecks,
  listCanonicalBasicSkills,
  resolveAndRecordBasicSkillCheck
} from './basic-skill-check-authority.js';

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
async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (String(user.status || '').toLowerCase() !== 'active') {
    throw Object.assign(new Error('此 User 目前不可使用 Basic Skill Check。'), { status: 403, code: 'USER_NOT_ACTIVE' });
  }
  return user;
}
async function requireGM(request, env) {
  const user = await requireUser(request, env);
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}
async function requireCharacter(env, characterId, user, gmMode = false) {
  const row = await env.DB.prepare('SELECT id, owner_user_id, name, status FROM characters WHERE id=? LIMIT 1').bind(characterId).first();
  if (!row) throw Object.assign(new Error('找不到 Character。'), { status: 404, code: 'CHARACTER_NOT_FOUND' });
  if (!gmMode && row.owner_user_id !== user.id) {
    throw Object.assign(new Error('你只可以查看自己角色嘅 Basic Skill Check。'), { status: 403, code: 'CHARACTER_NOT_OWNED' });
  }
  return row;
}
async function assertCharacterUnlocked(env, character) {
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='character_life_states' LIMIT 1").first();
  if (!table) return;
  const life = await env.DB.prepare('SELECT character_locked FROM character_life_states WHERE character_id=? LIMIT 1').bind(character.id).first();
  if (Number(life?.character_locked || 0) === 1) {
    throw Object.assign(new Error('死亡 Character 已鎖定，不能進行正式 Basic Skill Check。'), { status: 423, code: 'CHARACTER_LOCKED_DEAD' });
  }
}
function playerCheckView(check) {
  return {
    id: check.id,
    characterId: check.characterId,
    skillId: check.skillId,
    skillKey: check.skillKey,
    skillLabel: check.skillLabel,
    naturalSkillValue: check.naturalSkillValue,
    totalModifier: check.totalModifier,
    effectiveSkillValue: check.effectiveSkillValue,
    rawRoll: check.rawRoll,
    resultValue: check.resultValue,
    passed: check.passed,
    extremeResult: check.extremeResult,
    rollSource: check.rollSource,
    createdAt: check.createdAt,
    growthEligibility: check.growthEligibility
  };
}

async function handleGmChecks(request, env, characterId) {
  const gm = await requireGM(request, env);
  await ensureBasicSkillCheckAuthority(env);
  const character = await requireCharacter(env, characterId, gm, true);
  if (request.method === 'GET') {
    const limit = new URL(request.url).searchParams.get('limit') || 30;
    const [skills, checks] = await Promise.all([
      listCanonicalBasicSkills(env, characterId),
      listBasicSkillChecks(env, characterId, { limit })
    ]);
    return json({ ok: true, character: { id: character.id, name: character.name, status: character.status }, skills, checks });
  }
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await assertCharacterUnlocked(env, character);
  const result = await resolveAndRecordBasicSkillCheck(env, characterId, await readBody(request), gm.id);
  return json({ ok: true, ...result }, 201);
}

async function handlePlayerChecks(request, env, characterId) {
  if (request.method !== 'GET') return apiError('Player Basic Skill Check history is read-only.', 405, 'METHOD_NOT_ALLOWED');
  const user = await requireUser(request, env);
  await ensureBasicSkillCheckAuthority(env);
  await requireCharacter(env, characterId, user, false);
  const limit = new URL(request.url).searchParams.get('limit') || 30;
  const checks = await listBasicSkillChecks(env, characterId, { limit });
  return json({ ok: true, checks: checks.map(playerCheckView) });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const gmMatch = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/basic-skill-checks$/);
      if (gmMatch) return await handleGmChecks(request, env, decodeURIComponent(gmMatch[1]));
      const playerMatch = pathname.match(/^\/api\/player\/characters\/([^/]+)\/basic-skill-checks$/);
      if (playerMatch) return await handlePlayerChecks(request, env, decodeURIComponent(playerMatch[1]));
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Basic Skill Check gateway error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'BASIC_SKILL_CHECK_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      return apiError('Basic Skill Check 暫時無法完成要求。', 500, error?.code || 'BASIC_SKILL_CHECK_SERVICE_ERROR');
    }
  }
};
