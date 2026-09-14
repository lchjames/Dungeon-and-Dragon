import baseWorker from './story-script-gateway.js';
import {
  createAbilityDefinition,
  ensureAbilityAuthority,
  grantAbilityToCharacter,
  listAbilityDefinitions,
  listCharacterAbilities,
  listCharacterElementProgression,
  loadAbilityDefinition,
  updateAbilityDefinition
} from './ability-authority.js';
import {
  ensureElementProgressionAuthority,
  getCharacterElementProgressionState,
  listElementProgressionAudit,
  mutateCharacterElementProgression
} from './element-progression-authority.js';

const GM_ROLES = new Set(['gm', 'admin']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function apiError(message, status = 400, code = 'BAD_REQUEST') { return json({ ok: false, error: { code, message } }, status); }
function validOrigin(request) { const origin = request.headers.get('Origin'); return !origin || origin === new URL(request.url).origin; }
async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  try { return await request.json(); } catch { throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' }); }
}
async function currentUser(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), { method: 'GET', headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' } }), env);
  if (!response.ok) return null;
  return (await response.json())?.user || null;
}
async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (String(user.status || '').toLowerCase() !== 'active') throw Object.assign(new Error('此 User 目前不可使用 Ability 系統。'), { status: 403, code: 'USER_NOT_ACTIVE' });
  return user;
}
async function requireGM(request, env) {
  const user = await requireUser(request, env);
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  return user;
}
async function requireCharacter(env, characterId, user, gm = false) {
  const row = await env.DB.prepare('SELECT id, owner_user_id, name, status, level FROM characters WHERE id=? LIMIT 1').bind(characterId).first();
  if (!row) throw Object.assign(new Error('找不到 Character。'), { status: 404, code: 'CHARACTER_NOT_FOUND' });
  if (!gm && row.owner_user_id !== user.id) throw Object.assign(new Error('你只可以查看自己角色嘅 Ability。'), { status: 403, code: 'CHARACTER_NOT_OWNED' });
  return row;
}
async function assertCharacterUnlocked(env, characterId) {
  const exists = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='character_life_states' LIMIT 1").first();
  if (!exists) return;
  const row = await env.DB.prepare('SELECT character_locked FROM character_life_states WHERE character_id=? LIMIT 1').bind(characterId).first();
  if (Number(row?.character_locked || 0) === 1) throw Object.assign(new Error('死亡 Character 已鎖定，不能授予或修改 Ability / 屬性修習。'), { status: 423, code: 'CHARACTER_LOCKED_DEAD' });
}

