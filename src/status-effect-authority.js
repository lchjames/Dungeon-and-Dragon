import { STATUS_EFFECT_SCHEMA } from './status-effect-schema.js';
import {
  normalizeStatusEffectDefinition,
  planStatusEffectApplication,
  planStatusEffectRoundTick
} from './status-effect-rules.js';

let schemaPromise = null;
const SOURCE_TYPES = new Set(['GM', 'CHARACTER', 'MONSTER', 'BOSS', 'OBJECT', 'ABILITY', 'STORY', 'OTHER']);

function fail(message, status = 400, code = 'STATUS_EFFECT_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

function text(value, max, field, required = false) {
  const output = String(value ?? '').trim().normalize('NFKC');
  if (required && !output) throw fail(`${field} is required.`, 400, 'STATUS_EFFECT_VALIDATION_ERROR');
  if (output.length > max) throw fail(`${field} is too long.`, 400, 'STATUS_EFFECT_VALIDATION_ERROR');
  return output;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function encodeJson(value, maxBytes, field) {
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).byteLength > maxBytes) {
    throw fail(`${field} is too large.`, 400, 'STATUS_EFFECT_VALIDATION_ERROR');
  }
  return encoded;
}

function definitionFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    canonicalNameZh: row.canonical_name_zh,
    category: row.category,
    layers: parseJson(row.layers_json || '[]', []),
    sourceAttribute: row.source_attribute || null,
    durationType: row.duration_type,
    defaultDurationRounds: row.default_duration_rounds === null || row.default_duration_rounds === undefined ? null : Number(row.default_duration_rounds),
    effectProfile: parseJson(row.effect_profile_json || '{}', {}),
    triggerTimings: parseJson(row.trigger_timings_json || '[]', []),
    stackingRule: row.stacking_rule,
    stackKey: row.stack_key,
    maxStacks: row.max_stacks === null || row.max_stacks === undefined ? null : Number(row.max_stacks),
    strengthValue: row.strength_value === null || row.strength_value === undefined ? null : Number(row.strength_value),
    dispelTags: parseJson(row.dispel_tags_json || '[]', []),
    immunityRules: parseJson(row.immunity_rules_json || '[]', []),
    status: row.status,
    version: Number(row.version),
    descriptionZh: row.description_zh || '',
    metadata: parseJson(row.metadata_json || '{}', {}),
    createdByUserId: row.created_by_user_id || null,
    updatedByUserId: row.updated_by_user_id || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function instanceFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    definitionId: row.definition_id,
    definitionVersion: Number(row.definition_version),
    definitionNameZh: row.definition_name || null,
    targetType: row.target_type,
    targetId: row.target_id,
    stackKey: row.stack_key,
    status: row.status,
    durationType: row.duration_type,
    remainingRounds: row.remaining_rounds === null || row.remaining_rounds === undefined ? null : Number(row.remaining_rounds),
    stackCount: Number(row.stack_count),
    strengthValue: row.strength_value === null || row.strength_value === undefined ? null : Number(row.strength_value),
    sourceType: row.source_type,
    sourceId: row.source_id || null,
    sourceAbilityDefinitionId: row.source_ability_definition_id || null,
    effectSnapshot: parseJson(row.effect_snapshot_json || '{}', {}),
    sourceContext: parseJson(row.source_context_json || '{}', {}),
    appliedByUserId: row.applied_by_user_id || null,
    removedByUserId: row.removed_by_user_id || null,
    version: Number(row.version),
    appliedAt: Number(row.applied_at),
    updatedAt: Number(row.updated_at),
    removedAt: row.removed_at === null || row.removed_at === undefined ? null : Number(row.removed_at),
    removalReason: row.removal_reason || null,
    lastAction: row.last_action,
    lastReason: row.last_reason
  };
}

