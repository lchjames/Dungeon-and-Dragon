PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_door_state_log (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  runtime_edge_id TEXT NOT NULL,
  from_state TEXT NOT NULL CHECK (from_state IN ('open', 'closed', 'locked', 'broken')),
  to_state TEXT NOT NULL CHECK (to_state IN ('open', 'closed', 'locked', 'broken')),
  changed_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_edge_id) REFERENCES runtime_map_edges(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runtime_door_state_log_edge
  ON runtime_door_state_log(runtime_edge_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_door_state_log_map
  ON runtime_door_state_log(map_instance_id, created_at);
