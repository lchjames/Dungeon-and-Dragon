const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = `alpha-object-state-${stamp()}`.slice(0, 36);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const OBJECT_NAME = `${RUN_ID}-vault`.slice(0, 120);
const OPEN_EVENT_NAME = `${RUN_ID}-open`.slice(0, 120);
const LOCKED_ONLY_EVENT_NAME = `${RUN_ID}-locked-only`.slice(0, 120);
const SAME_STATE_EVENT_NAME = `${RUN_ID}-same-state`.slice(0, 120);
const NARRATIVE = `Object state mechanics production narrative ${RUN_ID}`;

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

async function createScenarioScene(gm) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Story Object state mechanics production Alpha E2E' }
  });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, {
    method: 'POST', body: { name: SCENE_NAME }
  });
  story = await gm.json('/api/gm/story');
  const refreshed = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  return { scenario: refreshed, scene: findNamed(refreshed?.scenes, SCENE_NAME, 'Scene') };
}

async function createMapObject(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'Object state mechanics production E2E', gmNotes: RUN_ID }
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
  const objectPayload = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/objects`, {
    method: 'POST',
    body: {
      expectedVersion: mapTemplate.version,
      name: OBJECT_NAME,
      objectType: 'vault',
      x: 0,
      y: 0,
      playerVisibleDefault: true,
      interactableDefault: true,
      interactionRange: 0,
      singleUse: false,
      initialStateKey: 'locked',
      gmNotes: RUN_ID
    }
  });
  assert(objectPayload?.object?.id, 'Definition Object creation did not return a stable sourceObjectId.');
  assert(objectPayload.object.initialStateKey === 'locked', 'Definition Object did not retain locked initial state.');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return {
    location,
    mapTemplate: { ...mapTemplate, version: objectPayload.mapVersion },
    objectDefinition: objectPayload.object
  };
}

async function createEvent(gm, sceneId, { name, conditionState, effectState, narrative = '' }) {
  const effects = [{ type: 'set_object_state', sourceObjectId: effectState.sourceObjectId, stateKey: effectState.stateKey }];
  if (narrative) effects.push({ type: 'show_narrative', text: narrative });
  const payload = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name,
      status: 'active',
      triggerType: 'manual',
      trigger: {},
      conditions: [
        { type: 'object_state', sourceObjectId: conditionState.sourceObjectId, stateKey: conditionState.stateKey }
      ],
      effects,
      oncePerSceneRun: false
    }
  });
  assert(payload?.event?.id, `Story Event creation failed: ${name}`);
  assert(payload.event.conditions?.[0]?.type === 'object_state', 'object_state condition was not preserved by authoring normalization.');
  assert(payload.event.effects?.[0]?.type === 'set_object_state', 'set_object_state effect was not preserved by authoring normalization.');
  return payload.event;
}

async function createRuntime(gm, sceneId, sourceObjectId) {
  const runtime = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label: `${RUN_ID} Object State Runtime` }
  });
  const mapInstanceId = runtime?.mapInstance?.id;
  assert(mapInstanceId, 'Scene Runtime did not return a Runtime Map ID.');
  const runtimeObjects = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/objects`);
  const object = (runtimeObjects?.objects || []).find(item => item.sourceObjectId === sourceObjectId);
  assert(object?.id, 'Runtime Map did not snapshot the Definition Object.');
  assert(object.stateKey === 'locked', 'Runtime Object snapshot did not start locked.');
  return { mapInstanceId, runtimeObject: object };
}

