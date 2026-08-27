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

const RUN_ID = `alpha-rest-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
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

function findResource(character, key) {
  const wanted = String(key || '').toUpperCase();
  const resource = (character?.resources || []).find(item => String(item?.key || '').toUpperCase() === wanted);
  if (!resource) throw new Error(`Character is missing canonical ${wanted} resource.`);
  return resource;
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
    throw new Error(`Refusing Rest E2E write: an active Combat already exists (${state.combat.id}).`);
  }
}

async function createPlayerCharacter(player) {
  await player.json('/api/auth/register', {
    method: 'POST',
    body: {
      username: playerInternalUsername(PLAYER_NAME),
      displayName: PLAYER_NAME,
      password: playerInternalPassword(PLAYER_KEY)
    }
  });

  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(roll?.draft?.id, 'Character creation roll did not return a Draft ID.');
  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name: CHARACTER_NAME, summary: 'Production Alpha Rest E2E Character', draftId: roll.draft.id }
  });
  const characterId = created?.character?.id;
  assert(characterId, 'Character creation did not return a Character ID.');

  const detail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  const allocations = buildAllocations(
    detail?.character?.skills,
    Number(detail?.character?.progression?.creationSkillPointsTotal || 200)
  );
  const saved = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/creation-skills`, {
    method: 'PATCH', body: { allocations }
  });
  assert(Number(saved?.progression?.creationSkillPointsRemaining) === 0, 'Creation Skill Points were not fully allocated.');
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/finalize-creation`, {
    method: 'POST', body: {}
  });
  const finalDetail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  assert(finalDetail?.character?.status === 'active', 'Character did not become active after Finalize.');
  return finalDetail.character;
}

async function prepareShortRestHp(gm, character) {
  const hp = findResource(character, 'HP');
  const mp = findResource(character, 'MP');
  const max = Number(hp.max);
  assert(Number.isInteger(max) && max > 1, 'Disposable Character needs Max HP > 1 for Short Rest validation.');
  const requested = Math.ceil(max * 0.10);
  const deficit = Math.min(requested, max - 1);
  assert(deficit > 0, 'Short Rest HP validation needs a positive recoverable deficit.');
  const current = max - deficit;
  const corrected = await gm.json(`/api/gm/characters/${encodeURIComponent(character.id)}/resources/HP`, {
    method: 'PATCH', body: { current }
  });
  assert(Number(corrected?.resource?.max) === max, 'GM HP correction changed Max HP unexpectedly.');
  assert(Number(corrected?.resource?.current) === current, 'GM HP correction did not set the requested Rest precondition.');
  return {
    current,
    max,
    recoveryRequested: requested,
    recoveryExpected: deficit,
    after: max,
    mpBefore: Number(mp.current)
  };
}

async function createScenarioScene(gm) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Production Alpha Short Rest live E2E' }
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

async function createRuntimeMap(gm, sceneId, characterId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST',
    body: { name: LOCATION_NAME, description: 'Production Alpha Rest E2E Location', gmNotes: RUN_ID }
  });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'World Location');

  await gm.json('/api/gm/world/maps', {
    method: 'POST',
    body: {
      locationId: location.id,
      name: MAP_NAME,
      width: 1,
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
    method: 'POST', body: { sceneId, label: `${RUN_ID} Rest Runtime` }
  });
  const mapInstanceId = runtime?.mapInstance?.id;
  assert(mapInstanceId, 'Scene Runtime did not return a Runtime Map ID.');

  const placed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterId)}/position`, {
    method: 'PUT',
    body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  assert(placed?.position?.x === 0 && placed?.position?.y === 0, 'Character was not placed on Runtime Map cell (0,0).');
  return { location, mapTemplate, mapInstanceId };
}

