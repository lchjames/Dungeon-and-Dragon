import { normalizeStoryEventStructure } from './story-event-rules.js';

const MAX_SCRIPT_LENGTH = 24000;
const MAX_LINES = 120;

function scriptError(message, lineNumber, code = 'STORY_SCRIPT_INVALID') {
  const error = new Error(lineNumber ? `Line ${lineNumber}: ${message}` : message);
  error.code = code;
  error.line = lineNumber || null;
  return error;
}

function required(value, label, lineNumber, max = 4000) {
  const output = String(value ?? '').trim();
  if (!output) throw scriptError(`${label} is required.`, lineNumber);
  if (output.length > max) throw scriptError(`${label} is too long.`, lineNumber);
  return output;
}

function jsonValue(raw, label, lineNumber) {
  const text = required(raw, label, lineNumber, 2000);
  let value;
  try { value = JSON.parse(text); } catch {
    throw scriptError(`${label} must be a JSON scalar, for example true, 3, null or "text".`, lineNumber);
  }
  if (value !== null && typeof value === 'object') {
    throw scriptError(`${label} must be a JSON scalar.`, lineNumber);
  }
  return value;
}

function jsonObject(raw, label, lineNumber) {
  const text = required(raw, label, lineNumber, 6000);
  let value;
  try { value = JSON.parse(text); } catch {
    throw scriptError(`${label} must be valid JSON.`, lineNumber);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw scriptError(`${label} must be a JSON object.`, lineNumber);
  }
  return value;
}

function splitHead(raw) {
  const match = String(raw || '').trim().match(/^(\S+)(?:\s+(.*))?$/);
  return match ? [match[1], match[2] || ''] : ['', ''];
}

function splitTwo(raw, lineNumber, label) {
  const match = String(raw || '').trim().match(/^(\S+)\s+(.+)$/);
  if (!match) throw scriptError(`${label} requires two arguments.`, lineNumber);
  return [match[1], match[2].trim()];
}

function triggerFrom(raw, lineNumber) {
  const [commandRaw, rest] = splitHead(raw);
  const command = commandRaw.toUpperCase();
  if (command === 'MANUAL') return { triggerType: 'manual', trigger: {} };
  if (command === 'SCENE_START' || command === 'SCENE_RUN_START') return { triggerType: 'scene_run_start', trigger: {} };
  if (command === 'ENTER_ZONE') return { triggerType: 'enter_zone', trigger: { sourceZoneId: required(rest, 'sourceZoneId', lineNumber, 160) } };
  if (command === 'INTERACT_OBJECT') return { triggerType: 'interact_object', trigger: { sourceObjectId: required(rest, 'sourceObjectId', lineNumber, 180) } };
  if (command === 'FLAG_CHANGED') return { triggerType: 'flag_changed', trigger: { key: required(rest, 'flag key', lineNumber, 80) } };
  const encounterTriggers = {
    ENCOUNTER_ACTIVATED: 'encounter_activated',
    ENCOUNTER_RESOLVED: 'encounter_resolved',
    COMBAT_STARTED: 'combat_started',
    COMBAT_ENDED: 'combat_ended'
  };
  if (encounterTriggers[command]) {
    return { triggerType: encounterTriggers[command], trigger: { encounterId: required(rest, 'encounterId', lineNumber, 180) } };
  }
  throw scriptError(`Unknown TRIGGER command: ${commandRaw || 'missing'}.`, lineNumber);
}

function conditionFrom(raw, lineNumber) {
  const [commandRaw, rest] = splitHead(raw);
  const command = commandRaw.toUpperCase();
  if (command === 'NOT_FIRED') return { type: 'event_not_fired' };
  if (command === 'SCENE_STATUS') return { type: 'scene_run_status', status: required(rest, 'Scene Run status', lineNumber, 40) };
  if (command === 'FLAG_EQ' || command === 'FLAG_NE') {
    const [key, valueRaw] = splitTwo(rest, lineNumber, command);
    return { type: command === 'FLAG_EQ' ? 'flag_equals' : 'flag_not_equals', key, value: jsonValue(valueRaw, 'flag comparison value', lineNumber) };
  }
  if (command === 'DOOR') {
    const [sourceEdgeId, state] = splitTwo(rest, lineNumber, 'DOOR');
    return { type: 'door_state', sourceEdgeId, state };
  }
  if (command === 'OBJECT') {
    const [sourceObjectId, stateKey] = splitTwo(rest, lineNumber, 'OBJECT');
    return { type: 'object_state', sourceObjectId, stateKey };
  }
  if (command === 'ENCOUNTER') {
    const [encounterId, status] = splitTwo(rest, lineNumber, 'ENCOUNTER');
    return { type: 'encounter_status', encounterId, status };
  }
  throw scriptError(`Unknown WHEN command: ${commandRaw || 'missing'}.`, lineNumber);
}

