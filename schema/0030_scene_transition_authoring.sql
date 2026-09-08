PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scene_transition_definitions (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  from_scene_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  transition_mode TEXT NOT NULL CHECK (transition_mode IN ('next_scene', 'complete_scenario')),
  to_scene_id TEXT,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  carry_flag_keys_json TEXT NOT NULL DEFAULT '[]',
  carry_characters INTEGER NOT NULL DEFAULT 1 CHECK (carry_characters IN (0, 1)),
  target_source_spawn_point_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  gm_notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (from_scene_id, name),
  CHECK (
    (transition_mode = 'next_scene' AND to_scene_id IS NOT NULL)
    OR
    (transition_mode = 'complete_scenario' AND to_scene_id IS NULL AND carry_characters = 0 AND target_source_spawn_point_id IS NULL)
  ),
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
  FOREIGN KEY (from_scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_scene_id) REFERENCES scenes(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_scene_transition_definition_links (
  transition_id TEXT PRIMARY KEY,
  definition_id TEXT,
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  definition_snapshot_json TEXT NOT NULL,
  linked_by_user_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  FOREIGN KEY (transition_id) REFERENCES runtime_scene_transition_log(id) ON DELETE RESTRICT,
  FOREIGN KEY (definition_id) REFERENCES scene_transition_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_scene_transition_definitions_source
  ON scene_transition_definitions(from_scene_id, status, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_scene_transition_definitions_destination
  ON scene_transition_definitions(to_scene_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_scene_transition_definitions_scenario
  ON scene_transition_definitions(scenario_id, status, updated_at);
