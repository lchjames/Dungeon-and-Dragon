import baseWorker from './inventory-weapon-gateway.js';
import {
  activateDraft,
  ensureCurrencyExchangeAuthority,
  executeCurrencyExchange,
  getExchangeAdminState,
  getPlayerCurrencyState,
  randomiseDraft,
  saveManualDraft,
  setCharacterCurrencyQuantity,
  updateGenerationSettings
} from './currency-exchange-authority.js';
import { loadInventoryEntry } from './inventory-weapon-authority.js';

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
    throw Object.assign(new Error('此 User 目前不可使用 Currency Exchange。'), { status: 403, code: 'USER_NOT_ACTIVE' });
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

async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try { return await request.json(); }
  catch { throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' }); }
}

async function requireCharacter(env, characterId, user, gm = false) {
  const row = await env.DB.prepare('SELECT id, owner_user_id, name, status FROM characters WHERE id = ? LIMIT 1').bind(characterId).first();
  if (!row) throw Object.assign(new Error('找不到 Character。'), { status: 404, code: 'CHARACTER_NOT_FOUND' });
  if (!gm && row.owner_user_id !== user.id) {
    throw Object.assign(new Error('你只可以使用自己角色嘅 Currency。'), { status: 403, code: 'CHARACTER_NOT_OWNED' });
  }
  return row;
}

async function assertCharacterUnlocked(env, characterId) {
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'character_life_states' LIMIT 1").first();
  if (!table) return;
  const row = await env.DB.prepare('SELECT character_locked FROM character_life_states WHERE character_id = ? LIMIT 1').bind(characterId).first();
  if (Number(row?.character_locked || 0) === 1) {
    throw Object.assign(new Error('死亡 Character 已鎖定，不能修改 Currency。'), { status: 423, code: 'CHARACTER_LOCKED_DEAD' });
  }
}

async function handleGmExchange(request, env, action = '', id = '') {
  const gm = await requireGM(request, env);
  await ensureCurrencyExchangeAuthority(env);
  if (request.method === 'GET' && !action) {
    return json({ ok: true, ...(await getExchangeAdminState(env)) });
  }
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  if (request.method === 'PATCH' && action === 'settings') {
    return json({ ok: true, settings: await updateGenerationSettings(env, await readBody(request), gm.id) });
  }
  if (request.method === 'POST' && action === 'randomise') {
    const body = await readBody(request);
    return json({ ok: true, draft: await randomiseDraft(env, gm.id, body?.settings || null) });
  }
  if (request.method === 'PUT' && action === 'draft') {
    return json({ ok: true, draft: await saveManualDraft(env, gm.id, await readBody(request)) });
  }
  if (request.method === 'POST' && action === 'activate' && id) {
    return json({ ok: true, active: await activateDraft(env, gm.id, id) });
  }
  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function handleCharacterCurrency(request, env, characterId, coinId = '', gmMode = false, exchange = false) {
  const user = gmMode ? await requireGM(request, env) : await requireUser(request, env);
  await ensureCurrencyExchangeAuthority(env);
  await requireCharacter(env, characterId, user, gmMode);

  if (request.method === 'GET' && !coinId && !exchange) {
    return json({ ok: true, ...(await getPlayerCurrencyState(env, characterId)) });
  }

  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await assertCharacterUnlocked(env, characterId);

  if (gmMode && request.method === 'PATCH' && coinId && !exchange) {
    const body = await readBody(request);
    if (!Object.prototype.hasOwnProperty.call(body || {}, 'quantity')) return apiError('Currency quantity is required.', 400, 'VALIDATION_ERROR');
    return json({ ok: true, ...(await setCharacterCurrencyQuantity(env, characterId, coinId, body.quantity, user)) });
  }

  if (!gmMode && request.method === 'POST' && exchange) {
    return json({ ok: true, ...(await executeCurrencyExchange(env, characterId, user.id, await readBody(request))) });
  }

  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function blockGenericCurrencyQuantityWrite(request, env, characterId, inventoryId, gmMode) {
  if (request.method !== 'PATCH') return null;
  const user = gmMode ? await requireGM(request, env) : await requireUser(request, env);
  await requireCharacter(env, characterId, user, gmMode);
  await ensureCurrencyExchangeAuthority(env);
  const body = await request.clone().json().catch(() => ({}));
  const attemptsQuantity = Object.prototype.hasOwnProperty.call(body || {}, 'quantity') || Object.prototype.hasOwnProperty.call(body || {}, 'qty');
  if (!attemptsQuantity) return null;
  const item = await loadInventoryEntry(env, characterId, inventoryId);
  if (String(item?.itemSubtype || '').toUpperCase() !== 'CURRENCY') return null;
  return apiError('Currency quantity is controlled only by Currency Exchange / GM Currency authority.', 409, 'CURRENCY_GENERIC_INVENTORY_WRITE_BLOCKED');
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const gmExchange = pathname.match(/^\/api\/gm\/currency-exchange(?:\/(settings|randomise|draft))?$/);
      if (gmExchange) return await handleGmExchange(request, env, gmExchange[1] || '');
      const gmActivate = pathname.match(/^\/api\/gm\/currency-exchange\/draft\/([^/]+)\/activate$/);
      if (gmActivate) return await handleGmExchange(request, env, 'activate', decodeURIComponent(gmActivate[1]));

      const gmCurrency = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/currency(?:\/([^/]+))?$/);
      if (gmCurrency) return await handleCharacterCurrency(request, env, decodeURIComponent(gmCurrency[1]), gmCurrency[2] ? decodeURIComponent(gmCurrency[2]) : '', true, false);
      const playerCurrency = pathname.match(/^\/api\/player\/characters\/([^/]+)\/currency$/);
      if (playerCurrency) return await handleCharacterCurrency(request, env, decodeURIComponent(playerCurrency[1]), '', false, false);
      const playerExchange = pathname.match(/^\/api\/player\/characters\/([^/]+)\/currency\/exchange$/);
      if (playerExchange) return await handleCharacterCurrency(request, env, decodeURIComponent(playerExchange[1]), '', false, true);

      const gmInventoryWrite = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/inventory\/([^/]+)$/);
      if (gmInventoryWrite) {
        const blocked = await blockGenericCurrencyQuantityWrite(request, env, decodeURIComponent(gmInventoryWrite[1]), decodeURIComponent(gmInventoryWrite[2]), true);
        if (blocked) return blocked;
      }
      const playerInventoryWrite = pathname.match(/^\/api\/player\/characters\/([^/]+)\/inventory\/([^/]+)$/);
      if (playerInventoryWrite) {
        const blocked = await blockGenericCurrencyQuantityWrite(request, env, decodeURIComponent(playerInventoryWrite[1]), decodeURIComponent(playerInventoryWrite[2]), false);
        if (blocked) return blocked;
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Currency Exchange gateway error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'CURRENCY_EXCHANGE_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      return apiError('Currency Exchange authority 暫時無法完成要求。', 500, error?.code || 'CURRENCY_EXCHANGE_SERVICE_ERROR');
    }
  }
};
