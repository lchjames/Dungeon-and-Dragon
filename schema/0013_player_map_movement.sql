PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_exploration_state (
  map_instance_id TEXT PRIMARY KEY,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_exploration_character_state (
  map_instance_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  action_available INTEGER NOT NULL DEFAULT 1 CHECK (action_available IN (0, 1)),
  move_available INTEGER NOT NULL DEFAULT 1 CHECK (move_available IN (0, 1)),
  turn_completed INTEGER NOT NULL DEFAULT 0 CHECK (turn_completed IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (map_instance_id, character_id),
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_movement_log (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type = 'character'),
  entity_id TEXT NOT NULL,
  from_x INTEGER NOT NULL,
  from_y INTEGER NOT NULL,
  to_x INTEGER NOT NULL,
  to_y INTEGER NOT NULL,
  movement_mode TEXT NOT NULL CHECK (movement_mode IN ('exploration', 'combat')),
  exploration_round_number INTEGER,
  combat_id TEXT,
  combat_round_number INTEGER,
  actor_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_exploration_character_round
  ON runtime_exploration_character_state(map_instance_id, round_number, turn_completed, character_id);
CREATE INDEX IF NOT EXISTS idx_runtime_movement_entity
  ON runtime_movement_log(entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_movement_map
  ON runtime_movement_log(map_instance_id, created_at);
