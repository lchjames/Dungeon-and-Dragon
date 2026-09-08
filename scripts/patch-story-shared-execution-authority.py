from pathlib import Path


def replace_once(text, old, new, label):
    assert text.count(old) == 1, f'{label}: expected one replacement anchor, found {text.count(old)}'
    return text.replace(old, new, 1)


def remove_between(text, start, end, label):
    assert text.count(start) == 1, f'{label}: start anchor mismatch ({text.count(start)})'
    assert text.count(end) == 1, f'{label}: end anchor mismatch ({text.count(end)})'
    before, tail = text.split(start, 1)
    _removed, after = tail.split(end, 1)
    return before.rstrip() + '\n\n' + end + after


# Manual adapter: keep Definition/HTTP/runtime-state loading, remove its dead local executor.
path = Path('src/story-event-gateway.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { evaluateStoryConditions, normalizeStoryEventStructure } from './story-event-rules.js';",
    "import { normalizeStoryEventStructure } from './story-event-rules.js';",
    'manual rules import'
)
text = replace_once(
    text,
    "import {\n  activateRuntimeEncounter,\n  loadRuntimeEncounterMap,\n  loadRuntimeEncounterRows\n} from './runtime-encounter-state.js';",
    "import {\n  loadRuntimeEncounterMap,\n  loadRuntimeEncounterRows\n} from './runtime-encounter-state.js';",
    'manual encounter import'
)
text = replace_once(
    text,
    "import {\n  spawnRuntimeBoss,\n  spawnRuntimeMonster,\n  startRuntimeEncounterCombat\n} from './runtime-encounter-service.js';\n",
    '',
    'manual service import'
)
text = replace_once(
    text,
    "import {\n  applyRuntimeObjectStateEffect,\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    "import {\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    'manual object import'
)
text = remove_between(
    text,
    'function validateTargets(',
    'async function activateStoryEvent(',
    'manual duplicate executor block'
)
path.write_text(text, encoding='utf-8')


# scene_run_start adapter: retain trigger normalization/context loading only.
path = Path('src/scene-run-start-story.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { evaluateStoryConditions, normalizeStoryTrigger } from './story-event-rules.js';",
    "import { normalizeStoryTrigger } from './story-event-rules.js';",
    'scene start rules import'
)
text = replace_once(
    text,
    "import {\n  activateRuntimeEncounter,\n  loadRuntimeEncounterMap\n} from './runtime-encounter-state.js';",
    "import { loadRuntimeEncounterMap } from './runtime-encounter-state.js';",
    'scene start encounter import'
)
text = replace_once(
    text,
    "import {\n  spawnRuntimeBoss,\n  spawnRuntimeMonster,\n  startRuntimeEncounterCombat\n} from './runtime-encounter-service.js';\n",
    '',
    'scene start service import'
)
text = replace_once(
    text,
    "import {\n  applyRuntimeObjectStateEffect,\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    "import {\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    'scene start object import'
)
text = remove_between(text, 'function cleanError(', 'async function ensureSchema(', 'scene start cleanError')
text = remove_between(
    text,
    'function validateTargets(',
    'export async function processSceneRunStartStoryEvents(',
    'scene start duplicate executor block'
)
path.write_text(text, encoding='utf-8')


# enter_zone adapter: remove obsolete auto-executor schema and local effects.
path = Path('src/story-zone-trigger-gateway.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { evaluateStoryConditions, normalizeStoryTrigger } from './story-event-rules.js';",
    "import { normalizeStoryTrigger } from './story-event-rules.js';",
    'zone rules import'
)
text = replace_once(
    text,
    "import {\n  activateRuntimeEncounter,\n  loadRuntimeEncounterMap\n} from './runtime-encounter-state.js';",
    "import { loadRuntimeEncounterMap } from './runtime-encounter-state.js';",
    'zone encounter import'
)
text = replace_once(
    text,
    "import {\n  spawnRuntimeBoss,\n  spawnRuntimeMonster,\n  startRuntimeEncounterCombat\n} from './runtime-encounter-service.js';\n",
    '',
    'zone service import'
)
text = replace_once(
    text,
    "import {\n  applyRuntimeObjectStateEffect,\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    "import {\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    'zone object import'
)
text = replace_once(text, '\nlet autoStorySchemaPromise = null;\n', '\n', 'zone schema promise')
text = remove_between(text, 'function cleanError(', 'async function currentUser(', 'zone obsolete schema helpers')
text = remove_between(
    text,
    'function validateTargets(',
    'async function processEnterZoneTriggers(',
    'zone duplicate executor block'
)
path.write_text(text, encoding='utf-8')


# interact_object durable adapter: retain occurrence lease/dispatch and committed Object snapshot.
path = Path('src/runtime-object-story.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { evaluateStoryConditions, normalizeStoryTrigger } from './story-event-rules.js';",
    "import { normalizeStoryTrigger } from './story-event-rules.js';",
    'object rules import'
)
text = replace_once(
    text,
    "import {\n  activateRuntimeEncounter,\n  loadRuntimeEncounterMap\n} from './runtime-encounter-state.js';",
    "import { loadRuntimeEncounterMap } from './runtime-encounter-state.js';",
    'object encounter import'
)
text = replace_once(
    text,
    "import {\n  spawnRuntimeBoss,\n  spawnRuntimeMonster,\n  startRuntimeEncounterCombat\n} from './runtime-encounter-service.js';\n",
    '',
    'object service import'
)
text = replace_once(
    text,
    "import {\n  applyRuntimeObjectStateEffect,\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    "import {\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    'object state import'
)
text = remove_between(text, 'function validateTargets(', 'async function writeDispatch(', 'object duplicate effects')
text = remove_between(text, 'async function executeEvent(', 'async function claimNextOccurrence(', 'object duplicate executor')
path.write_text(text, encoding='utf-8')


# Generic durable lifecycle adapter: retain lifecycle schema, subject snapshots, leases and dispatch audit.
path = Path('src/runtime-story-lifecycle.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { evaluateStoryConditions, normalizeStoryTrigger } from './story-event-rules.js';",
    "import { normalizeStoryTrigger } from './story-event-rules.js';",
    'lifecycle rules import'
)
text = replace_once(
    text,
    "import {\n  activateRuntimeEncounter,\n  ensureRuntimeEncounterSchema,\n  loadRuntimeEncounterMap\n} from './runtime-encounter-state.js';",
    "import {\n  ensureRuntimeEncounterSchema,\n  loadRuntimeEncounterMap\n} from './runtime-encounter-state.js';",
    'lifecycle encounter import'
)
text = replace_once(
    text,
    "import {\n  spawnRuntimeBoss,\n  spawnRuntimeMonster,\n  startRuntimeEncounterCombat\n} from './runtime-encounter-service.js';\n",
    '',
    'lifecycle service import'
)
text = replace_once(
    text,
    "import {\n  applyRuntimeObjectStateEffect,\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    "import {\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';",
    'lifecycle object import'
)
text = remove_between(text, 'function validateTargets(', 'async function writeDispatch(', 'lifecycle duplicate effects')
text = remove_between(text, 'async function executeEvent(', 'async function claimNextOccurrence(', 'lifecycle duplicate executor')
path.write_text(text, encoding='utf-8')


# Fail closed if any active adapter still contains a local effect executor after cleanup.
for path in [
    Path('src/story-event-gateway.js'),
    Path('src/scene-run-start-story.js'),
    Path('src/story-zone-trigger-gateway.js'),
    Path('src/runtime-object-story.js'),
    Path('src/runtime-story-lifecycle.js'),
]:
    text = path.read_text(encoding='utf-8')
    assert 'async function applyEffect(' not in text, f'{path}: local applyEffect survived cleanup'
    assert 'async function applyDoorEffect(' not in text, f'{path}: local applyDoorEffect survived cleanup'
    assert 'function validateTargets(' not in text, f'{path}: local validateTargets survived cleanup'
    assert "from './runtime-encounter-service.js'" not in text, f'{path}: adapter still imports effect service directly'
