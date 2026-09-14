import { ABILITY_SCHEMA } from './ability-schema.js';
import {
  ABILITY_ATTRIBUTE_TYPES,
  abilityRuleError,
  normalizeAbilityDefinition,
  parseObject,
  resolveAbilityUsability
} from './ability-rules.js';

let schemaPromise = null;

function nowMs() { return Date.now(); }
function fail(message, status = 400, code = 'ABILITY_AUTHORITY_ERROR') {
  return Object.assign(new Error(message), { status, code });
}
function text(value, max, field, upper = false) {
  let result = String(value ?? '').trim().normalize('NFKC');
  if (upper) result = result.toUpperCase();
  if (result.length > max) throw fail(`${field} is too long.`, 400, 'ABILITY_VALIDATION_ERROR');
  return result;
}
function jsonText(value, maxBytes = 32768) {
  const object = parseObject(value, null);
  if (!object) throw fail('Expected a JSON object.', 400, 'ABILITY_VALIDATION_ERROR');
  const encoded = JSON.stringify(object);
  if (new TextEncoder().encode(encoded).byteLength > maxBytes) throw fail('JSON payload is too large.', 400, 'ABILITY_VALIDATION_ERROR');
  return { object, encoded };
}
function toDefinition(row) {
  if (!row) return null;
  return {
    id: row.id,
    canonicalNameZh: row.canonical_name_zh,
    name: row.canonical_name_zh,
    attributeType: row.attribute_type || null,
    rankCode: row.rank_code || null,
    rank: row.rank_code || null,
    abilityType: row.ability_type,
    type: row.ability_type,
    targetPattern: row.target_pattern || null,
    physicalSourceCategory: row.physical_source_category || null,
    descriptionZh: row.description_zh || '',
    description: row.description_zh || '',
    mechanicalProfile: parseObject(row.mechanical_profile_json, {}),
    prerequisites: parseObject(row.prerequisites_json, {}),
    libraryVisibility: row.library_visibility,
    status: row.status,
    classificationStatus: row.classification_status,
    createdByUserId: row.created_by_user_id || null,
    updatedByUserId: row.updated_by_user_id || null,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}
function snapshot(definition) {
  return {
    canonicalNameZh: definition.canonicalNameZh,
    attributeType: definition.attributeType,
    rankCode: definition.rankCode,
    abilityType: definition.abilityType,
    targetPattern: definition.targetPattern,
    physicalSourceCategory: definition.physicalSourceCategory,
    descriptionZh: definition.descriptionZh,
    mechanicalProfile: definition.mechanicalProfile,
    prerequisites: definition.prerequisites,
    libraryVisibility: definition.libraryVisibility,
    status: definition.status,
    classificationStatus: definition.classificationStatus
  };
}
async function tableExists(env, name) {
  return Boolean(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first());
}
async function backfillLegacy(env) {
  if (!(await tableExists(env, 'character_abilities'))) return;
  const rows = (await env.DB.prepare(`
    SELECT ca.id, ca.character_id, ca.name, ca.type, ca.description, ca.proficient
    FROM character_abilities ca
    LEFT JOIN character_acquired_abilities aa ON aa.legacy_character_ability_id = ca.id
    WHERE aa.id IS NULL
    ORDER BY ca.character_id, ca.sort_order, ca.id
  `).all()).results || [];
  for (const row of rows) {
    const now = nowMs();
    const defId = `ability_legacy_${row.id}`;
    const acqId = `acq_legacy_${row.id}`;
    const name = text(row.name || 'Legacy Ability', 120, 'Ability name');
    const type = text(row.type || 'ABILITY', 80, 'Ability type', true) || 'ABILITY';
    const description = text(row.description || '', 8000, 'Ability description');
    const profile = { canonicalNameZh: name, attributeType: null, rankCode: null, abilityType: type, targetPattern: null, physicalSourceCategory: null, descriptionZh: description, mechanicalProfile: {}, prerequisites: {}, libraryVisibility: 'PRIVATE', status: 'active', classificationStatus: 'NEEDS_CLASSIFICATION' };
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO ability_definitions (
        id, canonical_name_zh, attribute_type, rank_code, ability_type, target_pattern,
        physical_source_category, description_zh, mechanical_profile_json, prerequisites_json,
        library_visibility, status, classification_status, created_by_user_id, updated_by_user_id,
        created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, NULL, NULL, ?, '{}', '{}', 'PRIVATE', 'active', 'NEEDS_CLASSIFICATION', NULL, NULL, ?, ?)`)
        .bind(defId, name, type, description, now, now),
      env.DB.prepare(`INSERT OR IGNORE INTO character_acquired_abilities (
        id, character_id, ability_definition_id, acquisition_mode, grant_source_type,
        grant_source_name, grant_note, granted_by_gm_id, acquired_at, metadata_json, legacy_character_ability_id
      ) VALUES (?, ?, ?, 'LEGACY_IMPORT', 'OTHER', 'Legacy Character Ability', 'Imported from character_abilities; classification requires GM review.', NULL, ?, ?, ?)`)
        .bind(acqId, row.character_id, defId, now, JSON.stringify({ legacyProficient: Boolean(row.proficient) }), row.id),
      env.DB.prepare(`INSERT OR IGNORE INTO ability_definition_revision_history (
        id, ability_definition_id, previous_profile_json, new_profile_json, change_source, changed_by_user_id, reason, created_at
      ) VALUES (?, ?, NULL, ?, 'LEGACY_IMPORT', NULL, 'Legacy character_abilities compatibility import.', ?)`)
        .bind(`ability_rev_legacy_${row.id}`, defId, JSON.stringify(profile), now),
      env.DB.prepare(`INSERT OR IGNORE INTO character_ability_grant_log (
        id, character_acquired_ability_id, character_id, ability_definition_id,
        action, acquisition_mode, grant_source_type, grant_source_name, grant_note, actor_user_id, created_at
      ) VALUES (?, ?, ?, ?, 'LEGACY_IMPORT', 'LEGACY_IMPORT', 'OTHER', 'Legacy Character Ability', 'Original acquisition route is unknown.', NULL, ?)`)
        .bind(`ability_grant_legacy_${row.id}`, acqId, row.character_id, defId, now)
    ]);
  }
}

export async function ensureAbilityAuthority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(ABILITY_SCHEMA.map(sql => env.DB.prepare(sql)))
      .then(() => backfillLegacy(env))
      .catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

export async function ensureCharacterElementProgression(env, characterId) {
  await ensureAbilityAuthority(env);
  const now = nowMs();
  await env.DB.batch(ABILITY_ATTRIBUTE_TYPES.map(attributeType => env.DB.prepare(`
    INSERT OR IGNORE INTO character_element_progression (
      character_id, attribute_type, rank, progression_exp, updated_at, metadata_json
    ) VALUES (?, ?, 0, 0, ?, '{}')
  `).bind(characterId, attributeType, now)));
}

export async function listAbilityDefinitions(env, { includeInactive = true, includePrivate = true } = {}) {
  await ensureAbilityAuthority(env);
  const clauses = [];
  if (!includeInactive) clauses.push("status='active'");
  if (!includePrivate) clauses.push("library_visibility='CAMPAIGN'");
  const result = await env.DB.prepare(`SELECT * FROM ability_definitions ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY CASE classification_status WHEN 'NEEDS_CLASSIFICATION' THEN 1 ELSE 0 END,
             attribute_type, CAST(rank_code AS INTEGER), canonical_name_zh COLLATE NOCASE, id`).all();
  return (result.results || []).map(toDefinition);
}

export async function loadAbilityDefinition(env, id) {
  await ensureAbilityAuthority(env);
  return toDefinition(await env.DB.prepare('SELECT * FROM ability_definitions WHERE id=? LIMIT 1').bind(id).first());
}

export async function createAbilityDefinition(env, input, actorUserId) {
  await ensureAbilityAuthority(env);
  const definition = normalizeAbilityDefinition(input);
  const mechanical = jsonText(definition.mechanicalProfile);
  const prerequisites = jsonText(definition.prerequisites);
  const id = `ability_${crypto.randomUUID()}`;
  const now = nowMs();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ability_definitions (
      id, canonical_name_zh, attribute_type, rank_code, ability_type, target_pattern,
      physical_source_category, description_zh, mechanical_profile_json, prerequisites_json,
      library_visibility, status, classification_status, created_by_user_id, updated_by_user_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLASSIFIED', ?, ?, ?, ?)`)
      .bind(id, definition.canonicalNameZh, definition.attributeType, definition.rankCode, definition.abilityType,
        definition.targetPattern, definition.physicalSourceCategory, definition.descriptionZh, mechanical.encoded,
        prerequisites.encoded, definition.libraryVisibility, definition.status, actorUserId || null, actorUserId || null, now, now),
    env.DB.prepare(`INSERT INTO ability_definition_revision_history (
      id, ability_definition_id, previous_profile_json, new_profile_json, change_source, changed_by_user_id, reason, created_at
    ) VALUES (?, ?, NULL, ?, 'GM_CREATE', ?, ?, ?)`)
      .bind(`ability_rev_${crypto.randomUUID()}`, id, JSON.stringify(snapshot(definition)), actorUserId || null, text(input?.reason || '', 1000, 'Reason'), now)
  ]);
  return loadAbilityDefinition(env, id);
}

