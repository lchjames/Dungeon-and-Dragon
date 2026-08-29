import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stateMigration = await readFile(new URL('../schema/0017_runtime_encounter_state.sql', import.meta.url), 'utf8');
const participantMigration = await readFile(new URL('../schema/0018_runtime_encounter_participants_combat.sql', import.meta.url), 'utf8');
const helper = await readFile(new URL('../src/runtime-encounter-state.js', import.meta.url), 'utf8');
const manualGateway = await readFile(new URL('../src/story-event-gateway.js', import.meta.url), 'utf8');
const zoneGateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-story-events.js', import.meta.url), 'utf8');
const liveRunner = await readFile(new URL('../scripts/production-alpha-story-zone-e2e.mjs', import.meta.url), 'utf8');

assert.match(stateMigration, /CREATE TABLE IF NOT EXISTS runtime_encounter_states/);
assert.match(stateMigration, /UNIQUE \(scene_run_id, encounter_id\)/);
assert.match(stateMigration, /definition_status_snapshot/);
assert.match(stateMigration, /activated_by_story_event_id/);
assert.doesNotMatch(stateMigration, /DROP TABLE/i);
assert.doesNotMatch(stateMigration, /DELETE FROM/i);

for (const table of ['runtime_encounter_snapshot_meta', 'runtime_encounter_participants', 'runtime_encounter_combats']) {
  assert.match(participantMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(participantMigration, /UNIQUE \(scene_run_id, encounter_id, entity_type, entity_id\)/);
assert.match(participantMigration, /PRIMARY KEY \(scene_run_id, encounter_id\)/);
assert.match(participantMigration, /map_instance_id TEXT NOT NULL/);
assert.match(participantMigration, /source_kind TEXT NOT NULL DEFAULT 'definition_character'/);
assert.doesNotMatch(participantMigration, /DROP TABLE/i);
assert.doesNotMatch(participantMigration, /DELETE FROM/i);

assert.match(helper, /export async function ensureRuntimeEncounterRows/);
assert.match(helper, /runtime_encounter_snapshot_meta/);
assert.match(helper, /if \(materialized\) return materialized/);
assert.match(helper, /INSERT OR IGNORE INTO runtime_encounter_states/);
assert.match(helper, /INSERT OR IGNORE INTO runtime_encounter_participants/);
assert.match(helper, /ep\.entity_type = 'character'/);
assert.doesNotMatch(helper, /ep\.entity_type IN \('character', 'monster_instance', 'boss_instance'\)/, 'Definition Monster/Boss instances must not be copied across Scene Runs.');
assert.match(helper, /export async function addRuntimeEncounterParticipant/);
assert.match(helper, /sourceKind = 'runtime_spawn'/);
assert.match(helper, /export async function linkRuntimeEncounterCombat/);
assert.match(helper, /INSERT INTO runtime_encounter_combats/);
assert.match(helper, /RUNTIME_ENCOUNTER_MAP_MISMATCH/);
assert.match(helper, /RUNTIME_ENCOUNTER_COMBAT_EXISTS/);
assert.match(helper, /participants:/);
assert.match(helper, /combat:/);
assert.match(helper, /export async function activateRuntimeEncounter/);
assert.match(helper, /status = 'active'/);
assert.match(helper, /status !== 'planned'/);
assert.match(helper, /STORY_EFFECT_ENCOUNTER_CLOSED/);
assert.match(helper, /unchanged: true/);
assert.doesNotMatch(helper, /UPDATE\s+encounters\s+SET\s+status/i, 'Runtime Encounter activation must not mutate Encounter Definition status.');
assert.doesNotMatch(helper, /INSERT\s+INTO\s+encounter_combats/i, 'Runtime Encounter Combat links must not use definition-level encounter_combats.');
assert.doesNotMatch(helper, /DELETE FROM/i);

assert.match(rules, /'encounter_status'/);
assert.match(rules, /'activate_encounter'/);
assert.match(rules, /encounter_status_mismatch/);

assert.match(manualGateway, /from '\.\/runtime-encounter-state\.js'/);
assert.match(manualGateway, /loadRuntimeEncounterRows/);
assert.match(manualGateway, /runtimeEncounters/);
assert.match(manualGateway, /activateRuntimeEncounter/);
assert.match(manualGateway, /encounters/);
assert.match(manualGateway, /activate_encounter/);
assert.match(manualGateway, /pathname === '\/api\/gm\/world\/runtime\/scene-runs'/);
assert.match(manualGateway, /enrichStartedRuntime/);
assert.match(manualGateway, /RUNTIME_ENCOUNTER_SNAPSHOT_DELAYED/);
assert.doesNotMatch(manualGateway, /UPDATE\s+encounters\s+SET\s+status/i);

assert.match(zoneGateway, /from '\.\/runtime-encounter-state\.js'/);
assert.match(zoneGateway, /loadRuntimeEncounterMap/);
assert.match(zoneGateway, /activateRuntimeEncounter/);
assert.match(zoneGateway, /encounters: shared\.encounters/);
assert.match(zoneGateway, /activate_encounter/);
assert.doesNotMatch(zoneGateway, /UPDATE\s+encounters\s+SET\s+status/i);

assert.match(gmUi, /Manual GM and automatic enter_zone execution are live/);
assert.match(gmUi, /detail\.runtimeEncounters/);
assert.match(gmUi, /Encounter · \$\{escapeHtml\(encounter\.encounterId\)\}/);
assert.match(gmUi, /definition snapshot/);
assert.match(gmUi, /Encounter Definition <code>encounterId<\/code>/);

assert.match(liveRunner, /status:\s*'planned'/);
assert.match(liveRunner, /encounter_status/);
assert.match(liveRunner, /activate_encounter/);
assert.match(liveRunner, /runtimeEncounters/);
assert.match(liveRunner, /Runtime Encounter did not persist active/);
assert.match(liveRunner, /Encounter Definition status was polluted by Runtime activation/);
assert.match(liveRunner, /definitionRuntimeIsolation/);

console.log('Per-Scene-Run Encounter state, participant and Combat-link contract passed.');
