const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = `alpha-flag-${stamp()}`.slice(0, 32);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const SOURCE_EVENT_NAME = `${RUN_ID}-source`.slice(0, 120);
const DERIVED_EVENT_NAME = `${RUN_ID}-derived`.slice(0, 120);
const CASCADE_EVENT_NAME = `${RUN_ID}-cascade`.slice(0, 120);
const NOOP_EVENT_NAME = `${RUN_ID}-noop`.slice(0, 120);
const KEY_PREFIX = `alpha.flag.${RUN_ID.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}`.slice(0, 56);
const SOURCE_FLAG = `${KEY_PREFIX}.source`.slice(0, 80);
const DERIVED_FLAG = `${KEY_PREFIX}.derived`.slice(0, 80);
const FINAL_FLAG = `${KEY_PREFIX}.final`.slice(0, 80);
const NARRATIVE = `Durable flag_changed cascade passed: ${RUN_ID}`;

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

async function ensureNoExistingCombat(gm) {
  const state = await gm.json('/api/gm/combat');
  if (state?.combat?.status === 'active') {
    throw new Error(`Refusing flag_changed E2E write: active Combat exists (${state.combat.id}).`);
  }
}

async function createScenarioScene(gm) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Durable flag_changed production E2E' }
  });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, {
    method: 'POST', body: { name: SCENE_NAME }
  });
  story = await gm.json('/api/gm/story');
  const refreshed = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  const scene = findNamed(refreshed?.scenes, SCENE_NAME, 'Scene');
  return { scenario: refreshed, scene };
}

async function createEvent(gm, sceneId, body) {
  const payload = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST', body
  });
  assert(payload?.event?.id, `Story Event creation failed: ${body.name}`);
  return payload.event;
}

async function createEvents(gm, sceneId) {
  const source = await createEvent(gm, sceneId, {
    name: SOURCE_EVENT_NAME,
    status: 'active',
    triggerType: 'manual',
    trigger: {},
    conditions: [{ type: 'event_not_fired' }],
    effects: [{ type: 'set_flag', key: SOURCE_FLAG, value: true }],
    oncePerSceneRun: true
  });

  const derived = await createEvent(gm, sceneId, {
    name: DERIVED_EVENT_NAME,
    status: 'active',
    triggerType: 'flag_changed',
    trigger: { key: SOURCE_FLAG },
    conditions: [
      { type: 'event_not_fired' },
      { type: 'flag_equals', key: SOURCE_FLAG, value: true }
    ],
    effects: [
      { type: 'set_flag', key: DERIVED_FLAG, value: 'ready' },
      { type: 'show_narrative', text: NARRATIVE }
    ],
    oncePerSceneRun: true
  });

  const cascade = await createEvent(gm, sceneId, {
    name: CASCADE_EVENT_NAME,
    status: 'active',
    triggerType: 'flag_changed',
    trigger: { key: DERIVED_FLAG },
    conditions: [
      { type: 'event_not_fired' },
      { type: 'flag_equals', key: DERIVED_FLAG, value: 'ready' }
    ],
    effects: [{ type: 'set_flag', key: FINAL_FLAG, value: true }],
    oncePerSceneRun: true
  });

  const noop = await createEvent(gm, sceneId, {
    name: NOOP_EVENT_NAME,
    status: 'active',
    triggerType: 'manual',
    trigger: {},
    conditions: [],
    effects: [{ type: 'set_flag', key: SOURCE_FLAG, value: true }],
    oncePerSceneRun: false
  });

  return { source, derived, cascade, noop };
}

async function createRuntime(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'flag_changed production E2E', gmNotes: RUN_ID }
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
    method: 'POST', body: { sceneId, label: `${RUN_ID} flag_changed Runtime` }
  });
  const mapInstanceId = runtime?.mapInstance?.id;
  assert(mapInstanceId, 'Scene Runtime did not return a Runtime Map ID.');
  return { location, mapTemplate, mapInstanceId };
}

function appliedLifecycleEvent(payload, eventId) {
  return (payload?.flagChangedStoryEvents || []).find(item => item?.eventId === eventId && item?.status === 'applied');
}

