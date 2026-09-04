import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoryTrigger } from '../src/story-event-rules.js';

const migration = await readFile(new URL('../schema/0026_story_flag_changed_trigger.sql', import.meta.url), 'utf8');
const lifecycle = await readFile(new URL('../src/runtime-story-lifecycle.js', import.meta.url), 'utf8');
const lifecycleGateway = await readFile(new URL('../src/runtime-story-lifecycle-gateway.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-story-flag-changed-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/STORY_FLAG_CHANGED_TRIGGER_ALPHA.md', import.meta.url), 'utf8');

assert.deepEqual(normalizeStoryTrigger('flag_changed', { key: 'Quest.Stage', ignored: true }), {
  key: 'quest.stage'
});
assert.throws(() => normalizeStoryTrigger('flag_changed', {}));
assert.match(rules, /type === 'flag_changed'/);
assert.match(rules, /normalizeStoryFlagKey\(raw\.key\)/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_story_flag_change_log/);
assert.match(migration, /from_value_json TEXT/);
assert.match(migration, /to_value_json TEXT NOT NULL/);
assert.match(migration, /changed_by_user_id TEXT NOT NULL/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_insert_change_log/);
assert.match(migration, /AFTER INSERT ON runtime_story_flags/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_update_change_log/);
assert.match(migration, /AFTER UPDATE OF value_json ON runtime_story_flags/);
assert.match(migration, /WHEN OLD\.value_json IS NOT NEW\.value_json/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_changed_occurrence/);
assert.match(migration, /AFTER INSERT ON runtime_story_flag_change_log/);
assert.match(migration, /'flag_changed'/);
assert.match(migration, /'story_flag_change'/);
assert.match(migration, /NEW\.id/);
assert.match(migration, /NEW\.changed_at/);
assert.match(migration, /NEW\.changed_by_user_id/);
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);

assert.match(lifecycle, /SUPPORTED_TRIGGER_TYPES = Object\.freeze\(\['encounter_activated', 'combat_started', 'combat_ended', 'encounter_resolved', 'flag_changed'\]\)/);
assert.match(lifecycle, /CREATE TABLE IF NOT EXISTS runtime_story_flag_change_log/);
assert.match(lifecycle, /CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_insert_change_log/);
assert.match(lifecycle, /CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_update_change_log/);
assert.match(lifecycle, /WHEN OLD\.value_json IS NOT NEW\.value_json/);
assert.match(lifecycle, /CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_changed_occurrence/);
assert.match(lifecycle, /trigger_type IN \('encounter_activated', 'combat_started', 'combat_ended', 'encounter_resolved', 'flag_changed'\)/);
assert.match(lifecycle, /occurrence\.trigger_type === 'flag_changed'/);
assert.match(lifecycle, /occurrence\.subject_type !== 'story_flag_change'/);
assert.match(lifecycle, /FROM runtime_story_flag_change_log/);
assert.match(lifecycle, /STORY_LIFECYCLE_FLAG_CHANGE_INVALID/);
assert.match(lifecycle, /flagHadPreviousValue:/);
assert.match(lifecycle, /flagFromValue:/);
assert.match(lifecycle, /flagToValue:/);
assert.match(lifecycle, /if \(subject\.flagKey\) flags\.set\(subject\.flagKey, subject\.flagToValue\)/);
assert.match(lifecycle, /triggerType === 'flag_changed'\) return trigger\.key === subject\.flagKey/);
assert.match(lifecycle, /lifecycleFlagChangeId/);
assert.match(lifecycle, /flagChangeId: subject\.flagChangeId \|\| null/);
assert.match(lifecycle, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(lifecycle, /STORY_LIFECYCLE_CASCADE_LIMIT/);
assert.doesNotMatch(lifecycle, /\/api\/gm\//);
assert.doesNotMatch(lifecycle, /eval\s*\(/);
assert.doesNotMatch(lifecycle, /new Function\s*\(/);

assert.match(lifecycleGateway, /flagChangedStoryEvents/);
assert.match(lifecycleGateway, /event\?\.triggerType === 'flag_changed'/);
assert.match(lifecycleGateway, /payload\?\.flagChangedStoryEvents/);

assert.match(runner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(runner, /triggerType:\s*'flag_changed'/);
assert.match(runner, /flagChangedStoryEvents/);
assert.match(runner, /flagHadPreviousValue === false/);
assert.match(runner, /flagFromValue === null && derived\.flagToValue === true/);
assert.match(runner, /noop\.flagChangedStoryEvents\.length === 0/);
assert.match(runner, /Same-value write duplicated/);
assert.match(runner, /best-effort cleanup|Best-effort cleanup/i);
assert.match(orchestrator, /production-alpha-story-flag-changed-e2e\.mjs/);
assert.match(orchestrator, /'story-flag-changed'/);

assert.match(canonical, /runtime_story_flag_change_log/);
assert.match(canonical, /same serialised JSON scalar/i);
assert.match(canonical, /subject_type = story_flag_change/);
assert.match(canonical, /story_events\.created_at <= occurrence\.source_at/);
assert.match(canonical, /maximum 50 supported lifecycle occurrences per drain/);
assert.match(canonical, /flagChangedStoryEvents/);
assert.match(canonical, /interact_object/);

console.log('Durable flag_changed Story lifecycle, true-change authority, cascades, idempotency and production coverage contract passed.');
