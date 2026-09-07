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

const RUN_ID = `alpha-transition-${stamp()}`.slice(0, 36);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_A_NAME = `${RUN_ID}-scene-a`.slice(0, 120);
const SCENE_B_NAME = `${RUN_ID}-scene-b`.slice(0, 120);
const LOCATION_A_NAME = `${RUN_ID}-location-a`.slice(0, 120);
const LOCATION_B_NAME = `${RUN_ID}-location-b`.slice(0, 120);
const MAP_A_NAME = `${RUN_ID}-map-a`.slice(0, 120);
const MAP_B_NAME = `${RUN_ID}-map-b`.slice(0, 120);
const FLAG_KEY = `alpha.transition.${RUN_ID.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}`.slice(0, 80);
const FLAG_EVENT_NAME = `${RUN_ID}-flag`.slice(0, 120);
const START_EVENT_NAME = `${RUN_ID}-start`.slice(0, 120);
const START_NARRATIVE = `Scene transition carried flag before scene_run_start ${RUN_ID}`;
const SPAWN_ID = `spawn_${createHash('sha256').update(RUN_ID).digest('hex').slice(0, 20)}`;

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
    const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
    for (const header of values) {
      const first = String(header).split(';', 1)[0];
      const index = first.indexOf('=');
      if (index <= 0) continue;
      const name = first.slice(0, index).trim();
      const value = first.slice(index + 1).trim();
      if (!value) this.cookies.delete(name); else this.cookies.set(name, value);
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
    if ((response.headers.get('content-type') || '').includes('application/json')) {
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
  async json(path, options) { return (await this.request(path, options)).payload; }
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
  assert(me?.user?.role === 'player', 'Temporary Player registration failed.');
  return me.user;
}

async function createCharacter(player) {
  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  const created = await player.json('/api/player/characters', {
    method: 'POST', body: { name: CHARACTER_NAME, summary: 'Production Scene transition E2E', draftId: roll?.draft?.id }
  });
  const id = created?.character?.id;
  assert(id, 'Character creation failed.');
  const detail = await player.json(`/api/player/characters/${encodeURIComponent(id)}`);
  await player.json(`/api/player/characters/${encodeURIComponent(id)}/creation-skills`, {
    method: 'PATCH',
    body: { allocations: buildAllocations(detail?.character?.skills, Number(detail?.character?.progression?.creationSkillPointsTotal || 200)) }
  });
  await player.json(`/api/player/characters/${encodeURIComponent(id)}/finalize-creation`, { method: 'POST', body: {} });
  const finalDetail = await player.json(`/api/player/characters/${encodeURIComponent(id)}`);
  assert(finalDetail?.character?.status === 'active', 'Temporary Character did not become active.');
  return finalDetail.character;
}

async function createScenario(gm) {
  await gm.json('/api/gm/scenarios', { method: 'POST', body: { name: SCENARIO_NAME, summary: 'Scene transition production E2E' } });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, { method: 'POST', body: { name: SCENE_A_NAME, sortOrder: 10 } });
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, { method: 'POST', body: { name: SCENE_B_NAME, sortOrder: 20 } });
  story = await gm.json('/api/gm/story');
  const refreshed = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  return {
    scenario: refreshed,
    sceneA: findNamed(refreshed.scenes, SCENE_A_NAME, 'Scene A'),
    sceneB: findNamed(refreshed.scenes, SCENE_B_NAME, 'Scene B')
  };
}

