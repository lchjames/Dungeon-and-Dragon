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

const RUN_ID = `alpha-story-combat-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const ENCOUNTER_NAME = `${RUN_ID}-encounter`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const EVENT_NAME = `${RUN_ID}-ambush`.slice(0, 120);
const MONSTER_SKILL_NAME = `${RUN_ID}-skill`.slice(0, 120);
const MONSTER_TEMPLATE_NAME = `${RUN_ID}-template`.slice(0, 120);
const MONSTER_INSTANCE_NAME = `${RUN_ID}-mob`.slice(0, 120);
const ZONE_ID = `zone_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_trigger`.slice(0, 120);
const ZONE_NAME = `${RUN_ID} Hidden Ambush`.slice(0, 120);
const MONSTER_SPAWN_ID = `spawn_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_monster`.slice(0, 120);

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
    throw new Error(`Refusing Story Combat E2E write: active Combat exists (${state.combat.id}).`);
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
  assert(roll?.draft?.id, 'Character creation roll did not return a Draft ID.');
  const created = await player.json('/api/player/characters', {
    method: 'POST', body: { name: CHARACTER_NAME, summary: 'Story Combat production E2E Character', draftId: roll.draft.id }
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
  assert(finalDetail?.character?.status === 'active', 'Story Combat Character did not become active.');
  return { user: me.user, character: finalDetail.character };
}

async function createStory(gm, characterId) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Story Runtime spawn + Combat production E2E' }
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
    method: 'POST', body: { name: ENCOUNTER_NAME, status: 'planned', triggerNotes: 'Runtime-only ambush E2E.' }
  });
  story = await gm.json('/api/gm/story');
  const located = findEncounter(story, ENCOUNTER_NAME);
  await gm.json(`/api/gm/encounters/${encodeURIComponent(located.encounter.id)}/participants`, {
    method: 'PUT', body: { characterIds: [characterId] }
  });
  const finalLocated = findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME);
  assert(finalLocated.encounter.status === 'planned', 'Encounter Definition did not remain planned before Runtime start.');
  assert((finalLocated.encounter.participants || []).length === 1, 'Definition Encounter did not contain exactly the Character authoring participant.');
  return finalLocated;
}

async function createMap(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'Story Combat production E2E Location', gmNotes: RUN_ID }
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
      zones: [{
        id: ZONE_ID,
        name: ZONE_NAME,
        zoneType: 'trigger',
        playerVisibleDefault: false,
        gmNotes: RUN_ID,
        cells: [{ x: 1, y: 0 }]
      }],
      spawnPoints: [{
        id: MONSTER_SPAWN_ID,
        name: `${RUN_ID} Monster Spawn`,
        x: 2,
        y: 0,
        spawnType: 'monster',
        gmNotes: RUN_ID
      }]
    }
  });
  assert(saved?.counts?.zones === 1 && saved?.counts?.zoneCells === 1, 'Hidden trigger Zone was not saved.');
  assert(saved?.counts?.spawnPoints === 1, 'Monster Spawn Point was not saved.');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return { location, mapTemplate };
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
    method: 'POST', body: { name: MONSTER_TEMPLATE_NAME, summary: 'Story Combat production E2E Monster', attributes }
  });
  state = await gm.json('/api/gm/monsters');
  const template = findNamed(state?.templates, MONSTER_TEMPLATE_NAME, 'Monster Template');
  await gm.json(`/api/gm/monster-templates/${encodeURIComponent(template.id)}/skills`, {
    method: 'PUT', body: { skillIds: [skill.id] }
  });
  return template;
}

async function createEvent(gm, sceneId, encounterId, templateId) {
  const payload = await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
    method: 'POST',
    body: {
      name: EVENT_NAME,
      status: 'active',
      triggerType: 'enter_zone',
      trigger: { sourceZoneId: ZONE_ID },
      conditions: [
        { type: 'event_not_fired' },
        { type: 'scene_run_status', status: 'active' },
        { type: 'encounter_status', encounterId, status: 'planned' }
      ],
      effects: [
        { type: 'activate_encounter', encounterId },
        {
          type: 'spawn_monster',
          encounterId,
          templateId,
          level: 1,
          sourceSpawnPointId: MONSTER_SPAWN_ID,
          displayName: MONSTER_INSTANCE_NAME
        },
        { type: 'start_combat', encounterId }
      ],
      oncePerSceneRun: true
    }
  });
  assert(payload?.event?.id, 'Story Combat Event creation did not return an Event ID.');
  assert(payload.event.effects?.map(effect => effect.type).join(',') === 'activate_encounter,spawn_monster,start_combat', 'Story Combat Event did not preserve effect order.');
  return payload.event;
}

async function createRuntime(gm, sceneId, encounterId, characterId) {
  const runtime = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label: `${RUN_ID} Story Combat Runtime` }
  });
  const mapId = runtime?.mapInstance?.id;
  assert(mapId, 'Scene Runtime did not return a Runtime Map ID.');
  const runtimeEncounter = (runtime?.runtimeEncounters || []).find(item => item.encounterId === encounterId);
  assert(runtimeEncounter?.status === 'planned', 'Runtime Encounter did not snapshot planned Definition status.');
  assert((runtimeEncounter?.participants || []).length === 1, 'Runtime Encounter did not snapshot exactly the Character participant.');
  await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/entities/character/${encodeURIComponent(characterId)}/position`, {
    method: 'PUT', body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  return mapId;
}

