import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoryTrigger } from '../src/story-event-rules.js';

const migration = await readFile(new URL('../schema/0025_story_encounter_resolved_trigger.sql', import.meta.url), 'utf8');
const resolution = await readFile(new URL('../src/runtime-encounter-resolution.js', import.meta.url), 'utf8');
const lifecycle = await readFile(new URL('../src/runtime-story-lifecycle.js', import.meta.url), 'utf8');
const resolutionGateway = await readFile(new URL('../src/runtime-encounter-resolution-gateway.js', import.meta.url), 'utf8');
const lifecycleGateway = await readFile(new URL('../src/runtime-story-lifecycle-gateway.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/STORY_ENCOUNTER_RESOLVED_TRIGGER_ALPHA.md', import.meta.url), 'utf8');

assert.deepEqual(normalizeStoryTrigger('encounter_resolved', { encounterId: 'encounter_alpha', ignored: true }), {
  encounterId: 'encounter_alpha'
});
assert.throws(() => normalizeStoryTrigger('encounter_resolved', {}));
assert.match(rules, /'encounter_resolved'/);
assert.match(rules, /type === 'encounter_activated' \|\| type === 'encounter_resolved' \|\| type === 'combat_started' \|\| type === 'combat_ended'/);

assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_resolved_story_occurrence/);
assert.match(migration, /AFTER INSERT ON runtime_encounter_resolution_log/);
assert.match(migration, /NEW\.to_status = 'resolved'/);
assert.match(migration, /NEW\.resolved_by_user_id IS NOT NULL/);
assert.match(migration, /'encounter_resolved'/);
assert.match(migration, /'encounter_resolution'/);
assert.match(migration, /NEW\.id/);
assert.match(migration, /NEW\.created_at/);
assert.match(migration, /NEW\.resolved_by_user_id/);
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);
assert.doesNotMatch(migration, /UPDATE\s+encounters\s+SET/i);

assert.match(resolution, /ensureRuntimeEncounterSchema/);
assert.match(resolution, /CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_resolved_story_occurrence/);
assert.match(resolution, /AFTER INSERT ON runtime_encounter_resolution_log/);
assert.match(resolution, /RUNTIME_ENCOUNTER_RESOLUTION_ACTOR_REQUIRED/);
assert.match(resolution, /normalizedCombatId \|\| null, normalizedActor, JSON\.stringify\(detail\), now/);
assert.match(resolution, /LEFT JOIN runtime_combat_end_audit cea ON cea\.combat_id = rec\.combat_id/);
assert.match(resolution, /endedByUserId: row\.ended_by_user_id \|\| null/);
assert.match(resolution, /env\.DB\.batch\(\[/);
assert.match(resolution, /SET status = 'resolved'/);
assert.match(resolution, /INSERT INTO runtime_encounter_resolution_log/);

assert.match(lifecycle, /SUPPORTED_TRIGGER_TYPES = Object\.freeze\(\['encounter_activated', 'combat_started', 'combat_ended', 'encounter_resolved', 'flag_changed'\]\)/);
assert.match(lifecycle, /ensureRuntimeEncounterResolutionSchema/);
assert.match(lifecycle, /trigger_type IN \('encounter_activated', 'combat_started', 'combat_ended', 'encounter_resolved', 'flag_changed'\)/);
assert.match(lifecycle, /occurrence\.trigger_type === 'encounter_resolved'/);
assert.match(lifecycle, /occurrence\.subject_type !== 'encounter_resolution'/);
assert.match(lifecycle, /FROM runtime_encounter_resolution_log/);
assert.match(lifecycle, /resolution\.to_status !== 'resolved'/);
assert.match(lifecycle, /encounter\.status !== 'resolved'/);
assert.match(lifecycle, /STORY_LIFECYCLE_ENCOUNTER_NOT_RESOLVED/);
assert.match(lifecycle, /resolutionId: resolution\.id/);
assert.match(lifecycle, /created_at <= \?/);
assert.match(lifecycle, /runtime_story_lifecycle_dispatches/);
assert.match(lifecycle, /processPendingRuntimeStoryLifecycleEvents/);
assert.doesNotMatch(lifecycle, /INSERT INTO encounter_participants/);
assert.doesNotMatch(lifecycle, /INSERT INTO encounter_combats/);
assert.doesNotMatch(lifecycle, /UPDATE\s+encounters\s+SET\s+status/i);

assert.doesNotMatch(resolutionGateway, /processEncounterResolvedStoryEvents/);
assert.match(resolutionGateway, /encounterResolvedStoryEvents: unique\.filter\(event => event\.triggerType === 'encounter_resolved'\)/);
assert.match(resolutionGateway, /storyEventsTriggered: groups\.encounterResolvedStoryEvents/);
assert.match(resolutionGateway, /actorUserId: linked\.endedByUserId \|\| actor\?\.id \|\| null/);
assert.match(resolutionGateway, /source: 'combat_ended_pre_resolution'/);
assert.match(resolutionGateway, /source: 'encounter_resolved_combat'/);
const preDrainIndex = resolutionGateway.indexOf("source: 'combat_ended_pre_resolution'");
const resolveIndex = resolutionGateway.indexOf('resolution = await resolveRuntimeEncounter', preDrainIndex);
const postDrainIndex = resolutionGateway.indexOf("source: 'encounter_resolved_combat'", resolveIndex);
assert(preDrainIndex >= 0 && resolveIndex > preDrainIndex && postDrainIndex > resolveIndex,
  'Combat End must drain combat_ended before resolution and encounter_resolved after resolution.');

assert.match(lifecycleGateway, /encounterResolvedStoryEvents/);
assert.match(lifecycleGateway, /event\?\.triggerType === 'encounter_resolved'/);
assert.match(lifecycleGateway, /payload\?\.resolution\?\.resolutionLog\?\.sceneRunId/);

assert.match(canonical, /Combat commit → `combat_ended` Story → Encounter auto-resolution commit → `encounter_resolved` Story/);
assert.match(canonical, /exact resolution audit row/);
assert.match(canonical, /actual resolving GM\/Admin identity/);
assert.match(canonical, /Runtime Encounter current status = resolved/);
assert.match(canonical, /legacy implementation history/);
assert.match(canonical, /Idempotency and retry/);
assert.match(canonical, /Definition isolation/);

console.log('Durable encounter_resolved Story lifecycle, authority, ordering and idempotency contract passed.');