function effectFrom(raw, lineNumber) {
  const [commandRaw, rest] = splitHead(raw);
  const command = commandRaw.toUpperCase();
  if (command === 'SAY') return { type: 'show_narrative', text: required(rest, 'Narrative text', lineNumber, 4000) };
  if (command === 'SET_FLAG') {
    const [key, valueRaw] = splitTwo(rest, lineNumber, 'SET_FLAG');
    return { type: 'set_flag', key, value: jsonValue(valueRaw, 'flag value', lineNumber) };
  }
  if (command === 'SET_OBJECT') {
    const [sourceObjectId, stateKey] = splitTwo(rest, lineNumber, 'SET_OBJECT');
    return { type: 'set_object_state', sourceObjectId, stateKey };
  }
  if (command === 'REVEAL_ZONE') return { type: 'reveal_zone', sourceZoneId: required(rest, 'sourceZoneId', lineNumber, 160) };
  if (command === 'OPEN_DOOR') return { type: 'open_door', sourceEdgeId: required(rest, 'sourceEdgeId', lineNumber, 160) };
  if (command === 'CLOSE_DOOR') return { type: 'close_door', sourceEdgeId: required(rest, 'sourceEdgeId', lineNumber, 160) };
  if (command === 'ACTIVATE_ENCOUNTER') return { type: 'activate_encounter', encounterId: required(rest, 'encounterId', lineNumber, 180) };
  if (command === 'START_COMBAT') return { type: 'start_combat', encounterId: required(rest, 'encounterId', lineNumber, 180) };
  throw scriptError(`Unknown DO command: ${commandRaw || 'missing'}.`, lineNumber);
}

export function compileStoryScript(source) {
  const script = String(source ?? '').replace(/\r\n?/g, '\n');
  if (!script.trim()) throw scriptError('Story script is empty.', null, 'STORY_SCRIPT_EMPTY');
  if (script.length > MAX_SCRIPT_LENGTH) throw scriptError('Story script is too large.', null, 'STORY_SCRIPT_TOO_LARGE');
  const lines = script.split('\n');
  if (lines.length > MAX_LINES) throw scriptError('Story script has too many lines.', null, 'STORY_SCRIPT_TOO_LARGE');

  let name = '';
  let status = 'active';
  let oncePerSceneRun = true;
  let triggerType = '';
  let trigger = {};
  const conditions = [];
  const effects = [];

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const [directiveRaw, rest] = splitHead(line);
    const directive = directiveRaw.toUpperCase();

    if (directive === 'NAME') {
      name = required(rest, 'NAME', lineNumber, 120);
      return;
    }
    if (directive === 'STATUS') {
      status = required(rest, 'STATUS', lineNumber, 20).toLowerCase();
      if (!['active', 'archived'].includes(status)) throw scriptError('STATUS must be active or archived.', lineNumber);
      return;
    }
    if (directive === 'ONCE') {
      const value = required(rest, 'ONCE', lineNumber, 10).toLowerCase();
      if (!['yes', 'no', 'true', 'false'].includes(value)) throw scriptError('ONCE must be yes/no or true/false.', lineNumber);
      oncePerSceneRun = value === 'yes' || value === 'true';
      return;
    }
    if (directive === 'TRIGGER') {
      if (triggerType) throw scriptError('Only one TRIGGER line is allowed.', lineNumber);
      ({ triggerType, trigger } = triggerFrom(rest, lineNumber));
      return;
    }
    if (directive === 'WHEN') {
      conditions.push(conditionFrom(rest, lineNumber));
      return;
    }
    if (directive === 'CONDITION') {
      conditions.push(jsonObject(rest, 'CONDITION', lineNumber));
      return;
    }
    if (directive === 'DO') {
      effects.push(effectFrom(rest, lineNumber));
      return;
    }
    if (directive === 'EFFECT') {
      effects.push(jsonObject(rest, 'EFFECT', lineNumber));
      return;
    }
    throw scriptError(`Unknown directive: ${directiveRaw}.`, lineNumber);
  });

  if (!name) throw scriptError('NAME is required.', null, 'STORY_SCRIPT_NAME_REQUIRED');
  if (!triggerType) throw scriptError('TRIGGER is required.', null, 'STORY_SCRIPT_TRIGGER_REQUIRED');

  let structure;
  try {
    structure = normalizeStoryEventStructure({ triggerType, trigger, conditions, effects });
  } catch (error) {
    throw scriptError(error?.message || 'Compiled Story Event is invalid.', null, 'STORY_SCRIPT_STRUCTURE_INVALID');
  }

  return {
    name,
    status,
    oncePerSceneRun,
    ...structure
  };
}

export const STORY_SCRIPT_LIMITS = Object.freeze({
  maxScriptLength: MAX_SCRIPT_LENGTH,
  maxLines: MAX_LINES
});
