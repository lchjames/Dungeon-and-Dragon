import baseWorker from './story-script-gateway.js';
import {
  createWeaponDefinition,
  enrichProfilesWithWeaponSource,
  ensureInventoryWeaponAuthority,
  ensurePlayerAttackProfileSourceColumn,
  grantWeaponToCharacter,
  listCharacterInventory,
  listWeaponDefinitions,
  loadInventoryEntry,
  profileSourceStatus,
  setProfileSourceInventory,
  updateInventoryEntry,
  updateWeaponDefinition
} from './inventory-weapon-authority.js';

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
    throw Object.assign(new Error('此 User 目前不可使用 Inventory。'), { status: 403, code: 'USER_NOT_ACTIVE' });
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
    throw Object.assign(new Error('你只可以管理自己角色嘅 Inventory。'), { status: 403, code: 'CHARACTER_NOT_OWNED' });
  }
  return row;
}

async function assertCharacterUnlocked(env, characterId) {
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'character_life_states' LIMIT 1").first();
  if (!table) return;
  const row = await env.DB.prepare('SELECT character_locked FROM character_life_states WHERE character_id = ? LIMIT 1').bind(characterId).first();
  if (Number(row?.character_locked || 0) === 1) {
    throw Object.assign(new Error('死亡 Character 已鎖定，不能修改 Inventory / Equipment。'), { status: 423, code: 'CHARACTER_LOCKED_DEAD' });
  }
}

