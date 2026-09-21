import { ensureStatusEffectAuthority } from './status-effect-authority.js';
import { NON_DAMAGE_STATUS_PROFILE_SCHEMA } from './non-damage-status-profile-schema.js';
import {
  inspectPrimaryEffect,
  normalizeNonDamageStatusProfile,
  resolveProfileReadiness
} from './non-damage-status-profile-rules.js';

let schemaPromise = null;

function fail(message, status = 400, code = 'NON_DAMAGE_STATUS_PROFILE_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || JSON.stringify(fallback)); } catch { return fallback; }
}

function encodeJson(value, maxBytes = 16384) {
  const encoded = JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  if (new TextEncoder().encode(encoded).byteLength > maxBytes) {
    throw fail('Metadata is too large.', 400, 'NON_DAMAGE_STATUS_PROFILE_VALIDATION_ERROR');
  }
  return encoded;
}

function definitionFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    version: Number(row.version),
    status: row.status,
    durationType: row.duration_type,
    defaultDurationRounds: row.default_duration_rounds === null ? null : Number(row.default_duration_rounds),
    strengthValue: row.strength_value === null ? null : Number(row.strength_value),
    effectProfile: parseJson(row.effect_profile_json, {}),
    canonicalNameZh: row.canonical_name_zh
  };
}

function profileFromRow(row) {
  if (!row) return null;
  const profile = {
    id: row.id,
    name: row.name,
    statusDefinitionId: row.status_definition_id,
    statusDefinitionVersion: Number(row.status_definition_version),
    targetMode: row.target_mode,
    primaryEffectField: row.primary_effect_field,
    primaryEffectKey: row.primary_effect_key || null,
    primaryEffectValue: Number(row.primary_effect_value),
    resistanceType: row.resistance_type,
    greatSuccessRule: row.great_success_rule,
    greatFailureRule: row.great_failure_rule,
    status: row.status,
    version: Number(row.version),
    metadata: parseJson(row.metadata_json, {}),
    createdByUserId: row.created_by_user_id || null,
    updatedByUserId: row.updated_by_user_id || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
  const definition = row.current_definition_version === undefined ? null : {
    id: row.status_definition_id,
    version: Number(row.current_definition_version),
    status: row.current_definition_status,
    canonicalNameZh: row.status_definition_name
  };
  return {
    ...profile,
    statusDefinition: definition,
    readiness: resolveProfileReadiness(profile, definition)
  };
}

async function getDefinition(env, id) {
  const row = await env.DB.prepare(`SELECT id, canonical_name_zh, version, status, duration_type,
      default_duration_rounds, strength_value, effect_profile_json
    FROM status_effect_definitions WHERE id=? LIMIT 1`).bind(id).first();
  if (!row) throw fail('Status Effect Definition not found.', 404, 'STATUS_EFFECT_DEFINITION_NOT_FOUND');
  return definitionFromRow(row);
}

async function getProfile(env, id) {
  const row = await env.DB.prepare(`SELECT p.*,
      d.version current_definition_version, d.status current_definition_status,
      d.canonical_name_zh status_definition_name
    FROM non_damage_status_application_profiles p
    JOIN status_effect_definitions d ON d.id=p.status_definition_id
    WHERE p.id=? LIMIT 1`).bind(id).first();
  if (!row) throw fail('Non-damage Status Profile not found.', 404, 'NON_DAMAGE_STATUS_PROFILE_NOT_FOUND');
  return row;
}

export async function ensureNonDamageStatusProfileAuthority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  await ensureStatusEffectAuthority(env);
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(NON_DAMAGE_STATUS_PROFILE_SCHEMA.map(sql => env.DB.prepare(sql)))
      .catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

export async function listNonDamageStatusProfiles(env, { status = 'ALL' } = {}) {
  await ensureNonDamageStatusProfileAuthority(env);
  const filter = String(status || 'ALL').trim().toUpperCase();
  if (!['ALL', 'ACTIVE', 'INACTIVE'].includes(filter)) {
    throw fail('Profile status filter is invalid.', 400, 'NON_DAMAGE_STATUS_PROFILE_VALIDATION_ERROR');
  }
  const result = filter === 'ALL'
    ? await env.DB.prepare(`SELECT p.*, d.version current_definition_version,
        d.status current_definition_status, d.canonical_name_zh status_definition_name
      FROM non_damage_status_application_profiles p
      JOIN status_effect_definitions d ON d.id=p.status_definition_id
      ORDER BY p.name COLLATE NOCASE, p.id`).all()
    : await env.DB.prepare(`SELECT p.*, d.version current_definition_version,
        d.status current_definition_status, d.canonical_name_zh status_definition_name
      FROM non_damage_status_application_profiles p
      JOIN status_effect_definitions d ON d.id=p.status_definition_id
      WHERE p.status=? ORDER BY p.name COLLATE NOCASE, p.id`).bind(filter).all();
  return (result.results || []).map(profileFromRow);
}

export async function createNonDamageStatusProfile(env, input, actorUserId) {
  await ensureNonDamageStatusProfileAuthority(env);
  let normalized;
  try { normalized = normalizeNonDamageStatusProfile(input); }
  catch (error) { throw fail(error.message, 400, 'NON_DAMAGE_STATUS_PROFILE_VALIDATION_ERROR'); }

  const definition = await getDefinition(env, normalized.statusDefinitionId);
  if (normalized.status === 'ACTIVE' && definition.status !== 'ACTIVE') {
    throw fail('ACTIVE Profile requires an ACTIVE Status Definition.', 409, 'STATUS_EFFECT_DEFINITION_INACTIVE');
  }

  let primary;
  try { primary = inspectPrimaryEffect(definition, normalized); }
  catch (error) { throw fail(error.message, 400, 'NON_DAMAGE_STATUS_PROFILE_PRIMARY_FIELD_INVALID'); }

  const id = `non_damage_status_profile_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO non_damage_status_application_profiles (
      id, name, status_definition_id, status_definition_version, target_mode,
      primary_effect_field, primary_effect_key, primary_effect_value,
      resistance_type, great_success_rule, great_failure_rule, status, version,
      metadata_json, created_by_user_id, updated_by_user_id, last_change_reason,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'ORIGINAL_TARGET', ?, ?, ?, 'OPPOSED_D100',
      'DOUBLE_PRIMARY_EFFECT', 'TARGET_DEVIATION', ?, 1, ?, ?, ?, ?, ?, ?)`)
    .bind(id, normalized.name, definition.id, definition.version,
      primary.field, primary.key, primary.value, normalized.status,
      encodeJson(normalized.metadata), actorUserId || null, actorUserId || null,
      normalized.changeReason, now, now).run();

  return profileFromRow(await getProfile(env, id));
}

