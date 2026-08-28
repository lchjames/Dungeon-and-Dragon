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

const RUN_ID = `alpha-story-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const EVENT_NAME = `${RUN_ID}-event`.slice(0, 120);
const FLAG_KEY = 'alpha.story.manual_verified';
const NARRATIVE = `Story Event production narrative ${RUN_ID}`;

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
    throw new Error(`Refusing Story Event E2E write: an active Combat already exists (${state.combat.id}).`);
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
  const me = await player.json('/api/auth/me');
  assert(me?.user?.id, 'Player registration did not establish a session.');
  assert(me?.user?.role === 'player', 'Story Event test User did not authenticate as player.');
  return me.user;
}

async function createCharacter(player) {
  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(roll?.draft?.id, 'Character creation roll did not return a Draft ID.');
  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name: CHARACTER_NAME, summary: 'Production Alpha Story Event E2E Character', draftId: roll.draft.id }
  });
  const characterId = created?.character?.id;
  assert(characterId, 'Character creation did not return a Character ID.');
  const detail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  const allocations = buildAllocations(
    detail?.character?.skills,
    Number(detail?.character?.progression?.creationSkillPointsTotal || 200)
  );
  const saved = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/creation-skills`, {
    method: 'PATCH', body: { allocations }
  });
  assert(Number(saved?.progression?.creationSkillPointsRemaining) === 0, 'Creation Skill Points were not fully allocated.');
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/finalize-creation`, {
    method: 'POST', body: {}
  });
  const finalDetail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  assert(finalDetail?.character?.status === 'active', 'Story Event test Character did not become active.');
  return finalDetail.character;
}

async function createScenarioScene(gm) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Production Alpha Story Event live E2E' }
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

async function createStoryEvent(gm, sceneId) {
  const payload = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: EVENT_NAME,
      status: 'active',
      triggerType: 'manual',
      trigger: { source: 'production-alpha-live' },
      conditions: [
        { type: 'event_not_fired' },
        { type: 'scene_run_status', status: 'active' },
        { type: 'flag_not_equals', key: FLAG_KEY, value: true }
      ],
      effects: [
        { type: 'set_flag', key: FLAG_KEY, value: true },
        { type: 'show_narrative', text: NARRATIVE }
      ],
      oncePerSceneRun: true
    }
  });
  assert(payload?.event?.id, 'Story Event creation did not return an Event ID.');
  assert(payload.event.triggerType === 'manual', 'Story Event trigger type is not manual.');
  assert(payload.event.oncePerSceneRun === true, 'Story Event is not once-per-Scene-Run.');
  return payload.event;
}

async function createRuntimeMap(gm, sceneId, characterId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST',
    body: { name: LOCATION_NAME, description: 'Production Alpha Story Event E2E Location', gmNotes: RUN_ID }
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
    method: 'POST', body: { sceneId, label: `${RUN_ID} Story Event Runtime` }
  });
  const mapInstanceId = runtime?.mapInstance?.id;
  assert(mapInstanceId, 'Scene Runtime did not return a Runtime Map ID.');
  const placed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterId)}/position`, {
    method: 'PUT', body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  assert(placed?.position?.x === 0 && placed?.position?.y === 0, 'Story Event Character was not placed at (0,0).');
  return { location, mapTemplate, mapInstanceId };
}