async function exercisePlayerTriggeredCombat({ gm, player, characterId, encounterId, eventId, mapId }) {
  const before = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}`);
  assert(before?.map?.id === mapId, 'Player world context did not expose the Runtime Map.');
  assert(before?.position?.x === 0 && before?.position?.y === 0, 'Player did not start at (0,0).');
  assert(!(before?.zones || []).some(zone => zone?.name === ZONE_NAME), 'Hidden trigger Zone leaked before entry.');
  assert((before?.legalMoves || []).some(move => move?.x === 1 && move?.y === 0), 'Trigger destination was not a legal Player Move.');

  const moved = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}/move`, {
    method: 'POST', body: { x: 1, y: 0 }
  });
  assert(moved?.movement?.to?.x === 1 && moved?.movement?.to?.y === 0, 'Player Move did not commit to the trigger cell.');
  const trigger = (moved?.storyEventsTriggered || []).find(item => item?.eventId === eventId);
  assert(trigger?.status === 'applied', `Story Combat Event did not apply; status=${trigger?.status || 'missing'} code=${trigger?.code || ''}.`);
  assert(trigger?.sourceZoneId === ZONE_ID, 'Story Combat Event fired from the wrong Zone.');
  assert(Array.isArray(trigger.effectsApplied) && trigger.effectsApplied.length === 3, 'Story Combat Event did not apply exactly three ordered effects.');
  assert(trigger.effectsApplied.map(effect => effect.type).join(',') === 'activate_encounter,spawn_monster,start_combat', 'Story Combat effects executed in the wrong order.');

  const activated = trigger.effectsApplied[0];
  const spawned = trigger.effectsApplied[1];
  const started = trigger.effectsApplied[2];
  assert(activated?.encounterId === encounterId && activated?.status === 'active', 'activate_encounter did not activate the Runtime Encounter.');
  assert(spawned?.monsterId && spawned?.sourceSpawnPointId === MONSTER_SPAWN_ID, 'spawn_monster did not return Runtime Monster provenance.');
  assert(spawned?.x === 2 && spawned?.y === 0, 'spawn_monster did not place the Monster at (2,0).');
  assert(started?.combatId && started?.mapInstanceId === mapId, 'start_combat did not return the same Runtime Map Combat link.');

  const detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
  const runtimeEncounter = (detail?.runtimeEncounters || []).find(item => item.encounterId === encounterId);
  assert(runtimeEncounter?.status === 'active', 'Runtime Encounter is not active after automatic Story execution.');
  assert(runtimeEncounter?.combat?.combatId === started.combatId, 'Runtime Encounter Combat link does not match Story effect result.');
  assert(runtimeEncounter?.combat?.mapInstanceId === mapId, 'Runtime Encounter Combat link lost the active Runtime Map.');
  const characterParticipant = (runtimeEncounter?.participants || []).find(item => item.entityType === 'character' && item.entityId === characterId);
  const monsterParticipant = (runtimeEncounter?.participants || []).find(item => item.entityType === 'monster_instance' && item.entityId === spawned.monsterId);
  assert(characterParticipant?.id, 'Runtime Encounter lost its Character participant.');
  assert(monsterParticipant?.sourceKind === 'runtime_spawn', 'Automatic Story Monster is not a runtime_spawn participant.');

  const characterPosition = (detail?.positions || []).find(item => item.entityType === 'character' && item.entityId === characterId);
  const monsterPosition = (detail?.positions || []).find(item => item.entityType === 'monster_instance' && item.entityId === spawned.monsterId);
  assert(characterPosition?.x === 1 && characterPosition?.y === 0, 'Combat did not preserve the Player position on the trigger cell.');
  assert(monsterPosition?.x === 2 && monsterPosition?.y === 0, 'Combat did not preserve the Monster Runtime Spawn position.');

  const combatState = await gm.json('/api/gm/combat');
  assert(combatState?.combat?.id === started.combatId && combatState.combat.status === 'active', 'Global Combat state does not expose the automatically-started Combat.');
  assert((combatState.combat.combatants || []).some(item => item.entityType === 'character' && item.entityId === characterId), 'Automatic Combat is missing the Character combatant.');
  assert((combatState.combat.combatants || []).some(item => item.entityType === 'monster_instance' && item.entityId === spawned.monsterId), 'Automatic Combat is missing the Monster combatant.');

  const definition = findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME).encounter;
  assert(definition.status === 'planned', 'Automatic Story Combat polluted Encounter Definition status.');
  assert((definition.participants || []).length === 1, 'Automatic Story Monster polluted Definition Encounter roster.');
  assert(definition.participants[0]?.entityType === 'character' && definition.participants[0]?.entityId === characterId, 'Definition Encounter roster no longer contains only the Character authoring participant.');
  assert(definition.combat === null, 'Automatic Story Combat polluted Definition encounter_combats.');

  return { combatId: started.combatId, monsterId: spawned.monsterId, runtimeEncounter };
}

