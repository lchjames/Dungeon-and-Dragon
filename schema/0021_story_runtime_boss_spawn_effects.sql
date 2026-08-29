CREATE TABLE IF NOT EXISTS runtime_story_boss_spawn_effects (
  scene_run_id TEXT NOT NULL,
  story_event_id TEXT NOT NULL,
  effect_index INTEGER NOT NULL CHECK (effect_index >= 0),
  map_instance_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  boss_instance_id TEXT NOT NULL UNIQUE,
  profile_id TEXT NOT NULL,
  source_spawn_point_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (scene_run_id, story_event_id, effect_index),
  FOREIGN KEY (scene_run_id, encounter_id)
    REFERENCES runtime_encounter_states(scene_run_id, encounter_id) ON DELETE CASCADE,
  FOREIGN KEY (map_instance_id)
    REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (boss_instance_id)
    REFERENCES boss_instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runtime_story_spawn_boss
  ON runtime_story_boss_spawn_effects(boss_instance_id);

CREATE INDEX IF NOT EXISTS idx_runtime_story_boss_spawn_map
  ON runtime_story_boss_spawn_effects(map_instance_id, created_at);
