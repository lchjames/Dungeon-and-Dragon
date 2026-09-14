import {
  ensureAbilityAuthority,
  ensureCharacterElementProgression,
  listCharacterAbilities,
  listCharacterElementProgression
} from './ability-authority.js';
import { ABILITY_ATTRIBUTE_TYPES } from './ability-rules.js';

const ATTRIBUTE_SET = new Set(ABILITY_ATTRIBUTE_TYPES);
const SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS character_element_progression_log (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    attribute_type TEXT NOT NULL,
    operation TEXT NOT NULL,
    from_rank INTEGER NOT NULL,
    to_rank INTEGER NOT NULL,
    from_progression_exp INTEGER NOT NULL,
    to_progression_exp INTEGER NOT NULL,
    delta_progression_exp INTEGER NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL,
    source_name TEXT,
    reason TEXT NOT NULL DEFAULT '',
    actor_user_id TEXT,
    created_at INTEGER NOT NULL,
    CHECK (attribute_type IN ('PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD')),
    CHECK (operation IN ('SET_RANK','SET_PROGRESSION','AWARD_PROGRESSION','SET_BOTH')),
    CHECK (from_rank BETWEEN 0 AND 9),
    CHECK (to_rank BETWEEN 0 AND 9),
    CHECK (from_progression_exp >= 0),
    CHECK (to_progression_exp >= 0),
    CHECK (delta_progression_exp >= 0),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_character_element_progression_log_character
    ON character_element_progression_log(character_id, created_at DESC, id)`,
  `CREATE INDEX IF NOT EXISTS idx_character_element_progression_log_attribute
    ON character_element_progression_log(character_id, attribute_type, created_at DESC, id)`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_element_progression_log_validate
    BEFORE INSERT ON character_element_progression_log
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM character_element_progression p
        WHERE p.character_id = NEW.character_id AND p.attribute_type = NEW.attribute_type
      ) THEN RAISE(ABORT, 'ELEMENT_PROGRESSION_ROW_MISSING') END;
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM character_element_progression p
        WHERE p.character_id = NEW.character_id
          AND p.attribute_type = NEW.attribute_type
          AND p.rank = NEW.from_rank
          AND p.progression_exp = NEW.from_progression_exp
      ) THEN RAISE(ABORT, 'ELEMENT_PROGRESSION_STALE') END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_element_progression_log_apply
    AFTER INSERT ON character_element_progression_log
    BEGIN
      UPDATE character_element_progression
      SET rank = NEW.to_rank,
          progression_exp = NEW.to_progression_exp,
          updated_at = NEW.created_at
      WHERE character_id = NEW.character_id
        AND attribute_type = NEW.attribute_type;
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_element_progression_log_no_update
    BEFORE UPDATE ON character_element_progression_log
    BEGIN
      SELECT RAISE(ABORT, 'ELEMENT_PROGRESSION_AUDIT_IMMUTABLE');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_character_element_progression_log_no_delete
    BEFORE DELETE ON character_element_progression_log
    BEGIN
      SELECT RAISE(ABORT, 'ELEMENT_PROGRESSION_AUDIT_IMMUTABLE');
    END`
]);

let schemaPromise = null;

function fail(message, status = 400, code = 'ELEMENT_PROGRESSION_ERROR') {
  return Object.assign(new Error(message), { status, code });
}
function text(value, max, field, upper = false) {
  let output = String(value ?? '').trim().normalize('NFKC');
  if (upper) output = output.toUpperCase();
  if (output.length > max) throw fail(`${field} is too long.`, 400, 'ELEMENT_PROGRESSION_VALIDATION_ERROR');
  return output;
}
function integer(value, field, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw fail(`${field} must be an integer from ${min} to ${max}.`, 400, 'ELEMENT_PROGRESSION_VALIDATION_ERROR');
  }
  return number;
}
function normalizeAttribute(value) {
  const attributeType = String(value || '').trim().toUpperCase();
  if (!ATTRIBUTE_SET.has(attributeType)) {
    throw fail('Element / Attribute is invalid.', 400, 'ELEMENT_PROGRESSION_ATTRIBUTE_INVALID');
  }
  return attributeType;
}
function toAudit(row) {
  return {
    id: row.id,
    characterId: row.character_id,
    attributeType: row.attribute_type,
    operation: row.operation,
    fromRank: Number(row.from_rank),
    toRank: Number(row.to_rank),
    fromProgressionExp: Number(row.from_progression_exp),
    toProgressionExp: Number(row.to_progression_exp),
    deltaProgressionExp: Number(row.delta_progression_exp || 0),
    sourceType: row.source_type,
    sourceName: row.source_name || null,
    reason: row.reason || '',
    actorUserId: row.actor_user_id || null,
    createdAt: Number(row.created_at || 0)
  };
}

export async function ensureElementProgressionAuthority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  await ensureAbilityAuthority(env);
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)))
      .catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

export async function getCharacterElementProgressionState(env, characterId) {
  await ensureElementProgressionAuthority(env);
  const character = await env.DB.prepare('SELECT id FROM characters WHERE id=? LIMIT 1').bind(characterId).first();
  if (!character) throw fail('找不到 Character。', 404, 'CHARACTER_NOT_FOUND');
  const progression = await listCharacterElementProgression(env, characterId);
  return { progression };
}

