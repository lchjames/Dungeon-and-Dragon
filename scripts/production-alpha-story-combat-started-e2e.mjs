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

const RUN_ID = `alpha-combat-start-${stamp()}`.slice(0, 42);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const ENCOUNTER_A_NAME = `${RUN_ID}-A`.slice(0, 120);
const ENCOUNTER_B_NAME = `${RUN_ID}-B`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const ACTIVATE_EVENT_NAME = `${RUN_ID}-activate-A`.slice(0, 120);
const COMBAT_EVENT_NAME = `${RUN_ID}-combat-A`.slice(0, 120);
const B_EVENT_NAME = `${RUN_ID}-B-activated`.slice(0, 120);
const MONSTER_SKILL_NAME = `${RUN_ID}-skill`.slice(0, 120);
const MONSTER_TEMPLATE_NAME = `${RUN_ID}-template`.slice(0, 120);
const MONSTER_INSTANCE_NAME = `${RUN_ID}-mob`.slice(0, 120);
const MONSTER_SPAWN_ID = `spawn_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_monster`.slice(0, 120);
const COMBAT_FLAG = `alpha.${RUN_ID.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.combat`.slice(0, 80);
const B_FLAG = `alpha.${RUN_ID.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.b`.slice(0, 80);
const COMBAT_NARRATIVE = `${RUN_ID}: Runtime Combat started.`;
const B_NARRATIVE = `${RUN_ID}: Encounter B activated from combat_started.`;

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

function findEncounter(story, name) {
  for (const scenario of story?.scenarios || []) {
    for (const scene of scenario.scenes || []) {
      const encounter = (scene.encounters || []).find(item => item.name === name);
      if (encounter) return { scenario, scene, encounter };
    }
  }
  throw new Error(`Unable to find Encounter: ${name}`);
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
    throw new Error(`Refusing combat_started E2E write: active Combat exists (${state.combat.id}).`);
  }
}

async function createPlayerCharacter(player) {
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
  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name: CHARACTER_NAME, summary: 'combat_started Story production E2E Character', draftId: roll?.draft?.id }
  });
  const characterId = created?.character?.id;
  assert(characterId, 'Character creation did not return a Character ID.');
  const detail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/creation-skills`, {
    method: 'PATCH',
    body: { allocations: buildAllocations(detail?.character?.skills, Number(detail?.character?.progression?.creationSkillPointsTotal || 200)) }
  });
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/finalize-creation`, { method: 'POST', body: {} });
  const finalDetail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  assert(finalDetail?.character?.status === 'active', 'combat_started Character did not become active.');
  return { user: me.user, character: finalDetail.character };
}

