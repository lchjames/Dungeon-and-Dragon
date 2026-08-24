import baseWorker from './combat-state.js';

const GM_ROLES = new Set(['gm', 'admin']);

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
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
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
    ? await env.DB.prepare(`
        SELECT id, status, round_number, current_turn_index,
               created_by_user_id, started_at, ended_at, updated_at
        FROM combats
        WHERE id = ?
        LIMIT 1
      `).bind(combatId).first()
    : await env.DB.prepare(`
        SELECT id, status, round_number, current_turn_index,
               created_by_user_id, started_at, ended_at, updated_at
        FROM combats
        WHERE status = 'active'
        ORDER BY started_at DESC
        LIMIT 1
      `).first();

  if (!combat) return null;

  const rows = await env.DB.prepare(`
    SELECT id, entity_type, entity_id, controller_user_id, display_name,
           dex_snapshot, initiative_order, action_available,
           move_available, turn_completed
    FROM combatants
    WHERE combat_id = ?
    ORDER BY initiative_order
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

function publicPlayerCombat(combat, userId) {
  if (!combat) return null;
  const ownsAny = combat.combatants.some(item => item.controllerUserId === userId);
  if (!ownsAny) return null;

  return {
    id: combat.id,
    status: combat.status,
    roundNumber: combat.roundNumber,
    currentTurnIndex: combat.currentTurnIndex,
    startedAt: combat.startedAt,
    updatedAt: combat.updatedAt,
    combatants: combat.combatants.map(item => ({
      ...item,
      controlledByCurrentUser: item.controllerUserId === userId,
      isCurrent: item.id === combat.currentCombatant?.id
    })),
    currentCombatant: combat.currentCombatant ? {
      ...combat.currentCombatant,
      controlledByCurrentUser: combat.currentCombatant.controllerUserId === userId,
      isCurrent: true
    } : null,
    isOwnTurn: combat.currentCombatant?.controllerUserId === userId
  };
}

function isMissingCombatTable(errorValue) {
  const message = String(errorValue?.message || errorValue).toLowerCase();
  return message.includes('no such table') && (message.includes('combats') || message.includes('combatants'));
}

async function playerCombatOverview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  const user = await requireUser(request, env);
  try {
    const combat = await loadCombat(env);
    return json({ ok: true, combat: publicPlayerCombat(combat, user.id) });
  } catch (errorValue) {
    if (isMissingCombatTable(errorValue)) return json({ ok: true, combat: null });
    throw errorValue;
  }
}

function assertActiveCombat(combat) {
  if (!combat) throw Object.assign(new Error('找不到 Combat。'), { status: 404, code: 'COMBAT_NOT_FOUND' });
  if (combat.status !== 'active') {
    throw Object.assign(new Error('此 Combat 已經結束。'), { status: 409, code: 'COMBAT_NOT_ACTIVE' });
  }
  if (!combat.currentCombatant) {
    throw Object.assign(new Error('Current Turn state 無效。'), { status: 409, code: 'CURRENT_TURN_INVALID' });
  }
}

function assertOwnCurrentTurn(combat, userId) {
  assertActiveCombat(combat);
  const current = combat.currentCombatant;
  if (current.controllerUserId !== userId || current.entityType !== 'character') {
    throw Object.assign(new Error('而家唔係你控制角色嘅 Turn。'), { status: 403, code: 'NOT_OWN_TURN' });
  }
  return current;
}

async function consumeOwnAllowance(request, env, combatId, allowance) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  const combat = await loadCombat(env, combatId);
  const current = assertOwnCurrentTurn(combat, user.id);

  const column = allowance === 'action' ? 'action_available' : 'move_available';
  const expectedRound = combat.roundNumber;
  const expectedIndex = combat.currentTurnIndex;
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE combatants
    SET ${column} = 0, updated_at = ?
    WHERE id = ?
      AND combat_id = ?
      AND controller_user_id = ?
      AND entity_type = 'character'
      AND ${column} = 1
      AND EXISTS (
        SELECT 1
        FROM combats
        WHERE id = ?
          AND status = 'active'
          AND round_number = ?
          AND current_turn_index = ?
      )
  `).bind(now, current.id, combat.id, user.id, combat.id, expectedRound, expectedIndex).run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    return apiError(
      allowance === 'action' ? 'Action 已經使用，或者 Turn state 已改變。' : 'Move 已經使用，或者 Turn state 已改變。',
      409,
      'COMBAT_STATE_CHANGED'
    );
  }

  const updated = await loadCombat(env, combat.id);
  return json({ ok: true, combat: publicPlayerCombat(updated, user.id) });
}

