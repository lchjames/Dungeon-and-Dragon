-- Runtime Scene completion / transition authority.
-- Additive only: preserves existing Runtime Map / Scene Run history.

CREATE TABLE IF NOT EXISTS runtime_scene_transition_log (
  id TEXT PRIMARY KEY,
  scenario_run_id TEXT NOT NULL,
  from_scene_run_id TEXT NOT NULL UNIQUE,
  from_map_instance_id TEXT NOT NULL UNIQUE,
  from_scene_id TEXT NOT NULL,
  transition_mode TEXT NOT NULL CHECK (transition_mode IN ('next_scene', 'complete_scenario')),
  to_scene_run_id TEXT,
  to_map_instance_id TEXT,
  to_scene_id TEXT,
  carry_flag_keys_json TEXT NOT NULL DEFAULT '[]',
  carried_character_ids_json TEXT NOT NULL DEFAULT '[]',
  target_source_spawn_point_id TEXT,
  skipped_encounter_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_encounter_count >= 0),
  cancelled_rest_count INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_rest_count >= 0),
  actor_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (
    (transition_mode = 'next_scene' AND to_scene_run_id IS NOT NULL AND to_map_instance_id IS NOT NULL AND to_scene_id IS NOT NULL)
    OR
    (transition_mode = 'complete_scenario' AND to_scene_run_id IS NULL AND to_map_instance_id IS NULL AND to_scene_id IS NULL)
  ),
  FOREIGN KEY (scenario_run_id) REFERENCES scenario_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (from_scene_run_id) REFERENCES scene_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (from_map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE RESTRICT,
  FOREIGN KEY (from_scene_id) REFERENCES scenes(id) ON DELETE RESTRICT,
  FOREIGN KEY (to_scene_run_id) REFERENCES scene_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (to_map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE RESTRICT,
  FOREIGN KEY (to_scene_id) REFERENCES scenes(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runtime_scene_transition_scenario
  ON runtime_scene_transition_log(scenario_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_scene_transition_destination
  ON runtime_scene_transition_log(to_scene_run_id, created_at);
