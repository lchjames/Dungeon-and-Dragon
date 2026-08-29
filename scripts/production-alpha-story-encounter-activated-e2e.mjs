const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = `alpha-activated-${stamp()}`.slice(0, 42);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const ENCOUNTER_A_NAME = `${RUN_ID}-A`.slice(0, 120);
const ENCOUNTER_B_NAME = `${RUN_ID}-B`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const START_EVENT_NAME = `${RUN_ID}-start-A`.slice(0, 120);
const A_EVENT_NAME = `${RUN_ID}-A-activated`.slice(0, 120);
const B_EVENT_NAME = `${RUN_ID}-B-activated`.slice(0, 120);
const RETRY_EVENT_NAME = `${RUN_ID}-retry-A`.slice(0, 120);
const A_FLAG = `alpha.${RUN_ID.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.a`.slice(0, 80);
const B_FLAG = `alpha.${RUN_ID.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.b`.slice(0, 80);
const A_NARRATIVE = `${RUN_ID}: Encounter A activated.`;
const B_NARRATIVE = `${RUN_ID}: Encounter B activated.`;

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

function findEncounter(story, name) {
  for (const scenario of story?.scenarios || []) {
    for (const scene of scenario.scenes || []) {
      const encounter = (scene.encounters || []).find(item => item.name === name);
      if (encounter) return { scenario, scene, encounter };
    }
  }
  throw new Error(`Unable to find Encounter: ${name}`);
}

async function createStory(gm) {
  await gm.json('/api/gm/scenarios', { method: 'POST', body: { name: SCENARIO_NAME, summary: 'encounter_activated Story production E2E' } });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, { method: 'POST', body: { name: SCENE_NAME } });
  story = await gm.json('/api/gm/story');
  const refreshedScenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  const scene = findNamed(refreshedScenario?.scenes, SCENE_NAME, 'Scene');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(scene.id)}/encounters`, { method: 'POST', body: { name: ENCOUNTER_A_NAME, status: 'planned' } });
  await gm.json(`/api/gm/scenes/${encodeURIComponent(scene.id)}/encounters`, { method: 'POST', body: { name: ENCOUNTER_B_NAME, status: 'planned' } });
  story = await gm.json('/api/gm/story');
  return {
    scenario: findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario'),
    scene,
    encounterA: findEncounter(story, ENCOUNTER_A_NAME).encounter,
    encounterB: findEncounter(story, ENCOUNTER_B_NAME).encounter
  };
}

async function createMap(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'encounter_activated E2E Location', gmNotes: RUN_ID }
  });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'World Location');
  await gm.json('/api/gm/world/maps', {
    method: 'POST', body: { locationId: location.id, name: MAP_NAME, width: 1, height: 1, backgroundAssetRef: '', gmNotes: RUN_ID }
  });
  world = await gm.json('/api/gm/world-maps');
  const mapTemplate = findNamed(world?.mapTemplates, MAP_NAME, 'Map Template');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return mapTemplate;
}

async function createEvents(gm, sceneId, encounterAId, encounterBId) {
  const a = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: A_EVENT_NAME,
      status: 'active',
      triggerType: 'encounter_activated',
      trigger: { encounterId: encounterAId, ignored: true },
      conditions: [{ type: 'encounter_status', encounterId: encounterAId, status: 'active' }],
      effects: [
        { type: 'show_narrative', text: A_NARRATIVE },
        { type: 'set_flag', key: A_FLAG, value: true },
        { type: 'activate_encounter', encounterId: encounterBId }
      ],
      oncePerSceneRun: false
    }
  });
  const b = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: B_EVENT_NAME,
      status: 'active',
      triggerType: 'encounter_activated',
      trigger: { encounterId: encounterBId },
      conditions: [{ type: 'encounter_status', encounterId: encounterBId, status: 'active' }],
      effects: [
        { type: 'show_narrative', text: B_NARRATIVE },
        { type: 'set_flag', key: B_FLAG, value: true }
      ],
      oncePerSceneRun: false
    }
  });
  const start = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: START_EVENT_NAME,
      status: 'active',
      triggerType: 'scene_run_start',
      trigger: {},
      conditions: [{ type: 'event_not_fired' }],
      effects: [{ type: 'activate_encounter', encounterId: encounterAId }],
      oncePerSceneRun: true
    }
  });
  const retry = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: RETRY_EVENT_NAME,
      status: 'active',
      triggerType: 'manual',
      trigger: {},
      conditions: [],
      effects: [{ type: 'activate_encounter', encounterId: encounterAId }],
      oncePerSceneRun: false
    }
  });
  assert(a?.event?.id && b?.event?.id && start?.event?.id && retry?.event?.id, 'Lifecycle Story Events were not created.');
  assert(JSON.stringify(a.event.trigger) === JSON.stringify({ encounterId: encounterAId }), 'encounter_activated trigger was not canonicalized to encounterId only.');
  return { a: a.event, b: b.event, start: start.event, retry: retry.event };
}

function runtimeEncounter(detail, id) {
  return (detail?.runtimeEncounters || []).find(item => item.encounterId === id) || null;
}

async function exercise(gm, story, events) {
  const created = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId: story.scene.id, label: `${RUN_ID} Runtime` }
  });
  const mapId = created?.mapInstance?.id;
  assert(mapId, 'Runtime Map was not created.');
  const startResult = (created.sceneRunStartStoryEvents || []).find(item => item.eventId === events.start.id);
  assert(startResult?.status === 'applied', 'scene_run_start did not activate Encounter A.');

  const lifecycle = created.encounterActivatedStoryEvents || [];
  const aResult = lifecycle.find(item => item.eventId === events.a.id);
  const bResult = lifecycle.find(item => item.eventId === events.b.id);
  assert(aResult?.status === 'applied' && aResult.encounterId === story.encounterA.id, 'encounter_activated(A) did not apply.');
  assert(bResult?.status === 'applied' && bResult.encounterId === story.encounterB.id, 'Cascade encounter_activated(B) did not apply.');
  assert(!created.encounterActivatedStoryWarning, `Unexpected lifecycle warning: ${created.encounterActivatedStoryWarning?.code}.`);

  let detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  assert(runtimeEncounter(detail, story.encounterA.id)?.status === 'active', 'Runtime Encounter A is not active.');
  assert(runtimeEncounter(detail, story.encounterB.id)?.status === 'active', 'Runtime Encounter B was not activated by the cascade.');
  assert((detail.storyFlags || []).find(item => item.key === A_FLAG)?.value === true, 'Encounter A lifecycle flag did not persist.');
  assert((detail.storyFlags || []).find(item => item.key === B_FLAG)?.value === true, 'Encounter B lifecycle flag did not persist.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.a.id && item.text === A_NARRATIVE).length === 1, 'Encounter A lifecycle narrative count is not exactly one.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.b.id && item.text === B_NARRATIVE).length === 1, 'Encounter B lifecycle narrative count is not exactly one.');

  const retry = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/story-events/${encodeURIComponent(events.retry.id)}/activate`, {
    method: 'POST', body: {}
  });
  const retryActivation = (retry.effectsApplied || []).find(item => item.type === 'activate_encounter');
  assert(retryActivation?.unchanged === true, 'Retry activation of already-active Encounter A was not idempotent.');
  assert((retry.encounterActivatedStoryEvents || []).length === 0, 'Already-active Encounter A created duplicate lifecycle dispatches.');

  detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.a.id && item.text === A_NARRATIVE).length === 1, 'Encounter A lifecycle narrative duplicated after retry drain.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.b.id && item.text === B_NARRATIVE).length === 1, 'Encounter B lifecycle narrative duplicated after retry drain.');

  const definitionStory = await gm.json('/api/gm/story');
  const defA = findEncounter(definitionStory, ENCOUNTER_A_NAME).encounter;
  const defB = findEncounter(definitionStory, ENCOUNTER_B_NAME).encounter;
  assert(defA.status === 'planned' && defB.status === 'planned', 'Runtime lifecycle activation polluted Encounter Definition status.');
  assert(defA.combat === null && defB.combat === null, 'Runtime lifecycle activation polluted Definition Combat links.');

  return { mapId, lifecycleCount: lifecycle.length };
}

