import { createHash, randomInt } from 'node:crypto';

const BASE_URL = (process.env.DND_ALPHA_BASE_URL || 'https://dnd.apswsttss.workers.dev').replace(/\/$/, '');
const GM_USERNAME = process.env.DND_ALPHA_GM_USERNAME || 'gm';
const GM_PASSWORD = process.env.DND_ALPHA_GM_PASSWORD || '';
const EXECUTE = process.env.DND_ALPHA_EXECUTE === '1';
const MAX_ATTACK_ATTEMPTS = Number(process.env.DND_ALPHA_MAX_ATTACK_ATTEMPTS || 8);

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

const RUN_ID = String(process.env.DND_ALPHA_RUN_ID || `alpha-e2e-${stamp()}`).slice(0, 32);
const PLAYER_NAME = String(process.env.DND_ALPHA_PLAYER_NAME || `${RUN_ID}-p`).slice(0, 32);
const PLAYER_KEY = String(process.env.DND_ALPHA_PLAYER_KEY || randomInt(1000, 10000)).padStart(4, '0').slice(-4);
const CHARACTER_NAME = `${RUN_ID}-char`.slice(0, 120);
const SCENARIO_NAME = `${RUN_ID}-scenario`.slice(0, 120);
const SCENE_NAME = `${RUN_ID}-scene`.slice(0, 120);
const ENCOUNTER_NAME = `${RUN_ID}-encounter`.slice(0, 120);
const MONSTER_SKILL_NAME = `${RUN_ID}-monster-skill`.slice(0, 120);
const MONSTER_TEMPLATE_NAME = `${RUN_ID}-monster`.slice(0, 120);
const MONSTER_INSTANCE_NAME = `${RUN_ID}-mob`.slice(0, 120);
const BOSS_PROFILE_NAME = `${RUN_ID}-boss-profile`.slice(0, 120);
const BOSS_INSTANCE_NAME = `${RUN_ID}-boss`.slice(0, 120);
const BOSS_SKILL_NAME = `${RUN_ID}-boss-skill`.slice(0, 120);
const ATTACK_PROFILE_NAME = `${RUN_ID}-attack`.slice(0, 80);

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

function findEncounter(story, encounterName) {
  for (const scenario of story?.scenarios || []) {
    for (const scene of scenario.scenes || []) {
      const encounter = (scene.encounters || []).find(item => item.name === encounterName);
      if (encounter) return { scenario, scene, encounter };
    }
  }
  throw new Error(`Unable to find Encounter: ${encounterName}`);
}

function findEncounterContainer(story, scenarioName, sceneName) {
  const scenario = findNamed(story?.scenarios, scenarioName, 'Scenario');
  const scene = findNamed(scenario?.scenes, sceneName, 'Scene');
  return { scenario, scene };
}

