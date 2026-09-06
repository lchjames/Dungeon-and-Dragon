import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoryTrigger } from '../src/story-event-rules.js';

const migration = await readFile(new URL('../schema/0027_runtime_object_interaction.sql', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/runtime-object-gateway.js', import.meta.url), 'utf8');
const objectStory = await readFile(new URL('../src/runtime-object-story.js', import.meta.url), 'utf8');
const lifecycle = await readFile(new URL('../src/runtime-story-lifecycle.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-map-objects.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-map-objects.js', import.meta.url), 'utf8');
const playerMapUi = await readFile(new URL('../public/assets/player-map-ui.js', import.meta.url), 'utf8');
const gmRoot = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-story-interact-object-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/STORY_INTERACT_OBJECT_TRIGGER_ALPHA.md', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.deepEqual(normalizeStoryTrigger('interact_object', {
  sourceObjectId: 'object_alpha',
  ignored: true
}), { sourceObjectId: 'object_alpha' });
assert.throws(() => normalizeStoryTrigger('interact_object', {}));
assert.match(rules, /type === 'interact_object'/);
assert.match(rules, /sourceObjectId/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS map_objects/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_map_objects/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_object_interaction_log/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_object_state_log/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_exploration_character_state/);
assert.match(migration, /interaction_range INTEGER NOT NULL DEFAULT 1 CHECK \(interaction_range IN \(0, 1\)\)/);
assert.match(migration, /UNIQUE \(map_instance_id, source_object_id\)/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_map_clone_objects/);
assert.match(migration, /AFTER INSERT ON runtime_map_instances/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_consume_exploration_action/);
assert.match(migration, /SET action_available = 0/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_consume_combat_action/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_apply_object/);
assert.match(migration, /interaction_count = interaction_count \+ 1/);
assert.match(migration, /interactable = CASE WHEN single_use = 1 THEN 0 ELSE interactable END/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_story_occurrence/);
assert.match(migration, /'interact_object'/);
assert.match(migration, /'object_interaction'/);
assert.doesNotMatch(migration, /UPDATE\s+map_objects\s+SET/i);
assert.doesNotMatch(migration, /DROP TABLE/i);

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-object-gateway\.js"\s*,?\s*$/m);
assert.match(gateway, /import baseWorker from '\.\/runtime-story-lifecycle-gateway\.js'/);
assert.match(gateway, /ensureRuntimeStoryLifecycleAuthoritySchema/);
assert.match(gateway, /processPendingObjectStoryEvents/);
assert.match(gateway, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(gateway, /const playerInteraction = pathname\.match/);
assert.match(gateway, /interactWithObject\(/);
assert.match(gateway, /CHARACTER_RESTING/);
assert.match(gateway, /ACTION_ALREADY_SPENT/);
assert.match(gateway, /OBJECT_OUT_OF_REACH/);
assert.match(gateway, /OBJECT_NOT_INTERACTABLE/);
assert.match(gateway, /NOT EXISTS \(SELECT 1 FROM combats WHERE status = 'active'\)/);
assert.match(gateway, /cb\.initiative_order = c\.current_turn_index/);
assert.match(gateway, /interactionMode: context\.turn\.mode/);
assert.match(gateway, /actionSpent: true/);
assert.match(gateway, /interactObjectStoryEvents/);
assert.match(gateway, /runtimeObjects:/);
assert.doesNotMatch(gateway, /UPDATE\s+map_objects\s+SET\s+state/i);
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);

assert.match(objectStory, /trigger_type = 'interact_object'/);
assert.match(objectStory, /subject_type !== 'object_interaction'/);
assert.match(objectStory, /FROM runtime_object_interaction_log/);
assert.match(objectStory, /normalizeStoryTrigger\('interact_object'/);
assert.match(objectStory, /trigger\.sourceObjectId !== interaction\.source_object_id/);
assert.match(objectStory, /runtime_story_lifecycle_dispatches/);
assert.match(objectStory, /runtime_story_event_executions/);
assert.match(objectStory, /created_at <= \?/);
assert.match(objectStory, /objectInteractionId:/);
assert.match(objectStory, /objectStateBefore:/);
assert.match(objectStory, /objectStateAfter:/);
assert.match(objectStory, /spawnRuntimeMonster/);
assert.match(objectStory, /spawnRuntimeBoss/);
assert.match(objectStory, /startRuntimeEncounterCombat/);
assert.match(objectStory, /activateRuntimeEncounter/);
assert.match(objectStory, /MAX_OBJECT_OCCURRENCES_PER_DRAIN = 50/);
assert.match(objectStory, /LEASE_TIMEOUT_MS/);
assert.doesNotMatch(objectStory, /\/api\/gm\//);
assert.doesNotMatch(objectStory, /eval\s*\(/);
assert.doesNotMatch(objectStory, /new Function\s*\(/);

assert.match(lifecycle, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(gateway, /genericEvents = await processPendingRuntimeStoryLifecycleEvents/);

assert.match(gmUi, /STRUCTURED MAP OBJECTS/);
assert.match(gmUi, /sourceObjectId/);
assert.match(gmUi, /data-open-map-objects/);
assert.match(gmUi, /singleUse/);
assert.match(gmRoot, /import '\.\/gm-map-objects\.js'/);

assert.match(playerUi, /Interaction uses one Action/);
assert.match(playerUi, /data-interact-object/);
assert.match(playerUi, /player-map-object-marker/);
assert.match(playerUi, /interactObjectStoryEvents/);
assert.match(playerMapUi, /player-map-objects\.js/);

assert.match(runner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(runner, /triggerType:\s*'interact_object'/);
assert.match(runner, /ignoredByCanonicalNormalizer/);
assert.match(runner, /singleUse:\s*true/);
assert.match(runner, /actionAvailable === false/);
assert.match(runner, /moveAvailable === true/);
assert.match(runner, /OBJECT_NOT_INTERACTABLE/);
assert.match(runner, /Runtime interaction polluted Map Object Definition state/);
assert.match(runner, /bestEffortFailureCleanup/);
assert.match(orchestrator, /production-alpha-story-interact-object-e2e\.mjs/);
assert.match(orchestrator, /'story-interact-object'/);

assert.match(canonical, /Object Interaction audit/);
assert.match(canonical, /interaction is a Character Action/i);
assert.match(canonical, /Resting Character cannot perform Object Interaction/);
assert.match(canonical, /subject_type = object_interaction/);
assert.match(canonical, /story_events\.created_at <= occurrence\.source_at/);
assert.match(canonical, /Definition changes after Scene Run creation do not rewrite existing Runtime Objects/);
assert.match(canonical, /interactObjectStoryEvents/);
assert.match(canonical, /single_use = true/);

console.log('Runtime Object authority, Action economy, durable interact_object Story dispatch, UI and production coverage contract passed.');
