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

const RUN_ID = `alpha-resolve-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const AUTO_ENCOUNTER_NAME = `${RUN_ID}-auto`.slice(0, 120);
const MANUAL_ENCOUNTER_NAME = `${RUN_ID}-manual`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const AUTO_EVENT_NAME = `${RUN_ID}-activate-auto`.slice(0, 120);
const MANUAL_EVENT_NAME = `${RUN_ID}-activate-manual`.slice(0, 120);
const RESOLVED_EVENT_NAME = `${RUN_ID}-resolved-auto`.slice(0, 120);
const MONSTER_SKILL_NAME = `${RUN_ID}-skill`.slice(0, 120);
const MONSTER_TEMPLATE_NAME = `${RUN_ID}-template`.slice(0, 120);
const AUTO_MONSTER_NAME = `${RUN_ID}-auto-mob`.slice(0, 120);
const MANUAL_MONSTER_NAME = `${RUN_ID}-manual-mob`.slice(0, 120);
const AUTO_SPAWN_ID = `spawn_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_auto`.slice(0, 120);
const MANUAL_SPAWN_ID = `spawn_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_manual`.slice(0, 120);
const RESOLVED_FLAG_KEY = `resolution.${RUN_ID.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.auto`.slice(0, 80);
const RESOLVED_NARRATIVE = `Runtime Encounter auto-resolution passed: ${RUN_ID}`;

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
    throw new Error(`Refusing Runtime Resolution E2E write: active Combat exists (${state.combat.id}).`);
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
    method: 'POST', body: { name: CHARACTER_NAME, summary: 'Runtime Resolution production E2E Character', draftId: roll?.draft?.id }
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
  assert(finalDetail?.character?.status === 'active', 'Runtime Resolution Character did not become active.');
  return finalDetail.character;
}

async function createStory(gm, characterId) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Runtime Encounter resolution production E2E' }
  });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, {
    method: 'POST', body: { name: SCENE_NAME }
  });
  story = await gm.json('/api/gm/story');
  const refreshedScenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  const scene = findNamed(refreshedScenario?.scenes, SCENE_NAME, 'Scene');

  for (const name of [AUTO_ENCOUNTER_NAME, MANUAL_ENCOUNTER_NAME]) {
    await gm.json(`/api/gm/scenes/${encodeURIComponent(scene.id)}/encounters`, {
      method: 'POST', body: { name, status: 'planned' }
    });
    story = await gm.json('/api/gm/story');
    const encounter = findEncounter(story, name).encounter;
    await gm.json(`/api/gm/encounters/${encodeURIComponent(encounter.id)}/participants`, {
      method: 'PUT', body: { characterIds: [characterId] }
    });
  }

  story = await gm.json('/api/gm/story');
  return {
    scenario: findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario'),
    scene,
    autoEncounter: findEncounter(story, AUTO_ENCOUNTER_NAME).encounter,
    manualEncounter: findEncounter(story, MANUAL_ENCOUNTER_NAME).encounter
  };
}

async function createMap(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'Runtime Resolution production E2E Location', gmNotes: RUN_ID }
  });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'World Location');
  await gm.json('/api/gm/world/maps', {
    method: 'POST', body: { locationId: location.id, name: MAP_NAME, width: 3, height: 1, backgroundAssetRef: '', gmNotes: RUN_ID }
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
      spawnPoints: [
        { id: AUTO_SPAWN_ID, name: `${RUN_ID} Auto Spawn`, x: 1, y: 0, spawnType: 'monster', gmNotes: RUN_ID },
        { id: MANUAL_SPAWN_ID, name: `${RUN_ID} Manual Spawn`, x: 2, y: 0, spawnType: 'monster', gmNotes: RUN_ID }
      ]
    }
  });
  assert(saved?.counts?.spawnPoints === 2, 'Both Monster Spawn Points were not saved.');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return mapTemplate;
}

async function createActivationEvent(gm, sceneId, encounterId, name) {
  const payload = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name,
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
  assert(payload?.event?.id, `Activation Story Event was not created: ${name}`);
  return payload.event;
}

async function createResolvedEvent(gm, sceneId, encounterId) {
  const payload = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
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
        { type: 'set_flag', key: RESOLVED_FLAG_KEY, value: true },
        { type: 'show_narrative', text: RESOLVED_NARRATIVE }
      ],
      oncePerSceneRun: true
    }
  });
  assert(payload?.event?.id, 'encounter_resolved Story Event was not created.');
  return payload.event;
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
    method: 'POST', body: { name: MONSTER_TEMPLATE_NAME, summary: 'Runtime Resolution E2E Monster', attributes }
  });
  state = await gm.json('/api/gm/monsters');
  const template = findNamed(state?.templates, MONSTER_TEMPLATE_NAME, 'Monster Template');
  await gm.json(`/api/gm/monster-templates/${encodeURIComponent(template.id)}/skills`, {
    method: 'PUT', body: { skillIds: [skill.id] }
  });
  return template;
}

async function createRuntime(gm, sceneId, characterId) {
  const payload = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label: `${RUN_ID} Runtime` }
  });
  const mapId = payload?.mapInstance?.id;
  assert(mapId, 'Runtime Map was not created.');
  await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/entities/character/${encodeURIComponent(characterId)}/position`, {
    method: 'PUT', body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  return mapId;
}

async function activate(gm, mapId, eventId) {
  const payload = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/story-events/${encodeURIComponent(eventId)}/activate`, {
    method: 'POST', body: {}
  });
  assert(payload?.ok, 'Runtime Encounter activation failed.');
}

async function spawnAndStart(gm, { mapId, encounterId, templateId, spawnPointId, displayName }) {
  const spawned = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(encounterId)}/monsters`, {
    method: 'POST', body: { templateId, sourceSpawnPointId: spawnPointId, level: 1, displayName }
  });
  assert(spawned?.monster?.id, `Runtime Monster spawn failed: ${displayName}`);
  const started = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(encounterId)}/start-combat`, {
    method: 'POST', body: {}
  });
  assert(started?.combat?.id && started.combat.status === 'active', `Runtime Combat did not start: ${displayName}`);
  return { monster: spawned.monster, combat: started.combat };
}

async function runtimeEncounter(gm, mapId, encounterId) {
  const detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  const encounter = (detail?.runtimeEncounters || []).find(item => item.encounterId === encounterId);
  assert(encounter, `Runtime Encounter not found: ${encounterId}`);
  return { detail, encounter };
}

async function exerciseAutoResolution(gm, { mapId, encounterId, activationEventId, resolvedEventId, templateId }) {
  await activate(gm, mapId, activationEventId);
  const { monster, combat } = await spawnAndStart(gm, {
    mapId, encounterId, templateId, spawnPointId: AUTO_SPAWN_ID, displayName: AUTO_MONSTER_NAME
  });

  await gm.json(`/api/gm/monster-instances/${encodeURIComponent(monster.id)}/resources`, {
    method: 'PATCH', body: { currentHp: 0 }
  });
  const monsterState = await gm.json('/api/gm/monsters');
  const stored = (monsterState?.instances || []).find(item => item.id === monster.id);
  assert(stored?.status === 'defeated', 'GM HP correction did not reconcile Runtime Monster to defeated before Combat end.');

  const ended = await gm.json(`/api/gm/combat/${encodeURIComponent(combat.id)}/end`, { method: 'POST', body: {} });
  assert(ended?.combat?.status === 'ended', 'Auto-resolution Combat did not end.');
  assert(ended?.runtimeEncounterResolution?.resolved === true, 'Cleared hostile Combat did not resolve its Runtime Encounter.');
  assert(ended?.runtimeEncounterResolution?.changed === true, 'Auto-resolution did not report the active→resolved transition.');
  assert(ended?.runtimeEncounterResolution?.resolutionLog?.source === 'combat_hostiles_cleared', 'Auto-resolution source audit is incorrect.');
  const applied = (ended?.storyEventsTriggered || []).find(item => item.eventId === resolvedEventId && item.status === 'applied');
  assert(applied, 'encounter_resolved Story Event was not applied after auto-resolution.');

  const { detail, encounter } = await runtimeEncounter(gm, mapId, encounterId);
  assert(encounter.status === 'resolved', 'Runtime Encounter did not persist resolved after cleared Combat end.');
  assert(encounter.resolution?.readiness?.cleared === true, 'Resolution readiness does not report cleared hostiles after auto-resolution.');
  assert(encounter.resolution?.latest?.source === 'combat_hostiles_cleared', 'Runtime detail does not expose the auto-resolution audit.');
  const flag = (detail.storyFlags || []).find(item => item.key === RESOLVED_FLAG_KEY);
  assert(flag?.value === true, 'encounter_resolved Story Event did not persist the expected Story flag.');
  const narrative = (detail.storyNarratives || []).find(item => item.storyEventId === resolvedEventId && item.text === RESOLVED_NARRATIVE);
  assert(narrative, 'encounter_resolved Story Event did not persist the expected narrative.');
  return { monster, combat, ended };
}

async function exerciseManualResolution(gm, { mapId, encounterId, activationEventId, templateId }) {
  await activate(gm, mapId, activationEventId);
  const { monster, combat } = await spawnAndStart(gm, {
    mapId, encounterId, templateId, spawnPointId: MANUAL_SPAWN_ID, displayName: MANUAL_MONSTER_NAME
  });

  const ended = await gm.json(`/api/gm/combat/${encodeURIComponent(combat.id)}/end`, { method: 'POST', body: {} });
  assert(ended?.combat?.status === 'ended', 'Manual-path Combat did not end.');
  assert(ended?.runtimeEncounterResolution?.resolved === false, 'Combat end incorrectly resolved an Encounter with an active hostile.');
  assert(ended?.runtimeEncounterResolution?.changed === false, 'Blocked auto-resolution incorrectly reported a state change.');
  assert(ended?.runtimeEncounterResolution?.reason === 'HOSTILES_REMAIN', 'Blocked auto-resolution did not report HOSTILES_REMAIN.');

  let state = await runtimeEncounter(gm, mapId, encounterId);
  assert(state.encounter.status === 'active', 'Combat end incorrectly changed the blocked Runtime Encounter status.');
  assert(state.encounter.resolution?.readiness?.blockerCount === 1, 'Manual-path Runtime Encounter should expose one active hostile blocker.');

  const resolved = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(encounterId)}/resolve`, {
    method: 'POST', body: {}
  });
  assert(resolved?.resolution?.resolved === true && resolved.resolution.changed === true, 'GM manual resolution did not transition the Runtime Encounter.');
  assert(resolved?.resolution?.resolutionLog?.source === 'gm_manual', 'GM manual resolution source audit is incorrect.');

  state = await runtimeEncounter(gm, mapId, encounterId);
  assert(state.encounter.status === 'resolved', 'GM manual resolution did not persist resolved state.');
  assert(state.encounter.resolution?.latest?.source === 'gm_manual', 'Runtime detail does not expose the manual resolution audit.');
  assert(state.encounter.resolution?.readiness?.blockerCount === 1, 'Manual resolution should preserve the factual hostile blocker snapshot/readiness state.');
  return { monster, combat, ended, resolved };
}

