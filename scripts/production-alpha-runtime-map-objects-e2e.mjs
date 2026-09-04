const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = `alpha-object-${stamp()}`.slice(0, 36);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const OBJECT_ID = `object_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_lever`.slice(0, 120);
const OBJECT_NAME_V1 = `${RUN_ID} Ancient Lever`.slice(0, 120);
const OBJECT_NAME_V2 = `${RUN_ID} Awakened Lever`.slice(0, 120);

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

async function createScenarioAndScene(gm) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST',
    body: { name: SCENARIO_NAME, summary: 'Production Alpha Runtime Map Object snapshot isolation E2E' }
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

async function createMap(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST',
    body: { name: LOCATION_NAME, description: 'Runtime Map Object snapshot E2E', gmNotes: RUN_ID }
  });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'World Location');
  await gm.json('/api/gm/world/maps', {
    method: 'POST',
    body: { locationId: location.id, name: MAP_NAME, width: 2, height: 2, backgroundAssetRef: '', gmNotes: RUN_ID }
  });
  world = await gm.json('/api/gm/world-maps');
  const mapTemplate = findNamed(world?.mapTemplates, MAP_NAME, 'Map Template');

  const editor = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/editor`);
  const gridSaved = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/editor`, {
    method: 'PUT',
    body: {
      expectedVersion: editor.mapTemplate.version,
      cells: [{ x: 1, y: 0, isWalkable: false, terrainKey: 'wall_fixture', gmNotes: 'Object intentionally occupies blocked Cell.' }],
      edges: [],
      zones: [],
      spawnPoints: []
    }
  });
  assert(gridSaved?.mapTemplate?.version, 'Grid editor did not save the blocked Object fixture Cell.');

  const objectLayer = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/objects`);
  const savedObjects = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/objects`, {
    method: 'PUT',
    body: {
      expectedVersion: objectLayer.mapTemplate.version,
      objects: [{
        id: OBJECT_ID,
        name: OBJECT_NAME_V1,
        objectType: 'lever',
        x: 1,
        y: 0,
        interactionRange: 1,
        playerVisibleDefault: true,
        enabledDefault: true,
        initialState: { position: 'up', revision: 1 },
        gmNotes: RUN_ID
      }]
    }
  });
  assert(savedObjects?.objects?.length === 1, 'Object Layer did not persist exactly one Object.');
  assert(savedObjects.objects[0].id === OBJECT_ID, 'Object Layer did not preserve stable source Object ID.');

  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return { location, mapTemplateId: mapTemplate.id, definitionVersion1: savedObjects.mapTemplate.version };
}

async function startRuntime(gm, sceneId, label) {
  const runtime = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label }
  });
  assert(runtime?.mapInstance?.id, 'Scene Runtime did not return a Runtime Map ID.');
  assert(Array.isArray(runtime?.objects), 'Scene Runtime response did not expose Runtime Objects.');
  return runtime;
}

function findRuntimeObject(runtime, label) {
  const object = (runtime?.objects || []).find(item => item?.sourceObjectId === OBJECT_ID);
  assert(object, `${label} did not contain the expected Runtime Object snapshot.`);
  return object;
}

async function closeRuntime(gm, mapInstanceId) {
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', `Runtime Map ${mapInstanceId} did not close.`);
}

