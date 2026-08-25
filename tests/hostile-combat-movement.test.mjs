import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const schema = await readFile(new URL('../schema/0015_hostile_combat_movement.sql', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/hostile-combat-movement-gateway.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-hostile-movement.js', import.meta.url), 'utf8');
const uiEntry = await readFile(new URL('../public/assets/gm-runtime-doors.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(schema, /CREATE TABLE IF NOT EXISTS runtime_hostile_movement_log/);
assert.match(schema, /entity_type IN \('monster_instance', 'boss_instance'\)/);
assert.match(schema, /FOREIGN KEY \(combat_id\) REFERENCES combats\(id\) ON DELETE CASCADE/);
assert.match(schema, /FOREIGN KEY \(combatant_id\) REFERENCES combatants\(id\) ON DELETE CASCADE/);
assert.match(schema, /FOREIGN KEY \(moved_by_user_id\) REFERENCES users\(id\) ON DELETE RESTRICT/);
assert.doesNotMatch(schema, /DROP TABLE/i);
assert.doesNotMatch(schema, /DELETE FROM/i);

assert.match(gateway, /import baseWorker from '\.\/runtime-door-gateway\.js';/);
assert.match(gateway, /HOSTILE_TYPES = new Set\(\['monster_instance', 'boss_instance'\]\)/);
assert.match(gateway, /new URL\('\/api\/gm\/combat', request\.url\)/, 'Hostile gateway must initialise canonical Combat runtime before reading combatants.');
assert.match(gateway, /cb\.initiative_order = c\.current_turn_index/);
assert.match(gateway, /CURRENT_TURN_NOT_HOSTILE/);
assert.match(gateway, /MOVE_ALREADY_SPENT/);
assert.match(gateway, /HOSTILE_NOT_ACTIVE/);
assert.match(gateway, /HOSTILE_NOT_POSITIONED/);
assert.match(gateway, /MULTIPLE_ACTIVE_MAP_POSITIONS/);

for (const code of [
  'MOVE_SAME_CELL',
  'MOVE_NOT_ADJACENT',
  'MOVE_OUT_OF_BOUNDS',
  'MOVE_CELL_BLOCKED',
  'MOVE_CELL_OCCUPIED',
  'MOVE_EDGE_BLOCKED',
  'MOVE_DIAGONAL_CORNER_BLOCKED'
]) {
  assert.match(gateway, new RegExp(code), `Hostile movement must enforce ${code}.`);
}
assert.match(gateway, /Math\.max\(Math\.abs\(dx\), Math\.abs\(dy\)\) !== 1/);
assert.match(gateway, /canonicalEdgeSlot/);
assert.match(gateway, /viaHorizontal/);
assert.match(gateway, /viaVertical/);

assert.match(gateway, /UPDATE combatants\s+SET move_available = 0, updated_at = \?/s);
assert.match(gateway, /rep\.x = \? AND rep\.y = \? AND rmi\.status = 'active'/);
assert.match(gateway, /NOT EXISTS \(\s*SELECT 1 FROM runtime_entity_positions occupied/s);
assert.match(gateway, /cb\.move_available = 0 AND cb\.updated_at = \?/);
assert.match(gateway, /UPDATE runtime_entity_positions\s+SET x = \?, y = \?, placed_by_user_id = \?, updated_at = \?/s);
assert.match(gateway, /INSERT INTO runtime_hostile_movement_log/);
assert.match(gateway, /COMBAT_MAP_STATE_CHANGED/);
assert.match(gateway, /pathname === '\/api\/gm\/combat\/hostile-movement'/);
assert.match(gateway, /pathname === '\/api\/gm\/combat\/hostile-movement\/move'/);
assert.doesNotMatch(gateway, /allowOccupied/, 'Normal hostile Combat movement must not expose GM overlap override.');

assert.match(ui, /CURRENT HOSTILE MOVE/);
assert.match(ui, /existing Move allowance/);
assert.match(ui, /\/api\/gm\/combat\/hostile-movement/);
assert.match(ui, /\/api\/gm\/combat\/hostile-movement\/move/);
assert.match(ui, /data-hostile-move-x/);
assert.match(ui, /data-hostile-move-y/);
assert.match(ui, /location\.replace\(`\/gm\/login\/\?next=/);
assert.match(ui, /setInterval/);
assert.match(uiEntry, /import '\.\/gm-hostile-movement\.js';/);

assert.match(wrangler, /"main"\s*:\s*"\.\/src\/hostile-combat-movement-gateway\.js"/);
assert.match(wrangler, /"main": "\.\/src\/runtime-door-gateway\.js"/);

// Verify the audit schema works with real SQLite FK semantics and rejects
// non-hostile entity types at the database boundary.
const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE users (id TEXT PRIMARY KEY);
  CREATE TABLE runtime_map_instances (id TEXT PRIMARY KEY);
  CREATE TABLE combats (id TEXT PRIMARY KEY);
  CREATE TABLE combatants (id TEXT PRIMARY KEY, combat_id TEXT NOT NULL,
    FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE);
  INSERT INTO users (id) VALUES ('gm_test');
  INSERT INTO runtime_map_instances (id) VALUES ('map_test');
  INSERT INTO combats (id) VALUES ('combat_test');
  INSERT INTO combatants (id, combat_id) VALUES ('combatant_test', 'combat_test');
`);
db.exec(schema);
const insert = db.prepare(`
  INSERT INTO runtime_hostile_movement_log (
    id, map_instance_id, entity_type, entity_id, combat_id, combatant_id,
    combat_round_number, from_x, from_y, to_x, to_y, moved_by_user_id, created_at
  ) VALUES (?, 'map_test', ?, ?, 'combat_test', 'combatant_test', 1, 0, 0, 1, 0, 'gm_test', 1)
`);
insert.run('move_monster', 'monster_instance', 'monster_1');
insert.run('move_boss', 'boss_instance', 'boss_1');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runtime_hostile_movement_log').get().n, 2);
assert.throws(() => insert.run('move_character', 'character', 'char_1'), /CHECK constraint failed/);
db.close();

console.log('Hostile Combat movement regression passed.');