async function cleanup(gm, { mapId, combatId }) {
  if (combatId) {
    await gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, { method: 'POST', body: {} });
  }
  if (mapId) {
    const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/close`, {
      method: 'POST', body: { completeScenarioRun: true }
    });
    assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after Story Combat E2E.');
  }
  const story = await gm.json('/api/gm/story');
  const scenario = (story?.scenarios || []).find(item => item.name === SCENARIO_NAME);
  if (scenario) {
    await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
      method: 'PATCH',
      body: {
        name: scenario.name,
        status: 'archived',
        summary: scenario.summary || '',
        gmNotes: `${scenario.gmNotes || ''}\nStory Runtime spawn/Combat E2E passed: ${RUN_ID}`.trim()
      }
    });
  }
  return scenario?.id || null;
}

async function bestEffortFailureCleanup(gm, state) {
  try {
    let combatId = state.combatId;
    if (!combatId && state.mapId && state.encounterId) {
      const detail = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(state.mapId)}`);
      combatId = (detail?.runtimeEncounters || []).find(item => item.encounterId === state.encounterId)?.combat?.combatId || null;
    }
    if (combatId) {
      await gm.request(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, { method: 'POST', body: {}, allow: [404, 409] });
    }
    if (state.mapId) {
      await gm.request(`/api/gm/world/runtime/maps/${encodeURIComponent(state.mapId)}/close`, {
        method: 'POST', body: { completeScenarioRun: false }, allow: [404, 409]
      });
    }
  } catch (cleanupError) {
    console.error(`Best-effort Story Combat cleanup failed: ${cleanupError.message}`);
  }
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Player Zone → Story spawn → Combat E2E.',
      writes: [
        'test Player and active Character',
        'Scenario / Scene / planned Encounter with Character definition roster',
        'World Location / 3x1 Map Template / hidden trigger Zone / Monster Spawn Point',
        'Monster Skill / Template',
        'once-per-Run enter_zone Story Event: activate_encounter → spawn_monster → start_combat',
        'Scene Run / Runtime Map / Character position',
        'one Player Move into hidden trigger Zone',
        'fresh Runtime Monster / Runtime position / Runtime Combat link',
        'verification that Definition roster, Definition Combat link and Definition status remain unchanged',
        'ended Combat / closed Runtime / archived Scenario'
      ]
    }, null, 2));
    return;
  }

  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  const gm = new Session('GM');
  const player = new Session('Player');
  const cleanupState = { mapId: null, combatId: null, encounterId: null };
  const startedAt = new Date().toISOString();

  try {
    await gm.json('/api/admin/auth/login', { method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD } });
    const gmMe = await gm.json('/api/admin/auth/me');
    assert(gmMe?.user?.role === 'admin', 'GM session did not authenticate as admin.');
    await ensureNoExistingCombat(gm);

    const playerState = await createPlayerCharacter(player);
    const story = await createStory(gm, playerState.character.id);
    cleanupState.encounterId = story.encounter.id;
    const world = await createMap(gm, story.scene.id);
    const template = await createMonsterTemplate(gm);
    const event = await createEvent(gm, story.scene.id, story.encounter.id, template.id);
    const mapId = await createRuntime(gm, story.scene.id, story.encounter.id, playerState.character.id);
    cleanupState.mapId = mapId;
    const result = await exercisePlayerTriggeredCombat({
      gm,
      player,
      characterId: playerState.character.id,
      encounterId: story.encounter.id,
      eventId: event.id,
      mapId
    });
    cleanupState.combatId = result.combatId;
    const scenarioId = await cleanup(gm, cleanupState);

    console.log(JSON.stringify({
      ok: true,
      runId: RUN_ID,
      baseUrl: BASE_URL,
      startedAt,
      endedAt: new Date().toISOString(),
      scenarioId,
      sceneId: story.scene.id,
      encounterId: story.encounter.id,
      eventId: event.id,
      mapTemplateId: world.mapTemplate.id,
      mapInstanceId: mapId,
      monsterId: result.monsterId,
      combatId: result.combatId,
      exercised: {
        playerMoveTrigger: true,
        hiddenZoneDetection: true,
        runtimeEncounterActivation: true,
        storySpawnMonster: true,
        stableSpawnPointPlacement: true,
        storyStartCombat: true,
        sameRuntimeMapPositions: true,
        definitionRosterIsolation: true,
        definitionCombatIsolation: true,
        definitionStatusIsolation: true,
        combatEnded: true,
        runtimeClosed: true,
        scenarioArchived: true
      },
      note: 'The runner leaves clearly named alpha-story-combat-* audit/test definitions in D1; Runtime and Scenario are closed/archived instead of hard-deleted.'
    }, null, 2));
  } catch (error) {
    await bestEffortFailureCleanup(gm, cleanupState);
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
    note: 'Failed Story Combat live runs use best-effort cleanup for any Combat/Runtime created by this run.'
  }, null, 2));
  process.exitCode = 1;
});
