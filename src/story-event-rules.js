const TRIGGER_TYPES = new Set([
  'manual',
  'scene_run_start',
  'enter_zone',
  'interact_object',
  'encounter_activated',
  'encounter_resolved',
  'combat_started',
  'combat_ended',
  'flag_changed'
]);

const CONDITION_TYPES = new Set([
  'event_not_fired',
  'flag_equals',
  'flag_not_equals',
  'scene_run_status',
  'door_state'
]);

const EFFECT_TYPES = new Set([
  'show_narrative',
  'set_flag',
  'reveal_zone',
  'open_door',
  'close_door'
]);

const DOOR_STATES = new Set(['open', 'closed', 'locked', 'broken']);
const SCENE_RUN_STATUSES = new Set(['active', 'completed', 'aborted']);
const FLAG_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;

function text(value, label, max = 4000) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(`${label} is required.`);
  if (output.length > max) throw new Error(`${label} is too long.`);
  return output;
}

function scalar(value, label = 'value') {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must be a finite JSON scalar.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 1000) throw new Error(`${label} string is too long.`);
    return value;
  }
  throw new Error(`${label} must be a JSON scalar.`);
}

export function normalizeStoryFlagKey(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!FLAG_KEY.test(key)) throw new Error('Story flag key is invalid.');
  return key;
}

export function normalizeStoryTriggerType(value = 'manual') {
  const type = String(value || 'manual').trim().toLowerCase();
  if (!TRIGGER_TYPES.has(type)) throw new Error('Story Event trigger type is not approved.');
  return type;
}

export function normalizeStoryCondition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Story Event condition must be an object.');
  const type = String(raw.type || '').trim().toLowerCase();
  if (!CONDITION_TYPES.has(type)) throw new Error(`Story Event condition type is not approved: ${type || 'missing'}.`);

  if (type === 'event_not_fired') return { type };
  if (type === 'flag_equals' || type === 'flag_not_equals') {
    return { type, key: normalizeStoryFlagKey(raw.key), value: scalar(raw.value, 'Story flag comparison value') };
  }
  if (type === 'scene_run_status') {
    const status = String(raw.status || '').trim().toLowerCase();
    if (!SCENE_RUN_STATUSES.has(status)) throw new Error('Scene Run status condition is invalid.');
    return { type, status };
  }
  if (type === 'door_state') {
    const edgeId = text(raw.edgeId, 'Door edgeId', 160);
    const state = String(raw.state || '').trim().toLowerCase();
    if (!DOOR_STATES.has(state)) throw new Error('Door state condition is invalid.');
    return { type, edgeId, state };
  }
  throw new Error('Unsupported Story Event condition.');
}

export function normalizeStoryEffect(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Story Event effect must be an object.');
  const type = String(raw.type || '').trim().toLowerCase();
  if (!EFFECT_TYPES.has(type)) throw new Error(`Story Event effect type is not approved: ${type || 'missing'}.`);

  if (type === 'show_narrative') {
    return { type, text: text(raw.text, 'Narrative text', 4000) };
  }
  if (type === 'set_flag') {
    return { type, key: normalizeStoryFlagKey(raw.key), value: scalar(raw.value, 'Story flag value') };
  }
  if (type === 'reveal_zone') {
    return { type, zoneId: text(raw.zoneId, 'Runtime Zone ID', 160) };
  }
  if (type === 'open_door' || type === 'close_door') {
    return { type, edgeId: text(raw.edgeId, 'Runtime Door edgeId', 160) };
  }
  throw new Error('Unsupported Story Event effect.');
}

export function normalizeStoryEventStructure({ triggerType = 'manual', trigger = {}, conditions = [], effects = [] } = {}) {
  const normalizedTriggerType = normalizeStoryTriggerType(triggerType);
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) throw new Error('Story Event trigger payload must be an object.');
  if (!Array.isArray(conditions) || conditions.length > 20) throw new Error('Story Event conditions must be an array of at most 20 items.');
  if (!Array.isArray(effects) || effects.length < 1 || effects.length > 20) throw new Error('Story Event effects must contain 1 to 20 approved effects.');
  return {
    triggerType: normalizedTriggerType,
    trigger: { ...trigger },
    conditions: conditions.map(normalizeStoryCondition),
    effects: effects.map(normalizeStoryEffect)
  };
}

function sameScalar(a, b) {
  return Object.is(a, b);
}

export function evaluateStoryConditions(conditions, context = {}) {
  const flags = context.flags instanceof Map ? context.flags : new Map(Object.entries(context.flags || {}));
  const doors = context.doors instanceof Map ? context.doors : new Map(Object.entries(context.doors || {}));
  const failures = [];

  for (const condition of conditions || []) {
    if (condition.type === 'event_not_fired') {
      if (context.eventAlreadyFired) failures.push({ type: condition.type, reason: 'event_already_fired' });
      continue;
    }
    if (condition.type === 'flag_equals') {
      if (!sameScalar(flags.get(condition.key), condition.value)) failures.push({ type: condition.type, key: condition.key, reason: 'flag_mismatch' });
      continue;
    }
    if (condition.type === 'flag_not_equals') {
      if (sameScalar(flags.get(condition.key), condition.value)) failures.push({ type: condition.type, key: condition.key, reason: 'flag_equal' });
      continue;
    }
    if (condition.type === 'scene_run_status') {
      if (String(context.sceneRunStatus || '') !== condition.status) failures.push({ type: condition.type, reason: 'scene_run_status_mismatch' });
      continue;
    }
    if (condition.type === 'door_state') {
      if (String(doors.get(condition.edgeId) || '') !== condition.state) failures.push({ type: condition.type, edgeId: condition.edgeId, reason: 'door_state_mismatch' });
      continue;
    }
    failures.push({ type: condition.type || 'unknown', reason: 'unsupported_condition' });
  }

  return { ok: failures.length === 0, failures };
}

export const STORY_EVENT_TRIGGER_TYPES = Object.freeze([...TRIGGER_TYPES]);
export const STORY_EVENT_CONDITION_TYPES = Object.freeze([...CONDITION_TYPES]);
export const STORY_EVENT_EFFECT_TYPES = Object.freeze([...EFFECT_TYPES]);
