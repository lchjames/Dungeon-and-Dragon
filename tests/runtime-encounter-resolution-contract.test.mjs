import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoryTrigger, normalizeStoryEventStructure } from '../src/story-event-rules.js';

const migration = await readFile(new URL('../schema/0020_runtime_encounter_resolution.sql', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/runtime-encounter-resolution.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/runtime-encounter-resolution-gateway.js', import.meta.url), 'utf8');
const story = await readFile(new URL('../src/encounter-resolved-story.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-runtime-resolution.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/assets/gm-hostile-movement.js', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-runtime-resolution-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/RUNTIME_ENCOUNTER_RESOLUTION_ALPHA.md', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-encounter-resolution-gateway\.js"\s*,?\s*$/m);

assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_encounter_resolution_log/);
assert.match(migration, /resolution_source TEXT NOT NULL CHECK \(resolution_source IN \('combat_hostiles_cleared', 'gm_manual'\)\)/);
assert.match(migration, /FOREIGN KEY \(scene_run_id, encounter_id\) REFERENCES runtime_encounter_states/);
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);

assert.match(service, /TERMINAL_HOSTILE_STATUSES = new Set\(\['defeated', 'removed'\]\)/);
assert.match(service, /entity_type IN \('monster_instance', 'boss_instance'\)/);
assert.match(service, /participants\.filter\(row => row\.entity_type === 'monster_instance'\)/);
assert.match(service, /participants\.filter\(row => row\.entity_type === 'boss_instance'\)/);
assert.match(service, /hostiles\.length > 0 && blockers\.length === 0/);
assert.match(service, /reason:\s*readiness\.hostileCount === 0 \? 'NO_HOSTILE_PARTICIPANTS' : 'HOSTILES_REMAIN'/);
assert.match(service, /source = 'gm_manual'/);
assert.match(service, /requireHostilesCleared = false/);
assert.match(service, /RUNTIME_ENCOUNTER_COMBAT_ACTIVE/);
assert.match(service, /status = 'resolved'/);
assert.match(service, /resolved_at = COALESCE\(resolved_at, \?\)/);
assert.match(service, /INSERT INTO runtime_encounter_resolution_log/);
assert.doesNotMatch(service, /UPDATE\s+encounters\s+SET\s+status/i);
assert.doesNotMatch(service, /INSERT INTO encounter_combats/);
assert.doesNotMatch(service, /DELETE FROM encounter_participants/i);

assert.match(gateway, /import baseWorker from '\.\/runtime-encounter-gateway\.js'/);
assert.match(gateway, /handleManualResolve/);
assert.match(gateway, /source:\s*'gm_manual'/);
assert.match(gateway, /requireHostilesCleared:\s*false/);
assert.match(gateway, /handleCombatEnd/);
assert.match(gateway, /source:\s*'combat_hostiles_cleared'/);
assert.match(gateway, /requireHostilesCleared:\s*true/);
assert.match(gateway, /const response = await baseWorker\.fetch\(request, env\)/, 'Combat End must commit through the existing Combat authority first.');
assert.match(gateway, /runtimeEncounterResolutionWarning/);
assert.match(gateway, /storyTriggerWarning/);
assert.match(gateway, /enrichRuntimeDetail/);
assert.match(gateway, /resolution:\s*\{/);
assert.doesNotMatch(gateway, /UPDATE\s+encounters\s+SET\s+status/i);
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);

assert.deepEqual(normalizeStoryTrigger('encounter_resolved', { encounterId: 'encounter_alpha', ignored: true }), {
  encounterId: 'encounter_alpha'
});
assert.throws(() => normalizeStoryTrigger('encounter_resolved', {}));
const resolvedStructure = normalizeStoryEventStructure({
  triggerType: 'encounter_resolved',
  trigger: { encounterId: 'encounter_alpha' },
  conditions: [{ type: 'encounter_status', encounterId: 'encounter_alpha', status: 'resolved' }],
  effects: [{ type: 'set_flag', key: 'encounter.alpha.resolved', value: true }]
});
assert.deepEqual(resolvedStructure.trigger, { encounterId: 'encounter_alpha' });
assert.equal(resolvedStructure.triggerType, 'encounter_resolved');

assert.match(story, /trigger_type = 'encounter_resolved'/);
assert.match(story, /normalizeStoryTrigger\('encounter_resolved'/);
assert.match(story, /trigger\.encounterId !== encounterId/);
assert.match(story, /evaluateStoryConditions/);
assert.match(story, /runtime_story_event_executions/);
assert.match(story, /spawnRuntimeMonster/);
assert.match(story, /startRuntimeEncounterCombat/);
assert.doesNotMatch(story, /eval\s*\(/);
assert.doesNotMatch(story, /new Function\s*\(/);

assert.match(loader, /import '\.\/gm-runtime-resolution\.js'/);
assert.match(ui, /<h3>Resolve & Continue Scene<\/h3>/);
assert.match(ui, /Combat ending and Encounter resolution are separate states/);
assert.match(ui, /id="runtime-resolution-manual"/);
assert.match(ui, /Resolve Encounter/);
assert.match(ui, /combatStatus === 'active'/);
assert.match(ui, /\/encounters\/\$\{encodeURIComponent\(encounter\.encounterId\)\}\/resolve/);
assert.match(ui, /readiness\.cleared/);
assert.match(ui, /blocker/);
assert.doesNotMatch(ui, /eval\s*\(/);

assert.match(runner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(runner, /AUTO_ENCOUNTER_NAME/);
assert.match(runner, /MANUAL_ENCOUNTER_NAME/);
assert.match(runner, /triggerType:\s*'encounter_resolved'/);
assert.match(runner, /status:\s*'resolved'/);
assert.match(runner, /currentHp:\s*0/);
assert.match(runner, /stored\?\.status === 'defeated'/);
assert.match(runner, /source === 'combat_hostiles_cleared'/);
assert.match(runner, /reason === 'HOSTILES_REMAIN'/);
assert.match(runner, /source === 'gm_manual'/);
assert.match(runner, /Definition status/);
assert.match(runner, /Definition participant roster/);
assert.match(runner, /legacy Definition Combat link/);
assert.match(runner, /bestEffortFailureCleanup/);
assert.match(orchestrator, /production-alpha-runtime-resolution-e2e\.mjs/);
assert.match(orchestrator, /'runtime-encounter-resolution'/);

assert.match(canonical, /Combat End != Encounter Resolved/);
assert.match(canonical, /zero hostile participants does not auto-resolve/i);
assert.match(canonical, /Manual resolution intentionally does \*\*not\*\* require all hostile instances to be defeated\/removed/);
assert.match(canonical, /encounter_resolved/);
assert.match(canonical, /Definition \/ Runtime isolation/);

console.log('Runtime Encounter resolution, post-Combat Story continuation, GM control and production runner contract passed.');
