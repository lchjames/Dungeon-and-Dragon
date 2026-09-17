export const STATUS_EFFECT_CATEGORIES = Object.freeze([
  'DAMAGE_OVER_TIME',
  'ACTION_CONTROL',
  'MENTAL_CONTROL',
  'PERCEPTION_INTERFERENCE',
  'NUMERIC_MODIFIER',
  'RECOVERY_SUPPORT',
  'OTHER'
]);

export const STATUS_EFFECT_LAYERS = Object.freeze(['BODY', 'MIND', 'PERCEPTION', 'ENVIRONMENT']);
export const STATUS_EFFECT_ATTRIBUTES = Object.freeze(['PHYSICAL', 'LIGHT', 'DARK', 'FIRE', 'WATER', 'WIND', 'EARTH', 'LIGHTNING', 'WOOD', 'NONE']);
export const STATUS_EFFECT_DURATION_TYPES = Object.freeze(['ROUNDS', 'PERMANENT']);
export const STATUS_EFFECT_STACKING_RULES = Object.freeze([
  'NO_STACK',
  'REFRESH_DURATION',
  'EXTEND_DURATION',
  'ADD_STACKS',
  'KEEP_STRONGER',
  'TAKE_LATEST'
]);
export const STATUS_EFFECT_TRIGGER_TIMINGS = Object.freeze([
  'APPLY_IMMEDIATELY',
  'TARGET_TURN_START',
  'TARGET_TURN_END',
  'SOURCE_TURN_START',
  'AFTER_SUCCESSFUL_ATTACK',
  'AFTER_DAMAGE_TAKEN',
  'ON_ABILITY_TYPE'
]);
export const STATUS_EFFECT_DEFINITION_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);

const CATEGORY_SET = new Set(STATUS_EFFECT_CATEGORIES);
const LAYER_SET = new Set(STATUS_EFFECT_LAYERS);
const ATTRIBUTE_SET = new Set(STATUS_EFFECT_ATTRIBUTES);
const DURATION_SET = new Set(STATUS_EFFECT_DURATION_TYPES);
const STACK_SET = new Set(STATUS_EFFECT_STACKING_RULES);
const TRIGGER_SET = new Set(STATUS_EFFECT_TRIGGER_TIMINGS);
const STATUS_SET = new Set(STATUS_EFFECT_DEFINITION_STATUSES);

function plainObject(value, field) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError(`${field} must be an object.`);
  return value;
}

function normalizedText(value, max, field, required = false) {
  const output = String(value ?? '').trim().normalize('NFKC');
  if (required && !output) throw new RangeError(`${field} is required.`);
  if (output.length > max) throw new RangeError(`${field} is too long.`);
  return output;
}

function enumValue(value, allowed, field) {
  const output = String(value ?? '').trim().toUpperCase();
  if (!allowed.has(output)) throw new RangeError(`${field} is invalid.`);
  return output;
}

function uniqueEnumArray(value, allowed, field, { min = 0 } = {}) {
  if (!Array.isArray(value)) throw new RangeError(`${field} must be an array.`);
  const output = [];
  for (const entry of value) {
    const normalized = String(entry ?? '').trim().toUpperCase();
    if (!allowed.has(normalized)) throw new RangeError(`${field} contains an invalid value.`);
    if (!output.includes(normalized)) output.push(normalized);
  }
  if (output.length < min) throw new RangeError(`${field} requires at least ${min} value(s).`);
  return output;
}

function uniqueTextArray(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new RangeError(`${field} must be an array.`);
  const output = [];
  for (const entry of value) {
    const normalized = normalizedText(entry, 80, field, true);
    if (!output.includes(normalized)) output.push(normalized);
  }
  return output;
}

function optionalFinite(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RangeError(`${field} must be finite.`);
  return number;
}

