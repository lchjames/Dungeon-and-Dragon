import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../schema/0025_runtime_map_objects.sql', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/runtime-map-object-gateway.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-map-objects.js', import.meta.url), 'utf8');
const rootUi = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/RUNTIME_MAP_OBJECTS_ALPHA.md', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-map-object-gateway\.js"\s*,?\s*$/m);
assert.match(gateway, /import baseWorker from '\.\/runtime-story-lifecycle-gateway\.js'/);

for (const source of [migration, gateway]) {
  assert.match(source, /CREATE TABLE IF NOT EXISTS map_objects/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS runtime_map_objects/);
  assert.match(source, /interaction_range INTEGER NOT NULL DEFAULT 1/);
  assert.match(source, /initial_state_json TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(source, /state_json TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(source, /UNIQUE \(map_instance_id, source_object_id\)/);
  assert.match(source, /CREATE TRIGGER IF NOT EXISTS trg_runtime_map_object_snapshot/);
  assert.match(source, /AFTER INSERT ON runtime_map_instances/);
  assert.match(source, /FROM map_objects mo/);
  assert.match(source, /NEW\.map_template_id/);
}

assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);
assert.doesNotMatch(migration, /FOREIGN KEY \(source_object_id\)/, 'Runtime Object provenance must survive Definition removal.');
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);

assert.match(gateway, /OBJECT_ID_PATTERN = \/\^object_/);
assert.match(gateway, /OBJECT_TYPE_PATTERN/);
assert.match(gateway, /MAX_STATE_JSON/);
assert.match(gateway, /plainObject/);
assert.match(gateway, /Map Object 數量過多/);
assert.match(gateway, /Interaction Range 必須為 1–20/);
assert.match(gateway, /expectedVersion/);
assert.match(gateway, /MAP_TEMPLATE_CHANGED/);
assert.match(gateway, /version = version \+ 1/);
assert.match(gateway, /DELETE FROM map_objects/);
assert.match(gateway, /INSERT INTO map_objects/);
assert.match(gateway, /runtimeObjects\(env, mapInstanceId\)/);
assert.match(gateway, /objects: await runtimeObjects/);
assert.match(gateway, /\/objects\$\/\)/);
assert.match(gateway, /startsRuntime/);
assert.match(gateway, /augmentRuntimeResponse/);

assert.match(rootUi, /import '\.\/gm-map-objects\.js'/);
assert.match(ui, /MAP OBJECT LAYER/);
assert.match(ui, /Edit Objects/);
assert.match(ui, /Stable sourceObjectId/);
assert.match(ui, /Interaction Range/);
assert.match(ui, /Initial State JSON/);
assert.match(ui, /Player visible by default/);
assert.match(ui, /Enabled by default/);
assert.match(ui, /object_\$\{crypto\.randomUUID\(\)\}/);
assert.match(ui, /Save Object Layer/);
assert.match(ui, /RUNTIME OBJECT SNAPSHOTS/);
assert.match(ui, /Player interaction is the next slice/);
assert.match(ui, /\/api\/gm\/world\/runtime\/maps\/\$\{encodeURIComponent\(mapInstanceId\)\}\/objects/);

assert.match(canonical, /Player Interaction \/ Free Action/);
assert.match(canonical, /same database transaction/);
assert.match(canonical, /no foreign key/);
assert.match(canonical, /Objects may exist on blocked Cells/);
assert.match(canonical, /Chebyshev grid distance/);
assert.match(canonical, /interact_object/);
assert.match(canonical, /free-form \/ AI interpretation/);

console.log('Runtime Map Object Definition → Runtime snapshot foundation contract passed.');
