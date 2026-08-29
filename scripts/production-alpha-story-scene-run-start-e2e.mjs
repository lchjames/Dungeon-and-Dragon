import { randomInt } from 'node:crypto';

const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = `alpha-start-${stamp()}-${randomInt(100, 1000)}`.slice(0, 42);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const ENCOUNTER_NAME = `${RUN_ID}-encounter`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const SUCCESS_EVENT_NAME = `${RUN_ID}-success`.slice(0, 120);
const FAILURE_EVENT_NAME = `${RUN_ID}-failure`.slice(0, 120);
const START_FLAG = `alpha.${RUN_ID.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.started`.slice(0, 80);
const START_NARRATIVE = `${RUN_ID}: Scene Run start Story fired.`;

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
  await gm.json('/api/gm/scenarios', { method: 'POST', body: { name: SCENARIO_NAME, summary: 'scene_run_start Story production E2E' } });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, { method: 'POST', body: { name: SCENE_NAME } });
  story = await gm.json('/api/gm/story');
  const refreshedScenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  const scene = findNamed(refreshedScenario?.scenes, SCENE_NAME, 'Scene');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(scene.id)}/encounters`, { method: 'POST', body: { name: ENCOUNTER_NAME, status: 'planned' } });
  return findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME);
}

async function createMap(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'scene_run_start Story production E2E Location', gmNotes: RUN_ID }
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

async function createSceneRunStartEvents(gm, sceneId, encounterId) {
  const success = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: SUCCESS_EVENT_NAME,
      status: 'active',
      triggerType: 'scene_run_start',
      trigger: { ignoredByCanonicalNormalizer: true },
      conditions: [
        { type: 'event_not_fired' },
        { type: 'scene_run_status', status: 'active' },
        { type: 'encounter_status', encounterId, status: 'planned' }
      ],
      effects: [
        { type: 'show_narrative', text: START_NARRATIVE },
        { type: 'set_flag', key: START_FLAG, value: true },
        { type: 'activate_encounter', encounterId }
      ],
      oncePerSceneRun: true
    }
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  const failure = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: FAILURE_EVENT_NAME,
      status: 'active',
      triggerType: 'scene_run_start',
      trigger: {},
      conditions: [{ type: 'event_not_fired' }],
      effects: [{ type: 'start_combat', encounterId }],
      oncePerSceneRun: true
    }
  });
  assert(success?.event?.id && failure?.event?.id, 'scene_run_start Story Events were not created.');
  assert(Object.keys(success.event.trigger || {}).length === 0, 'scene_run_start trigger payload was not normalized to an empty object.');
  return { success: success.event, failure: failure.event };
}

function runtimeEncounter(detail, encounterId) {
  return (detail?.runtimeEncounters || []).find(item => item.encounterId === encounterId) || null;
}

async function exerciseSceneRunStart(gm, sceneId, encounterId, events) {
  const created = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label: `${RUN_ID} Runtime` }
  });
  const mapId = created?.mapInstance?.id;
  assert(mapId, 'Scene Runtime creation did not return a Runtime Map.');
  assert(created.mapInstance.status === 'active', 'Scene Runtime is not active after creation.');
  const results = created.sceneRunStartStoryEvents || [];
  const successResult = results.find(item => item.eventId === events.success.id);
  const failureResult = results.find(item => item.eventId === events.failure.id);
  assert(successResult?.status === 'applied', `Successful scene_run_start Event was not applied: ${successResult?.status}.`);
  assert((successResult.effectsApplied || []).map(item => item.type).join(',') === 'show_narrative,set_flag,activate_encounter', 'Successful scene_run_start effects were not applied in authored order.');
  assert(failureResult?.status === 'failed', `Intentional scene_run_start failure was not audited as failed: ${failureResult?.status}.`);
  assert(['ENCOUNTER_CHARACTER_REQUIRED', 'RUNTIME_ENCOUNTER_NOT_ACTIVE'].includes(failureResult.code), `Unexpected intentional failure code: ${failureResult.code}.`);
  assert(!created.sceneRunStartStoryWarning, `Unexpected scene_run_start infrastructure warning: ${created.sceneRunStartStoryWarning?.code}.`);

  const detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  const encounter = runtimeEncounter(detail, encounterId);
  assert(encounter?.status === 'active', 'Successful scene_run_start activation did not persist Runtime Encounter active state.');
  const flag = (detail?.storyFlags || []).find(item => item.key === START_FLAG);
  assert(flag?.value === true, 'scene_run_start set_flag effect did not persist.');
  const narrative = (detail?.storyNarratives || []).find(item => item.storyEventId === events.success.id && item.text === START_NARRATIVE);
  assert(narrative?.id, 'scene_run_start narrative did not persist.');
  const successAudit = (detail?.storyExecutions || []).find(item => item.storyEventId === events.success.id && item.status === 'applied');
  const failureAudit = (detail?.storyExecutions || []).find(item => item.storyEventId === events.failure.id && item.status === 'failed');
  assert(successAudit?.id, 'Successful scene_run_start execution audit is missing.');
  assert(failureAudit?.id, 'Failed scene_run_start execution audit is missing.');

  const definition = findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME).encounter;
  assert(definition.status === 'planned', 'Encounter Definition status was polluted by scene_run_start Runtime activation.');
  assert(definition.combat === null, 'Definition encounter_combats was polluted by scene_run_start processing.');

  return {
    mapId,
    successExecutionId: successAudit.id,
    failureExecutionId: failureAudit.id,
    failureCode: failureResult.code
  };
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
      gmNotes: `${scenario.gmNotes || ''}\nscene_run_start E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function closeRuntime(gm, mapId) {
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after scene_run_start E2E.');
}