async function handleDefinitions(request, env, abilityId = '') {
  const gm = await requireGM(request, env);
  await ensureAbilityAuthority(env);
  if (request.method === 'GET' && !abilityId) {
    const includeInactive = new URL(request.url).searchParams.get('includeInactive') !== '0';
    return json({ ok: true, abilities: await listAbilityDefinitions(env, { includeInactive, includePrivate: true }) });
  }
  if (request.method === 'GET' && abilityId) {
    const ability = await loadAbilityDefinition(env, abilityId);
    return ability ? json({ ok: true, ability }) : apiError('找不到 Ability Definition。', 404, 'ABILITY_DEFINITION_NOT_FOUND');
  }
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  if (request.method === 'POST' && !abilityId) return json({ ok: true, ability: await createAbilityDefinition(env, await readBody(request), gm.id) }, 201);
  if (request.method === 'PATCH' && abilityId) return json({ ok: true, ability: await updateAbilityDefinition(env, abilityId, await readBody(request), gm.id) });
  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function characterAbilityPayload(env, characterId) {
  const [abilities, progression] = await Promise.all([listCharacterAbilities(env, characterId), listCharacterElementProgression(env, characterId)]);
  return { abilities, abilityProgression: progression };
}

async function handleCharacterAbilities(request, env, characterId, gmMode = false, grant = false) {
  const user = gmMode ? await requireGM(request, env) : await requireUser(request, env);
  await ensureAbilityAuthority(env);
  await requireCharacter(env, characterId, user, gmMode);
  if (request.method === 'GET' && !grant) return json({ ok: true, ...(await characterAbilityPayload(env, characterId)) });
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  if (gmMode && grant && request.method === 'POST') {
    await assertCharacterUnlocked(env, characterId);
    const body = await readBody(request);
    const abilityDefinitionId = String(body?.abilityDefinitionId || '').trim();
    if (!abilityDefinitionId) return apiError('Ability Definition is required.', 400, 'ABILITY_DEFINITION_REQUIRED');
    return json({ ok: true, ...(await grantAbilityToCharacter(env, characterId, abilityDefinitionId, body, user.id)), abilityProgression: await listCharacterElementProgression(env, characterId) }, 201);
  }
  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function handleElementProgression(request, env, characterId, attributeType = '', audit = false) {
  const gm = await requireGM(request, env);
  await ensureElementProgressionAuthority(env);
  await requireCharacter(env, characterId, gm, true);

  if (audit && request.method === 'GET') {
    const limit = new URL(request.url).searchParams.get('limit') || 50;
    return json({ ok: true, audit: await listElementProgressionAudit(env, characterId, { limit }) });
  }
  if (!attributeType && request.method === 'GET') {
    return json({ ok: true, ...(await getCharacterElementProgressionState(env, characterId)) });
  }
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  if (attributeType && request.method === 'PATCH') {
    await assertCharacterUnlocked(env, characterId);
    return json({ ok: true, ...(await mutateCharacterElementProgression(env, characterId, attributeType, await readBody(request), gm.id)) });
  }
  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function augmentCharacterDetail(request, env, characterId, gmMode) {
  const user = gmMode ? await requireGM(request, env) : await requireUser(request, env);
  await ensureAbilityAuthority(env);
  await requireCharacter(env, characterId, user, gmMode);
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const payload = await response.json();
  if (payload?.character) Object.assign(payload.character, await characterAbilityPayload(env, characterId));
  return json(payload, response.status);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const definitionMatch = pathname.match(/^\/api\/gm\/abilities(?:\/([^/]+))?$/);
      if (definitionMatch) return await handleDefinitions(request, env, definitionMatch[1] ? decodeURIComponent(definitionMatch[1]) : '');

      const gmProgressionAudit = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/ability-progression\/audit$/);
      if (gmProgressionAudit) return await handleElementProgression(request, env, decodeURIComponent(gmProgressionAudit[1]), '', true);
      const gmProgressionAttribute = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/ability-progression\/([^/]+)$/);
      if (gmProgressionAttribute) return await handleElementProgression(request, env, decodeURIComponent(gmProgressionAttribute[1]), decodeURIComponent(gmProgressionAttribute[2]), false);
      const gmProgression = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/ability-progression$/);
      if (gmProgression) return await handleElementProgression(request, env, decodeURIComponent(gmProgression[1]), '', false);

      const gmGrant = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/abilities\/grants$/);
      if (gmGrant) return await handleCharacterAbilities(request, env, decodeURIComponent(gmGrant[1]), true, true);
      const gmAbilities = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/abilities$/);
      if (gmAbilities) return await handleCharacterAbilities(request, env, decodeURIComponent(gmAbilities[1]), true, false);
      const playerAbilities = pathname.match(/^\/api\/player\/characters\/([^/]+)\/abilities$/);
      if (playerAbilities) return await handleCharacterAbilities(request, env, decodeURIComponent(playerAbilities[1]), false, false);
      const playerDetail = pathname.match(/^\/api\/player\/characters\/([^/]+)$/);
      if (playerDetail && request.method === 'GET') return await augmentCharacterDetail(request, env, decodeURIComponent(playerDetail[1]), false);
      const gmDetail = pathname.match(/^\/api\/gm\/characters\/([^/]+)$/);
      if (gmDetail && request.method === 'GET') return await augmentCharacterDetail(request, env, decodeURIComponent(gmDetail[1]), true);
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Ability authority gateway error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'ABILITY_AUTHORITY_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      return apiError('Ability authority 暫時無法完成要求。', 500, error?.code || 'ABILITY_AUTHORITY_SERVICE_ERROR');
    }
  }
};
