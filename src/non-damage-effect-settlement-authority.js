import { ensureOpposedD100Authority } from './opposed-d100-authority.js';
import { NON_DAMAGE_EFFECT_SETTLEMENT_SCHEMA } from './non-damage-effect-settlement-schema.js';
import { resolveNonDamageEffectSettlement } from './non-damage-effect-settlement-rules.js';

let schemaPromise = null;

function fail(message, status = 400, code = 'NON_DAMAGE_EFFECT_SETTLEMENT_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

function text(value, max, field, required = false) {
  const output = String(value ?? '').trim().normalize('NFKC');
  if (required && !output) throw fail(`${field} is required.`, 400, 'NON_DAMAGE_EFFECT_SETTLEMENT_VALIDATION_ERROR');
  if (output.length > max) throw fail(`${field} is too long.`, 400, 'NON_DAMAGE_EFFECT_SETTLEMENT_VALIDATION_ERROR');
  return output;
}

function contextText(value) {
  const context = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const encoded = JSON.stringify(context);
  if (new TextEncoder().encode(encoded).byteLength > 8192) {
    throw fail('Settlement context is too large.', 400, 'NON_DAMAGE_EFFECT_SETTLEMENT_VALIDATION_ERROR');
  }
  return encoded;
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function expectedExtreme(rawRoll) {
  if (Number(rawRoll) === 100) return 'GREAT_SUCCESS';
  if (Number(rawRoll) === 1) return 'GREAT_FAILURE';
  return 'NONE';
}

function settlementFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    opposedCheckId: row.opposed_check_id,
    sourceCheckId: row.source_check_id,
    resistanceCheckId: row.resistance_check_id,
    sourceCharacterId: row.source_character_id,
    sourceCharacterName: row.source_character_name || null,
    resistanceCharacterId: row.resistance_character_id,
    resistanceCharacterName: row.resistance_character_name || null,
    comparison: row.comparison,
    sourceRawRoll: Number(row.source_raw_roll),
    resistanceRawRoll: Number(row.resistance_raw_roll),
    sourceResultValue: Number(row.source_result_value),
    resistanceResultValue: Number(row.resistance_result_value),
    resultGap: Number(row.result_gap),
    narrativeGap: Number(row.narrative_gap),
    outcome: row.outcome,
    originalTargetResolution: row.original_target_resolution,
    primaryEffectMultiplier: Number(row.primary_effect_multiplier),
    sourceGreatSuccess: Boolean(row.source_great_success),
    sourceGreatSuccessApplied: Boolean(row.source_great_success_applied),
    sourceGreatFailure: Boolean(row.source_great_failure),
    defenseGreatSuccess: Boolean(row.defense_great_success),
    defenseGreatFailure: Boolean(row.defense_great_failure),
    doubleFailureOverride: Boolean(row.double_failure_override),
    gmResolutionRequired: Boolean(row.gm_resolution_required),
    meaningfulReason: row.meaningful_reason,
    context: parseJson(row.context_json),
    actorUserId: row.actor_user_id || null,
    createdAt: Number(row.created_at)
  };
}

async function getSettlementByOpposedCheck(env, opposedCheckId) {
  return env.DB.prepare(`SELECT s.*, sc.name source_character_name, rc.name resistance_character_name
    FROM non_damage_effect_settlement_log s
    LEFT JOIN characters sc ON sc.id=s.source_character_id
    LEFT JOIN characters rc ON rc.id=s.resistance_character_id
    WHERE s.opposed_check_id=? LIMIT 1`).bind(opposedCheckId).first();
}

async function loadOpposedAudit(env, opposedCheckId) {
  const id = text(opposedCheckId, 200, 'Opposed Check ID', true);
  const row = await env.DB.prepare(`SELECT
      o.id opposed_check_id,
      o.source_check_id,
      o.resistance_check_id,
      o.source_character_id,
      o.resistance_character_id,
      o.comparison,
      o.source_strictly_breaks_resistance,
      o.resistance_priority_on_tie,
      s.raw_roll source_raw_roll,
      s.result_value source_result_value,
      s.extreme_result source_extreme_result,
      r.raw_roll resistance_raw_roll,
      r.result_value resistance_result_value,
      r.extreme_result resistance_extreme_result
    FROM basic_skill_opposed_check_log o
    JOIN character_skill_check_log s ON s.id=o.source_check_id
    JOIN character_skill_check_log r ON r.id=o.resistance_check_id
    WHERE o.id=? LIMIT 1`).bind(id).first();
  if (!row) throw fail('Opposed D100 audit not found.', 404, 'OPPOSED_D100_AUDIT_NOT_FOUND');
  return row;
}

