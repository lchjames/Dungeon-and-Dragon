import { ensureAbilityAuthority, listCharacterAbilities } from './ability-authority.js';

const SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS character_physical_masteries (
    character_id TEXT NOT NULL,
    mastery_type TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 0,
    progression_exp INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (character_id, mastery_type),
    CHECK (rank BETWEEN 0 AND 9), CHECK (progression_exp >= 0),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS character_physical_mastery_log (
    id TEXT PRIMARY KEY, character_id TEXT NOT NULL, mastery_type TEXT NOT NULL,
    operation TEXT NOT NULL, from_rank INTEGER NOT NULL, to_rank INTEGER NOT NULL,
    from_progression_exp INTEGER NOT NULL, to_progression_exp INTEGER NOT NULL,
    delta_progression_exp INTEGER NOT NULL DEFAULT 0, source_type TEXT NOT NULL,
    source_name TEXT, reason TEXT NOT NULL DEFAULT '', actor_user_id TEXT, created_at INTEGER NOT NULL,
    CHECK (operation IN ('SET_RANK','SET_PROGRESSION','AWARD_PROGRESSION','SET_BOTH')),
    CHECK (from_rank BETWEEN 0 AND 9), CHECK (to_rank BETWEEN 0 AND 9),
    CHECK (from_progression_exp >= 0), CHECK (to_progression_exp >= 0), CHECK (delta_progression_exp >= 0),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_character_physical_mastery_log_character ON character_physical_mastery_log(character_id, created_at DESC, id)`,
  `CREATE INDEX IF NOT EXISTS idx_character_physical_mastery_log_mastery ON character_physical_mastery_log(character_id, mastery_type, created_at DESC, id)`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_physical_mastery_log_validate BEFORE INSERT ON character_physical_mastery_log BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM character_physical_masteries p WHERE p.character_id=NEW.character_id AND p.mastery_type=NEW.mastery_type) THEN RAISE(ABORT, 'PHYSICAL_MASTERY_ROW_MISSING') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM character_physical_masteries p WHERE p.character_id=NEW.character_id AND p.mastery_type=NEW.mastery_type AND p.rank=NEW.from_rank AND p.progression_exp=NEW.from_progression_exp) THEN RAISE(ABORT, 'PHYSICAL_MASTERY_STALE') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_physical_mastery_log_apply AFTER INSERT ON character_physical_mastery_log BEGIN
    UPDATE character_physical_masteries SET rank=NEW.to_rank, progression_exp=NEW.to_progression_exp, updated_at=NEW.created_at WHERE character_id=NEW.character_id AND mastery_type=NEW.mastery_type;
  END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_physical_mastery_log_no_update BEFORE UPDATE ON character_physical_mastery_log BEGIN SELECT RAISE(ABORT, 'PHYSICAL_MASTERY_AUDIT_IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_physical_mastery_log_no_delete BEFORE DELETE ON character_physical_mastery_log BEGIN SELECT RAISE(ABORT, 'PHYSICAL_MASTERY_AUDIT_IMMUTABLE'); END`
]);
let schemaPromise = null;
function fail(message, status = 400, code = 'PHYSICAL_MASTERY_ERROR') { return Object.assign(new Error(message), { status, code }); }
function normalizedMastery(value) {
  const output = String(value || '').trim().normalize('NFKC').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!output || output.length > 80) throw fail('Physical mastery type is invalid.', 400, 'PHYSICAL_MASTERY_TYPE_INVALID');
  return output;
}
function integer(value, field, min, max) {
  const n = Number(value); if (!Number.isInteger(n) || n < min || n > max) throw fail(`${field} must be an integer from ${min} to ${max}.`, 400, 'PHYSICAL_MASTERY_VALIDATION_ERROR'); return n;
}
function text(value, max, field, upper = false) {
  let output = String(value ?? '').trim().normalize('NFKC'); if (upper) output = output.toUpperCase();
  if (output.length > max) throw fail(`${field} is too long.`, 400, 'PHYSICAL_MASTERY_VALIDATION_ERROR'); return output;
}
function toMastery(row) { return { masteryType: row.mastery_type, rank: Number(row.rank || 0), progressionExp: Number(row.progression_exp || 0), updatedAt: Number(row.updated_at || 0) }; }
function toAudit(row) { return { id: row.id, characterId: row.character_id, masteryType: row.mastery_type, operation: row.operation, fromRank: Number(row.from_rank), toRank: Number(row.to_rank), fromProgressionExp: Number(row.from_progression_exp), toProgressionExp: Number(row.to_progression_exp), deltaProgressionExp: Number(row.delta_progression_exp || 0), sourceType: row.source_type, sourceName: row.source_name || null, reason: row.reason || '', actorUserId: row.actor_user_id || null, createdAt: Number(row.created_at || 0) }; }
export async function ensurePhysicalMasteryAuthority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  await ensureAbilityAuthority(env);
  if (!schemaPromise) schemaPromise = env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql))).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}
