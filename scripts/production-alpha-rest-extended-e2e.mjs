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

const RUN_ID = `alpha-restx-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const PRIMARY_NAME = `${RUN_ID}-primary`.slice(0, 120);
const BLOCKER_NAME = `${RUN_ID}-blocker`.slice(0, 120);
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
    throw new Error(`Refusing extended Rest E2E write: an active Combat already exists (${state.combat.id}).`);
  }
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
}

async function createCharacter(player, name) {
  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(roll?.draft?.id, `Character creation roll did not return a Draft ID for ${name}.`);
  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name, summary: 'Production Alpha extended Rest E2E Character', draftId: roll.draft.id }
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
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Production Alpha Long Rest + interruption live E2E' }
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

async function createRuntimeMap(gm, sceneId, primaryId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST',
    body: { name: LOCATION_NAME, description: 'Production Alpha extended Rest E2E Location', gmNotes: RUN_ID }
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
    method: 'POST', body: { sceneId, label: `${RUN_ID} Extended Rest Runtime` }
  });
  const mapInstanceId = runtime?.mapInstance?.id;
  assert(mapInstanceId, 'Scene Runtime did not return a Runtime Map ID.');

  const placed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(primaryId)}/position`, {
    method: 'PUT',
    body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  assert(placed?.position?.x === 0 && placed?.position?.y === 0, 'Primary Character was not placed on Runtime Map cell (0,0).');
  return { location, mapTemplate, mapInstanceId };
}

