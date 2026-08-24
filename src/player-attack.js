import baseWorker from './player-combat.js';
import {
  dyingRoundsFromCon,
  resolveDamage,
  resolveOpposedD100,
  rollCharacterDamageBonus,
  rollD100,
  rollDamageDice
} from './combat-rules.js';
import { advanceCombatTurnWithLife, ensureLifeRow, loadCharacterLifeState } from './combat-life.js';

const GM_ROLES = new Set(['gm', 'admin']);
let attackSchemaPromise = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function currentUser(request, env) {
  const authRequest = new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  });
  const response = await baseWorker.fetch(authRequest, env);
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.user || null;
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (String(user.status || '').toLowerCase() !== 'active') {
    throw Object.assign(new Error('此 User 目前不可使用 Combat。'), { status: 403, code: 'USER_NOT_ACTIVE' });
  }
  return user;
}

async function requireGM(request, env) {
  const user = await requireUser(request, env);
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function readBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

async function ensureAttackSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!attackSchemaPromise) {
    attackSchemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_attack_profiles (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          name TEXT NOT NULL,
          stored_accuracy INTEGER NOT NULL,
          damage_dice_count INTEGER NOT NULL,
          damage_dice_sides INTEGER NOT NULL,
          fixed_damage_modifier INTEGER NOT NULL DEFAULT 0,
          applies_character_damage_bonus INTEGER NOT NULL DEFAULT 1,
          defence_skill_key TEXT NOT NULL DEFAULT 'dodge',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_by_user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_player_attack_profiles_character ON player_attack_profiles(character_id, is_active, updated_at)'),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_life_states (
          character_id TEXT PRIMARY KEY,
          life_state TEXT NOT NULL DEFAULT 'alive',
          character_locked INTEGER NOT NULL DEFAULT 0,
          dying_rounds_remaining INTEGER,
          died_at INTEGER,
          last_dying_tick_combat_id TEXT,
          last_dying_tick_round INTEGER,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_character_life_states_state ON character_life_states(life_state, character_locked)'),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS combat_action_log (
          id TEXT PRIMARY KEY,
          combat_id TEXT NOT NULL,
          round_number INTEGER NOT NULL,
          turn_index INTEGER NOT NULL,
          actor_combatant_id TEXT NOT NULL,
          target_combatant_id TEXT,
          action_type TEXT NOT NULL,
          profile_id TEXT,
          attack_roll INTEGER,
          attack_result INTEGER,
          defence_roll INTEGER,
          defence_result INTEGER,
          outcome TEXT NOT NULL,
          raw_damage INTEGER,
          effective_defence INTEGER,
          damage_result INTEGER,
          hp_damage INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_combat_action_log_combat ON combat_action_log(combat_id, round_number, turn_index, created_at)')
      ]);
      await env.DB.prepare(`
        INSERT OR IGNORE INTO character_life_states (
          character_id, life_state, character_locked, dying_rounds_remaining,
          died_at, last_dying_tick_combat_id, last_dying_tick_round, updated_at
        )
        SELECT id, 'alive', 0, NULL, NULL, NULL, NULL, 0 FROM characters
      `).run();
    })().catch(error => {
      attackSchemaPromise = null;
      throw error;
    });
  }
  await attackSchemaPromise;
}

function mapCombatant(row) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    controllerUserId: row.controller_user_id,
    displayName: row.display_name,
    dex: Number(row.dex_snapshot),
    initiativeOrder: Number(row.initiative_order),
    actionAvailable: Boolean(row.action_available),
    moveAvailable: Boolean(row.move_available),
    turnCompleted: Boolean(row.turn_completed)
  };
}

