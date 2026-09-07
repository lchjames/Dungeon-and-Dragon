import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  evaluateStoryConditions,
  normalizeStoryCondition,
  normalizeStoryEffect,
  normalizeStoryObjectStateKey,
  STORY_EVENT_CONDITION_TYPES,
  STORY_EVENT_EFFECT_TYPES
} from '../src/story-event-rules.js';

const helper = await readFile(new URL('../src/runtime-object-state.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0028_story_object_state_mechanics.sql', import.meta.url), 'utf8');
const objectGateway = await readFile(new URL('../src/runtime-object-gateway.js', import.meta.url), 'utf8');
const objectStory = await readFile(new URL('../src/runtime-object-story.js', import.meta.url), 'utf8');
const lifecycle = await readFile(new URL('../src/runtime-story-lifecycle.js', import.meta.url), 'utf8');
const sceneStart = await readFile(new URL('../src/scene-run-start-story.js', import.meta.url), 'utf8');
const zone = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const manual = await readFile(new URL('../src/story-event-gateway.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-story-events.js', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-story-object-state-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/STORY_OBJECT_STATE_MECHANICS_ALPHA.md', import.meta.url), 'utf8');

assert.ok(STORY_EVENT_CONDITION_TYPES.includes('object_state'));
assert.ok(STORY_EVENT_EFFECT_TYPES.includes('set_object_state'));
assert.equal(normalizeStoryObjectStateKey('Puzzle.Stage_2'), 'puzzle.stage_2');
assert.throws(() => normalizeStoryObjectStateKey('bad state'));
assert.deepEqual(normalizeStoryCondition({
  type: 'object_state', sourceObjectId: 'object_terminal', stateKey: 'LOCKED'
}), {
  type: 'object_state', sourceObjectId: 'object_terminal', stateKey: 'locked'
});
assert.deepEqual(normalizeStoryEffect({
  type: 'set_object_state', sourceObjectId: 'object_terminal', stateKey: 'OPEN'
}), {
  type: 'set_object_state', sourceObjectId: 'object_terminal', stateKey: 'open'
});
assert.throws(() => normalizeStoryCondition({ type: 'object_state', sourceObjectId: '', stateKey: 'open' }));
assert.throws(() => normalizeStoryEffect({ type: 'set_object_state', sourceObjectId: 'object_terminal', stateKey: 'not valid' }));

const pass = evaluateStoryConditions([
  { type: 'object_state', sourceObjectId: 'object_terminal', stateKey: 'locked' }
], { objects: new Map([['object_terminal', 'locked']]) });
assert.equal(pass.ok, true);
const fail = evaluateStoryConditions([
  { type: 'object_state', sourceObjectId: 'object_terminal', stateKey: 'locked' }
], { objects: new Map([['object_terminal', 'open']]) });
assert.equal(fail.ok, false);
assert.equal(fail.failures[0]?.reason, 'object_state_mismatch');
assert.equal(fail.failures[0]?.sourceObjectId, 'object_terminal');

assert.match(migration, /ALTER TABLE runtime_object_state_log RENAME TO runtime_object_state_log_legacy_0028/);
assert.match(migration, /change_reason IN \('interaction', 'gm_override', 'story_effect'\)/);
assert.match(migration, /story_event_id TEXT/);
assert.match(migration, /story_effect_index INTEGER/);
assert.match(migration, /FROM runtime_object_state_log_legacy_0028/);
assert.match(migration, /DROP TRIGGER IF EXISTS trg_runtime_object_interaction_state_log/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_state_log/);
assert.doesNotMatch(migration, /runtime_object_story_state_log/);

assert.match(helper, /export async function ensureRuntimeObjectStateAuthoritySchema/);
assert.match(helper, /RUNTIME_OBJECT_STATE_SCHEMA_UPGRADE_BLOCKED/);
assert.match(helper, /export async function loadRuntimeObjectTargets/);
assert.match(helper, /export function runtimeObjectStateMap/);
assert.match(helper, /export async function applyRuntimeObjectStateEffect/);
assert.match(helper, /change_reason IN \('interaction', 'gm_override', 'story_effect'\)/);
assert.match(helper, /'story_effect'/);
assert.match(helper, /story_event_id/);
assert.match(helper, /story_effect_index/);
assert.match(helper, /state_key = \?, updated_at = \?/);
assert.match(helper, /state_key = \? AND updated_at = \?/);
assert.match(helper, /STORY_EFFECT_OBJECT_CHANGED/);
assert.match(helper, /unchanged: true[\s\S]*auditId: null/);
assert.doesNotMatch(helper, /player_visible\s*=/);
assert.doesNotMatch(helper, /interactable\s*=/);
assert.doesNotMatch(helper, /runtime_story_flags/);
assert.doesNotMatch(helper, /runtime_object_story_state_log/);

assert.match(objectGateway, /change_reason IN \('interaction', 'gm_override', 'story_effect'\)/);
assert.match(objectGateway, /story_event_id TEXT/);
assert.match(objectGateway, /story_effect_index INTEGER/);
assert.match(objectGateway, /NEW\.id, NULL, NULL, NEW\.created_at/);

for (const [label, source] of [
  ['manual', manual],
  ['scene_run_start', sceneStart],
  ['enter_zone', zone],
  ['interact_object', objectStory],
  ['generic lifecycle', lifecycle]
]) {
  assert.match(source, /from '\.\/runtime-object-state\.js'/, `${label} must use shared Runtime Object state authority.`);
  assert.match(source, /loadRuntimeObjectTargets\(/, `${label} must resolve Runtime Object targets.`);
  assert.match(source, /runtimeObjectStateMap\(/, `${label} must build Object condition context.`);
  assert.match(source, /condition\.type === 'object_state'/, `${label} must validate object_state targets.`);
  assert.match(source, /effect\.type === 'set_object_state'/, `${label} must validate/execute set_object_state.`);
  assert.match(source, /applyRuntimeObjectStateEffect\(/, `${label} must use shared Object mutation authority.`);
  assert.match(source, /objects(?:\s*:|\s*,)/, `${label} must pass Object states into condition evaluation.`);
  assert.match(source, /storyEffectIndex:\s*effectIndex/, `${label} must preserve Story effect provenance.`);
}

assert.match(objectStory, /shared\.objects\.set\(interaction\.source_object_id, interaction\.to_state_key\)/);
assert.match(objectStory, /committed interaction/);

assert.match(ui, /sourceObjectId/);
assert.match(ui, /type: object_state/);
assert.match(ui, /type: set_object_state/);
assert.match(ui, /detail\.runtimeObjects/);
assert.match(ui, /state \$\{escapeHtml\(object\.stateKey/);

assert.match(runner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(runner, /object_state/);
assert.match(runner, /set_object_state/);
assert.match(runner, /stateAuditId|auditId/);
assert.match(runner, /Definition Object/);
assert.match(runner, /same-state/i);
assert.match(orchestrator, /production-alpha-story-object-state-e2e\.mjs/);
assert.match(orchestrator, /'story-object-state-mechanics'/);

assert.match(canonical, /runtime_map_objects\.state_key/);
assert.match(canonical, /runtime_object_state_log/);
assert.match(canonical, /change_reason = story_effect/);
assert.match(canonical, /does \*\*not\*\* introduce a new lifecycle trigger named `object_state_changed`/);
assert.match(canonical, /Scene completion \/ Scene transition policy/);

console.log('Story Object state condition/effect, shared authority, audit provenance and production verification contract passed.');