function auditFromRow(row) {
  return {
    id: row.id,
    instanceId: row.instance_id,
    definitionId: row.definition_id,
    targetType: row.target_type,
    targetId: row.target_id,
    action: row.action,
    beforeSnapshot: row.before_snapshot_json ? parseJson(row.before_snapshot_json, null) : null,
    afterSnapshot: row.after_snapshot_json ? parseJson(row.after_snapshot_json, null) : null,
    reason: row.reason,
    actorUserId: row.actor_user_id || null,
    createdAt: Number(row.created_at)
  };
}

function definitionInputFromRow(row, patch) {
  return {
    canonicalNameZh: patch.canonicalNameZh ?? row.canonical_name_zh,
    category: patch.category ?? row.category,
    layers: patch.layers ?? parseJson(row.layers_json || '[]', []),
    sourceAttribute: Object.prototype.hasOwnProperty.call(patch, 'sourceAttribute') ? patch.sourceAttribute : row.source_attribute,
    durationType: patch.durationType ?? row.duration_type,
    defaultDurationRounds: Object.prototype.hasOwnProperty.call(patch, 'defaultDurationRounds') ? patch.defaultDurationRounds : row.default_duration_rounds,
    effectProfile: patch.effectProfile ?? parseJson(row.effect_profile_json || '{}', {}),
    triggerTimings: patch.triggerTimings ?? parseJson(row.trigger_timings_json || '[]', []),
    stackingRule: patch.stackingRule ?? row.stacking_rule,
    stackKey: patch.stackKey ?? row.stack_key,
    maxStacks: Object.prototype.hasOwnProperty.call(patch, 'maxStacks') ? patch.maxStacks : row.max_stacks,
    strengthValue: Object.prototype.hasOwnProperty.call(patch, 'strengthValue') ? patch.strengthValue : row.strength_value,
    dispelTags: patch.dispelTags ?? parseJson(row.dispel_tags_json || '[]', []),
    immunityRules: patch.immunityRules ?? parseJson(row.immunity_rules_json || '[]', []),
    status: patch.status ?? row.status,
    descriptionZh: patch.descriptionZh ?? row.description_zh,
    metadata: patch.metadata ?? parseJson(row.metadata_json || '{}', {}),
    changeReason: patch.changeReason ?? patch.reason
  };
}

function definitionSnapshot(definition) {
  return {
    id: definition.id,
    version: definition.version,
    canonicalNameZh: definition.canonicalNameZh,
    category: definition.category,
    layers: definition.layers,
    sourceAttribute: definition.sourceAttribute,
    durationType: definition.durationType,
    defaultDurationRounds: definition.defaultDurationRounds,
    effectProfile: definition.effectProfile,
    triggerTimings: definition.triggerTimings,
    stackingRule: definition.stackingRule,
    stackKey: definition.stackKey,
    maxStacks: definition.maxStacks,
    strengthValue: definition.strengthValue,
    dispelTags: definition.dispelTags,
    immunityRules: definition.immunityRules,
    descriptionZh: definition.descriptionZh,
    metadata: definition.metadata
  };
}

function runtimeAuditSnapshot(instance) {
  return JSON.stringify({
    definitionId: instance.definitionId,
    definitionVersion: instance.definitionVersion,
    status: instance.status,
    durationType: instance.durationType,
    remainingRounds: instance.remainingRounds,
    stackCount: instance.stackCount,
    strengthValue: instance.strengthValue,
    stackKey: instance.stackKey,
    sourceType: instance.sourceType,
    sourceId: instance.sourceId,
    sourceAbilityDefinitionId: instance.sourceAbilityDefinitionId,
    effectSnapshotJson: JSON.stringify(instance.effectSnapshot || {}),
    sourceContextJson: JSON.stringify(instance.sourceContext || {}),
    version: instance.version
  });
}

async function requireCharacter(env, characterId) {
  const id = text(characterId, 200, 'Character ID', true);
  const row = await env.DB.prepare('SELECT id, name, status FROM characters WHERE id=? LIMIT 1').bind(id).first();
  if (!row) throw fail('Character not found.', 404, 'CHARACTER_NOT_FOUND');
  return row;
}