async function activate(gm, mapInstanceId, eventId) {
  return gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/story-events/${encodeURIComponent(eventId)}/activate`, {
    method: 'POST', body: {}
  });
}

async function exercise({ gm, scene, mapInstanceId, objectDefinition, runtimeObject, mapTemplate }) {
  const target = { sourceObjectId: objectDefinition.id };
  const openEvent = await createEvent(gm, scene.id, {
    name: OPEN_EVENT_NAME,
    conditionState: { ...target, stateKey: 'locked' },
    effectState: { ...target, stateKey: 'open' },
    narrative: NARRATIVE
  });
  const lockedOnlyEvent = await createEvent(gm, scene.id, {
    name: LOCKED_ONLY_EVENT_NAME,
    conditionState: { ...target, stateKey: 'locked' },
    effectState: { ...target, stateKey: 'broken' }
  });
  const sameStateEvent = await createEvent(gm, scene.id, {
    name: SAME_STATE_EVENT_NAME,
    conditionState: { ...target, stateKey: 'open' },
    effectState: { ...target, stateKey: 'open' }
  });

  const opened = await activate(gm, mapInstanceId, openEvent.id);
  assert(opened?.ok === true && opened?.executionId, 'Object-state Story Event did not apply.');
  const stateEffect = (opened.effectsApplied || []).find(effect => effect?.type === 'set_object_state');
  assert(stateEffect?.sourceObjectId === objectDefinition.id, 'set_object_state applied to the wrong sourceObjectId.');
  assert(stateEffect?.runtimeObjectId === runtimeObject.id, 'set_object_state applied to the wrong Runtime Object.');
  assert(stateEffect?.stateKey === 'open' && stateEffect?.unchanged === false, 'Runtime Object did not transition locked → open.');
  assert(stateEffect?.auditId, 'Real Object state transition did not return a canonical stateAuditId/auditId.');

  const runtimeAfterOpen = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/objects`);
  const objectAfterOpen = (runtimeAfterOpen?.objects || []).find(item => item.id === runtimeObject.id);
  assert(objectAfterOpen?.stateKey === 'open', 'Runtime Object state did not persist as open.');

  const definitionList = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/objects`);
  const definitionAfter = (definitionList?.objects || []).find(item => item.id === objectDefinition.id);
  assert(definitionAfter?.initialStateKey === 'locked', 'Story Runtime mutation polluted Definition Object initial state.');

  const lockedAttempt = await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/story-events/${encodeURIComponent(lockedOnlyEvent.id)}/activate`, {
    method: 'POST', body: {}, allow: [409]
  });
  assert(lockedAttempt.response.status === 409, `Locked-only Event should fail after open; got ${lockedAttempt.response.status}.`);
  assert(lockedAttempt.payload?.error?.code === 'STORY_EVENT_CONDITIONS_NOT_MET', `Locked-only Event returned ${lockedAttempt.payload?.error?.code || 'no code'}.`);
  assert((lockedAttempt.payload?.error?.failures || []).some(item => item?.reason === 'object_state_mismatch'), 'Locked-only Event did not report object_state_mismatch.');

  const sameState = await activate(gm, mapInstanceId, sameStateEvent.id);
  const sameStateEffect = (sameState.effectsApplied || []).find(effect => effect?.type === 'set_object_state');
  assert(sameStateEffect?.stateKey === 'open' && sameStateEffect?.unchanged === true, 'Same-state open → open was not idempotent.');
  assert(sameStateEffect?.auditId === null, 'Same-state Story effect manufactured an Object state audit.');

  const detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  assert((detail?.storyNarratives || []).some(item => item?.storyEventId === openEvent.id && item?.text === NARRATIVE), 'Object-state Story narrative did not persist.');

  return {
    openEventId: openEvent.id,
    lockedOnlyEventId: lockedOnlyEvent.id,
    sameStateEventId: sameStateEvent.id,
    stateAuditId: stateEffect.auditId,
    runtimeStateAfter: objectAfterOpen.stateKey,
    definitionStateAfter: definitionAfter.initialStateKey,
    lockedConditionStatus: lockedAttempt.response.status,
    lockedConditionCode: lockedAttempt.payload.error.code,
    sameStateUnchanged: sameStateEffect.unchanged,
    sameStateAuditId: sameStateEffect.auditId
  };
}

async function closeAndArchive(gm, mapInstanceId) {
  if (mapInstanceId) {
    await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
      method: 'POST', body: { completeScenarioRun: true }, allow: [404, 409]
    }).catch(() => null);
  }
  const story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: scenario.name,
      status: 'archived',
      summary: scenario.summary || '',
      gmNotes: `${scenario.gmNotes || ''}\nObject state mechanics production E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Story Object state mechanics E2E.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'Scenario / Scene and 1x1 Map Template',
        'Definition Object with initial locked state',
        'manual Story Events using object_state and set_object_state',
        'Runtime Object state transition and canonical story_effect audit',
        'same-state idempotency verification',
        'closed Runtime and archived Scenario audit entities'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const startedAt = new Date().toISOString();
  let mapInstanceId = '';

  try {
    await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
    const me = await gm.json('/api/admin/auth/me');
    assert(me?.user?.role === 'admin', 'GM session did not authenticate as admin.');

    const story = await createScenarioScene(gm);
    const world = await createMapObject(gm, story.scene.id);
    const runtime = await createRuntime(gm, story.scene.id, world.objectDefinition.id);
    mapInstanceId = runtime.mapInstanceId;
    const result = await exercise({
      gm,
      scene: story.scene,
      mapInstanceId,
      objectDefinition: world.objectDefinition,
      runtimeObject: runtime.runtimeObject,
      mapTemplate: world.mapTemplate
    });
    const scenarioId = await closeAndArchive(gm, mapInstanceId);

    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      gmRole: me.user.role,
      scenario: { id: scenarioId, sceneId: story.scene.id },
      world: {
        mapTemplateId: world.mapTemplate.id,
        sourceObjectId: world.objectDefinition.id,
        runtimeObjectId: runtime.runtimeObject.id,
        mapInstanceId
      },
      result,
      exercised: {
        objectStateCondition: result.lockedConditionCode === 'STORY_EVENT_CONDITIONS_NOT_MET',
        setObjectStateEffect: result.runtimeStateAfter === 'open',
        canonicalStateAudit: Boolean(result.stateAuditId),
        DefinitionObjectIsolation: result.definitionStateAfter === 'locked',
        sameStateIdempotency: result.sameStateUnchanged === true && result.sameStateAuditId === null,
        runtimeClosed: true,
        scenarioArchived: true
      },
      note: 'The runner leaves clearly named alpha-object-state-* audit/test definitions in D1; Runtime and Scenario are closed or archived instead of hard-deleting Canonical data.'
    }, null, 2));
  } catch (error) {
    if (mapInstanceId) {
      await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
        method: 'POST', body: { completeScenarioRun: true }, allow: [404, 409]
      }).catch(() => null);
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
    note: 'A failed Object state mechanics live run may leave alpha-object-state-* audit/test data in D1; it never starts Combat.'
  }, null, 2));
  process.exitCode = 1;
});
