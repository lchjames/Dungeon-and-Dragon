import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../schema/0017_runtime_encounter_state.sql', import.meta.url), 'utf8');
const helper = await readFile(new URL('../src/runtime-encounter-state.js', import.meta.url), 'utf8');
const manualGateway = await readFile(new URL('../src/story-event-gateway.js', import.meta.url), 'utf8');
const zoneGateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const liveRunner = await readFile(new URL('../scripts/production-alpha-story-zone-e2e.mjs', import.meta.url), 'utf8');

assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_encounter_states/);
assert.match(migration, /UNIQUE \(scene_run_id, encounter_id\)/);
assert.match(migration, /definition_status_snapshot/);
assert.match(migration, /activated_by_story_event_id/);
assert.doesNotMatch(migration, /FOREIGN KEY \(activated_by_story_event_id\)/, 'Scene Run snapshots must not depend on Story schema creation order.');
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);

assert.match(helper, /export async function ensureRuntimeEncounterRows/);
assert.match(helper, /INSERT OR IGNORE INTO runtime_encounter_states/);
assert.match(helper, /FROM encounters e/);
assert.match(helper, /export async function activateRuntimeEncounter/);
assert.match(helper, /status = 'active'/);
assert.match(helper, /status !== 'planned'/);
assert.match(helper, /STORY_EFFECT_ENCOUNTER_CLOSED/);
assert.match(helper, /unchanged: true/);
assert.doesNotMatch(helper, /UPDATE\s+encounters\s+SET\s+status/i, 'Runtime Encounter activation must not mutate Encounter Definition status.');
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

assert.match(liveRunner, /status:\s*'planned'/);
assert.match(liveRunner, /encounter_status/);
assert.match(liveRunner, /activate_encounter/);
assert.match(liveRunner, /runtimeEncounters/);
assert.match(liveRunner, /Runtime Encounter did not persist active/);
assert.match(liveRunner, /Encounter Definition status was polluted by Runtime activation/);
assert.match(liveRunner, /definitionRuntimeIsolation/);

console.log('Per-Scene-Run Encounter state contract passed.');
