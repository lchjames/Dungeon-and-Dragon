import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../src/world-map-editor.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-map-editor.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/gm-map-editor.css', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(server, /import baseWorker from '\.\/world-map\.js';/);
assert.match(server, /\/api\/gm\/world\/maps\/\(\[\^\/\]\+\)\\\/editor/);
assert.match(server, /request\.method === 'GET'/);
assert.match(server, /request\.method === 'PUT'/);
assert.match(server, /validOrigin\(request\)/);
assert.match(server, /GM_ROLES = new Set\(\['gm', 'admin'\]\)/);
assert.match(server, /expectedVersion/);
assert.match(server, /MAP_TEMPLATE_CHANGED/);
assert.match(server, /canonicalEdgeCoordinate/);
assert.match(server, /direction === 'E'/);
assert.match(server, /direction === 'S'/);
assert.match(server, /SPAWN_ON_BLOCKED_CELL/);
assert.match(server, /FROM json_each\(\?\)/);
assert.match(server, /JOIN json_each\(json_extract\(zone\.value, '\$\.cells'\)\) AS cell/);
assert.match(server, /env\.DB\.batch\(/);
assert.match(server, /SET version = version \+ 1/);
assert.doesNotMatch(server, /DROP TABLE/);
assert.doesNotMatch(server, /eval\(/);
assert.doesNotMatch(server, /new Function/);

assert.match(ui, /STRUCTURED MAP EDITOR/);
assert.match(ui, /data-map-tool="select"/);
assert.match(ui, /data-map-tool="blocked"/);
assert.match(ui, /data-map-tool="walkable"/);
assert.match(ui, /data-map-tool="zone"/);
assert.match(ui, /data-map-tool="spawn"/);
assert.match(ui, /Edit Grid/);
assert.match(ui, /canonicalEdgeSlot/);
assert.match(ui, /edge_\$\{crypto\.randomUUID\(\)\}/);
assert.match(ui, /zone_\$\{crypto\.randomUUID\(\)\}/);
assert.match(ui, /spawn_\$\{crypto\.randomUUID\(\)\}/);
assert.match(ui, /MAP_TEMPLATE_CHANGED/);
assert.match(ui, /\/api\/gm\/world\/maps\/\$\{encodeURIComponent\(editorState\.mapTemplate\.id\)\}\/editor/);
assert.match(ui, /MutationObserver/);
assert.match(loader, /import '\.\/gm-map-editor\.js';/);

assert.match(css, /\.map-editor-grid/);
assert.match(css, /\.map-editor-cell\.blocked/);
assert.match(css, /\.map-editor-cell\.edge-n/);
assert.match(css, /\.map-editor-cell\.door-n/);
assert.match(css, /@media \(max-width: 900px\)/);

assert.match(wrangler, /"main"\s*:\s*"\.\/src\/world-map-editor\.js"/);
assert.match(wrangler, /"main": "\.\/src\/world-map\.js"/);

console.log('World Map structured grid editor regression passed.');