async function handleGmItems(request, env, itemId = '') {
  const gm = await requireGM(request, env);
  await ensureInventoryWeaponAuthority(env);
  if (request.method === 'GET' && !itemId) {
    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === '1';
    return json({ ok: true, items: await listWeaponDefinitions(env, { includeInactive }) });
  }
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  if (request.method === 'POST' && !itemId) {
    const body = await readBody(request);
    const itemType = String(body?.itemType || 'WEAPON').toUpperCase();
    if (itemType !== 'WEAPON') return apiError('This Alpha slice only authors WEAPON definitions.', 409, 'ITEM_TYPE_NOT_ENABLED');
    const item = await createWeaponDefinition(env, body, gm.id);
    return json({ ok: true, item }, 201);
  }
  if (request.method === 'PATCH' && itemId) {
    const item = await updateWeaponDefinition(env, itemId, await readBody(request));
    return json({ ok: true, item });
  }
  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function handleInventory(request, env, characterId, inventoryId = '', gmMode = false) {
  const user = gmMode ? await requireGM(request, env) : await requireUser(request, env);
  await ensureInventoryWeaponAuthority(env);
  await requireCharacter(env, characterId, user, gmMode);

  if (request.method === 'GET' && !inventoryId) {
    return json({ ok: true, inventory: await listCharacterInventory(env, characterId) });
  }

  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await assertCharacterUnlocked(env, characterId);

  if (gmMode && request.method === 'POST' && !inventoryId) {
    const body = await readBody(request);
    const itemDefinitionId = String(body?.itemDefinitionId || '').trim();
    if (!itemDefinitionId) return apiError('Weapon Definition is required.', 400, 'VALIDATION_ERROR');
    const item = await grantWeaponToCharacter(env, characterId, itemDefinitionId, user);
    return json({ ok: true, item, inventory: await listCharacterInventory(env, characterId) }, 201);
  }

  if (request.method === 'PATCH' && inventoryId) {
    const item = await updateInventoryEntry(env, characterId, inventoryId, await readBody(request), user);
    return json({ ok: true, item, inventory: await listCharacterInventory(env, characterId) });
  }

  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function enrichProfilePayload(env, characterId, payload, onlyAvailable = false) {
  if (!payload || !Array.isArray(payload.profiles)) return payload;
  return {
    ...payload,
    profiles: await enrichProfilesWithWeaponSource(env, characterId, payload.profiles, { onlyAvailable })
  };
}

async function handleGmAttackProfiles(request, env, characterId, profileId = '') {
  const gm = await requireGM(request, env);
  await ensureInventoryWeaponAuthority(env);
  await requireCharacter(env, characterId, gm, true);

  if (request.method === 'GET') {
    const response = await baseWorker.fetch(request, env);
    if (!response.ok) return response;
    await ensurePlayerAttackProfileSourceColumn(env);
    return json(await enrichProfilePayload(env, characterId, await response.json(), false), response.status);
  }

  const hasJson = (request.headers.get('Content-Type') || '').toLowerCase().includes('application/json');
  let body = null;
  if (hasJson && (request.method === 'POST' || request.method === 'PATCH')) body = await request.clone().json();
  const sourceSupplied = body && Object.prototype.hasOwnProperty.call(body, 'sourceInventoryId');
  if (sourceSupplied && body.sourceInventoryId) {
    const source = await loadInventoryEntry(env, characterId, String(body.sourceInventoryId));
    if (!source || source.itemType !== 'WEAPON' || source.quantity !== 1 || !source.active) {
      return apiError('Attack Profile source must be an active Weapon owned by this Character.', 409, 'ATTACK_PROFILE_WEAPON_SOURCE_INVALID');
    }
  }

  const response = await baseWorker.fetch(request, env);
  if (!response.ok || !sourceSupplied) return response;
  const payload = await response.json();
  const resolvedProfileId = profileId || payload?.profile?.id;
  if (!resolvedProfileId) return json(payload, response.status);
  await setProfileSourceInventory(env, resolvedProfileId, characterId, body.sourceInventoryId || null, gm.id);
  if (payload.profile) {
    const enriched = await enrichProfilesWithWeaponSource(env, characterId, [payload.profile]);
    payload.profile = enriched[0] || payload.profile;
  }
  return json(payload, response.status);
}

async function playerCombatSnapshot(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/player/combat', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return { response, payload: null };
  return { response, payload: await response.json() };
}

async function filterCombatProfiles(env, payload) {
  const characterId = payload?.combat?.currentCombatant?.entityType === 'character'
    ? payload.combat.currentCombatant.entityId
    : '';
  if (!characterId || !Array.isArray(payload?.attackProfiles)) return payload;
  await ensurePlayerAttackProfileSourceColumn(env);
  return {
    ...payload,
    attackProfiles: await enrichProfilesWithWeaponSource(env, characterId, payload.attackProfiles, { onlyAvailable: true })
  };
}

async function handlePlayerCombat(request, env, attackMatch = null) {
  const user = await requireUser(request, env);
  await ensureInventoryWeaponAuthority(env);

  if (request.method === 'POST' && attackMatch) {
    const body = await request.clone().json().catch(() => ({}));
    const profileId = String(body?.profileId || '').trim();
    if (profileId) {
      const snapshot = await playerCombatSnapshot(request, env);
      if (snapshot.response.ok) {
        const actor = snapshot.payload?.combat?.currentCombatant;
        if (snapshot.payload?.combat?.isOwnTurn && actor?.entityType === 'character' && actor.controllerUserId === user.id) {
          const status = await profileSourceStatus(env, profileId, actor.entityId);
          if (status.profileExists && status.sourceInventoryId && !status.available) {
            return apiError('This Attack Profile requires its linked Weapon to be owned, active and equipped.', 409, 'ATTACK_PROFILE_WEAPON_NOT_EQUIPPED');
          }
        }
      }
    }
  }

  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return response;
  return json(await filterCombatProfiles(env, await response.json()), response.status);
}

async function augmentCharacterDetail(request, env, characterId, gmMode = false) {
  const user = gmMode ? await requireGM(request, env) : await requireUser(request, env);
  await ensureInventoryWeaponAuthority(env);
  await requireCharacter(env, characterId, user, gmMode);
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const payload = await response.json();
  if (payload?.character) payload.character.inventory = await listCharacterInventory(env, characterId);
  return json(payload, response.status);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const gmItems = pathname.match(/^\/api\/gm\/items(?:\/([^/]+))?$/);
      if (gmItems) return await handleGmItems(request, env, gmItems[1] ? decodeURIComponent(gmItems[1]) : '');

      const gmInventory = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/inventory(?:\/([^/]+))?$/);
      if (gmInventory) return await handleInventory(request, env, decodeURIComponent(gmInventory[1]), gmInventory[2] ? decodeURIComponent(gmInventory[2]) : '', true);

      const playerInventory = pathname.match(/^\/api\/player\/characters\/([^/]+)\/inventory(?:\/([^/]+))?$/);
      if (playerInventory) return await handleInventory(request, env, decodeURIComponent(playerInventory[1]), playerInventory[2] ? decodeURIComponent(playerInventory[2]) : '', false);

      const gmProfiles = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/attack-profiles(?:\/([^/]+))?$/);
      if (gmProfiles) return await handleGmAttackProfiles(request, env, decodeURIComponent(gmProfiles[1]), gmProfiles[2] ? decodeURIComponent(gmProfiles[2]) : '');

      if (pathname === '/api/player/combat' && request.method === 'GET') return await handlePlayerCombat(request, env);
      const attackMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/attack$/);
      if (attackMatch && request.method === 'POST') return await handlePlayerCombat(request, env, attackMatch);

      const playerDetail = pathname.match(/^\/api\/player\/characters\/([^/]+)$/);
      if (playerDetail && request.method === 'GET') return await augmentCharacterDetail(request, env, decodeURIComponent(playerDetail[1]), false);
      const gmDetail = pathname.match(/^\/api\/gm\/characters\/([^/]+)$/);
      if (gmDetail && request.method === 'GET') return await augmentCharacterDetail(request, env, decodeURIComponent(gmDetail[1]), true);

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Inventory / Weapon gateway error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'INVENTORY_WEAPON_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      if (error?.code === 'INVENTORY_LEGACY_QUANTITY_INVALID') return apiError(error.message, 500, error.code);
      return apiError('Inventory / Weapon authority 暫時無法完成要求。', 500, error?.code || 'INVENTORY_WEAPON_SERVICE_ERROR');
    }
  }
};
