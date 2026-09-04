import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoryTrigger } from '../src/story-event-rules.js';

const migration = await readFile(new URL('../schema/0024_story_combat_ended_trigger.sql', import.meta.url), 'utf8');
const combatState = await readFile(new URL('../src/combat-state.js', import.meta.url), 'utf8');
const lifecycle = await readFile(new URL('../src/runtime-story-lifecycle.js', import.meta.url), 'utf8');
const lifecycleGateway = await readFile(new URL('../src/runtime-story-lifecycle-gateway.js', import.meta.url), 'utf8');
const resolutionGateway = await readFile(new URL('../src/runtime-encounter-resolution-gateway.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-story-combat-ended-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/STORY_COMBAT_ENDED_TRIGGER_ALPHA.md', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-story-lifecycle-gateway\.js"\s*,?\s*$/m);

assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_combat_end_audit/);
assert.match(migration, /combat_id TEXT PRIMARY KEY/);
assert.match(migration, /ended_by_user_id TEXT NOT NULL/);
assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_combat_ended_story_occurrence/);
assert.match(migration, /AFTER INSERT ON runtime_combat_end_audit/);
assert.match(migration, /FROM runtime_encounter_combats rec/);
assert.match(migration, /'combat_ended'/);
assert.match(migration, /'combat'/);
assert.match(migration, /NEW\.combat_id/);
assert.match(migration, /NEW\.ended_at/);
assert.match(migration, /NEW\.ended_by_user_id/);
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);
assert.doesNotMatch(migration, /UPDATE\s+encounters\s+SET/i);

assert.match(combatState, /const user = await requireGM\(request, env\)/);
assert.match(combatState, /CREATE TABLE IF NOT EXISTS runtime_combat_end_audit/);
assert.match(combatState, /const results = await env\.DB\.batch\(\[/);
assert.match(combatState, /SET status = 'ended', ended_at = \?, updated_at = \?/);
assert.match(combatState, /INSERT INTO runtime_combat_end_audit/);
assert.match(combatState, /combat_id, ended_by_user_id, ended_at, created_at/);
assert.match(combatState, /\.bind\(combatId, user\.id, now, now, combatId, now, now\)/);
assert.match(combatState, /COMBAT_END_AUDIT_FAILED/);
assert.doesNotMatch(combatState, /created_by_user_id[^\n]*ended_by_user_id/);

assert.deepEqual(normalizeStoryTrigger('combat_ended', { encounterId: 'encounter_alpha', ignored: true }), {
  encounterId: 'encounter_alpha'
});
assert.throws(() => normalizeStoryTrigger('combat_ended', {}));
assert.match(rules, /'combat_ended'/);
assert.match(rules, /type === 'encounter_activated' \|\| type === 'encounter_resolved' \|\| type === 'combat_started' \|\| type === 'combat_ended'/);

assert.match(lifecycle, /SUPPORTED_TRIGGER_TYPES = Object\.freeze\(\['encounter_activated', 'combat_started', 'combat_ended', 'encounter_resolved', 'flag_changed'\]\)/);
assert.match(lifecycle, /CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_combat_ended_story_occurrence/);
assert.match(lifecycle, /AFTER INSERT ON runtime_combat_end_audit/);
assert.match(lifecycle, /trigger_type IN \('encounter_activated', 'combat_started', 'combat_ended', 'encounter_resolved', 'flag_changed'\)/);
assert.match(lifecycle, /occurrence\.trigger_type === 'combat_started' \|\| occurrence\.trigger_type === 'combat_ended'/);
assert.match(lifecycle, /linked\.combat_status !== 'ended'/);
assert.match(lifecycle, /STORY_LIFECYCLE_COMBAT_NOT_ENDED/);
assert.match(lifecycle, /created_at <= \?/);
assert.match(lifecycle, /runtime_story_lifecycle_dispatches/);
assert.match(lifecycle, /processPendingRuntimeStoryLifecycleEvents/);
assert.doesNotMatch(lifecycle, /INSERT INTO encounter_participants/);
assert.doesNotMatch(lifecycle, /INSERT INTO encounter_combats/);
assert.doesNotMatch(lifecycle, /UPDATE\s+encounters\s+SET\s+status/i);
assert.doesNotMatch(lifecycle, /\/api\/gm\//);

assert.match(resolutionGateway, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(resolutionGateway, /combat_ended_pre_resolution/);
const preDrainIndex = resolutionGateway.indexOf("source: 'combat_ended_pre_resolution'");
const autoResolveIndex = preDrainIndex >= 0
  ? resolutionGateway.indexOf('resolution = await resolveRuntimeEncounter', preDrainIndex)
  : -1;
assert(preDrainIndex >= 0 && autoResolveIndex > preDrainIndex, 'combat_ended lifecycle must drain after Combat commit but before Encounter auto-resolution.');
assert.match(resolutionGateway, /combatEndedStoryEvents: unique\.filter\(event => event\.triggerType === 'combat_ended'\)/);
assert.match(resolutionGateway, /runtimeEncounterResolution: resolution/);
assert.match(resolutionGateway, /storyEventsTriggered/);
assert.match(resolutionGateway, /postResolutionLifecycle/);
assert.doesNotMatch(resolutionGateway, /UPDATE\s+encounters\s+SET\s+status/i);

assert.match(lifecycleGateway, /combatEndedStoryEvents/);
assert.match(lifecycleGateway, /event\?\.triggerType === 'combat_ended'/);
assert.match(lifecycleGateway, /api\\\/gm\\\/combat/);

assert.match(runner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(runner, /triggerType:\s*'combat_ended'/);
assert.match(runner, /status:\s*'active'/);
assert.match(runner, /currentHp:\s*0/);
assert.match(runner, /combatEndedStoryEvents/);
assert.match(runner, /runtimeEncounterResolution/);
assert.match(runner, /storyEventsTriggered/);
assert.match(runner, /Definition status/);
assert.match(runner, /Definition roster/);
assert.match(runner, /legacy Definition Combat/);
assert.match(runner, /bestEffortFailureCleanup/);
assert.match(orchestrator, /production-alpha-story-combat-ended-e2e\.mjs/);
assert.match(orchestrator, /'story-combat-ended'/);

assert.match(canonical, /Combat commit → `combat_ended` Story → Encounter auto-resolution → `encounter_resolved` Story/);
assert.match(canonical, /actual GM\/Admin who ended the Combat/);
assert.match(canonical, /Runtime Encounter is still `active`/);
assert.match(canonical, /Definition isolation/);
assert.match(canonical, /idempot/i);

console.log('Durable combat_ended Story lifecycle, authority, ordering and production coverage contract passed.');
