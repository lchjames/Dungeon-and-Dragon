export const NON_DAMAGE_STATUS_PRIMARY_FIELDS = Object.freeze([
  'DURATION_ROUNDS',
  'STRENGTH_VALUE',
  'EFFECT_PROFILE_NUMERIC'
]);

export const NON_DAMAGE_STATUS_PROFILE_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);

function text(value, max, field, required = false) {
  const output = String(value ?? '').trim().normalize('NFKC');
  if (required && !output) throw new RangeError(`${field} is required.`);
  if (output.length > max) throw new RangeError(`${field} is too long.`);
  return output;
}

function plainObject(value, field) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError(`${field} must be an object.`);
  return value;
}

export function normalizeNonDamageStatusProfile(input = {}) {
  const primaryEffectField = String(input.primaryEffectField ?? input.primary_effect_field ?? '').trim().toUpperCase();
  if (!NON_DAMAGE_STATUS_PRIMARY_FIELDS.includes(primaryEffectField)) {
    throw new RangeError('Primary effect field is invalid.');
  }
  const primaryEffectKey = primaryEffectField === 'EFFECT_PROFILE_NUMERIC'
    ? text(input.primaryEffectKey ?? input.primary_effect_key, 80, 'Primary effect key', true)
    : null;
  if (primaryEffectKey && !/^[A-Za-z][A-Za-z0-9_]*$/.test(primaryEffectKey)) {
    throw new RangeError('Primary effect key must be a simple top-level JSON key.');
  }

  const status = String(input.status ?? 'ACTIVE').trim().toUpperCase();
  if (!NON_DAMAGE_STATUS_PROFILE_STATUSES.includes(status)) throw new RangeError('Profile status is invalid.');

  return {
    name: text(input.name, 120, 'Profile name', true),
    statusDefinitionId: text(input.statusDefinitionId ?? input.status_definition_id, 200, 'Status Definition ID', true),
    targetMode: 'ORIGINAL_TARGET',
    primaryEffectField,
    primaryEffectKey,
    resistanceType: 'OPPOSED_D100',
    greatSuccessRule: 'DOUBLE_PRIMARY_EFFECT',
    greatFailureRule: 'TARGET_DEVIATION',
    status,
    metadata: plainObject(input.metadata, 'Metadata'),
    changeReason: text(input.changeReason ?? input.reason, 1000, 'Change reason', true)
  };
}

export function inspectPrimaryEffect(definition, profile) {
  const field = profile.primaryEffectField;
  if (field === 'DURATION_ROUNDS') {
    if (String(definition.durationType || '').toUpperCase() !== 'ROUNDS') {
      throw new RangeError('DURATION_ROUNDS requires a round-based Status Definition.');
    }
    const value = Number(definition.defaultDurationRounds);
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Status duration is not a valid positive integer.');
    return { field, key: null, value };
  }
  if (field === 'STRENGTH_VALUE') {
    const value = Number(definition.strengthValue);
    if (!Number.isFinite(value)) throw new RangeError('STRENGTH_VALUE requires a finite Status strength value.');
    return { field, key: null, value };
  }
  const key = profile.primaryEffectKey;
  const effectProfile = definition.effectProfile && typeof definition.effectProfile === 'object' && !Array.isArray(definition.effectProfile)
    ? definition.effectProfile : {};
  const value = Number(effectProfile[key]);
  if (!Number.isFinite(value)) throw new RangeError(`Status effect profile key "${key}" must contain a finite numeric value.`);
  return { field, key, value };
}

export function resolveProfileReadiness(profile, definition) {
  if (!profile || !definition) return { ready: false, reason: 'MISSING_DEFINITION' };
  if (profile.status !== 'ACTIVE') return { ready: false, reason: 'PROFILE_INACTIVE' };
  if (definition.status !== 'ACTIVE') return { ready: false, reason: 'STATUS_DEFINITION_INACTIVE' };
  if (Number(profile.statusDefinitionVersion) !== Number(definition.version)) return { ready: false, reason: 'STATUS_DEFINITION_VERSION_STALE' };
  return { ready: true, reason: null };
}
