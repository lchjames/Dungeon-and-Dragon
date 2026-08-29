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

const RUN_ID = `alpha-bossrt-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const ENCOUNTER_NAME = `${RUN_ID}-encounter`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const EVENT_NAME = `${RUN_ID}-activate`.slice(0, 120);
const BOSS_PROFILE_NAME = `${RUN_ID}-profile`.slice(0, 120);
const BOSS_SKILL_NAME = `${RUN_ID}-skill`.slice(0, 120);
const BOSS_INSTANCE_NAME = `${RUN_ID}-boss`.slice(0, 120);
const BOSS_SPAWN_ID = `spawn_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_boss`.slice(0, 120);

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
    throw new Error(`Refusing Runtime Boss E2E write: active Combat exists (${state.combat.id}).`);
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
    method: 'POST', body: { name: CHARACTER_NAME, summary: 'Runtime Boss production E2E Character', draftId: roll?.draft?.id }
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
  assert(finalDetail?.character?.status === 'active', 'Runtime Boss Character did not become active.');
  return { user: me.user, character: finalDetail.character };
}

async function createStory(gm, characterId) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Runtime Boss production E2E' }
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
  const located = findEncounter(story, ENCOUNTER_NAME);
  await gm.json(`/api/gm/encounters/${encodeURIComponent(located.encounter.id)}/participants`, {
    method: 'PUT', body: { characterIds: [characterId] }
  });
  return findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME);
}

async function createMap(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'Runtime Boss production E2E Location', gmNotes: RUN_ID }
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
        id: BOSS_SPAWN_ID,
        name: `${RUN_ID} Boss Spawn`,
        x: 1,
        y: 0,
        spawnType: 'boss',
        gmNotes: RUN_ID
      }]
    }
  });
  assert(saved?.counts?.spawnPoints === 1, 'Boss Spawn Point was not saved.');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return { location, mapTemplate };
}

async function createActivationEvent(gm, sceneId, encounterId) {
  const payload = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: EVENT_NAME,
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
  assert(payload?.event?.id, 'Activation Story Event was not created.');
  return payload.event;
}

async function createBossProfile(gm) {
  const naturalAttributes = {}, growthWeights = {}, attributeOverrides = {};
  for (const key of ['STR', 'DEX', 'CON', 'POW', 'INT', 'SIZ']) {
    naturalAttributes[key] = key === 'DEX' ? 18 : 10;
    growthWeights[key] = 0;
    attributeOverrides[key] = null;
  }
  await gm.json('/api/gm/boss-profiles', {
    method: 'POST',
    body: {
      name: BOSS_PROFILE_NAME,
      level: 1,
      summary: 'Runtime Boss production E2E Boss',
      gmNotes: RUN_ID,
      naturalAttributes,
      growthWeights,
      attributeOverrides,
      baselineStoredDefence: 0,
      storedDefenceOverride: null,
      baselineArmorName: '',
      baselineArmorDefence: 0,
      armorDefenceOverride: null,
      maxHpOverride: 20,
      maxMpOverride: 0
    }
  });
  let state = await gm.json('/api/gm/bosses');
  const profile = findNamed(state?.profiles, BOSS_PROFILE_NAME, 'Boss Profile');
  await gm.json(`/api/gm/boss-profiles/${encodeURIComponent(profile.id)}/unique-skills`, {
    method: 'POST',
    body: {
      name: BOSS_SKILL_NAME,
      storedAccuracy: 50,
      templateBaseDamage: 1,
      damageGrowthWeight: 0,
      damageType: 'physical',
      rangeText: 'melee',
      targetingText: 'single target',
      mpCost: 0,
      cooldownRounds: 0,
      damageAttributeLinks: []
    }
  });
  await gm.json(`/api/gm/boss-profiles/${encodeURIComponent(profile.id)}/phases`, {
    method: 'PUT',
    body: {
      phases: [
        { phaseNumber: 1, name: 'Opening', hpThresholdPercent: null, gmNotes: RUN_ID },
        { phaseNumber: 2, name: 'Pressure', hpThresholdPercent: 50, gmNotes: RUN_ID }
      ]
    }
  });
  state = await gm.json('/api/gm/bosses');
  const refreshed = findNamed(state?.profiles, BOSS_PROFILE_NAME, 'Boss Profile');
  assert(refreshed.status === 'active', 'Boss Profile did not remain active.');
  assert((refreshed.skillIds || []).length === 1, 'Boss Profile does not expose exactly one linked Skill after authoring.');
  assert((refreshed.phases || []).length === 2, 'Boss Profile does not expose both authored Phases.');
  return refreshed;
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

async function exerciseRuntimeBoss({ gm, mapId, encounterId, eventId, profileId, characterId }) {
  let detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  let runtimeEncounter = (detail?.runtimeEncounters || []).find(item => item.encounterId === encounterId);
  assert(runtimeEncounter?.status === 'planned', 'Runtime Encounter did not start from planned snapshot state.');
  assert((runtimeEncounter.participants || []).length === 1, 'Runtime Encounter did not snapshot exactly the Character participant.');
  assert(runtimeEncounter.participants[0]?.entityType === 'character' && runtimeEncounter.participants[0]?.entityId === characterId, 'Runtime Character roster snapshot is incorrect.');

  await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/story-events/${encodeURIComponent(eventId)}/activate`, {
    method: 'POST', body: {}
  });
  detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  runtimeEncounter = (detail?.runtimeEncounters || []).find(item => item.encounterId === encounterId);
  assert(runtimeEncounter?.status === 'active', 'Story activation did not activate Runtime Encounter.');

  const spawned = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(encounterId)}/bosses`, {
    method: 'POST',
    body: { profileId, sourceSpawnPointId: BOSS_SPAWN_ID, displayName: BOSS_INSTANCE_NAME }
  });
  const boss = spawned?.boss;
  assert(boss?.id && boss.displayName === BOSS_INSTANCE_NAME, 'Runtime Boss spawn did not return the fresh Boss Instance.');
  assert(boss.profileId === profileId, 'Runtime Boss spawn did not preserve Boss Profile provenance.');
  assert(spawned?.position?.entityType === 'boss_instance', 'Runtime Boss position has the wrong entity type.');
  assert(spawned?.position?.x === 1 && spawned?.position?.y === 0, 'Runtime Boss was not positioned on the Boss Spawn Point.');
  runtimeEncounter = spawned?.runtimeEncounter;
  const runtimeBossParticipant = (runtimeEncounter?.participants || []).find(item => item.entityType === 'boss_instance' && item.entityId === boss.id);
  assert(runtimeBossParticipant?.sourceKind === 'runtime_spawn', 'Fresh Boss was not added as runtime_spawn participant.');

  const bossState = await gm.json('/api/gm/bosses');
  const storedBoss = findNamed(bossState?.instances, BOSS_INSTANCE_NAME, 'Runtime-created Boss Instance');
  assert(storedBoss.id === boss.id, 'Boss overview did not expose the Runtime-created Boss Instance.');
  assert((storedBoss.skills || []).length === 1, 'Runtime-created Boss did not snapshot the authored Skill.');
  assert((storedBoss.phases || []).length === 2, 'Runtime-created Boss did not snapshot both authored Phases.');

  const definition = findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME).encounter;
  assert((definition.participants || []).length === 1, 'Runtime Boss polluted Definition Encounter participants.');
  assert(definition.participants[0]?.entityType === 'character', 'Definition Encounter roster no longer contains only its Character authoring participant.');
  assert(definition.combat === null, 'Runtime Boss spawn unexpectedly created a Definition Encounter Combat link.');
  assert(definition.status === 'planned', 'Runtime Boss spawn polluted Encounter Definition status.');

  const started = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(encounterId)}/start-combat`, {
    method: 'POST', body: {}
  });
  const combat = started?.combat;
  assert(combat?.id && combat.status === 'active', 'Runtime Encounter Boss Combat did not start.');
  const combatCharacter = (combat.combatants || []).find(item => item.entityType === 'character' && item.entityId === characterId);
  const combatBoss = (combat.combatants || []).find(item => item.entityType === 'boss_instance' && item.entityId === boss.id);
  assert(combatCharacter?.id, 'Runtime Boss Combat is missing the Character participant.');
  assert(combatBoss?.id, 'Runtime Boss Combat is missing the fresh Boss participant.');
  assert(Number(combatBoss.dex) === 18, `Runtime Boss Combat did not use Profile final DEX; got ${combatBoss?.dex}.`);
  assert(started?.runtimeEncounter?.combat?.combatId === combat.id, 'Runtime Encounter did not persist the Boss Combat link.');
  assert(started.runtimeEncounter.combat.mapInstanceId === mapId, 'Runtime Boss Combat link did not preserve the same Runtime Map ID.');

  const afterDefinition = findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME).encounter;
  assert(afterDefinition.combat === null, 'Runtime Boss Combat polluted legacy Definition encounter_combats.');
  assert(afterDefinition.status === 'planned', 'Runtime Boss Combat polluted Encounter Definition status.');
  assert((afterDefinition.participants || []).length === 1 && afterDefinition.participants[0]?.entityType === 'character', 'Runtime Boss Combat polluted Definition Encounter roster.');

  return { boss, combat, runtimeEncounter: started.runtimeEncounter };
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
      gmNotes: `${scenario.gmNotes || ''}\nRuntime Boss E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function cleanupSuccess(gm, mapId, combatId) {
  await gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, { method: 'POST', body: {} });
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after Runtime Boss E2E.');
  return archiveScenario(gm);
}

async function bestEffortFailureCleanup(gm, { mapId = '', combatId = '' } = {}) {
  if (!gm) return;
  if (combatId) {
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
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Runtime Boss E2E.',
      writes: [
        'test Player and active Character',
        'Scenario / Scene / planned Encounter with Character definition roster',
        'World Location / 2x1 Map Template / Boss Spawn Point / Scene binding',
        'manual activate_encounter Story Event',
        'Boss Design Profile / unique Skill / two Phases',
        'Scene Run / Runtime Map / Character position',
        'fresh Runtime Boss snapshot + Runtime participant + Runtime position',
        'Runtime Encounter Combat containing Character + Boss on the same Runtime Map',
        'verification that Definition roster/combat/status remain unchanged',
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
    const world = await createMap(gm, story.scene.id);
    const event = await createActivationEvent(gm, story.scene.id, story.encounter.id);
    const profile = await createBossProfile(gm);
    mapId = await createRuntime(gm, story.scene.id, playerState.character.id);
    const result = await exerciseRuntimeBoss({
      gm,
      mapId,
      encounterId: story.encounter.id,
      eventId: event.id,
      profileId: profile.id,
      characterId: playerState.character.id
    });
    combatId = result.combat.id;
    const scenarioId = await cleanupSuccess(gm, mapId, combatId);

    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      scenarioId,
      sceneId: story.scene.id,
      encounterId: story.encounter.id,
      mapTemplateId: world.mapTemplate.id,
      mapInstanceId: mapId,
      boss: { id: result.boss.id, name: result.boss.displayName, profileId: result.boss.profileId },
      combat: { id: result.combat.id, statusBeforeCleanup: result.combat.status },
      exercised: {
        runtimeEncounterActivation: true,
        freshRuntimeBoss: true,
        profileSkillPhaseSnapshot: true,
        stableBossSpawnPointPlacement: true,
        runtimeParticipantOnly: true,
        sameMapPosition: true,
        bossDexInitiative: true,
        runtimeCombatLink: true,
        definitionRosterIsolation: true,
        definitionCombatIsolation: true,
        definitionStatusIsolation: true,
        combatEnded: true,
        runtimeClosed: true,
        scenarioArchived: true
      },
      note: 'The runner leaves clearly named alpha-bossrt-* audit/test definitions in D1; Runtime and Scenario are closed/archived rather than hard-deleted.'
    }, null, 2));
  } catch (error) {
    await bestEffortFailureCleanup(gm, { mapId, combatId });
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
    note: 'A failed Runtime Boss live run may leave alpha-bossrt-* audit/test data. Best-effort cleanup ends its known Combat, closes its known Runtime, and archives its Scenario.'
  }, null, 2));
  process.exitCode = 1;
});
