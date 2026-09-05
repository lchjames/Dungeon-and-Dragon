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

const RUN_ID = `alpha-object-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const OBJECT_NAME = `${RUN_ID}-terminal`.slice(0, 120);
const EVENT_NAME = `${RUN_ID}-interact`.slice(0, 120);
const FLAG_KEY = `alpha.object.${RUN_ID.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}`.slice(0, 80);
const NARRATIVE = `Object interaction production narrative ${RUN_ID}`;

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
    throw new Error(`Refusing interact_object E2E write: active Combat exists (${state.combat.id}).`);
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
  assert(me?.user?.id && me.user.role === 'player', 'Player registration did not establish a Player session.');
  return me.user;
}

async function createCharacter(player) {
  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(roll?.draft?.id, 'Character creation roll did not return a Draft ID.');
  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name: CHARACTER_NAME, summary: 'Production Alpha interact_object E2E Character', draftId: roll.draft.id }
  });
  const characterId = created?.character?.id;
  assert(characterId, 'Character creation did not return a Character ID.');
  const detail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  const allocations = buildAllocations(
    detail?.character?.skills,
    Number(detail?.character?.progression?.creationSkillPointsTotal || 200)
  );
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/creation-skills`, {
    method: 'PATCH', body: { allocations }
  });
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/finalize-creation`, {
    method: 'POST', body: {}
  });
  const finalDetail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  assert(finalDetail?.character?.status === 'active', 'Object E2E Character did not become active.');
  return finalDetail.character;
}

async function createScenarioScene(gm) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Runtime Object production Alpha E2E' }
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

async function createMapAndObject(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'Runtime Object production E2E', gmNotes: RUN_ID }
  });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'World Location');
  await gm.json('/api/gm/world/maps', {
    method: 'POST',
    body: {
      locationId: location.id,
      name: MAP_NAME,
      width: 2,
      height: 1,
      backgroundAssetRef: '',
      gmNotes: RUN_ID
    }
  });
  world = await gm.json('/api/gm/world-maps');
  let mapTemplate = findNamed(world?.mapTemplates, MAP_NAME, 'Map Template');
  const createdObject = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/objects`, {
    method: 'POST',
    body: {
      expectedVersion: mapTemplate.version,
      name: OBJECT_NAME,
      objectType: 'terminal',
      x: 1,
      y: 0,
      playerVisibleDefault: true,
      interactableDefault: true,
      interactionRange: 1,
      singleUse: true,
      initialStateKey: 'ready',
      gmNotes: RUN_ID
    }
  });
  assert(createdObject?.object?.id, 'Map Object creation did not return a stable sourceObjectId.');
  assert(createdObject.object.initialStateKey === 'ready', 'Map Object Definition did not preserve ready initial state.');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  mapTemplate = { ...mapTemplate, version: createdObject.mapVersion };
  return { location, mapTemplate, objectDefinition: createdObject.object };
}

async function createStoryEvent(gm, sceneId, sourceObjectId) {
  const payload = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: EVENT_NAME,
      status: 'active',
      triggerType: 'interact_object',
      trigger: { sourceObjectId, ignoredByCanonicalNormalizer: true },
      conditions: [
        { type: 'event_not_fired' },
        { type: 'flag_not_equals', key: FLAG_KEY, value: true }
      ],
      effects: [
        { type: 'set_flag', key: FLAG_KEY, value: true },
        { type: 'show_narrative', text: NARRATIVE }
      ],
      oncePerSceneRun: true
    }
  });
  assert(payload?.event?.id, 'interact_object Story Event creation failed.');
  assert(payload.event.trigger?.sourceObjectId === sourceObjectId, 'interact_object trigger did not canonicalize sourceObjectId.');
  assert(!Object.prototype.hasOwnProperty.call(payload.event.trigger || {}, 'ignoredByCanonicalNormalizer'), 'interact_object trigger kept ignored fields.');
  return payload.event;
}

async function createRuntime(gm, sceneId, characterId, sourceObjectId) {
  const runtime = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label: `${RUN_ID} Object Runtime` }
  });
  const mapInstanceId = runtime?.mapInstance?.id;
  assert(mapInstanceId, 'Scene Runtime did not return a Runtime Map ID.');
  await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterId)}/position`, {
    method: 'PUT', body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  const runtimeObjects = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/objects`);
  const object = (runtimeObjects?.objects || []).find(item => item.sourceObjectId === sourceObjectId);
  assert(object?.id, 'Runtime Map did not snapshot the Map Object Definition.');
  assert(object.stateKey === 'ready' && object.interactable === true, 'Runtime Object snapshot did not start ready/interactable.');
  return { mapInstanceId, runtimeObject: object };
}

