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

const RUN_ID = `alpha-combat-end-${stamp()}`.slice(0, 42);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const ENCOUNTER_NAME = `${RUN_ID}-encounter`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const ACTIVATE_EVENT_NAME = `${RUN_ID}-activate`.slice(0, 120);
const COMBAT_ENDED_EVENT_NAME = `${RUN_ID}-combat-ended`.slice(0, 120);
const RESOLVED_EVENT_NAME = `${RUN_ID}-resolved`.slice(0, 120);
const MONSTER_SKILL_NAME = `${RUN_ID}-skill`.slice(0, 120);
const MONSTER_TEMPLATE_NAME = `${RUN_ID}-template`.slice(0, 120);
const MONSTER_INSTANCE_NAME = `${RUN_ID}-mob`.slice(0, 120);
const MONSTER_SPAWN_ID = `spawn_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_monster`.slice(0, 120);
const FLAG_PREFIX = `alpha.${RUN_ID.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}`.slice(0, 60);
const COMBAT_ENDED_FLAG = `${FLAG_PREFIX}.combat-ended`.slice(0, 80);
const RESOLVED_FLAG = `${FLAG_PREFIX}.resolved`.slice(0, 80);
const COMBAT_ENDED_NARRATIVE = `${RUN_ID}: Combat ended while Encounter remained active.`;
const RESOLVED_NARRATIVE = `${RUN_ID}: Encounter resolved after combat_ended Story.`;

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
    throw new Error(`Refusing combat_ended E2E write: active Combat exists (${state.combat.id}).`);
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
    body: { name: CHARACTER_NAME, summary: 'combat_ended Story production E2E Character', draftId: roll?.draft?.id }
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
  assert(finalDetail?.character?.status === 'active', 'combat_ended Character did not become active.');
  return finalDetail.character;
}

async function createStory(gm, characterId) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'combat_ended Story production E2E' }
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
    method: 'POST', body: { name: ENCOUNTER_NAME, status: 'planned' }
  });
  story = await gm.json('/api/gm/story');
  const encounter = findEncounter(story, ENCOUNTER_NAME).encounter;
  await gm.json(`/api/gm/encounters/${encodeURIComponent(encounter.id)}/participants`, {
    method: 'PUT', body: { characterIds: [characterId] }
  });
  story = await gm.json('/api/gm/story');
  return {
    scenario: findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario'),
    scene,
    encounter: findEncounter(story, ENCOUNTER_NAME).encounter
  };
}

async function createMap(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'combat_ended E2E Location', gmNotes: RUN_ID }
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

async function createStoryEvents(gm, sceneId, encounterId) {
  const activate = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: ACTIVATE_EVENT_NAME,
      status: 'active',
      triggerType: 'manual',
      trigger: {},
      conditions: [
        { type: 'event_not_fired' },
        { type: 'encounter_status', encounterId, status: 'planned' }
      ],
      effects: [{ type: 'activate_encounter', encounterId }],
      oncePerSceneRun: true
    }
  });

  const combatEnded = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: COMBAT_ENDED_EVENT_NAME,
      status: 'active',
      triggerType: 'combat_ended',
      trigger: { encounterId, ignoredByCanonicalNormalizer: true },
      conditions: [
        { type: 'event_not_fired' },
        { type: 'encounter_status', encounterId, status: 'active' }
      ],
      effects: [
        { type: 'show_narrative', text: COMBAT_ENDED_NARRATIVE },
        { type: 'set_flag', key: COMBAT_ENDED_FLAG, value: true }
      ],
      oncePerSceneRun: true
    }
  });

  const resolved = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: RESOLVED_EVENT_NAME,
      status: 'active',
      triggerType: 'encounter_resolved',
      trigger: { encounterId },
      conditions: [
        { type: 'event_not_fired' },
        { type: 'encounter_status', encounterId, status: 'resolved' }
      ],
      effects: [
        { type: 'show_narrative', text: RESOLVED_NARRATIVE },
        { type: 'set_flag', key: RESOLVED_FLAG, value: true }
      ],
      oncePerSceneRun: true
    }
  });

  assert(activate?.event?.id && combatEnded?.event?.id && resolved?.event?.id, 'combat_ended Story Events were not created.');
  assert(JSON.stringify(combatEnded.event.trigger) === JSON.stringify({ encounterId }), 'combat_ended trigger was not canonicalized to encounterId only.');
  return { activate: activate.event, combatEnded: combatEnded.event, resolved: resolved.event };
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
    method: 'POST', body: { name: MONSTER_TEMPLATE_NAME, summary: 'combat_ended E2E Monster', attributes }
  });
  state = await gm.json('/api/gm/monsters');
  const template = findNamed(state?.templates, MONSTER_TEMPLATE_NAME, 'Monster Template');
  await gm.json(`/api/gm/monster-templates/${encodeURIComponent(template.id)}/skills`, {
    method: 'PUT', body: { skillIds: [skill.id] }
  });
  return template;
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