async function loadCombat(env, combatId = '') {
  const combat = combatId
    ? await env.DB.prepare(`SELECT id, status, round_number, current_turn_index, created_by_user_id, started_at, ended_at, updated_at FROM combats WHERE id = ? LIMIT 1`).bind(combatId).first()
    : await env.DB.prepare(`SELECT id, status, round_number, current_turn_index, created_by_user_id, started_at, ended_at, updated_at FROM combats WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`).first();
  if (!combat) return null;
  const rows = await env.DB.prepare(`
    SELECT id, entity_type, entity_id, controller_user_id, display_name,
           dex_snapshot, initiative_order, action_available, move_available, turn_completed
    FROM combatants WHERE combat_id = ? ORDER BY initiative_order
  `).bind(combat.id).all();
  const combatants = (rows.results || []).map(mapCombatant);
  const currentTurnIndex = Number(combat.current_turn_index || 0);
  return {
    id: combat.id,
    status: combat.status,
    roundNumber: Number(combat.round_number || 1),
    currentTurnIndex,
    createdByUserId: combat.created_by_user_id,
    startedAt: combat.started_at,
    endedAt: combat.ended_at,
    updatedAt: combat.updated_at,
    combatants,
    currentCombatant: combatants.find(item => item.initiativeOrder === currentTurnIndex) || null
  };
}

function assertActiveCombat(combat) {
  if (!combat) throw Object.assign(new Error('找不到 Combat。'), { status: 404, code: 'COMBAT_NOT_FOUND' });
  if (combat.status !== 'active') throw Object.assign(new Error('此 Combat 已經結束。'), { status: 409, code: 'COMBAT_NOT_ACTIVE' });
  if (!combat.currentCombatant) throw Object.assign(new Error('Current Turn state 無效。'), { status: 409, code: 'CURRENT_TURN_INVALID' });
}

async function lifeMapForCombat(env, combat) {
  const map = new Map();
  if (!combat) return map;
  for (const combatant of combat.combatants) {
    if (combatant.entityType === 'character') map.set(combatant.entityId, await ensureLifeRow(env, combatant.entityId));
  }
  return map;
}

