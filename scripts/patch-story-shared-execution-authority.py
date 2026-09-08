from pathlib import Path

FILES = [
    Path('src/story-event-gateway.js'),
    Path('src/scene-run-start-story.js'),
    Path('src/story-zone-trigger-gateway.js'),
    Path('src/runtime-object-story.js'),
    Path('src/runtime-story-lifecycle.js'),
]

IMPORT_LINE = "import { executeRuntimeStoryEvent } from './story-execution-authority.js';\n"
OBJECT_IMPORT_END = "} from './runtime-object-state.js';\n"

for path in FILES:
    text = path.read_text(encoding='utf-8')
    assert IMPORT_LINE not in text, f'{path}: shared authority import already present'
    assert text.count(OBJECT_IMPORT_END) == 1, f'{path}: runtime-object-state import anchor mismatch'
    text = text.replace(OBJECT_IMPORT_END, OBJECT_IMPORT_END + IMPORT_LINE, 1)
    path.write_text(text, encoding='utf-8')

# Automatic adapters: preserve trigger matching / occurrence semantics and replace only execution delegation.
replacements = {
    Path('src/scene-run-start-story.js'): (
        'const result = await executeEvent(env, shared, event, firedCount);',
        'const result = await executeRuntimeStoryEvent(env, { shared, event, firedCount });'
    ),
    Path('src/story-zone-trigger-gateway.js'): (
        'const result = await executeEnteredZoneEvent(env, shared, event, firedCount);',
        'const result = await executeRuntimeStoryEvent(env, { shared, event, firedCount });'
    ),
    Path('src/runtime-object-story.js'): (
        'const result = await executeEvent(env, shared, event, firedCount);',
        'const result = await executeRuntimeStoryEvent(env, { shared, event, firedCount });'
    ),
    Path('src/runtime-story-lifecycle.js'): (
        'const result = await executeEvent(env, shared, event, firedCount);',
        'const result = await executeRuntimeStoryEvent(env, { shared, event, firedCount });'
    ),
}

for path, (old, new) in replacements.items():
    text = path.read_text(encoding='utf-8')
    assert text.count(old) == 1, f'{path}: execution call anchor mismatch'
    text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')

# Manual adapter: use the same shared execution authority while preserving HTTP semantics.
path = Path('src/story-event-gateway.js')
text = path.read_text(encoding='utf-8')
start = "  const encounters = await loadRuntimeEncounterMap(env, sceneRun.id, event.sceneId);\n"
end = "\n}\n\nexport default {"
assert text.count(start) == 1, 'manual execution start anchor mismatch'
assert text.count(end) == 1, 'manual execution end anchor mismatch'
prefix, tail = text.split(start, 1)
_old_block, suffix = tail.split(end, 1)
replacement = r'''  const encounters = await loadRuntimeEncounterMap(env, sceneRun.id, event.sceneId);
  const objectBySource = await loadRuntimeObjectTargets(env, mapInstanceId);
  const targets = runtimeTargets(detail);
  targets.objectBySource = objectBySource;
  const flags = await loadFlags(env, sceneRun.id);
  const objects = runtimeObjectStateMap(objectBySource);
  const shared = {
    actor: gm,
    sceneRunId: sceneRun.id,
    sceneRunStatus: sceneRun.status,
    sceneId: event.sceneId,
    mapInstanceId,
    targets,
    flags,
    doors: doorStates(detail),
    objects,
    encounters
  };

  const result = await executeRuntimeStoryEvent(env, { shared, event, firedCount });
  if (result.status === 'skipped') {
    if (result.code === 'STORY_EVENT_ALREADY_FIRED') {
      return apiError('Story Event 已經喺呢個 Scene Run 成功執行過。', 409, result.code);
    }
    return apiError('Story Event conditions 未滿足。', 409, result.code || 'STORY_EVENT_CONDITIONS_NOT_MET', {
      failures: result.failures || []
    });
  }
  if (result.status === 'failed') {
    return apiError(
      result.message || 'Story Event effect execution failed.',
      result.errorStatus || 500,
      result.code || 'STORY_EFFECT_EXECUTION_FAILED',
      {
        executionId: result.executionId || null,
        effectsApplied: result.effectsApplied || [],
        ...(result.missingPositions ? { missingPositions: result.missingPositions } : {}),
        ...(result.activeCombatId ? { activeCombatId: result.activeCombatId } : {})
      }
    );
  }

  return json({
    ok: true,
    executionId: result.executionId,
    event,
    effectsApplied: result.effectsApplied || [],
    ...(await runtimeStoryState(env, sceneRun.id, event.sceneId, mapInstanceId))
  });'''
text = prefix + replacement + end + suffix
path.write_text(text, encoding='utf-8')

# Preserve useful structured failure details for the manual adapter.
path = Path('src/story-execution-authority.js')
text = path.read_text(encoding='utf-8')
old = """    message: String(error?.message || error || 'Story Event effect execution failed.').slice(0, 1000),
    errorStatus: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
"""
new = """    message: String(error?.message || error || 'Story Event effect execution failed.').slice(0, 1000),
    errorStatus: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
    ...(error?.missingPositions ? { missingPositions: error.missingPositions } : {}),
    ...(error?.activeCombatId ? { activeCombatId: error.activeCombatId } : {})
"""
assert text.count(old) == 1, 'shared cleanError anchor mismatch'
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
