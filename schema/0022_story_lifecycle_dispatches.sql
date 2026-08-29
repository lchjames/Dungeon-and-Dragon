PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_story_lifecycle_occurrences (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  source_at INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL,
  lease_token TEXT,
  lease_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (scene_run_id, trigger_type, subject_id),
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_story_lifecycle_dispatches (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL,
  story_event_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'failed', 'skipped')),
  execution_id TEXT,
  result_code TEXT,
  result_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (occurrence_id, story_event_id),
  FOREIGN KEY (occurrence_id) REFERENCES runtime_story_lifecycle_occurrences(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_story_lifecycle_pending
  ON runtime_story_lifecycle_occurrences(scene_run_id, trigger_type, completed_at, source_at);
CREATE INDEX IF NOT EXISTS idx_story_lifecycle_dispatch_occurrence
  ON runtime_story_lifecycle_dispatches(occurrence_id, status, created_at);
