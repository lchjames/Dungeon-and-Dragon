import baseWorker from './player-map-gateway.js';
import { resolveRestRecovery, validateRestChoice } from './rest-rules.js';

let restSchemaPromise = null;
const REST_STATUSES = new Set(['active', 'completed', 'cancelled', 'combat_interrupted']);

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

async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

async function currentUser(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.user || null;
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (String(user.status || '').toLowerCase() !== 'active') {
    throw Object.assign(new Error('此 User 目前不可使用 Rest。'), { status: 403, code: 'USER_NOT_ACTIVE' });
  }
  return user;
}

async function ensureRestSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!restSchemaPromise) {
    restSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_rest_state (
        character_id TEXT PRIMARY KEY,
        rest_session_id TEXT NOT NULL,
        map_instance_id TEXT NOT NULL,
        rest_type TEXT NOT NULL CHECK (rest_type IN ('short', 'long')),
        resource_key TEXT NOT NULL CHECK (resource_key IN ('HP', 'MP')),
        started_round INTEGER NOT NULL CHECK (started_round >= 1),
        progress_rounds INTEGER NOT NULL CHECK (progress_rounds >= 1),
        required_rounds INTEGER NOT NULL CHECK (required_rounds IN (2, 5)),
        last_progress_round INTEGER NOT NULL CHECK (last_progress_round >= 1),
        status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled', 'combat_interrupted')),
        recovery_applied INTEGER NOT NULL DEFAULT 0 CHECK (recovery_applied >= 0),
        completed_round INTEGER,
        interrupted_reason TEXT,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_rest_log (
        id TEXT PRIMARY KEY,
        rest_session_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        map_instance_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('started', 'progressed', 'completed', 'cancelled', 'combat_interrupted')),
        rest_type TEXT NOT NULL CHECK (rest_type IN ('short', 'long')),
        resource_key TEXT NOT NULL CHECK (resource_key IN ('HP', 'MP')),
        progress_rounds INTEGER NOT NULL,
        required_rounds INTEGER NOT NULL,
        recovery_applied INTEGER NOT NULL DEFAULT 0,
        detail TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_character_rest_active ON character_rest_state(status, map_instance_id, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_character_rest_log_character ON character_rest_log(character_id, created_at)')
    ]).catch(error => {
      restSchemaPromise = null;
      throw error;
    });
  }
  await restSchemaPromise;
}

