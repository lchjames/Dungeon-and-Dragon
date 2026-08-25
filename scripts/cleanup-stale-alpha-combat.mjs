const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const ALPHA_PREFIX = 'alpha-e2e-';

class HttpError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class Session {
  constructor() {
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

  async json(path, { method = 'GET', body } = {}) {
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
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      throw new HttpError(
        payload?.error?.message || `${method} ${path} failed`,
        response.status,
        payload?.error?.code || null
      );
    }
    return payload;
  }
}

function isAlphaName(value) {
  return String(value || '').startsWith(ALPHA_PREFIX);
}

function locateCombat(story, combatId) {
  for (const scenario of story?.scenarios || []) {
    for (const scene of scenario?.scenes || []) {
      for (const encounter of scene?.encounters || []) {
        if (encounter?.combat?.combatId === combatId) return { scenario, scene, encounter };
      }
    }
  }
  return null;
}

function appendNote(existing, note) {
  return [String(existing || '').trim(), note].filter(Boolean).join('\n');
}

async function main() {
  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required for stale Alpha cleanup.');

  const gm = new Session();
  await gm.json('/api/admin/auth/login', {
    method: 'POST',
    body: { username: GM_USERNAME, password: GM_PASSWORD }
  });
  const me = await gm.json('/api/admin/auth/me');
  if (me?.user?.role !== 'admin') throw new Error('Cleanup session is not authenticated as Admin.');

  const state = await gm.json('/api/gm/combat');
  const combat = state?.combat;
  if (!combat || combat.status !== 'active') {
    console.log(JSON.stringify({ ok: true, cleaned: false, reason: 'no-active-combat' }, null, 2));
    return;
  }

  const story = await gm.json('/api/gm/story');
  const located = locateCombat(story, combat.id);
  if (!located) {
    throw new Error(`Refusing cleanup: active Combat ${combat.id} is not linked to a visible Encounter.`);
  }

  const safeAlpha = [located.scenario.name, located.scene.name, located.encounter.name].every(isAlphaName);
  if (!safeAlpha) {
    throw new Error(
      `Refusing cleanup: active Combat ${combat.id} is not exclusively linked to alpha-e2e-* Scenario/Scene/Encounter names.`
    );
  }

  await gm.json(`/api/gm/combat/${encodeURIComponent(combat.id)}/end`, {
    method: 'POST',
    body: {}
  });

  const cleanupNote = `Stale production Alpha E2E Combat safely ended by guarded cleanup: ${combat.id}`;
  await gm.json(`/api/gm/encounters/${encodeURIComponent(located.encounter.id)}`, {
    method: 'PATCH',
    body: {
      name: located.encounter.name,
      status: 'skipped',
      triggerNotes: located.encounter.triggerNotes || '',
      gmNotes: located.encounter.gmNotes || '',
      resolutionNotes: appendNote(located.encounter.resolutionNotes, cleanupNote)
    }
  });

  await gm.json(`/api/gm/scenarios/${encodeURIComponent(located.scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: located.scenario.name,
      status: 'archived',
      summary: located.scenario.summary || '',
      gmNotes: appendNote(located.scenario.gmNotes, cleanupNote)
    }
  });

  console.log(JSON.stringify({
    ok: true,
    cleaned: true,
    combatId: combat.id,
    scenarioId: located.scenario.id,
    sceneId: located.scene.id,
    encounterId: located.encounter.id
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    status: error.status || null,
    code: error.code || null
  }, null, 2));
  process.exitCode = 1;
});