async function createStory(gm, characterId) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'combat_started Story production E2E' }
  });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, {
    method: 'POST', body: { name: SCENE_NAME }
  });
  story = await gm.json('/api/gm/story');
  const refreshedScenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  const scene = findNamed(refreshedScenario?.scenes, SCENE_NAME, 'Scene');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(scene.id)}/encounters`, {
    method: 'POST', body: { name: ENCOUNTER_A_NAME, status: 'planned' }
  });
  await gm.json(`/api/gm/scenes/${encodeURIComponent(scene.id)}/encounters`, {
    method: 'POST', body: { name: ENCOUNTER_B_NAME, status: 'planned' }
  });
  story = await gm.json('/api/gm/story');
  const encounterA = findEncounter(story, ENCOUNTER_A_NAME).encounter;
  const encounterB = findEncounter(story, ENCOUNTER_B_NAME).encounter;
  await gm.json(`/api/gm/encounters/${encodeURIComponent(encounterA.id)}/participants`, {
    method: 'PUT', body: { characterIds: [characterId] }
  });
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
    method: 'POST', body: { name: LOCATION_NAME, description: 'combat_started E2E Location', gmNotes: RUN_ID }
  });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'World Location');
  await gm.json('/api/gm/world/maps', {
    method: 'POST', body: { locationId: location.id, name: MAP_NAME, width: 2, height: 1, backgroundAssetRef: '', gmNotes: RUN_ID }
  });
  world = await gm.json('/api/gm/world-maps');
  const mapTemplate = findNamed(world?.mapTemplates, MAP_NAME, 'Map Template');
  const editor = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/editor`);
  const saved = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/editor`, {
    method: 'PUT',
    body: {
      expectedVersion: editor.mapTemplate.version,
      cells: [],
      edges: [],
      zones: [],
      spawnPoints: [{
        id: MONSTER_SPAWN_ID,
        name: `${RUN_ID} Monster Spawn`,
        x: 1,
        y: 0,
        spawnType: 'monster',
        gmNotes: RUN_ID
      }]
    }
  });
  assert(saved?.counts?.spawnPoints === 1, 'Monster Spawn Point was not saved.');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return mapTemplate;
}

async function createStoryEvents(gm, sceneId, encounterAId, encounterBId) {
  const activate = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: ACTIVATE_EVENT_NAME,
      status: 'active',
      triggerType: 'manual',
      trigger: {},
      conditions: [
        { type: 'event_not_fired' },
        { type: 'encounter_status', encounterId: encounterAId, status: 'planned' }
      ],
      effects: [{ type: 'activate_encounter', encounterId: encounterAId }],
      oncePerSceneRun: true
    }
  });
  const combat = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: COMBAT_EVENT_NAME,
      status: 'active',
      triggerType: 'combat_started',
      trigger: { encounterId: encounterAId, ignoredByCanonicalNormalizer: true },
      conditions: [
        { type: 'event_not_fired' },
        { type: 'encounter_status', encounterId: encounterAId, status: 'active' }
      ],
      effects: [
        { type: 'show_narrative', text: COMBAT_NARRATIVE },
        { type: 'set_flag', key: COMBAT_FLAG, value: true },
        { type: 'activate_encounter', encounterId: encounterBId }
      ],
      oncePerSceneRun: true
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
      oncePerSceneRun: true
    }
  });
  assert(activate?.event?.id && combat?.event?.id && b?.event?.id, 'combat_started lifecycle Story Events were not created.');
  assert(JSON.stringify(combat.event.trigger) === JSON.stringify({ encounterId: encounterAId }), 'combat_started trigger was not canonicalized to encounterId only.');
  return { activate: activate.event, combat: combat.event, b: b.event };
}

async function createMonsterTemplate(gm) {
  await gm.json('/api/gm/monster-skills', {
    method: 'POST',
    body: {
      name: MONSTER_SKILL_NAME,
      storedAccuracy: 50,
      templateBaseDamage: 1,
      damageGrowthWeight: 0,
      damageType: 'physical',
      rangeText: 'melee',
      targetingText: 'single target',
      mpCost: 0,
      damageAttributeLinks: []
    }
  });
  let state = await gm.json('/api/gm/monsters');
  const skill = findNamed(state?.skills, MONSTER_SKILL_NAME, 'Monster Skill');
  const attributes = {};
  for (const key of ['STR', 'DEX', 'CON', 'POW', 'INT', 'SIZ']) attributes[key] = { min: 10, max: 10, growthWeight: 0 };
  await gm.json('/api/gm/monster-templates', {
    method: 'POST', body: { name: MONSTER_TEMPLATE_NAME, summary: 'combat_started E2E Monster', attributes }
  });
  state = await gm.json('/api/gm/monsters');
  const template = findNamed(state?.templates, MONSTER_TEMPLATE_NAME, 'Monster Template');
  await gm.json(`/api/gm/monster-templates/${encodeURIComponent(template.id)}/skills`, {
    method: 'PUT', body: { skillIds: [skill.id] }
  });
  return template;
}

function runtimeEncounter(detail, encounterId) {
  return (detail?.runtimeEncounters || []).find(item => item.encounterId === encounterId) || null;
}

async function createRuntime(gm, sceneId, characterId) {
  const created = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label: `${RUN_ID} Runtime` }
  });
  const mapId = created?.mapInstance?.id;
  assert(mapId, 'Runtime Map was not created.');
  await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/entities/character/${encodeURIComponent(characterId)}/position`, {
    method: 'PUT', body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  return mapId;
}

