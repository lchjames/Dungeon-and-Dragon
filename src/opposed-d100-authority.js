import { BASIC_SKILLS, NATURAL_SKILL_CAP, rollDie } from './rules.js';
import { ensureBasicSkillCheckAuthority } from './basic-skill-check-authority.js';
import { resolveOpposedD100 } from './opposed-d100-rules.js';

const CANONICAL_SKILL_KEYS = new Set(BASIC_SKILLS.map(skill => skill.key));
let schemaPromise = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS basic_skill_opposed_check_log (
    id TEXT PRIMARY KEY,
    source_check_id TEXT NOT NULL UNIQUE,
    resistance_check_id TEXT NOT NULL UNIQUE,
    source_character_id TEXT NOT NULL,
    resistance_character_id TEXT NOT NULL,
    comparison TEXT NOT NULL,
    source_strictly_breaks_resistance INTEGER NOT NULL,
    resistance_priority_on_tie INTEGER NOT NULL,
    meaningful_reason TEXT NOT NULL,
    context_json TEXT NOT NULL DEFAULT '{}',
    actor_user_id TEXT,
    created_at INTEGER NOT NULL,
    CHECK (comparison IN ('SOURCE_HIGHER','RESISTANCE_HIGHER','TIE')),
    CHECK (source_strictly_breaks_resistance IN (0,1)),
    CHECK (resistance_priority_on_tie IN (0,1)),
    FOREIGN KEY (source_check_id) REFERENCES character_skill_check_log(id) ON DELETE RESTRICT,
    FOREIGN KEY (resistance_check_id) REFERENCES character_skill_check_log(id) ON DELETE RESTRICT,
    FOREIGN KEY (source_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (resistance_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_basic_skill_opposed_source ON basic_skill_opposed_check_log(source_character_id, created_at DESC, id)',
  'CREATE INDEX IF NOT EXISTS idx_basic_skill_opposed_resistance ON basic_skill_opposed_check_log(resistance_character_id, created_at DESC, id)',
  `CREATE TRIGGER IF NOT EXISTS trg_basic_skill_opposed_check_log_no_update
    BEFORE UPDATE ON basic_skill_opposed_check_log
    BEGIN SELECT RAISE(ABORT, 'OPPOSED_D100_AUDIT_IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_basic_skill_opposed_check_log_no_delete
    BEFORE DELETE ON basic_skill_opposed_check_log
    BEGIN SELECT RAISE(ABORT, 'OPPOSED_D100_AUDIT_IMMUTABLE'); END`
];

function fail(message, status = 400, code = 'OPPOSED_D100_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

function text(value, max, field, required = false) {
  const output = String(value ?? '').trim().normalize('NFKC');
  if (required && !output) throw fail(`${field} is required.`, 400, 'OPPOSED_D100_VALIDATION_ERROR');
  if (output.length > max) throw fail(`${field} is too long.`, 400, 'OPPOSED_D100_VALIDATION_ERROR');
  return output;
}

function integer(value, field, min, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw fail(`${field} must be an integer from ${min} to ${max}.`, 400, 'OPPOSED_D100_VALIDATION_ERROR');
  }
  return number;
}

function contextText(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const encoded = JSON.stringify(source);
  if (new TextEncoder().encode(encoded).byteLength > 8192) {
    throw fail('Opposed check context is too large.', 400, 'OPPOSED_D100_VALIDATION_ERROR');
  }
  return encoded;
}

function checkSnapshot({ id, characterId, skill, resolution, rollSource, reason, context, actorUserId, createdAt, growthId }) {
  return {
    id,
    characterId,
    skillId: skill.id,
    skillKey: skill.key,
    skillLabel: skill.label,
    ...resolution,
    rollSource,
    meaningfulReason: reason,
    context,
    actorUserId: actorUserId || null,
    createdAt,
    growthEligibility: growthId ? {
      id: growthId,
      status: 'PENDING_BALANCE',
      growthProgressBefore: Number(skill.growth_progress || 0),
      growthProgressAfter: null,
      skillValueBefore: Number(skill.natural_value || 0),
      skillValueAfter: null
    } : null
  };
}

function rowCheck(row, prefix) {
  const value = name => row[`${prefix}_${name}`];
  return {
    id: value('check_id'),
    characterId: value('character_id'),
    skillId: value('skill_id'),
    skillKey: value('skill_key'),
    skillLabel: value('skill_label'),
    naturalSkillValue: Number(value('natural_skill_value')),
    totalModifier: Number(value('total_modifier')),
    effectiveSkillValue: Number(value('effective_skill_value')),
    rawRoll: Number(value('raw_roll')),
    resultValue: Number(value('result_value')),
    passed: Boolean(value('passed')),
    extremeResult: value('extreme_result'),
    rollSource: value('roll_source'),
    createdAt: Number(row.created_at),
    growthEligibility: value('growth_id') ? {
      id: value('growth_id'),
      status: value('growth_status'),
      growthProgressBefore: Number(value('growth_progress_before') || 0),
      growthProgressAfter: value('growth_progress_after') === null || value('growth_progress_after') === undefined ? null : Number(value('growth_progress_after')),
      skillValueBefore: Number(value('skill_value_before') || 0),
      skillValueAfter: value('skill_value_after') === null || value('skill_value_after') === undefined ? null : Number(value('skill_value_after'))
    } : null
  };
}

function publicOpposedRow(row) {
  let context = {};
  try { context = JSON.parse(row.context_json || '{}'); } catch { context = {}; }
  return {
    id: row.id,
    comparison: row.comparison,
    sourceStrictlyBreaksResistance: Boolean(row.source_strictly_breaks_resistance),
    resistancePriorityOnTie: Boolean(row.resistance_priority_on_tie),
    meaningfulReason: row.meaningful_reason,
    context,
    actorUserId: row.actor_user_id || null,
    createdAt: Number(row.created_at),
    source: rowCheck(row, 'source'),
    resistance: rowCheck(row, 'resistance')
  };
}

export async function ensureOpposedD100Authority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  await ensureBasicSkillCheckAuthority(env);
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)))
      .catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