function mapRest(row) {
  if (!row) return null;
  const status = REST_STATUSES.has(String(row.status || '')) ? row.status : 'cancelled';
  return {
    sessionId: row.rest_session_id,
    characterId: row.character_id,
    mapInstanceId: row.map_instance_id,
    restType: row.rest_type,
    resource: row.resource_key,
    startedRound: Number(row.started_round),
    progressRounds: Number(row.progress_rounds),
    requiredRounds: Number(row.required_rounds),
    lastProgressRound: Number(row.last_progress_round),
    status,
    active: status === 'active',
    recoveryApplied: Number(row.recovery_applied || 0),
    completedRound: row.completed_round === null || row.completed_round === undefined ? null : Number(row.completed_round),
    interruptedReason: row.interrupted_reason || '',
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

async function restState(env, characterId) {
  await ensureRestSchema(env);
  return env.DB.prepare(`
    SELECT * FROM character_rest_state WHERE character_id = ? LIMIT 1
  `).bind(characterId).first();
}

async function activeRestState(env, characterId) {
  await ensureRestSchema(env);
  return env.DB.prepare(`
    SELECT * FROM character_rest_state WHERE character_id = ? AND status = 'active' LIMIT 1
  `).bind(characterId).first();
}

async function activeCombat(env) {
  try {
    return await env.DB.prepare(`SELECT id, round_number FROM combats WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`).first();
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (message.includes('no such table') && message.includes('combats')) return null;
    throw error;
  }
}

async function writeLog(env, row, eventType, roundNumber, { recoveryApplied = 0, detail = '' } = {}) {
  await env.DB.prepare(`
    INSERT INTO character_rest_log (
      id, rest_session_id, character_id, map_instance_id, round_number,
      event_type, rest_type, resource_key, progress_rounds, required_rounds,
      recovery_applied, detail, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `restlog_${crypto.randomUUID()}`,
    row.rest_session_id,
    row.character_id,
    row.map_instance_id,
    Number(roundNumber || row.last_progress_round || row.started_round || 1),
    eventType,
    row.rest_type,
    row.resource_key,
    Number(row.progress_rounds || 0),
    Number(row.required_rounds || 0),
    Number(recoveryApplied || 0),
    String(detail || '').slice(0, 500),
    Date.now()
  ).run();
}

async function interruptActiveRests(env, reason = 'combat_started') {
  await ensureRestSchema(env);
  const rows = await env.DB.prepare(`SELECT * FROM character_rest_state WHERE status = 'active' ORDER BY started_at, character_id`).all();
  if (!(rows.results || []).length) return 0;
  let interrupted = 0;
  for (const row of rows.results || []) {
    const now = Date.now();
    const result = await env.DB.prepare(`
      UPDATE character_rest_state
      SET status = 'combat_interrupted', interrupted_reason = ?, completed_at = ?, updated_at = ?
      WHERE character_id = ? AND rest_session_id = ? AND status = 'active'
    `).bind(reason, now, now, row.character_id, row.rest_session_id).run();
    if (Number(result?.meta?.changes || 0) === 1) {
      interrupted += 1;
      await writeLog(env, { ...row, status: 'combat_interrupted' }, 'combat_interrupted', row.last_progress_round, { detail: reason });
    }
  }
  return interrupted;
}

async function cancelActiveRest(env, row, reason = 'player_cancelled', eventType = 'cancelled') {
  const now = Date.now();
  const status = eventType === 'combat_interrupted' ? 'combat_interrupted' : 'cancelled';
  const result = await env.DB.prepare(`
    UPDATE character_rest_state
    SET status = ?, interrupted_reason = ?, completed_at = ?, updated_at = ?
    WHERE character_id = ? AND rest_session_id = ? AND status = 'active'
  `).bind(status, reason, now, now, row.character_id, row.rest_session_id).run();
  if (Number(result?.meta?.changes || 0) === 1) {
    await writeLog(env, { ...row, status }, eventType, row.last_progress_round, { detail: reason });
    return true;
  }
  return false;
}

async function restRuntimeEligible(env, row) {
  const result = await env.DB.prepare(`
    SELECT c.status AS character_status,
           COALESCE(cls.life_state, 'alive') AS life_state,
           COALESCE(cls.character_locked, 0) AS character_locked,
           CASE WHEN rep.id IS NULL THEN 0 ELSE 1 END AS positioned,
           COALESCE(rmi.status, '') AS map_status
    FROM characters c
    LEFT JOIN character_life_states cls ON cls.character_id = c.id
    LEFT JOIN runtime_entity_positions rep
      ON rep.entity_type = 'character' AND rep.entity_id = c.id AND rep.map_instance_id = ?
    LEFT JOIN runtime_map_instances rmi ON rmi.id = ?
    WHERE c.id = ?
    LIMIT 1
  `).bind(row.map_instance_id, row.map_instance_id, row.character_id).first();
  return Boolean(result
    && result.character_status === 'active'
    && String(result.life_state || '').toLowerCase() === 'alive'
    && !Boolean(result.character_locked)
    && Boolean(result.positioned)
    && result.map_status === 'active');
}

async function completeRest(env, row, roundNumber) {
  const resource = await env.DB.prepare(`
    SELECT id, current_value, max_value
    FROM character_resources
    WHERE character_id = ? AND UPPER(key) = ?
    ORDER BY sort_order, id
    LIMIT 1
  `).bind(row.character_id, row.resource_key).first();
  if (!resource) {
    await cancelActiveRest(env, row, 'resource_missing');
    return { completed: false, recoveryApplied: 0 };
  }

  const recovery = resolveRestRecovery({
    restType: row.rest_type,
    resource: row.resource_key,
    current: resource.current_value,
    max: resource.max_value
  });
  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE character_resources
      SET current_value = MIN(max_value, current_value + ?)
      WHERE id = ? AND character_id = ?
        AND EXISTS (
          SELECT 1 FROM character_rest_state
          WHERE character_id = ? AND rest_session_id = ? AND status = 'active'
            AND progress_rounds >= required_rounds
        )
    `).bind(
      recovery.recoveryRequested,
      resource.id,
      row.character_id,
      row.character_id,
      row.rest_session_id
    ),
    env.DB.prepare(`
      UPDATE character_rest_state
      SET status = 'completed', recovery_applied = ?, completed_round = ?,
          completed_at = ?, updated_at = ?, interrupted_reason = NULL
      WHERE character_id = ? AND rest_session_id = ? AND status = 'active'
        AND progress_rounds >= required_rounds
    `).bind(
      recovery.recoveryApplied,
      roundNumber,
      now,
      now,
      row.character_id,
      row.rest_session_id
    )
  ]);
  if (Number(results?.[1]?.meta?.changes || 0) !== 1) return { completed: false, recoveryApplied: 0 };
  const completed = await restState(env, row.character_id);
  await writeLog(env, completed || { ...row, progress_rounds: row.required_rounds }, 'completed', roundNumber, {
    recoveryApplied: recovery.recoveryApplied,
    detail: `${row.resource_key} recovery completed`
  });
  return { completed: true, recoveryApplied: recovery.recoveryApplied };
}

