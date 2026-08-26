import baseWorker from './boss-runtime.js';
import { bossInstanceDefence } from './boss-rules.js';
import { reconcileBossStatusFromHp, resolveBossHpDamage } from './boss-life.js';
import {
  resolveDamage,
  resolveOpposedD100,
  rollCharacterDamageBonus,
  rollD100,
  rollDamageDice
} from './combat-rules.js';

const GM_ROLES = new Set(['gm', 'admin']);
let schemaPromise = null;

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
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  return (await response.json())?.user || null;
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
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try { return await request.json(); }
  catch { throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' }); }
}

function finite(value, label, { min = -1_000_000, max = 1_000_000 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw Object.assign(new Error(`${label} 數值無效。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_boss_action_log (
        id TEXT PRIMARY KEY,
        combat_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        turn_index INTEGER NOT NULL,
        actor_combatant_id TEXT NOT NULL,
        actor_character_id TEXT NOT NULL,
        target_combatant_id TEXT NOT NULL,
        target_boss_instance_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        attack_roll INTEGER NOT NULL,
        attack_result REAL NOT NULL,
        boss_stored_defence REAL NOT NULL,
        boss_defence_modifier REAL NOT NULL DEFAULT 0,
        boss_modified_defence REAL NOT NULL,
        boss_effective_defence REAL NOT NULL,
        defence_roll INTEGER NOT NULL,
        defence_result REAL NOT NULL,
        raw_damage REAL,
        boss_final_armor_defence REAL,
        damage_result REAL,
        hp_damage REAL NOT NULL DEFAULT 0,
        boss_hp_before REAL NOT NULL,
        boss_hp_after REAL NOT NULL,
        boss_status_after TEXT NOT NULL,
        outcome TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_character_id) REFERENCES characters(id) ON DELETE CASCADE,
        FOREIGN KEY (target_boss_instance_id) REFERENCES boss_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (profile_id) REFERENCES player_attack_profiles(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_player_boss_action_log_combat ON player_boss_action_log(combat_id, round_number, turn_index, created_at)')
    ]).catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

async function playerCombatPayload(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/player/combat', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return { response, payload: null };
  return { response, payload: await response.json() };
}

async function characterAttributes(env, characterId, keys) {
  const placeholders = keys.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT UPPER(key) AS key, value FROM character_attributes WHERE character_id = ? AND UPPER(key) IN (${placeholders})`)
    .bind(characterId, ...keys).all();
  const out = {};
  for (const row of rows.results || []) out[row.key] = Number(row.value);
  return out;
}

function mapProfile(row) {
  return {
    id: row.id,
    name: row.name,
    storedAccuracy: Number(row.stored_accuracy),
    damageDiceCount: Number(row.damage_dice_count),
    damageDiceSides: Number(row.damage_dice_sides),
    fixedDamageModifier: Number(row.fixed_damage_modifier || 0),
    appliesCharacterDamageBonus: Boolean(row.applies_character_damage_bonus)
  };
}

async function reservePlayerAction(env, combat, actor, userId) {
  const result = await env.DB.prepare(`
    UPDATE combatants SET action_available = 0, updated_at = ?
    WHERE id = ? AND combat_id = ? AND controller_user_id = ? AND entity_type = 'character' AND action_available = 1
      AND EXISTS (
        SELECT 1 FROM combats WHERE id = ? AND status = 'active' AND round_number = ? AND current_turn_index = ?
      )
  `).bind(Date.now(), actor.id, combat.id, userId, combat.id, Number(combat.roundNumber), Number(combat.currentTurnIndex)).run();
  return Number(result?.meta?.changes || 0) === 1;
}

async function writeAudit(env, value) {
  await env.DB.prepare(`
    INSERT INTO player_boss_action_log (
      id, combat_id, round_number, turn_index, actor_combatant_id, actor_character_id,
      target_combatant_id, target_boss_instance_id, profile_id, attack_roll, attack_result,
      boss_stored_defence, boss_defence_modifier, boss_modified_defence, boss_effective_defence,
      defence_roll, defence_result, raw_damage, boss_final_armor_defence, damage_result, hp_damage,
      boss_hp_before, boss_hp_after, boss_status_after, outcome, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `pba_${crypto.randomUUID()}`, value.combatId, value.roundNumber, value.turnIndex,
    value.actorCombatantId, value.actorCharacterId, value.targetCombatantId, value.targetBossInstanceId,
    value.profileId, value.attackRoll, value.attackResult,
    value.storedDefence, value.defenceModifier, value.modifiedDefence, value.effectiveDefence,
    value.defenceRoll, value.defenceResult, value.rawDamage, value.finalArmorDefence,
    value.damageResult, value.hpDamage, value.hpBefore, value.hpAfter, value.statusAfter,
    value.outcome, Date.now()
  ).run();
}

async function resolvePlayerBossAttack(request, env, combatId, body, user, combatPayload, target) {
  await ensureSchema(env);
  const combat = combatPayload?.combat;
  if (!combat || combat.id !== combatId || combat.status !== 'active') return apiError('找不到有效 Combat。', 404, 'COMBAT_NOT_FOUND');
  const actor = combat.currentCombatant;
  if (!combat.isOwnTurn || !actor || actor.entityType !== 'character' || actor.controllerUserId !== user.id) {
    return apiError('而家唔係你控制角色嘅 Turn。', 403, 'NOT_OWN_TURN');
  }
  if (!actor.actionAvailable) return apiError('本 Turn 嘅 Action 已經使用。', 409, 'ACTION_ALREADY_SPENT');
  if (String(actor.lifeState || 'alive').toLowerCase() !== 'alive' || actor.characterLocked) {
    return apiError('倒地、瀕死或死亡 Character 不能進行普通攻擊。', 409, 'ACTOR_NOT_ACTIONABLE');
  }

  const profileId = String(body?.profileId || '').trim();
  if (!profileId) return apiError('Attack Profile 必須填寫。', 400, 'VALIDATION_ERROR');
  const [profileRow, bossRow, actorAttrs] = await Promise.all([
    env.DB.prepare('SELECT * FROM player_attack_profiles WHERE id = ? AND character_id = ? AND is_active = 1 LIMIT 1').bind(profileId, actor.entityId).first(),
    env.DB.prepare(`SELECT * FROM boss_instances WHERE id = ? LIMIT 1`).bind(target.entityId).first(),
    characterAttributes(env, actor.entityId, ['STR', 'SIZ'])
  ]);
  if (!profileRow) return apiError('Attack Profile 不存在、未批准或已停用。', 409, 'ATTACK_PROFILE_UNAVAILABLE');
  if (!bossRow) return apiError('Boss Instance 不存在。', 404, 'BOSS_INSTANCE_NOT_FOUND');
  if (bossRow.status !== 'active' || Number(bossRow.current_hp) <= 0) {
    return apiError('Defeated / removed Boss 不能作為普通攻擊 Target。', 409, 'BOSS_TARGET_NOT_ACTIVE');
  }
  const profile = mapProfile(profileRow);
  if (profile.appliesCharacterDamageBonus && (!Number.isFinite(actorAttrs.STR) || !Number.isFinite(actorAttrs.SIZ))) {
    return apiError('攻擊者缺少 STR / SIZ，不能計 Character Damage Bonus。', 409, 'ATTACKER_DAMAGE_BONUS_ATTRIBUTES_REQUIRED');
  }

  if (!(await reservePlayerAction(env, combat, actor, user.id))) {
    return apiError('Combat state 已改變，Attack 未執行。', 409, 'COMBAT_STATE_CHANGED');
  }

  const defence = bossInstanceDefence(
    Number(bossRow.stored_defence || 0),
    Number(bossRow.defence_modifier || 0),
    Number(bossRow.armor_base_defence || 0),
    Number(bossRow.armor_defence_adjustment || 0)
  );
  if (defence.armor.finalDefence < 0) return apiError('Boss Final Armor Defence 無效。', 409, 'BOSS_ARMOR_INVALID');
  const attackRoll = rollD100();
  const defenceRoll = rollD100();
  const opposed = resolveOpposedD100(
    { roll: attackRoll, skillValue: profile.storedAccuracy, modifier: 0 },
    { roll: defenceRoll, skillValue: defence.d100.effectiveDefence, modifier: 0 }
  );

  const hpBefore = Number(bossRow.current_hp);
  let hpAfter = hpBefore;
  let statusAfter = bossRow.status;
  let damageDice = { rolls: [], total: 0 };
  let damageBonus = { label: '0', rolls: [], total: 0 };
  let damage = { rawDamage: null, effectiveDefence: null, damageResult: null, hpDamage: 0 };
  let outcome = 'defended';

  if (opposed.sourceWins) {
    damageDice = rollDamageDice(profile.damageDiceCount, profile.damageDiceSides);
    if (profile.appliesCharacterDamageBonus) damageBonus = rollCharacterDamageBonus(actorAttrs.STR, actorAttrs.SIZ);
    damage = resolveDamage({
      damageDiceTotal: damageDice.total,
      fixedDamageModifier: profile.fixedDamageModifier,
      damageBonusTotal: damageBonus.total,
      effectiveDefence: defence.armor.finalDefence
    });
    if (damage.hpDamage > 0) {
      const resolved = resolveBossHpDamage(hpBefore, damage.hpDamage);
      hpAfter = resolved.hpAfter;
      statusAfter = resolved.statusAfter;
      const update = await env.DB.prepare(`
        UPDATE boss_instances SET current_hp = ?, status = ?, updated_at = ?
        WHERE id = ? AND status = 'active' AND current_hp = ?
      `).bind(hpAfter, statusAfter, Date.now(), target.entityId, hpBefore).run();
      if (Number(update?.meta?.changes || 0) !== 1) {
        return apiError('Boss state 已改變；本次 Attack 未能安全套用傷害。', 409, 'BOSS_STATE_CHANGED');
      }
      if (statusAfter === 'defeated') {
        await env.DB.prepare(`
          UPDATE combatants SET action_available = 0, move_available = 0, updated_at = ?
          WHERE combat_id = ? AND entity_type = 'boss_instance' AND entity_id = ?
        `).bind(Date.now(), combat.id, target.entityId).run();
        outcome = 'hit_target_defeated';
      } else outcome = 'hit_damage';
    } else outcome = 'hit_ineffective';
  }

  await writeAudit(env, {
    combatId: combat.id,
    roundNumber: Number(combat.roundNumber),
    turnIndex: Number(combat.currentTurnIndex),
    actorCombatantId: actor.id,
    actorCharacterId: actor.entityId,
    targetCombatantId: target.id,
    targetBossInstanceId: target.entityId,
    profileId: profile.id,
    attackRoll: opposed.source.roll,
    attackResult: opposed.source.result,
    storedDefence: defence.d100.storedDefence,
    defenceModifier: defence.d100.modifier,
    modifiedDefence: defence.d100.modifiedDefence,
    effectiveDefence: defence.d100.effectiveDefence,
    defenceRoll: opposed.resistance.roll,
    defenceResult: opposed.resistance.result,
    rawDamage: damage.rawDamage,
    finalArmorDefence: damage.effectiveDefence,
    damageResult: damage.damageResult,
    hpDamage: damage.hpDamage,
    hpBefore,
    hpAfter,
    statusAfter,
    outcome
  });

  const refreshed = await playerCombatPayload(request, env);
  if (!refreshed.response.ok) return refreshed.response;
  return json({
    ...refreshed.payload,
    attack: {
      actor: { combatantId: actor.id, characterId: actor.entityId, name: actor.displayName },
      target: {
        combatantId: target.id,
        bossInstanceId: target.entityId,
        name: target.displayName,
        entityType: 'boss_instance',
        hpBefore,
        hpAfter,
        statusAfter
      },
      profile,
      defenceSource: 'boss_stored_defence',
      bossDefence: defence.d100,
      attackCheck: opposed.source,
      defenceCheck: opposed.resistance,
      hit: opposed.sourceWins,
      damageDice,
      damageBonus,
      fixedDamageModifier: profile.fixedDamageModifier,
      armor: {
        name: bossRow.armor_name || '',
        baseDefence: Number(bossRow.armor_base_defence || 0),
        adjustment: Number(bossRow.armor_defence_adjustment || 0),
        finalDefence: damage.effectiveDefence
      },
      damage,
      outcome
    }
  });
}

async function playerAttack(request, env, combatId) {
  const user = await requireUser(request, env);
  // This gateway must preserve the original request body when the target is not a Boss,
  // because the same Player attack route is delegated downstream to Monster defeat.
  const body = await readBody(request.clone());
  const state = await playerCombatPayload(request, env);
  if (!state.response.ok) return state.response;
  const targetId = String(body?.targetCombatantId || '').trim();
  const target = state.payload?.combat?.combatants?.find(item => item.id === targetId);
  if (!target || target.entityType !== 'boss_instance') return baseWorker.fetch(request, env);
  return resolvePlayerBossAttack(request, env, combatId, body, user, state.payload, target);
}

async function gmRuntimeCorrection(request, env, instanceId) {
  if (request.method !== 'PATCH') return baseWorker.fetch(request, env);
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  const row = await env.DB.prepare('SELECT * FROM boss_instances WHERE id = ? LIMIT 1').bind(instanceId).first();
  if (!row) return apiError('找不到 Boss Instance。', 404, 'BOSS_INSTANCE_NOT_FOUND');
  const body = await readBody(request);
  const hpAdjustment = body?.hpMaxAdjustment === undefined ? Number(row.hp_max_adjustment || 0) : finite(body.hpMaxAdjustment, 'HP Max Adjustment');
  const mpAdjustment = body?.mpMaxAdjustment === undefined ? Number(row.mp_max_adjustment || 0) : finite(body.mpMaxAdjustment, 'MP Max Adjustment');
  const maxHp = Math.max(1, Number(row.snapshot_max_hp) + hpAdjustment);
  const maxMp = Math.max(0, Number(row.snapshot_max_mp) + mpAdjustment);
  const currentHp = body?.currentHp === undefined ? Math.min(Number(row.current_hp), maxHp) : finite(body.currentHp, 'Current HP', { min: 0, max: maxHp });
  const currentMp = body?.currentMp === undefined ? Math.min(Number(row.current_mp), maxMp) : finite(body.currentMp, 'Current MP', { min: 0, max: maxMp });
  const defenceModifier = body?.defenceModifier === undefined ? Number(row.defence_modifier || 0) : finite(body.defenceModifier, 'Defence Modifier');
  const armorAdjustment = body?.armorDefenceAdjustment === undefined ? Number(row.armor_defence_adjustment || 0) : finite(body.armorDefenceAdjustment, 'Armor Adjustment');
  const defence = bossInstanceDefence(row.stored_defence, defenceModifier, row.armor_base_defence, armorAdjustment);
  if (defence.armor.finalDefence < 0) return apiError('Final Armor Defence 不能低過 0。', 400, 'VALIDATION_ERROR');
  const status = reconcileBossStatusFromHp(row.status, currentHp);
  await env.DB.prepare(`
    UPDATE boss_instances SET hp_max_adjustment = ?, final_max_hp = ?, current_hp = ?,
      mp_max_adjustment = ?, final_max_mp = ?, current_mp = ?, defence_modifier = ?,
      armor_defence_adjustment = ?, final_armor_defence = ?, status = ?, updated_at = ? WHERE id = ?
  `).bind(hpAdjustment, maxHp, currentHp, mpAdjustment, maxMp, currentMp, defenceModifier,
    armorAdjustment, defence.armor.finalDefence, status, Date.now(), instanceId).run();
  if (status === 'defeated') {
    await env.DB.prepare(`
      UPDATE combatants SET action_available = 0, move_available = 0, updated_at = ?
      WHERE entity_type = 'boss_instance' AND entity_id = ?
        AND combat_id IN (SELECT id FROM combats WHERE status = 'active')
    `).bind(Date.now(), instanceId).run();
  }
  return json({ ok: true, instanceId, status, hp: { current: currentHp, max: maxHp }, mp: { current: currentMp, max: maxMp }, defence });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      let match = pathname.match(/^\/api\/player\/combat\/([^/]+)\/attack$/);
      if (match && request.method === 'POST') return await playerAttack(request, env, decodeURIComponent(match[1]));
      match = pathname.match(/^\/api\/gm\/boss-instances\/([^/]+)\/runtime$/);
      if (match) return await gmRuntimeCorrection(request, env, decodeURIComponent(match[1]));
      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Boss defeat runtime error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'BOSS_DEFEAT_RUNTIME_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      return apiError('暫時無法完成 Boss Defeat Runtime 要求。', 500, 'BOSS_DEFEAT_SERVICE_ERROR');
    }
  }
};
