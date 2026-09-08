const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = `alpha-route-${stamp()}`.slice(0, 34);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_A_NAME = `${RUN_ID}-A`.slice(0, 120);
const SCENE_B_NAME = `${RUN_ID}-B`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_A_NAME = `${RUN_ID}-map-A`.slice(0, 120);
const MAP_B_NAME = `${RUN_ID}-map-B`.slice(0, 120);
const ROUTE_NAME = `${RUN_ID}-A-to-B`.slice(0, 120);
const TERMINAL_ROUTE_NAME = `${RUN_ID}-finish`.slice(0, 120);
const SET_FLAG_EVENT_NAME = `${RUN_ID}-unlock-route`.slice(0, 120);
const START_EVENT_NAME = `${RUN_ID}-B-start`.slice(0, 120);
const FLAG_KEY = `alpha.route.${RUN_ID.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}`.slice(0, 80);
const NARRATIVE = `Authored transition destination narrative ${RUN_ID}`;

class HttpError extends Error {
  constructor(message, status, code, payload) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

class Session {
  constructor() { this.cookies = new Map(); }
  capture(headers) {
    const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
    for (const header of values) {
      const first = String(header).split(';', 1)[0];
      const i = first.indexOf('=');
      if (i <= 0) continue;
      const key = first.slice(0, i).trim();
      const value = first.slice(i + 1).trim();
      if (value) this.cookies.set(key, value); else this.cookies.delete(key);
    }
  }
  async request(path, { method = 'GET', body, allow = [] } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual'
    });
    this.capture(response.headers);
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok && !allow.includes(response.status)) {
      throw new HttpError(payload?.error?.message || `${method} ${path} failed`, response.status, payload?.error?.code, payload);
    }
    return { response, payload };
  }
  async json(path, options) { return (await this.request(path, options)).payload; }
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function findNamed(items, name, label) {
  const found = (items || []).find(item => item?.name === name);
  if (!found) throw new Error(`Unable to find ${label}: ${name}`);
  return found;
}

async function createScenario(gm) {
  await gm.json('/api/gm/scenarios', { method: 'POST', body: { name: SCENARIO_NAME, summary: RUN_ID } });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, { method: 'POST', body: { name: SCENE_A_NAME } });
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, { method: 'POST', body: { name: SCENE_B_NAME } });
  story = await gm.json('/api/gm/story');
  const refreshed = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  return {
    scenario: refreshed,
    sceneA: findNamed(refreshed.scenes, SCENE_A_NAME, 'Scene A'),
    sceneB: findNamed(refreshed.scenes, SCENE_B_NAME, 'Scene B')
  };
}

async function createMaps(gm, sceneA, sceneB) {
  await gm.json('/api/gm/world/locations', { method: 'POST', body: { name: LOCATION_NAME, description: RUN_ID, gmNotes: RUN_ID } });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'Location');
  for (const name of [MAP_A_NAME, MAP_B_NAME]) {
    await gm.json('/api/gm/world/maps', {
      method: 'POST',
      body: { locationId: location.id, name, width: 1, height: 1, backgroundAssetRef: '', gmNotes: RUN_ID }
    });
  }
  world = await gm.json('/api/gm/world-maps');
  const mapA = findNamed(world?.mapTemplates, MAP_A_NAME, 'Map A');
  const mapB = findNamed(world?.mapTemplates, MAP_B_NAME, 'Map B');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneA.id)}/map-binding`, { method: 'PUT', body: { mapTemplateId: mapA.id, configuration: {} } });
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneB.id)}/map-binding`, { method: 'PUT', body: { mapTemplateId: mapB.id, configuration: {} } });
  return { mapA, mapB };
}

async function createStoryEvents(gm, sceneA, sceneB) {
  const setFlag = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneA.id)}/story-events`, {
    method: 'POST',
    body: {
      name: SET_FLAG_EVENT_NAME,
      status: 'active',
      triggerType: 'manual',
      trigger: {},
      conditions: [],
      effects: [{ type: 'set_flag', key: FLAG_KEY, value: true }],
      oncePerSceneRun: true
    }
  });
  const start = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneB.id)}/story-events`, {
    method: 'POST',
    body: {
      name: START_EVENT_NAME,
      status: 'active',
      triggerType: 'scene_run_start',
      trigger: {},
      conditions: [{ type: 'flag_equals', key: FLAG_KEY, value: true }],
      effects: [{ type: 'show_narrative', text: NARRATIVE }],
      oncePerSceneRun: true
    }
  });
  return { setFlag: setFlag.event, start: start.event };
}