async function pendingExplorationActors(env, mapInstanceId, roundNumber) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS pending
    FROM runtime_entity_positions rep
    JOIN characters c ON c.id = rep.entity_id
    LEFT JOIN character_life_states cls ON cls.character_id = c.id
    LEFT JOIN runtime_exploration_character_state ecs
      ON ecs.map_instance_id = rep.map_instance_id AND ecs.character_id = c.id
    WHERE rep.map_instance_id = ?
      AND rep.entity_type = 'character'
      AND c.status = 'active'
      AND c.owner_user_id IS NOT NULL
      AND COALESCE(cls.life_state, 'alive') = 'alive'
      AND (
        ecs.character_id IS NULL OR ecs.round_number <> ? OR ecs.turn_completed <> 1
      )
  `).bind(mapInstanceId, roundNumber).first();
  return Number(row?.pending || 0);
}

async function advanceExplorationRound(env, mapInstanceId, roundNumber) {
  const nextRound = roundNumber + 1;
  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE runtime_exploration_state
      SET round_number = ?, updated_at = ?
      WHERE map_instance_id = ? AND round_number = ?
    `).bind(nextRound, now, mapInstanceId, roundNumber),
    env.DB.prepare(`
      UPDATE runtime_exploration_character_state
      SET round_number = ?, action_available = 1, move_available = 1,
          turn_completed = 0, updated_at = ?
      WHERE map_instance_id = ? AND round_number = ?
    `).bind(nextRound, now, mapInstanceId, roundNumber)
  ]);
  return Number(results?.[0]?.meta?.changes || 0) === 1;
}

async function occupyRestRound(env, row, roundNumber) {
  await env.DB.prepare(`
    UPDATE runtime_exploration_character_state
    SET action_available = 0, move_available = 0, turn_completed = 1, updated_at = ?
    WHERE map_instance_id = ? AND character_id = ? AND round_number = ?
      AND NOT EXISTS (SELECT 1 FROM combats WHERE status = 'active')
  `).bind(Date.now(), row.map_instance_id, row.character_id, roundNumber).run();
}

