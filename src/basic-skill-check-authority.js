import { BASIC_SKILLS, NATURAL_SKILL_CAP, rollDie } from './rules.js';
import { resolveBasicSkillD100 } from './basic-skill-check-rules.js';

const CANONICAL_SKILL_KEYS = new Set(BASIC_SKILLS.map(skill => skill.key));
let schemaPromise = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS character_skill_check_log (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    skill_key TEXT NOT NULL,
    skill_label TEXT NOT NULL,
    natural_skill_value INTEGER NOT NULL,
    total_modifier INTEGER NOT NULL,
    effective_skill_value INTEGER NOT NULL,
    raw_roll INTEGER NOT NULL,
    result_value INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    extreme_result TEXT NOT NULL,
    roll_source TEXT NOT NULL,
    meaningful_reason TEXT NOT NULL,
    context_json TEXT NOT NULL DEFAULT '{}',
    actor_user_id TEXT,
    created_at INTEGER NOT NULL,
    CHECK (natural_skill_value BETWEEN 0 AND ${NATURAL_SKILL_CAP}),
    CHECK (raw_roll BETWEEN 1 AND 100),
    CHECK (passed IN (0,1)),
    CHECK (extreme_result IN ('NONE','GREAT_SUCCESS','GREAT_FAILURE')),
    CHECK (roll_source IN ('SERVER','GM_ENTRY')),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES character_skills(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_character_skill_check_log_character ON character_skill_check_log(character_id, created_at DESC, id)',
  'CREATE INDEX IF NOT EXISTS idx_character_skill_check_log_skill ON character_skill_check_log(character_id, skill_key, created_at DESC, id)',
  `CREATE TABLE IF NOT EXISTS character_skill_growth_eligibility_log (
    id TEXT PRIMARY KEY,
    skill_check_id TEXT NOT NULL UNIQUE,
    character_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    skill_key TEXT NOT NULL,
    growth_status TEXT NOT NULL DEFAULT 'PENDING_BALANCE',
    growth_progress_before REAL NOT NULL,
    growth_progress_after REAL,
    skill_value_before INTEGER NOT NULL,
    skill_value_after INTEGER,
    created_at INTEGER NOT NULL,
    CHECK (growth_status IN ('PENDING_BALANCE')),
    CHECK (skill_value_before BETWEEN 0 AND ${NATURAL_SKILL_CAP}),
    FOREIGN KEY (skill_check_id) REFERENCES character_skill_check_log(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES character_skills(id) ON DELETE RESTRICT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_character_skill_growth_eligibility_character ON character_skill_growth_eligibility_log(character_id, created_at DESC, id)',
  `CREATE TRIGGER IF NOT EXISTS trg_character_skill_check_log_no_update
    BEFORE UPDATE ON character_skill_check_log
    BEGIN SELECT RAISE(ABORT, 'BASIC_SKILL_CHECK_AUDIT_IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_skill_check_log_no_delete
    BEFORE DELETE ON character_skill_check_log
    BEGIN SELECT RAISE(ABORT, 'BASIC_SKILL_CHECK_AUDIT_IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_skill_growth_eligibility_no_update
    BEFORE UPDATE ON character_skill_growth_eligibility_log
    BEGIN SELECT RAISE(ABORT, 'BASIC_SKILL_GROWTH_AUDIT_IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_skill_growth_eligibility_no_delete
    BEFORE DELETE ON character_skill_growth_eligibility_log
    BEGIN SELECT RAISE(ABORT, 'BASIC_SKILL_GROWTH_AUDIT_IMMUTABLE'); END`
];

function fail(message, status = 400, code = 'BASIC_SKILL_CHECK_ERROR') {
  return Object.assign(new Error(message), { status, code });
}
function text(value, max, field, required = false) {
  const output = String(value ?? '').trim().normalize('NFKC');
  if (required && !output) throw fail(`${field} is required.`, 400, 'BASIC_SKILL_CHECK_VALIDATION_ERROR');
  if (output.length > max) throw fail(`${field} is too long.`, 400, 'BASIC_SKILL_CHECK_VALIDATION_ERROR');
  return output;
}
function contextText(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const encoded = JSON.stringify(source);
  if (new TextEncoder().encode(encoded).byteLength > 8192) throw fail('Check context is too large.', 400, 'BASIC_SKILL_CHECK_VALIDATION_ERROR');
  return encoded;
}
function publicCheck(row) {
  if (!row) return null;
  let context = {};
  try { context = JSON.parse(row.context_json || '{}'); } catch { context = {}; }
  return {
    id: row.id,
    characterId: row.character_id,
    skillId: row.skill_id,
    skillKey: row.skill_key,
    skillLabel: row.skill_label,
    naturalSkillValue: Number(row.natural_skill_value),
    totalModifier: Number(row.total_modifier),
    effectiveSkillValue: Number(row.effective_skill_value),
    rawRoll: Number(row.raw_roll),
    resultValue: Number(row.result_value),
    passed: Boolean(row.passed),
    extremeResult: row.extreme_result,
    rollSource: row.roll_source,
    meaningfulReason: row.meaningful_reason,
    context,
    actorUserId: row.actor_user_id || null,
    createdAt: Number(row.created_at),
    growthEligibility: row.growth_id ? {
      id: row.growth_id,
      status: row.growth_status,
      growthProgressBefore: Number(row.growth_progress_before || 0),
      growthProgressAfter: row.growth_progress_after === null || row.growth_progress_after === undefined ? null : Number(row.growth_progress_after),
      skillValueBefore: Number(row.skill_value_before || 0),
      skillValueAfter: row.skill_value_after === null || row.skill_value_after === undefined ? null : Number(row.skill_value_after)
    } : null
  };
}

export async function ensureBasicSkillCheckAuthority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)))
      .catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

export async function listCanonicalBasicSkills(env, characterId) {
  await ensureBasicSkillCheckAuthority(env);
  const result = await env.DB.prepare(`SELECT id, key, label, category, natural_value, creation_value, sp_value, use_growth_value, growth_progress
    FROM character_skills WHERE character_id=? ORDER BY sort_order, id`).bind(characterId).all();
  return (result.results || [])
    .filter(row => CANONICAL_SKILL_KEYS.has(String(row.key || '')))
    .map(row => ({
      id: row.id,
      key: row.key,
      label: row.label,
      category: row.category,
      naturalValue: Number(row.natural_value || 0),
      creationValue: Number(row.creation_value || 0),
      spValue: Number(row.sp_value || 0),
      useGrowthValue: Number(row.use_growth_value || 0),
      growthProgress: Number(row.growth_progress || 0)
    }));
}

export async function resolveAndRecordBasicSkillCheck(env, characterId, input, actorUserId) {
  await ensureBasicSkillCheckAuthority(env);
  const skillKey = text(input?.skillKey, 80, 'Skill key', true);
  if (!CANONICAL_SKILL_KEYS.has(skillKey)) throw fail('Only one of the 23 canonical Basic Skills can be checked.', 409, 'BASIC_SKILL_NOT_CANONICAL');
  const reason = text(input?.meaningfulReason ?? input?.reason, 1000, 'Meaningful check reason', true);
  const contextJson = contextText(input?.context);
  const skill = await env.DB.prepare(`SELECT id, key, label, natural_value, growth_progress
    FROM character_skills WHERE character_id=? AND key=? LIMIT 1`).bind(characterId, skillKey).first();
  if (!skill) throw fail('Character does not have this canonical Basic Skill row.', 404, 'BASIC_SKILL_NOT_FOUND');
  const natural = Number(skill.natural_value || 0);
  if (!Number.isSafeInteger(natural) || natural < 0 || natural > NATURAL_SKILL_CAP) throw fail('Character Basic Skill natural value is invalid.', 409, 'BASIC_SKILL_NATURAL_VALUE_INVALID');
  const modifier = Number(input?.totalModifier ?? 0);
  if (!Number.isSafeInteger(modifier) || modifier < -10000 || modifier > 10000) throw fail('Total modifier must be an integer from -10000 to 10000.', 400, 'BASIC_SKILL_CHECK_VALIDATION_ERROR');
  const hasRawRoll = input?.rawRoll !== undefined && input?.rawRoll !== null && String(input.rawRoll).trim() !== '';
  const rawRoll = hasRawRoll ? Number(input.rawRoll) : rollDie(100);
  const resolution = resolveBasicSkillD100({ naturalSkillValue: natural, totalModifier: modifier, rawRoll });
  const now = Date.now();
  const checkId = `skill_check_${crypto.randomUUID()}`;
  const statements = [env.DB.prepare(`INSERT INTO character_skill_check_log (
    id, character_id, skill_id, skill_key, skill_label, natural_skill_value, total_modifier,
    effective_skill_value, raw_roll, result_value, passed, extreme_result, roll_source,
    meaningful_reason, context_json, actor_user_id, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(checkId, characterId, skill.id, skill.key, skill.label, resolution.naturalSkillValue,
      resolution.totalModifier, resolution.effectiveSkillValue, resolution.rawRoll, resolution.resultValue,
      resolution.passed ? 1 : 0, resolution.extremeResult, hasRawRoll ? 'GM_ENTRY' : 'SERVER', reason,
      contextJson, actorUserId || null, now)];
  let growthId = null;
  if (resolution.greatSuccessGrowthEligible) {
    growthId = `skill_growth_${crypto.randomUUID()}`;
    statements.push(env.DB.prepare(`INSERT INTO character_skill_growth_eligibility_log (
      id, skill_check_id, character_id, skill_id, skill_key, growth_status,
      growth_progress_before, growth_progress_after, skill_value_before, skill_value_after, created_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING_BALANCE', ?, NULL, ?, NULL, ?)`)
      .bind(growthId, checkId, characterId, skill.id, skill.key, Number(skill.growth_progress || 0), natural, now));
  }
  await env.DB.batch(statements);
  return {
    check: {
      id: checkId,
      characterId,
      skillId: skill.id,
      skillKey: skill.key,
      skillLabel: skill.label,
      ...resolution,
      rollSource: hasRawRoll ? 'GM_ENTRY' : 'SERVER',
      meaningfulReason: reason,
      context: JSON.parse(contextJson),
      actorUserId: actorUserId || null,
      createdAt: now,
      growthEligibility: growthId ? {
        id: growthId,
        status: 'PENDING_BALANCE',
        growthProgressBefore: Number(skill.growth_progress || 0),
        growthProgressAfter: null,
        skillValueBefore: natural,
        skillValueAfter: null
      } : null
    }
  };
}

export async function listBasicSkillChecks(env, characterId, { limit = 30 } = {}) {
  await ensureBasicSkillCheckAuthority(env);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 30)));
  const result = await env.DB.prepare(`SELECT c.*,
      g.id growth_id, g.growth_status, g.growth_progress_before, g.growth_progress_after,
      g.skill_value_before, g.skill_value_after
    FROM character_skill_check_log c
    LEFT JOIN character_skill_growth_eligibility_log g ON g.skill_check_id=c.id
    WHERE c.character_id=?
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ?`).bind(characterId, safeLimit).all();
  return (result.results || []).map(publicCheck);
}

export { SCHEMA as BASIC_SKILL_CHECK_SCHEMA };