async function bestEffortFailureCleanup(gm, mapId = '') {
  if (!gm) return;
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
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing scene_run_start Story E2E.',
      writes: [
        'Scenario / Scene / planned Encounter Definition',
        'World Location / 1x1 Map Template / Scene binding',
        'successful once-per-Run scene_run_start Story Event with narrative + flag + activate_encounter',
        'intentional failing scene_run_start Story Event with start_combat and no Character participant',
        'Scene Run / Runtime Map creation',
        'verification that Runtime creation stays successful while the second Story Event is audited failed',
        'verification that the first Story Event effects remain committed',
        'verification that Encounter Definition status and legacy Combat link remain unchanged',
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
    const events = await createSceneRunStartEvents(gm, story.scene.id, story.encounter.id);
    const result = await exerciseSceneRunStart(gm, story.scene.id, story.encounter.id, events);
    mapId = result.mapId;
    await closeRuntime(gm, mapId);
    const scenarioId = await archiveScenario(gm);

    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      scenarioId,
      sceneId: story.scene.id,
      encounterId: story.encounter.id,
      mapTemplateId: mapTemplate.id,
      mapInstanceId: mapId,
      successEventId: events.success.id,
      failureEventId: events.failure.id,
      successExecutionId: result.successExecutionId,
      failureExecutionId: result.failureExecutionId,
      intentionalFailureCode: result.failureCode,
      exercised: {
        sceneRunStartTrigger: true,
        canonicalEmptyTriggerPayload: true,
        committedRuntimeBoundary: true,
        successfulEffectsPersist: true,
        failedEventAudit: true,
        runtimeEncounterActivation: true,
        definitionStatusIsolation: true,
        definitionCombatIsolation: true,
        runtimeClosed: true,
        scenarioArchived: true
      },
      note: 'The runner leaves clearly named alpha-start-* audit/test definitions in D1; Runtime and Scenario are closed/archived rather than hard-deleted.'
    }, null, 2));
  } catch (error) {
    await bestEffortFailureCleanup(gm, mapId);
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
    note: 'A failed scene_run_start live run may leave alpha-start-* audit/test data. Best-effort cleanup closes its known Runtime and archives its Scenario.'
  }, null, 2));
  process.exitCode = 1;
});