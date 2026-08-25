import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../schema/0011_world_map_foundation.sql', import.meta.url), 'utf8');
const server = await readFile(new URL('../src/world-map.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-world-map.js', import.meta.url), 'utf8');
const attackProfiles = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/WORLD_MAP_STORY_RUNTIME_ALPHA.md', import.meta.url), 'utf8');

for (const table of [
  'world_locations',
  'map_templates',
  'map_cells',
  'map_edges',
  'map_zones',
  'map_zone_cells',
  'map_spawn_points',
  'scene_map_bindings'
]) {
  assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `Schema must define ${table}.`);
  assert.match(server, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `Runtime schema guard must define ${table}.`);
}

assert.match(schema, /width INTEGER NOT NULL CHECK \(width BETWEEN 1 AND 200\)/);
assert.match(schema, /height INTEGER NOT NULL CHECK \(height BETWEEN 1 AND 200\)/);
assert.match(schema, /direction IN \('N', 'E', 'S', 'W'\)/);
assert.match(schema, /edge_type IN \('wall', 'door'\)/);
assert.match(schema, /spawn_type IN \('any', 'character', 'monster', 'boss'\)/);
assert.match(schema, /scene_id TEXT PRIMARY KEY/);
assert.match(schema, /FOREIGN KEY \(map_template_id\) REFERENCES map_templates\(id\) ON DELETE RESTRICT/);

assert.match(server, /pathname === '\/api\/gm\/world-maps'/);
assert.match(server, /pathname === '\/api\/gm\/world\/locations'/);
assert.match(server, /pathname === '\/api\/gm\/world\/maps'/);
assert.match(server, /\/map-binding\$\//);
assert.match(server, /GM_ROLES = new Set\(\['gm', 'admin'\]\)/);
assert.match(server, /validOrigin\(request\)/);
assert.match(server, /MAX_MAP_DIMENSION = 200/);
assert.match(server, /MAP_RESIZE_CONFLICT/);
assert.match(server, /ON CONFLICT\(scene_id\) DO UPDATE SET/);
assert.match(server, /scene_config_json/);
assert.doesNotMatch(server, /DROP TABLE/);
assert.doesNotMatch(server, /DELETE FROM world_locations/);
assert.doesNotMatch(server, /DELETE FROM map_templates/);

assert.match(ui, /World \/ Maps/);
assert.match(ui, /Create Location/);
assert.match(ui, /Create Map Template/);
assert.match(ui, /Scene Map Binding/);
assert.match(ui, /\/api\/gm\/world-maps/);
assert.match(ui, /\/api\/gm\/scenes\/\$\{encodeURIComponent\(sceneId\)\}\/map-binding/);
assert.match(ui, /\/gm\/login\/\?next=/);
assert.match(attackProfiles, /import '\.\/gm-world-map\.js';/);

assert.match(wrangler, /"main"\s*:\s*"\.\/src\/world-map\.js"/);
assert.match(server, /import baseWorker from '\.\/live-diagnostic-gateway\.js';/);

assert.match(canonical, /World Location \/ Map Template/);
assert.match(canonical, /Runtime Map Instance/);
assert.match(canonical, /One ordinary Move/);
assert.match(canonical, /Player tokens are visible to other Players by default/);
assert.match(canonical, /Word\/story import and AI story generation are \*\*Future\*\*/);

console.log('World Map definition foundation regression passed.');
