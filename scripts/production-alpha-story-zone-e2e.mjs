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

const RUN_ID = `alpha-zone-${stamp()}`.slice(0, 32);
const PLAYER_NAME = `${RUN_ID}-p`.slice(0, 32);
const PLAYER_KEY = String(randomInt(1000, 10000));
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const ENCOUNTER_NAME = `${RUN_ID}-encounter`.slice(0, 120);
const LOCATION_NAME = `${RUN_ID}-location`.slice(0, 120);
const MAP_NAME = `${RUN_ID}-map`.slice(0, 120);
const EVENT_NAME = `${RUN_ID}-event`.slice(0, 120);
const ZONE_ID = `zone_${RUN_ID.replace(/[^A-Za-z0-9_-]/g, '_')}_trigger`.slice(0, 120);
const ZONE_NAME = `${RUN_ID} Hidden Trigger`.slice(0, 120);
const FLAG_KEY = 'alpha.story.enter_zone_verified';
const NARRATIVE = `Enter-zone Story Event production narrative ${RUN_ID}`;

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
    throw new Error(`Refusing enter-zone E2E write: an active Combat already exists (${state.combat.id}).`);
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
  assert(me?.user?.id && me?.user?.role === 'player', 'Player registration did not establish a Player session.');
  return me.user;
}

async function createCharacter(player) {
  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(roll?.draft?.id, 'Character creation roll did not return a Draft ID.');
  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name: CHARACTER_NAME, summary: 'Production Alpha enter-zone Story Event E2E Character', draftId: roll.draft.id }
  });
  const characterId = created?.character?.id;
  assert(characterId, 'Character creation did not return a Character ID.');
  const detail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  const allocations = buildAllocations(detail?.character?.skills, Number(detail?.character?.progression?.creationSkillPointsTotal || 200));
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/creation-skills`, {
    method: 'PATCH', body: { allocations }
  });
  await player.json(`/api/player/characters/${encodeURIComponent(characterId)}/finalize-creation`, {
    method: 'POST', body: {}
  });
  const finalDetail = await player.json(`/api/player/characters/${encodeURIComponent(characterId)}`);
  assert(finalDetail?.character?.status === 'active', 'Enter-zone test Character did not become active.');
  return finalDetail.character;
}

async function createScenarioScene(gm) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Production Alpha enter-zone Story Event live E2E' }
  });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, {
    method: 'POST', body: { name: SCENE_NAME }
  });
  story = await gm.json('/api/gm/story');
  const refreshed = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  const scene = findNamed(refreshed?.scenes, SCENE_NAME, 'Scene');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(scene.id)}/encounters`, {
    method: 'POST',
    body: { name: ENCOUNTER_NAME, status: 'planned', triggerNotes: 'Activated only in Runtime by enter_zone Story Event.' }
  });
  story = await gm.json('/api/gm/story');
  const finalScenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  const finalScene = findNamed(finalScenario?.scenes, SCENE_NAME, 'Scene');
  const encounter = findNamed(finalScene?.encounters, ENCOUNTER_NAME, 'Encounter');
  assert(encounter?.status === 'planned', 'Encounter Definition did not start planned.');
  return { scenario: finalScenario, scene: finalScene, encounter };
}

async function createMapAndZone(gm, sceneId) {
  await gm.json('/api/gm/world/locations', {
    method: 'POST', body: { name: LOCATION_NAME, description: 'Production Alpha enter-zone Story Event E2E Location', gmNotes: RUN_ID }
  });
  let world = await gm.json('/api/gm/world-maps');
  const location = findNamed(world?.locations, LOCATION_NAME, 'World Location');
  await gm.json('/api/gm/world/maps', {
    method: 'POST',
    body: { locationId: location.id, name: MAP_NAME, width: 2, height: 1, backgroundAssetRef: '', gmNotes: RUN_ID }
  });
  world = await gm.json('/api/gm/world-maps');
  const mapTemplate = findNamed(world?.mapTemplates, MAP_NAME, 'Map Template');
  const editor = await gm.json(`/api/gm/world/maps/${encodeURIComponent(mapTemplate.id)}/editor`);
  assert(editor?.mapTemplate?.version, 'Map editor did not return a template version.');
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
      spawnPoints: []
    }
  });
  assert(saved?.counts?.zones === 1 && saved?.counts?.zoneCells === 1, 'Hidden trigger Zone was not saved to the Map Template.');
  await gm.json(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
    method: 'PUT', body: { mapTemplateId: mapTemplate.id, configuration: {} }
  });
  return { location, mapTemplate };
}