async function assertDefinitionIsolation(gm, characterId) {
  const story = await gm.json('/api/gm/story');
  for (const name of [AUTO_ENCOUNTER_NAME, MANUAL_ENCOUNTER_NAME]) {
    const definition = findEncounter(story, name).encounter;
    assert(definition.status === 'planned', `${name}: Runtime resolution polluted Encounter Definition status.`);
    assert(definition.combat === null, `${name}: Runtime resolution polluted legacy Definition Combat link.`);
    assert((definition.participants || []).length === 1, `${name}: Runtime resolution polluted Definition participant roster.`);
    assert(definition.participants[0]?.entityType === 'character' && definition.participants[0]?.entityId === characterId, `${name}: Definition roster is no longer Character-only.`);
  }
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
      gmNotes: `${scenario.gmNotes || ''}\nRuntime Encounter resolution E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function cleanupSuccess(gm, mapId) {
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after Runtime Resolution E2E.');
  return archiveScenario(gm);
}

async function bestEffortFailureCleanup(gm, { mapId = '', combatIds = [] } = {}) {
  if (!gm) return;
  for (const combatId of combatIds.filter(Boolean)) {
    await gm.request(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, { method: 'POST', body: {}, allow: [404, 409] }).catch(() => null);
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
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Runtime Encounter resolution E2E.',
      writes: [
        'test Player and active Character',
        'Scenario / Scene / two planned Encounter Definitions with Character-only rosters',
        '3x1 Map Template / two Monster Spawn Points / Scene binding',
        'two manual activate_encounter Story Events',
        'encounter_resolved Story Event with flag + narrative effects',
        'Monster Skill / Template',
        'Scene Run / Runtime Map / Character position',
        'auto path: Runtime Monster → Combat → defeated → End Combat → resolved → Story effects',
        'manual path: Runtime Monster active → End Combat remains active Encounter → GM Resolve Encounter',
        'Definition status / roster / legacy Combat isolation checks',
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
  const combatIds = [];

  try {
    await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
    const gmMe = await gm.json('/api/admin/auth/me');
    assert(gmMe?.user?.role === 'admin', 'GM session did not authenticate as admin.');
    await ensureNoExistingCombat(gm);

    const character = await createPlayerCharacter(player);
    const story = await createStory(gm, character.id);
    const mapTemplate = await createMap(gm, story.scene.id);
    const autoActivation = await createActivationEvent(gm, story.scene.id, story.autoEncounter.id, AUTO_EVENT_NAME);
    const manualActivation = await createActivationEvent(gm, story.scene.id, story.manualEncounter.id, MANUAL_EVENT_NAME);
    const resolvedEvent = await createResolvedEvent(gm, story.scene.id, story.autoEncounter.id);
    const template = await createMonsterTemplate(gm);
    mapId = await createRuntime(gm, story.scene.id, character.id);

    const initialDetail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
    const autoInitial = (initialDetail.runtimeEncounters || []).find(item => item.encounterId === story.autoEncounter.id);
    const manualInitial = (initialDetail.runtimeEncounters || []).find(item => item.encounterId === story.manualEncounter.id);
    assert(autoInitial?.status === 'planned' && manualInitial?.status === 'planned', 'Both Runtime Encounter snapshots must start planned.');
    assert(autoInitial?.resolution?.readiness && manualInitial?.resolution?.readiness, 'Runtime detail did not expose resolution readiness enrichment.');

    const auto = await exerciseAutoResolution(gm, {
      mapId,
      encounterId: story.autoEncounter.id,
      activationEventId: autoActivation.id,
      resolvedEventId: resolvedEvent.id,
      templateId: template.id
    });
    combatIds.push(auto.combat.id);

    const manual = await exerciseManualResolution(gm, {
      mapId,
      encounterId: story.manualEncounter.id,
      activationEventId: manualActivation.id,
      templateId: template.id
    });
    combatIds.push(manual.combat.id);

    await assertDefinitionIsolation(gm, character.id);
    const scenarioId = await cleanupSuccess(gm, mapId);

    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      scenarioId,
      sceneId: story.scene.id,
      mapTemplateId: mapTemplate.id,
      mapInstanceId: mapId,
      encounters: {
        auto: { id: story.autoEncounter.id, combatId: auto.combat.id, monsterId: auto.monster.id },
        manual: { id: story.manualEncounter.id, combatId: manual.combat.id, monsterId: manual.monster.id }
      },
      exercised: {
        autoHostileReadiness: true,
        combatEndAutoResolution: true,
        encounterResolvedStoryTrigger: true,
        postResolutionFlag: true,
        postResolutionNarrative: true,
        activeHostileBlocksAutoResolution: true,
        combatEndDoesNotImplyResolution: true,
        gmManualResolution: true,
        resolutionAudit: true,
        definitionStatusIsolation: true,
        definitionRosterIsolation: true,
        definitionCombatIsolation: true,
        runtimeClosed: true,
        scenarioArchived: true
      },
      note: 'The runner leaves clearly named alpha-resolve-* audit/test definitions in D1; Runtime and Scenario are closed/archived rather than hard-deleted.'
    }, null, 2));
  } catch (error) {
    await bestEffortFailureCleanup(gm, { mapId, combatIds });
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
    note: 'A failed Runtime Resolution live run may leave alpha-resolve-* audit/test data. Best-effort cleanup ends known Combats, closes the Runtime and archives the Scenario.'
  }, null, 2));
  process.exitCode = 1;
});
