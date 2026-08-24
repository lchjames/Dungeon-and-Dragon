import baseWorker from './gm-provision.js';
import { buildCombatInitiative } from './rules.js';

const GM_ROLES = new Set(['gm', 'admin']);
let combatSchemaPromise = null;

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

function numericDex(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const dex = Number(text);
  return Number.isFinite(dex) ? dex : null;
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

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) {
    throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  }
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

async function ensureCombatSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!combatSchemaPromise) {
    combatSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS combats (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        round_number INTEGER NOT NULL DEFAULT 1,
        current_turn_index INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS combatants (
        id TEXT PRIMARY KEY,
        combat_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        controller_user_id TEXT,
        display_name TEXT NOT NULL,
        dex_snapshot REAL NOT NULL,
        initiative_order INTEGER NOT NULL,
        action_available INTEGER NOT NULL DEFAULT 1,
        move_available INTEGER NOT NULL DEFAULT 1,
        turn_completed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(combat_id, entity_type, entity_id),
        UNIQUE(combat_id, initiative_order),
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (controller_user_id) REFERENCES users(id) ON DELETE SET NULL
      )`),
      env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_combat ON combats(status) WHERE status = 'active'"),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_combats_status ON combats(status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_combatants_combat_order ON combatants(combat_id, initiative_order)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_combatants_controller ON combatants(controller_user_id, combat_id)')
    ]).catch(error => {
      combatSchemaPromise = null;
      throw error;
    });
  }
  await combatSchemaPromise;
}

async function candidateCharacters(env) {
  const rows = await env.DB.prepare(`
    SELECT c.id, c.name, c.owner_user_id, c.status,
           u.display_name AS owner_display_name,
           (
             SELECT a.value
             FROM character_attributes a
             WHERE a.character_id = c.id AND UPPER(a.key) = 'DEX'
             ORDER BY a.sort_order, a.id
             LIMIT 1
           ) AS dex_value
    FROM characters c
    LEFT JOIN users u ON u.id = c.owner_user_id
    WHERE c.status = 'active'
    ORDER BY c.name COLLATE NOCASE
  `).all();

  return (rows.results || []).map(row => {
    const dex = numericDex(row.dex_value);
    return {
      id: row.id,
      name: row.name,
      ownerUserId: row.owner_user_id,
      ownerDisplayName: row.owner_display_name || 'Unassigned',
      dex,
      eligible: dex !== null
    };
  });
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

async function combatOverview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureCombatSchema(env);
  const [combat, candidates] = await Promise.all([
    loadCombat(env),
    candidateCharacters(env)
  ]);
  return json({ ok: true, combat, candidates });
}

async function selectedCharacters(env, ids) {
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT c.id, c.name, c.owner_user_id, c.status,
           (
             SELECT a.value
             FROM character_attributes a
             WHERE a.character_id = c.id AND UPPER(a.key) = 'DEX'
             ORDER BY a.sort_order, a.id
             LIMIT 1
           ) AS dex_value
    FROM characters c
    WHERE c.id IN (${placeholders})
  `).bind(...ids).all();
  return rows.results || [];
}

async function startCombat(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureCombatSchema(env);

  const active = await loadCombat(env);
  if (active) return apiError('目前已有進行中的 Combat。', 409, 'ACTIVE_COMBAT_EXISTS');

  const body = await readBody(request);
  const rawIds = Array.isArray(body?.characterIds) ? body.characterIds : [];
  const characterIds = [...new Set(rawIds.map(value => String(value || '').trim()).filter(Boolean))];
  if (characterIds.length < 1 || characterIds.length > 50) {
    return apiError('Combat 必須選擇 1–50 名 Character。', 400, 'VALIDATION_ERROR');
  }

  const rows = await selectedCharacters(env, characterIds);
  if (rows.length !== characterIds.length) {
    return apiError('部分 Character 不存在。', 400, 'COMBATANT_NOT_FOUND');
  }

  const byId = new Map(rows.map(row => [row.id, row]));
  const participants = [];
  for (const id of characterIds) {
    const row = byId.get(id);
    if (row.status !== 'active') {
      return apiError(`${row.name} 目前唔係 active Character。`, 409, 'COMBATANT_NOT_ACTIVE');
    }
    const dex = numericDex(row.dex_value);
    if (dex === null) {
      return apiError(`${row.name} 缺少有效 DEX，不能建立 Initiative。`, 409, 'COMBATANT_DEX_REQUIRED');
    }
    participants.push({
      id: row.id,
      entityId: row.id,
      controllerUserId: row.owner_user_id,
      displayName: row.name,
      dex
    });
  }

  const initiative = buildCombatInitiative(participants);
  const combatId = `combat_${crypto.randomUUID()}`;
  const now = Date.now();
  const statements = [
    env.DB.prepare(`
      INSERT INTO combats (
        id, status, round_number, current_turn_index,
        created_by_user_id, started_at, ended_at, updated_at
      ) VALUES (?, 'active', 1, 0, ?, ?, NULL, ?)
    `).bind(combatId, user.id, now, now)
  ];

  for (const participant of initiative) {
    statements.push(env.DB.prepare(`
      INSERT INTO combatants (
        id, combat_id, entity_type, entity_id, controller_user_id,
        display_name, dex_snapshot, initiative_order,
        action_available, move_available, turn_completed,
        created_at, updated_at
      ) VALUES (?, ?, 'character', ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)
    `).bind(
      `combatant_${crypto.randomUUID()}`,
      combatId,
      participant.entityId,
      participant.controllerUserId,
      participant.displayName,
      participant.dex,
      participant.initiativeOrder,
      now,
      now
    ));
  }

  try {
    await env.DB.batch(statements);
  } catch (errorValue) {
    if (String(errorValue?.message || errorValue).toLowerCase().includes('unique')) {
      return apiError('另一個 Combat 已經開始，請重新載入。', 409, 'ACTIVE_COMBAT_EXISTS');
    }
    throw errorValue;
  }

  return json({ ok: true, combat: await loadCombat(env, combatId) }, 201);
}

