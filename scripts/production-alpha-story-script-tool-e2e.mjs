const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = `alpha-script-${stamp()}`.slice(0, 36);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const EVENT_NAME = `${RUN_ID}-event`.slice(0, 120);
const FLAG_KEY = 'alpha.script_tool.verified';
const SCRIPT = `# Production GM Script Tool Alpha\nNAME ${EVENT_NAME}\nSTATUS active\nONCE yes\nTRIGGER MANUAL\nWHEN NOT_FIRED\nDO SET_FLAG ${FLAG_KEY} true\nDO SAY Story Script Tool compile/publish verified ${RUN_ID}`;

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
      const index = first.indexOf('=');
      if (index <= 0) continue;
      const name = first.slice(0, index).trim();
      const value = first.slice(index + 1).trim();
      if (value) this.cookies.set(name, value); else this.cookies.delete(name);
    }
  }
  async request(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual'
    });
    this.capture(response.headers);
    const payload = (response.headers.get('content-type') || '').includes('application/json')
      ? await response.json().catch(() => null)
      : null;
    if (!response.ok) throw new HttpError(payload?.error?.message || `${method} ${path} failed`, response.status, payload?.error?.code, payload);
    return payload;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findNamed(items, name, label) {
  const found = (items || []).find(item => item?.name === name);
  if (!found) throw new Error(`Unable to find ${label}: ${name}`);
  return found;
}

async function createScenarioScene(gm) {
  await gm.request('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Production GM Story Script Tool Alpha' }
  });
  let story = await gm.request('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.request(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, {
    method: 'POST', body: { name: SCENE_NAME }
  });
  story = await gm.request('/api/gm/story');
  const refreshed = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  return { scenario: refreshed, scene: findNamed(refreshed?.scenes, SCENE_NAME, 'Scene') };
}

async function archiveScenario(gm, scenario) {
  await gm.request(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: scenario.name,
      status: 'archived',
      summary: scenario.summary || '',
      gmNotes: `${scenario.gmNotes || ''}\nProduction Story Script Tool E2E passed: ${RUN_ID}`.trim()
    }
  });
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing GM Story Script Tool E2E.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'temporary Scenario and Scene Definition',
        'canonical manual Story Event published from safe Script source',
        'story_script_sources authoring metadata row',
        'archived Scenario audit entity'
      ],
      doesNotWriteRuntime: true
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session();
  await gm.request('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
  const me = await gm.request('/api/admin/auth/me');
  assert(me?.user?.role === 'admin', 'GM session did not authenticate as admin.');

  const compiled = await gm.request('/api/gm/story-scripts/compile', { method: 'POST', body: { script: SCRIPT } });
  assert(compiled?.compiled?.name === EVENT_NAME, 'Compile did not preserve NAME.');
  assert(compiled?.compiled?.triggerType === 'manual', 'Compile did not produce manual trigger.');
  assert((compiled?.compiled?.effects || []).some(effect => effect.type === 'set_flag' && effect.key === FLAG_KEY), 'Compile did not produce expected set_flag effect.');

  const { scenario, scene } = await createScenarioScene(gm);
  const published = await gm.request(`/api/gm/scenes/${encodeURIComponent(scene.id)}/story-scripts`, {
    method: 'POST', body: { script: SCRIPT }
  });
  assert(published?.event?.id, 'Publish did not return a canonical Story Event ID.');
  assert(published.event.name === EVENT_NAME, 'Published Event name mismatch.');
  assert(published.event.triggerType === 'manual', 'Published Event trigger mismatch.');

  const listed = await gm.request(`/api/gm/scenes/${encodeURIComponent(scene.id)}/story-scripts`);
  const saved = (listed?.scripts || []).find(item => item?.event?.id === published.event.id);
  assert(saved, 'Published Script source was not listed.');
  assert(saved.source === SCRIPT, 'Persisted Script source differs from the submitted source.');
  assert(saved.event.effects?.some(effect => effect.type === 'set_flag' && effect.key === FLAG_KEY), 'Listed canonical Event effects mismatch.');

  await archiveScenario(gm, scenario);
  console.log(JSON.stringify({
    ok: true,
    mode: 'executed',
    runId: RUN_ID,
    baseUrl: BASE_URL,
    gmRole: me.user.role,
    scenarioId: scenario.id,
    sceneId: scene.id,
    storyEventId: published.event.id,
    compileVerified: true,
    publishVerified: true,
    sourcePersistenceVerified: true,
    runtimeWrites: false,
    scenarioArchived: true
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
    note: 'A failed live run may leave alpha-script-* Definition/audit data. This runner does not start Runtime or Combat.'
  }, null, 2));
  process.exitCode = 1;
});
