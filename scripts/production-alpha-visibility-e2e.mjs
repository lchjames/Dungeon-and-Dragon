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

const RUN_ID = `alpha-vis-${stamp()}`.slice(0, 32);
const PLAYER_A_NAME = `${RUN_ID}-pa`.slice(0, 32);
const PLAYER_B_NAME = `${RUN_ID}-pb`.slice(0, 32);
const PLAYER_A_KEY = String(randomInt(1000, 10000));
const PLAYER_B_KEY = String(randomInt(1000, 10000));
const CHARACTER_A_NAME = `${RUN_ID}-char-a`.slice(0, 120);
const CHARACTER_B_NAME = `${RUN_ID}-char-b`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function playerInternalUsername(displayName) {
  return `u_${sha256Hex(displayName.trim().normalize('NFKC').toLocaleLowerCase()).slice(0, 24)}`;
}

function playerInternalPassword(key) {
  return `dnd-key:${key}`;
}

class HttpError extends Error {
  constructor(message, status, code, payload) {
    super(message);
    this.name = 'HttpError';
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
    const values = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
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
    if (this.cookies.size) {
      headers.Cookie = [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    }
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
      throw new HttpError(
        payload?.error?.message || `${this.label} request failed: ${method} ${path}`,
        response.status,
        payload?.error?.code,
        payload
      );
    }
    return { response, payload };
  }

  async json(path, options) {
    return (await this.request(path, options)).payload;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findNamed(items, name, label) {
  const found = (items || []).find(item => item?.name === name || item?.displayName === name);
  if (!found) throw new Error(`Unable to find ${label}: ${name}`);
  return found;
}

function buildAllocations(skills, pool = 200) {
  assert(Array.isArray(skills) && skills.length === 23, 'Expected exactly 23 Creation Skills.');
  let remaining = pool;
  const allocations = {};
  for (const skill of skills) {
    const value = Math.min(30, remaining);
    allocations[skill.key] = value;
    remaining -= value;
  }
  assert(remaining === 0, `Unable to allocate full Creation Skill pool; ${remaining} remains.`);
  return allocations;
}

async function ensureNoExistingCombat(gm) {
  const state = await gm.json('/api/gm/combat');
  if (state?.combat?.status === 'active') {
    throw new Error(`Refusing visibility E2E write: an active Combat already exists (${state.combat.id}).`);
  }
}

async function registerPlayer(player, displayName, key) {
  await player.json('/api/auth/register', {
    method: 'POST',
    body: {
      username: playerInternalUsername(displayName),
      displayName,
      password: playerInternalPassword(key)
    }
  });
  const me = await player.json('/api/auth/me');
  assert(me?.user?.id, `${displayName} registration did not establish a Player session.`);
  assert(me?.user?.role === 'player', `${displayName} did not authenticate as player.`);
  return me.user;
}

async function createCharacter(player, name) {
  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(roll?.draft?.id, `Character creation roll did not return a Draft ID for ${name}.`);
  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name, summary: 'Production Alpha per-viewer visibility E2E Character', draftId: roll.draft.id }
  });
  const characterId = created?.character?.id;
  assert(characterId, `Character creation did not return a Character ID for ${name}.`);

  const detail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  const allocations = buildAllocations(
    detail?.character?.skills,
    Number(detail?.character?.progression?.creationSkillPointsTotal || 200)
  );
  const saved = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/creation-skills`, {
    method: 'PATCH', body: { allocations }
  });
  assert(Number(saved?.progression?.creationSkillPointsRemaining) === 0, `Creation Skill Points were not fully allocated for ${name}.`);
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/finalize-creation`, {
    method: 'POST', body: {}
  });
  const finalDetail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  assert(finalDetail?.character?.status === 'active', `${name} did not become active after Finalize.`);
  return finalDetail.character;
}

async function createScenarioScene(gm) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Production Alpha per-viewer visibility live E2E' }
  });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, {
    method: 'POST', body: { name: SCENE_NAME }
  });
  story = await gm.json('/api/gm/story');
  const refreshedScenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  const scene = findNamed(refreshedScenario?.scenes, SCENE_NAME, 'Scene');
  return { scenario: refreshedScenario, scene };
}