function verifyOpposedAudit(row, resolution) {
  if (
    row.comparison !== resolution.comparison ||
    Boolean(row.source_strictly_breaks_resistance) !== resolution.sourceStrictlyBreaksResistance ||
    Boolean(row.resistance_priority_on_tie) !== resolution.resistancePriorityOnTie
  ) {
    throw fail('Opposed D100 audit does not match canonical Result comparison.', 409, 'NON_DAMAGE_EFFECT_SETTLEMENT_AUDIT_MISMATCH');
  }
  if (
    row.source_extreme_result !== expectedExtreme(row.source_raw_roll) ||
    row.resistance_extreme_result !== expectedExtreme(row.resistance_raw_roll)
  ) {
    throw fail('Opposed D100 extreme markers do not match raw rolls.', 409, 'NON_DAMAGE_EFFECT_SETTLEMENT_EXTREME_MISMATCH');
  }
}

export async function ensureNonDamageEffectSettlementAuthority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  await ensureOpposedD100Authority(env);
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(NON_DAMAGE_EFFECT_SETTLEMENT_SCHEMA.map(sql => env.DB.prepare(sql)))
      .catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

export async function listNonDamageEffectSettlements(env, { characterId = '', limit = 50 } = {}) {
  await ensureNonDamageEffectSettlementAuthority(env);
  const filter = text(characterId, 200, 'Character ID');
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  const result = filter
    ? await env.DB.prepare(`SELECT s.*, sc.name source_character_name, rc.name resistance_character_name
        FROM non_damage_effect_settlement_log s
        LEFT JOIN characters sc ON sc.id=s.source_character_id
        LEFT JOIN characters rc ON rc.id=s.resistance_character_id
        WHERE s.source_character_id=? OR s.resistance_character_id=?
        ORDER BY s.created_at DESC, s.id DESC LIMIT ?`).bind(filter, filter, safeLimit).all()
    : await env.DB.prepare(`SELECT s.*, sc.name source_character_name, rc.name resistance_character_name
        FROM non_damage_effect_settlement_log s
        LEFT JOIN characters sc ON sc.id=s.source_character_id
        LEFT JOIN characters rc ON rc.id=s.resistance_character_id
        ORDER BY s.created_at DESC, s.id DESC LIMIT ?`).bind(safeLimit).all();
  return (result.results || []).map(settlementFromRow);
}

export async function recordNonDamageEffectSettlement(env, input, actorUserId) {
  await ensureNonDamageEffectSettlementAuthority(env);
  const opposedCheckId = text(input?.opposedCheckId, 200, 'Opposed Check ID', true);

  const already = await getSettlementByOpposedCheck(env, opposedCheckId);
  if (already) return { idempotent: true, settlement: settlementFromRow(already) };

  const opposed = await loadOpposedAudit(env, opposedCheckId);
  const resolution = resolveNonDamageEffectSettlement({
    sourceRawRoll: opposed.source_raw_roll,
    resistanceRawRoll: opposed.resistance_raw_roll,
    sourceResultValue: opposed.source_result_value,
    resistanceResultValue: opposed.resistance_result_value
  });
  verifyOpposedAudit(opposed, resolution);

  const meaningfulReason = text(input?.meaningfulReason ?? input?.reason, 1000, 'Meaningful settlement reason', true);
  const contextJson = contextText(input?.context);
  const id = `non_damage_settlement_${crypto.randomUUID()}`;
  const now = Date.now();

  try {
    await env.DB.prepare(`INSERT INTO non_damage_effect_settlement_log (
      id, opposed_check_id, source_check_id, resistance_check_id, source_character_id, resistance_character_id,
      comparison, source_raw_roll, resistance_raw_roll, source_result_value, resistance_result_value,
      result_gap, narrative_gap, outcome, original_target_resolution, primary_effect_multiplier,
      source_great_success, source_great_success_applied, source_great_failure,
      defense_great_success, defense_great_failure, double_failure_override, gm_resolution_required,
      meaningful_reason, context_json, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id, opposed.opposed_check_id, opposed.source_check_id, opposed.resistance_check_id,
        opposed.source_character_id, opposed.resistance_character_id, resolution.comparison,
        resolution.sourceRawRoll, resolution.resistanceRawRoll, resolution.sourceResultValue,
        resolution.resistanceResultValue, resolution.resultGap, resolution.narrativeGap, resolution.outcome,
        resolution.originalTargetResolution, resolution.primaryEffectMultiplier,
        resolution.sourceGreatSuccess ? 1 : 0, resolution.sourceGreatSuccessApplied ? 1 : 0,
        resolution.sourceGreatFailure ? 1 : 0, resolution.defenseGreatSuccess ? 1 : 0,
        resolution.defenseGreatFailure ? 1 : 0, resolution.doubleFailureOverride ? 1 : 0,
        resolution.gmResolutionRequired ? 1 : 0, meaningfulReason, contextJson, actorUserId || null, now
      ).run();
  } catch (error) {
    const raced = await getSettlementByOpposedCheck(env, opposedCheckId);
    if (raced) return { idempotent: true, settlement: settlementFromRow(raced) };
    throw error;
  }

  return {
    idempotent: false,
    settlement: settlementFromRow(await getSettlementByOpposedCheck(env, opposedCheckId))
  };
}