async function ensureNoExistingCombat(gm) {
  const state = await gm.json('/api/gm/combat');
  if (state?.combat?.status === 'active') {
    throw new Error(`Refusing Alpha E2E write: an active Combat already exists (${state.combat.id}). End it manually first.`);
  }
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

async function createPlayerCharacter(player) {
  await player.json('/api/auth/register', {
    method: 'POST',
    body: {
      username: playerInternalUsername(PLAYER_NAME),
      displayName: PLAYER_NAME,
      password: playerInternalPassword(PLAYER_KEY)
    }
  });

  const roll = await player.json('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(roll?.draft?.id, 'Character creation roll did not return a Draft ID.');

  const created = await player.json('/api/player/characters', {
    method: 'POST',
    body: { name: CHARACTER_NAME, summary: 'Production Alpha E2E Character', draftId: roll.draft.id }
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
  assert(finalDetail?.character?.status === 'active', 'Character did not become active after Finalize.');
  return finalDetail.character;
}

async function createAttackProfile(gm, characterId) {
  await gm.json(`/api/gm/characters/${encodeURIComponent(characterId)}/attack-profiles`, {
    method: 'POST',
    body: {
      name: ATTACK_PROFILE_NAME,
      storedAccuracy: 98,
      damageDiceCount: 1,
      damageDiceSides: 2,
      fixedDamageModifier: 10,
      appliesCharacterDamageBonus: false
    }
  });
  let payload = await gm.json(`/api/gm/characters/${encodeURIComponent(characterId)}/attack-profiles`);
  let profile = findNamed(payload?.profiles, ATTACK_PROFILE_NAME, 'Attack Profile');
  if (!profile.isActive) {
    await gm.json(`/api/gm/characters/${encodeURIComponent(characterId)}/attack-profiles/${encodeURIComponent(profile.id)}`, {
      method: 'PATCH',
      body: {
        name: profile.name,
        storedAccuracy: profile.storedAccuracy,
        damageDiceCount: profile.damageDiceCount,
        damageDiceSides: profile.damageDiceSides,
        fixedDamageModifier: profile.fixedDamageModifier,
        appliesCharacterDamageBonus: profile.appliesCharacterDamageBonus,
        isActive: true
      }
    });
    payload = await gm.json(`/api/gm/characters/${encodeURIComponent(characterId)}/attack-profiles`);
    profile = findNamed(payload?.profiles, ATTACK_PROFILE_NAME, 'Attack Profile');
  }
  return profile;
}

async function createStory(gm, characterId) {
  await gm.json('/api/gm/scenarios', {
    method: 'POST', body: { name: SCENARIO_NAME, summary: 'Production Alpha live E2E validation' }
  });
  let story = await gm.json('/api/gm/story');
  const scenario = findNamed(story?.scenarios, SCENARIO_NAME, 'Scenario');

  await gm.json(`/api/gm/scenarios/${encodeURIComponent(scenario.id)}/scenes`, {
    method: 'POST', body: { name: SCENE_NAME }
  });
  story = await gm.json('/api/gm/story');
  let located = findEncounterContainer(story, SCENARIO_NAME, SCENE_NAME);

  await gm.json(`/api/gm/scenes/${encodeURIComponent(located.scene.id)}/encounters`, {
    method: 'POST', body: { name: ENCOUNTER_NAME }
  });
  story = await gm.json('/api/gm/story');
  located = findEncounter(story, ENCOUNTER_NAME);

  await gm.json(`/api/gm/encounters/${encodeURIComponent(located.encounter.id)}/participants`, {
    method: 'PUT', body: { characterIds: [characterId] }
  });
  return findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME);
}

async function createMonster(gm, encounterId) {
  await gm.json('/api/gm/monster-skills', {
    method: 'POST',
    body: {
      name: MONSTER_SKILL_NAME,
      storedAccuracy: 50,
      templateBaseDamage: 0,
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
  for (const key of ['STR', 'DEX', 'CON', 'POW', 'INT', 'SIZ']) {
    attributes[key] = { min: 1, max: 1, growthWeight: 0 };
  }
  await gm.json('/api/gm/monster-templates', {
    method: 'POST', body: { name: MONSTER_TEMPLATE_NAME, summary: 'Production Alpha E2E Monster', attributes }
  });
  state = await gm.json('/api/gm/monsters');
  const template = findNamed(state?.templates, MONSTER_TEMPLATE_NAME, 'Monster Template');

  await gm.json(`/api/gm/monster-templates/${encodeURIComponent(template.id)}/skills`, {
    method: 'PUT', body: { skillIds: [skill.id] }
  });
  await gm.json('/api/gm/monster-instances', {
    method: 'POST',
    body: { templateId: template.id, encounterId, level: 1, displayName: MONSTER_INSTANCE_NAME }
  });
  state = await gm.json('/api/gm/monsters');
  return {
    skill,
    template,
    instance: findNamed(state?.instances, MONSTER_INSTANCE_NAME, 'Monster Instance')
  };
}

async function createBoss(gm, encounterId) {
  const naturalAttributes = {}, growthWeights = {}, attributeOverrides = {};
  for (const key of ['STR', 'DEX', 'CON', 'POW', 'INT', 'SIZ']) {
    naturalAttributes[key] = 1;
    growthWeights[key] = 0;
    attributeOverrides[key] = null;
  }
  await gm.json('/api/gm/boss-profiles', {
    method: 'POST',
    body: {
      name: BOSS_PROFILE_NAME,
      level: 1,
      summary: 'Production Alpha E2E Boss',
      gmNotes: RUN_ID,
      naturalAttributes,
      growthWeights,
      attributeOverrides,
      baselineStoredDefence: 0,
      storedDefenceOverride: null,
      baselineArmorName: '',
      baselineArmorDefence: 0,
      armorDefenceOverride: null,
      maxHpOverride: 1,
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
      templateBaseDamage: 0,
      damageGrowthWeight: 0,
      damageAttributeLinks: []
    }
  });
  await gm.json(`/api/gm/boss-profiles/${encodeURIComponent(profile.id)}/phases`, {
    method: 'PUT',
    body: {
      phases: [
        { phaseNumber: 1, name: 'Opening', hpThresholdPercent: null, gmNotes: RUN_ID },
        { phaseNumber: 2, name: 'Alpha Phase', hpThresholdPercent: 50, gmNotes: RUN_ID }
      ]
    }
  });
  await gm.json('/api/gm/boss-instances', {
    method: 'POST', body: { profileId: profile.id, encounterId, displayName: BOSS_INSTANCE_NAME }
  });
  state = await gm.json('/api/gm/bosses');
  return {
    profile,
    instance: findNamed(state?.instances, BOSS_INSTANCE_NAME, 'Boss Instance')
  };
}

async function forceTurn(gm, combatId, combatantId) {
  await gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/force-turn`, {
    method: 'POST', body: { combatantId }
  });
}

async function endCurrentGmTurn(gm, combatId) {
  return gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/end-turn`, {
    method: 'POST', body: {}
  });
}

async function advanceToNextRound(gm, combatId) {
  const initial = await gm.json('/api/gm/combat');
  const startRound = Number(initial?.combat?.roundNumber || 0);
  for (let step = 0; step < 20; step += 1) {
    const state = await gm.json('/api/gm/combat');
    if (Number(state?.combat?.roundNumber || 0) > startRound) return state;
    await endCurrentGmTurn(gm, combatId);
  }
  throw new Error('Combat did not advance to the next Round within 20 End Turn operations.');
}

async function playerAttackTarget({ gm, player, combatId, characterCombatantId, targetCombatantId, profileId, targetLabel }) {
  for (let attempt = 1; attempt <= MAX_ATTACK_ATTEMPTS; attempt += 1) {
    let state = await player.json('/api/player/combat');
    const character = state?.combat?.combatants?.find(item => item.id === characterCombatantId);
    if (!character?.actionAvailable) await advanceToNextRound(gm, combatId);

    await forceTurn(gm, combatId, characterCombatantId);
    state = await player.json('/api/player/combat');
    assert(state?.combat?.isOwnTurn, `Player does not own forced Character turn while attacking ${targetLabel}.`);

    const result = await player.json(`/api/player/combat/${encodeURIComponent(combatId)}/attack`, {
      method: 'POST', body: { profileId, targetCombatantId }
    });
    const attack = result?.attack;
    assert(attack, `Player attack on ${targetLabel} returned no attack result.`);
    await player.json(`/api/player/combat/${encodeURIComponent(combatId)}/end-turn`, {
      method: 'POST', body: {}
    });
    if (String(attack?.target?.statusAfter || '').toLowerCase() === 'defeated') return attack;
  }
  throw new Error(`${targetLabel} was not defeated within ${MAX_ATTACK_ATTEMPTS} Player attacks.`);
}

async function exerciseMonsterTurn(gm, combatId, monsterCombatantId) {
  await forceTurn(gm, combatId, monsterCombatantId);
  const state = await gm.json('/api/gm/combat');
  const turn = state?.monsterTurn;
  assert(turn && !turn.unavailable, 'Monster Turn payload is unavailable.');
  assert(turn.skills?.length, 'Monster Turn has no snapshotted Skill.');
  assert(turn.targets?.length, 'Monster Turn has no living Character target.');
  const result = await gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/monster-attack`, {
    method: 'POST',
    body: { skillId: turn.skills[0].id, targetCombatantId: turn.targets[0].combatantId }
  });
  assert(result?.monsterAttack, 'Monster attack returned no result.');
  await endCurrentGmTurn(gm, combatId);
  return result.monsterAttack;
}

async function exerciseBossTurn(gm, combatId, bossCombatantId, bossInstanceId) {
  await forceTurn(gm, combatId, bossCombatantId);
  await gm.json(`/api/gm/boss-instances/${encodeURIComponent(bossInstanceId)}/phase`, {
    method: 'POST', body: { phaseNumber: 2, hold: false }
  });
  const state = await gm.json('/api/gm/combat');
  const turn = state?.bossTurn;
  assert(turn && !turn.unavailable, 'Boss Turn payload is unavailable.');
  assert(Number(turn?.instance?.boss?.currentPhaseNumber ?? turn?.instance?.currentPhaseNumber) === 2, 'Boss manual Phase did not change to Phase 2.');
  assert(turn.skills?.length, 'Boss Turn has no snapshotted Skill.');
  assert(turn.targets?.length, 'Boss Turn has no living Character target.');
  const result = await gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/boss-attack`, {
    method: 'POST',
    body: { skillId: turn.skills[0].id, targetCombatantId: turn.targets[0].combatantId }
  });
  assert(result?.bossAttack, 'Boss attack returned no result.');
  await endCurrentGmTurn(gm, combatId);
  return result.bossAttack;
}

async function main() {
  if (!EXECUTE) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'plan-only',
      message: 'Set DND_ALPHA_EXECUTE=1 and DND_ALPHA_GM_PASSWORD to run the production-writing Alpha E2E session.',
      baseUrl: BASE_URL,
      runId: RUN_ID,
      writes: [
        'test Player',
        'active Character',
        'Attack Profile',
        'Scenario/Scene/Encounter',
        'Monster Skill/Template/Instance',
        'Boss Profile/Skill/Phases/Instance',
        'Combat audit data'
      ]
    }, null, 2));
    return;
  }
  if (!GM_PASSWORD) throw new Error('DND_ALPHA_GM_PASSWORD is required when DND_ALPHA_EXECUTE=1.');
  if (!/^\d{4}$/.test(PLAYER_KEY)) throw new Error('DND_ALPHA_PLAYER_KEY must be exactly 4 digits.');
  if (!Number.isInteger(MAX_ATTACK_ATTEMPTS) || MAX_ATTACK_ATTEMPTS < 1 || MAX_ATTACK_ATTEMPTS > 30) {
    throw new Error('DND_ALPHA_MAX_ATTACK_ATTEMPTS must be an integer from 1 to 30.');
  }

  const gm = new Session('GM');
  const player = new Session('Player');
  const startedAt = new Date().toISOString();

  await gm.json('/api/admin/auth/login', {
    method: 'POST', body: { username: GM_USERNAME, password: GM_PASSWORD }
  });
  const me = await gm.json('/api/admin/auth/me');
  assert(me?.user?.role === 'admin', 'GM session did not authenticate as admin.');
  await ensureNoExistingCombat(gm);
  await Promise.all([
    gm.json('/api/gm/story'),
    gm.json('/api/gm/monsters'),
    gm.json('/api/gm/bosses')
  ]);

  const character = await createPlayerCharacter(player);
  const attackProfile = await createAttackProfile(gm, character.id);
  const story = await createStory(gm, character.id);
  await createMonster(gm, story.encounter.id);
  const boss = await createBoss(gm, story.encounter.id);

  const started = await gm.json(`/api/gm/encounters/${encodeURIComponent(story.encounter.id)}/start-combat`, {
    method: 'POST', body: {}
  });
  const combatId = started?.combat?.id || started?.combatId || (await gm.json('/api/gm/combat'))?.combat?.id;
  assert(combatId, 'Encounter Combat did not return an active Combat ID.');

  let playerCombat = await player.json('/api/player/combat');
  assert(playerCombat?.combat?.id === combatId, 'Player session cannot see the Encounter Combat.');
  const combatants = playerCombat.combat.combatants || [];
  const characterCombatant = combatants.find(item => item.controlledByCurrentUser || item.entityId === character.id);
  const monsterCombatant = combatants.find(item => item.entityType === 'monster_instance' && item.displayName === MONSTER_INSTANCE_NAME);
  const bossCombatant = combatants.find(item => item.entityType === 'boss_instance' && item.displayName === BOSS_INSTANCE_NAME);
  assert(characterCombatant, 'Character Combatant is missing from shared Initiative.');
  assert(monsterCombatant, 'Monster Combatant is missing from shared Initiative.');
  assert(bossCombatant, 'Boss Combatant is missing from shared Initiative.');

  const monsterAttack = await exerciseMonsterTurn(gm, combatId, monsterCombatant.id);
  const bossAttack = await exerciseBossTurn(gm, combatId, bossCombatant.id, boss.instance.id);
  const playerVsMonster = await playerAttackTarget({
    gm,
    player,
    combatId,
    characterCombatantId: characterCombatant.id,
    targetCombatantId: monsterCombatant.id,
    profileId: attackProfile.id,
    targetLabel: 'Monster'
  });

  playerCombat = await player.json('/api/player/combat');
  const refreshedBoss = playerCombat?.combat?.combatants?.find(item => item.id === bossCombatant.id);
  assert(String(refreshedBoss?.status || refreshedBoss?.boss?.status || 'active').toLowerCase() === 'active', 'Boss should remain active before the Player→Boss test.');

  const playerVsBoss = await playerAttackTarget({
    gm,
    player,
    combatId,
    characterCombatantId: characterCombatant.id,
    targetCombatantId: bossCombatant.id,
    profileId: attackProfile.id,
    targetLabel: 'Boss'
  });

  await gm.json(`/api/gm/combat/${encodeURIComponent(combatId)}/end`, {
    method: 'POST', body: {}
  });
  const finalLocated = findEncounter(await gm.json('/api/gm/story'), ENCOUNTER_NAME);
  await gm.json(`/api/gm/encounters/${encodeURIComponent(finalLocated.encounter.id)}`, {
    method: 'PATCH',
    body: {
      name: finalLocated.encounter.name,
      status: 'resolved',
      triggerNotes: finalLocated.encounter.triggerNotes || '',
      gmNotes: finalLocated.encounter.gmNotes || '',
      resolutionNotes: `Production Alpha E2E passed: ${RUN_ID}`
    }
  });
  await gm.json(`/api/gm/scenarios/${encodeURIComponent(finalLocated.scenario.id)}`, {
    method: 'PATCH',
    body: {
      name: finalLocated.scenario.name,
      status: 'archived',
      summary: finalLocated.scenario.summary || '',
      gmNotes: `${finalLocated.scenario.gmNotes || ''}\nProduction Alpha E2E archived: ${RUN_ID}`.trim()
    }
  });

  console.log(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    baseUrl: BASE_URL,
    startedAt,
    endedAt: new Date().toISOString(),
    gmRole: me.user.role,
    character: { id: character.id, status: character.status, name: character.name },
    scenario: { id: finalLocated.scenario.id, encounterId: finalLocated.encounter.id },
    combatId,
    sharedInitiative: {
      character: characterCombatant.id,
      monster: monsterCombatant.id,
      boss: bossCombatant.id
    },
    exercised: {
      monsterToCharacter: Boolean(monsterAttack),
      bossToCharacter: Boolean(bossAttack),
      bossManualPhase2: true,
      playerToMonsterDefeat: String(playerVsMonster?.target?.statusAfter || '').toLowerCase() === 'defeated',
      playerToBossDefeat: String(playerVsBoss?.target?.statusAfter || '').toLowerCase() === 'defeated',
      combatEnded: true,
      encounterResolved: true,
      scenarioArchived: true
    },
    note: 'The runner intentionally leaves clearly named alpha-e2e-* audit/test entities in D1; it does not use non-Canonical hard deletes.'
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
    note: 'A failed live run may leave alpha-e2e-* test data in D1. Do not delete unrelated production data while cleaning up.'
  }, null, 2));
  process.exitCode = 1;
});
