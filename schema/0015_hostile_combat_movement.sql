PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_hostile_movement_log (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('monster_instance', 'boss_instance')),
  entity_id TEXT NOT NULL,
  combat_id TEXT NOT NULL,
  combatant_id TEXT NOT NULL,
  combat_round_number INTEGER NOT NULL,
  from_x INTEGER NOT NULL,
  from_y INTEGER NOT NULL,
  to_x INTEGER NOT NULL,
  to_y INTEGER NOT NULL,
  moved_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
  FOREIGN KEY (combatant_id) REFERENCES combatants(id) ON DELETE CASCADE,
  FOREIGN KEY (moved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runtime_hostile_movement_log_combat
  ON runtime_hostile_movement_log(combat_id, combat_round_number, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_hostile_movement_log_entity
  ON runtime_hostile_movement_log(entity_type, entity_id, created_at);