async function hpMapForCombat(env, combat) {
  const map = new Map();
  if (!combat) return map;
  const characterIds = combat.combatants.filter(item => item.entityType === 'character').map(item => item.entityId);
  if (!characterIds.length) return map;
  const placeholders = characterIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT character_id, current_value, max_value
    FROM character_resources
    WHERE UPPER(key) = 'HP' AND character_id IN (${placeholders})
  `).bind(...characterIds).all();
  for (const row of rows.results || []) map.set(row.character_id, { current: Number(row.current_value), max: Number(row.max_value) });
  return map;
}

async function activeProfiles(env, characterId) {
  const rows = await env.DB.prepare(`
    SELECT id, name, stored_accuracy, damage_dice_count, damage_dice_sides,
           fixed_damage_modifier, applies_character_damage_bonus, defence_skill_key,
           is_active, created_at, updated_at
    FROM player_attack_profiles
    WHERE character_id = ? AND is_active = 1
    ORDER BY name COLLATE NOCASE, created_at
  `).bind(characterId).all();
  return (rows.results || []).map(mapProfile);
}

function mapProfile(row) {
  return {
    id: row.id,
    name: row.name,
    storedAccuracy: Number(row.stored_accuracy),
    damageDiceCount: Number(row.damage_dice_count),
    damageDiceSides: Number(row.damage_dice_sides),
    fixedDamageModifier: Number(row.fixed_damage_modifier || 0),
    appliesCharacterDamageBonus: Boolean(row.applies_character_damage_bonus),
    defenceSkillKey: row.defence_skill_key || 'dodge',
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function enrichPlayerCombat(env, combat, userId) {
  if (!combat) return { combat: null, attackProfiles: [] };
  const ownsAny = combat.combatants.some(item => item.controllerUserId === userId);
  if (!ownsAny) return { combat: null, attackProfiles: [] };
  const [lifeMap, hpMap] = await Promise.all([lifeMapForCombat(env, combat), hpMapForCombat(env, combat)]);
  const enrich = item => {
    const life = item.entityType === 'character' ? (lifeMap.get(item.entityId) || defaultLife(item.entityId)) : null;
    return {
      ...item,
      controlledByCurrentUser: item.controllerUserId === userId,
      isCurrent: item.id === combat.currentCombatant?.id,
      lifeState: life?.lifeState || null,
      characterLocked: life?.characterLocked || false,
      dyingRoundsRemaining: life?.dyingRoundsRemaining ?? null,
      hp: hpMap.get(item.entityId) || null
    };
  };
  const combatants = combat.combatants.map(enrich);
  const currentCombatant = combat.currentCombatant ? enrich(combat.currentCombatant) : null;
  const profiles = currentCombatant?.controllerUserId === userId && currentCombatant.entityType === 'character'
    ? await activeProfiles(env, currentCombatant.entityId)
    : [];
  return {
    combat: {
      id: combat.id,
      status: combat.status,
      roundNumber: combat.roundNumber,
      currentTurnIndex: combat.currentTurnIndex,
      startedAt: combat.startedAt,
      updatedAt: combat.updatedAt,
      combatants,
      currentCombatant,
      isOwnTurn: currentCombatant?.controllerUserId === userId
    },
    attackProfiles: profiles
  };
}

function defaultLife(characterId) {
  return { characterId, lifeState: 'alive', characterLocked: false, dyingRoundsRemaining: null, diedAt: null };
}

async function playerCombatOverview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  const user = await requireUser(request, env);
  const baseResponse = await baseWorker.fetch(request, env);
  if (!baseResponse.ok) return baseResponse;
  await ensureAttackSchema(env);
  const payload = await baseResponse.json();
  if (!payload?.combat) return json({ ...payload, attackProfiles: [] });
  const combat = await loadCombat(env, payload.combat.id);
  return json({ ok: true, ...(await enrichPlayerCombat(env, combat, user.id)) });
}

async function gmCombatOverview(request, env) {
  const user = await requireGM(request, env);
  const baseResponse = await baseWorker.fetch(request, env);
  if (!baseResponse.ok) return baseResponse;
  await ensureAttackSchema(env);
  const payload = await baseResponse.json();
  const candidates = [];
  for (const candidate of payload.candidates || []) {
    const life = await ensureLifeRow(env, candidate.id);
    candidates.push({
      ...candidate,
      lifeState: life.lifeState,
      eligible: Boolean(candidate.eligible && life.lifeState !== 'dead')
    });
  }
  let combat = payload.combat;
  if (combat) {
    const full = await loadCombat(env, combat.id);
    const lifeMap = await lifeMapForCombat(env, full);
    combat = {
      ...combat,
      combatants: (combat.combatants || []).map(item => ({
        ...item,
        lifeState: item.entityType === 'character' ? (lifeMap.get(item.entityId)?.lifeState || 'alive') : null,
        dyingRoundsRemaining: item.entityType === 'character' ? (lifeMap.get(item.entityId)?.dyingRoundsRemaining ?? null) : null
      }))
    };
  }
  return json({ ...payload, user, candidates, combat });
}

function validateProfile(body) {
  const name = String(body?.name || '').trim().normalize('NFKC');
  const storedAccuracy = Number(body?.storedAccuracy);
  const damageDiceCount = Number(body?.damageDiceCount);
  const damageDiceSides = Number(body?.damageDiceSides);
  const fixedDamageModifier = Number(body?.fixedDamageModifier || 0);
  const appliesCharacterDamageBonus = body?.appliesCharacterDamageBonus !== false;
  if (name.length < 1 || name.length > 80) throw Object.assign(new Error('Attack Profile 名稱必須為 1–80 個字元。'), { status: 400, code: 'VALIDATION_ERROR' });
  if (!Number.isInteger(storedAccuracy) || storedAccuracy < 0 || storedAccuracy > 98) throw Object.assign(new Error('Stored Accuracy 必須係 0–98 整數。'), { status: 400, code: 'VALIDATION_ERROR' });
  if (!Number.isInteger(damageDiceCount) || damageDiceCount < 1 || damageDiceCount > 20) throw Object.assign(new Error('Damage Dice Count 必須係 1–20。'), { status: 400, code: 'VALIDATION_ERROR' });
  if (!Number.isInteger(damageDiceSides) || damageDiceSides < 2 || damageDiceSides > 100) throw Object.assign(new Error('Damage Dice Sides 必須係 2–100。'), { status: 400, code: 'VALIDATION_ERROR' });
  if (!Number.isInteger(fixedDamageModifier) || fixedDamageModifier < -10000 || fixedDamageModifier > 10000) throw Object.assign(new Error('Fixed Damage Modifier 無效。'), { status: 400, code: 'VALIDATION_ERROR' });
  return { name, storedAccuracy, damageDiceCount, damageDiceSides, fixedDamageModifier, appliesCharacterDamageBonus };
}

async function requireCharacter(env, characterId) {
  const row = await env.DB.prepare('SELECT id, name, status FROM characters WHERE id = ? LIMIT 1').bind(characterId).first();
  if (!row) throw Object.assign(new Error('找不到 Character。'), { status: 404, code: 'CHARACTER_NOT_FOUND' });
  const life = await ensureLifeRow(env, characterId);
  return { row, life };
}

async function gmProfiles(request, env, characterId, profileId = '') {
  const user = await requireGM(request, env);
  await ensureAttackSchema(env);
  const { life } = await requireCharacter(env, characterId);

  if (request.method === 'GET' && !profileId) {
    const rows = await env.DB.prepare(`
      SELECT id, name, stored_accuracy, damage_dice_count, damage_dice_sides,
             fixed_damage_modifier, applies_character_damage_bonus, defence_skill_key,
             is_active, created_at, updated_at
      FROM player_attack_profiles
      WHERE character_id = ?
      ORDER BY is_active DESC, name COLLATE NOCASE, created_at
    `).bind(characterId).all();
    return json({ ok: true, profiles: (rows.results || []).map(mapProfile), life });
  }

  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  if (life.characterLocked) return apiError('死亡 Character 已鎖定，不能以普通 GM 編輯流程修改 Attack Profile。', 423, 'CHARACTER_LOCKED_DEAD');

  if (request.method === 'POST' && !profileId) {
    const profile = validateProfile(await readBody(request));
    const id = `attack_${crypto.randomUUID()}`;
    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO player_attack_profiles (
        id, character_id, name, stored_accuracy, damage_dice_count, damage_dice_sides,
        fixed_damage_modifier, applies_character_damage_bonus, defence_skill_key,
        is_active, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'dodge', 1, ?, ?, ?)
    `).bind(id, characterId, profile.name, profile.storedAccuracy, profile.damageDiceCount, profile.damageDiceSides, profile.fixedDamageModifier, profile.appliesCharacterDamageBonus ? 1 : 0, user.id, now, now).run();
    const row = await env.DB.prepare('SELECT * FROM player_attack_profiles WHERE id = ?').bind(id).first();
    return json({ ok: true, profile: mapProfile(row) }, 201);
  }

  const existing = await env.DB.prepare('SELECT * FROM player_attack_profiles WHERE id = ? AND character_id = ? LIMIT 1').bind(profileId, characterId).first();
  if (!existing) return apiError('找不到 Attack Profile。', 404, 'ATTACK_PROFILE_NOT_FOUND');

  if (request.method === 'PATCH') {
    const body = await readBody(request);
    const profile = validateProfile({
      name: body.name ?? existing.name,
      storedAccuracy: body.storedAccuracy ?? existing.stored_accuracy,
      damageDiceCount: body.damageDiceCount ?? existing.damage_dice_count,
      damageDiceSides: body.damageDiceSides ?? existing.damage_dice_sides,
      fixedDamageModifier: body.fixedDamageModifier ?? existing.fixed_damage_modifier,
      appliesCharacterDamageBonus: body.appliesCharacterDamageBonus ?? Boolean(existing.applies_character_damage_bonus)
    });
    const isActive = body.isActive === undefined ? Boolean(existing.is_active) : Boolean(body.isActive);
    const now = Date.now();
    await env.DB.prepare(`
      UPDATE player_attack_profiles
      SET name = ?, stored_accuracy = ?, damage_dice_count = ?, damage_dice_sides = ?,
          fixed_damage_modifier = ?, applies_character_damage_bonus = ?, is_active = ?, updated_at = ?
      WHERE id = ? AND character_id = ?
    `).bind(profile.name, profile.storedAccuracy, profile.damageDiceCount, profile.damageDiceSides, profile.fixedDamageModifier, profile.appliesCharacterDamageBonus ? 1 : 0, isActive ? 1 : 0, now, profileId, characterId).run();
    const row = await env.DB.prepare('SELECT * FROM player_attack_profiles WHERE id = ?').bind(profileId).first();
    return json({ ok: true, profile: mapProfile(row) });
  }

  if (request.method === 'DELETE') {
    const now = Date.now();
    await env.DB.prepare('UPDATE player_attack_profiles SET is_active = 0, updated_at = ? WHERE id = ? AND character_id = ?').bind(now, profileId, characterId).run();
    return json({ ok: true });
  }

  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function characterAttributes(env, characterId, keys) {
  const placeholders = keys.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT UPPER(key) AS key, value
    FROM character_attributes
    WHERE character_id = ? AND UPPER(key) IN (${placeholders})
  `).bind(characterId, ...keys).all();
  const values = {};
  for (const row of rows.results || []) values[row.key] = Number(row.value);
  return values;
}

async function insertAttackLog(env, values) {
  await env.DB.prepare(`
    INSERT INTO combat_action_log (
      id, combat_id, round_number, turn_index, actor_combatant_id, target_combatant_id,
      action_type, profile_id, attack_roll, attack_result, defence_roll, defence_result,
      outcome, raw_damage, effective_defence, damage_result, hp_damage, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'attack', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `action_${crypto.randomUUID()}`,
    values.combatId, values.roundNumber, values.turnIndex, values.actorCombatantId, values.targetCombatantId,
    values.profileId, values.attackRoll, values.attackResult, values.defenceRoll, values.defenceResult,
    values.outcome, values.rawDamage, values.effectiveDefence, values.damageResult, values.hpDamage, Date.now()
  ).run();
}