export async function updateAbilityDefinition(env, id, input, actorUserId) {
  const existing = await loadAbilityDefinition(env, id);
  if (!existing) throw fail('找不到 Ability Definition。', 404, 'ABILITY_DEFINITION_NOT_FOUND');
  const merged = { ...snapshot(existing) };
  const map = {
    canonicalNameZh: ['canonicalNameZh','name'], attributeType: ['attributeType'], rankCode: ['rankCode','rank'],
    abilityType: ['abilityType'], targetPattern: ['targetPattern'], physicalSourceCategory: ['physicalSourceCategory'],
    descriptionZh: ['descriptionZh','description'], mechanicalProfile: ['mechanicalProfile'], prerequisites: ['prerequisites'],
    libraryVisibility: ['libraryVisibility'], status: ['status']
  };
  for (const [field, keys] of Object.entries(map)) {
    const key = keys.find(candidate => Object.prototype.hasOwnProperty.call(input || {}, candidate));
    if (key) merged[field] = input[key];
  }
  const stillUnclassified = existing.classificationStatus === 'NEEDS_CLASSIFICATION' && !(merged.attributeType && merged.rankCode);
  merged.classificationStatus = stillUnclassified ? 'NEEDS_CLASSIFICATION' : 'CLASSIFIED';
  const definition = normalizeAbilityDefinition(merged, { allowUnclassified: stillUnclassified });
  const mechanical = jsonText(definition.mechanicalProfile);
  const prerequisites = jsonText(definition.prerequisites);
  const now = nowMs();
  await env.DB.batch([
    env.DB.prepare(`UPDATE ability_definitions SET canonical_name_zh=?, attribute_type=?, rank_code=?, ability_type=?,
      target_pattern=?, physical_source_category=?, description_zh=?, mechanical_profile_json=?, prerequisites_json=?,
      library_visibility=?, status=?, classification_status=?, updated_by_user_id=?, updated_at=? WHERE id=?`)
      .bind(definition.canonicalNameZh, definition.attributeType, definition.rankCode, definition.abilityType,
        definition.targetPattern, definition.physicalSourceCategory, definition.descriptionZh, mechanical.encoded,
        prerequisites.encoded, definition.libraryVisibility, definition.status, definition.classificationStatus,
        actorUserId || null, now, id),
    env.DB.prepare(`INSERT INTO ability_definition_revision_history (
      id, ability_definition_id, previous_profile_json, new_profile_json, change_source, changed_by_user_id, reason, created_at
    ) VALUES (?, ?, ?, ?, 'GM_EDIT', ?, ?, ?)`)
      .bind(`ability_rev_${crypto.randomUUID()}`, id, JSON.stringify(snapshot(existing)), JSON.stringify(snapshot(definition)), actorUserId || null, text(input?.reason || '', 1000, 'Reason'), now)
  ]);
  return loadAbilityDefinition(env, id);
}