async function createRuntimeMap(gm, sceneId, characterAId, characterBId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST',
    body: { name: LOCATION_NAME, description: 'Production Alpha visibility E2E Location', gmNotes: RUN_ID }
  });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'World Location');

  await gm.json('/api/gm/world/maps', {
    method: 'POST',
    body: {
      locationId: location.id,
      name: MAP_NAME,
      width: 2,
      height: 1,
      backgroundAssetRef: '',
      gmNotes: RUN_ID
    }
  });
  world = await gm.json('/api/gm/world-maps');
  const mapTemplate = findNamed(world?.mapTemplates, MAP_NAME, 'Map Template');

  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  const runtime = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label: `${RUN_ID} Visibility Runtime` }
  });
  const mapInstanceId = runtime?.mapInstance?.id;
  assert(mapInstanceId, 'Scene Runtime did not return a Runtime Map ID.');

  const placedA = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterAId)}/position`, {
    method: 'PUT', body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  const placedB = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterBId)}/position`, {
    method: 'PUT', body: { x: 1, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  assert(placedA?.position?.x === 0 && placedA?.position?.y === 0, 'Character A was not placed at (0,0).');
  assert(placedB?.position?.x === 1 && placedB?.position?.y === 0, 'Character B was not placed at (1,0).');
  return { location, mapTemplate, mapInstanceId };
}

function tokenFor(payload, characterId) {
  return (payload?.tokens || []).find(token => token?.entityType === 'character' && token?.entityId === characterId) || null;
}

async function playerWorld(player, characterId) {
  const payload = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}`);
  assert(payload?.map?.id, 'Player world payload did not expose active Runtime Map context.');
  assert(Array.isArray(payload?.tokens), 'Player world payload did not include token list.');
  return payload;
}

async function setGlobalVisibility(gm, mapInstanceId, characterId, x, mode) {
  const payload = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterId)}/position`, {
    method: 'PUT', body: { x, y: 0, visibilityMode: mode, allowOccupied: false }
  });
  assert(payload?.position?.visibilityMode === mode, `Global visibility for ${characterId} did not become ${mode}.`);
}

async function setViewerVisibility(gm, mapInstanceId, characterId, viewerUserId, mode) {
  const payload = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterId)}/visibility/${encodeURIComponent(viewerUserId)}`, {
    method: 'PUT', body: { visibilityMode: mode }
  });
  assert(payload?.override?.visibilityMode === mode, `Viewer override for ${characterId} did not become ${mode}.`);
}

async function clearViewerVisibility(gm, mapInstanceId, characterId, viewerUserId) {
  const payload = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterId)}/visibility/${encodeURIComponent(viewerUserId)}`, {
    method: 'DELETE'
  });
  assert(payload?.cleared === true, `Viewer override for ${characterId} was not cleared.`);
}