async function archiveScenario(gm) {
  const story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: scenario.name,
      status: 'archived',
      summary: scenario.summary || '',
      gmNotes: `${scenario.gmNotes || ''}\nencounter_activated E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function bestEffortCleanup(gm, mapId = '') {
  if (mapId) {
    await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/close`, {
      method: 'POST', body: { completeScenarioRun: true }, allow: [404, 409]
    }).catch(() => null);
  }
  await archiveScenario(gm).catch(() => null);
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing encounter_activated Story E2E.',
      writes: [
        'Scenario / Scene / two planned Encounter Definitions',
        'World Location / 1x1 Map Template / Scene binding',
        'scene_run_start Event that activates Encounter A',
        'encounter_activated(A) Event that writes narrative/flag and activates Encounter B',
        'encounter_activated(B) Event that writes narrative/flag',
        'manual retry Event that attempts to activate already-active Encounter A',
        'Scene Run / Runtime Map creation and lifecycle cascade verification',
        'verification that retry creates zero duplicate lifecycle dispatches/narratives',
        'verification that Definition Encounter statuses/combat remain unchanged',
        'closed Runtime / archived Scenario'
      ]
    }, null, 2));
    return;
  }
  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  let mapId = '';
  const startedAt = new Date().toISOString();
  try {
    await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
    const gmMe = await gm.json('/api/admin/auth/me');
    assert(gmMe?.user?.role === 'admin', 'GM session did not authenticate as admin.');
    const story = await createStory(gm);
    const mapTemplate = await createMap(gm, story.scene.id);
    const events = await createEvents(gm, story.scene.id, story.encounterA.id, story.encounterB.id);
    const result = await exercise(gm, story, events);
    mapId = result.mapId;
    const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/close`, {
      method: 'POST', body: { completeScenarioRun: true }
    });
    assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after encounter_activated E2E.');
    const scenarioId = await archiveScenario(gm);
    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      scenarioId,
      sceneId: story.scene.id,
      encounterAId: story.encounterA.id,
      encounterBId: story.encounterB.id,
      mapTemplateId: mapTemplate.id,
      mapInstanceId: mapId,
      lifecycleDispatchCount: result.lifecycleCount,
      exercised: {
        canonicalEncounterTarget: true,
        durableActivationOccurrence: true,
        sceneStartToEncounterActivated: true,
        cascadeActivation: true,
        cascadeDispatch: true,
        retryNoDuplicateDispatch: true,
        retryNoDuplicateNarrative: true,
        definitionStatusIsolation: true,
        definitionCombatIsolation: true,
        runtimeClosed: true,
        scenarioArchived: true
      }
    }, null, 2));
  } catch (error) {
    await bestEffortCleanup(gm, mapId);
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
    code: error.code || null
  }, null, 2));
  process.exitCode = 1;
});
