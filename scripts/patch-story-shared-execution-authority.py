from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    assert count == 1, f'{label}: expected one anchor, found {count}'
    return text.replace(old, new, 1)


# Shared audit authority: expose one failure path for adapter-level trigger validation.
path = Path('src/story-execution-authority.js')
text = path.read_text(encoding='utf-8')
marker = '\nexport async function executeRuntimeStoryEvent(env, {\n'
helper = '''
export async function failRuntimeStoryEvent(env, {
  shared,
  event,
  error,
  effectsApplied = []
}) {
  if (!shared?.actor?.id || !shared.sceneRunId || !shared.sceneId || !shared.mapInstanceId) {
    throw Object.assign(new Error('Story execution context is incomplete.'), {
      status: 500,
      code: 'STORY_EXECUTION_CONTEXT_INVALID'
    });
  }
  await ensureStoryExecutionAuthoritySchema(env);
  const executionId = await recordExecution(
    env,
    { ...shared, event },
    'failed',
    effectsApplied,
    error
  ).catch(() => null);
  return {
    eventId: event.id,
    name: event.name,
    status: 'failed',
    executionId,
    effectsApplied,
    ...cleanError(error)
  };
}
'''
text = replace_once(text, marker, '\n' + helper + marker.lstrip('\n'), 'shared failure helper')
path.write_text(text, encoding='utf-8')


# scene_run_start owns its trigger validation, while failed audit stays shared.
path = Path('src/scene-run-start-story.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { executeRuntimeStoryEvent } from './story-execution-authority.js';",
    "import {\n  executeRuntimeStoryEvent,\n  failRuntimeStoryEvent\n} from './story-execution-authority.js';",
    'scene start authority import'
)
old = '''    const event = eventPayload(row);
    const firedCount = counts.get(event.id) || 0;
    const result = await executeRuntimeStoryEvent(env, { shared, event, firedCount });
    if (result.status === 'applied') counts.set(event.id, firedCount + 1);
    results.push(result);'''
new = '''    const event = eventPayload(row);
    const firedCount = counts.get(event.id) || 0;
    let triggerError = null;
    if (!(event.oncePerSceneRun && firedCount > 0)) {
      try {
        normalizeStoryTrigger('scene_run_start', event.trigger);
      } catch (error) {
        triggerError = error;
      }
    }
    const result = triggerError
      ? await failRuntimeStoryEvent(env, { shared, event, error: triggerError })
      : await executeRuntimeStoryEvent(env, { shared, event, firedCount });
    if (result.status === 'applied') counts.set(event.id, firedCount + 1);
    results.push(result);'''
text = replace_once(text, old, new, 'scene start trigger validation')
path.write_text(text, encoding='utf-8')


# enter_zone contract follows adapter/shared split and locks required read-only helpers.
path = Path('tests/story-enter-zone-trigger-contract.test.mjs')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "const gateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');\n",
    "const gateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');\nconst authority = await readFile(new URL('../src/story-execution-authority.js', import.meta.url), 'utf8');\n",
    'zone contract authority source'
)
text = replace_once(
    text,
    "assert.match(gateway, /import \\{ evaluateStoryConditions, normalizeStoryTrigger \\} from '\\.\\/story-event-rules\\.js'/);",
    "assert.match(gateway, /import \\{ normalizeStoryTrigger \\} from '\\.\\/story-event-rules\\.js'/);\nassert.match(gateway, /story-execution-authority\\.js/);\nassert.match(gateway, /executeRuntimeStoryEvent\\(env, \\{ shared, event, firedCount \\}\\)/);",
    'zone contract rules/delegation'
)
for stale in [
    "assert.match(gateway, /STORY_EVENT_ALREADY_FIRED/);\n",
    "assert.match(gateway, /STORY_EVENT_CONDITIONS_NOT_MET/);\n",
    "assert.match(gateway, /runtime_door_state_log/);\n",
    "assert.match(gateway, /updated_by_user_id/);\n",
    "assert.match(gateway, /activated_by_user_id/);\n",
]:
    assert stale in text, stale
    text = text.replace(stale, '', 1)
anchor = "assert.match(gateway, /runtime_story_event_executions/);\n"
text = replace_once(
    text,
    anchor,
    anchor + "assert.match(gateway, /async function loadFlags/);\nassert.match(gateway, /async function appliedCounts/);\n",
    'zone runtime readers'
)
safety = "assert.doesNotMatch(gateway, /new Function\\s*\\(/);\n"
text = replace_once(
    text,
    safety,
    safety + "assert.doesNotMatch(gateway, /async function applyEffect\\(/);\nassert.doesNotMatch(gateway, /from '\\.\\/runtime-encounter-service\\.js'/);\n\nassert.match(authority, /STORY_EVENT_ALREADY_FIRED/);\nassert.match(authority, /STORY_EVENT_CONDITIONS_NOT_MET/);\nassert.match(authority, /runtime_door_state_log/);\n",
    'zone shared effect contract'
)
path.write_text(text, encoding='utf-8')