export async function listElementProgressionAudit(env, characterId, { limit = 50 } = {}) {
  await ensureElementProgressionAuthority(env);
  const safeLimit = Math.max(1, Math.min(100, Number.isInteger(Number(limit)) ? Number(limit) : 50));
  const result = await env.DB.prepare(`SELECT * FROM character_element_progression_log
    WHERE character_id=? ORDER BY created_at DESC, id DESC LIMIT ?`).bind(characterId, safeLimit).all();
  return (result.results || []).map(toAudit);
}

export async function mutateCharacterElementProgression(env, characterId, rawAttributeType, input, actorUserId) {
  await ensureElementProgressionAuthority(env);
  const attributeType = normalizeAttribute(rawAttributeType);
  const character = await env.DB.prepare('SELECT id FROM characters WHERE id=? LIMIT 1').bind(characterId).first();
  if (!character) throw fail('找不到 Character。', 404, 'CHARACTER_NOT_FOUND');
  await ensureCharacterElementProgression(env, characterId);

  const current = await env.DB.prepare(`SELECT rank, progression_exp, updated_at
    FROM character_element_progression WHERE character_id=? AND attribute_type=? LIMIT 1`)
    .bind(characterId, attributeType).first();
  if (!current) throw fail('Element progression row is missing.', 500, 'ELEMENT_PROGRESSION_ROW_MISSING');

  const hasRank = Object.prototype.hasOwnProperty.call(input || {}, 'rank');
  const hasSetProgress = Object.prototype.hasOwnProperty.call(input || {}, 'progressionExp');
  const hasAwardProgress = Object.prototype.hasOwnProperty.call(input || {}, 'progressionDelta');
  if (!hasRank && !hasSetProgress && !hasAwardProgress) {
    throw fail('Provide rank, progressionExp, or progressionDelta.', 400, 'ELEMENT_PROGRESSION_CHANGE_REQUIRED');
  }
  if (hasSetProgress && hasAwardProgress) {
    throw fail('Use progressionExp or progressionDelta, not both.', 400, 'ELEMENT_PROGRESSION_MODE_CONFLICT');
  }

  const fromRank = Number(current.rank || 0);
  const fromProgressionExp = Number(current.progression_exp || 0);
  const toRank = hasRank ? integer(input.rank, 'Rank', 0, 9) : fromRank;
  let toProgressionExp = fromProgressionExp;
  let deltaProgressionExp = 0;
  if (hasSetProgress) {
    toProgressionExp = integer(input.progressionExp, 'Progression EXP', 0, Number.MAX_SAFE_INTEGER);
  } else if (hasAwardProgress) {
    deltaProgressionExp = integer(input.progressionDelta, 'Progression award', 1, Number.MAX_SAFE_INTEGER);
    if (fromProgressionExp > Number.MAX_SAFE_INTEGER - deltaProgressionExp) {
      throw fail('Progression EXP would exceed the supported integer range.', 409, 'ELEMENT_PROGRESSION_OVERFLOW');
    }
    toProgressionExp = fromProgressionExp + deltaProgressionExp;
  }

  if (toRank === fromRank && toProgressionExp === fromProgressionExp) {
    return {
      unchanged: true,
      progression: await listCharacterElementProgression(env, characterId),
      abilities: await listCharacterAbilities(env, characterId),
      audit: null
    };
  }

  const operation = hasRank && (hasSetProgress || hasAwardProgress)
    ? 'SET_BOTH'
    : hasRank
      ? 'SET_RANK'
      : hasAwardProgress
        ? 'AWARD_PROGRESSION'
        : 'SET_PROGRESSION';
  const sourceType = text(input?.sourceType || (hasAwardProgress ? 'GM_REWARD' : 'GM_CORRECTION'), 40, 'Source type', true) || (hasAwardProgress ? 'GM_REWARD' : 'GM_CORRECTION');
  const sourceName = text(input?.sourceName || '', 160, 'Source name') || null;
  const reason = text(input?.reason || '', 2000, 'Reason');
  const id = `element_progress_${crypto.randomUUID()}`;
  const now = Date.now();

  try {
    await env.DB.prepare(`INSERT INTO character_element_progression_log (
      id, character_id, attribute_type, operation, from_rank, to_rank,
      from_progression_exp, to_progression_exp, delta_progression_exp,
      source_type, source_name, reason, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, characterId, attributeType, operation, fromRank, toRank,
        fromProgressionExp, toProgressionExp, deltaProgressionExp,
        sourceType, sourceName, reason, actorUserId || null, now).run();
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('ELEMENT_PROGRESSION_STALE')) {
      throw fail('Element progression changed since it was read. Refresh and retry.', 409, 'ELEMENT_PROGRESSION_STALE');
    }
    if (message.includes('ELEMENT_PROGRESSION_ROW_MISSING')) {
      throw fail('Element progression row is missing.', 409, 'ELEMENT_PROGRESSION_ROW_MISSING');
    }
    throw error;
  }

  const auditRow = await env.DB.prepare('SELECT * FROM character_element_progression_log WHERE id=? LIMIT 1').bind(id).first();
  return {
    unchanged: false,
    progression: await listCharacterElementProgression(env, characterId),
    abilities: await listCharacterAbilities(env, characterId),
    audit: toAudit(auditRow)
  };
}