async function exerciseStoryEvent({ gm, player, characterId, mapInstanceId, event }) {
  const beforePlayer = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}`);
  assert(beforePlayer?.map?.id === mapInstanceId, 'Player world context did not expose the Story Event Runtime Map.');
  assert(!(beforePlayer?.storyNarratives || []).some(item => item?.text === NARRATIVE), 'Story narrative existed before manual activation.');

  const beforeGm = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  assert(!(beforeGm?.storyFlags || []).some(item => item?.key === FLAG_KEY), 'Story flag existed before manual activation.');

  const activated = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/story-events/${encodeURIComponent(event.id)}/activate`, {
    method: 'POST', body: {}
  });
  assert(activated?.ok === true, 'Story Event activation did not return ok=true.');
  assert(activated?.executionId, 'Story Event activation did not return an execution ID.');
  assert(Array.isArray(activated?.effectsApplied) && activated.effectsApplied.length === 2, 'Story Event did not apply exactly two approved effects.');
  assert(activated.effectsApplied.some(effect => effect?.type === 'set_flag' && effect?.key === FLAG_KEY && effect?.value === true), 'set_flag effect was not recorded as applied.');
  assert(activated.effectsApplied.some(effect => effect?.type === 'show_narrative' && effect?.narrativeId), 'show_narrative effect was not recorded as applied.');

  const afterGm = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  const flag = (afterGm?.storyFlags || []).find(item => item?.key === FLAG_KEY);
  assert(flag?.value === true, 'Runtime Story flag did not persist after activation.');
  const execution = (afterGm?.storyExecutions || []).find(item => item?.id === activated.executionId);
  assert(execution?.status === 'applied', 'Runtime Story execution audit is not applied.');
  assert(execution?.storyEventId === event.id, 'Runtime Story execution audit references the wrong Event.');
  assert((afterGm?.storyNarratives || []).some(item => item?.storyEventId === event.id && item?.text === NARRATIVE), 'GM Runtime detail did not expose the applied narrative.');

  const afterPlayer = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}`);
  const narrative = (afterPlayer?.storyNarratives || []).find(item => item?.storyEventId === event.id && item?.text === NARRATIVE);
  assert(narrative?.id, 'Player world context did not receive the GM-revealed Story narrative.');

  const second = await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/story-events/${encodeURIComponent(event.id)}/activate`, {
    method: 'POST', body: {}, allow: [409]
  });
  assert(second.response.status === 409, `Second once-per-run activation should return 409; got ${second.response.status}.`);
  assert(second.payload?.error?.code === 'STORY_EVENT_ALREADY_FIRED', `Second activation returned ${second.payload?.error?.code || 'no error code'}.`);

  const finalGm = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  const appliedExecutions = (finalGm?.storyExecutions || []).filter(item => item?.storyEventId === event.id && item?.status === 'applied');
  const narratives = (finalGm?.storyNarratives || []).filter(item => item?.storyEventId === event.id && item?.text === NARRATIVE);
  assert(appliedExecutions.length === 1, `Once-per-run Event produced ${appliedExecutions.length} applied executions instead of one.`);
  assert(narratives.length === 1, `Once-per-run Event produced ${narratives.length} narratives instead of one.`);

  return {
    executionId: activated.executionId,
    flagValue: flag.value,
    narrativeId: narrative.id,
    appliedEffectTypes: activated.effectsApplied.map(effect => effect.type),
    secondActivationStatus: second.response.status,
    secondActivationCode: second.payload.error.code,
    appliedExecutionCount: appliedExecutions.length,
    narrativeCount: narratives.length
  };
}

async function closeAndArchive(gm, mapInstanceId) {
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after Story Event E2E.');
  const story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: scenario.name,
      status: 'archived',
      summary: scenario.summary || '',
      gmNotes: `${scenario.gmNotes || ''}\nProduction Story Event E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Story Event E2E session.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'test Player and active Character',
        'Scenario / Scene and manual Story Event definition',
        'World Location / 1x1 Map Template / Scene binding',
        'Runtime Map / Character position',
        'Runtime Story flag, Player narrative and Story execution audit',
        'closed Runtime and archived Scenario audit entities'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const player = new Session('Player');
  const startedAt = new Date().toISOString();

  await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
  const gmMe = await gm.json('/api/admin/auth/me');
  assert(gmMe?.user?.role === 'admin', 'GM session did not authenticate as admin.');
  await ensureNoExistingCombat(gm);

  const playerUser = await registerPlayer(player);
  const character = await createCharacter(player);
  const story = await createScenarioScene(gm);
  const event = await createStoryEvent(gm, story.scene.id);
  const runtime = await createRuntimeMap(gm, story.scene.id, character.id);
  const result = await exerciseStoryEvent({ gm, player, characterId: character.id, mapInstanceId: runtime.mapInstanceId, event });
  const scenarioId = await closeAndArchive(gm, runtime.mapInstanceId);

  console.log(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    startedAt,
    endedAt: new Date().toISOString(),
    gmRole: gmMe.user.role,
    player: { userId: playerUser.id, displayName: playerUser.displayName || PLAYER_NAME },
    character: { id: character.id, name: character.name, status: character.status },
    scenario: { id: scenarioId, sceneId: story.scene.id },
    storyEvent: { id: event.id, name: event.name, triggerType: event.triggerType, oncePerSceneRun: event.oncePerSceneRun },
    world: { locationId: runtime.location.id, mapTemplateId: runtime.mapTemplate.id, mapInstanceId: runtime.mapInstanceId },
    result,
    exercised: {
      manualTrigger: true,
      structuredConditions: true,
      setFlagEffect: result.flagValue === true,
      playerNarrativeEffect: Boolean(result.narrativeId),
      executionAudit: Boolean(result.executionId) && result.appliedExecutionCount === 1,
      oncePerSceneRunBlockedSecondActivation: result.secondActivationStatus === 409 && result.secondActivationCode === 'STORY_EVENT_ALREADY_FIRED',
      runtimeClosed: true,
      scenarioArchived: true
    },
    note: 'The Story Event runner leaves clearly named alpha-story-* audit/test definitions in D1; Runtime and Scenario are closed or archived instead of hard-deleting Canonical data.'
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
    note: 'A failed Story Event live run may leave alpha-story-* audit/test data in D1; it never starts Combat.'
  }, null, 2));
  process.exitCode = 1;
});