async function exerciseVisibility({ gm, playerA, playerB, userA, userB, characterA, characterB, mapInstanceId }) {
  const initialA = await playerWorld(playerA, characterA.id);
  const initialB = await playerWorld(playerB, characterB.id);
  assert(tokenFor(initialA, characterA.id)?.own === true, 'Player A cannot see own Character token by default.');
  assert(Boolean(tokenFor(initialA, characterB.id)), 'Player A cannot see Player B token by default.');
  assert(tokenFor(initialB, characterB.id)?.own === true, 'Player B cannot see own Character token by default.');
  assert(Boolean(tokenFor(initialB, characterA.id)), 'Player B cannot see Player A token by default.');

  await setGlobalVisibility(gm, mapInstanceId, characterB.id, 1, 'hidden');
  const globalHiddenA = await playerWorld(playerA, characterA.id);
  const ownerStillVisibleB = await playerWorld(playerB, characterB.id);
  assert(!tokenFor(globalHiddenA, characterB.id), 'Global hidden did not hide Character B from Player A.');
  assert(tokenFor(ownerStillVisibleB, characterB.id)?.own === true, 'Global hidden incorrectly hid Character B from its owner.');

  await setViewerVisibility(gm, mapInstanceId, characterB.id, userA.id, 'visible');
  const visibleOverrideA = await playerWorld(playerA, characterA.id);
  assert(Boolean(tokenFor(visibleOverrideA, characterB.id)), 'Visible per-viewer override did not beat global hidden for Player A.');

  await setViewerVisibility(gm, mapInstanceId, characterA.id, userB.id, 'hidden');
  const hiddenOverrideB = await playerWorld(playerB, characterB.id);
  const ownerStillVisibleA = await playerWorld(playerA, characterA.id);
  assert(!tokenFor(hiddenOverrideB, characterA.id), 'Hidden per-viewer override did not hide Character A from Player B.');
  assert(tokenFor(ownerStillVisibleA, characterA.id)?.own === true, 'Per-viewer hidden state affected Character A owner visibility.');

  const ownerReject = await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterB.id)}/visibility/${encodeURIComponent(userB.id)}`, {
    method: 'PUT', body: { visibilityMode: 'hidden' }, allow: [409]
  });
  assert(ownerReject.response.status === 409, `Owner visibility override should return 409; got ${ownerReject.response.status}.`);
  assert(ownerReject.payload?.error?.code === 'SELF_VISIBILITY_ALWAYS_VISIBLE', `Owner visibility rejection code was ${ownerReject.payload?.error?.code || 'missing'}.`);

  await clearViewerVisibility(gm, mapInstanceId, characterB.id, userA.id);
  const inheritedHiddenA = await playerWorld(playerA, characterA.id);
  assert(!tokenFor(inheritedHiddenA, characterB.id), 'Cleared Player A override did not fall back to Character B global hidden state.');

  await setGlobalVisibility(gm, mapInstanceId, characterB.id, 1, 'default');
  await clearViewerVisibility(gm, mapInstanceId, characterA.id, userB.id);
  const restoredA = await playerWorld(playerA, characterA.id);
  const restoredB = await playerWorld(playerB, characterB.id);
  assert(Boolean(tokenFor(restoredA, characterB.id)), 'Character B did not return to default Player-visible state.');
  assert(Boolean(tokenFor(restoredB, characterA.id)), 'Character A did not return to inherited default Player-visible state.');

  return {
    defaultMutualVisibility: true,
    globalHiddenFromOtherPlayer: true,
    ownerSelfVisibleUnderGlobalHidden: true,
    viewerVisibleBeatsGlobalHidden: true,
    viewerHiddenBeatsGlobalDefault: true,
    ownerHiddenOverrideRejected: true,
    clearedOverrideFallsBackToGlobal: true,
    restoredDefaultMutualVisibility: true
  };
}

async function closeAndArchive(gm, mapInstanceId) {
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after visibility E2E.');

  const story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: scenario.name,
      status: 'archived',
      summary: scenario.summary || '',
      gmNotes: `${scenario.gmNotes || ''}\nProduction per-viewer visibility E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing per-viewer visibility E2E session.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'two test Players with one active Character each',
        'Scenario / Scene',
        'World Location / 2x1 Map Template / Scene binding',
        'Runtime Map / two Character positions',
        'global token visibility changes',
        'per-viewer visible/hidden overrides and override cleanup',
        'closed Runtime and archived Scenario audit entities'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const playerA = new Session('Player A');
  const playerB = new Session('Player B');
  const startedAt = new Date().toISOString();

  await gm.json('/api/admin/auth/login', {
    method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD }
  });
  const gmMe = await gm.json('/api/admin/auth/me');
  assert(gmMe?.user?.role === 'admin', 'GM session did not authenticate as admin.');
  await ensureNoExistingCombat(gm);

  const userA = await registerPlayer(playerA, PLAYER_A_NAME, PLAYER_A_KEY);
  const userB = await registerPlayer(playerB, PLAYER_B_NAME, PLAYER_B_KEY);
  const characterA = await createCharacter(playerA, CHARACTER_A_NAME);
  const characterB = await createCharacter(playerB, CHARACTER_B_NAME);
  const story = await createScenarioScene(gm);
  const runtime = await createRuntimeMap(gm, story.scene.id, characterA.id, characterB.id);
  const visibility = await exerciseVisibility({
    gm,
    playerA,
    playerB,
    userA,
    userB,
    characterA,
    characterB,
    mapInstanceId: runtime.mapInstanceId
  });
  const scenarioId = await closeAndArchive(gm, runtime.mapInstanceId);

  console.log(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    startedAt,
    endedAt: new Date().toISOString(),
    gmRole: gmMe.user.role,
    players: {
      a: { userId: userA.id, displayName: userA.displayName || PLAYER_A_NAME },
      b: { userId: userB.id, displayName: userB.displayName || PLAYER_B_NAME }
    },
    characters: {
      a: { id: characterA.id, name: characterA.name, status: characterA.status },
      b: { id: characterB.id, name: characterB.name, status: characterB.status }
    },
    scenario: { id: scenarioId, sceneId: story.scene.id },
    world: {
      locationId: runtime.location.id,
      mapTemplateId: runtime.mapTemplate.id,
      mapInstanceId: runtime.mapInstanceId
    },
    visibility,
    exercised: {
      twoIndependentPlayerSessions: userA.id !== userB.id,
      ...visibility,
      runtimeClosed: true,
      scenarioArchived: true
    },
    note: 'The visibility runner leaves clearly named alpha-vis-* audit/test definitions in D1; Runtime is closed and Scenario archived instead of hard-deleting Canonical data.'
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
    note: 'A failed visibility live run may leave alpha-vis-* audit/test data in D1. It never auto-modifies unrelated Combat state.'
  }, null, 2));
  process.exitCode = 1;
});
