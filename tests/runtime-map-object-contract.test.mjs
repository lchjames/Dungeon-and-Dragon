import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../schema/0025_runtime_map_objects.sql', import.meta.url), 'utf8');
const layer = await readFile(new URL('../src/runtime-map-object-layer.js', import.meta.url), 'utf8');
const lifecycleGateway = await readFile(new URL('../src/runtime-story-lifecycle-gateway.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-map-objects.js', import.meta.url), 'utf8');
const rootUi = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/RUNTIME_MAP_OBJECTS_ALPHA.md', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-runtime-map-objects-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-story-lifecycle-gateway\.js"\s*,?\s*$/m);
assert.match(lifecycleGateway, /import baseWorker from '\.\/runtime-encounter-resolution-gateway\.js'/);
assert.match(lifecycleGateway, /import \{ createRuntimeMapObjectWorker \} from '\.\/runtime-map-object-layer\.js'/);
assert.match(lifecycleGateway, /const runtimeMapObjectWorker = createRuntimeMapObjectWorker\(baseWorker\)/);
assert.match(lifecycleGateway, /const response = await runtimeMapObjectWorker\.fetch\(request, env\)/);
assert.match(layer, /export function createRuntimeMapObjectWorker\(baseWorker\)/);

for (const source of [migration, layer]) {
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
assert.doesNotMatch(layer, /eval\s*\(/);
assert.doesNotMatch(layer, /new Function\s*\(/);

assert.match(layer, /OBJECT_ID_PATTERN = \/\^object_/);
assert.match(layer, /OBJECT_TYPE_PATTERN/);
assert.match(layer, /MAX_STATE_JSON/);
assert.match(layer, /plainObject/);
assert.match(layer, /Map Object 數量過多/);
assert.match(layer, /Interaction Range 必須為 1–20/);
assert.match(layer, /expectedVersion/);
assert.match(layer, /MAP_TEMPLATE_CHANGED/);
assert.match(layer, /version = version \+ 1/);
assert.match(layer, /DELETE FROM map_objects/);
assert.match(layer, /INSERT INTO map_objects/);
assert.match(layer, /runtimeObjects\(env, mapInstanceId\)/);
assert.match(layer, /objects: await runtimeObjects/);
assert.match(layer, /startsRuntime/);
assert.match(layer, /augmentRuntimeResponse/);
assert.match(layer, /pathname\.match\(\/\^\\\/api\\\/gm\\\/world\\\/maps\\\/\(\[\^\/\]\+\)\\\/objects\$\//);
assert.match(layer, /pathname\.match\(\/\^\\\/api\\\/gm\\\/world\\\/runtime\\\/maps\\\/\(\[\^\/\]\+\)\\\/objects\$\//);

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

assert.match(runner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(runner, /Runtime A snapshot from Definition revision 1/);
assert.match(runner, /Definition edit to revision 2 after Runtime A exists/);
assert.match(runner, /Runtime B snapshot from Definition revision 2/);
assert.match(runner, /runtimeDefinitionIsolation/);
assert.match(runner, /freshRuntimeObjectPerSceneRun/);
assert.match(orchestrator, /production-alpha-runtime-map-objects-e2e\.mjs/);
assert.match(orchestrator, /'runtime-map-objects'/);

assert.match(canonical, /Player Interaction \/ Free Action/);
assert.match(canonical, /same database transaction/);
assert.match(canonical, /no foreign key/);
assert.match(canonical, /Objects may exist on blocked Cells/);
assert.match(canonical, /Chebyshev grid distance/);
assert.match(canonical, /interact_object/);
assert.match(canonical, /free-form \/ AI interpretation/);

console.log('Runtime Map Object Definition → Runtime snapshot foundation contract passed.');
