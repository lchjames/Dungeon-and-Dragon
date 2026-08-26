import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../schema/0014_runtime_door_state.sql', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/runtime-door-gateway.js', import.meta.url), 'utf8');
const restGateway = await readFile(new URL('../src/player-rest.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-runtime-doors.js', import.meta.url), 'utf8');
const gmEntry = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(schema, /CREATE TABLE IF NOT EXISTS runtime_door_state_log/);
assert.match(schema, /from_state TEXT NOT NULL/);
assert.match(schema, /to_state TEXT NOT NULL/);
assert.match(schema, /changed_by_user_id TEXT NOT NULL/);
assert.match(schema, /FOREIGN KEY \(runtime_edge_id\) REFERENCES runtime_map_edges\(id\) ON DELETE CASCADE/);
assert.doesNotMatch(schema, /DROP TABLE/i);
assert.doesNotMatch(schema, /DELETE FROM/i);

assert.match(gateway, /import baseWorker from '\.\/player-rest\.js';/);
assert.match(restGateway, /import baseWorker from '\.\/player-map-gateway\.js';/);
assert.match(gateway, /const GM_ROLES = new Set\(\['gm', 'admin'\]\)/);
assert.match(gateway, /DOOR_STATES = new Set\(\['open', 'closed', 'locked', 'broken'\]\)/);
assert.match(gateway, /request\.method !== 'PATCH'/);
assert.match(gateway, /RUNTIME_EDGE_NOT_DOOR/);
assert.match(gateway, /RUNTIME_MAP_CLOSED/);
assert.match(gateway, /state === 'closed' \|\| state === 'locked'/);
assert.match(gateway, /SET door_state = \?, blocks_movement = \?, updated_at = \?/);
assert.match(gateway, /INSERT INTO runtime_door_state_log/);
assert.match(gateway, /RUNTIME_DOOR_STATE_CHANGED/);
assert.match(gateway, /\/door-state\$\//);
assert.doesNotMatch(gateway, /allowOccupied/);

for (const state of ['open', 'closed', 'locked', 'broken']) {
  assert.match(ui, new RegExp(`'${state}'`), `GM Door UI must expose ${state}.`);
}
assert.match(ui, /RUNTIME DOOR AUTHORITY/);
assert.match(ui, /Door state changes immediately affect server-authoritative movement/);
assert.match(ui, /does not resolve Player opening, lock-picking, keys, or Action costs/);
assert.match(ui, /\/door-state`/);
assert.match(ui, /method: 'PATCH'/);
assert.match(ui, /\/gm\/login\/\?next=/);
assert.match(ui, /#runtime-map-detail-reload/);

assert.match(gmEntry, /import '\.\/gm-runtime-doors\.js';/);
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/runtime-door-gateway\.js"/);
assert.match(wrangler, /"main": "\.\/src\/player-rest\.js"/);
assert.match(wrangler, /"main": "\.\/src\/player-map-gateway\.js"/);

console.log('Runtime Door control regression passed.');