async function createMap(gm, { locationName, mapName, sceneId, spawn = false }) {
  await gm.json('/api/gm/world/locations', { method: 'POST', body: { name: locationName, description: RUN_ID, gmNotes: RUN_ID } });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, locationName, 'World Location');
  await gm.json('/api/gm/world/maps', {
    method: 'POST',
    body: { locationId: location.id, name: mapName, width: 1, height: 1, backgroundAssetRef: '', gmNotes: RUN_ID }
  });
  world = await gm.json('/api/gm/world-maps');
  let mapTemplate = findNamed(world?.mapTemplates, mapName, 'Map Template');
  if (spawn) {
    const editor = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/editor`);
    await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/editor`, {
      method: 'PUT',
      body: {
        expectedVersion: editor.mapTemplate.version,
        cells: editor.cells || [],
        edges: editor.edges || [],
        zones: editor.zones || [],
        spawnPoints: [{ id: SPAWN_ID, name: 'Party Entry', x: 0, y: 0, spawnType: 'character', gmNotes: RUN_ID }]
      }
    });
    const refreshedEditor = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/editor`);
    mapTemplate = refreshedEditor.mapTemplate;
  }
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return mapTemplate;
}

async function createStoryEvents(gm, sceneAId, sceneBId) {
  const flagEvent = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneAId)}/story-events`, {
    method: 'POST',
    body: {
      name: FLAG_EVENT_NAME,
      status: 'active', triggerType: 'manual', trigger: {}, conditions: [],
      effects: [{ type: 'set_flag', key: FLAG_KEY, value: true }], oncePerSceneRun: true
    }
  });
  const startEvent = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneBId)}/story-events`, {
    method: 'POST',
    body: {
      name: START_EVENT_NAME,
      status: 'active', triggerType: 'scene_run_start', trigger: {},
      conditions: [{ type: 'flag_equals', key: FLAG_KEY, value: true }],
      effects: [{ type: 'show_narrative', text: START_NARRATIVE }], oncePerSceneRun: true
    }
  });
  assert(flagEvent?.event?.id && startEvent?.event?.id, 'Transition Story Event authoring failed.');
  return { flagEvent: flagEvent.event, startEvent: startEvent.event };
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Scene transition E2E.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'temporary Player + active Character',
        'Scenario with Scene A and Scene B',
        'two 1x1 Map Templates and a stable Character entry Spawn Point in Scene B',
        'Scene A Story flag and Scene B scene_run_start Story condition',
        'Scene A Runtime + Character position',
        'atomic next_scene transition with Character + explicit flag carry',
        'idempotent transition retry and terminal Scenario Run completion',
        'archived Scenario Definition audit entity'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const player = new Session('Player');
  let mapAId = '';
  let mapBId = '';
  let scenarioId = '';
  const startedAt = new Date().toISOString();

  try {
    await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
    const me = await gm.json('/api/admin/auth/me');
    assert(me?.user?.role === 'admin', 'GM session did not authenticate as admin.');
    const combat = await gm.json('/api/gm/combat');
    assert(combat?.combat?.status !== 'active', `Refusing transition E2E while active Combat exists (${combat?.combat?.id || 'unknown'}).`);

    await registerPlayer(player);
    const character = await createCharacter(player);
    const story = await createScenario(gm);
    scenarioId = story.scenario.id;
    await createMap(gm, { locationName: LOCATION_A_NAME, mapName: MAP_A_NAME, sceneId: story.sceneA.id, spawn: false });
    await createMap(gm, { locationName: LOCATION_B_NAME, mapName: MAP_B_NAME, sceneId: story.sceneB.id, spawn: true });
    const events = await createStoryEvents(gm, story.sceneA.id, story.sceneB.id);

    const runtimeA = await gm.json('/api/gm/world/runtime/scene-runs', {
      method: 'POST', body: { sceneId: story.sceneA.id, label: `${RUN_ID} Scenario Run` }
    });
    mapAId = runtimeA?.mapInstance?.id;
    assert(mapAId && runtimeA?.mapInstance?.scenarioRunId, 'Scene A Runtime creation failed.');
    await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/entities/character/${encodeURIComponent(character.id)}/position`, {
      method: 'PUT', body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
    });
    const flagApplied = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/story-events/${encodeURIComponent(events.flagEvent.id)}/activate`, {
      method: 'POST', body: {}
    });
    assert(flagApplied?.ok === true, 'Scene A flag Story Event did not apply.');

    const transitionBody = {
      mode: 'next_scene',
      nextSceneId: story.sceneB.id,
      carryFlagKeys: [FLAG_KEY],
      carryCharacters: true,
      targetSourceSpawnPointId: SPAWN_ID
    };
    const transitioned = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/transition`, {
      method: 'POST', body: transitionBody
    });
    assert(transitioned?.ok === true && transitioned?.transition?.mode === 'next_scene', 'next_scene transition did not commit.');
    mapBId = transitioned?.destinationMap?.id;
    assert(mapBId, 'next_scene transition did not return destination Runtime Map.');
    assert(transitioned.transition.scenarioRunId === runtimeA.mapInstance.scenarioRunId, 'Transition created a new Scenario Run instead of continuing the same one.');
    assert(transitioned.transition.carryFlagKeys?.includes(FLAG_KEY), 'Transition audit did not record carried flag key.');
    assert(transitioned.transition.carriedCharacterIds?.includes(character.id), 'Transition audit did not record carried Character.');
    assert(transitioned.transition.targetSourceSpawnPointId === SPAWN_ID, 'Transition audit did not record target Spawn Point.');
    const startApplied = (transitioned.sceneRunStartStoryEvents || []).find(item => item?.eventId === events.startEvent.id && item?.status === 'applied');
    assert(startApplied, 'Destination scene_run_start did not see the carried Story flag.');

    const sourceAfter = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}`);
    assert(sourceAfter?.mapInstance?.status === 'closed', 'Source Runtime Map remained active after transition.');
    const playerAfter = await player.json(`/api/player/world/characters/${encodeURIComponent(character.id)}`);
    assert(playerAfter?.map?.id === mapBId, 'Carried Character did not resolve to the destination Runtime Map.');
    assert(playerAfter?.position?.x === 0 && playerAfter?.position?.y === 0, 'Carried Character did not land on destination Spawn Point.');
    const destinationDetail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapBId)}`);
    assert((destinationDetail?.storyNarratives || []).some(item => item?.storyEventId === events.startEvent.id && item?.text === START_NARRATIVE), 'Destination scene_run_start Narrative did not persist.');

    const retried = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/transition`, {
      method: 'POST', body: transitionBody
    });
    assert(retried?.idempotent === true, 'Committed transition retry was not idempotent.');
    assert(retried?.transition?.toMapInstanceId === mapBId, 'Idempotent retry returned a different destination Runtime Map.');

    const terminal = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapBId)}/transition`, {
      method: 'POST', body: { mode: 'complete_scenario', carryFlagKeys: [] }
    });
    assert(terminal?.transition?.mode === 'complete_scenario', 'Terminal Scenario Run completion did not commit.');
    assert(terminal?.transition?.toMapInstanceId === null, 'Terminal completion unexpectedly created a destination Runtime Map.');

    const overview = await gm.json('/api/gm/world/runtime');
    const run = (overview?.scenarioRuns || []).find(item => item.id === runtimeA.mapInstance.scenarioRunId);
    assert(run?.status === 'completed' && Number(run?.activeSceneCount || 0) === 0, 'Scenario Run did not finish terminally with zero active Scene Runs.');

    const currentStory = await gm.json('/api/gm/story');
    const scenario = findNamed(currentStory?.scenarios, SCENARIO_NAME, 'Scenario');
    await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
      method: 'PATCH',
      body: { name: scenario.name, status: 'archived', summary: scenario.summary || '', gmNotes: `${scenario.gmNotes || ''}\nScene transition E2E passed: ${RUN_ID}`.trim() }
    });

    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      scenarioId,
      scenarioRunId: runtimeA.mapInstance.scenarioRunId,
      sourceMapInstanceId: mapAId,
      destinationMapInstanceId: mapBId,
      characterId: character.id,
      carriedFlagKey: FLAG_KEY,
      targetSourceSpawnPointId: SPAWN_ID,
      transitionId: transitioned.transition.id,
      terminalTransitionId: terminal.transition.id
    }, null, 2));
  } catch (error) {
    if (mapBId) {
      await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapBId)}/close`, { method: 'POST', body: { completeScenarioRun: true }, allow: [404, 409] }).catch(() => null);
    } else if (mapAId) {
      await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/close`, { method: 'POST', body: { completeScenarioRun: true }, allow: [404, 409] }).catch(() => null);
    }
    console.error(JSON.stringify({
      ok: false,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      scenarioId,
      sourceMapInstanceId: mapAId,
      destinationMapInstanceId: mapBId,
      status: error?.status || null,
      code: error?.code || null,
      error: error?.message || String(error)
    }, null, 2));
    throw error;
  }
}

main().catch(() => { process.exitCode = 1; });
