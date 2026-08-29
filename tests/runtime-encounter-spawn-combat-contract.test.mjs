import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gateway = await readFile(new URL('../src/runtime-encounter-gateway.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/runtime-encounter-service.js', import.meta.url), 'utf8');
const encounterState = await readFile(new URL('../src/runtime-encounter-state.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-runtime-encounters.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/assets/gm-hostile-movement.js', import.meta.url), 'utf8');
const liveRunner = await readFile(new URL('../scripts/production-alpha-runtime-encounter-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-encounter-gateway\.js"\s*,?\s*$/m);
assert.match(gateway, /import baseWorker from '\.\/story-zone-trigger-gateway\.js'/);
assert.match(gateway, /from '\.\/runtime-encounter-service\.js'/);
assert.match(gateway, /spawnRuntimeMonster\(/);
assert.match(gateway, /startRuntimeEncounterCombat\(/);

assert.ok(
  gateway.includes("pathname.match(/^\\/api\\/gm\\/world\\/runtime\\/maps\\/([^/]+)\\/encounters\\/([^/]+)\\/monsters$/)"),
  'Runtime Encounter gateway must expose the Runtime Map scoped Monster spawn route.'
);
assert.ok(
  gateway.includes("pathname.match(/^\\/api\\/gm\\/world\\/runtime\\/maps\\/([^/]+)\\/encounters\\/([^/]+)\\/start-combat$/)"),
  'Runtime Encounter gateway must expose the Runtime Map scoped Combat start route.'
);

assert.match(service, /buildMonsterAttributes/);
assert.match(service, /monsterCalculatedResources/);
assert.match(service, /snapshotMonsterSkill/);
assert.match(service, /validateMonsterLevel/);
assert.match(service, /source_spawn_point_id/);
assert.match(service, /spawn\.spawn_type !== 'any' && spawn\.spawn_type !== 'monster'/);
assert.match(service, /runtime_map_cells/);
assert.match(service, /runtime_entity_positions/);
assert.match(service, /POSITION_OCCUPIED/);
assert.match(service, /INSERT INTO monster_instances/);
assert.match(service, /INSERT INTO monster_instance_skills/);
assert.match(service, /INSERT INTO runtime_encounter_participants/);
assert.match(service, /'runtime_spawn'/);
assert.match(service, /INSERT INTO runtime_entity_positions/);
assert.doesNotMatch(service, /INSERT INTO encounter_participants/);

assert.match(service, /RUNTIME_ENCOUNTER_POSITION_REQUIRED/);
assert.match(service, /buildCombatInitiative/);
assert.match(service, /INSERT INTO runtime_encounter_combats/);
assert.match(service, /RUNTIME_BOSS_COMBAT_NOT_READY/);
assert.match(service, /ACTIVE_COMBAT_EXISTS/);
assert.doesNotMatch(service, /\/api\/gm\/combat\/start/);
assert.doesNotMatch(service, /Cookie/);
assert.doesNotMatch(service, /INSERT INTO encounter_combats/);
assert.doesNotMatch(service, /UPDATE\s+encounters\s+SET\s+status/i);
assert.doesNotMatch(service, /eval\s*\(/);
assert.doesNotMatch(service, /new Function\s*\(/);

assert.match(encounterState, /INSERT INTO runtime_encounter_combats/);
assert.match(encounterState, /RUNTIME_ENCOUNTER_MAP_MISMATCH/);
assert.match(encounterState, /FOREIGN KEY \(scene_run_id, encounter_id\) REFERENCES runtime_encounter_states/);

assert.match(loader, /import '\.\/gm-runtime-encounters\.js'/);
assert.match(ui, /<h3>Encounter Spawn & Combat<\/h3>/);
assert.match(ui, /id="runtime-encounter-map"/);
assert.match(ui, /id="runtime-encounter-select"/);
assert.match(ui, /id="runtime-encounter-template"/);
assert.match(ui, /id="runtime-encounter-spawn"/);
assert.match(ui, /id="runtime-encounter-level"/);
assert.match(ui, /id="runtime-encounter-spawn-monster"/);
assert.match(ui, /id="runtime-encounter-start-combat"/);
assert.match(ui, /\/encounters\/\$\{encodeURIComponent\(encounter\.encounterId\)\}\/monsters/);
assert.match(ui, /\/encounters\/\$\{encodeURIComponent\(encounter\.encounterId\)\}\/start-combat/);
assert.match(ui, /NOT ON MAP/);

assert.match(liveRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(liveRunner, /sourceSpawnPointId:\s*MONSTER_SPAWN_ID/);
assert.match(liveRunner, /sourceKind === 'runtime_spawn'/);
assert.match(liveRunner, /Definition Encounter roster/);
assert.match(liveRunner, /Definition encounter_combats/);
assert.match(liveRunner, /Encounter Definition status/);
assert.match(liveRunner, /runtimeEncounter\.combat\.mapInstanceId === mapId/);
assert.match(orchestrator, /production-alpha-runtime-encounter-e2e\.mjs/);
assert.match(orchestrator, /'runtime-encounter-spawn-combat'/);

console.log('Runtime Encounter shared spawn/Combat service, GM control and production runner contract passed.');
