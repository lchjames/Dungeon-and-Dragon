import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoryTrigger } from '../src/story-event-rules.js';

const gateway = await readFile(new URL('../src/story-event-gateway.js', import.meta.url), 'utf8');
const zoneGateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const runtimeEncounterGateway = await readFile(new URL('../src/runtime-encounter-gateway.js', import.meta.url), 'utf8');
const runtimeEncounterState = await readFile(new URL('../src/runtime-encounter-state.js', import.meta.url), 'utf8');
const resolutionGateway = await readFile(new URL('../src/runtime-encounter-resolution-gateway.js', import.meta.url), 'utf8');
const lifecycleGateway = await readFile(new URL('../src/runtime-story-lifecycle-gateway.js', import.meta.url), 'utf8');
const runtimeLifecycle = await readFile(new URL('../src/runtime-story-lifecycle.js', import.meta.url), 'utf8');
const sceneRunStartStory = await readFile(new URL('../src/scene-run-start-story.js', import.meta.url), 'utf8');
const encounterActivatedStory = await readFile(new URL('../src/encounter-activated-story.js', import.meta.url), 'utf8');
const lifecycleMigration = await readFile(new URL('../schema/0022_story_lifecycle_dispatches.sql', import.meta.url), 'utf8');
const combatStartedMigration = await readFile(new URL('../schema/0023_story_combat_started_trigger.sql', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-story-events.js', import.meta.url), 'utf8');
const gmRoot = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-story-narratives.js', import.meta.url), 'utf8');
const playerMapUi = await readFile(new URL('../public/assets/player-map-ui.js', import.meta.url), 'utf8');
const liveRunner = await readFile(new URL('../scripts/production-alpha-story-event-e2e.mjs', import.meta.url), 'utf8');
const sceneRunStartRunner = await readFile(new URL('../scripts/production-alpha-story-scene-run-start-e2e.mjs', import.meta.url), 'utf8');
const encounterActivatedRunner = await readFile(new URL('../scripts/production-alpha-story-encounter-activated-e2e.mjs', import.meta.url), 'utf8');
const combatStartedRunner = await readFile(new URL('../scripts/production-alpha-story-combat-started-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const sceneStartCanonical = await readFile(new URL('../docs/STORY_SCENE_RUN_START_TRIGGER_ALPHA.md', import.meta.url), 'utf8');
const encounterActivatedCanonical = await readFile(new URL('../docs/STORY_ENCOUNTER_ACTIVATED_TRIGGER_ALPHA.md', import.meta.url), 'utf8');
const combatStartedCanonical = await readFile(new URL('../docs/STORY_COMBAT_STARTED_TRIGGER_ALPHA.md', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-story-lifecycle-gateway\.js"\s*,?\s*$/m);
assert.match(lifecycleGateway, /import baseWorker from '\.\/runtime-encounter-resolution-gateway\.js'/);
assert.match(resolutionGateway, /import baseWorker from '\.\/runtime-encounter-gateway\.js'/);
assert.match(runtimeEncounterGateway, /import baseWorker from '\.\/story-zone-trigger-gateway\.js'/);
assert.match(zoneGateway, /import baseWorker from '\.\/story-event-gateway\.js'/);
assert.match(gateway, /import baseWorker from '\.\/runtime-visibility-gateway\.js'/);

for (const table of ['story_events', 'runtime_story_flags', 'runtime_story_narratives', 'runtime_story_event_executions']) {
  assert.match(gateway, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(gateway, /STORY_EVENT_TRIGGER_NOT_MANUAL/);
assert.match(gateway, /STORY_EVENT_ALREADY_FIRED/);
assert.match(gateway, /STORY_EVENT_CONDITIONS_NOT_MET/);
assert.match(gateway, /effects_applied_json/);
assert.ok(
  gateway.includes("pathname.match(/^\\/api\\/gm\\/world\\/runtime\\/maps\\/([^/]+)\\/story-events\\/([^/]+)\\/activate$/)"),
  'Story Event gateway must expose the GM manual activation route for a Runtime Map and Event.'
);
assert.match(gateway, /\/door-state/);
assert.match(gateway, /sourceEdgeId/);
assert.match(gateway, /sourceZoneId/);
assert.match(gateway, /runtime_story_narratives/);
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);

for (const value of [
  'manual',
  'scene_run_start',
  'enter_zone',
  'encounter_activated',
  'encounter_resolved',
  'combat_started',
  'combat_ended',
  'event_not_fired',
  'flag_equals',
  'door_state',
  'show_narrative',
  'set_flag',
  'reveal_zone',
  'open_door',
  'close_door'
]) {
  assert.match(rules, new RegExp(`'${value}'`));
}
assert.deepEqual(normalizeStoryTrigger('scene_run_start', { ignored: true }), {});
assert.deepEqual(normalizeStoryTrigger('encounter_activated', { encounterId: 'encounter_alpha', ignored: true }), { encounterId: 'encounter_alpha' });
assert.deepEqual(normalizeStoryTrigger('encounter_resolved', { encounterId: 'encounter_alpha', ignored: true }), { encounterId: 'encounter_alpha' });
assert.deepEqual(normalizeStoryTrigger('combat_started', { encounterId: 'encounter_alpha', ignored: true }), { encounterId: 'encounter_alpha' });
assert.deepEqual(normalizeStoryTrigger('combat_ended', { encounterId: 'encounter_alpha', ignored: true }), { encounterId: 'encounter_alpha' });
assert.throws(() => normalizeStoryTrigger('encounter_activated', {}));
assert.throws(() => normalizeStoryTrigger('encounter_resolved', {}));
assert.throws(() => normalizeStoryTrigger('combat_started', {}));
assert.throws(() => normalizeStoryTrigger('combat_ended', {}));
assert.match(rules, /sourceEdgeId/);
assert.match(rules, /sourceZoneId/);
assert.doesNotMatch(rules, /eval\s*\(/);
assert.doesNotMatch(rules, /new Function\s*\(/);

assert.match(gmUi, /<h3>Story Events<\/h3>/);
assert.match(gmUi, /Trigger \+ Conditions \+ Approved Effects/);
assert.match(gmUi, /'manual', 'scene_run_start', 'enter_zone', 'interact_object'/);
assert.match(gmUi, /'encounter_activated', 'encounter_resolved', 'combat_started', 'combat_ended'/);
assert.match(gmUi, /id="gm-story-event-conditions"/);
assert.match(gmUi, /id="gm-story-event-effects"/);
assert.match(gmUi, /sourceEdgeId/);
assert.match(gmUi, /sourceZoneId/);
assert.match(gmUi, /Activate Selected/);
assert.match(gmUi, /\/story-events\/\$\{encodeURIComponent\(event\.id\)\}\/activate/);

assert.match(playerUi, /storyNarratives/);
assert.match(playerUi, /GM-revealed narrative/);
assert.match(playerMapUi, /player-story-narratives\.js/);

assert.match(liveRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(liveRunner, /flag_not_equals/);
assert.match(liveRunner, /set_flag/);
assert.match(liveRunner, /show_narrative/);
assert.match(liveRunner, /STORY_EVENT_ALREADY_FIRED/);
assert.match(liveRunner, /storyExecutions/);
assert.match(liveRunner, /storyNarratives/);
assert.match(orchestrator, /production-alpha-story-event-e2e\.mjs/);
assert.match(orchestrator, /'story-event'/);

assert.match(resolutionGateway, /import \{ processSceneRunStartStoryEvents \} from '\.\/scene-run-start-story\.js'/);
assert.match(resolutionGateway, /handleSceneRunStart/);
assert.match(resolutionGateway, /const response = await baseWorker\.fetch\(request, env\)/, 'Scene Run creation must commit through existing Runtime authority before lifecycle Story execution.');
assert.match(resolutionGateway, /sceneRunStartStoryEvents/);
assert.match(resolutionGateway, /STORY_SCENE_RUN_START_TRIGGER_ERROR/);
assert.match(resolutionGateway, /STORY_SCENE_RUN_START_ACTOR_UNAVAILABLE/);
assert.match(resolutionGateway, /pathname === '\/api\/gm\/world\/runtime\/scene-runs'/);

assert.match(sceneRunStartStory, /trigger_type = 'scene_run_start'/);
assert.match(sceneRunStartStory, /normalizeStoryTrigger\('scene_run_start'/);
assert.match(sceneRunStartStory, /evaluateStoryConditions/);
assert.match(sceneRunStartStory, /runtime_story_event_executions/);
assert.match(sceneRunStartStory, /spawnRuntimeMonster/);
assert.match(sceneRunStartStory, /spawnRuntimeBoss/);
assert.match(sceneRunStartStory, /startRuntimeEncounterCombat/);
assert.match(sceneRunStartStory, /\.entries\(\)/, 'Lifecycle Story effects must retain stable authored effect indexes.');
assert.doesNotMatch(sceneRunStartStory, /INSERT INTO encounter_participants/);
assert.doesNotMatch(sceneRunStartStory, /INSERT INTO encounter_combats/);
assert.doesNotMatch(sceneRunStartStory, /UPDATE\s+encounters\s+SET\s+status/i);
assert.doesNotMatch(sceneRunStartStory, /eval\s*\(/);
assert.doesNotMatch(sceneRunStartStory, /new Function\s*\(/);

assert.match(sceneRunStartRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(sceneRunStartRunner, /triggerType:\s*'scene_run_start'/);
assert.match(sceneRunStartRunner, /ignoredByCanonicalNormalizer/);
assert.match(sceneRunStartRunner, /type:\s*'show_narrative'/);
assert.match(sceneRunStartRunner, /type:\s*'set_flag'/);
assert.match(sceneRunStartRunner, /type:\s*'activate_encounter'/);
assert.match(sceneRunStartRunner, /type:\s*'start_combat'/);
assert.match(sceneRunStartRunner, /sceneRunStartStoryEvents/);
assert.match(sceneRunStartRunner, /Successful scene_run_start Event was not applied/);
assert.match(sceneRunStartRunner, /Intentional scene_run_start failure was not audited as failed/);
assert.match(sceneRunStartRunner, /Encounter Definition status was polluted/);
assert.match(sceneRunStartRunner, /bestEffortFailureCleanup/);
assert.match(orchestrator, /production-alpha-story-scene-run-start-e2e\.mjs/);
assert.match(orchestrator, /'story-scene-run-start'/);

assert.match(sceneStartCanonical, /Runtime authority commits first/);
assert.match(sceneStartCanonical, /sceneRunStartStoryEvents/);
assert.match(sceneStartCanonical, /STORY_SCENE_RUN_START_TRIGGER_ERROR/);
assert.match(sceneStartCanonical, /Definition data remains authoring input only/);
assert.match(sceneStartCanonical, /interact_object/);

assert.match(lifecycleMigration, /CREATE TABLE IF NOT EXISTS runtime_story_lifecycle_occurrences/);
assert.match(lifecycleMigration, /CREATE TABLE IF NOT EXISTS runtime_story_lifecycle_dispatches/);
assert.match(lifecycleMigration, /UNIQUE \(scene_run_id, trigger_type, subject_id\)/);
assert.match(lifecycleMigration, /UNIQUE \(occurrence_id, story_event_id\)/);
assert.doesNotMatch(lifecycleMigration, /DROP TABLE/i);
assert.doesNotMatch(lifecycleMigration, /DELETE FROM/i);
assert.doesNotMatch(lifecycleMigration, /FOREIGN KEY \(story_event_id\)/, 'Lifecycle dispatch schema must not depend on Story schema creation order.');

assert.match(runtimeEncounterState, /CREATE TABLE IF NOT EXISTS runtime_story_lifecycle_occurrences/);
assert.match(runtimeEncounterState, /CREATE TABLE IF NOT EXISTS runtime_story_lifecycle_dispatches/);
assert.match(runtimeEncounterState, /const results = await env\.DB\.batch\(\[/);
assert.match(runtimeEncounterState, /SET status = 'active'/);
assert.match(runtimeEncounterState, /INSERT OR IGNORE INTO runtime_story_lifecycle_occurrences/);
assert.match(runtimeEncounterState, /'encounter_activated'/);
assert.match(runtimeEncounterState, /activated_at/);
assert.match(runtimeEncounterState, /COALESCE\(activated_by_user_id, \?\)/);
assert.doesNotMatch(runtimeEncounterState, /UPDATE\s+encounters\s+SET\s+status/i);

assert.match(combatStartedMigration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_combat_started_story_occurrence/);
assert.match(combatStartedMigration, /AFTER INSERT ON runtime_encounter_combats/);
assert.match(combatStartedMigration, /'combat_started'/);
assert.match(combatStartedMigration, /'combat'/);
assert.match(combatStartedMigration, /NEW\.combat_id/);
assert.match(combatStartedMigration, /COALESCE\(c\.started_at, NEW\.linked_at\)/);
assert.match(combatStartedMigration, /NEW\.linked_by_user_id/);
assert.doesNotMatch(combatStartedMigration, /encounter_participants/);
assert.doesNotMatch(combatStartedMigration, /encounter_combats\s+SET/i);
assert.doesNotMatch(combatStartedMigration, /UPDATE\s+encounters\s+SET/i);

assert.match(encounterActivatedStory, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(encounterActivatedStory, /processPendingEncounterActivatedStoryEvents/);
assert.doesNotMatch(encounterActivatedStory, /runtime_story_lifecycle_dispatches/);

assert.match(runtimeLifecycle, /SUPPORTED_TRIGGER_TYPES = Object\.freeze\(\['encounter_activated', 'combat_started', 'combat_ended', 'encounter_resolved'\]\)/);
assert.match(runtimeLifecycle, /MAX_OCCURRENCES_PER_DRAIN = 50/);
assert.match(runtimeLifecycle, /LEASE_TIMEOUT_MS/);
assert.match(runtimeLifecycle, /CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_combat_started_story_occurrence/);
assert.match(runtimeLifecycle, /AFTER INSERT ON runtime_encounter_combats/);
assert.match(runtimeLifecycle, /CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_combat_ended_story_occurrence/);
assert.match(runtimeLifecycle, /AFTER INSERT ON runtime_combat_end_audit/);
assert.match(runtimeLifecycle, /trigger_type IN \('encounter_activated', 'combat_started', 'combat_ended', 'encounter_resolved'\)/);
assert.match(runtimeLifecycle, /claimNextOccurrence/);
assert.match(runtimeLifecycle, /lease_token/);
assert.match(runtimeLifecycle, /runtime_story_lifecycle_dispatches/);
assert.match(runtimeLifecycle, /created_at <= \?/);
assert.match(runtimeLifecycle, /normalizeStoryTrigger\(occurrence\.trigger_type/);
assert.match(runtimeLifecycle, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(runtimeLifecycle, /STORY_LIFECYCLE_CASCADE_LIMIT/);
assert.match(runtimeLifecycle, /runtime_encounter_combats rec/);
assert.match(runtimeLifecycle, /linked\.encounter_id/);
assert.match(runtimeLifecycle, /runtime_encounter_resolution_log/);
assert.match(runtimeLifecycle, /encounter\.status !== 'resolved'/);
assert.match(runtimeLifecycle, /spawnRuntimeMonster/);
assert.match(runtimeLifecycle, /spawnRuntimeBoss/);
assert.match(runtimeLifecycle, /startRuntimeEncounterCombat/);
assert.match(runtimeLifecycle, /activateRuntimeEncounter/);
assert.match(runtimeLifecycle, /triggerType: occurrence\.trigger_type/);
assert.match(runtimeLifecycle, /combatId: subject\.combatId/);
assert.match(runtimeLifecycle, /resolutionId: subject\.resolutionId/);
assert.doesNotMatch(runtimeLifecycle, /INSERT INTO encounter_participants/);
assert.doesNotMatch(runtimeLifecycle, /INSERT INTO encounter_combats/);
assert.doesNotMatch(runtimeLifecycle, /UPDATE\s+encounters\s+SET\s+status/i);
assert.doesNotMatch(runtimeLifecycle, /\/api\/gm\//, 'Generic lifecycle dispatcher must use server-internal Runtime services rather than GM HTTP impersonation.');
assert.doesNotMatch(runtimeLifecycle, /eval\s*\(/);
assert.doesNotMatch(runtimeLifecycle, /new Function\s*\(/);

assert.match(resolutionGateway, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(resolutionGateway, /drainRuntimeLifecycle/);
assert.match(resolutionGateway, /lifecycleGroups/);
assert.match(resolutionGateway, /encounterActivatedStoryEvents/);
assert.match(resolutionGateway, /combatStartedStoryEvents/);
assert.match(resolutionGateway, /combatEndedStoryEvents/);
assert.match(resolutionGateway, /encounterResolvedStoryEvents/);
assert.match(resolutionGateway, /storyLifecycleWarning/);
assert.match(resolutionGateway, /encounterActivatedStoryWarning/);
assert.match(resolutionGateway, /manual_story_event/);
assert.match(resolutionGateway, /player_move_enter_zone/);
assert.match(resolutionGateway, /encounter_resolved_manual/);
assert.match(resolutionGateway, /encounter_resolved_combat/);
assert.match(resolutionGateway, /combat_ended_pre_resolution/);
assert.match(resolutionGateway, /source: 'scene_run_start'/);

assert.match(lifecycleGateway, /ensureRuntimeStoryLifecycleAuthoritySchema/);
assert.match(lifecycleGateway, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(lifecycleGateway, /STORY_LIFECYCLE_AUTHORITY_UNAVAILABLE/);
assert.match(lifecycleGateway, /Runtime Story lifecycle drain failed after committed mutation/);
assert.match(lifecycleGateway, /storyLifecycleEvents/);
assert.match(lifecycleGateway, /encounterActivatedStoryEvents/);
assert.match(lifecycleGateway, /combatStartedStoryEvents/);
assert.match(lifecycleGateway, /combatEndedStoryEvents/);
assert.match(lifecycleGateway, /encounterResolvedStoryEvents/);
assert.match(lifecycleGateway, /start-combat/);
assert.match(lifecycleGateway, /story-events/);
assert.match(lifecycleGateway, /api\\\/player\\\/world\\\/characters/);
assert.match(lifecycleGateway, /api\\\/gm\\\/combat/);

assert.match(encounterActivatedRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(encounterActivatedRunner, /triggerType:\s*'encounter_activated'/);
assert.match(encounterActivatedRunner, /triggerType:\s*'scene_run_start'/);
assert.match(encounterActivatedRunner, /activate_encounter/);
assert.match(encounterActivatedRunner, /encounterActivatedStoryEvents/);
assert.match(encounterActivatedRunner, /Cascade encounter_activated\(B\) did not apply/);
assert.match(encounterActivatedRunner, /Retry activation of already-active Encounter A was not idempotent/);
assert.match(encounterActivatedRunner, /zero duplicate lifecycle dispatches/);
assert.match(encounterActivatedRunner, /Definition status/);
assert.match(orchestrator, /production-alpha-story-encounter-activated-e2e\.mjs/);
assert.match(orchestrator, /'story-encounter-activated'/);

assert.match(combatStartedRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(combatStartedRunner, /triggerType:\s*'combat_started'/);
assert.match(combatStartedRunner, /ignoredByCanonicalNormalizer/);
assert.match(combatStartedRunner, /\/start-combat/);
assert.match(combatStartedRunner, /combatStartedStoryEvents/);
assert.match(combatStartedRunner, /storyLifecycleEvents/);
assert.match(combatStartedRunner, /combat_started → encounter_activated\(B\) cascade did not apply/);
assert.match(combatStartedRunner, /Retry start-combat did not return the existing Runtime Combat idempotently/);
assert.match(combatStartedRunner, /zero duplicate lifecycle Narrative \/ dispatch result/);
assert.match(combatStartedRunner, /Definition status \/ roster \/ legacy Combat isolation verification/);
assert.match(orchestrator, /production-alpha-story-combat-started-e2e\.mjs/);
assert.match(orchestrator, /'story-combat-started'/);

assert.match(encounterActivatedCanonical, /same D1 batch/);
assert.match(encounterActivatedCanonical, /created_at <= occurrence\.source_at/);
assert.match(encounterActivatedCanonical, /runtime_story_lifecycle_occurrences/);
assert.match(encounterActivatedCanonical, /runtime_story_lifecycle_dispatches/);
assert.match(encounterActivatedCanonical, /50 occurrences/);
assert.match(encounterActivatedCanonical, /Definition \/ Runtime isolation/);
assert.match(encounterActivatedCanonical, /interact_object/);

assert.match(combatStartedCanonical, /AFTER INSERT/);
assert.match(combatStartedCanonical, /runtime_encounter_combats/);
assert.match(combatStartedCanonical, /same transaction boundary/);
assert.match(combatStartedCanonical, /subject_type = combat/);
assert.match(combatStartedCanonical, /story_events\.created_at <= occurrence\.source_at/);
assert.match(combatStartedCanonical, /combat_started\(A\)/);
assert.match(combatStartedCanonical, /encounter_activated\(B\)/);
assert.match(combatStartedCanonical, /50 supported lifecycle occurrences/);
assert.match(combatStartedCanonical, /Definition \/ Runtime isolation/);
assert.match(combatStartedCanonical, /combat_ended/);

assert.match(gmRoot, /import '\.\/gm-story-events\.js'/);
assert.match(gmRoot, /gm-create-attack-profile/);
assert.match(gmRoot, /data-profile-save/);

console.log('Story Event manual + scene_run_start + durable encounter_activated + combat_started + combat_ended + encounter_resolved lifecycle runtime integration contract passed.');