async function settleRestRounds(env, mapInstanceId) {
  await ensureRestSchema(env);
  if (await activeCombat(env)) {
    await interruptActiveRests(env, 'combat_started');
    return { roundAdvanced: false, interrupted: true };
  }

  let roundAdvanced = false;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const root = await env.DB.prepare(`
      SELECT round_number FROM runtime_exploration_state WHERE map_instance_id = ? LIMIT 1
    `).bind(mapInstanceId).first();
    if (!root) return { roundAdvanced, interrupted: false };
    const roundNumber = Number(root.round_number || 1);
    const activeRows = await env.DB.prepare(`
      SELECT * FROM character_rest_state
      WHERE map_instance_id = ? AND status = 'active'
      ORDER BY started_at, character_id
    `).bind(mapInstanceId).all();
    if (!(activeRows.results || []).length) return { roundAdvanced, interrupted: false };

    for (const original of activeRows.results || []) {
      if (!await restRuntimeEligible(env, original)) {
        await cancelActiveRest(env, original, 'runtime_context_changed');
        await occupyRestRound(env, original, roundNumber);
        continue;
      }

      let row = original;
      if (roundNumber > Number(row.last_progress_round)) {
        const delta = roundNumber - Number(row.last_progress_round);
        const nextProgress = Math.min(Number(row.required_rounds), Number(row.progress_rounds) + delta);
        const now = Date.now();
        const progressed = await env.DB.prepare(`
          UPDATE character_rest_state
          SET progress_rounds = ?, last_progress_round = ?, updated_at = ?
          WHERE character_id = ? AND rest_session_id = ? AND status = 'active'
            AND last_progress_round = ?
        `).bind(
          nextProgress,
          roundNumber,
          now,
          row.character_id,
          row.rest_session_id,
          row.last_progress_round
        ).run();
        if (Number(progressed?.meta?.changes || 0) === 1) {
          row = await activeRestState(env, row.character_id) || row;
          await writeLog(env, row, 'progressed', roundNumber, { detail: `Rest progress ${row.progress_rounds}/${row.required_rounds}` });
        } else {
          row = await activeRestState(env, row.character_id) || await restState(env, row.character_id) || row;
        }
      }

      await occupyRestRound(env, row, roundNumber);
      if (String(row.status || '') === 'active' && Number(row.progress_rounds) >= Number(row.required_rounds)) {
        await completeRest(env, row, roundNumber);
      }
    }

    const pending = await pendingExplorationActors(env, mapInstanceId, roundNumber);
    if (pending > 0) return { roundAdvanced, interrupted: false };
    if (!await advanceExplorationRound(env, mapInstanceId, roundNumber)) {
      return { roundAdvanced, interrupted: false };
    }
    roundAdvanced = true;
  }
  return { roundAdvanced, interrupted: false };
}

async function advanceIfRoundComplete(env, mapInstanceId, roundNumber) {
  if (await activeCombat(env)) return false;
  if (await pendingExplorationActors(env, mapInstanceId, roundNumber) > 0) return false;
  return advanceExplorationRound(env, mapInstanceId, roundNumber);
}