async function exercise({ gm, player, characterId, mapInstanceId, runtimeObject, event, objectDefinition, mapTemplateId }) {
  const before = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}/objects`);
  const visible = (before?.objects || []).find(item => item.id === runtimeObject.id);
  assert(visible?.canInteract === true, `Runtime Object was not interactable before action: ${visible?.interactionBlockedReason || 'missing'}.`);
  assert(before?.turn?.actionAvailable === true, 'Character Action was unavailable before interaction.');

  const interacted = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}/objects/${encodeURIComponent(runtimeObject.id)}/interact`, {
    method: 'POST', body: {}
  });
  assert(interacted?.ok === true && interacted?.interaction?.id, 'Object interaction did not return a durable interaction ID.');
  assert(interacted.interaction.actionSpent === true, 'Object interaction did not report Action consumption.');
  assert(interacted.interaction.fromStateKey === 'ready' && interacted.interaction.toStateKey === 'used', 'Single-use Object state transition is incorrect.');
  assert(interacted.object?.stateKey === 'used', 'Runtime Object did not transition to used.');
  assert(interacted.object?.interactable === false, 'Single-use Runtime Object remained interactable.');
  assert(Number(interacted.object?.interactionCount) === 1, 'Runtime Object interaction_count was not incremented exactly once.');

  const storyResult = (interacted?.interactObjectStoryEvents || []).find(item => item?.eventId === event.id && item?.status === 'applied');
  assert(storyResult, 'interact_object Story Event did not apply.');
  assert(storyResult.sourceObjectId === objectDefinition.id, 'Story result references the wrong stable sourceObjectId.');
  assert(storyResult.runtimeObjectId === runtimeObject.id, 'Story result references the wrong Runtime Object.');
  assert(storyResult.objectInteractionId === interacted.interaction.id, 'Story result references the wrong interaction audit.');
  assert(storyResult.characterId === characterId, 'Story result references the wrong Character.');
  assert(storyResult.interactionMode === 'exploration', 'Expected exploration Object interaction mode.');
  assert(storyResult.objectStateBefore === 'ready' && storyResult.objectStateAfter === 'used', 'Story result did not preserve Object state transition metadata.');

  const playerAfter = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}`);
  assert(playerAfter?.turn?.actionAvailable === false, 'Character Action remained available after Object interaction.');
  assert(playerAfter?.turn?.moveAvailable === true, 'Object interaction incorrectly consumed the Character Move.');

  const detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  const flag = (detail?.storyFlags || []).find(item => item?.key === FLAG_KEY);
  assert(flag?.value === true, 'interact_object Story flag did not persist.');
  assert((detail?.storyNarratives || []).some(item => item?.storyEventId === event.id && item?.text === NARRATIVE), 'interact_object Story narrative did not persist.');

  const second = await player.request(`/api/player/world/characters/${encodeURIComponent(characterId)}/objects/${encodeURIComponent(runtimeObject.id)}/interact`, {
    method: 'POST', body: {}, allow: [409]
  });
  assert(second.response.status === 409, `Second single-use interaction should return 409; got ${second.response.status}.`);
  assert(second.payload?.error?.code === 'OBJECT_NOT_INTERACTABLE', `Second interaction returned ${second.payload?.error?.code || 'no error code'}.`);

  const definitions = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplateId)}/objects`);
  const definitionAfter = (definitions?.objects || []).find(item => item.id === objectDefinition.id);
  assert(definitionAfter?.initialStateKey === 'ready', 'Runtime interaction polluted Map Object Definition state.');
  assert(definitionAfter?.interactableDefault === true, 'Runtime interaction polluted Map Object Definition interactable default.');
  assert(definitionAfter?.singleUse === true, 'Runtime interaction polluted Map Object Definition single-use setting.');

  return {
    interactionId: interacted.interaction.id,
    occurrenceId: storyResult.occurrenceId,
    sourceObjectId: storyResult.sourceObjectId,
    runtimeObjectId: storyResult.runtimeObjectId,
    actionAvailableAfter: playerAfter.turn.actionAvailable,
    moveAvailableAfter: playerAfter.turn.moveAvailable,
    runtimeStateAfter: interacted.object.stateKey,
    secondInteractionCode: second.payload.error.code,
    definitionStateAfter: definitionAfter.initialStateKey
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
      gmNotes: `${scenario.gmNotes || ''}\ninteract_object production E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function bestEffortFailureCleanup(gm, mapInstanceId) {
  try { await closeAndArchive(gm, mapInstanceId); } catch { /* best-effort cleanup */ }
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Runtime Object / interact_object E2E.',
      writes: [
        'temporary Player + active Character',
        'Scenario / Scene',
        '2x1 Map Template + reusable single-use Map Object',
        'interact_object Story Event',
        'Scene binding + Runtime Map snapshot + Character position',
        'Player Object interaction audit / Action consumption / Runtime Object used state',
        'Story flag + narrative + lifecycle dispatch',
        'closed Runtime + archived Scenario'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const player = new Session('Player');
  let mapInstanceId = '';
  const startedAt = new Date().toISOString();
  try {
    await gm.json('/api/admin/auth/login', {
      method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD }
    });
    const me = await gm.json('/api/admin/auth/me');
    assert(me?.user?.id && me.user.role === 'admin', 'GM did not authenticate as admin.');
    await ensureNoExistingCombat(gm);
    await registerPlayer(player);
    const character = await createCharacter(player);
    const { scene } = await createScenarioScene(gm);
    const { mapTemplate, objectDefinition } = await createMapAndObject(gm, scene.id);
    const event = await createStoryEvent(gm, scene.id, objectDefinition.id);
    const runtime = await createRuntime(gm, scene.id, character.id, objectDefinition.id);
    mapInstanceId = runtime.mapInstanceId;
    const verification = await exercise({
      gm,
      player,
      characterId: character.id,
      mapInstanceId,
      runtimeObject: runtime.runtimeObject,
      event,
      objectDefinition,
      mapTemplateId: mapTemplate.id
    });
    const archivedScenarioId = await closeAndArchive(gm, mapInstanceId);
    console.log(JSON.stringify({
      ok: true,
      suite: 'production-alpha-story-interact-object',
      startedAt,
      finishedAt: new Date().toISOString(),
      runId: RUN_ID,
      characterId: character.id,
      mapInstanceId,
      storyEventId: event.id,
      archivedScenarioId,
      ...verification
    }, null, 2));
  } catch (error) {
    await bestEffortFailureCleanup(gm, mapInstanceId);
    throw error;
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    suite: 'production-alpha-story-interact-object',
    runId: RUN_ID,
    status: error?.status || null,
    code: error?.code || null,
    message: error?.message || String(error)
  }, null, 2));
  process.exitCode = 1;
});