async function placeBlocker(gm, mapInstanceId, blockerId) {
  const placed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(blockerId)}/position`, {
    method: 'PUT',
    body: { x: 1, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  assert(placed?.position?.x === 1 && placed?.position?.y === 0, 'Blocker Character was not placed on Runtime Map cell (1,0).');
}

async function prepareLongRestMp(gm, character) {
  const mp = findResource(character, 'MP');
  const hp = findResource(character, 'HP');
  const max = Number(mp.max);
  assert(Number.isInteger(max) && max > 0, 'Disposable Character needs Max MP > 0 for Long Rest validation.');
  const corrected = await gm.json(`/api/gm/characters/${encodeURIComponent(character.id)}/resources/MP`, {
    method: 'PATCH', body: { current: 0 }
  });
  assert(Number(corrected?.resource?.max) === max, 'GM MP correction changed Max MP unexpectedly.');
  assert(Number(corrected?.resource?.current) === 0, 'GM MP correction did not establish Long Rest precondition.');
  return { current: 0, max, recoveryExpected: max, hpBefore: Number(hp.current) };
}

async function exerciseLongRest({ player, character, expected }) {
  const initial = await player.json(`/api/player/world/characters/${encodeURIComponent(character.id)}`);
  assert(initial?.turn?.mode === 'exploration', 'Long Rest precondition must be Exploration mode.');
  assert(initial?.turn?.actionAvailable === true && initial?.turn?.moveAvailable === true, 'Long Rest must begin before Action or Move is spent.');
  const startRound = Number(initial?.turn?.roundNumber || 0);
  assert(startRound >= 1, 'Long Rest Exploration Round was not initialized.');

  const started = await player.json(`/api/player/world/characters/${encodeURIComponent(character.id)}/rest/start`, {
    method: 'POST', body: { restType: 'long', resource: 'MP' }
  });
  assert(started?.restStarted === true, 'Long Rest start response did not confirm Rest start.');
  assert(started?.rest?.restType === 'long', 'Rest type is not long.');
  assert(started?.rest?.resource === 'MP', 'Long Rest recovered the wrong resource.');
  assert(started?.rest?.status === 'completed', `Single-participant Long Rest should complete through canonical rounds; got ${started?.rest?.status}.`);
  assert(Number(started?.rest?.requiredRounds) === 5, 'Long Rest required-round value is not 5.');
  assert(Number(started?.rest?.progressRounds) === 5, 'Long Rest did not complete at 5 Rounds.');
  assert(Number(started?.rest?.completedRound) === startRound + 4, 'Long Rest completion Round is incorrect.');
  assert(Number(started?.rest?.recoveryApplied) === expected.recoveryExpected, 'Long Rest did not fully restore MP from zero.');

  const characterAfter = (await player.json(`/api/player/characters/${encodeURIComponent(character.id)}`))?.character;
  const mpAfter = findResource(characterAfter, 'MP');
  const hpAfter = findResource(characterAfter, 'HP');
  assert(Number(mpAfter.current) === expected.max, 'Long Rest did not restore MP to Max.');
  assert(Number(mpAfter.max) === expected.max, 'Long Rest changed Max MP unexpectedly.');
  assert(Number(hpAfter.current) === expected.hpBefore, 'MP Long Rest must not alter HP.');

  const worldAfter = await player.json(`/api/player/world/characters/${encodeURIComponent(character.id)}`);
  assert(worldAfter?.rest?.status === 'completed', 'Completed Long Rest state did not persist in Player context.');
  assert(worldAfter?.turn?.mode === 'exploration', 'Player did not return to Exploration after Long Rest completion.');
  assert(worldAfter?.turn?.actionAvailable === true && worldAfter?.turn?.moveAvailable === true, 'Long Rest completion did not expose a fresh Exploration turn.');

  return {
    startRound,
    completedRound: Number(started.rest.completedRound),
    progressRounds: Number(started.rest.progressRounds),
    mpBefore: expected.current,
    mpMax: expected.max,
    recoveryApplied: Number(started.rest.recoveryApplied),
    mpAfter: Number(mpAfter.current),
    hpBefore: expected.hpBefore,
    hpAfter: Number(hpAfter.current),
    finalExplorationRound: Number(worldAfter?.turn?.roundNumber || 0)
  };
}

async function prepareInterruptedRestMp(gm, characterId, mpMax) {
  const current = Math.max(0, Number(mpMax) - 1);
  const corrected = await gm.json(`/api/gm/characters/${encodeURIComponent(characterId)}/resources/MP`, {
    method: 'PATCH', body: { current }
  });
  assert(Number(corrected?.resource?.max) === Number(mpMax), 'Interruption precondition changed Max MP unexpectedly.');
  assert(Number(corrected?.resource?.current) === current, 'Interruption precondition did not lower MP as requested.');
  return current;
}

async function exerciseCombatInterruption({ gm, player, primary, blocker, mapInstanceId, mpMax }) {
  await placeBlocker(gm, mapInstanceId, blocker.id);
  const mpBefore = await prepareInterruptedRestMp(gm, primary.id, mpMax);
  const characterBefore = (await player.json(`/api/player/characters/${encodeURIComponent(primary.id)}`))?.character;
  const hpBefore = Number(findResource(characterBefore, 'HP').current);

  const initial = await player.json(`/api/player/world/characters/${encodeURIComponent(primary.id)}`);
  assert(initial?.turn?.mode === 'exploration', 'Interruption precondition must be Exploration mode.');
  assert(initial?.turn?.actionAvailable === true && initial?.turn?.moveAvailable === true, 'Interrupted Rest must begin before Action or Move is spent.');
  const startRound = Number(initial?.turn?.roundNumber || 0);

  const started = await player.json(`/api/player/world/characters/${encodeURIComponent(primary.id)}/rest/start`, {
    method: 'POST', body: { restType: 'short', resource: 'MP' }
  });
  assert(started?.restStarted === true, 'Interrupted Rest did not start.');
  assert(started?.rest?.status === 'active', `Blocker Character should keep Rest active; got ${started?.rest?.status}.`);
  assert(started?.rest?.active === true, 'Interrupted Rest active flag is false before Combat.');
  assert(Number(started?.rest?.progressRounds) === 1, 'Interrupted Rest should have exactly 1 progress Round before Combat.');
  assert(Number(started?.rest?.requiredRounds) === 2, 'Interrupted Short Rest required-round value is not 2.');
  assert(Number(started?.rest?.recoveryApplied) === 0, 'Interrupted Rest applied recovery before completion.');
  assert(Number(started?.turn?.roundNumber || 0) === startRound, 'Exploration Round advanced even though Blocker Character had not completed its turn.');

  const combatStarted = await gm.json('/api/gm/combat/start', {
    method: 'POST', body: { characterIds: [primary.id, blocker.id] }
  });
  const combatId = combatStarted?.combat?.id;
  assert(combatId, 'GM Combat start did not return a Combat ID for interruption test.');

  const interrupted = await player.json(`/api/player/world/characters/${encodeURIComponent(primary.id)}`);
  assert(interrupted?.turn?.mode === 'combat', 'Player context did not enter Combat mode after GM start.');
  assert(interrupted?.rest?.status === 'combat_interrupted', `Rest was not marked combat_interrupted; got ${interrupted?.rest?.status}.`);
  assert(interrupted?.rest?.active === false, 'Interrupted Rest remained active after Combat start.');
  assert(Number(interrupted?.rest?.recoveryApplied) === 0, 'Combat-interrupted Rest must apply zero recovery.');
  assert(interrupted?.rest?.interruptedReason === 'combat_started', 'Interrupted Rest reason is not combat_started.');
  assert(interrupted?.rest?.completedRound === null, 'Combat-interrupted Rest must not have a completed Round.');

  const characterAfter = (await player.json(`/api/player/characters/${encodeURIComponent(primary.id)}`))?.character;
  const mpAfter = Number(findResource(characterAfter, 'MP').current);
  const hpAfter = Number(findResource(characterAfter, 'HP').current);
  assert(mpAfter === mpBefore, `Combat-interrupted Rest changed MP: before ${mpBefore}, after ${mpAfter}.`);
  assert(hpAfter === hpBefore, `Combat-interrupted Rest changed HP: before ${hpBefore}, after ${hpAfter}.`);

  return {
    combatId,
    startRound,
    progressRounds: Number(interrupted.rest.progressRounds),
    status: interrupted.rest.status,
    interruptedReason: interrupted.rest.interruptedReason,
    recoveryApplied: Number(interrupted.rest.recoveryApplied),
    mpBefore,
    mpAfter,
    hpBefore,
    hpAfter
  };
}

async function endOwnedCombat(gm, combatId) {
  if (!combatId) return;
  const state = await gm.json('/api/gm/combat');
  if (state?.combat?.id === combatId && state?.combat?.status === 'active') {
    await gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, { method: 'POST', body: {} });
  }
}

async function closeAndArchive(gm, mapInstanceId) {
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after extended Rest E2E.');

  const story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: scenario.name,
      status: 'archived',
      summary: scenario.summary || '',
      gmNotes: `${scenario.gmNotes || ''}\nProduction Long Rest + interruption E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Long Rest + Combat interruption E2E session.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'test Player with two active Characters',
        'temporary GM MP corrections',
        'Scenario / Scene',
        'World Location / 2x1 Map Template / Scene binding',
        'Runtime Map / two Character positions',
        'Long Rest state and audit data',
        'temporary two-Character Combat used only to interrupt Rest',
        'closed Runtime and archived Scenario audit entities'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const player = new Session('Player');
  const startedAt = new Date().toISOString();
  let ownedCombatId = '';

  await gm.json('/api/admin/auth/login', {
    method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD }
  });
  const me = await gm.json('/api/admin/auth/me');
  assert(me?.user?.role === 'admin', 'GM session did not authenticate as admin.');
  await ensureNoExistingCombat(gm);

  try {
    await registerPlayer(player);
    const primary = await createCharacter(player, PRIMARY_NAME);
    const blocker = await createCharacter(player, BLOCKER_NAME);
    const expectedLong = await prepareLongRestMp(gm, primary);
    const story = await createScenarioScene(gm);
    const runtime = await createRuntimeMap(gm, story.scene.id, primary.id);

    const longRest = await exerciseLongRest({ player, character: primary, expected: expectedLong });
    const interruption = await exerciseCombatInterruption({
      gm,
      player,
      primary,
      blocker,
      mapInstanceId: runtime.mapInstanceId,
      mpMax: expectedLong.max
    });
    ownedCombatId = interruption.combatId;
    await endOwnedCombat(gm, ownedCombatId);
    ownedCombatId = '';

    const scenarioId = await closeAndArchive(gm, runtime.mapInstanceId);
    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      gmRole: me.user.role,
      characters: {
        primary: { id: primary.id, name: primary.name, status: primary.status },
        blocker: { id: blocker.id, name: blocker.name, status: blocker.status }
      },
      scenario: { id: scenarioId, sceneId: story.scene.id },
      world: {
        locationId: runtime.location.id,
        mapTemplateId: runtime.mapTemplate.id,
        mapInstanceId: runtime.mapInstanceId
      },
      longRest,
      interruption,
      exercised: {
        longRestFiveRounds: longRest.progressRounds === 5 && longRest.completedRound === longRest.startRound + 4,
        longRestMpFullRestore: longRest.mpBefore === 0 && longRest.mpAfter === longRest.mpMax && longRest.recoveryApplied === longRest.mpMax,
        longRestHpUntouched: longRest.hpAfter === longRest.hpBefore,
        combatInterruptedRest: interruption.status === 'combat_interrupted' && interruption.interruptedReason === 'combat_started',
        interruptedRestZeroRecovery: interruption.recoveryApplied === 0 && interruption.mpAfter === interruption.mpBefore && interruption.hpAfter === interruption.hpBefore,
        ownedCombatEnded: true,
        runtimeClosed: true,
        scenarioArchived: true
      },
      note: 'The extended Rest runner leaves clearly named alpha-restx-* audit/test definitions in D1; its temporary Combat is ended and Runtime/Scenario are closed or archived instead of hard-deleting Canonical data.'
    }, null, 2));
  } catch (error) {
    if (ownedCombatId) {
      try { await endOwnedCombat(gm, ownedCombatId); } catch (cleanupError) {
        console.error(`Best-effort Combat cleanup failed: ${cleanupError?.message || cleanupError}`);
      }
    } else {
      try {
        const state = await gm.json('/api/gm/combat');
        const activeId = state?.combat?.id || '';
        const names = state?.combat?.combatants?.map(item => item.displayName) || [];
        if (activeId && names.includes(PRIMARY_NAME) && names.includes(BLOCKER_NAME)) {
          await endOwnedCombat(gm, activeId);
        }
      } catch (cleanupError) {
        console.error(`Best-effort detected Combat cleanup failed: ${cleanupError?.message || cleanupError}`);
      }
    }
    throw error;
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    error: error.message,
    status: error.status || null,
    code: error.code || null,
    note: 'A failed extended Rest live run may leave alpha-restx-* audit/test data in D1. It only auto-ends a Combat when both uniquely named test Characters prove ownership.'
  }, null, 2));
  process.exitCode = 1;
});