export async function updateNonDamageStatusProfile(env, profileId, input, actorUserId) {
  await ensureNonDamageStatusProfileAuthority(env);
  const currentRow = await getProfile(env, profileId);
  const current = profileFromRow(currentRow);
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw fail('expectedVersion is required.', 400, 'NON_DAMAGE_STATUS_PROFILE_EXPECTED_VERSION_REQUIRED');
  }
  if (expectedVersion !== current.version) {
    throw fail('Profile changed since it was loaded.', 409, 'NON_DAMAGE_STATUS_PROFILE_VERSION_CONFLICT');
  }

  const merged = {
    name: Object.prototype.hasOwnProperty.call(input || {}, 'name') ? input.name : current.name,
    statusDefinitionId: Object.prototype.hasOwnProperty.call(input || {}, 'statusDefinitionId') ? input.statusDefinitionId : current.statusDefinitionId,
    primaryEffectField: Object.prototype.hasOwnProperty.call(input || {}, 'primaryEffectField') ? input.primaryEffectField : current.primaryEffectField,
    primaryEffectKey: Object.prototype.hasOwnProperty.call(input || {}, 'primaryEffectKey') ? input.primaryEffectKey : current.primaryEffectKey,
    status: Object.prototype.hasOwnProperty.call(input || {}, 'status') ? input.status : current.status,
    metadata: Object.prototype.hasOwnProperty.call(input || {}, 'metadata') ? input.metadata : current.metadata,
    changeReason: input?.changeReason ?? input?.reason
  };

  let normalized;
  try { normalized = normalizeNonDamageStatusProfile(merged); }
  catch (error) { throw fail(error.message, 400, 'NON_DAMAGE_STATUS_PROFILE_VALIDATION_ERROR'); }

  const definition = await getDefinition(env, normalized.statusDefinitionId);
  if (normalized.status === 'ACTIVE' && definition.status !== 'ACTIVE') {
    throw fail('ACTIVE Profile requires an ACTIVE Status Definition.', 409, 'STATUS_EFFECT_DEFINITION_INACTIVE');
  }

  let primary;
  try { primary = inspectPrimaryEffect(definition, normalized); }
  catch (error) { throw fail(error.message, 400, 'NON_DAMAGE_STATUS_PROFILE_PRIMARY_FIELD_INVALID'); }

  const now = Date.now();
  const result = await env.DB.prepare(`UPDATE non_damage_status_application_profiles SET
      name=?, status_definition_id=?, status_definition_version=?,
      primary_effect_field=?, primary_effect_key=?, primary_effect_value=?,
      status=?, version=version+1, metadata_json=?, updated_by_user_id=?,
      last_change_reason=?, updated_at=?
    WHERE id=? AND version=?`)
    .bind(normalized.name, definition.id, definition.version,
      primary.field, primary.key, primary.value, normalized.status,
      encodeJson(normalized.metadata), actorUserId || null, normalized.changeReason,
      now, current.id, expectedVersion).run();

  const changed = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changed !== 1) {
    throw fail('Profile changed during update.', 409, 'NON_DAMAGE_STATUS_PROFILE_VERSION_CONFLICT');
  }
  return profileFromRow(await getProfile(env, current.id));
}
