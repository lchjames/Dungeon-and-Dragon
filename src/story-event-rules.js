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
  'door_state',
  'encounter_status'
]);

const EFFECT_TYPES = new Set([
  'show_narrative',
  'set_flag',
  'reveal_zone',
  'open_door',
  'close_door',
  'activate_encounter',
  'spawn_monster',
  'start_combat'
]);

const DOOR_STATES = new Set(['open', 'closed', 'locked', 'broken']);
const SCENE_RUN_STATUSES = new Set(['active', 'completed', 'aborted']);
const ENCOUNTER_STATUSES = new Set(['planned', 'active', 'resolved', 'skipped']);
const FLAG_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;

function text(value, label, max = 4000) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(`${label} is required.`);
  if (output.length > max) throw new Error(`${label} is too long.`);
  return output;
}

function optionalText(value, label, max = 4000) {
  const output = String(value ?? '').trim();
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

export function normalizeStoryTrigger(type, raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Story Event trigger payload must be an object.');
  if (type === 'enter_zone') {
    return { sourceZoneId: text(raw.sourceZoneId, 'Map Template Zone sourceZoneId', 160) };
  }
  return { ...raw };
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
    const sourceEdgeId = text(raw.sourceEdgeId, 'Map Template Door sourceEdgeId', 160);
    const state = String(raw.state || '').trim().toLowerCase();
    if (!DOOR_STATES.has(state)) throw new Error('Door state condition is invalid.');
    return { type, sourceEdgeId, state };
  }
  if (type === 'encounter_status') {
    const encounterId = text(raw.encounterId, 'Encounter ID', 180);
    const status = String(raw.status || '').trim().toLowerCase();
    if (!ENCOUNTER_STATUSES.has(status)) throw new Error('Runtime Encounter status condition is invalid.');
    return { type, encounterId, status };
  }
  throw new Error('Unsupported Story Event condition.');
}

export function normalizeStoryEffect(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Story Event effect must be an object.');
  const type = String(raw.type || '').trim().toLowerCase();
  if (!EFFECT_TYPES.has(type)) throw new Error(`Story Event effect type is not approved: ${type || 'missing'}.`);

  if (type === 'show_narrative') return { type, text: text(raw.text, 'Narrative text', 4000) };
  if (type === 'set_flag') return { type, key: normalizeStoryFlagKey(raw.key), value: scalar(raw.value, 'Story flag value') };
  if (type === 'reveal_zone') return { type, sourceZoneId: text(raw.sourceZoneId, 'Map Template Zone sourceZoneId', 160) };
  if (type === 'open_door' || type === 'close_door') return { type, sourceEdgeId: text(raw.sourceEdgeId, 'Map Template Door sourceEdgeId', 160) };
  if (type === 'activate_encounter') return { type, encounterId: text(raw.encounterId, 'Encounter ID', 180) };
  if (type === 'spawn_monster') {
    const level = Number(raw.level);
    if (!Number.isInteger(level) || level < 1 || level > 100) throw new Error('Story Monster Level must be an integer from 1 to 100.');
    const displayName = optionalText(raw.displayName, 'Monster displayName', 120);
    return {
      type,
      encounterId: text(raw.encounterId, 'Encounter ID', 180),
      templateId: text(raw.templateId, 'Monster Template ID', 180),
      level,
      sourceSpawnPointId: text(raw.sourceSpawnPointId, 'Map Template Spawn Point sourceSpawnPointId', 180),
      ...(displayName ? { displayName } : {})
    };
  }
  if (type === 'start_combat') return { type, encounterId: text(raw.encounterId, 'Encounter ID', 180) };
  throw new Error('Unsupported Story Event effect.');
}

export function normalizeStoryEventStructure({ triggerType = 'manual', trigger = {}, conditions = [], effects = [] } = {}) {
  const normalizedTriggerType = normalizeStoryTriggerType(triggerType);
  if (!Array.isArray(conditions) || conditions.length > 20) throw new Error('Story Event conditions must be an array of at most 20 items.');
  if (!Array.isArray(effects) || effects.length < 1 || effects.length > 20) throw new Error('Story Event effects must contain 1 to 20 approved effects.');
  return {
    triggerType: normalizedTriggerType,
    trigger: normalizeStoryTrigger(normalizedTriggerType, trigger),
    conditions: conditions.map(normalizeStoryCondition),
    effects: effects.map(normalizeStoryEffect)
  };
}

function sameScalar(a, b) { return Object.is(a, b); }

export function evaluateStoryConditions(conditions, context = {}) {
  const flags = context.flags instanceof Map ? context.flags : new Map(Object.entries(context.flags || {}));
  const doors = context.doors instanceof Map ? context.doors : new Map(Object.entries(context.doors || {}));
  const encounters = context.encounters instanceof Map ? context.encounters : new Map(Object.entries(context.encounters || {}));
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
      if (String(doors.get(condition.sourceEdgeId) || '') !== condition.state) failures.push({ type: condition.type, sourceEdgeId: condition.sourceEdgeId, reason: 'door_state_mismatch' });
      continue;
    }
    if (condition.type === 'encounter_status') {
      const value = encounters.get(condition.encounterId);
      const status = typeof value === 'string' ? value : value?.status;
      const sameEventActivationRetry = (
        condition.status === 'planned'
        && String(status || '') === 'active'
        && Boolean(context.storyEventId)
        && value?.activatedByStoryEventId === context.storyEventId
      );
      if (String(status || '') !== condition.status && !sameEventActivationRetry) {
        failures.push({ type: condition.type, encounterId: condition.encounterId, reason: 'encounter_status_mismatch' });
      }
      continue;
    }
    failures.push({ type: condition.type || 'unknown', reason: 'unsupported_condition' });
  }
  return { ok: failures.length === 0, failures };
}

export const STORY_EVENT_TRIGGER_TYPES = Object.freeze([...TRIGGER_TYPES]);
export const STORY_EVENT_CONDITION_TYPES = Object.freeze([...CONDITION_TYPES]);
export const STORY_EVENT_EFFECT_TYPES = Object.freeze([...EFFECT_TYPES]);