async function playerAttack(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  await ensureAttackSchema(env);
  const body = await readBody(request);
  const profileId = String(body?.profileId || '').trim();
  const targetCombatantId = String(body?.targetCombatantId || '').trim();
  if (!profileId || !targetCombatantId) return apiError('Attack Profile 同 Target 都係必填。', 400, 'VALIDATION_ERROR');

  const combat = await loadCombat(env, combatId);
  assertActiveCombat(combat);
  const actor = combat.currentCombatant;
  if (actor.entityType !== 'character' || actor.controllerUserId !== user.id) return apiError('而家唔係你控制角色嘅 Turn。', 403, 'NOT_OWN_TURN');
  if (!actor.actionAvailable) return apiError('本 Turn 嘅 Action 已經使用。', 409, 'ACTION_ALREADY_SPENT');

  const actorLife = await ensureLifeRow(env, actor.entityId);
  if (actorLife.lifeState !== 'alive' || actorLife.characterLocked) return apiError('倒地、瀕死或死亡 Character 不能進行普通攻擊。', 409, 'ACTOR_NOT_ACTIONABLE');

  const target = combat.combatants.find(item => item.id === targetCombatantId);
  if (!target || target.entityType !== 'character') return apiError('Target 必須係同一 Combat 入面嘅 Character。', 400, 'TARGET_INVALID');
  if (target.id === actor.id) return apiError('MVP 普通攻擊不能以自己作 Target。', 400, 'TARGET_INVALID');
  const targetLife = await ensureLifeRow(env, target.entityId);
  if (targetLife.lifeState === 'dead') return apiError('Target 已經死亡。', 409, 'TARGET_DEAD');

  const profileRow = await env.DB.prepare('SELECT * FROM player_attack_profiles WHERE id = ? AND character_id = ? AND is_active = 1 LIMIT 1').bind(profileId, actor.entityId).first();
  if (!profileRow) return apiError('Attack Profile 不存在、未批准或已停用。', 409, 'ATTACK_PROFILE_UNAVAILABLE');
  const profile = mapProfile(profileRow);

  const [dodgeRow, hpRow, actorAttrs, targetAttrs] = await Promise.all([
    env.DB.prepare("SELECT natural_value FROM character_skills WHERE character_id = ? AND key = 'dodge' LIMIT 1").bind(target.entityId).first(),
    env.DB.prepare("SELECT id, current_value, max_value FROM character_resources WHERE character_id = ? AND UPPER(key) = 'HP' LIMIT 1").bind(target.entityId).first(),
    characterAttributes(env, actor.entityId, ['STR', 'SIZ']),
    characterAttributes(env, target.entityId, ['CON'])
  ]);
  if (!dodgeRow) return apiError('Target 缺少 Canonical Dodge Skill。', 409, 'TARGET_DODGE_REQUIRED');
  if (!hpRow) return apiError('Target 缺少 HP resource。', 409, 'TARGET_HP_REQUIRED');
  const dodge = Number(dodgeRow.natural_value);
  if (!Number.isFinite(dodge)) return apiError('Target Dodge 數值無效。', 409, 'TARGET_DODGE_INVALID');
  if (!Number.isFinite(targetAttrs.CON)) return apiError('Target 缺少 CON，不能處理 Dying。', 409, 'TARGET_CON_REQUIRED');
  if (profile.appliesCharacterDamageBonus && (!Number.isFinite(actorAttrs.STR) || !Number.isFinite(actorAttrs.SIZ))) {
    return apiError('攻擊者缺少 STR / SIZ，不能計 Character Damage Bonus。', 409, 'ATTACKER_DAMAGE_BONUS_ATTRIBUTES_REQUIRED');
  }

  const expectedRound = combat.roundNumber;
  const expectedIndex = combat.currentTurnIndex;
  const reservedAt = Date.now();
  const reserve = await env.DB.prepare(`
    UPDATE combatants
    SET action_available = 0, updated_at = ?
    WHERE id = ?
      AND combat_id = ?
      AND controller_user_id = ?
      AND entity_type = 'character'
      AND action_available = 1
      AND EXISTS (
        SELECT 1 FROM combats
        WHERE id = ? AND status = 'active' AND round_number = ? AND current_turn_index = ?
      )
  `).bind(reservedAt, actor.id, combat.id, user.id, combat.id, expectedRound, expectedIndex).run();
  if (Number(reserve?.meta?.changes || 0) !== 1) return apiError('Combat state 已改變，Attack 未執行。', 409, 'COMBAT_STATE_CHANGED');

  const attackRoll = rollD100();
  const defenceRoll = rollD100();
  const opposed = resolveOpposedD100(
    { roll: attackRoll, skillValue: profile.storedAccuracy, modifier: 0 },
    { roll: defenceRoll, skillValue: dodge, modifier: 0 }
  );

  let damageDice = { rolls: [], total: 0 };
  let damageBonus = { label: '0', rolls: [], total: 0 };
  let damage = { rawDamage: null, effectiveDefence: 0, damageResult: null, hpDamage: 0 };
  let outcome = 'miss';
  let targetLifeAfter = targetLife;
  let targetHpAfter = Number(hpRow.current_value);

  if (opposed.sourceWins) {
    outcome = 'hit';
    damageDice = rollDamageDice(profile.damageDiceCount, profile.damageDiceSides);
    if (profile.appliesCharacterDamageBonus) damageBonus = rollCharacterDamageBonus(actorAttrs.STR, actorAttrs.SIZ);
    damage = resolveDamage({
      damageDiceTotal: damageDice.total,
      fixedDamageModifier: profile.fixedDamageModifier,
      damageBonusTotal: damageBonus.total,
      effectiveDefence: 0
    });

    if (damage.hpDamage > 0) {
      const now = Date.now();
      if (targetLife.lifeState === 'dying') {
        await env.DB.batch([
          env.DB.prepare("UPDATE character_resources SET current_value = 0 WHERE id = ?").bind(hpRow.id),
          env.DB.prepare(`
            UPDATE character_life_states
            SET life_state = 'dead', character_locked = 1,
                dying_rounds_remaining = 0, died_at = COALESCE(died_at, ?), updated_at = ?
            WHERE character_id = ? AND life_state = 'dying'
          `).bind(now, now, target.entityId)
        ]);
      } else {
        const dyingRounds = dyingRoundsFromCon(targetAttrs.CON);
        await env.DB.batch([
          env.DB.prepare(`
            UPDATE character_resources
            SET current_value = MAX(0, current_value - ?)
            WHERE id = ?
          `).bind(damage.hpDamage, hpRow.id),
          env.DB.prepare(`
            UPDATE character_life_states
            SET life_state = 'dying', character_locked = 0,
                dying_rounds_remaining = ?, died_at = NULL,
                last_dying_tick_combat_id = NULL, last_dying_tick_round = NULL,
                updated_at = ?
            WHERE character_id = ?
              AND life_state = 'alive'
              AND EXISTS (
                SELECT 1 FROM character_resources
                WHERE id = ? AND current_value <= 0
              )
          `).bind(dyingRounds, now, target.entityId, hpRow.id)
        ]);
      }
      const refreshedHp = await env.DB.prepare('SELECT current_value FROM character_resources WHERE id = ?').bind(hpRow.id).first();
      targetHpAfter = Number(refreshedHp?.current_value || 0);
      targetLifeAfter = await loadCharacterLifeState(env, target.entityId);
      if (targetLifeAfter.lifeState === 'dead') outcome = 'hit_target_dead';
      else if (targetLifeAfter.lifeState === 'dying') outcome = 'hit_target_dying';
      else outcome = 'hit_damage';
    } else {
      outcome = 'hit_ineffective';
    }
  }

  await insertAttackLog(env, {
    combatId: combat.id,
    roundNumber: expectedRound,
    turnIndex: expectedIndex,
    actorCombatantId: actor.id,
    targetCombatantId: target.id,
    profileId: profile.id,
    attackRoll: opposed.source.roll,
    attackResult: opposed.source.result,
    defenceRoll: opposed.resistance.roll,
    defenceResult: opposed.resistance.result,
    outcome,
    rawDamage: damage.rawDamage,
    effectiveDefence: damage.effectiveDefence,
    damageResult: damage.damageResult,
    hpDamage: damage.hpDamage
  });

  const refreshedCombat = await loadCombat(env, combat.id);
  const enriched = await enrichPlayerCombat(env, refreshedCombat, user.id);
  return json({
    ok: true,
    ...enriched,
    attack: {
      profile: { id: profile.id, name: profile.name },
      actor: { combatantId: actor.id, name: actor.displayName },
      target: {
        combatantId: target.id,
        name: target.displayName,
        hpAfter: targetHpAfter,
        lifeStateAfter: targetLifeAfter.lifeState,
        dyingRoundsRemaining: targetLifeAfter.dyingRoundsRemaining
      },
      attackCheck: opposed.source,
      defenceCheck: opposed.resistance,
      hit: opposed.sourceWins,
      damageDice,
      damageBonus,
      fixedDamageModifier: profile.fixedDamageModifier,
      damage,
      outcome
    }
  });
}

