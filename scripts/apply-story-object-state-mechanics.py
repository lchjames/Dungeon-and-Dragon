from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return content.replace(old, new, 1)


def regex_once(content, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one regex match, found {count}')
    return updated


def patch_rules():
    path = 'src/story-event-rules.js'
    c = read(path)
    c = replace_once(c,
        "  'door_state',\n  'encounter_status'\n]);",
        "  'door_state',\n  'object_state',\n  'encounter_status'\n]);",
        'rules condition vocabulary')
    c = replace_once(c,
        "  'show_narrative',\n  'set_flag',\n  'reveal_zone',",
        "  'show_narrative',\n  'set_flag',\n  'set_object_state',\n  'reveal_zone',",
        'rules effect vocabulary')
    c = replace_once(c,
        "const FLAG_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;",
        "const FLAG_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;\nconst OBJECT_STATE_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;",
        'object state key regex')
    c = replace_once(c,
        "export function normalizeStoryTriggerType(value = 'manual') {",
        "export function normalizeStoryObjectStateKey(value) {\n  const key = String(value ?? '').trim().toLowerCase();\n  if (!OBJECT_STATE_KEY.test(key)) throw new Error('Story Object stateKey is invalid.');\n  return key;\n}\n\nexport function normalizeStoryTriggerType(value = 'manual') {",
        'object state key normalizer')
    c = replace_once(c,
        "  if (type === 'encounter_status') {",
        "  if (type === 'object_state') {\n    return {\n      type,\n      sourceObjectId: text(raw.sourceObjectId, 'Map Template Object sourceObjectId', 180),\n      stateKey: normalizeStoryObjectStateKey(raw.stateKey)\n    };\n  }\n  if (type === 'encounter_status') {",
        'object state condition normalizer')
    c = replace_once(c,
        "  if (type === 'set_flag') return { type, key: normalizeStoryFlagKey(raw.key), value: scalar(raw.value, 'Story flag value') };\n  if (type === 'reveal_zone')",
        "  if (type === 'set_flag') return { type, key: normalizeStoryFlagKey(raw.key), value: scalar(raw.value, 'Story flag value') };\n  if (type === 'set_object_state') return {\n    type,\n    sourceObjectId: text(raw.sourceObjectId, 'Map Template Object sourceObjectId', 180),\n    stateKey: normalizeStoryObjectStateKey(raw.stateKey)\n  };\n  if (type === 'reveal_zone')",
        'object state effect normalizer')
    c = replace_once(c,
        "  const doors = context.doors instanceof Map ? context.doors : new Map(Object.entries(context.doors || {}));\n  const encounters =",
        "  const doors = context.doors instanceof Map ? context.doors : new Map(Object.entries(context.doors || {}));\n  const objects = context.objects instanceof Map ? context.objects : new Map(Object.entries(context.objects || {}));\n  const encounters =",
        'object condition context')
    c = replace_once(c,
        "    if (condition.type === 'encounter_status') {",
        "    if (condition.type === 'object_state') {\n      if (String(objects.get(condition.sourceObjectId) || '') !== condition.stateKey) {\n        failures.push({\n          type: condition.type,\n          sourceObjectId: condition.sourceObjectId,\n          reason: 'object_state_mismatch'\n        });\n      }\n      continue;\n    }\n    if (condition.type === 'encounter_status') {",
        'object condition evaluator')
    write(path, c)


IMPORT = "import {\n  applyRuntimeObjectStateEffect,\n  loadRuntimeObjectTargets,\n  runtimeObjectStateMap\n} from './runtime-object-state.js';\n"


def insert_import(c, label):
    marker = "} from './runtime-encounter-service.js';\n"
    return replace_once(c, marker, marker + IMPORT, f'{label} object-state import')


def insert_target_validation(c, label):
    pattern = r"(    if \(condition\.type === 'door_state'.*?\n    \}\n)(  \}\n  for \(const effect of event\.effects \|\| \[\]\) \{)"
    addition = (
        "    if (condition.type === 'object_state' && !targets.objectBySource?.has(condition.sourceObjectId)) {\n"
        "      throw Object.assign(new Error(`Runtime Object target not found: ${condition.sourceObjectId}`), {\n"
        "        code: 'STORY_CONDITION_OBJECT_NOT_FOUND'\n"
        "      });\n"
        "    }\n"
    )
    c = regex_once(c, pattern, r"\1" + addition + r"\2", f'{label} condition target validation', re.S)
    pattern2 = r"(    if \(\(effect\.type === 'open_door' \|\| effect\.type === 'close_door'\).*?\n    \}\n)(  \}\n\})"
    addition2 = (
        "    if (effect.type === 'set_object_state' && !targets.objectBySource?.has(effect.sourceObjectId)) {\n"
        "      throw Object.assign(new Error(`Runtime Object target not found: ${effect.sourceObjectId}`), {\n"
        "        code: 'STORY_EFFECT_OBJECT_NOT_FOUND'\n"
        "      });\n"
        "    }\n"
    )
    c = regex_once(c, pattern2, r"\1" + addition2 + r"\2", f'{label} effect target validation', re.S)
    return c


def insert_effect(c, label, actor_expr):
    pattern = r"(  if \(effect\.type === 'set_flag'\) \{.*?return \{ type: effect\.type, key: effect\.key, value: effect\.value \};\n  \}\n)"
    addition = f"""  if (effect.type === 'set_object_state') {{
    const target = context.targets.objectBySource.get(effect.sourceObjectId);
    return {{
      type: effect.type,
      ...(await applyRuntimeObjectStateEffect(env, {{
        sceneRunId: context.sceneRunId,
        mapInstanceId: context.mapInstanceId,
        target,
        sourceObjectId: effect.sourceObjectId,
        nextStateKey: effect.stateKey,
        actorUserId: {actor_expr},
        storyEventId: context.event.id,
        storyEffectIndex: effectIndex,
        objectStates: context.objects
      }}))
    }};
  }}
"""
    return regex_once(c, pattern, r"\1" + addition, f'{label} set_object_state executor', re.S)


def patch_common_executor(path, label, map_expr, snapshot_override=False):
    c = read(path)
    c = insert_import(c, label)
    c = insert_target_validation(c, label)
    c = insert_effect(c, label, 'context.actor.id')
    marker = "  const shared = {\n"
    c = replace_once(c, marker,
        f"  targets.objectBySource = await loadRuntimeObjectTargets(env, {map_expr});\n\n" + marker,
        f'{label} load object targets')
    c = replace_once(c,
        "    doors: doorStates(targets),\n    encounters",
        "    doors: doorStates(targets),\n    objects: runtimeObjectStateMap(targets.objectBySource),\n    encounters",
        f'{label} shared object states')
    c = replace_once(c,
        "    sceneRunStatus: shared.sceneRunStatus,\n    doors: shared.doors,\n    encounters: shared.encounters",
        "    sceneRunStatus: shared.sceneRunStatus,\n    doors: shared.doors,\n    objects: shared.objects,\n    encounters: shared.encounters",
        f'{label} evaluate object states')
    if snapshot_override:
        c = replace_once(c,
            "    lifecycleObjectStateAfter: interaction.to_state_key\n  };",
            "    lifecycleObjectStateAfter: interaction.to_state_key\n  };\n  // The condition for the triggering Object observes this committed interaction,\n  // even if a later mutation occurred before the durable occurrence was drained.\n  shared.objects.set(interaction.source_object_id, interaction.to_state_key);",
            f'{label} interaction state snapshot')
    write(path, c)


def patch_manual_gateway():
    path = 'src/story-event-gateway.js'
    c = read(path)
    c = insert_import(c, 'manual Story gateway')
    c = replace_once(c,
        "function validateTargets(event, detail, encounters) {\n  const targets = runtimeTargets(detail);",
        "function validateTargets(event, detail, encounters, objectBySource) {\n  const targets = runtimeTargets(detail);\n  targets.objectBySource = objectBySource;",
        'manual target map signature')
    c = insert_target_validation(c, 'manual Story gateway')
    c = insert_effect(c, 'manual Story gateway', 'context.gm.id')
    c = replace_once(c,
        "  let targets;\n  try {\n    targets = validateTargets(event, detail, encounters);",
        "  const objectBySource = await loadRuntimeObjectTargets(env, mapInstanceId);\n  let targets;\n  try {\n    targets = validateTargets(event, detail, encounters, objectBySource);",
        'manual load object targets')
    c = replace_once(c,
        "  const flags = await loadFlags(env, sceneRun.id);\n  const conditions = evaluateStoryConditions(event.conditions, {",
        "  const flags = await loadFlags(env, sceneRun.id);\n  const objects = runtimeObjectStateMap(objectBySource);\n  const conditions = evaluateStoryConditions(event.conditions, {",
        'manual object state map')
    c = replace_once(c,
        "    sceneRunStatus: sceneRun.status,\n    doors: doorStates(detail),\n    encounters",
        "    sceneRunStatus: sceneRun.status,\n    doors: doorStates(detail),\n    objects,\n    encounters",
        'manual evaluator object states')
    c = replace_once(c,
        "      targets,\n      flags,\n      encounters",
        "      targets,\n      flags,\n      objects,\n      encounters",
        'manual effect object context')
    write(path, c)


def patch_object_gateway():
    path = 'src/runtime-object-gateway.js'
    c = read(path)
    c = replace_once(c,
        "change_reason TEXT NOT NULL CHECK (change_reason IN ('interaction', 'gm_override')),",
        "change_reason TEXT NOT NULL CHECK (change_reason IN ('interaction', 'gm_override', 'story_effect')),",
        'outer gateway state reason')
    c = replace_once(c,
        "        interaction_id TEXT,\n        created_at INTEGER NOT NULL,",
        "        interaction_id TEXT,\n        story_event_id TEXT,\n        story_effect_index INTEGER,\n        created_at INTEGER NOT NULL,",
        'outer gateway state provenance columns')
    c = replace_once(c,
        "        FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,\n        FOREIGN KEY (interaction_id) REFERENCES runtime_object_interaction_log(id) ON DELETE SET NULL\n      )`),",
        "        FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,\n        FOREIGN KEY (interaction_id) REFERENCES runtime_object_interaction_log(id) ON DELETE SET NULL,\n        FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE SET NULL\n      )`),",
        'outer gateway state provenance FK')
    c = replace_once(c,
        "            from_state_key, to_state_key, change_reason, changed_by_user_id, interaction_id, created_at\n          ) VALUES (",
        "            from_state_key, to_state_key, change_reason, changed_by_user_id, interaction_id,\n            story_event_id, story_effect_index, created_at\n          ) VALUES (",
        'interaction audit trigger columns')
    c = replace_once(c,
        "            'interaction', NEW.actor_user_id, NEW.id, NEW.created_at",
        "            'interaction', NEW.actor_user_id, NEW.id, NULL, NULL, NEW.created_at",
        'interaction audit trigger values')
    write(path, c)


def patch_ui():
    path = 'public/assets/gm-story-events.js'
    c = read(path)
    c = replace_once(c,
        "Structured Trigger + Conditions + Approved Effects. Manual GM and automatic enter_zone execution are live; no arbitrary JavaScript or SQL.",
        "Structured Trigger + Conditions + Approved Effects. Manual, Scene-start, zone, Object and durable lifecycle execution are live; no arbitrary JavaScript or SQL.",
        'Story UI capability text')
    c = replace_once(c,
        "Map targets use stable Template <code>sourceEdgeId</code> / <code>sourceZoneId</code>. Encounter effects use the Encounter Definition <code>encounterId</code>; Runtime state stays isolated per Scene Run.",
        "Map targets use stable Template <code>sourceEdgeId</code> / <code>sourceZoneId</code> / <code>sourceObjectId</code>. Object conditions use <code>{type: object_state, sourceObjectId, stateKey}</code>; effects use <code>{type: set_object_state, sourceObjectId, stateKey}</code>. Runtime state stays isolated per Scene Run.",
        'Story UI object help')
    c = replace_once(c,
        "  const encounters = detail.runtimeEncounters || [];\n  const rows = [",
        "  const encounters = detail.runtimeEncounters || [];\n  const objects = detail.runtimeObjects || [];\n  const rows = [",
        'Story UI object references variable')
    c = replace_once(c,
        "    ...zones.map(zone => `<div class=\"stack-item\"><div><strong>Zone · ${escapeHtml(zone.sourceZoneId)}</strong><p>${escapeHtml(zone.name)} · ${escapeHtml(zone.zoneType)} · player visible ${zone.playerVisible ? 'yes' : 'no'}</p></div></div>`),\n    ...encounters.map",
        "    ...zones.map(zone => `<div class=\"stack-item\"><div><strong>Zone · ${escapeHtml(zone.sourceZoneId)}</strong><p>${escapeHtml(zone.name)} · ${escapeHtml(zone.zoneType)} · player visible ${zone.playerVisible ? 'yes' : 'no'}</p></div></div>`),\n    ...objects.map(object => `<div class=\"stack-item\"><div><strong>Object · ${escapeHtml(object.sourceObjectId)}</strong><p>${escapeHtml(object.name)} · state ${escapeHtml(object.stateKey || 'ready')} · ${object.interactable ? 'interactable' : 'not interactable'}</p></div></div>`),\n    ...encounters.map",
        'Story UI object reference rows')
    c = replace_once(c,
        "Add Map targets or an Encounter Definition to this Scene first.",
        "Add Map targets, Objects or an Encounter Definition to this Scene first.",
        'Story UI empty references')
    write(path, c)


def patch_workflow():
    path = '.github/workflows/mvp-checks.yml'
    c = read(path)
    c = replace_once(c,
        "          node tests/story-interact-object-trigger-contract.test.mjs\n",
        "          node tests/story-interact-object-trigger-contract.test.mjs\n          node tests/story-object-state-mechanics-contract.test.mjs\n",
        'CI object state contract')
    write(path, c)


def patch_orchestrator():
    path = 'scripts/production-alpha-e2e.mjs'
    c = read(path)
    c = replace_once(c,
        "  runComponent('Production Object Interaction Story E2E', './production-alpha-story-interact-object-e2e.mjs');\n",
        "  runComponent('Production Object Interaction Story E2E', './production-alpha-story-interact-object-e2e.mjs');\n  runComponent('Production Story Object State Mechanics E2E', './production-alpha-story-object-state-e2e.mjs');\n",
        'orchestrator object state runner')
    c = replace_once(c,
        "      'story-interact-object',\n      'story-enter-zone',",
        "      'story-interact-object',\n      'story-object-state-mechanics',\n      'story-enter-zone',",
        'orchestrator object state component')
    write(path, c)


def patch_interact_doc():
    path = 'docs/STORY_INTERACT_OBJECT_TRIGGER_ALPHA.md'
    c = read(path)
    old = "The next useful Story-runtime work is no longer another missing trigger name. It is richer Object-state mechanics / object conditions and Scene completion / transition policy, followed by consolidation of older direct Story processors where that improves maintainability without changing Canonical behaviour."
    new = "Richer Object-state mechanics and object conditions are defined in `docs/STORY_OBJECT_STATE_MECHANICS_ALPHA.md`. The next major Story-runtime authority slice is Scene completion / transition policy, followed by consolidation of older direct Story processors where that improves maintainability without changing Canonical behaviour."
    c = replace_once(c, old, new, 'interact_object checkpoint')
    write(path, c)


def patch_rules_test():
    path = 'tests/story-event-rules.test.mjs'
    c = read(path)
    c = replace_once(c,
        "assert.ok(STORY_EVENT_CONDITION_TYPES.includes('encounter_status'));",
        "assert.ok(STORY_EVENT_CONDITION_TYPES.includes('encounter_status'));\nassert.ok(STORY_EVENT_CONDITION_TYPES.includes('object_state'));",
        'rules test condition vocabulary')
    c = replace_once(c,
        "assert.ok(STORY_EVENT_EFFECT_TYPES.includes('start_combat'));",
        "assert.ok(STORY_EVENT_EFFECT_TYPES.includes('start_combat'));\nassert.ok(STORY_EVENT_EFFECT_TYPES.includes('set_object_state'));",
        'rules test effect vocabulary')
    c = replace_once(c,
        "assert.deepEqual(normalizeStoryCondition({ type: 'encounter_status', encounterId: 'encounter_1', status: 'PLANNED' }), {",
        "assert.deepEqual(normalizeStoryCondition({ type: 'object_state', sourceObjectId: 'object_terminal', stateKey: 'LOCKED' }), {\n  type: 'object_state', sourceObjectId: 'object_terminal', stateKey: 'locked'\n});\nassert.deepEqual(normalizeStoryCondition({ type: 'encounter_status', encounterId: 'encounter_1', status: 'PLANNED' }), {",
        'rules test object condition normalization')
    c = replace_once(c,
        "assert.deepEqual(normalizeStoryEffect({ type: 'open_door', sourceEdgeId: 'edge_2' }), {",
        "assert.deepEqual(normalizeStoryEffect({ type: 'set_object_state', sourceObjectId: 'object_terminal', stateKey: 'OPEN' }), {\n  type: 'set_object_state', sourceObjectId: 'object_terminal', stateKey: 'open'\n});\nassert.deepEqual(normalizeStoryEffect({ type: 'open_door', sourceEdgeId: 'edge_2' }), {",
        'rules test object effect normalization')
    insert = """
const objectConditionPass = evaluateStoryConditions([
  { type: 'object_state', sourceObjectId: 'object_terminal', stateKey: 'open' }
], {
  objects: new Map([['object_terminal', 'open']])
});
assert.equal(objectConditionPass.ok, true);
const objectConditionFail = evaluateStoryConditions([
  { type: 'object_state', sourceObjectId: 'object_terminal', stateKey: 'locked' }
], {
  objects: new Map([['object_terminal', 'open']])
});
assert.equal(objectConditionFail.ok, false);
assert.equal(objectConditionFail.failures[0]?.reason, 'object_state_mismatch');

"""
    c = replace_once(c,
        "console.log('Structured Story Event rules passed.');",
        insert + "console.log('Structured Story Event rules passed.');",
        'rules test object evaluator')
    write(path, c)


def main():
    patch_rules()
    patch_common_executor('src/runtime-object-story.js', 'interact_object Story', 'interaction.map_instance_id', snapshot_override=True)
    patch_common_executor('src/runtime-story-lifecycle.js', 'durable Story lifecycle', 'map.id')
    patch_common_executor('src/scene-run-start-story.js', 'scene_run_start Story', 'mapInstanceId')
    patch_common_executor('src/story-zone-trigger-gateway.js', 'enter_zone Story', 'map.id')
    patch_manual_gateway()
    patch_object_gateway()
    patch_ui()
    patch_workflow()
    patch_orchestrator()
    patch_interact_doc()
    patch_rules_test()
    print('Object state mechanics integration patch applied.')


if __name__ == '__main__':
    main()
