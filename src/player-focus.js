import baseWorker from './player-attack.js';
import { focusMpRecovery } from './rules.js';

let focusSchemaPromise = null;

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
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
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

async function ensureFocusSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!focusSchemaPromise) {
    focusSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_focus_action_log (
        id TEXT PRIMARY KEY,
        combat_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        turn_index INTEGER NOT NULL,
        actor_combatant_id TEXT NOT NULL,
        actor_character_id TEXT NOT NULL,
        mp_before INTEGER NOT NULL,
        mp_max INTEGER NOT NULL,
        recovery_requested INTEGER NOT NULL,
        recovery_applied INTEGER NOT NULL,
        mp_after INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_character_id) REFERENCES characters(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_player_focus_action_log_combat
        ON player_focus_action_log(combat_id, round_number, turn_index, created_at)
      `)
    ]).catch(error => {
      focusSchemaPromise = null;
      throw error;
    });
  }
  await focusSchemaPromise;
}

async function basePlayerCombat(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/player/combat', request.url), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
  }), env);
  if (!response.ok) return { response, payload: null };
  return { response, payload: await response.json() };
}

async function mpMapForCombat(env, combat) {
  const map = new Map();
  const characterIds = (combat?.combatants || [])
    .filter(item => item.entityType === 'character')
    .map(item => item.entityId);
  if (!characterIds.length) return map;
  const placeholders = characterIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT character_id, current_value, max_value
    FROM character_resources
    WHERE UPPER(key) = 'MP' AND character_id IN (${placeholders})
  `).bind(...characterIds).all();
  for (const row of rows.results || []) {
    map.set(row.character_id, {
      current: Number(row.current_value || 0),
      max: Number(row.max_value || 0)
    });
  }
  return map;
}

async function augmentPlayerCombatMp(env, payload) {
  if (!payload?.combat) return payload;
  const mpMap = await mpMapForCombat(env, payload.combat);
  const combatants = (payload.combat.combatants || []).map(item => ({
    ...item,
    mp: item.entityType === 'character' ? (mpMap.get(item.entityId) || null) : (item.mp || null)
  }));
  const currentId = payload.combat.currentCombatant?.id;
  return {
    ...payload,
    combat: {
      ...payload.combat,
      combatants,
      currentCombatant: currentId ? (combatants.find(item => item.id === currentId) || payload.combat.currentCombatant) : null
    }
  };
}

async function playerCombatOverview(request, env) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const payload = await response.json();
  return json(await augmentPlayerCombatMp(env, payload), response.status);
}