async function playerEndTurn(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  await ensureAttackSchema(env);
  const combat = await loadCombat(env, combatId);
  assertActiveCombat(combat);
  const current = combat.currentCombatant;
  if (current.entityType !== 'character' || current.controllerUserId !== user.id) return apiError('而家唔係你控制角色嘅 Turn。', 403, 'NOT_OWN_TURN');
  const transitioned = await advanceCombatTurnWithLife(env, combat);
  const refreshed = await loadCombat(env, combat.id);
  return json({ ok: true, roundAdvanced: transitioned.roundAdvanced, ...(await enrichPlayerCombat(env, refreshed, user.id)) });
}

async function gmEndTurn(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureAttackSchema(env);
  const combat = await loadCombat(env, combatId);
  assertActiveCombat(combat);
  const transitioned = await advanceCombatTurnWithLife(env, combat);
  return json({ ok: true, roundAdvanced: transitioned.roundAdvanced, combat: await loadCombat(env, combat.id) });
}

async function blockNonAliveAllowance(request, env, combatId) {
  const user = await requireUser(request, env);
  await ensureAttackSchema(env);
  const combat = await loadCombat(env, combatId);
  assertActiveCombat(combat);
  const current = combat.currentCombatant;
  if (current.entityType !== 'character' || current.controllerUserId !== user.id) return null;
  const life = await ensureLifeRow(env, current.entityId);
  if (life.lifeState !== 'alive' || life.characterLocked) return apiError('倒地、瀕死或死亡 Character 不能使用普通 Action / Move。', 409, 'ACTOR_NOT_ACTIONABLE');
  return null;
}