export async function listCharacterElementProgression(env, characterId) {
  await ensureCharacterElementProgression(env, characterId);
  const result = await env.DB.prepare(`SELECT attribute_type, rank, progression_exp, updated_at
    FROM character_element_progression WHERE character_id=?
    ORDER BY CASE attribute_type WHEN 'PHYSICAL' THEN 0 WHEN 'LIGHT' THEN 1 WHEN 'DARK' THEN 2 WHEN 'FIRE' THEN 3 WHEN 'WATER' THEN 4 WHEN 'WIND' THEN 5 WHEN 'EARTH' THEN 6 WHEN 'LIGHTNING' THEN 7 WHEN 'WOOD' THEN 8 ELSE 99 END`).bind(characterId).all();
  return (result.results || []).map(row => ({ attributeType: row.attribute_type, rank: Number(row.rank || 0), progressionExp: Number(row.progression_exp || 0), updatedAt: Number(row.updated_at || 0) }));
}

export async function listCharacterAbilities(env, characterId) {
  await ensureCharacterElementProgression(env, characterId);
  const character = await env.DB.prepare('SELECT id, name, level, status FROM characters WHERE id=? LIMIT 1').bind(characterId).first();
  if (!character) throw fail('找不到 Character。', 404, 'CHARACTER_NOT_FOUND');
  const result = await env.DB.prepare(`SELECT aa.id acquisition_id, aa.acquisition_mode, aa.grant_source_type,
    aa.grant_source_name, aa.grant_note, aa.granted_by_gm_id, aa.acquired_at, aa.metadata_json acquisition_metadata_json,
    d.*, p.rank current_attribute_rank, p.progression_exp current_progression_exp
    FROM character_acquired_abilities aa JOIN ability_definitions d ON d.id=aa.ability_definition_id
    LEFT JOIN character_element_progression p ON p.character_id=aa.character_id AND p.attribute_type=d.attribute_type
    WHERE aa.character_id=?
    ORDER BY CASE d.attribute_type WHEN 'PHYSICAL' THEN 0 WHEN 'LIGHT' THEN 1 WHEN 'DARK' THEN 2 WHEN 'FIRE' THEN 3 WHEN 'WATER' THEN 4 WHEN 'WIND' THEN 5 WHEN 'EARTH' THEN 6 WHEN 'LIGHTNING' THEN 7 WHEN 'WOOD' THEN 8 ELSE 99 END,
      CAST(d.rank_code AS INTEGER), d.canonical_name_zh COLLATE NOCASE, aa.id`).bind(characterId).all();
  return (result.results || []).map(row => {
    const definition = toDefinition(row);
    return {
      acquisitionId: row.acquisition_id,
      acquisitionMode: row.acquisition_mode,
      grantSourceType: row.grant_source_type || null,
      grantSourceName: row.grant_source_name || null,
      grantNote: row.grant_note || null,
      grantedByGmId: row.granted_by_gm_id || null,
      acquiredAt: Number(row.acquired_at || 0),
      acquisitionMetadata: parseObject(row.acquisition_metadata_json, {}),
      abilityDefinitionId: definition.id,
      ...definition,
      usability: resolveAbilityUsability(definition, character, Number(row.current_attribute_rank || 0)),
      currentAttributeRank: definition.attributeType ? Number(row.current_attribute_rank || 0) : null,
      currentProgressionExp: definition.attributeType ? Number(row.current_progression_exp || 0) : null,
      proficient: false
    };
  });
}

