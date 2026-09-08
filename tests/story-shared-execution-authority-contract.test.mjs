import fs from 'node:fs';
import assert from 'node:assert/strict';

const authority = fs.readFileSync('src/story-execution-authority.js', 'utf8');
const manual = fs.readFileSync('src/story-event-gateway.js', 'utf8');
const sceneStart = fs.readFileSync('src/scene-run-start-story.js', 'utf8');
const enterZone = fs.readFileSync('src/story-zone-trigger-gateway.js', 'utf8');
const objectStory = fs.readFileSync('src/runtime-object-story.js', 'utf8');
const lifecycle = fs.readFileSync('src/runtime-story-lifecycle.js', 'utf8');
const docs = fs.readFileSync('docs/STORY_SHARED_EXECUTION_AUTHORITY_ALPHA.md', 'utf8');

assert.match(authority, /export async function executeRuntimeStoryEvent/);
assert.match(authority, /export function validateStoryExecutionTargets/);
assert.match(authority, /runtime_story_event_executions/);
assert.match(authority, /evaluateStoryConditions/);
assert.match(authority, /applyRuntimeObjectStateEffect/);
for (const effect of [
  'show_narrative',
  'set_flag',
  'set_object_state',
  'reveal_zone',
  'open_door',
  'close_door',
  'activate_encounter',
  'spawn_monster',
  'spawn_boss',
  'start_combat'
]) {
  assert.match(authority, new RegExp(`effect\\.type === '${effect}'`));
}
assert.match(authority, /EXISTS \(\s*SELECT 1 FROM runtime_map_instances WHERE id = \? AND status = 'active'/s);
assert.match(authority, /storyEffectIndex: effectIndex/);
assert.match(authority, /actorUserId: context\.actor\.id/);

for (const [name, source] of [
  ['manual', manual],
  ['scene_run_start', sceneStart],
  ['enter_zone', enterZone],
  ['interact_object', objectStory],
  ['durable lifecycle', lifecycle]
]) {
  assert.match(source, /story-execution-authority\.js/, `${name} must import the shared Story execution authority`);
  assert.match(source, /executeRuntimeStoryEvent\(env, \{\s*shared,\s*event,\s*firedCount\s*\}\)/s,
    `${name} must delegate active condition/effect execution to the shared authority`);
}

assert.match(objectStory, /shared\.objects\.set\(interaction\.source_object_id, interaction\.to_state_key\)/);
assert.match(objectStory, /committed interaction/);
assert.match(lifecycle, /if \(subject\.flagKey\) flags\.set\(subject\.flagKey, subject\.flagToValue\)/);
assert.match(lifecycle, /created_at <= \?/);
assert.match(lifecycle, /combat_ended/);
assert.match(lifecycle, /encounter_resolved/);

assert.match(manual, /STORY_EVENT_CONDITIONS_NOT_MET/);
assert.match(manual, /errorStatus/);
assert.match(docs, /GM-facing \*\*Script Tool\*\*/);
assert.match(docs, /does not add arbitrary code execution/i);
assert.match(docs, /after this consolidation is production-complete/i);

console.log('Shared Story execution authority contract passed.');