export async function listCharacterPhysicalMasteries(env, characterId) {
  await ensurePhysicalMasteryAuthority(env);
  const rows = (await env.DB.prepare('SELECT * FROM character_physical_masteries WHERE character_id=? ORDER BY mastery_type').bind(characterId).all()).results || [];
  return rows.map(toMastery);
}
export async function getCharacterPhysicalMasteryRank(env, characterId, masteryType) {
  await ensurePhysicalMasteryAuthority(env);
  if (!masteryType) return null;
  const row = await env.DB.prepare('SELECT rank FROM character_physical_masteries WHERE character_id=? AND mastery_type=? LIMIT 1').bind(characterId, normalizedMastery(masteryType)).first();
  return row ? Number(row.rank || 0) : 0;
}
export async function listPhysicalMasteryAudit(env, characterId, { limit = 50 } = {}) {
  await ensurePhysicalMasteryAuthority(env);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const rows = (await env.DB.prepare('SELECT * FROM character_physical_mastery_log WHERE character_id=? ORDER BY created_at DESC, id DESC LIMIT ?').bind(characterId, safeLimit).all()).results || [];
  return rows.map(toAudit);
}
export async function mutateCharacterPhysicalMastery(env, characterId, rawMasteryType, input, actorUserId) {
  await ensurePhysicalMasteryAuthority(env);
  const masteryType = normalizedMastery(rawMasteryType);
  if (!(await env.DB.prepare('SELECT id FROM characters WHERE id=? LIMIT 1').bind(characterId).first())) throw fail('找不到 Character。', 404, 'CHARACTER_NOT_FOUND');
  const now = Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO character_physical_masteries (character_id, mastery_type, rank, progression_exp, updated_at, metadata_json) VALUES (?, ?, 0, 0, ?, '{}')`).bind(characterId, masteryType, now).run();
  const current = await env.DB.prepare('SELECT rank, progression_exp FROM character_physical_masteries WHERE character_id=? AND mastery_type=? LIMIT 1').bind(characterId, masteryType).first();
  const hasRank = Object.prototype.hasOwnProperty.call(input || {}, 'rank');
  const hasSet = Object.prototype.hasOwnProperty.call(input || {}, 'progressionExp');
  const hasAward = Object.prototype.hasOwnProperty.call(input || {}, 'progressionDelta');
  if (!hasRank && !hasSet && !hasAward) throw fail('Provide rank, progressionExp, or progressionDelta.', 400, 'PHYSICAL_MASTERY_CHANGE_REQUIRED');
  if (hasSet && hasAward) throw fail('Use progressionExp or progressionDelta, not both.', 400, 'PHYSICAL_MASTERY_MODE_CONFLICT');
  const fromRank = Number(current.rank || 0), fromExp = Number(current.progression_exp || 0);
  const toRank = hasRank ? integer(input.rank, 'Rank', 0, 9) : fromRank;
  let toExp = fromExp, delta = 0;
  if (hasSet) toExp = integer(input.progressionExp, 'Progression EXP', 0, Number.MAX_SAFE_INTEGER);
  if (hasAward) { delta = integer(input.progressionDelta, 'Progression award', 1, Number.MAX_SAFE_INTEGER); if (fromExp > Number.MAX_SAFE_INTEGER - delta) throw fail('Progression EXP would exceed supported range.', 409, 'PHYSICAL_MASTERY_OVERFLOW'); toExp = fromExp + delta; }
  if (toRank === fromRank && toExp === fromExp) return { unchanged: true, masteries: await listCharacterPhysicalMasteries(env, characterId), abilities: await listCharacterAbilities(env, characterId), audit: null };
  const operation = hasRank && (hasSet || hasAward) ? 'SET_BOTH' : hasRank ? 'SET_RANK' : hasAward ? 'AWARD_PROGRESSION' : 'SET_PROGRESSION';
  const sourceType = text(input?.sourceType || (hasAward ? 'GM_REWARD' : 'GM_CORRECTION'), 40, 'Source type', true) || (hasAward ? 'GM_REWARD' : 'GM_CORRECTION');
  const sourceName = text(input?.sourceName || '', 160, 'Source name') || null;
  const reason = text(input?.reason || '', 2000, 'Reason');
  const id = `physical_mastery_${crypto.randomUUID()}`;
  try {
    await env.DB.prepare(`INSERT INTO character_physical_mastery_log (id, character_id, mastery_type, operation, from_rank, to_rank, from_progression_exp, to_progression_exp, delta_progression_exp, source_type, source_name, reason, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, characterId, masteryType, operation, fromRank, toRank, fromExp, toExp, delta, sourceType, sourceName, reason, actorUserId || null, now).run();
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('PHYSICAL_MASTERY_STALE')) throw fail('Physical mastery changed since it was read. Refresh and retry.', 409, 'PHYSICAL_MASTERY_STALE');
    throw error;
  }
  const audit = await env.DB.prepare('SELECT * FROM character_physical_mastery_log WHERE id=? LIMIT 1').bind(id).first();
  return { unchanged: false, masteries: await listCharacterPhysicalMasteries(env, characterId), abilities: await listCharacterAbilities(env, characterId), audit: toAudit(audit) };
}
