import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../schema/0013_player_map_movement.sql', import.meta.url), 'utf8');
const server = await readFile(new URL('../src/player-map.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/player-map.js', import.meta.url), 'utf8');
const mount = await readFile(new URL('../public/assets/player-map-ui.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/player-map.css', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../public/player/index.html', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

for (const table of [
  'runtime_exploration_state',
  'runtime_exploration_character_state',
  'runtime_movement_log'
]) {
  assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `Schema must define ${table}.`);
  assert.match(server, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `Runtime guard must define ${table}.`);
}

assert.match(schema, /action_available INTEGER NOT NULL DEFAULT 1/);
assert.match(schema, /move_available INTEGER NOT NULL DEFAULT 1/);
assert.match(schema, /turn_completed INTEGER NOT NULL DEFAULT 0/);
assert.match(schema, /movement_mode IN \('exploration', 'combat'\)/);

assert.match(server, /import baseWorker from '\.\/runtime-map\.js';/);
assert.match(server, /loadCharacterLifeState/);
assert.match(server, /pathname === '\/api\/player\/world'/);
assert.match(server, /\/move\$\//);
assert.match(server, /\/consume-action\$\//);
assert.match(server, /\/end-exploration-turn\$\//);
assert.match(server, /Math\.max\(Math\.abs\(dx\), Math\.abs\(dy\)\) !== 1/);
assert.match(server, /MOVE_SAME_CELL/);
assert.match(server, /MOVE_NOT_ADJACENT/);
assert.match(server, /MOVE_CELL_BLOCKED/);
assert.match(server, /MOVE_CELL_OCCUPIED/);
assert.match(server, /MOVE_EDGE_BLOCKED/);
assert.match(server, /MOVE_DIAGONAL_CORNER_BLOCKED/);
assert.match(server, /viaHorizontal/);
assert.match(server, /viaVertical/);
assert.match(server, /canonicalEdgeSlot/);
assert.match(server, /cb\.move_available = 1/);
assert.match(server, /UPDATE combatants SET move_available = 0/);
assert.match(server, /runtime_exploration_character_state/);
assert.match(server, /SET move_available = 0, updated_at = \?/);
assert.match(server, /NOT EXISTS \(SELECT 1 FROM combats WHERE status = 'active'\)/);
assert.match(server, /CHARACTER_CANNOT_MOVE/);
assert.match(server, /MULTIPLE_ACTIVE_MAP_POSITIONS/);
assert.match(server, /position\.visibilityMode !== 'hidden'/);
assert.match(server, /position\.visibilityMode === 'visible'/);
assert.match(server, /edge\.doorState === 'locked' \? 'closed'/);
assert.doesNotMatch(server, /gmNotes:/, 'Player Map API must not serialise GM notes.');
assert.doesNotMatch(server, /runtime_map_spawn_points/, 'Player Map API must not expose GM spawn-point data.');
assert.doesNotMatch(server, /allowOccupied/, 'Players must not receive the GM overlap override.');

assert.match(mount, /CURRENT WORLD/);
assert.match(mount, /Location & Map/);
assert.match(mount, /Server-authoritative 9-grid movement/);
assert.match(mount, /End Exploration Turn/);
assert.match(mount, /Highlighted cells are the legal destinations/);
assert.match(mount, /await import\('\.\/player-map\.js'\)/);
assert.match(playerHtml, /\/assets\/player-map-ui\.js/);

assert.match(ui, /\/api\/player\/world/);
assert.match(ui, /\/move`/);
assert.match(ui, /legalMoves/);
assert.match(ui, /data-player-map-cell/);
assert.match(ui, /Move spent/);
assert.match(ui, /end-exploration-turn/);
assert.match(ui, /location\.replace\(`\/player\/login\/\?next=/);

assert.match(css, /\.player-map-grid/);
assert.match(css, /\.player-map-cell\.legal-move/);
assert.match(css, /\.player-map-cell\.blocked/);
assert.match(css, /\.player-map-token\.own/);
assert.match(css, /@media \(max-width: 980px\)/);

assert.match(wrangler, /"main"\s*:\s*"\.\/src\/player-map\.js"/);
assert.match(wrangler, /"main": "\.\/src\/runtime-map\.js"/);

console.log('Player Map 9-grid movement regression passed.');