async function createEnterZoneEvent(gm, sceneId, encounterId) {
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
        { type: 'flag_not_equals', key: FLAG_KEY, value: true },
        { type: 'encounter_status', encounterId, status: 'planned' }
      ],
      effects: [
        { type: 'set_flag', key: FLAG_KEY, value: true },
        { type: 'show_narrative', text: NARRATIVE },
        { type: 'reveal_zone', sourceZoneId: ZONE_ID },
        { type: 'activate_encounter', encounterId }
      ],
      oncePerSceneRun: true
    }
  });
  assert(payload?.event?.id, 'Enter-zone Story Event creation did not return an Event ID.');
  assert(payload.event.triggerType === 'enter_zone', 'Story Event trigger type is not enter_zone.');
  assert(payload.event.trigger?.sourceZoneId === ZONE_ID, 'Story Event did not preserve the stable sourceZoneId.');
  return payload.event;
}

async function createRuntime(gm, sceneId, encounterId, characterId) {
  const runtime = await gm.json('/api/gm/world/runtime/scene-runs', {
    method: 'POST', body: { sceneId, label: `${RUN_ID} Enter-zone Runtime` }
  });
  const mapInstanceId = runtime?.mapInstance?.id;
  assert(mapInstanceId, 'Scene Runtime did not return a Runtime Map ID.');
  const runtimeEncounter = (runtime?.runtimeEncounters || []).find(item => item?.encounterId === encounterId);
  assert(runtimeEncounter?.status === 'planned', 'Scene Runtime did not immediately snapshot the planned Encounter.');
  const placed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/entities/character/${encodeURIComponent(characterId)}/position`, {
    method: 'PUT', body: { x: 0, y: 0, visibilityMode: 'default', allowOccupied: false }
  });
  assert(placed?.position?.x === 0 && placed?.position?.y === 0, 'Character was not placed outside the trigger Zone at (0,0).');
  return mapInstanceId;
}

async function exerciseEnterZone({ gm, player, characterId, mapInstanceId, event, encounterId }) {
  const before = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}`);
  assert(before?.map?.id === mapInstanceId, 'Player world context did not expose the Runtime Map.');
  assert(before?.position?.x === 0 && before?.position?.y === 0, 'Player did not start outside the trigger Zone.');
  assert(!(before?.zones || []).some(zone => zone?.name === ZONE_NAME), 'Hidden trigger Zone leaked to Player before entry.');
  assert((before?.legalMoves || []).some(move => move?.x === 1 && move?.y === 0), 'Destination trigger cell was not a legal Move.');

  const moved = await player.json(`/api/player/world/characters/${encodeURIComponent(characterId)}/move`, {
    method: 'POST', body: { x: 1, y: 0 }
  });
  assert(moved?.movement?.from?.x === 0 && moved?.movement?.from?.y === 0, 'Move response did not preserve the origin cell.');
  assert(moved?.movement?.to?.x === 1 && moved?.movement?.to?.y === 0, 'Move response did not reach the trigger cell.');
  const triggerResult = (moved?.storyEventsTriggered || []).find(item => item?.eventId === event.id);
  assert(triggerResult?.status === 'applied', `Enter-zone Event was not applied; status=${triggerResult?.status || 'missing'}.`);
  assert(triggerResult?.sourceZoneId === ZONE_ID, 'Enter-zone Event fired for the wrong source Zone.');
  assert(triggerResult?.executionId, 'Enter-zone Event did not return an execution audit ID.');
  assert(Array.isArray(triggerResult?.effectsApplied) && triggerResult.effectsApplied.length === 4, 'Enter-zone Event did not apply exactly four effects.');
  const encounterEffect = triggerResult.effectsApplied.find(effect => effect?.type === 'activate_encounter');
  assert(encounterEffect?.encounterId === encounterId && encounterEffect?.status === 'active', 'activate_encounter effect did not report active Runtime Encounter state.');

  const narrative = (moved?.storyNarratives || []).find(item => item?.storyEventId === event.id && item?.text === NARRATIVE);
  assert(narrative?.id, 'Automatic Event narrative was not present in the post-Move Player payload.');
  assert((moved?.zones || []).some(zone => zone?.name === ZONE_NAME), 'reveal_zone effect was not visible in the refreshed post-Move Player payload.');

  const gmState = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  const flag = (gmState?.storyFlags || []).find(item => item?.key === FLAG_KEY);
  assert(flag?.value === true, 'Automatic Event set_flag effect did not persist.');
  const runtimeEncounter = (gmState?.runtimeEncounters || []).find(item => item?.encounterId === encounterId);
  assert(runtimeEncounter?.status === 'active', 'Runtime Encounter did not persist active after Story Event activation.');
  assert(runtimeEncounter?.activatedByStoryEventId === event.id, 'Runtime Encounter did not preserve activating Story Event provenance.');
  const execution = (gmState?.storyExecutions || []).find(item => item?.id === triggerResult.executionId);
  assert(execution?.status === 'applied' && execution?.triggerType === 'enter_zone', 'Automatic Event execution audit was not recorded as enter_zone/applied.');

  const definitionStory = await gm.json('/api/gm/story');
  const definitionScenario = findNamed(definitionStory?.scenarios, SCENARIO_NAME, 'Scenario');
  const definitionScene = findNamed(definitionScenario?.scenes, SCENE_NAME, 'Scene');
  const definitionEncounter = findNamed(definitionScene?.encounters, ENCOUNTER_NAME, 'Encounter Definition');
  assert(definitionEncounter?.status === 'planned', `Encounter Definition status was polluted by Runtime activation: ${definitionEncounter?.status}.`);

  return {
    executionId: triggerResult.executionId,
    flagValue: flag.value,
    narrativeId: narrative.id,
    revealedZone: true,
    runtimeEncounterStatus: runtimeEncounter.status,
    definitionEncounterStatus: definitionEncounter.status,
    effectTypes: triggerResult.effectsApplied.map(effect => effect.type)
  };
}