async function activeCombatById(env, combatId) {
  const combat = await loadCombat(env, combatId);
  if (!combat) return { error: apiError('找不到 Combat。', 404, 'COMBAT_NOT_FOUND') };
  if (combat.status !== 'active') return { error: apiError('此 Combat 已經結束。', 409, 'COMBAT_NOT_ACTIVE') };
  if (!combat.combatants.length) return { error: apiError('Combat 冇參戰者。', 409, 'COMBAT_HAS_NO_COMBATANTS') };
  return { combat };
}

async function endCurrentTurn(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureCombatSchema(env);

  const loaded = await activeCombatById(env, combatId);
  if (loaded.error) return loaded.error;
  const { combat } = loaded;
  const current = combat.currentCombatant;
  if (!current) return apiError('Current Turn state 無效。', 409, 'CURRENT_TURN_INVALID');

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
        UPDATE combats
        SET current_turn_index = ?, updated_at = ?
        WHERE id = ?
          AND status = 'active'
          AND round_number = ?
          AND current_turn_index = ?
      `).bind(nextIndex, now, combat.id, expectedRound, expectedIndex),
      env.DB.prepare(`
        UPDATE combatants
        SET action_available = 0, move_available = 0,
            turn_completed = 1, updated_at = ?
        WHERE id = ? AND combat_id = ?
          AND EXISTS (
            SELECT 1 FROM combats
            WHERE id = ? AND status = 'active'
              AND round_number = ? AND current_turn_index = ?
          )
      `).bind(now, current.id, combat.id, combat.id, expectedRound, nextIndex)
    ]);
  } else {
    const nextRound = expectedRound + 1;
    results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE combats
        SET round_number = ?, current_turn_index = 0, updated_at = ?
        WHERE id = ?
          AND status = 'active'
          AND round_number = ?
          AND current_turn_index = ?
      `).bind(nextRound, now, combat.id, expectedRound, expectedIndex),
      env.DB.prepare(`
        UPDATE combatants
        SET action_available = 1, move_available = 1,
            turn_completed = 0, updated_at = ?
        WHERE combat_id = ?
          AND EXISTS (
            SELECT 1 FROM combats
            WHERE id = ? AND status = 'active'
              AND round_number = ? AND current_turn_index = 0
          )
      `).bind(now, combat.id, combat.id, nextRound)
    ]);
  }

  if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
    return apiError('Combat state 已經由另一個操作更新，請重新載入。', 409, 'COMBAT_STATE_CHANGED');
  }

  return json({ ok: true, roundAdvanced: wrapsRound, combat: await loadCombat(env, combat.id) });
}

async function forceTurn(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureCombatSchema(env);

  const loaded = await activeCombatById(env, combatId);
  if (loaded.error) return loaded.error;
  const body = await readBody(request);
  const combatantId = String(body?.combatantId || '').trim();
  const target = loaded.combat.combatants.find(item => item.id === combatantId);
  if (!target) return apiError('指定 Combatant 不屬於此 Combat。', 400, 'COMBATANT_NOT_FOUND');

  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE combats
    SET current_turn_index = ?, updated_at = ?
    WHERE id = ? AND status = 'active'
  `).bind(target.initiativeOrder, now, combatId).run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    return apiError('Combat state 已經改變，請重新載入。', 409, 'COMBAT_STATE_CHANGED');
  }

  return json({ ok: true, combat: await loadCombat(env, combatId) });
}

async function endCombat(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureCombatSchema(env);

  const loaded = await activeCombatById(env, combatId);
  if (loaded.error) return loaded.error;
  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE combats
    SET status = 'ended', ended_at = ?, updated_at = ?
    WHERE id = ? AND status = 'active'
  `).bind(now, now, combatId).run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    return apiError('Combat state 已改變，請重新載入。', 409, 'COMBAT_STATE_CHANGED');
  }
  return json({ ok: true, combat: await loadCombat(env, combatId) });
}

async function handleCombatApi(request, env, pathname) {
  if (pathname === '/api/gm/combat') return combatOverview(request, env);
  if (pathname === '/api/gm/combat/start') return startCombat(request, env);

  const endTurnMatch = pathname.match(/^\/api\/gm\/combat\/([^/]+)\/end-turn$/);
  if (endTurnMatch) return endCurrentTurn(request, env, decodeURIComponent(endTurnMatch[1]));

  const forceTurnMatch = pathname.match(/^\/api\/gm\/combat\/([^/]+)\/force-turn$/);
  if (forceTurnMatch) return forceTurn(request, env, decodeURIComponent(forceTurnMatch[1]));

  const endMatch = pathname.match(/^\/api\/gm\/combat\/([^/]+)\/end$/);
  if (endMatch) return endCombat(request, env, decodeURIComponent(endMatch[1]));

  return apiError('Not found.', 404, 'NOT_FOUND');
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/combat' || pathname.startsWith('/api/gm/combat/')) {
        return await handleCombatApi(request, env, pathname);
      }
      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Combat state engine error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'COMBAT_API_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('暫時無法完成 Combat 要求。', 500, 'COMBAT_SERVICE_ERROR');
    }
  }
};