async function getDefinitionRow(env, definitionId) {
  const id = text(definitionId, 200, 'Status Definition ID', true);
  const row = await env.DB.prepare('SELECT * FROM status_effect_definitions WHERE id=? LIMIT 1').bind(id).first();
  if (!row) throw fail('Status Effect Definition not found.', 404, 'STATUS_EFFECT_DEFINITION_NOT_FOUND');
  return row;
}

async function getInstanceRow(env, instanceId) {
  const id = text(instanceId, 200, 'Runtime Status Effect ID', true);
  const row = await env.DB.prepare(`SELECT r.*, d.canonical_name_zh definition_name
    FROM runtime_status_effects r
    JOIN status_effect_definitions d ON d.id=r.definition_id
    WHERE r.id=? LIMIT 1`).bind(id).first();
  if (!row) throw fail('Runtime Status Effect not found.', 404, 'RUNTIME_STATUS_EFFECT_NOT_FOUND');
  return row;
}

function normalizeSource(input, actorUserId) {
  const sourceType = String(input?.sourceType ?? 'GM').trim().toUpperCase();
  if (!SOURCE_TYPES.has(sourceType)) throw fail('Source type is invalid.', 400, 'STATUS_EFFECT_VALIDATION_ERROR');
  const sourceId = text(input?.sourceId ?? (sourceType === 'GM' ? actorUserId : ''), 200, 'Source ID');
  const sourceAbilityDefinitionId = text(input?.sourceAbilityDefinitionId, 200, 'Source Ability Definition ID');
  const context = input?.sourceContext && typeof input.sourceContext === 'object' && !Array.isArray(input.sourceContext)
    ? input.sourceContext
    : {};
  return {
    sourceType,
    sourceId: sourceId || null,
    sourceAbilityDefinitionId: sourceAbilityDefinitionId || null,
    sourceContextJson: encodeJson(context, 8192, 'Source context')
  };
}