async function playerFocus(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  await ensureFocusSchema(env);

  const state = await basePlayerCombat(request, env);
  if (!state.response.ok) return state.response;
  const combat = state.payload?.combat;
  if (!combat || combat.id !== combatId || combat.status !== 'active') {
    return apiError('找不到有效 Combat。', 404, 'COMBAT_NOT_FOUND');
  }

  const actor = combat.currentCombatant;
  if (!combat.isOwnTurn || !actor || actor.entityType !== 'character' || actor.controllerUserId !== user.id) {
    return apiError('而家唔係你控制角色嘅 Turn。', 403, 'NOT_OWN_TURN');
  }
  if (!actor.actionAvailable) return apiError('本 Turn 嘅 Action 已經使用。', 409, 'ACTION_ALREADY_SPENT');
  if (String(actor.lifeState || 'alive').toLowerCase() !== 'alive' || actor.characterLocked) {
    return apiError('倒地、瀕死或死亡 Character 不能使用集中。', 409, 'ACTOR_NOT_ACTIONABLE');
  }

  const mpRow = await env.DB.prepare(`
    SELECT id, current_value, max_value
    FROM character_resources
    WHERE character_id = ? AND UPPER(key) = 'MP'
    ORDER BY sort_order, id
    LIMIT 1
  `).bind(actor.entityId).first();
  if (!mpRow) return apiError('Character 缺少 MP resource。', 409, 'ACTOR_MP_REQUIRED');

  const mpBefore = Math.max(0, Number(mpRow.current_value || 0));
  const mpMax = Math.max(0, Number(mpRow.max_value || 0));
  if (!Number.isFinite(mpBefore) || !Number.isFinite(mpMax) || mpBefore > mpMax) {
    return apiError('Character MP state 無效。', 409, 'ACTOR_MP_INVALID');
  }
  if (mpBefore >= mpMax) return apiError('MP 已經全滿，毋須使用集中。', 409, 'MP_ALREADY_FULL');

  const recoveryRequested = focusMpRecovery(mpMax);
  const recoveryApplied = Math.min(recoveryRequested, mpMax - mpBefore);
  const mpAfter = Math.min(mpMax, mpBefore + recoveryApplied);
  if (recoveryApplied <= 0) return apiError('目前沒有可回復嘅 MP。', 409, 'MP_ALREADY_FULL');

  const expectedRound = Number(combat.roundNumber);
  const expectedIndex = Number(combat.currentTurnIndex);
  const focusId = `focus_${crypto.randomUUID()}`;
  const now = Date.now();

  const results = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO player_focus_action_log (
        id, combat_id, round_number, turn_index,
        actor_combatant_id, actor_character_id,
        mp_before, mp_max, recovery_requested, recovery_applied, mp_after, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM combats
        WHERE id = ? AND status = 'active' AND round_number = ? AND current_turn_index = ?
      )
      AND EXISTS (
        SELECT 1 FROM combatants
        WHERE id = ? AND combat_id = ? AND controller_user_id = ?
          AND entity_type = 'character' AND entity_id = ? AND action_available = 1
      )
      AND EXISTS (
        SELECT 1 FROM character_life_states
        WHERE character_id = ? AND life_state = 'alive' AND character_locked = 0
      )
      AND EXISTS (
        SELECT 1 FROM character_resources
        WHERE id = ? AND character_id = ? AND UPPER(key) = 'MP'
          AND current_value = ? AND max_value = ? AND current_value < max_value
      )
    `).bind(
      focusId, combat.id, expectedRound, expectedIndex,
      actor.id, actor.entityId,
      mpBefore, mpMax, recoveryRequested, recoveryApplied, mpAfter, now,
      combat.id, expectedRound, expectedIndex,
      actor.id, combat.id, user.id, actor.entityId,
      actor.entityId,
      mpRow.id, actor.entityId, mpBefore, mpMax
    ),
    env.DB.prepare(`
      UPDATE combatants
      SET action_available = 0, updated_at = ?
      WHERE id = ? AND combat_id = ? AND action_available = 1
        AND EXISTS (SELECT 1 FROM player_focus_action_log WHERE id = ?)
    `).bind(now, actor.id, combat.id, focusId),
    env.DB.prepare(`
      UPDATE character_resources
      SET current_value = ?
      WHERE id = ? AND character_id = ? AND UPPER(key) = 'MP'
        AND current_value = ? AND max_value = ?
        AND EXISTS (SELECT 1 FROM player_focus_action_log WHERE id = ?)
    `).bind(mpAfter, mpRow.id, actor.entityId, mpBefore, mpMax, focusId)
  ]);

  const reservationChanges = Number(results?.[0]?.meta?.changes || 0);
  const actionChanges = Number(results?.[1]?.meta?.changes || 0);
  const mpChanges = Number(results?.[2]?.meta?.changes || 0);
  if (reservationChanges !== 1) {
    return apiError('Combat state 已改變，集中未執行。', 409, 'COMBAT_STATE_CHANGED');
  }
  if (actionChanges !== 1 || mpChanges !== 1) {
    throw Object.assign(new Error('Focus transaction did not update both Action and MP.'), {
      code: 'FOCUS_TRANSACTION_INCONSISTENT'
    });
  }

  const refreshed = await basePlayerCombat(request, env);
  if (!refreshed.response.ok) return refreshed.response;
  const payload = await augmentPlayerCombatMp(env, refreshed.payload);
  return json({
    ...payload,
    focus: {
      actor: {
        combatantId: actor.id,
        characterId: actor.entityId,
        name: actor.displayName
      },
      mpBefore,
      mpMax,
      recoveryRequested,
      recoveryApplied,
      mpAfter,
      actionSpent: true
    }
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/player/combat' && request.method === 'GET') {
        return await playerCombatOverview(request, env);
      }

      const focusMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/focus$/);
      if (focusMatch) return await playerFocus(request, env, decodeURIComponent(focusMatch[1]));

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Player Focus resolver error', {
        path: pathname,
        code: error?.code || '',
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'PLAYER_FOCUS_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('暫時無法完成集中。', 500, error?.code || 'PLAYER_FOCUS_SERVICE_ERROR');
    }
  }
};
