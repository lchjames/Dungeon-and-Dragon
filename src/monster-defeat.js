import baseWorker from './monster-defence.js';
import {
  resolveDamage,
  resolveOpposedD100,
  rollCharacterDamageBonus,
  rollD100,
  rollDamageDice
} from './combat-rules.js';
import { monsterEffectiveD100Defence, monsterFinalArmorDefence } from './monster-rules.js';
import { reconcileMonsterStatusFromHp, resolveMonsterHpDamage } from './monster-life.js';

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

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_monster_action_log (
        id TEXT PRIMARY KEY,
        combat_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        turn_index INTEGER NOT NULL,
        actor_combatant_id TEXT NOT NULL,
        actor_character_id TEXT NOT NULL,
        target_combatant_id TEXT NOT NULL,
        target_monster_instance_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        attack_roll INTEGER NOT NULL,
        attack_result REAL NOT NULL,
        monster_stored_defence REAL NOT NULL,
        monster_defence_modifier REAL NOT NULL DEFAULT 0,
        monster_modified_defence REAL NOT NULL,
        monster_effective_defence REAL NOT NULL,
        defence_roll INTEGER NOT NULL,
        defence_result REAL NOT NULL,
        raw_damage REAL,
        monster_final_armor_defence REAL,
        damage_result REAL,
        hp_damage REAL NOT NULL DEFAULT 0,
        monster_hp_before REAL NOT NULL,
        monster_hp_after REAL NOT NULL,
        monster_status_after TEXT NOT NULL,
        outcome TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_character_id) REFERENCES characters(id) ON DELETE CASCADE,
        FOREIGN KEY (target_monster_instance_id) REFERENCES monster_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (profile_id) REFERENCES player_attack_profiles(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_player_monster_action_log_combat ON player_monster_action_log(combat_id, round_number, turn_index, created_at)')
    ]).catch(error => {
      schemaPromise = null;
      throw error;
    });
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
  const rows = await env.DB.prepare(`
    SELECT UPPER(key) AS key, value
    FROM character_attributes
    WHERE character_id = ? AND UPPER(key) IN (${placeholders})
  `).bind(characterId, ...keys).all();
  const values = {};
  for (const row of rows.results || []) values[row.key] = Number(row.value);
  return values;
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

async function loadMonsterTarget(env, instanceId) {
  return env.DB.prepare(`
    SELECT id, display_name, status, current_hp, final_max_hp,
           stored_defence, defence_modifier,
           armor_name, armor_base_defence, armor_defence_adjustment, final_armor_defence
    FROM monster_instances
    WHERE id = ? LIMIT 1
  `).bind(instanceId).first();
}

async function reservePlayerAction(env, combat, actor, userId) {
  const result = await env.DB.prepare(`
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
  `).bind(
    Date.now(), actor.id, combat.id, userId,
    combat.id, Number(combat.roundNumber), Number(combat.currentTurnIndex)
  ).run();
  return Number(result?.meta?.changes || 0) === 1;
}

