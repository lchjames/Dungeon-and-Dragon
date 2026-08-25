import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../public/assets/gm-combat-map-context.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/gm-combat-map-context.css', import.meta.url), 'utf8');
const entry = await readFile(new URL('../public/assets/gm-hostile-movement.js', import.meta.url), 'utf8');

assert.match(entry, /import '\.\/gm-combat-map-context\.js';/);

assert.match(ui, /COMBAT MAP CONTEXT/);
assert.match(ui, /Current Combatant Position/);
assert.match(ui, /\/api\/gm\/combat/);
assert.match(ui, /\/api\/gm\/world\/runtime/);
assert.match(ui, /\/api\/gm\/world\/runtime\/maps\//);
assert.match(ui, /combat\.currentCombatant/);
assert.match(ui, /position\.entityType === current\.entityType && position\.entityId === current\.entityId/);
assert.match(ui, /matches\.length > 1/);
assert.match(ui, /Multiple active Runtime positions/);
assert.match(ui, /Current Combatant is not positioned/);
assert.match(ui, /edgeSlotForCell/);
assert.match(ui, /doorState === 'open' \|\| edge\.doorState === 'broken'/);
assert.match(ui, /item\.entityType === 'character'/);
assert.match(ui, /item\.entityType === 'monster_instance'/);
assert.match(ui, /item\.entityType === 'boss_instance'/);
assert.match(ui, /location\.replace\(`\/gm\/login\/\?next=/);
assert.match(ui, /document\.visibilityState === 'visible'/);
assert.match(ui, /location\.hash === '#combat'/);

assert.doesNotMatch(ui, /method:\s*'POST'/, 'Combat Map context must remain read-only.');
assert.doesNotMatch(ui, /method:\s*'PATCH'/, 'Combat Map context must remain read-only.');
assert.doesNotMatch(ui, /method:\s*'PUT'/, 'Combat Map context must remain read-only.');
assert.doesNotMatch(ui, /method:\s*'DELETE'/, 'Combat Map context must remain read-only.');
assert.doesNotMatch(ui, /hostile-movement\/move/, 'Context panel must not invoke movement mutations.');
assert.doesNotMatch(ui, /door-state/, 'Context panel must not mutate Runtime Doors.');

assert.match(css, /--gm-combat-map-cell-size/);
assert.match(css, /\.gm-combat-map-grid/);
assert.match(css, /\.gm-combat-map-cell\.blocked/);
assert.match(css, /\.gm-combat-map-cell\.current/);
assert.match(css, /\.gm-combat-map-token\.current/);
assert.match(css, /\.gm-combat-map-cell\.edge-n/);
assert.match(css, /\.gm-combat-map-cell\.door-n/);
assert.match(css, /\.gm-combat-map-cell\.door-passable-n/);
assert.match(css, /@media \(max-width: 980px\)/);

console.log('GM Combat Map context regression passed.');
