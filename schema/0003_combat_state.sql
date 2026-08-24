PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS combats (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  round_number INTEGER NOT NULL DEFAULT 1,
  current_turn_index INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS combatants (
  id TEXT PRIMARY KEY,
  combat_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  controller_user_id TEXT,
  display_name TEXT NOT NULL,
  dex_snapshot REAL NOT NULL,
  initiative_order INTEGER NOT NULL,
  action_available INTEGER NOT NULL DEFAULT 1,
  move_available INTEGER NOT NULL DEFAULT 1,
  turn_completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(combat_id, entity_type, entity_id),
  UNIQUE(combat_id, initiative_order),
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
  FOREIGN KEY (controller_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_combat
  ON combats(status)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_combats_status
  ON combats(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_combatants_combat_order
  ON combatants(combat_id, initiative_order);
CREATE INDEX IF NOT EXISTS idx_combatants_controller
  ON combatants(controller_user_id, combat_id);