async function exercise(gm, story, events, template, characterId, mapId) {
  const activated = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/story-events/${encodeURIComponent(events.activate.id)}/activate`, {
    method: 'POST', body: {}
  });
  const activationEffect = (activated.effectsApplied || []).find(item => item.type === 'activate_encounter');
  assert(activationEffect?.encounterId === story.encounterA.id && activationEffect?.unchanged === false, 'Manual activation did not activate Encounter A exactly once.');

  const spawned = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(story.encounterA.id)}/monsters`, {
    method: 'POST',
    body: {
      templateId: template.id,
      sourceSpawnPointId: MONSTER_SPAWN_ID,
      level: 1,
      displayName: MONSTER_INSTANCE_NAME
    }
  });
  assert(spawned?.monster?.id && spawned.position?.x === 1 && spawned.position?.y === 0, 'Fresh Runtime Monster did not spawn correctly.');

  const started = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(story.encounterA.id)}/start-combat`, {
    method: 'POST', body: {}
  });
  const combat = started?.combat;
  assert(combat?.id && combat.status === 'active', 'Direct GM Runtime Encounter Combat did not start.');
  assert(started?.runtimeEncounter?.combat?.combatId === combat.id, 'Runtime Encounter Combat link does not match started Combat.');
  assert((combat.combatants || []).some(item => item.entityType === 'character' && item.entityId === characterId), 'Started Combat is missing the Character participant.');
  assert((combat.combatants || []).some(item => item.entityType === 'monster_instance' && item.entityId === spawned.monster.id), 'Started Combat is missing the Runtime Monster participant.');

  const combatLifecycle = started.combatStartedStoryEvents || [];
  const encounterLifecycle = started.encounterActivatedStoryEvents || [];
  const allLifecycle = started.storyLifecycleEvents || [];
  const combatResult = combatLifecycle.find(item => item.eventId === events.combat.id);
  const bResult = encounterLifecycle.find(item => item.eventId === events.b.id);
  assert(combatResult?.status === 'applied' && combatResult.triggerType === 'combat_started', 'combat_started(A) Story Event did not apply.');
  assert(combatResult.combatId === combat.id && combatResult.encounterId === story.encounterA.id, 'combat_started result did not preserve Combat and Encounter identity.');
  assert(bResult?.status === 'applied' && bResult.triggerType === 'encounter_activated', 'combat_started → encounter_activated(B) cascade did not apply.');
  assert(allLifecycle.some(item => item.eventId === events.combat.id) && allLifecycle.some(item => item.eventId === events.b.id), 'Generic lifecycle response did not contain both cross-trigger results.');
  assert(!started.storyLifecycleWarning, `Unexpected Story lifecycle warning: ${started.storyLifecycleWarning?.code}.`);

  let detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  assert(runtimeEncounter(detail, story.encounterA.id)?.status === 'active', 'Runtime Encounter A is not active after Combat start.');
  assert(runtimeEncounter(detail, story.encounterB.id)?.status === 'active', 'Encounter B was not activated by combat_started cascade.');
  assert((detail.storyFlags || []).find(item => item.key === COMBAT_FLAG)?.value === true, 'combat_started Story flag did not persist.');
  assert((detail.storyFlags || []).find(item => item.key === B_FLAG)?.value === true, 'Encounter B cascade Story flag did not persist.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.combat.id && item.text === COMBAT_NARRATIVE).length === 1, 'combat_started narrative count is not exactly one.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.b.id && item.text === B_NARRATIVE).length === 1, 'Encounter B cascade narrative count is not exactly one.');

  const retry = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(story.encounterA.id)}/start-combat`, {
    method: 'POST', body: {}
  });
  assert(retry?.unchanged === true && retry?.combat?.id === combat.id, 'Retry start-combat did not return the existing Runtime Combat idempotently.');
  assert((retry.combatStartedStoryEvents || []).length === 0, 'Retry start-combat produced duplicate combat_started lifecycle results.');
  assert((retry.encounterActivatedStoryEvents || []).length === 0, 'Retry start-combat produced duplicate cascade lifecycle results.');
  assert((retry.storyLifecycleEvents || []).length === 0, 'Retry start-combat produced duplicate generic lifecycle results.');

  detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.combat.id && item.text === COMBAT_NARRATIVE).length === 1, 'combat_started narrative duplicated after idempotent retry.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.b.id && item.text === B_NARRATIVE).length === 1, 'Encounter B lifecycle narrative duplicated after idempotent retry.');

  const definitionStory = await gm.json('/api/gm/story');
  const defA = findEncounter(definitionStory, ENCOUNTER_A_NAME).encounter;
  const defB = findEncounter(definitionStory, ENCOUNTER_B_NAME).encounter;
  assert(defA.status === 'planned' && defB.status === 'planned', 'Runtime Combat lifecycle polluted Encounter Definition status.');
  assert(defA.combat === null && defB.combat === null, 'Runtime Combat lifecycle polluted legacy Definition Combat links.');
  assert((defA.participants || []).length === 1 && defA.participants[0]?.entityType === 'character', 'Runtime Combat lifecycle polluted Encounter A Definition roster.');
  assert((defB.participants || []).length === 0, 'Runtime Combat lifecycle polluted Encounter B Definition roster.');

  return { combat, monster: spawned.monster };
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
      gmNotes: `${scenario.gmNotes || ''}\ncombat_started Story E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function bestEffortCleanup(gm, mapId = '', combatId = '') {
  if (combatId) {
    await gm.request(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, {
      method: 'POST', body: {}, allow: [404, 409]
    }).catch(() => null);
  }
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
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing combat_started Story E2E.',
      writes: [
        'test Player and active Character',
        'Scenario / Scene / planned Encounter A + B Definitions',
        'Encounter A Character Definition roster',
        'World Location / 2x1 Map Template / Monster Spawn Point / Scene binding',
        'manual Story Event that activates Encounter A',
        'combat_started(A) Event with narrative + flag + activate Encounter B',
        'encounter_activated(B) cascade Event with narrative + flag',
        'Monster Skill / Template',
        'Scene Run / Runtime Map / Character position / fresh Runtime Monster',
        'direct GM Runtime Encounter start-combat and cross-trigger lifecycle drain',
        'idempotent start-combat retry with zero duplicate lifecycle Narrative / dispatch result',
        'Definition status / roster / legacy Combat isolation verification',
        'ended Combat / closed Runtime / archived Scenario'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const player = new Session('Player');
  const startedAt = new Date().toISOString();
  let mapId = '';
  let combatId = '';

  try {
    await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
    const gmMe = await gm.json('/api/admin/auth/me');
    assert(gmMe?.user?.role === 'admin', 'GM session did not authenticate as admin.');
    await ensureNoExistingCombat(gm);

    const playerState = await createPlayerCharacter(player);
    const story = await createStory(gm, playerState.character.id);
    const mapTemplate = await createMap(gm, story.scene.id);
    const events = await createStoryEvents(gm, story.scene.id, story.encounterA.id, story.encounterB.id);
    const template = await createMonsterTemplate(gm);
    mapId = await createRuntime(gm, story.scene.id, playerState.character.id);
    const result = await exercise(gm, story, events, template, playerState.character.id, mapId);
    combatId = result.combat.id;

    await gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, { method: 'POST', body: {} });
    const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/close`, {
      method: 'POST', body: { completeScenarioRun: true }
    });
    assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after combat_started E2E.');
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
      combatId,
      monsterId: result.monster.id,
      exercised: {
        canonicalCombatStartedEncounterTarget: true,
        databaseTriggerAuthorityBoundary: true,
        directRuntimeCombatStart: true,
        combatStartedDispatch: true,
        combatStartedToEncounterActivatedCascade: true,
        responseLifecycleGrouping: true,
        retryNoDuplicateCombatOccurrence: true,
        retryNoDuplicateNarrative: true,
        definitionStatusIsolation: true,
        definitionRosterIsolation: true,
        definitionCombatIsolation: true,
        combatEnded: true,
        runtimeClosed: true,
        scenarioArchived: true
      }
    }, null, 2));
  } catch (error) {
    await bestEffortCleanup(gm, mapId, combatId);
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
