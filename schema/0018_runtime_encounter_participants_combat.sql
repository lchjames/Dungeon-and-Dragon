PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_encounter_snapshot_meta (
  scene_run_id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL,
  materialized_at INTEGER NOT NULL,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_encounter_participants (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'monster_instance', 'boss_instance')),
  entity_id TEXT NOT NULL,
  display_name_snapshot TEXT NOT NULL DEFAULT '',
  source_encounter_participant_id TEXT,
  source_kind TEXT NOT NULL DEFAULT 'definition_character' CHECK (source_kind IN ('definition_character', 'runtime_spawn', 'runtime_manual')),
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (scene_run_id, encounter_id, entity_type, entity_id),
  FOREIGN KEY (scene_run_id, encounter_id) REFERENCES runtime_encounter_states(scene_run_id, encounter_id) ON DELETE CASCADE,
  FOREIGN KEY (source_encounter_participant_id) REFERENCES encounter_participants(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_encounter_combats (
  scene_run_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  map_instance_id TEXT NOT NULL,
  combat_id TEXT NOT NULL UNIQUE,
  linked_by_user_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (scene_run_id, encounter_id),
  FOREIGN KEY (scene_run_id, encounter_id) REFERENCES runtime_encounter_states(scene_run_id, encounter_id) ON DELETE CASCADE,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runtime_encounter_snapshot_scene
  ON runtime_encounter_snapshot_meta(scene_id, materialized_at);
CREATE INDEX IF NOT EXISTS idx_runtime_encounter_participants_scene_encounter
  ON runtime_encounter_participants(scene_run_id, encounter_id, entity_type, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_encounter_participants_entity
  ON runtime_encounter_participants(entity_type, entity_id, scene_run_id);
CREATE INDEX IF NOT EXISTS idx_runtime_encounter_combats_map
  ON runtime_encounter_combats(map_instance_id, linked_at);
CREATE INDEX IF NOT EXISTS idx_runtime_encounter_combats_combat
  ON runtime_encounter_combats(combat_id);