async function validateSourceAbility(env, abilityDefinitionId) {
  if (!abilityDefinitionId) return;
  const row = await env.DB.prepare('SELECT id FROM ability_definitions WHERE id=? LIMIT 1').bind(abilityDefinitionId).first();
  if (!row) throw fail('Source Ability Definition not found.', 404, 'ABILITY_DEFINITION_NOT_FOUND');
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export async function ensureStatusEffectAuthority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(STATUS_EFFECT_SCHEMA.map(sql => env.DB.prepare(sql)))
      .catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

export async function listStatusEffectDefinitions(env, { status = 'ALL' } = {}) {
  await ensureStatusEffectAuthority(env);
  const filter = String(status || 'ALL').trim().toUpperCase();
  if (!['ALL', 'ACTIVE', 'INACTIVE'].includes(filter)) throw fail('Definition status filter is invalid.', 400, 'STATUS_EFFECT_VALIDATION_ERROR');
  const result = filter === 'ALL'
    ? await env.DB.prepare('SELECT * FROM status_effect_definitions ORDER BY canonical_name_zh, id').all()
    : await env.DB.prepare('SELECT * FROM status_effect_definitions WHERE status=? ORDER BY canonical_name_zh, id').bind(filter).all();
  return (result.results || []).map(definitionFromRow);
}

export async function createStatusEffectDefinition(env, input, actorUserId) {
  await ensureStatusEffectAuthority(env);
  const id = `status_def_${crypto.randomUUID()}`;
  let normalized;
  try { normalized = normalizeStatusEffectDefinition(input, { fallbackStackKey: id }); }
  catch (error) { throw fail(error.message, 400, 'STATUS_EFFECT_VALIDATION_ERROR'); }
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO status_effect_definitions (
    id, canonical_name_zh, category, layers_json, source_attribute, duration_type, default_duration_rounds,
    effect_profile_json, trigger_timings_json, stacking_rule, stack_key, max_stacks, strength_value,
    dispel_tags_json, immunity_rules_json, status, version, description_zh, metadata_json,
    created_by_user_id, updated_by_user_id, last_change_reason, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, normalized.canonicalNameZh, normalized.category,
      encodeJson(normalized.layers, 4096, 'Layers'), normalized.sourceAttribute, normalized.durationType,
      normalized.defaultDurationRounds, encodeJson(normalized.effectProfile, 65536, 'Effect profile'),
      encodeJson(normalized.triggerTimings, 4096, 'Trigger timings'), normalized.stackingRule, normalized.stackKey,
      normalized.maxStacks, normalized.strengthValue, encodeJson(normalized.dispelTags, 4096, 'Dispel tags'),
      encodeJson(normalized.immunityRules, 16384, 'Immunity rules'), normalized.status, normalized.descriptionZh,
      encodeJson(normalized.metadata, 16384, 'Metadata'), actorUserId || null, actorUserId || null,
      normalized.changeReason, now, now
    ).run();
  return definitionFromRow(await getDefinitionRow(env, id));
}

export async function updateStatusEffectDefinition(env, definitionId, input, actorUserId) {
  await ensureStatusEffectAuthority(env);
  const current = await getDefinitionRow(env, definitionId);
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw fail('expectedVersion is required.', 400, 'STATUS_EFFECT_EXPECTED_VERSION_REQUIRED');
  if (expectedVersion !== Number(current.version)) throw fail('Status Effect Definition changed since it was loaded.', 409, 'STATUS_EFFECT_DEFINITION_VERSION_CONFLICT');
  let normalized;
  try { normalized = normalizeStatusEffectDefinition(definitionInputFromRow(current, input), { fallbackStackKey: current.stack_key }); }
  catch (error) { throw fail(error.message, 400, 'STATUS_EFFECT_VALIDATION_ERROR'); }
  const now = Date.now();
  const result = await env.DB.prepare(`UPDATE status_effect_definitions SET
      canonical_name_zh=?, category=?, layers_json=?, source_attribute=?, duration_type=?, default_duration_rounds=?,
      effect_profile_json=?, trigger_timings_json=?, stacking_rule=?, stack_key=?, max_stacks=?, strength_value=?,
      dispel_tags_json=?, immunity_rules_json=?, status=?, version=version+1, description_zh=?, metadata_json=?,
      updated_by_user_id=?, last_change_reason=?, updated_at=?
    WHERE id=? AND version=?`)
    .bind(
      normalized.canonicalNameZh, normalized.category, encodeJson(normalized.layers, 4096, 'Layers'),
      normalized.sourceAttribute, normalized.durationType, normalized.defaultDurationRounds,
      encodeJson(normalized.effectProfile, 65536, 'Effect profile'), encodeJson(normalized.triggerTimings, 4096, 'Trigger timings'),
      normalized.stackingRule, normalized.stackKey, normalized.maxStacks, normalized.strengthValue,
      encodeJson(normalized.dispelTags, 4096, 'Dispel tags'), encodeJson(normalized.immunityRules, 16384, 'Immunity rules'),
      normalized.status, normalized.descriptionZh, encodeJson(normalized.metadata, 16384, 'Metadata'),
      actorUserId || null, normalized.changeReason, now, current.id, expectedVersion
    ).run();
  if (changes(result) !== 1) throw fail('Status Effect Definition changed during update.', 409, 'STATUS_EFFECT_DEFINITION_VERSION_CONFLICT');
  return definitionFromRow(await getDefinitionRow(env, current.id));
}

export async function listCharacterStatusEffects(env, characterId, { includeHistory = false } = {}) {
  await ensureStatusEffectAuthority(env);
  const character = await requireCharacter(env, characterId);
  const sql = `SELECT r.*, d.canonical_name_zh definition_name
    FROM runtime_status_effects r
    JOIN status_effect_definitions d ON d.id=r.definition_id
    WHERE r.target_type='CHARACTER' AND r.target_id=?${includeHistory ? '' : " AND r.status='ACTIVE'"}
    ORDER BY CASE WHEN r.status='ACTIVE' THEN 0 ELSE 1 END, r.updated_at DESC, r.id DESC`;
  const result = await env.DB.prepare(sql).bind(character.id).all();
  return { character, effects: (result.results || []).map(instanceFromRow) };
}

export async function listCharacterStatusEffectAudit(env, characterId, { limit = 50 } = {}) {
  await ensureStatusEffectAuthority(env);
  const character = await requireCharacter(env, characterId);
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  const result = await env.DB.prepare(`SELECT * FROM runtime_status_effect_audit
    WHERE target_type='CHARACTER' AND target_id=?
    ORDER BY created_at DESC, id DESC LIMIT ?`).bind(character.id, safeLimit).all();
  return (result.results || []).map(auditFromRow);
}

async function insertRuntimeInstance(env, { definition, characterId, source, reason, actorUserId, action, now, id = `status_runtime_${crypto.randomUUID()}` }) {
  const snapshotJson = encodeJson(definitionSnapshot(definition), 65536, 'Status Definition snapshot');
  await env.DB.prepare(`INSERT INTO runtime_status_effects (
    id, definition_id, definition_version, target_type, target_id, stack_key, status, duration_type,
    remaining_rounds, stack_count, strength_value, source_type, source_id, source_ability_definition_id,
    effect_snapshot_json, source_context_json, applied_by_user_id, removed_by_user_id, version,
    applied_at, updated_at, removed_at, removal_reason, last_action, last_reason, last_actor_user_id
  ) VALUES (?, ?, ?, 'CHARACTER', ?, ?, 'ACTIVE', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, NULL, ?, ?, ?)`)
    .bind(
      id, definition.id, definition.version, characterId, definition.stackKey, definition.durationType,
      definition.durationType === 'ROUNDS' ? definition.defaultDurationRounds : null, definition.strengthValue,
      source.sourceType, source.sourceId, source.sourceAbilityDefinitionId, snapshotJson, source.sourceContextJson,
      actorUserId || null, now, now, action, reason, actorUserId || null
    ).run();
  return id;
}

async function applyStatusEffectDefinitionToCharacter(env, character, definition, input, actorUserId) {
  if (definition.status !== 'ACTIVE') throw fail('Inactive Status Effect Definition cannot be applied.', 409, 'STATUS_EFFECT_DEFINITION_INACTIVE');
  const reason = text(input?.meaningfulReason ?? input?.reason, 1000, 'Meaningful application reason', true);
  const source = normalizeSource(input, actorUserId);
  await validateSourceAbility(env, source.sourceAbilityDefinitionId);

  const existingRow = await env.DB.prepare(`SELECT r.*, d.canonical_name_zh definition_name
    FROM runtime_status_effects r
    JOIN status_effect_definitions d ON d.id=r.definition_id
    WHERE r.target_type='CHARACTER' AND r.target_id=? AND r.stack_key=? AND r.status='ACTIVE'
    LIMIT 1`).bind(character.id, definition.stackKey).first();
  const existing = instanceFromRow(existingRow);

  if (existing && ['REFRESH_DURATION', 'EXTEND_DURATION', 'ADD_STACKS'].includes(definition.stackingRule) && existing.definitionId !== definition.id) {
    throw fail('This stacking policy may only merge the same Status Definition within one stack key.', 409, 'STATUS_EFFECT_STACK_DEFINITION_MISMATCH');
  }

  let plan;
  try { plan = planStatusEffectApplication(existing, definition); }
  catch (error) { throw fail(error.message, 409, 'STATUS_EFFECT_STACK_CONFLICT'); }

  const approvedOverride = definition.__approvedPrimaryOverride || null;
  if (approvedOverride && Number(approvedOverride.multiplier) > 1 && ['REFRESH', 'EXTEND', 'STACK'].includes(plan.operation)) {
    const durationMerge = approvedOverride.field === 'DURATION_ROUNDS' && ['REFRESH', 'EXTEND'].includes(plan.operation);
    if (!durationMerge) {
      throw fail(
        'Approved primary-effect multiplier cannot be represented by this stacking operation.',
        409,
        'STATUS_EFFECT_PRIMARY_OVERRIDE_STACKING_UNSUPPORTED'
      );
    }
  }
  const now = Date.now();

  if (plan.operation === 'BLOCK') {
    const snapshot = runtimeAuditSnapshot(existing);
    await env.DB.prepare(`INSERT INTO runtime_status_effect_audit (
      id, instance_id, definition_id, target_type, target_id, action, before_snapshot_json,
      after_snapshot_json, reason, actor_user_id, created_at
    ) VALUES (?, ?, ?, 'CHARACTER', ?, 'APPLY_BLOCKED', ?, ?, ?, ?, ?)`)
      .bind(`status_runtime_audit_${crypto.randomUUID()}`, existing.id, definition.id, character.id, snapshot, snapshot,
        `${reason} [${plan.reason}]`, actorUserId || null, now).run();
    return { operation: 'BLOCK', blockReason: plan.reason, instance: existing };
  }

  if (plan.operation === 'CREATE') {
    const id = await insertRuntimeInstance(env, { definition, characterId: character.id, source, reason, actorUserId, action: 'APPLY_CREATE', now });
    return { operation: 'CREATE', instance: instanceFromRow(await getInstanceRow(env, id)) };
  }

  if (['REFRESH', 'EXTEND', 'STACK'].includes(plan.operation)) {
    const sets = [];
    const binds = [];
    if (plan.operation === 'REFRESH' || plan.operation === 'EXTEND') {
      sets.push('remaining_rounds=?');
      binds.push(plan.remainingRounds);
    }
    if (plan.operation === 'STACK') {
      sets.push('stack_count=?');
      binds.push(plan.stackCount);
    }
    sets.push('source_type=?', 'source_id=?', 'source_ability_definition_id=?', 'source_context_json=?', 'version=version+1', 'updated_at=?', 'last_action=?', 'last_reason=?', 'last_actor_user_id=?');
    binds.push(source.sourceType, source.sourceId, source.sourceAbilityDefinitionId, source.sourceContextJson, now, plan.operation, reason, actorUserId || null, existing.id, existing.version);
    const result = await env.DB.prepare(`UPDATE runtime_status_effects SET ${sets.join(', ')} WHERE id=? AND status='ACTIVE' AND version=?`).bind(...binds).run();
    if (changes(result) !== 1) throw fail('Runtime Status changed during application.', 409, 'RUNTIME_STATUS_EFFECT_VERSION_CONFLICT');
    return { operation: plan.operation, instance: instanceFromRow(await getInstanceRow(env, existing.id)) };
  }

  const replacementId = `status_runtime_${crypto.randomUUID()}`;
  const replacementSnapshotJson = encodeJson(definitionSnapshot(definition), 65536, 'Status Definition snapshot');
  const action = plan.operation;
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE runtime_status_effects SET
        status='REPLACED', removed_by_user_id=?, version=version+1, updated_at=?, removed_at=?, removal_reason=?,
        last_action=?, last_reason=?, last_actor_user_id=?
        WHERE id=? AND status='ACTIVE' AND version=?`)
        .bind(actorUserId || null, now, now, reason, action, reason, actorUserId || null, existing.id, existing.version),
      env.DB.prepare(`INSERT INTO runtime_status_effects (
        id, definition_id, definition_version, target_type, target_id, stack_key, status, duration_type,
        remaining_rounds, stack_count, strength_value, source_type, source_id, source_ability_definition_id,
        effect_snapshot_json, source_context_json, applied_by_user_id, removed_by_user_id, version,
        applied_at, updated_at, removed_at, removal_reason, last_action, last_reason, last_actor_user_id
      ) VALUES (?, ?, ?, 'CHARACTER', ?, ?, 'ACTIVE', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, NULL, ?, ?, ?)`)
        .bind(
          replacementId, definition.id, definition.version, character.id, definition.stackKey, definition.durationType,
          definition.durationType === 'ROUNDS' ? definition.defaultDurationRounds : null, definition.strengthValue,
          source.sourceType, source.sourceId, source.sourceAbilityDefinitionId, replacementSnapshotJson, source.sourceContextJson,
          actorUserId || null, now, now, action, reason, actorUserId || null
        )
    ]);
  } catch (error) {
    throw fail(`Runtime Status replacement conflicted with another write: ${error?.message || error}`, 409, 'RUNTIME_STATUS_EFFECT_VERSION_CONFLICT');
  }
  return { operation: action, instance: instanceFromRow(await getInstanceRow(env, replacementId)), replacedInstanceId: existing.id };
}

export async function applyStatusEffectToCharacter(env, characterId, input, actorUserId) {
  await ensureStatusEffectAuthority(env);
  const character = await requireCharacter(env, characterId);
  const definitionRow = await getDefinitionRow(env, input?.definitionId);
  const definition = definitionFromRow(definitionRow);
  return applyStatusEffectDefinitionToCharacter(env, character, definition, input, actorUserId);
}

export async function applyPinnedStatusEffectToCharacter(env, characterId, input, actorUserId) {
  await ensureStatusEffectAuthority(env);
  const character = await requireCharacter(env, characterId);
  const definitionRow = await getDefinitionRow(env, input?.definitionId);
  const definition = definitionFromRow(definitionRow);

  const expectedVersion = Number(input?.expectedDefinitionVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion !== definition.version) {
    throw fail('Approved Status Definition version is stale.', 409, 'STATUS_EFFECT_DEFINITION_VERSION_STALE');
  }

  const multiplier = Number(input?.primaryEffectMultiplier ?? 1);
  if (![1, 2].includes(multiplier)) {
    throw fail('Primary effect multiplier must be 1 or 2.', 400, 'STATUS_EFFECT_PRIMARY_OVERRIDE_INVALID');
  }

  const field = String(input?.primaryEffectField || '').trim().toUpperCase();
  const baseValue = Number(input?.primaryEffectValue);
  if (!Number.isFinite(baseValue)) {
    throw fail('Approved primary effect value is invalid.', 400, 'STATUS_EFFECT_PRIMARY_OVERRIDE_INVALID');
  }

  const overridden = { ...definition, effectProfile: { ...(definition.effectProfile || {}) } };
  if (field === 'DURATION_ROUNDS') {
    if (definition.durationType !== 'ROUNDS' || Number(definition.defaultDurationRounds) !== baseValue) {
      throw fail('Approved duration snapshot no longer matches the Status Definition.', 409, 'STATUS_EFFECT_PRIMARY_OVERRIDE_STALE');
    }
    const next = baseValue * multiplier;
    if (!Number.isSafeInteger(next) || next < 1) throw fail('Approved duration multiplier is invalid.', 400, 'STATUS_EFFECT_PRIMARY_OVERRIDE_INVALID');
    overridden.defaultDurationRounds = next;
  } else if (field === 'STRENGTH_VALUE') {
    if (Number(definition.strengthValue) !== baseValue) {
      throw fail('Approved strength snapshot no longer matches the Status Definition.', 409, 'STATUS_EFFECT_PRIMARY_OVERRIDE_STALE');
    }
    overridden.strengthValue = baseValue * multiplier;
  } else if (field === 'EFFECT_PROFILE_NUMERIC') {
    const key = String(input?.primaryEffectKey || '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw fail('Approved Effect Profile key is invalid.', 400, 'STATUS_EFFECT_PRIMARY_OVERRIDE_INVALID');
    if (Number(definition.effectProfile?.[key]) !== baseValue) {
      throw fail('Approved Effect Profile snapshot no longer matches the Status Definition.', 409, 'STATUS_EFFECT_PRIMARY_OVERRIDE_STALE');
    }
    overridden.effectProfile[key] = baseValue * multiplier;
  } else {
    throw fail('Approved primary effect field is invalid.', 400, 'STATUS_EFFECT_PRIMARY_OVERRIDE_INVALID');
  }

  overridden.__approvedPrimaryOverride = { field, multiplier };
  return applyStatusEffectDefinitionToCharacter(env, character, overridden, input, actorUserId);
}

export async function removeRuntimeStatusEffect(env, instanceId, input, actorUserId) {
  await ensureStatusEffectAuthority(env);
  const row = await getInstanceRow(env, instanceId);
  const instance = instanceFromRow(row);
  if (instance.status !== 'ACTIVE') throw fail('Only an active Runtime Status Effect can be removed.', 409, 'RUNTIME_STATUS_EFFECT_NOT_ACTIVE');
  const reason = text(input?.meaningfulReason ?? input?.reason, 1000, 'Removal reason', true);
  const now = Date.now();
  const result = await env.DB.prepare(`UPDATE runtime_status_effects SET
      status='REMOVED', removed_by_user_id=?, version=version+1, updated_at=?, removed_at=?, removal_reason=?,
      last_action='REMOVE', last_reason=?, last_actor_user_id=?
    WHERE id=? AND status='ACTIVE' AND version=?`)
    .bind(actorUserId || null, now, now, reason, reason, actorUserId || null, instance.id, instance.version).run();
  if (changes(result) !== 1) throw fail('Runtime Status changed during removal.', 409, 'RUNTIME_STATUS_EFFECT_VERSION_CONFLICT');
  return instanceFromRow(await getInstanceRow(env, instance.id));
}

export async function advanceCharacterStatusRound(env, characterId, input, actorUserId) {
  await ensureStatusEffectAuthority(env);
  const character = await requireCharacter(env, characterId);
  const reason = text(input?.meaningfulReason ?? input?.reason, 1000, 'Status round reason', true);
  const active = await env.DB.prepare(`SELECT r.*, d.canonical_name_zh definition_name
    FROM runtime_status_effects r
    JOIN status_effect_definitions d ON d.id=r.definition_id
    WHERE r.target_type='CHARACTER' AND r.target_id=? AND r.status='ACTIVE' AND r.duration_type='ROUNDS'
    ORDER BY r.applied_at, r.id`).bind(character.id).all();
  const rows = active.results || [];
  if (!rows.length) return { character, changed: 0, ticked: 0, expired: 0, effects: [] };
  const now = Date.now();
  const plans = rows.map(row => ({ row, plan: planStatusEffectRoundTick(instanceFromRow(row)) }));
  const statements = plans.map(({ row, plan }) => {
    if (plan.operation === 'EXPIRE') {
      return env.DB.prepare(`UPDATE runtime_status_effects SET
        status='EXPIRED', remaining_rounds=0, version=version+1, updated_at=?, removed_at=?, removal_reason=?,
        last_action='EXPIRE', last_reason=?, last_actor_user_id=?
        WHERE id=? AND status='ACTIVE' AND version=?`)
        .bind(now, now, reason, reason, actorUserId || null, row.id, row.version);
    }
    return env.DB.prepare(`UPDATE runtime_status_effects SET
      remaining_rounds=?, version=version+1, updated_at=?, last_action='TICK', last_reason=?, last_actor_user_id=?
      WHERE id=? AND status='ACTIVE' AND version=?`)
      .bind(plan.remainingRounds, now, reason, actorUserId || null, row.id, row.version);
  });
  const results = await env.DB.batch(statements);
  const changed = results.reduce((sum, result) => sum + (changes(result) > 0 ? 1 : 0), 0);
  const current = await listCharacterStatusEffects(env, character.id, { includeHistory: true });
  return {
    character,
    changed,
    ticked: plans.filter(entry => entry.plan.operation === 'TICK').length,
    expired: plans.filter(entry => entry.plan.operation === 'EXPIRE').length,
    effects: current.effects
  };
}