async function exerciseShortRest({ gm, player, character, expected }) {
  const initialWorld = await player.json(`/api/player/world/characters/${encodeURIComponent(character.id)}`);
  assert(initialWorld?.map?.id, 'Player cannot see the active Runtime Map.');
  assert(initialWorld?.turn?.mode === 'exploration', 'Rest precondition must be Exploration mode.');
  assert(initialWorld?.turn?.actionAvailable === true, 'Rest must start before Action is spent.');
  assert(initialWorld?.turn?.moveAvailable === true, 'Rest must start before Move is spent.');
  const startRound = Number(initialWorld?.turn?.roundNumber || 0);
  assert(startRound >= 1, 'Exploration Round was not initialized.');

  const started = await player.json(`/api/player/world/characters/${encodeURIComponent(character.id)}/rest/start`, {
    method: 'POST', body: { restType: 'short', resource: 'HP' }
  });
  assert(started?.restStarted === true, 'Short Rest start response did not confirm Rest start.');
  assert(started?.rest?.restType === 'short', 'Rest type is not short.');
  assert(started?.rest?.resource === 'HP', 'Rest recovered the wrong resource.');
  assert(started?.rest?.status === 'completed', `Single-participant Short Rest should complete through canonical rounds; got ${started?.rest?.status}.`);
  assert(Number(started?.rest?.progressRounds) === 2, 'Short Rest did not complete at 2 Rounds.');
  assert(Number(started?.rest?.requiredRounds) === 2, 'Short Rest required-round value is not 2.');
  assert(Number(started?.rest?.completedRound) === startRound + 1, 'Short Rest completion Round is incorrect.');
  assert(Number(started?.rest?.recoveryApplied) === expected.recoveryExpected, 'Short Rest applied an unexpected HP recovery amount.');

  const characterAfter = (await player.json(`/api/player/characters/${encodeURIComponent(character.id)}`))?.character;
  const hpAfter = findResource(characterAfter, 'HP');
  const mpAfter = findResource(characterAfter, 'MP');
  assert(Number(hpAfter.current) === expected.after, `Short Rest HP-after mismatch: expected ${expected.after}, got ${hpAfter.current}.`);
  assert(Number(hpAfter.max) === expected.max, 'Short Rest changed Max HP unexpectedly.');
  assert(Number(mpAfter.current) === expected.mpBefore, 'HP Rest must not recover or alter MP.');

  const worldAfter = await player.json(`/api/player/world/characters/${encodeURIComponent(character.id)}`);
  assert(worldAfter?.rest?.status === 'completed', 'Completed Rest state did not persist in D1-backed Player context.');
  assert(worldAfter?.turn?.mode === 'exploration', 'Player did not return to Exploration after Rest completion.');
  assert(worldAfter?.turn?.actionAvailable === true && worldAfter?.turn?.moveAvailable === true, 'Completed Rest did not expose the next available Exploration turn.');

  return {
    startRound,
    completedRound: Number(started.rest.completedRound),
    progressRounds: Number(started.rest.progressRounds),
    hpBefore: expected.current,
    hpMax: expected.max,
    recoveryRequested: expected.recoveryRequested,
    recoveryApplied: Number(started.rest.recoveryApplied),
    hpAfter: Number(hpAfter.current),
    mpBefore: expected.mpBefore,
    mpAfter: Number(mpAfter.current),
    finalExplorationRound: Number(worldAfter?.turn?.roundNumber || 0)
  };
}

async function closeAndArchive(gm, mapInstanceId) {
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after Rest E2E.');

  const story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: scenario.name,
      status: 'archived',
      summary: scenario.summary || '',
      gmNotes: `${scenario.gmNotes || ''}\nProduction Short Rest E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Short Rest E2E session.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'test Player and active Character',
        'temporary GM HP correction for Short Rest validation',
        'Scenario / Scene',
        'World Location / Map Template / Scene binding',
        'Runtime Map / Character position',
        'Rest state and audit data',
        'closed Runtime and archived Scenario audit entities'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const player = new Session('Player');
  const startedAt = new Date().toISOString();

  await gm.json('/api/admin/auth/login', {
    method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD }
  });
  const me = await gm.json('/api/admin/auth/me');
  assert(me?.user?.role === 'admin', 'GM session did not authenticate as admin.');
  await ensureNoExistingCombat(gm);

  const character = await createPlayerCharacter(player);
  const expected = await prepareShortRestHp(gm, character);
  const story = await createScenarioScene(gm);
  const runtime = await createRuntimeMap(gm, story.scene.id, character.id);
  const rest = await exerciseShortRest({ gm, player, character, expected });
  const scenarioId = await closeAndArchive(gm, runtime.mapInstanceId);

  console.log(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    startedAt,
    endedAt: new Date().toISOString(),
    gmRole: me.user.role,
    character: { id: character.id, name: character.name, status: character.status },
    scenario: { id: scenarioId, sceneId: story.scene.id },
    world: {
      locationId: runtime.location.id,
      mapTemplateId: runtime.mapTemplate.id,
      mapInstanceId: runtime.mapInstanceId
    },
    rest,
    exercised: {
      playerShortRest: rest.progressRounds === 2
        && rest.completedRound === rest.startRound + 1
        && rest.recoveryApplied === expected.recoveryExpected,
      hpRecoveredOnce: rest.hpAfter === expected.after,
      mpUntouched: rest.mpAfter === rest.mpBefore,
      runtimeClosed: true,
      scenarioArchived: true
    },
    note: 'The Rest runner intentionally leaves clearly named alpha-rest-* audit/test definitions in D1; Runtime is closed and Scenario archived instead of hard-deleting Canonical data.'
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
    note: 'A failed live Rest run may leave alpha-rest-* audit/test data in D1. Do not delete unrelated production data while cleaning up.'
  }, null, 2));
  process.exitCode = 1;
});