async function editDefinition(gm, mapTemplateId) {
  const current = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplateId)}/objects`);
  const edited = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplateId)}/objects`, {
    method: 'PUT',
    body: {
      expectedVersion: current.mapTemplate.version,
      objects: [{
        id: OBJECT_ID,
        name: OBJECT_NAME_V2,
        objectType: 'lever',
        x: 1,
        y: 0,
        interactionRange: 2,
        playerVisibleDefault: false,
        enabledDefault: true,
        initialState: { position: 'down', revision: 2 },
        gmNotes: `${RUN_ID} definition edited after Runtime A`
      }]
    }
  });
  assert(edited?.mapTemplate?.version > current.mapTemplate.version, 'Object Definition edit did not advance Map Template version.');
  return edited.mapTemplate.version;
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
      gmNotes: `${scenario.gmNotes || ''}\nRuntime Map Object snapshot E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Runtime Map Object snapshot E2E.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'Scenario / Scene',
        'World Location / 2x2 Map Template with one intentionally blocked Object Cell',
        'stable Map Object Definition with structured initial state',
        'Runtime A snapshot from Definition revision 1',
        'Definition edit to revision 2 after Runtime A exists',
        'verification that Runtime A remains revision 1',
        'Runtime B snapshot from Definition revision 2',
        'closed Runtime Maps and archived Scenario audit entities'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const startedAt = new Date().toISOString();

  await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
  const gmMe = await gm.json('/api/admin/auth/me');
  assert(gmMe?.user?.role === 'admin', 'GM session did not authenticate as admin.');

  const story = await createScenarioAndScene(gm);
  const world = await createMap(gm, story.scene.id);

  const runtimeA = await startRuntime(gm, story.scene.id, `${RUN_ID} Runtime A`);
  const objectA = findRuntimeObject(runtimeA, 'Runtime A');
  assert(objectA.name === OBJECT_NAME_V1, 'Runtime A did not snapshot Definition name revision 1.');
  assert(objectA.interactionRange === 1, 'Runtime A did not snapshot interaction range 1.');
  assert(objectA.playerVisible === true, 'Runtime A did not snapshot visible=true.');
  assert(objectA.state?.revision === 1 && objectA.state?.position === 'up', 'Runtime A did not snapshot initial state revision 1.');
  assert(objectA.x === 1 && objectA.y === 0, 'Runtime A Object was not preserved on the intentionally blocked Cell.');
  await closeRuntime(gm, runtimeA.mapInstance.id);

  const definitionVersion2 = await editDefinition(gm, world.mapTemplateId);

  const runtimeAAfterEdit = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(runtimeA.mapInstance.id)}`);
  const objectAAfterEdit = findRuntimeObject(runtimeAAfterEdit, 'Runtime A after Definition edit');
  assert(objectAAfterEdit.name === OBJECT_NAME_V1, 'Definition edit retroactively changed Runtime A name snapshot.');
  assert(objectAAfterEdit.interactionRange === 1, 'Definition edit retroactively changed Runtime A interaction range.');
  assert(objectAAfterEdit.playerVisible === true, 'Definition edit retroactively changed Runtime A visibility.');
  assert(objectAAfterEdit.state?.revision === 1, 'Definition edit retroactively changed Runtime A state.');

  const runtimeB = await startRuntime(gm, story.scene.id, `${RUN_ID} Runtime B`);
  const objectB = findRuntimeObject(runtimeB, 'Runtime B');
  assert(runtimeB.mapInstance.sourceMapVersion === definitionVersion2, 'Runtime B did not record the edited Map Template version.');
  assert(objectB.name === OBJECT_NAME_V2, 'Runtime B did not snapshot Definition name revision 2.');
  assert(objectB.interactionRange === 2, 'Runtime B did not snapshot interaction range 2.');
  assert(objectB.playerVisible === false, 'Runtime B did not snapshot visible=false.');
  assert(objectB.state?.revision === 2 && objectB.state?.position === 'down', 'Runtime B did not snapshot state revision 2.');
  assert(objectB.id !== objectA.id, 'Separate Scene Runs reused the same Runtime Object ID.');
  assert(objectB.sourceObjectId === objectA.sourceObjectId, 'Stable sourceObjectId changed between Runtime snapshots.');
  await closeRuntime(gm, runtimeB.mapInstance.id);

  const scenarioId = await archiveScenario(gm);

  console.log(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    startedAt,
    endedAt: new Date().toISOString(),
    gmRole: gmMe.user.role,
    scenario: { id: scenarioId, sceneId: story.scene.id },
    world: { locationId: world.location.id, mapTemplateId: world.mapTemplateId },
    definition: { sourceObjectId: OBJECT_ID, version1: world.definitionVersion1, version2: definitionVersion2 },
    runtimeA: { mapInstanceId: runtimeA.mapInstance.id, runtimeObjectId: objectA.id, state: objectA.state },
    runtimeB: { mapInstanceId: runtimeB.mapInstance.id, runtimeObjectId: objectB.id, state: objectB.state },
    exercised: {
      objectOnBlockedCell: true,
      stableSourceObjectId: true,
      sameTransactionSnapshotSurface: true,
      runtimeDefinitionIsolation: true,
      freshRuntimeObjectPerSceneRun: objectB.id !== objectA.id,
      newRuntimeUsesEditedDefinition: objectB.state?.revision === 2,
      runtimesClosed: true,
      scenarioArchived: true
    },
    note: 'The runner leaves clearly named alpha-object-* Definition/audit data in D1 and closes/archives Runtime state rather than deleting Canonical history.'
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
    note: 'A failed Runtime Map Object live run may leave alpha-object-* audit/test data in D1; it never starts Combat.'
  }, null, 2));
  process.exitCode = 1;
});
