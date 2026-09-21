import { ensureNonDamageEffectSettlementAuthority } from './non-damage-effect-settlement-authority.js';
import { ensureNonDamageStatusProfileAuthority } from './non-damage-status-profile-authority.js';
import { NON_DAMAGE_STATUS_APPLICATION_SCHEMA } from './non-damage-status-application-schema.js';
import { applyPinnedStatusEffectToCharacter, ensureStatusEffectAuthority } from './status-effect-authority.js';

let schemaPromise = null;

function fail(message, status = 400, code = 'NON_DAMAGE_STATUS_APPLICATION_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

function text(value, max, field, required = false) {
  const output = String(value ?? '').trim().normalize('NFKC');
  if (required && !output) throw fail(`${field} is required.`, 400, 'NON_DAMAGE_STATUS_APPLICATION_VALIDATION_ERROR');
  if (output.length > max) throw fail(`${field} is too long.`, 400, 'NON_DAMAGE_STATUS_APPLICATION_VALIDATION_ERROR');
  return output;
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function rowView(row) {
  if (!row) return null;
  return {
    id: row.id,
    settlementId: row.settlement_id,
    profileId: row.profile_id,
    targetCharacterId: row.target_character_id,
    sourceCharacterId: row.source_character_id,
    statusDefinitionId: row.status_definition_id,
    statusDefinitionVersion: Number(row.status_definition_version),
    primaryEffectField: row.primary_effect_field,
    primaryEffectKey: row.primary_effect_key || null,
    primaryEffectBaseValue: Number(row.primary_effect_base_value),
    primaryEffectMultiplier: Number(row.primary_effect_multiplier),
    primaryEffectAppliedValue: Number(row.primary_effect_applied_value),
    settlementOutcome: row.settlement_outcome,
    applicationStatus: row.application_status,
    runtimeStatusEffectId: row.runtime_status_effect_id || null,
    runtimeOperation: row.runtime_operation || null,
    meaningfulReason: row.meaningful_reason,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

async function loadSettlement(env, id) {
  const row = await env.DB.prepare(`SELECT * FROM non_damage_effect_settlement_log WHERE id=? LIMIT 1`).bind(id).first();
  if (!row) throw fail('Settlement not found.', 404, 'NON_DAMAGE_EFFECT_SETTLEMENT_NOT_FOUND');
  return row;
}

async function loadProfile(env, id) {
  const row = await env.DB.prepare(`SELECT p.*, d.version current_definition_version, d.status current_definition_status
    FROM non_damage_status_application_profiles p
    JOIN status_effect_definitions d ON d.id=p.status_definition_id
    WHERE p.id=? LIMIT 1`).bind(id).first();
  if (!row) throw fail('Status Application Profile not found.', 404, 'NON_DAMAGE_STATUS_PROFILE_NOT_FOUND');
  if (row.status !== 'ACTIVE') throw fail('Status Application Profile is inactive.', 409, 'NON_DAMAGE_STATUS_PROFILE_INACTIVE');
  if (row.current_definition_status !== 'ACTIVE') throw fail('Linked Status Definition is inactive.', 409, 'STATUS_EFFECT_DEFINITION_INACTIVE');
  if (Number(row.status_definition_version) !== Number(row.current_definition_version)) {
    throw fail('Status Application Profile is stale and must be re-approved.', 409, 'STATUS_DEFINITION_VERSION_STALE');
  }
  return row;
}

async function loadApplication(env, settlementId, profileId) {
  return env.DB.prepare(`SELECT * FROM non_damage_status_application_log
    WHERE settlement_id=? AND profile_id=? LIMIT 1`).bind(settlementId, profileId).first();
}

async function reconcileFromStatusAudit(env, applicationRow, actorUserId) {
  const token = `[ND_STATUS_APP:${applicationRow.id}]`;
  const audit = await env.DB.prepare(`SELECT instance_id, action FROM runtime_status_effect_audit
    WHERE instr(reason, ?) > 0 ORDER BY created_at DESC, id DESC LIMIT 1`).bind(token).first();
  if (!audit) return null;
  const finalStatus = audit.action === 'APPLY_BLOCKED' ? 'BLOCKED' : 'APPLIED';
  const now = Date.now();
  const result = await env.DB.prepare(`UPDATE non_damage_status_application_log SET
      application_status=?, runtime_status_effect_id=?, runtime_operation=?,
      actor_user_id=?, lease_token=NULL, lease_expires_at=NULL, updated_at=?
    WHERE id=? AND application_status='PENDING'`)
    .bind(finalStatus, audit.instance_id || null, audit.action || null, actorUserId || null, now, applicationRow.id).run();
  if (changes(result) === 1) {
    return rowView(await env.DB.prepare('SELECT * FROM non_damage_status_application_log WHERE id=?').bind(applicationRow.id).first());
  }
  return rowView(await env.DB.prepare('SELECT * FROM non_damage_status_application_log WHERE id=?').bind(applicationRow.id).first());
}

export async function ensureNonDamageStatusApplicationAuthority(env) {
  if (!env?.DB) throw fail('D1 binding DB is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  await ensureNonDamageEffectSettlementAuthority(env);
  await ensureNonDamageStatusProfileAuthority(env);
  await ensureStatusEffectAuthority(env);
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(NON_DAMAGE_STATUS_APPLICATION_SCHEMA.map(sql => env.DB.prepare(sql)))
      .catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

export async function listNonDamageStatusApplications(env, { limit = 50 } = {}) {
  await ensureNonDamageStatusApplicationAuthority(env);
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  const result = await env.DB.prepare(`SELECT * FROM non_damage_status_application_log
    ORDER BY created_at DESC, id DESC LIMIT ?`).bind(safeLimit).all();
  return (result.results || []).map(rowView);
}

export async function applySettlementStatusProfile(env, input, actorUserId) {
  await ensureNonDamageStatusApplicationAuthority(env);
  const settlementId = text(input?.settlementId, 200, 'Settlement ID', true);
  const profileId = text(input?.profileId, 200, 'Profile ID', true);
  const meaningfulReason = text(input?.meaningfulReason ?? input?.reason, 1000, 'Meaningful application reason', true);

  const existing = await loadApplication(env, settlementId, profileId);
  if (existing) {
    if (existing.application_status !== 'PENDING') return { idempotent: true, application: rowView(existing) };
    const reconciled = await reconcileFromStatusAudit(env, existing, actorUserId);
    if (reconciled) return { idempotent: true, application: reconciled };
  }

  const settlement = await loadSettlement(env, settlementId);
  if (settlement.original_target_resolution === 'GM_DECISION_REQUIRED' || Number(settlement.gm_resolution_required) === 1) {
    throw fail('Settlement still requires GM deviation adjudication.', 409, 'NON_DAMAGE_STATUS_APPLICATION_GM_DECISION_REQUIRED');
  }

  const profile = await loadProfile(env, profileId);
  if (existing && (
    existing.status_definition_id !== profile.status_definition_id ||
    Number(existing.status_definition_version) !== Number(profile.status_definition_version) ||
    existing.primary_effect_field !== profile.primary_effect_field ||
    String(existing.primary_effect_key || '') !== String(profile.primary_effect_key || '') ||
    Number(existing.primary_effect_base_value) !== Number(profile.primary_effect_value)
  )) {
    throw fail('Pending application is pinned to an older Profile snapshot; use a new approved Profile identity.', 409, 'NON_DAMAGE_STATUS_APPLICATION_PROFILE_CHANGED');
  }
  const multiplier = Number(settlement.primary_effect_multiplier);
  if (![1, 2].includes(multiplier)) throw fail('Settlement primary multiplier is invalid.', 409, 'NON_DAMAGE_STATUS_APPLICATION_SETTLEMENT_INVALID');
  const baseValue = Number(profile.primary_effect_value);
  if (!Number.isFinite(baseValue)) throw fail('Profile primary value is invalid.', 409, 'NON_DAMAGE_STATUS_APPLICATION_PROFILE_INVALID');
  const appliedValue = baseValue * multiplier;

  if (settlement.original_target_resolution === 'BLOCKED') {
    const id = `nd_status_app_${crypto.randomUUID()}`;
    const now = Date.now();
    try {
      await env.DB.prepare(`INSERT INTO non_damage_status_application_log (
        id, settlement_id, profile_id, application_key, target_character_id, source_character_id,
        status_definition_id, status_definition_version, primary_effect_field, primary_effect_key,
        primary_effect_base_value, primary_effect_multiplier, primary_effect_applied_value,
        settlement_outcome, application_status, runtime_status_effect_id, runtime_operation,
        meaningful_reason, actor_user_id, lease_token, lease_expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BLOCKED', NULL, NULL, ?, ?, NULL, NULL, ?, ?)`)
        .bind(id, settlement.id, profile.id, id, settlement.resistance_character_id, settlement.source_character_id,
          profile.status_definition_id, profile.status_definition_version, profile.primary_effect_field, profile.primary_effect_key,
          baseValue, multiplier, appliedValue, settlement.outcome, meaningfulReason, actorUserId || null, now, now).run();
    } catch (error) {
      const raced = await loadApplication(env, settlementId, profileId);
      if (raced) return { idempotent: true, application: rowView(raced) };
      throw error;
    }
    return { idempotent: false, application: rowView(await loadApplication(env, settlementId, profileId)) };
  }

  if (settlement.original_target_resolution !== 'APPLIES') {
    throw fail('Settlement original-target resolution is not applicable.', 409, 'NON_DAMAGE_STATUS_APPLICATION_SETTLEMENT_INVALID');
  }

  let application = existing;
  if (!application) {
    const id = `nd_status_app_${crypto.randomUUID()}`;
    const now = Date.now();
    try {
      await env.DB.prepare(`INSERT INTO non_damage_status_application_log (
        id, settlement_id, profile_id, application_key, target_character_id, source_character_id,
        status_definition_id, status_definition_version, primary_effect_field, primary_effect_key,
        primary_effect_base_value, primary_effect_multiplier, primary_effect_applied_value,
        settlement_outcome, application_status, runtime_status_effect_id, runtime_operation,
        meaningful_reason, actor_user_id, lease_token, lease_expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, NULL, ?, ?, NULL, NULL, ?, ?)`)
        .bind(id, settlement.id, profile.id, id, settlement.resistance_character_id, settlement.source_character_id,
          profile.status_definition_id, profile.status_definition_version, profile.primary_effect_field, profile.primary_effect_key,
          baseValue, multiplier, appliedValue, settlement.outcome, meaningfulReason, actorUserId || null, now, now).run();
    } catch (error) {
      const raced = await loadApplication(env, settlementId, profileId);
      if (!raced) throw error;
    }
    application = await loadApplication(env, settlementId, profileId);
  }

  if (application.application_status !== 'PENDING') return { idempotent: true, application: rowView(application) };
  const reconciled = await reconcileFromStatusAudit(env, application, actorUserId);
  if (reconciled) return { idempotent: true, application: reconciled };

  const now = Date.now();
  const leaseToken = crypto.randomUUID();
  const lease = await env.DB.prepare(`UPDATE non_damage_status_application_log SET
      lease_token=?, lease_expires_at=?, updated_at=?
    WHERE id=? AND application_status='PENDING' AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at<=?)`)
    .bind(leaseToken, now + 30000, now, application.id, now).run();
  if (changes(lease) !== 1) throw fail('Application is already being processed.', 409, 'NON_DAMAGE_STATUS_APPLICATION_IN_PROGRESS');

  const token = `[ND_STATUS_APP:${application.id}]`;
  let runtimeResult;
  try {
    runtimeResult = await applyPinnedStatusEffectToCharacter(env, settlement.resistance_character_id, {
      definitionId: profile.status_definition_id,
      expectedDefinitionVersion: Number(profile.status_definition_version),
      primaryEffectField: profile.primary_effect_field,
      primaryEffectKey: profile.primary_effect_key,
      primaryEffectValue: baseValue,
      primaryEffectMultiplier: multiplier,
      meaningfulReason: `${meaningfulReason} ${token}`,
      sourceType: 'CHARACTER',
      sourceId: settlement.source_character_id,
      sourceContext: {
        authority: 'non_damage_status_application_adapter',
        applicationId: application.id,
        settlementId,
        profileId
      }
    }, actorUserId);
  } catch (error) {
    await env.DB.prepare(`UPDATE non_damage_status_application_log SET lease_token=NULL, lease_expires_at=NULL, updated_at=?
      WHERE id=? AND application_status='PENDING' AND lease_token=?`).bind(Date.now(), application.id, leaseToken).run().catch(() => {});
    throw error;
  }

  const finalStatus = runtimeResult.operation === 'BLOCK' ? 'BLOCKED' : 'APPLIED';
  const finalize = await env.DB.prepare(`UPDATE non_damage_status_application_log SET
      application_status=?, runtime_status_effect_id=?, runtime_operation=?,
      actor_user_id=?, lease_token=NULL, lease_expires_at=NULL, updated_at=?
    WHERE id=? AND application_status='PENDING' AND lease_token=?`)
    .bind(finalStatus, runtimeResult.instance?.id || null, runtimeResult.operation || null,
      actorUserId || null, Date.now(), application.id, leaseToken).run();

  if (changes(finalize) !== 1) {
    const after = await loadApplication(env, settlementId, profileId);
    if (after?.application_status !== 'PENDING') return { idempotent: true, application: rowView(after) };
    const repaired = await reconcileFromStatusAudit(env, application, actorUserId);
    if (repaired) return { idempotent: true, application: repaired };
    throw fail('Application finalization conflicted with another write.', 409, 'NON_DAMAGE_STATUS_APPLICATION_FINALIZE_CONFLICT');
  }

  return { idempotent: false, application: rowView(await loadApplication(env, settlementId, profileId)) };
}
