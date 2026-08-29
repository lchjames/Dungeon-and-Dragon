import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gateway = await readFile(new URL('../src/runtime-encounter-gateway.js', import.meta.url), 'utf8');
const encounterState = await readFile(new URL('../src/runtime-encounter-state.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-runtime-encounters.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/assets/gm-hostile-movement.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-encounter-gateway\.js"\s*,?\s*$/m);
assert.match(gateway, /import baseWorker from '\.\/story-zone-trigger-gateway\.js'/);
assert.match(gateway, /buildMonsterAttributes/);
assert.match(gateway, /monsterCalculatedResources/);
assert.match(gateway, /snapshotMonsterSkill/);
assert.match(gateway, /validateMonsterLevel/);

assert.ok(
  gateway.includes("pathname.match(/^\\/api\\/gm\\/world\\/runtime\\/maps\\/([^/]+)\\/encounters\\/([^/]+)\\/monsters$/)"),
  'Runtime Encounter gateway must expose the Runtime Map scoped Monster spawn route.'
);
assert.ok(
  gateway.includes("pathname.match(/^\\/api\\/gm\\/world\\/runtime\\/maps\\/([^/]+)\\/encounters\\/([^/]+)\\/start-combat$/)"),
  'Runtime Encounter gateway must expose the Runtime Map scoped Combat start route.'
);

assert.match(gateway, /sourceSpawnPointId/);
assert.match(gateway, /spawn\.spawnType !== 'any' && spawn\.spawnType !== 'monster'/);
assert.match(gateway, /runtime_map_cells/);
assert.match(gateway, /runtime_entity_positions/);
assert.match(gateway, /POSITION_OCCUPIED/);
assert.match(gateway, /INSERT INTO monster_instances/);
assert.match(gateway, /INSERT INTO monster_instance_skills/);
assert.match(gateway, /INSERT INTO runtime_encounter_participants/);
assert.match(gateway, /'runtime_spawn'/);
assert.match(gateway, /INSERT INTO runtime_entity_positions/);
assert.doesNotMatch(gateway, /INSERT INTO encounter_participants/);

assert.match(gateway, /RUNTIME_ENCOUNTER_POSITION_REQUIRED/);
assert.match(gateway, /\/api\/gm\/combat\/start/);
assert.match(gateway, /buildCombatInitiative/);
assert.match(gateway, /linkRuntimeEncounterCombat/);
assert.match(gateway, /RUNTIME_BOSS_COMBAT_NOT_READY/);
assert.doesNotMatch(gateway, /INSERT INTO encounter_combats/);
assert.doesNotMatch(gateway, /UPDATE\s+encounters\s+SET\s+status/i);
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);

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

console.log('Runtime Encounter Monster spawn, same-Map Combat and GM control contract passed.');