async function validateCombatStartLife(request, env) {
  await requireGM(request, env);
  await ensureAttackSchema(env);
  const clone = request.clone();
  const body = await readBody(clone);
  const ids = [...new Set((Array.isArray(body?.characterIds) ? body.characterIds : []).map(value => String(value || '').trim()).filter(Boolean))];
  for (const id of ids) {
    const life = await ensureLifeRow(env, id);
    if (life.lifeState === 'dead' || life.characterLocked) return apiError('死亡 Character 不能加入新 Combat。', 409, 'DEAD_COMBATANT_NOT_ALLOWED');
  }
  return null;
}

async function lockedCharacterResponse(env, characterId) {
  await ensureAttackSchema(env);
  const life = await ensureLifeRow(env, characterId);
  return life.characterLocked ? apiError('死亡 Character 已鎖定，不能用普通編輯流程修改。', 423, 'CHARACTER_LOCKED_DEAD') : null;
}

async function augmentCharacterDetail(request, env, characterId) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  await ensureAttackSchema(env);
  const payload = await response.json();
  if (payload?.character) {
    const life = await ensureLifeRow(env, characterId);
    payload.character.lifeState = life.lifeState;
    payload.character.characterLocked = life.characterLocked;
    payload.character.dyingRoundsRemaining = life.dyingRoundsRemaining;
    payload.character.diedAt = life.diedAt;
  }
  return json(payload, response.status);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/player/combat' && request.method === 'GET') return await playerCombatOverview(request, env);
      if (pathname === '/api/gm/combat' && request.method === 'GET') return await gmCombatOverview(request, env);

      const attackMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/attack$/);
      if (attackMatch) return await playerAttack(request, env, decodeURIComponent(attackMatch[1]));

      const playerEndMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/end-turn$/);
      if (playerEndMatch) return await playerEndTurn(request, env, decodeURIComponent(playerEndMatch[1]));

      const gmEndMatch = pathname.match(/^\/api\/gm\/combat\/([^/]+)\/end-turn$/);
      if (gmEndMatch) return await gmEndTurn(request, env, decodeURIComponent(gmEndMatch[1]));

      const allowanceMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/consume-(action|move)$/);
      if (allowanceMatch && request.method === 'POST') {
        const blocked = await blockNonAliveAllowance(request, env, decodeURIComponent(allowanceMatch[1]));
        if (blocked) return blocked;
        return baseWorker.fetch(request, env);
      }

      if (pathname === '/api/gm/combat/start' && request.method === 'POST') {
        const blocked = await validateCombatStartLife(request, env);
        if (blocked) return blocked;
        return baseWorker.fetch(request, env);
      }

      const gmProfilesMatch = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/attack-profiles(?:\/([^/]+))?$/);
      if (gmProfilesMatch) {
        return await gmProfiles(request, env, decodeURIComponent(gmProfilesMatch[1]), gmProfilesMatch[2] ? decodeURIComponent(gmProfilesMatch[2]) : '');
      }

      const playerDetailMatch = pathname.match(/^\/api\/player\/characters\/([^/]+)$/);
      if (playerDetailMatch && request.method === 'GET') return await augmentCharacterDetail(request, env, decodeURIComponent(playerDetailMatch[1]));
      const gmDetailMatch = pathname.match(/^\/api\/gm\/characters\/([^/]+)$/);
      if (gmDetailMatch && request.method === 'GET') return await augmentCharacterDetail(request, env, decodeURIComponent(gmDetailMatch[1]));

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const playerWrite = pathname.match(/^\/api\/player\/characters\/([^/]+)\/(?:notes|inventory(?:\/[^/]+)?|resources(?:\/[^/]+)?)$/);
        if (playerWrite) {
          await requireUser(request, env);
          const blocked = await lockedCharacterResponse(env, decodeURIComponent(playerWrite[1]));
          if (blocked) return blocked;
        }
        const gmWrite = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/(?:exp|resources\/[^/]+)$/);
        if (gmWrite) {
          await requireGM(request, env);
          const blocked = await lockedCharacterResponse(env, decodeURIComponent(gmWrite[1]));
          if (blocked) return blocked;
        }
      }

      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Player Attack resolver error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'PLAYER_ATTACK_API_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      return apiError('暫時無法完成 Combat Attack 要求。', 500, 'PLAYER_ATTACK_SERVICE_ERROR');
    }
  }
};