export async function grantAbilityToCharacter(env, characterId, abilityDefinitionId, input, actorUserId) {
  await ensureAbilityAuthority(env);
  if (!(await env.DB.prepare('SELECT id FROM characters WHERE id=? LIMIT 1').bind(characterId).first())) throw fail('找不到 Character。', 404, 'CHARACTER_NOT_FOUND');
  const definition = await loadAbilityDefinition(env, abilityDefinitionId);
  if (!definition) throw fail('找不到 Ability Definition。', 404, 'ABILITY_DEFINITION_NOT_FOUND');
  if (definition.status !== 'active') throw fail('Inactive Ability Definition cannot be granted.', 409, 'ABILITY_DEFINITION_INACTIVE');
  const existing = await env.DB.prepare('SELECT id FROM character_acquired_abilities WHERE character_id=? AND ability_definition_id=? LIMIT 1').bind(characterId, abilityDefinitionId).first();
  if (existing) return { idempotent: true, acquisitionId: existing.id, abilities: await listCharacterAbilities(env, characterId) };
  const sourceType = text(input?.grantSourceType || 'GM_DIRECT', 40, 'Grant source type', true) || 'GM_DIRECT';
  const sourceName = text(input?.grantSourceName || '', 160, 'Grant source name') || null;
  const note = text(input?.grantNote || '', 2000, 'Grant note') || null;
  const metadata = jsonText(input?.metadata || {}, 16384);
  const acquisitionId = `acq_${crypto.randomUUID()}`;
  const now = nowMs();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO character_acquired_abilities (
      id, character_id, ability_definition_id, acquisition_mode, grant_source_type, grant_source_name,
      grant_note, granted_by_gm_id, acquired_at, metadata_json, legacy_character_ability_id
    ) VALUES (?, ?, ?, 'GM_GRANT', ?, ?, ?, ?, ?, ?, NULL)`)
      .bind(acquisitionId, characterId, abilityDefinitionId, sourceType, sourceName, note, actorUserId || null, now, metadata.encoded),
    env.DB.prepare(`INSERT INTO character_ability_grant_log (
      id, character_acquired_ability_id, character_id, ability_definition_id, action, acquisition_mode,
      grant_source_type, grant_source_name, grant_note, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, 'GM_GRANT', 'GM_GRANT', ?, ?, ?, ?, ?)`)
      .bind(`ability_grant_${crypto.randomUUID()}`, acquisitionId, characterId, abilityDefinitionId, sourceType, sourceName, note, actorUserId || null, now)
  ]);
  return { idempotent: false, acquisitionId, abilities: await listCharacterAbilities(env, characterId) };
}

export { resolveAbilityUsability } from './ability-rules.js';