async function loadParticipantSkill(env, input, side) {
  const characterId = text(input?.characterId, 160, `${side} Character ID`, true);
  const skillKey = text(input?.skillKey, 80, `${side} Skill key`, true);
  if (!CANONICAL_SKILL_KEYS.has(skillKey)) {
    throw fail(`${side} must use one of the 23 canonical Basic Skills.`, 409, 'OPPOSED_D100_SKILL_NOT_CANONICAL');
  }
  const skill = await env.DB.prepare(`SELECT id, character_id, key, label, natural_value, growth_progress
    FROM character_skills WHERE character_id=? AND key=? LIMIT 1`).bind(characterId, skillKey).first();
  if (!skill) throw fail(`${side} Character does not have this canonical Basic Skill row.`, 404, 'OPPOSED_D100_SKILL_NOT_FOUND');
  const natural = Number(skill.natural_value || 0);
  if (!Number.isSafeInteger(natural) || natural < 0 || natural > NATURAL_SKILL_CAP) {
    throw fail(`${side} Basic Skill natural value is invalid.`, 409, 'OPPOSED_D100_NATURAL_VALUE_INVALID');
  }
  const totalModifier = integer(input?.totalModifier ?? 0, `${side} Total modifier`, -10000, 10000);
  const hasRawRoll = input?.rawRoll !== undefined && input?.rawRoll !== null && String(input.rawRoll).trim() !== '';
  const rawRoll = hasRawRoll ? integer(input.rawRoll, `${side} Raw D100 roll`, 1, 100) : rollDie(100);
  return { characterId, skill, natural, totalModifier, rawRoll, rollSource: hasRawRoll ? 'GM_ENTRY' : 'SERVER' };
}

