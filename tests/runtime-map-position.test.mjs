import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../schema/0012_runtime_map_position.sql', import.meta.url), 'utf8');
const server = await readFile(new URL('../src/runtime-map.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-runtime-map.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/gm-runtime-map.css', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

for (const table of [
  'scenario_runs',
  'scene_runs',
  'runtime_map_instances',
  'runtime_map_cells',
  'runtime_map_edges',
  'runtime_map_zones',
  'runtime_map_zone_cells',
  'runtime_map_spawn_points',
  'runtime_entity_positions'
]) {
  assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `Schema must define ${table}.`);
  assert.match(server, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `Runtime guard must define ${table}.`);
}

assert.match(schema, /source_map_version INTEGER NOT NULL/);
assert.match(schema, /scene_config_json TEXT NOT NULL DEFAULT '\{\}'/);
assert.match(schema, /visibility_mode IN \('default', 'visible', 'hidden'\)/);
assert.match(schema, /entity_type IN \('character', 'monster_instance', 'boss_instance'\)/);
assert.match(schema, /UNIQUE \(map_instance_id, entity_type, entity_id\)/);

assert.match(server, /import baseWorker from '\.\/world-map-editor\.js';/);
assert.match(server, /pathname === '\/api\/gm\/world\/runtime'/);
assert.match(server, /pathname === '\/api\/gm\/world\/runtime\/scene-runs'/);
assert.match(server, /\/entities\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\\\/position/);
assert.match(server, /INSERT INTO runtime_map_cells/);
assert.match(server, /FROM map_cells WHERE map_template_id = \?/);
assert.match(server, /INSERT INTO runtime_map_edges/);
assert.match(server, /FROM map_edges WHERE map_template_id = \?/);
assert.match(server, /INSERT INTO runtime_map_zones/);
assert.match(server, /FROM map_zones WHERE map_template_id = \?/);
assert.match(server, /INSERT INTO runtime_map_spawn_points/);
assert.match(server, /FROM map_spawn_points WHERE map_template_id = \?/);
assert.match(server, /source_edge_id/);
assert.match(server, /source_zone_id/);
assert.match(server, /source_spawn_point_id/);
assert.match(server, /sceneConfigOverrides/);
assert.match(server, /config\.doors/);
assert.match(server, /config\.zoneVisibility/);
assert.match(server, /config\.spawnEnabled/);
assert.match(server, /POSITION_BLOCKED/);
assert.match(server, /MAP_POSITION_OCCUPIED/);
assert.match(server, /SPAWN_TYPE_MISMATCH/);
assert.match(server, /allowOccupied/);
assert.match(server, /ON CONFLICT\(map_instance_id, entity_type, entity_id\) DO UPDATE SET/);
assert.match(server, /Runtime Map 不存在/);
assert.doesNotMatch(server, /DROP TABLE/);
assert.doesNotMatch(server, /DELETE FROM map_templates/);
assert.doesNotMatch(server, /DELETE FROM map_cells/);

assert.match(ui, /PLAY RUNTIME/);
assert.match(ui, /Start Runtime/);
assert.match(ui, /AUTHORITATIVE RUNTIME MAP/);
assert.match(ui, /Place Entity/);
assert.match(ui, /Allow overlap \(GM override\)/);
assert.match(ui, /Place Selected at Spawn/);
assert.match(ui, /\/api\/gm\/world\/runtime\/scene-runs/);
assert.match(ui, /\/api\/gm\/world\/runtime\/maps\/\$\{encodeURIComponent\(runtimeDetailState\.mapInstance\.id\)\}\/entities/);
assert.match(ui, /data-runtime-cell/);
assert.match(ui, /location\.replace\(`\/gm\/login\/\?next=/);
assert.match(loader, /import '\.\/gm-runtime-map\.js';/);

assert.match(css, /\.runtime-map-grid/);
assert.match(css, /\.runtime-map-cell\.blocked/);
assert.match(css, /\.runtime-map-token/);
assert.match(css, /@media \(max-width: 980px\)/);

assert.match(wrangler, /"main"\s*:\s*"\.\/src\/runtime-map\.js"/);
assert.match(wrangler, /"main": "\.\/src\/world-map-editor\.js"/);

console.log('Runtime Map snapshot and position regression passed.');