async function advanceTurnState(env, combat) {
  assertActiveCombat(combat);
  const current = combat.currentCombatant;
  const expectedRound = combat.roundNumber;
  const expectedIndex = combat.currentTurnIndex;
  const lastIndex = combat.combatants.length - 1;
  const wrapsRound = expectedIndex >= lastIndex;
  const now = Date.now();
  let results;

  if (!wrapsRound) {
    const nextIndex = expectedIndex + 1;
    results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE combatants
        SET action_available = 0,
            move_available = 0,
            turn_completed = 1,
            updated_at = ?
        WHERE id = ?
          AND combat_id = ?
          AND EXISTS (
            SELECT 1
            FROM combats
            WHERE id = ?
              AND status = 'active'
              AND round_number = ?
              AND current_turn_index = ?
          )
      `).bind(now, current.id, combat.id, combat.id, expectedRound, expectedIndex),
      env.DB.prepare(`
        UPDATE combats
        SET current_turn_index = ?, updated_at = ?
        WHERE id = ?
          AND status = 'active'
          AND round_number = ?
          AND current_turn_index = ?
      `).bind(nextIndex, now, combat.id, expectedRound, expectedIndex)
    ]);
  } else {
    const nextRound = expectedRound + 1;
    results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE combatants
        SET action_available = 1,
            move_available = 1,
            turn_completed = 0,
            updated_at = ?
        WHERE combat_id = ?
          AND EXISTS (
            SELECT 1
            FROM combats
            WHERE id = ?
              AND status = 'active'
              AND round_number = ?
              AND current_turn_index = ?
          )
      `).bind(now, combat.id, combat.id, expectedRound, expectedIndex),
      env.DB.prepare(`
        UPDATE combats
        SET round_number = ?, current_turn_index = 0, updated_at = ?
        WHERE id = ?
          AND status = 'active'
          AND round_number = ?
          AND current_turn_index = ?
      `).bind(nextRound, now, combat.id, expectedRound, expectedIndex)
    ]);
  }

  if (Number(results?.[0]?.meta?.changes || 0) < 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    throw Object.assign(new Error('Combat state 已經由另一個操作更新，請重新載入。'), {
      status: 409,
      code: 'COMBAT_STATE_CHANGED'
    });
  }

  return { roundAdvanced: wrapsRound, combat: await loadCombat(env, combat.id) };
}

async function endOwnTurn(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  const combat = await loadCombat(env, combatId);
  assertOwnCurrentTurn(combat, user.id);

  const transitioned = await advanceTurnState(env, combat);
  return json({
    ok: true,
    roundAdvanced: transitioned.roundAdvanced,
    combat: publicPlayerCombat(transitioned.combat, user.id)
  });
}

async function gmEndCurrentTurnV2(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  const combat = await loadCombat(env, combatId);
  assertActiveCombat(combat);
  if (!combat.combatants.length) return apiError('Combat 冇參戰者。', 409, 'COMBAT_HAS_NO_COMBATANTS');

  const transitioned = await advanceTurnState(env, combat);
  return json({ ok: true, roundAdvanced: transitioned.roundAdvanced, combat: transitioned.combat });
}

async function handlePlayerCombatApi(request, env, pathname) {
  if (pathname === '/api/player/combat') return playerCombatOverview(request, env);

  const actionMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/consume-action$/);
  if (actionMatch) return consumeOwnAllowance(request, env, decodeURIComponent(actionMatch[1]), 'action');

  const moveMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/consume-move$/);
  if (moveMatch) return consumeOwnAllowance(request, env, decodeURIComponent(moveMatch[1]), 'move');

  const endTurnMatch = pathname.match(/^\/api\/player\/combat\/([^/]+)\/end-turn$/);
  if (endTurnMatch) return endOwnTurn(request, env, decodeURIComponent(endTurnMatch[1]));

  return apiError('Not found.', 404, 'NOT_FOUND');
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/player/combat' || pathname.startsWith('/api/player/combat/')) {
        return await handlePlayerCombatApi(request, env, pathname);
      }

      const gmEndTurnMatch = pathname.match(/^\/api\/gm\/combat\/([^/]+)\/end-turn$/);
      if (gmEndTurnMatch) {
        return await gmEndCurrentTurnV2(request, env, decodeURIComponent(gmEndTurnMatch[1]));
      }

      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Player Combat control error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'PLAYER_COMBAT_API_ERROR');
      if (isMissingCombatTable(err)) return apiError('Combat runtime 尚未初始化。', 409, 'COMBAT_RUNTIME_NOT_INITIALIZED');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('暫時無法完成 Player Combat 要求。', 500, 'PLAYER_COMBAT_SERVICE_ERROR');
    }
  }
};