async function createDefinitions(gm, sceneA, sceneB) {
  const route = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneA.id)}/transitions`, {
    method: 'POST',
    body: {
      name: ROUTE_NAME,
      status: 'active',
      mode: 'next_scene',
      toSceneId: sceneB.id,
      conditions: [{ type: 'flag_equals', key: FLAG_KEY, value: true }],
      carryFlagKeys: [FLAG_KEY],
      carryCharacters: false,
      sortOrder: 10,
      gmNotes: RUN_ID
    }
  });
  const terminal = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneB.id)}/transitions`, {
    method: 'POST',
    body: {
      name: TERMINAL_ROUTE_NAME,
      status: 'active',
      mode: 'complete_scenario',
      conditions: [],
      carryFlagKeys: [],
      carryCharacters: false,
      sortOrder: 99,
      gmNotes: RUN_ID
    }
  });
  assert(route?.definition?.id && terminal?.definition?.id, 'Transition Definition creation failed.');
  return { route: route.definition, terminal: terminal.definition };
}

async function exercise(gm, sceneA, events, definitions) {
  const runtimeA = await gm.json('/api/gm/world/runtime/scene-runs', { method: 'POST', body: { sceneId: sceneA.id, label: RUN_ID } });
  const mapAId = runtimeA?.mapInstance?.id;
  assert(mapAId, 'Scene A Runtime missing.');

  const before = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/transition-options`);
  const beforeRoute = (before?.options || []).find(option => option?.definition?.id === definitions.route.id);
  assert(beforeRoute && beforeRoute.eligible === false, 'Flag-gated authored route should be ineligible before flag set.');
  assert((beforeRoute.conditionFailures || []).some(item => item.reason === 'flag_mismatch'), 'Expected flag_mismatch before route unlock.');

  await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/story-events/${encodeURIComponent(events.setFlag.id)}/activate`, { method: 'POST', body: {} });
  const after = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/transition-options`);
  const afterRoute = (after?.options || []).find(option => option?.definition?.id === definitions.route.id);
  assert(afterRoute?.eligible === true, 'Authored route did not become eligible after flag set.');

  const transitioned = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/transition`, {
    method: 'POST', body: { transitionDefinitionId: definitions.route.id }
  });
  assert(transitioned?.transitionDefinition?.id === definitions.route.id, 'Transition response lost selected Definition identity.');
  assert(transitioned?.transitionDefinitionLink?.definitionVersion === definitions.route.version, 'Definition provenance link/version missing.');
  const mapBId = transitioned?.destinationMap?.id;
  assert(mapBId, 'Authored next_scene transition did not create destination Runtime Map.');
  assert((transitioned?.sceneRunStartStoryEvents || []).some(item => item?.eventId === events.start.id && item?.status === 'applied'), 'Destination scene_run_start did not read carried route flag.');

  const retry = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapAId)}/transition`, {
    method: 'POST', body: { transitionDefinitionId: definitions.route.id }
  });
  assert(retry?.idempotent === true, 'Authored transition retry was not idempotent.');
  assert(retry?.transitionDefinitionLink?.definitionId === definitions.route.id, 'Idempotent retry did not preserve Definition provenance.');

  const optionsB = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapBId)}/transition-options`);
  const terminal = (optionsB?.options || []).find(option => option?.definition?.id === definitions.terminal.id);
  assert(terminal?.eligible === true, 'Terminal authored route should be eligible in Scene B.');
  const completed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapBId)}/transition`, {
    method: 'POST', body: { transitionDefinitionId: definitions.terminal.id }
  });
  assert(completed?.transition?.mode === 'complete_scenario', 'Terminal authored route did not complete Scenario Run.');

  return {
    mapAId,
    mapBId,
    routeDefinitionId: definitions.route.id,
    terminalDefinitionId: definitions.terminal.id,
    transitionId: transitioned.transition.id,
    definitionVersion: transitioned.transitionDefinitionLink.definitionVersion
  };
}

async function archive(gm) {
  const story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: { name: scenario.name, status: 'archived', summary: scenario.summary || '', gmNotes: `${scenario.gmNotes || ''}\nScene transition authoring E2E passed: ${RUN_ID}`.trim() }
  });
  return scenario.id;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Scene transition authoring E2E.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'Scenario with Scene A / Scene B and Structured Map bindings',
        'manual flag Story Event and destination scene_run_start Story Event',
        'active flag-gated A → B Transition Definition',
        'active terminal complete_scenario Transition Definition',
        'Runtime eligibility before/after flag mutation',
        'explicit authored-route execution with carried flag and Definition provenance',
        'idempotent authored-route retry and terminal authored completion',
        'archived Scenario Definition audit entity'
      ]
    }, null, 2));
    return;
  }
  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session();
  await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
  const me = await gm.json('/api/admin/auth/me');
  assert(me?.user?.role === 'admin', 'GM session did not authenticate as admin.');
  const story = await createScenario(gm);
  await createMaps(gm, story.sceneA, story.sceneB);
  const events = await createStoryEvents(gm, story.sceneA, story.sceneB);
  const definitions = await createDefinitions(gm, story.sceneA, story.sceneB);
  const result = await exercise(gm, story.sceneA, events, definitions);
  const scenarioId = await archive(gm);
  console.log(JSON.stringify({ ok: true, runId: RUN_ID, baseUrl: BASE_URL, scenarioId, ...result }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, runId: RUN_ID, error: error?.message || String(error), code: error?.code || null, status: error?.status || null }, null, 2));
  process.exitCode = 1;
});
