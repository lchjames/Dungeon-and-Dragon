import { createHash, randomInt } from 'node:crypto';

const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = `alpha-inv-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 80);
const WEAPON_NAME = `${RUN_ID}-blade`.slice(0, 120);
const PROFILE_NAME = `${RUN_ID}-profile`.slice(0, 80);

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
function playerInternalUsername(displayName) {
  return `u_${sha256Hex(displayName.trim().normalize('NFKC').toLocaleLowerCase()).slice(0, 24)}`;
}
function playerInternalPassword(key) {
  return `dnd-key:${key}`;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class HttpError extends Error {
  constructor(message, status, code, payload) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }
  captureCookies(headers) {
    const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
    for (const header of values) {
      const first = String(header).split(';', 1)[0];
      const index = first.indexOf('=');
      if (index <= 0) continue;
      const name = first.slice(0, index).trim();
      const value = first.slice(index + 1).trim();
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  async request(path, { method = 'GET', body, allow = [] } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual'
    });
    this.captureCookies(response.headers);
    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { payload = await response.json(); } catch { payload = null; }
    } else {
      const text = await response.text();
      payload = text ? { text } : null;
    }
    if (!response.ok && !allow.includes(response.status)) {
      throw new HttpError(payload?.error?.message || `${this.label} request failed: ${method} ${path}`, response.status, payload?.error?.code, payload);
    }
    return { response, payload };
  }
  async json(path, options) {
    return (await this.request(path, options)).payload;
  }
}

function buildAllocations(skills, pool = 200) {
  assert(Array.isArray(skills) && skills.length === 23, 'Expected exactly 23 Creation Skills.');
  const out = {};
  let remaining = pool;
  for (const skill of skills) {
    const value = Math.min(30, remaining);
    out[skill.key] = value;
    remaining -= value;
  }
  assert(remaining === 0, `Unable to allocate Creation Skill pool; ${remaining} remains.`);
  return out;
}

async function registerPlayer(player) {
  await player.json('/api/auth/register', {
    method: 'POST',
    body: {
      username: playerInternalUsername(PLAYER_NAME),
      displayName: PLAYER_NAME,
      password: playerInternalPassword(PLAYER_KEY)
    }
  });
  const me = await player.json('/api/auth/me');
  assert(me?.user?.role === 'player', 'Test User did not authenticate as player.');
  return me.user;
}

async function createActiveCharacter(player) {
  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(roll?.draft?.id, 'Character creation roll did not return a Draft ID.');
  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name: CHARACTER_NAME, summary: 'Production Alpha Inventory / Weapon foundation E2E', draftId: roll.draft.id }
  });
  const characterId = created?.character?.id;
  assert(characterId, 'Character creation did not return a Character ID.');
  const detail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  const allocations = buildAllocations(detail?.character?.skills, Number(detail?.character?.progression?.creationSkillPointsTotal || 200));
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/creation-skills`, {
    method: 'PATCH', body: { allocations }
  });
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/finalize-creation`, { method: 'POST', body: {} });
  const finalDetail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  assert(finalDetail?.character?.status === 'active', 'Inventory test Character did not become active.');
  return finalDetail.character;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Inventory / Weapon foundation E2E.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'temporary Player and active Character',
        'global Weapon Definition',
        'Character Weapon Inventory grant',
        'Weapon-backed Attack Profile source binding',
        'Player equip and unequip Inventory audit rows'
      ],
      doesNotStartCombat: true,
      doesNotExerciseStoreOrCurrency: true
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const player = new Session('Player');
  const startedAt = new Date().toISOString();

  await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
  const gmMe = await gm.json('/api/admin/auth/me');
  assert(gmMe?.user?.role === 'admin', 'GM session did not authenticate as admin.');
  const existingCombat = await gm.json('/api/gm/combat');
  if (existingCombat?.combat?.status === 'active') {
    throw new Error(`Refusing Inventory / Weapon E2E write while active Combat exists (${existingCombat.combat.id}).`);
  }

  const playerUser = await registerPlayer(player);
  const character = await createActiveCharacter(player);

  const createdWeapon = await gm.json('/api/gm/items', {
    method: 'POST',
    body: {
      itemType: 'WEAPON',
      name: WEAPON_NAME,
      description: 'Production Alpha Inventory / Weapon E2E definition',
      weapon: {
        weaponGroup: 'alpha_test',
        damageFormula: '1D6',
        damageType: 'test',
        hitModifier: 7,
        properties: { productionAlpha: true }
      }
    }
  });
  const weapon = createdWeapon?.item;
  assert(weapon?.id && weapon.itemType === 'WEAPON', 'Weapon Definition creation failed.');
  assert(weapon.weapon?.hitModifier === 7, 'Weapon metadata did not persist hit modifier.');

  const granted = await gm.json(`/api/gm/characters/${encodeURIComponent(character.id)}/inventory`, {
    method: 'POST', body: { itemDefinitionId: weapon.id }
  });
  const inventoryItem = granted?.item;
  assert(inventoryItem?.id, 'Weapon grant did not return Inventory ID.');
  assert(inventoryItem.quantity === 1 && inventoryItem.isEquipped === false, 'Granted Weapon must start quantity 1 and unequipped.');

  const profilePayload = await gm.json(`/api/gm/characters/${encodeURIComponent(character.id)}/attack-profiles`, {
    method: 'POST',
    body: {
      name: PROFILE_NAME,
      storedAccuracy: 50,
      damageDiceCount: 1,
      damageDiceSides: 6,
      fixedDamageModifier: 0,
      appliesCharacterDamageBonus: true,
      sourceInventoryId: inventoryItem.id
    }
  });
  const profile = profilePayload?.profile;
  assert(profile?.id, 'Weapon-backed Attack Profile creation failed.');
  assert(profile.sourceInventoryId === inventoryItem.id, 'Attack Profile did not persist Weapon source binding.');
  assert(profile.sourceAvailable === false, 'Unequipped Weapon-backed Profile must be unavailable.');

  const playerInventory = await player.json(`/api/player/characters/${encodeURIComponent(character.id)}/inventory`);
  const playerWeapon = (playerInventory?.inventory || []).find(item => item.id === inventoryItem.id);
  assert(playerWeapon?.revision, 'Player Inventory did not expose canonical revision.');

  const equipped = await player.json(`/api/player/characters/${encodeURIComponent(character.id)}/inventory/${encodeURIComponent(inventoryItem.id)}`, {
    method: 'PATCH', body: { isEquipped: true, revision: playerWeapon.revision }
  });
  const equippedWeapon = equipped?.item;
  assert(equippedWeapon?.isEquipped === true, 'Player Weapon equip did not persist.');
  assert(equippedWeapon.equipSlot === 'weapon', 'Equipped Weapon did not expose Alpha weapon slot marker.');

  const profilesAfterEquip = await gm.json(`/api/gm/characters/${encodeURIComponent(character.id)}/attack-profiles`);
  const linkedAfterEquip = (profilesAfterEquip?.profiles || []).find(item => item.id === profile.id);
  assert(linkedAfterEquip?.sourceAvailable === true, 'Equipped Weapon-backed Profile did not become available.');

  const unequipped = await player.json(`/api/player/characters/${encodeURIComponent(character.id)}/inventory/${encodeURIComponent(inventoryItem.id)}`, {
    method: 'PATCH', body: { isEquipped: false, revision: equippedWeapon.revision }
  });
  assert(unequipped?.item?.isEquipped === false, 'Player Weapon unequip did not persist.');

  const profilesAfterUnequip = await gm.json(`/api/gm/characters/${encodeURIComponent(character.id)}/attack-profiles`);
  const linkedAfterUnequip = (profilesAfterUnequip?.profiles || []).find(item => item.id === profile.id);
  assert(linkedAfterUnequip?.sourceAvailable === false, 'Unequipped Weapon-backed Profile remained available.');

  const definitions = await gm.json('/api/gm/items');
  const finalDefinition = (definitions?.items || []).find(item => item.id === weapon.id);
  assert(finalDefinition?.weapon?.damageFormula === '1D6', 'Definition/ownership isolation check failed.');
  assert(finalDefinition?.weapon?.hitModifier === 7, 'Equipment mutations changed Weapon metadata.');

  console.log(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    startedAt,
    endedAt: new Date().toISOString(),
    gmRole: gmMe.user.role,
    player: { id: playerUser.id, displayName: playerUser.displayName || PLAYER_NAME },
    character: { id: character.id, name: character.name, status: character.status },
    weaponDefinition: { id: weapon.id, name: weapon.name },
    inventory: { id: inventoryItem.id, finalEquipped: false },
    attackProfile: { id: profile.id, sourceInventoryId: inventoryItem.id, finalSourceAvailable: linkedAfterUnequip.sourceAvailable },
    exercised: {
      canonicalWeaponDefinition: true,
      authoritativeGrant: true,
      profileWeaponBinding: true,
      sourceUnavailableBeforeEquip: true,
      sourceAvailableAfterEquip: true,
      sourceUnavailableAfterUnequip: true,
      definitionOwnershipIsolation: true
    },
    doesNotStartCombat: true,
    note: 'The runner leaves clearly named alpha-inv-* Player/Character/Weapon/Profile audit data in D1. It never starts Combat.'
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    error: error.message,
    status: error.status || null,
    code: error.code || null,
    doesNotStartCombat: true,
    note: 'A failed live Inventory / Weapon run may leave alpha-inv-* audit/test data in D1.'
  }, null, 2));
  process.exitCode = 1;
});