async function writeAttackAudit(env, values) {
  await env.DB.prepare(`
    INSERT INTO player_monster_action_log (
      id, combat_id, round_number, turn_index,
      actor_combatant_id, actor_character_id,
      target_combatant_id, target_monster_instance_id,
      profile_id, attack_roll, attack_result,
      monster_stored_defence, monster_defence_modifier,
      monster_modified_defence, monster_effective_defence,
      defence_roll, defence_result,
      raw_damage, monster_final_armor_defence, damage_result, hp_damage,
      monster_hp_before, monster_hp_after, monster_status_after,
      outcome, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `pma_${crypto.randomUUID()}`,
    values.combatId, values.roundNumber, values.turnIndex,
    values.actorCombatantId, values.actorCharacterId,
    values.targetCombatantId, values.targetMonsterInstanceId,
    values.profileId, values.attackRoll, values.attackResult,
    values.monsterStoredDefence, values.monsterDefenceModifier,
    values.monsterModifiedDefence, values.monsterEffectiveDefence,
    values.defenceRoll, values.defenceResult,
    values.rawDamage, values.monsterFinalArmorDefence,
    values.damageResult, values.hpDamage,
    values.monsterHpBefore, values.monsterHpAfter, values.monsterStatusAfter,
    values.outcome, Date.now()
  ).run();
}

async function resolvePlayerMonsterAttack(request, env, combatId, body, user, combatPayload, target) {
  await ensureSchema(env);
  const combat = combatPayload?.combat;
  if (!combat || combat.id !== combatId || combat.status !== 'active') {
    return apiError('找不到有效 Combat。', 404, 'COMBAT_NOT_FOUND');
  }
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
  const profileRow = await env.DB.prepare(`
    SELECT * FROM player_attack_profiles
    WHERE id = ? AND character_id = ? AND is_active = 1
    LIMIT 1
  `).bind(profileId, actor.entityId).first();
  if (!profileRow) return apiError('Attack Profile 不存在、未批准或已停用。', 409, 'ATTACK_PROFILE_UNAVAILABLE');
  const profile = mapProfile(profileRow);

  const [monsterRow, actorAttrs] = await Promise.all([
    loadMonsterTarget(env, target.entityId),
    characterAttributes(env, actor.entityId, ['STR', 'SIZ'])
  ]);
  if (!monsterRow) return apiError('Monster Instance 不存在。', 404, 'MONSTER_INSTANCE_NOT_FOUND');
  if (monsterRow.status !== 'active' || Number(monsterRow.current_hp) <= 0) {
    return apiError('Defeated / removed Monster 不能作為普通攻擊 Target。', 409, 'MONSTER_TARGET_NOT_ACTIVE');
  }
  if (profile.appliesCharacterDamageBonus && (!Number.isFinite(actorAttrs.STR) || !Number.isFinite(actorAttrs.SIZ))) {
    return apiError('攻擊者缺少 STR / SIZ，不能計 Character Damage Bonus。', 409, 'ATTACKER_DAMAGE_BONUS_ATTRIBUTES_REQUIRED');
  }

  const reserved = await reservePlayerAction(env, combat, actor, user.id);
  if (!reserved) return apiError('Combat state 已改變，Attack 未執行。', 409, 'COMBAT_STATE_CHANGED');

  const monsterDefence = monsterEffectiveD100Defence(monsterRow.stored_defence, monsterRow.defence_modifier);
  const attackRoll = rollD100();
  const defenceRoll = rollD100();
  const opposed = resolveOpposedD100(
    { roll: attackRoll, skillValue: profile.storedAccuracy, modifier: 0 },
    { roll: defenceRoll, skillValue: monsterDefence.effectiveDefence, modifier: 0 }
  );

  const hpBefore = Number(monsterRow.current_hp);
  let hpAfter = hpBefore;
  let statusAfter = monsterRow.status;
  let damageDice = { rolls: [], total: 0 };
  let damageBonus = { label: '0', rolls: [], total: 0 };
  let damage = { rawDamage: null, effectiveDefence: null, damageResult: null, hpDamage: 0 };
  let outcome = 'defended';

  if (opposed.sourceWins) {
    damageDice = rollDamageDice(profile.damageDiceCount, profile.damageDiceSides);
    if (profile.appliesCharacterDamageBonus) damageBonus = rollCharacterDamageBonus(actorAttrs.STR, actorAttrs.SIZ);
    const armor = monsterFinalArmorDefence(monsterRow.armor_base_defence, monsterRow.armor_defence_adjustment);
    if (armor.finalDefence < 0) return apiError('Monster Final Armor Defence 無效。', 409, 'MONSTER_ARMOR_INVALID');
    damage = resolveDamage({
      damageDiceTotal: damageDice.total,
      fixedDamageModifier: profile.fixedDamageModifier,
      damageBonusTotal: damageBonus.total,
      effectiveDefence: armor.finalDefence
    });

    if (damage.hpDamage > 0) {
      const resolvedHp = resolveMonsterHpDamage(hpBefore, damage.hpDamage);
      hpAfter = resolvedHp.hpAfter;
      statusAfter = resolvedHp.statusAfter;
      const update = await env.DB.prepare(`
        UPDATE monster_instances
        SET current_hp = ?, status = ?, updated_at = ?
        WHERE id = ? AND status = 'active' AND current_hp = ?
      `).bind(hpAfter, statusAfter, Date.now(), target.entityId, hpBefore).run();
      if (Number(update?.meta?.changes || 0) !== 1) {
        return apiError('Monster state 已改變；本次 Attack 未能安全套用傷害。', 409, 'MONSTER_STATE_CHANGED');
      }
      if (statusAfter === 'defeated') {
        await env.DB.prepare(`
          UPDATE combatants
          SET action_available = 0, move_available = 0, updated_at = ?
          WHERE combat_id = ? AND entity_type = 'monster_instance' AND entity_id = ?
        `).bind(Date.now(), combat.id, target.entityId).run();
        outcome = 'hit_target_defeated';
      } else {
        outcome = 'hit_damage';
      }
    } else {
      outcome = 'hit_ineffective';
    }
  }

  await writeAttackAudit(env, {
    combatId: combat.id,
    roundNumber: Number(combat.roundNumber),
    turnIndex: Number(combat.currentTurnIndex),
    actorCombatantId: actor.id,
    actorCharacterId: actor.entityId,
    targetCombatantId: target.id,
    targetMonsterInstanceId: target.entityId,
    profileId: profile.id,
    attackRoll: opposed.source.roll,
    attackResult: opposed.source.result,
    monsterStoredDefence: monsterDefence.storedDefence,
    monsterDefenceModifier: monsterDefence.modifier,
    monsterModifiedDefence: monsterDefence.modifiedDefence,
    monsterEffectiveDefence: monsterDefence.effectiveDefence,
    defenceRoll: opposed.resistance.roll,
    defenceResult: opposed.resistance.result,
    rawDamage: damage.rawDamage,
    monsterFinalArmorDefence: damage.effectiveDefence,
    damageResult: damage.damageResult,
    hpDamage: damage.hpDamage,
    monsterHpBefore: hpBefore,
    monsterHpAfter: hpAfter,
    monsterStatusAfter: statusAfter,
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
        monsterInstanceId: target.entityId,
        name: target.displayName,
        entityType: 'monster_instance',
        hpBefore,
        hpAfter,
        statusAfter
      },
      profile,
      defenceSource: 'monster_stored_defence',
      monsterDefence,
      attackCheck: opposed.source,
      defenceCheck: opposed.resistance,
      hit: opposed.sourceWins,
      damageDice,
      damageBonus,
      fixedDamageModifier: profile.fixedDamageModifier,
      armor: {
        name: monsterRow.armor_name || '',
        baseDefence: Number(monsterRow.armor_base_defence || 0),
        adjustment: Number(monsterRow.armor_defence_adjustment || 0),
        finalDefence: damage.effectiveDefence
      },
      damage,
      outcome
    }
  });
}

async function playerAttackRoute(request, env, combatId) {
  if (request.method !== 'POST') return baseWorker.fetch(request, env);
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  const body = await readBody(request.clone());
  const targetCombatantId = String(body?.targetCombatantId || '').trim();
  if (!targetCombatantId) return apiError('Target 必須填寫。', 400, 'VALIDATION_ERROR');

  const current = await playerCombatPayload(request, env);
  if (!current.response.ok) return current.response;
  const combat = current.payload?.combat;
  const target = (combat?.combatants || []).find(item => item.id === targetCombatantId);
  if (!target || target.entityType !== 'monster_instance') {
    return baseWorker.fetch(request, env);
  }
  return resolvePlayerMonsterAttack(request, env, combatId, body, user, current.payload, target);
}

async function reconcileGmResourceCorrection(request, env, instanceId) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  await ensureSchema(env);
  const payload = await response.json();
  const row = await env.DB.prepare('SELECT id, status, current_hp FROM monster_instances WHERE id = ? LIMIT 1').bind(instanceId).first();
  if (!row) return json(payload, response.status);
  const nextStatus = reconcileMonsterStatusFromHp(row.status, Number(row.current_hp));
  if (nextStatus !== row.status) {
    await env.DB.prepare('UPDATE monster_instances SET status = ?, updated_at = ? WHERE id = ?').bind(nextStatus, Date.now(), instanceId).run();
    if (nextStatus === 'defeated') {
      await env.DB.prepare(`
        UPDATE combatants
        SET action_available = 0, move_available = 0, updated_at = ?
        WHERE entity_type = 'monster_instance' AND entity_id = ?
          AND combat_id IN (SELECT id FROM combats WHERE status = 'active')
      `).bind(Date.now(), instanceId).run();
    }
  }
  return json({ ...payload, monsterStatus: nextStatus }, response.status);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const attackMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/attack$/);
      if (attackMatch) return await playerAttackRoute(request, env, decodeURIComponent(attackMatch[1]));

      const resourceMatch = pathname.match(/^\/api\/gm\/monster-instances\/([^/]+)\/resources$/);
      if (resourceMatch && request.method === 'PATCH') {
        return await reconcileGmResourceCorrection(request, env, decodeURIComponent(resourceMatch[1]));
      }

      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Monster Defeat resolver error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'MONSTER_DEFEAT_API_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('暫時無法完成 Player → Monster Attack。', 500, 'MONSTER_DEFEAT_SERVICE_ERROR');
    }
  }
};