function checkInsert(env, { id, participant, resolution, reason, contextJson, actorUserId, now }) {
  return env.DB.prepare(`INSERT INTO character_skill_check_log (
    id, character_id, skill_id, skill_key, skill_label, natural_skill_value, total_modifier,
    effective_skill_value, raw_roll, result_value, passed, extreme_result, roll_source,
    meaningful_reason, context_json, actor_user_id, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, participant.characterId, participant.skill.id, participant.skill.key, participant.skill.label,
      resolution.naturalSkillValue, resolution.totalModifier, resolution.effectiveSkillValue, resolution.rawRoll,
      resolution.resultValue, resolution.passed ? 1 : 0, resolution.extremeResult, participant.rollSource,
      reason, contextJson, actorUserId || null, now);
}

function growthInsert(env, { id, checkId, participant, now }) {
  return env.DB.prepare(`INSERT INTO character_skill_growth_eligibility_log (
    id, skill_check_id, character_id, skill_id, skill_key, growth_status,
    growth_progress_before, growth_progress_after, skill_value_before, skill_value_after, created_at
  ) VALUES (?, ?, ?, ?, ?, 'PENDING_BALANCE', ?, NULL, ?, NULL, ?)`)
    .bind(id, checkId, participant.characterId, participant.skill.id, participant.skill.key,
      Number(participant.skill.growth_progress || 0), Number(participant.skill.natural_value || 0), now);
}

export async function resolveAndRecordOpposedD100(env, input, actorUserId) {
  await ensureOpposedD100Authority(env);
  const reason = text(input?.meaningfulReason ?? input?.reason, 1000, 'Meaningful opposed-check reason', true);
  const contextJson = contextText(input?.context);
  const [sourceParticipant, resistanceParticipant] = await Promise.all([
    loadParticipantSkill(env, input?.source, 'Source'),
    loadParticipantSkill(env, input?.resistance, 'Resistance')
  ]);
  const opposed = resolveOpposedD100({
    source: {
      naturalSkillValue: sourceParticipant.natural,
      totalModifier: sourceParticipant.totalModifier,
      rawRoll: sourceParticipant.rawRoll
    },
    resistance: {
      naturalSkillValue: resistanceParticipant.natural,
      totalModifier: resistanceParticipant.totalModifier,
      rawRoll: resistanceParticipant.rawRoll
    }
  });

  const now = Date.now();
  const opposedId = `opposed_d100_${crypto.randomUUID()}`;
  const sourceCheckId = `skill_check_${crypto.randomUUID()}`;
  const resistanceCheckId = `skill_check_${crypto.randomUUID()}`;
  const sourceGrowthId = opposed.source.greatSuccessGrowthEligible ? `skill_growth_${crypto.randomUUID()}` : null;
  const resistanceGrowthId = opposed.resistance.greatSuccessGrowthEligible ? `skill_growth_${crypto.randomUUID()}` : null;
  const statements = [
    checkInsert(env, { id: sourceCheckId, participant: sourceParticipant, resolution: opposed.source, reason, contextJson, actorUserId, now })
  ];
  if (sourceGrowthId) statements.push(growthInsert(env, { id: sourceGrowthId, checkId: sourceCheckId, participant: sourceParticipant, now }));
  statements.push(checkInsert(env, { id: resistanceCheckId, participant: resistanceParticipant, resolution: opposed.resistance, reason, contextJson, actorUserId, now }));
  if (resistanceGrowthId) statements.push(growthInsert(env, { id: resistanceGrowthId, checkId: resistanceCheckId, participant: resistanceParticipant, now }));
  statements.push(env.DB.prepare(`INSERT INTO basic_skill_opposed_check_log (
    id, source_check_id, resistance_check_id, source_character_id, resistance_character_id,
    comparison, source_strictly_breaks_resistance, resistance_priority_on_tie,
    meaningful_reason, context_json, actor_user_id, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(opposedId, sourceCheckId, resistanceCheckId, sourceParticipant.characterId,
      resistanceParticipant.characterId, opposed.comparison, opposed.sourceStrictlyBreaksResistance ? 1 : 0,
      opposed.resistancePriorityOnTie ? 1 : 0, reason, contextJson, actorUserId || null, now));

  await env.DB.batch(statements);
  const context = JSON.parse(contextJson);
  return {
    opposedCheck: {
      id: opposedId,
      comparison: opposed.comparison,
      sourceStrictlyBreaksResistance: opposed.sourceStrictlyBreaksResistance,
      resistancePriorityOnTie: opposed.resistancePriorityOnTie,
      meaningfulReason: reason,
      context,
      actorUserId: actorUserId || null,
      createdAt: now,
      source: checkSnapshot({ id: sourceCheckId, characterId: sourceParticipant.characterId, skill: sourceParticipant.skill, resolution: opposed.source, rollSource: sourceParticipant.rollSource, reason, context, actorUserId, createdAt: now, growthId: sourceGrowthId }),
      resistance: checkSnapshot({ id: resistanceCheckId, characterId: resistanceParticipant.characterId, skill: resistanceParticipant.skill, resolution: opposed.resistance, rollSource: resistanceParticipant.rollSource, reason, context, actorUserId, createdAt: now, growthId: resistanceGrowthId })
    }
  };
}

export async function listOpposedD100Checks(env, { characterId = '', limit = 30 } = {}) {
  await ensureOpposedD100Authority(env);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 30)));
  const filterCharacterId = String(characterId || '').trim();
  const where = filterCharacterId ? 'WHERE o.source_character_id=? OR o.resistance_character_id=?' : '';
  const sql = `SELECT o.*,
      s.id source_check_id, s.character_id source_character_id, s.skill_id source_skill_id,
      s.skill_key source_skill_key, s.skill_label source_skill_label,
      s.natural_skill_value source_natural_skill_value, s.total_modifier source_total_modifier,
      s.effective_skill_value source_effective_skill_value, s.raw_roll source_raw_roll,
      s.result_value source_result_value, s.passed source_passed, s.extreme_result source_extreme_result,
      s.roll_source source_roll_source,
      sg.id source_growth_id, sg.growth_status source_growth_status,
      sg.growth_progress_before source_growth_progress_before, sg.growth_progress_after source_growth_progress_after,
      sg.skill_value_before source_skill_value_before, sg.skill_value_after source_skill_value_after,
      r.id resistance_check_id, r.character_id resistance_character_id, r.skill_id resistance_skill_id,
      r.skill_key resistance_skill_key, r.skill_label resistance_skill_label,
      r.natural_skill_value resistance_natural_skill_value, r.total_modifier resistance_total_modifier,
      r.effective_skill_value resistance_effective_skill_value, r.raw_roll resistance_raw_roll,
      r.result_value resistance_result_value, r.passed resistance_passed, r.extreme_result resistance_extreme_result,
      r.roll_source resistance_roll_source,
      rg.id resistance_growth_id, rg.growth_status resistance_growth_status,
      rg.growth_progress_before resistance_growth_progress_before, rg.growth_progress_after resistance_growth_progress_after,
      rg.skill_value_before resistance_skill_value_before, rg.skill_value_after resistance_skill_value_after
    FROM basic_skill_opposed_check_log o
    JOIN character_skill_check_log s ON s.id=o.source_check_id
    JOIN character_skill_check_log r ON r.id=o.resistance_check_id
    LEFT JOIN character_skill_growth_eligibility_log sg ON sg.skill_check_id=s.id
    LEFT JOIN character_skill_growth_eligibility_log rg ON rg.skill_check_id=r.id
    ${where}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ?`;
  const statement = env.DB.prepare(sql);
  const result = filterCharacterId
    ? await statement.bind(filterCharacterId, filterCharacterId, safeLimit).all()
    : await statement.bind(safeLimit).all();
  return (result.results || []).map(publicOpposedRow);
}

export { SCHEMA as OPPOSED_D100_SCHEMA };