async function closeAndArchive(gm, mapInstanceId) {
  const closed = await gm.json(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/close`, {
    method: 'POST', body: { completeScenarioRun: true }
  });
  assert(closed?.mapInstance?.status === 'closed', 'Runtime Map did not close after enter-zone E2E.');
  const story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: scenario.name,
      status: 'archived',
      summary: scenario.summary || '',
      gmNotes: `${scenario.gmNotes || ''}\nProduction enter-zone + Runtime Encounter E2E passed: ${RUN_ID}`.trim()
    }
  });
  return scenario.id;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing enter-zone Story Event E2E session.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'test Player and active Character',
        'Scenario / Scene / planned Encounter Definition and enter_zone Story Event definition',
        'World Location / 2x1 Map Template with hidden trigger Zone / Scene binding',
        'Runtime Map / immediate Runtime Encounter snapshot / Character position and one Player Move',
        'Runtime Story flag, Player narrative, revealed Zone, active Runtime Encounter and Story execution audit',
        'verification that Encounter Definition remains planned',
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
  const world = await createMapAndZone(gm, story.scene.id);
  const event = await createEnterZoneEvent(gm, story.scene.id, story.encounter.id);
  const mapInstanceId = await createRuntime(gm, story.scene.id, story.encounter.id, character.id);
  const result = await exerciseEnterZone({
    gm,
    player,
    characterId: character.id,
    mapInstanceId,
    event,
    encounterId: story.encounter.id
  });
  const scenarioId = await closeAndArchive(gm, mapInstanceId);

  console.log(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    startedAt,
    endedAt: new Date().toISOString(),
    gmRole: gmMe.user.role,
    player: { userId: playerUser.id, displayName: playerUser.displayName || PLAYER_NAME },
    character: { id: character.id, name: character.name, status: character.status },
    scenario: { id: scenarioId, sceneId: story.scene.id, encounterId: story.encounter.id },
    storyEvent: { id: event.id, name: event.name, triggerType: event.triggerType, sourceZoneId: ZONE_ID },
    world: { locationId: world.location.id, mapTemplateId: world.mapTemplate.id, mapInstanceId },
    result,
    exercised: {
      hiddenServerTriggerZone: true,
      playerMoveTrigger: true,
      structuredConditions: true,
      encounterStatusCondition: true,
      setFlagEffect: result.flagValue === true,
      playerNarrativeEffect: Boolean(result.narrativeId),
      revealZoneEffect: result.revealedZone,
      activateEncounterEffect: result.runtimeEncounterStatus === 'active',
      definitionRuntimeIsolation: result.definitionEncounterStatus === 'planned',
      executionAudit: Boolean(result.executionId),
      runtimeClosed: true,
      scenarioArchived: true
    },
    note: 'The enter-zone runner leaves clearly named alpha-zone-* audit/test definitions in D1; Runtime and Scenario are closed or archived instead of hard-deleting Canonical data.'
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
    note: 'A failed enter-zone live run may leave alpha-zone-* audit/test data in D1; it never starts Combat.'
  }, null, 2));
  process.exitCode = 1;
});