async function runtimeDetail(gm, mapId) {
  return gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
}

async function exercise(gm, story, events, template, characterId, mapId) {
  const activated = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/story-events/${encodeURIComponent(events.activate.id)}/activate`, {
    method: 'POST', body: {}
  });
  const activationEffect = (activated.effectsApplied || []).find(item => item.type === 'activate_encounter');
  assert(activationEffect?.encounterId === story.encounter.id && activationEffect?.unchanged === false, 'Manual activation did not activate the Runtime Encounter exactly once.');

  const spawned = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(story.encounter.id)}/monsters`, {
    method: 'POST',
    body: {
      templateId: template.id,
      sourceSpawnPointId: MONSTER_SPAWN_ID,
      level: 1,
      displayName: MONSTER_INSTANCE_NAME
    }
  });
  assert(spawned?.monster?.id && spawned.position?.x === 1 && spawned.position?.y === 0, 'Fresh Runtime Monster did not spawn correctly.');

  const started = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(story.encounter.id)}/start-combat`, {
    method: 'POST', body: {}
  });
  const combat = started?.combat;
  assert(combat?.id && combat.status === 'active', 'Runtime Encounter Combat did not start.');
  assert((combat.combatants || []).some(item => item.entityType === 'character' && item.entityId === characterId), 'Started Combat is missing the Character participant.');
  assert((combat.combatants || []).some(item => item.entityType === 'monster_instance' && item.entityId === spawned.monster.id), 'Started Combat is missing the Runtime Monster participant.');

  await gm.json(`/api/gm/monster-instances/${encodeURIComponent(spawned.monster.id)}/resources`, {
    method: 'PATCH', body: { currentHp: 0 }
  });
  const monsterState = await gm.json('/api/gm/monsters');
  const stored = (monsterState?.instances || []).find(item => item.id === spawned.monster.id);
  assert(stored?.status === 'defeated', 'GM HP correction did not reconcile Runtime Monster to defeated before Combat End.');

  const beforeEnd = await runtimeDetail(gm, mapId);
  const beforeEncounter = (beforeEnd.runtimeEncounters || []).find(item => item.encounterId === story.encounter.id);
  assert(beforeEncounter?.status === 'active', 'Runtime Encounter must still be active immediately before Combat End.');
  assert(beforeEncounter?.resolution?.readiness?.cleared === true, 'Defeated hostile should make auto-resolution readiness cleared before End Combat.');

  const ended = await gm.json(`/api/gm/combat/${encodeURIComponent(combat.id)}/end`, { method: 'POST', body: {} });
  assert(ended?.combat?.status === 'ended', 'Combat End did not commit ended state.');

  const combatEndedResult = (ended.combatEndedStoryEvents || []).find(item => item.eventId === events.combatEnded.id);
  assert(combatEndedResult?.status === 'applied', 'combat_ended Story Event did not apply.');
  assert(combatEndedResult?.triggerType === 'combat_ended', 'combat_ended result has the wrong trigger type.');
  assert(combatEndedResult?.combatId === combat.id, 'combat_ended result did not preserve exact Combat identity.');
  assert(combatEndedResult?.encounterId === story.encounter.id, 'combat_ended result did not preserve Encounter identity.');
  assert((ended.storyLifecycleEvents || []).some(item => item.eventId === events.combatEnded.id && item.triggerType === 'combat_ended'), 'Generic lifecycle response omitted the combat_ended result.');
  assert(!ended.storyLifecycleWarning, `Unexpected combat_ended lifecycle warning: ${ended.storyLifecycleWarning?.code}.`);

  assert(ended?.runtimeEncounterResolution?.resolved === true, 'Cleared-hostile Combat End did not auto-resolve the Runtime Encounter.');
  assert(ended?.runtimeEncounterResolution?.changed === true, 'Auto-resolution did not report active→resolved transition.');
  assert(ended?.runtimeEncounterResolution?.resolutionLog?.source === 'combat_hostiles_cleared', 'Auto-resolution audit source is incorrect.');
  const resolvedResult = (ended.storyEventsTriggered || []).find(item => item.eventId === events.resolved.id && item.status === 'applied');
  assert(resolvedResult, 'encounter_resolved Story Event did not apply after combat_ended Story.');

  let detail = await runtimeDetail(gm, mapId);
  const runtimeEncounter = (detail.runtimeEncounters || []).find(item => item.encounterId === story.encounter.id);
  assert(runtimeEncounter?.status === 'resolved', 'Runtime Encounter did not persist resolved after Combat End.');
  assert(runtimeEncounter?.resolution?.latest?.source === 'combat_hostiles_cleared', 'Runtime detail does not expose auto-resolution audit.');
  assert((detail.storyFlags || []).find(item => item.key === COMBAT_ENDED_FLAG)?.value === true, 'combat_ended Story flag did not persist.');
  assert((detail.storyFlags || []).find(item => item.key === RESOLVED_FLAG)?.value === true, 'encounter_resolved Story flag did not persist.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.combatEnded.id && item.text === COMBAT_ENDED_NARRATIVE).length === 1, 'combat_ended narrative count is not exactly one.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.resolved.id && item.text === RESOLVED_NARRATIVE).length === 1, 'encounter_resolved narrative count is not exactly one.');

  const retry = await gm.request(`/api/gm/combat/${encodeURIComponent(combat.id)}/end`, {
    method: 'POST', body: {}, allow: [409]
  });
  assert(retry.response.status === 409 && retry.payload?.error?.code === 'COMBAT_NOT_ACTIVE', 'Second End Combat was not rejected idempotently as already ended.');

  detail = await runtimeDetail(gm, mapId);
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.combatEnded.id && item.text === COMBAT_ENDED_NARRATIVE).length === 1, 'combat_ended narrative duplicated after End Combat retry.');
  assert((detail.storyNarratives || []).filter(item => item.storyEventId === events.resolved.id && item.text === RESOLVED_NARRATIVE).length === 1, 'encounter_resolved narrative duplicated after End Combat retry.');

  const definitionStory = await gm.json('/api/gm/story');
  const definition = findEncounter(definitionStory, ENCOUNTER_NAME).encounter;
  assert(definition.status === 'planned', 'Definition status was polluted by Runtime combat_ended/resolution flow.');
  assert(definition.combat === null, 'legacy Definition Combat was polluted by Runtime combat_ended/resolution flow.');
  assert((definition.participants || []).length === 1, 'Definition roster was polluted by Runtime combat_ended/resolution flow.');
  assert(definition.participants[0]?.entityType === 'character' && definition.participants[0]?.entityId === characterId, 'Definition roster is no longer Character-only.');

  return { combat, monster: spawned.monster, ended };
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
      gmNotes: `${scenario.gmNotes || ''}\ncombat_ended Story E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function bestEffortFailureCleanup(gm, mapId = '', combatId = '') {
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
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing combat_ended Story E2E.',
      writes: [
        'test Player and active Character',
        'Scenario / Scene / planned Encounter Definition with Character Definition roster',
        'World Location / 2x1 Map Template / Monster Spawn Point / Scene binding',
        'manual Story Event that activates the Runtime Encounter',
        'combat_ended Event requiring Encounter status active with narrative + flag',
        'encounter_resolved Event requiring Encounter status resolved with narrative + flag',
        'Monster Skill / Template',
        'Scene Run / Runtime Map / Character position / fresh Runtime Monster',
        'Runtime Combat start and authoritative Runtime Monster defeat before End Combat',
        'Combat End → combat_ended Story → auto-resolution → encounter_resolved Story ordering proof',
        'End Combat retry idempotency with zero duplicate narratives',
        'Definition status / Definition roster / legacy Definition Combat isolation verification',
        'closed Runtime / archived Scenario'
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

    const character = await createPlayerCharacter(player);
    const story = await createStory(gm, character.id);
    const mapTemplate = await createMap(gm, story.scene.id);
    const events = await createStoryEvents(gm, story.scene.id, story.encounter.id);
    const template = await createMonsterTemplate(gm);
    mapId = await createRuntime(gm, story.scene.id, character.id);
    const result = await exercise(gm, story, events, template, character.id, mapId);
    combatId = result.combat.id;

    const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/close`, {
      method: 'POST', body: { completeScenarioRun: true }
    });
    assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after combat_ended E2E.');
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
      combatId,
      monsterId: result.monster.id,
      exercised: {
        canonicalCombatEndedEncounterTarget: true,
        authoritativeCombatEndAudit: true,
        exactCombatOccurrenceIdentity: true,
        combatEndedBeforeResolutionOrdering: true,
        combatEndedEncounterStillActiveCondition: true,
        combatEndedLifecycleDispatch: true,
        combatEndAutoResolution: true,
        encounterResolvedAfterCombatEnded: true,
        responseLifecycleGrouping: true,
        endRetryRejected: true,
        noDuplicateCombatEndedNarrative: true,
        noDuplicateResolvedNarrative: true,
        definitionStatusIsolation: true,
        definitionRosterIsolation: true,
        definitionCombatIsolation: true,
        runtimeClosed: true,
        scenarioArchived: true
      }
    }, null, 2));
  } catch (error) {
    await bestEffortFailureCleanup(gm, mapId, combatId);
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