async function exercise(gm, mapInstanceId, events) {
  const before = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  for (const key of [SOURCE_FLAG, DERIVED_FLAG, FINAL_FLAG]) {
    assert(!(before?.storyFlags || []).some(item => item?.key === key), `Flag existed before source mutation: ${key}`);
  }

  const activated = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/story-events/${encodeURIComponent(events.source.id)}/activate`, {
    method: 'POST', body: {}
  });
  assert(activated?.ok === true, 'Source manual Story Event did not apply.');
  assert(Array.isArray(activated?.flagChangedStoryEvents), 'Source response did not expose flagChangedStoryEvents.');

  const derived = appliedLifecycleEvent(activated, events.derived.id);
  const cascade = appliedLifecycleEvent(activated, events.cascade.id);
  assert(derived, 'SOURCE_FLAG flag_changed Event did not apply.');
  assert(cascade, 'DERIVED_FLAG cascade flag_changed Event did not apply.');

  assert(derived.flagKey === SOURCE_FLAG, 'Derived flag_changed Event reported the wrong source flag key.');
  assert(derived.flagHadPreviousValue === false, 'First source flag creation should report no previous value.');
  assert(derived.flagFromValue === null && derived.flagToValue === true, 'Source flag change snapshot is incorrect.');
  assert(derived.flagChangeId && derived.occurrenceId, 'Source flag change did not expose durable identities.');

  assert(cascade.flagKey === DERIVED_FLAG, 'Cascade flag_changed Event reported the wrong source flag key.');
  assert(cascade.flagHadPreviousValue === false, 'First derived flag creation should report no previous value.');
  assert(cascade.flagFromValue === null && cascade.flagToValue === 'ready', 'Derived flag change snapshot is incorrect.');
  assert(cascade.flagChangeId && cascade.occurrenceId, 'Derived flag change did not expose durable identities.');

  let detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  const flags = new Map((detail?.storyFlags || []).map(item => [item.key, item.value]));
  assert(flags.get(SOURCE_FLAG) === true, 'Source flag did not persist true.');
  assert(flags.get(DERIVED_FLAG) === 'ready', 'Derived flag did not persist ready.');
  assert(flags.get(FINAL_FLAG) === true, 'Final cascade flag did not persist true.');
  assert((detail?.storyNarratives || []).some(item => item?.storyEventId === events.derived.id && item?.text === NARRATIVE), 'flag_changed narrative did not persist.');

  const derivedBefore = (detail?.storyExecutions || []).filter(item => item?.storyEventId === events.derived.id && item?.status === 'applied').length;
  const cascadeBefore = (detail?.storyExecutions || []).filter(item => item?.storyEventId === events.cascade.id && item?.status === 'applied').length;
  assert(derivedBefore === 1 && cascadeBefore === 1, 'Initial flag_changed cascade did not execute exactly once.');

  const noop = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/story-events/${encodeURIComponent(events.noop.id)}/activate`, {
    method: 'POST', body: {}
  });
  assert(noop?.ok === true, 'Same-value manual set_flag Event did not apply.');
  assert(Array.isArray(noop?.flagChangedStoryEvents), 'Same-value response did not expose flagChangedStoryEvents.');
  assert(noop.flagChangedStoryEvents.length === 0, `Same-value write produced ${noop.flagChangedStoryEvents.length} flag_changed lifecycle results.`);

  detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  const derivedAfter = (detail?.storyExecutions || []).filter(item => item?.storyEventId === events.derived.id && item?.status === 'applied').length;
  const cascadeAfter = (detail?.storyExecutions || []).filter(item => item?.storyEventId === events.cascade.id && item?.status === 'applied').length;
  assert(derivedAfter === derivedBefore, 'Same-value write duplicated the derived flag_changed execution.');
  assert(cascadeAfter === cascadeBefore, 'Same-value write duplicated the cascade flag_changed execution.');

  return {
    sourceFlagChangeId: derived.flagChangeId,
    sourceOccurrenceId: derived.occurrenceId,
    derivedFlagChangeId: cascade.flagChangeId,
    derivedOccurrenceId: cascade.occurrenceId,
    initialFlagChangedResultCount: activated.flagChangedStoryEvents.length,
    sameValueFlagChangedResultCount: noop.flagChangedStoryEvents.length,
    derivedAppliedCount: derivedAfter,
    cascadeAppliedCount: cascadeAfter
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
      gmNotes: `${scenario.gmNotes || ''}\nflag_changed production E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function cleanup(gm, mapInstanceId) {
  if (mapInstanceId) {
    await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
      method: 'POST', body: { completeScenarioRun: true }, allow: [404, 409]
    }).catch(() => null);
  }
  return archiveScenario(gm).catch(() => null);
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing durable flag_changed E2E.',
      writes: [
        'Scenario / Scene',
        'source manual set_flag Event',
        'flag_changed derived Event',
        'flag_changed cascade Event',
        'same-value manual set_flag Event',
        '1x1 Map Template / Scene binding / Scene Run',
        'Runtime Story flags / lifecycle audits / Story execution rows',
        'closed Runtime / archived Scenario'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  let mapInstanceId = '';
  const startedAt = new Date().toISOString();

  try {
    await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
    const me = await gm.json('/api/admin/auth/me');
    assert(me?.user?.role === 'admin', 'GM session did not authenticate as admin.');
    await ensureNoExistingCombat(gm);

    const { scene } = await createScenarioScene(gm);
    const events = await createEvents(gm, scene.id);
    const runtime = await createRuntime(gm, scene.id);
    mapInstanceId = runtime.mapInstanceId;
    const exercised = await exercise(gm, mapInstanceId, events);

    const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
      method: 'POST', body: { completeScenarioRun: true }
    });
    assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after flag_changed E2E.');
    const scenarioId = await archiveScenario(gm);

    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      scenarioId,
      sceneId: scene.id,
      mapInstanceId,
      flags: { source: SOURCE_FLAG, derived: DERIVED_FLAG, final: FINAL_FLAG },
      events: {
        source: events.source.id,
        derived: events.derived.id,
        cascade: events.cascade.id,
        noop: events.noop.id
      },
      exercised: {
        durableFirstFlagChange: true,
        flagChangedDispatch: true,
        flagChangedCascade: true,
        sourceValueSnapshot: true,
        sameValueNoOccurrence: true,
        duplicateDispatchPrevention: true,
        runtimeClosed: true,
        scenarioArchived: true,
        ...exercised
      },
      note: 'The runner leaves clearly named alpha-flag-* audit/test definitions in D1; Runtime and Scenario are closed/archived rather than hard-deleted.'
    }, null, 2));
  } catch (error) {
    await cleanup(gm, mapInstanceId);
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
    note: 'A failed durable flag_changed live run may leave alpha-flag-* audit/test data. Best-effort cleanup closes the Runtime and archives the Scenario.'
  }, null, 2));
  process.exitCode = 1;
});