async function baseCharacterContext(request, env, characterId) {
  return baseWorker.fetch(new Request(new URL(`/api/player/world/characters/${encodeURIComponent(characterId)}`, request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
}

async function augmentContext(env, payload, characterId) {
  const row = await restState(env, characterId);
  const rest = mapRest(row);
  const result = { ...payload, rest };
  if (rest?.active && result?.turn?.mode === 'exploration') {
    result.turn = {
      ...result.turn,
      actionAvailable: false,
      moveAvailable: false,
      turnCompleted: true
    };
    result.legalMoves = [];
  }
  return result;
}

async function refreshedContext(request, env, characterId, extras = {}) {
  const response = await baseCharacterContext(request, env, characterId);
  if (!response.ok) return response;
  const payload = await response.json();
  return json({ ...(await augmentContext(env, payload, characterId)), ...extras });
}

async function playerCharacterContext(request, env, characterId) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  await ensureRestSchema(env);
  let payload = await response.json();
  if (await activeCombat(env)) {
    await interruptActiveRests(env, 'combat_started');
  } else if (payload?.map?.id) {
    await settleRestRounds(env, payload.map.id);
    const refreshed = await baseCharacterContext(request, env, characterId);
    if (refreshed.ok) payload = await refreshed.json();
  }
  return json(await augmentContext(env, payload, characterId));
}

async function startRest(request, env, characterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  await ensureRestSchema(env);

  const contextResponse = await baseCharacterContext(request, env, characterId);
  if (!contextResponse.ok) return contextResponse;
  const context = await contextResponse.json();
  if (!context?.character || !context?.map) return apiError('Rest 需要 Character 位於 Active Runtime Map。', 409, 'REST_RUNTIME_MAP_REQUIRED');
  if (context.character.lifeState !== 'alive' || context.character.characterLocked || context.character.status !== 'active') {
    return apiError('只有 ALIVE、Active 且未鎖定的 Character 可以開始 Rest。', 409, 'REST_CHARACTER_NOT_ACTIONABLE');
  }
  if (context?.turn?.mode !== 'exploration' || await activeCombat(env)) {
    return apiError('Combat 期間不能開始 Short Rest / Long Rest。', 409, 'COMBAT_ACTIVE');
  }
  if (!context.turn.participant || context.turn.turnCompleted || !context.turn.actionAvailable || !context.turn.moveAvailable) {
    return apiError('Rest 必須喺尚未使用 Action / Move 的 Exploration Turn 開始。', 409, 'REST_TURN_ALREADY_USED');
  }
  if (await activeRestState(env, characterId)) return apiError('Character 已經正在 Rest。', 409, 'REST_ALREADY_ACTIVE');

  const body = await readBody(request);
  let choice;
  try {
    choice = validateRestChoice(body?.restType, body?.resource);
  } catch (error) {
    return apiError(error.message, 400, 'REST_CHOICE_INVALID');
  }

  const ownership = await env.DB.prepare(`SELECT id FROM characters WHERE id = ? AND owner_user_id = ? LIMIT 1`).bind(characterId, user.id).first();
  if (!ownership) return apiError('Character 不存在或唔屬於你。', 404, 'CHARACTER_NOT_FOUND');
  const hp = await env.DB.prepare(`
    SELECT current_value FROM character_resources
    WHERE character_id = ? AND UPPER(key) = 'HP' ORDER BY sort_order, id LIMIT 1
  `).bind(characterId).first();
  if (!hp || Number(hp.current_value || 0) <= 0) {
    return apiError('HP 0 / Down / Dying Character 不能靠普通 Rest 自行起身。', 409, 'REST_CHARACTER_NOT_ACTIONABLE');
  }
  const resource = await env.DB.prepare(`
    SELECT id FROM character_resources
    WHERE character_id = ? AND UPPER(key) = ? ORDER BY sort_order, id LIMIT 1
  `).bind(characterId, choice.resource).first();
  if (!resource) return apiError(`Character 缺少 ${choice.resource} resource。`, 409, 'REST_RESOURCE_REQUIRED');

  const roundNumber = Number(context.turn.roundNumber);
  const sessionId = `rest_${crypto.randomUUID()}`;
  const now = Date.now();
  const state = await env.DB.prepare(`
    INSERT INTO character_rest_state (
      character_id, rest_session_id, map_instance_id, rest_type, resource_key,
      started_round, progress_rounds, required_rounds, last_progress_round,
      status, recovery_applied, completed_round, interrupted_reason,
      started_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'active', 0, NULL, NULL, ?, ?, NULL)
    ON CONFLICT(character_id) DO UPDATE SET
      rest_session_id = excluded.rest_session_id,
      map_instance_id = excluded.map_instance_id,
      rest_type = excluded.rest_type,
      resource_key = excluded.resource_key,
      started_round = excluded.started_round,
      progress_rounds = 1,
      required_rounds = excluded.required_rounds,
      last_progress_round = excluded.last_progress_round,
      status = 'active',
      recovery_applied = 0,
      completed_round = NULL,
      interrupted_reason = NULL,
      started_at = excluded.started_at,
      updated_at = excluded.updated_at,
      completed_at = NULL
    WHERE character_rest_state.status <> 'active'
  `).bind(
    characterId,
    sessionId,
    context.map.id,
    choice.restType,
    choice.resource,
    roundNumber,
    choice.requiredRounds,
    roundNumber,
    now,
    now
  ).run();
  if (Number(state?.meta?.changes || 0) !== 1) return apiError('Character 已經正在 Rest。', 409, 'REST_ALREADY_ACTIVE');

  const reserved = await env.DB.prepare(`
    UPDATE runtime_exploration_character_state
    SET action_available = 0, move_available = 0, turn_completed = 1, updated_at = ?
    WHERE map_instance_id = ? AND character_id = ? AND round_number = ?
      AND action_available = 1 AND move_available = 1 AND turn_completed = 0
      AND NOT EXISTS (SELECT 1 FROM combats WHERE status = 'active')
  `).bind(now, context.map.id, characterId, roundNumber).run();
  if (Number(reserved?.meta?.changes || 0) !== 1) {
    const row = await activeRestState(env, characterId);
    if (row?.rest_session_id === sessionId) await cancelActiveRest(env, row, 'start_state_changed');
    return apiError('Exploration state 已改變，Rest 未開始。', 409, 'EXPLORATION_STATE_CHANGED');
  }

  const row = await activeRestState(env, characterId);
  await writeLog(env, row, 'started', roundNumber, { detail: 'Starting Round counts as Rest progress 1.' });
  const settled = await settleRestRounds(env, context.map.id);
  return refreshedContext(request, env, characterId, { restStarted: true, roundAdvanced: settled.roundAdvanced });
}

async function cancelRest(request, env, characterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireUser(request, env);
  await ensureRestSchema(env);
  const owned = await env.DB.prepare(`SELECT id FROM characters WHERE id = ? AND owner_user_id = ? LIMIT 1`).bind(characterId, user.id).first();
  if (!owned) return apiError('Character 不存在或唔屬於你。', 404, 'CHARACTER_NOT_FOUND');
  if (await activeCombat(env)) {
    await interruptActiveRests(env, 'combat_started');
    return apiError('Combat 已經開始；未完成 Rest 已自動中斷。', 409, 'COMBAT_ACTIVE');
  }
  const row = await activeRestState(env, characterId);
  if (!row) return apiError('Character 目前冇進行中 Rest。', 409, 'REST_NOT_ACTIVE');
  await cancelActiveRest(env, row, 'player_cancelled');
  await advanceIfRoundComplete(env, row.map_instance_id, Number(row.last_progress_round));
  return refreshedContext(request, env, characterId, { restCancelled: true });
}

async function activeRestAfterSettlement(env, characterId) {
  const row = await activeRestState(env, characterId);
  if (!row) return null;
  await settleRestRounds(env, row.map_instance_id);
  return activeRestState(env, characterId);
}

async function playerWorldMutation(request, env, characterId, operation) {
  await ensureRestSchema(env);
  const rest = await activeRestAfterSettlement(env, characterId);
  if (rest) {
    return apiError(
      operation === 'end-exploration-turn'
        ? 'Rest 已經佔用呢個 Character 當前 Exploration Turn。'
        : 'Resting Character 不能同時執行正常 Character Action / Move。',
      409,
      operation === 'end-exploration-turn' ? 'REST_OCCUPIES_TURN' : 'RESTING_CHARACTER_ACTION_BLOCKED'
    );
  }

  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  let payload = null;
  try { payload = await response.clone().json(); } catch { payload = null; }

  if (operation === 'end-exploration-turn' && payload?.map?.id) {
    const settled = await settleRestRounds(env, payload.map.id);
    const fresh = await baseCharacterContext(request, env, characterId);
    if (fresh.ok) {
      const freshPayload = await fresh.json();
      return json({
        ...(await augmentContext(env, freshPayload, characterId)),
        roundAdvanced: Boolean(payload?.roundAdvanced || settled.roundAdvanced)
      });
    }
  }
  if (payload) return json(await augmentContext(env, payload, characterId));
  return response;
}

function isCombatStartPath(pathname) {
  return pathname === '/api/gm/combat/start'
    || /^\/api\/gm\/encounters\/[^/]+\/start-combat$/.test(pathname);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const restStart = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/rest\/start$/);
      if (restStart) return await startRest(request, env, decodeURIComponent(restStart[1]));

      const restCancel = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/rest\/cancel$/);
      if (restCancel) return await cancelRest(request, env, decodeURIComponent(restCancel[1]));

      const detail = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)$/);
      if (detail && request.method === 'GET') return await playerCharacterContext(request, env, decodeURIComponent(detail[1]));

      const mutation = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/(move|consume-action|end-exploration-turn)$/);
      if (mutation && request.method === 'POST') {
        return await playerWorldMutation(request, env, decodeURIComponent(mutation[1]), mutation[2]);
      }

      if (isCombatStartPath(pathname) && request.method === 'POST') {
        const response = await baseWorker.fetch(request, env);
        if (response.ok) await interruptActiveRests(env, 'combat_started');
        return response;
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Player Rest gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'PLAYER_REST_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Player Rest service 暫時無法使用。', 500, 'PLAYER_REST_SERVICE_ERROR');
    }
  }
};
