export function defaultLifeState(characterId) {
  return {
    characterId,
    lifeState: 'alive',
    characterLocked: false,
    dyingRoundsRemaining: null,
    diedAt: null,
    lastDyingTickCombatId: null,
    lastDyingTickRound: null
  };
}

export async function loadCharacterLifeState(env, characterId) {
  const row = await env.DB.prepare(`
    SELECT character_id, life_state, character_locked, dying_rounds_remaining,
           died_at, last_dying_tick_combat_id, last_dying_tick_round
    FROM character_life_states
    WHERE character_id = ?
    LIMIT 1
  `).bind(characterId).first();
  if (!row) return defaultLifeState(characterId);
  return {
    characterId: row.character_id,
    lifeState: String(row.life_state || 'alive').toLowerCase(),
    characterLocked: Boolean(row.character_locked),
    dyingRoundsRemaining: row.dying_rounds_remaining === null ? null : Number(row.dying_rounds_remaining),
    diedAt: row.died_at,
    lastDyingTickCombatId: row.last_dying_tick_combat_id,
    lastDyingTickRound: row.last_dying_tick_round === null ? null : Number(row.last_dying_tick_round)
  };
}

export async function ensureLifeRow(env, characterId, now = Date.now()) {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO character_life_states (
      character_id, life_state, character_locked, dying_rounds_remaining,
      died_at, last_dying_tick_combat_id, last_dying_tick_round, updated_at
    ) VALUES (?, 'alive', 0, NULL, NULL, NULL, NULL, ?)
  `).bind(characterId, now).run();
  return loadCharacterLifeState(env, characterId);
}

export async function advanceCombatTurnWithLife(env, combat) {
  if (!combat || combat.status !== 'active' || !combat.currentCombatant) {
    throw Object.assign(new Error('Current Combat Turn state 無效。'), { status: 409, code: 'CURRENT_TURN_INVALID' });
  }

  const current = combat.currentCombatant;
  const expectedRound = combat.roundNumber;
  const expectedIndex = combat.currentTurnIndex;
  const lastIndex = combat.combatants.length - 1;
  const wrapsRound = expectedIndex >= lastIndex;
  const now = Date.now();
  const statements = [];

  if (current.entityType === 'character') {
    statements.push(env.DB.prepare(`
      UPDATE character_life_states
      SET dying_rounds_remaining = MAX(0, dying_rounds_remaining - 1),
          last_dying_tick_combat_id = ?,
          last_dying_tick_round = ?,
          updated_at = ?
      WHERE character_id = ?
        AND life_state = 'dying'
        AND dying_rounds_remaining IS NOT NULL
        AND dying_rounds_remaining > 0
        AND NOT (
          COALESCE(last_dying_tick_combat_id, '') = ?
          AND COALESCE(last_dying_tick_round, -1) = ?
        )
        AND EXISTS (
          SELECT 1 FROM combats
          WHERE id = ?
            AND status = 'active'
            AND round_number = ?
            AND current_turn_index = ?
        )
    `).bind(combat.id, expectedRound, now, current.entityId, combat.id, expectedRound, combat.id, expectedRound, expectedIndex));

    statements.push(env.DB.prepare(`
      UPDATE character_life_states
      SET life_state = 'dead',
          character_locked = 1,
          died_at = COALESCE(died_at, ?),
          updated_at = ?
      WHERE character_id = ?
        AND life_state = 'dying'
        AND dying_rounds_remaining <= 0
        AND last_dying_tick_combat_id = ?
        AND last_dying_tick_round = ?
        AND EXISTS (
          SELECT 1 FROM combats
          WHERE id = ?
            AND status = 'active'
            AND round_number = ?
            AND current_turn_index = ?
        )
    `).bind(now, now, current.entityId, combat.id, expectedRound, combat.id, expectedRound, expectedIndex));
  }

  const turnMutationIndex = statements.length;
  if (!wrapsRound) {
    statements.push(env.DB.prepare(`
      UPDATE combatants
      SET action_available = 0,
          move_available = 0,
          turn_completed = 1,
          updated_at = ?
      WHERE id = ?
        AND combat_id = ?
        AND EXISTS (
          SELECT 1 FROM combats
          WHERE id = ?
            AND status = 'active'
            AND round_number = ?
            AND current_turn_index = ?
        )
    `).bind(now, current.id, combat.id, combat.id, expectedRound, expectedIndex));

    statements.push(env.DB.prepare(`
      UPDATE combats
      SET current_turn_index = ?, updated_at = ?
      WHERE id = ?
        AND status = 'active'
        AND round_number = ?
        AND current_turn_index = ?
    `).bind(expectedIndex + 1, now, combat.id, expectedRound, expectedIndex));
  } else {
    statements.push(env.DB.prepare(`
      UPDATE combatants
      SET action_available = 1,
          move_available = 1,
          turn_completed = 0,
          updated_at = ?
      WHERE combat_id = ?
        AND EXISTS (
          SELECT 1 FROM combats
          WHERE id = ?
            AND status = 'active'
            AND round_number = ?
            AND current_turn_index = ?
        )
    `).bind(now, combat.id, combat.id, expectedRound, expectedIndex));

    statements.push(env.DB.prepare(`
      UPDATE combats
      SET round_number = ?, current_turn_index = 0, updated_at = ?
      WHERE id = ?
        AND status = 'active'
        AND round_number = ?
        AND current_turn_index = ?
    `).bind(expectedRound + 1, now, combat.id, expectedRound, expectedIndex));
  }

  const results = await env.DB.batch(statements);
  const turnResult = results[turnMutationIndex];
  const combatResult = results[turnMutationIndex + 1];
  if (Number(turnResult?.meta?.changes || 0) < 1 || Number(combatResult?.meta?.changes || 0) !== 1) {
    throw Object.assign(new Error('Combat state 已經由另一個操作更新，請重新載入。'), {
      status: 409,
      code: 'COMBAT_STATE_CHANGED'
    });
  }

  return { roundAdvanced: wrapsRound };
}
