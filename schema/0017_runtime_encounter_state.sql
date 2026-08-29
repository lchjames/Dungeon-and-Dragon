PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_encounter_states (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  definition_status_snapshot TEXT NOT NULL CHECK (definition_status_snapshot IN ('planned', 'active', 'resolved', 'skipped')),
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'resolved', 'skipped')),
  activated_by_story_event_id TEXT,
  activated_by_user_id TEXT,
  activated_at INTEGER,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (scene_run_id, encounter_id),
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE RESTRICT,
  FOREIGN KEY (activated_by_story_event_id) REFERENCES story_events(id) ON DELETE SET NULL,
  FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runtime_encounter_scene_status
  ON runtime_encounter_states(scene_run_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_runtime_encounter_definition
  ON runtime_encounter_states(encounter_id, updated_at);