export function normalizeStatusEffectDefinition(input = {}, { fallbackStackKey = '' } = {}) {
  const canonicalNameZh = normalizedText(input.canonicalNameZh ?? input.canonical_name_zh, 120, 'Status name', true);
  const category = enumValue(input.category, CATEGORY_SET, 'Category');
  const layers = uniqueEnumArray(input.layers, LAYER_SET, 'Layers', { min: 1 });
  const sourceAttributeRaw = input.sourceAttribute ?? input.source_attribute;
  const sourceAttribute = sourceAttributeRaw === undefined || sourceAttributeRaw === null || sourceAttributeRaw === ''
    ? null
    : enumValue(sourceAttributeRaw, ATTRIBUTE_SET, 'Source attribute');
  const durationType = enumValue(input.durationType ?? input.duration_type, DURATION_SET, 'Duration type');
  let defaultDurationRounds = input.defaultDurationRounds ?? input.default_duration_rounds;
  if (durationType === 'ROUNDS') {
    defaultDurationRounds = Number(defaultDurationRounds);
    if (!Number.isSafeInteger(defaultDurationRounds) || defaultDurationRounds < 1) {
      throw new RangeError('Round-based Status requires a positive integer default duration.');
    }
  } else {
    defaultDurationRounds = null;
  }

  const stackingRule = enumValue(input.stackingRule ?? input.stacking_rule, STACK_SET, 'Stacking rule');
  if (durationType === 'PERMANENT' && ['REFRESH_DURATION', 'EXTEND_DURATION'].includes(stackingRule)) {
    throw new RangeError('Permanent Status cannot use a time-refresh or time-extension stacking rule.');
  }

  const fallback = normalizedText(fallbackStackKey, 100, 'Fallback stack key');
  const stackKey = normalizedText(input.stackKey ?? input.stack_key ?? fallback, 100, 'Stack key', true);
  if (!/^[A-Za-z0-9:_-]+$/.test(stackKey)) throw new RangeError('Stack key may only contain A-Z, a-z, 0-9, colon, underscore and hyphen.');

  let maxStacks = input.maxStacks ?? input.max_stacks;
  if (stackingRule === 'ADD_STACKS') {
    maxStacks = Number(maxStacks);
    if (!Number.isSafeInteger(maxStacks) || maxStacks < 2) throw new RangeError('ADD_STACKS requires a maximum stack count of at least 2.');
  } else {
    maxStacks = null;
  }

  const strengthValue = optionalFinite(input.strengthValue ?? input.strength_value, 'Strength value');
  if (stackingRule === 'KEEP_STRONGER' && strengthValue === null) {
    throw new RangeError('KEEP_STRONGER requires a numeric strength value.');
  }

  return {
    canonicalNameZh,
    category,
    layers,
    sourceAttribute,
    durationType,
    defaultDurationRounds,
    effectProfile: plainObject(input.effectProfile ?? input.effect_profile, 'Effect profile'),
    triggerTimings: uniqueEnumArray(input.triggerTimings ?? input.trigger_timings ?? [], TRIGGER_SET, 'Trigger timings'),
    stackingRule,
    stackKey,
    maxStacks,
    strengthValue,
    dispelTags: uniqueTextArray(input.dispelTags ?? input.dispel_tags, 'Dispel tags'),
    immunityRules: Array.isArray(input.immunityRules ?? input.immunity_rules)
      ? [...(input.immunityRules ?? input.immunity_rules)]
      : [],
    status: enumValue(input.status ?? 'ACTIVE', STATUS_SET, 'Definition status'),
    descriptionZh: normalizedText(input.descriptionZh ?? input.description_zh, 4000, 'Description'),
    metadata: plainObject(input.metadata, 'Metadata'),
    changeReason: normalizedText(input.changeReason ?? input.reason, 1000, 'Change reason', true)
  };
}

export function planStatusEffectApplication(existing, definition) {
  if (!existing || String(existing.status || '').toUpperCase() !== 'ACTIVE') {
    return { operation: 'CREATE' };
  }
  const rule = enumValue(definition?.stackingRule ?? definition?.stacking_rule, STACK_SET, 'Stacking rule');
  const existingDuration = String(existing.durationType ?? existing.duration_type || '').toUpperCase();
  const incomingDuration = String(definition?.durationType ?? definition?.duration_type || '').toUpperCase();

  if (rule === 'NO_STACK') return { operation: 'BLOCK', reason: 'NO_STACK_ACTIVE' };
  if (rule === 'REFRESH_DURATION') {
    if (existingDuration !== 'ROUNDS' || incomingDuration !== 'ROUNDS') throw new RangeError('REFRESH_DURATION requires compatible round-based Status instances.');
    return { operation: 'REFRESH', remainingRounds: Number(definition.defaultDurationRounds ?? definition.default_duration_rounds) };
  }
  if (rule === 'EXTEND_DURATION') {
    if (existingDuration !== 'ROUNDS' || incomingDuration !== 'ROUNDS') throw new RangeError('EXTEND_DURATION requires compatible round-based Status instances.');
    return {
      operation: 'EXTEND',
      remainingRounds: Number(existing.remainingRounds ?? existing.remaining_rounds) + Number(definition.defaultDurationRounds ?? definition.default_duration_rounds)
    };
  }
  if (rule === 'ADD_STACKS') {
    if (existingDuration !== incomingDuration) throw new RangeError('ADD_STACKS requires compatible duration types within one stack group.');
    const current = Math.max(1, Number(existing.stackCount ?? existing.stack_count) || 1);
    const maximum = Number(definition.maxStacks ?? definition.max_stacks);
    if (current >= maximum) return { operation: 'BLOCK', reason: 'MAX_STACKS_REACHED' };
    return { operation: 'STACK', stackCount: current + 1 };
  }
  if (rule === 'KEEP_STRONGER') {
    const currentStrength = Number(existing.strengthValue ?? existing.strength_value);
    const incomingStrength = Number(definition.strengthValue ?? definition.strength_value);
    if (!Number.isFinite(currentStrength) || !Number.isFinite(incomingStrength)) throw new RangeError('KEEP_STRONGER requires finite strength values.');
    return incomingStrength > currentStrength
      ? { operation: 'REPLACE_STRONGER' }
      : { operation: 'BLOCK', reason: 'EXISTING_NOT_WEAKER' };
  }
  return { operation: 'REPLACE_LATEST' };
}

export function planStatusEffectRoundTick(instance) {
  if (!instance || String(instance.status || '').toUpperCase() !== 'ACTIVE') return { operation: 'NONE' };
  const durationType = String(instance.durationType ?? instance.duration_type || '').toUpperCase();
  if (durationType === 'PERMANENT') return { operation: 'NONE' };
  if (durationType !== 'ROUNDS') throw new RangeError('Runtime Status has an invalid duration type.');
  const remaining = Number(instance.remainingRounds ?? instance.remaining_rounds);
  if (!Number.isSafeInteger(remaining) || remaining < 1) throw new RangeError('Runtime round-based Status has invalid remaining rounds.');
  if (remaining === 1) return { operation: 'EXPIRE', remainingRounds: 0 };
  return { operation: 'TICK', remainingRounds: remaining - 1 };
}
