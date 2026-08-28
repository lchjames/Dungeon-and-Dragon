PRAGMA foreign_keys = ON;

-- Durable schema for the structured Story Event runtime. Runtime code retains
-- CREATE TABLE IF NOT EXISTS guards so older production D1 databases can be
-- upgraded safely before this migration is applied explicitly.
CREATE TABLE IF NOT EXISTS story_events (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  trigger_type TEXT NOT NULL,
  trigger_json TEXT NOT NULL DEFAULT '{}',
  conditions_json TEXT NOT NULL DEFAULT '[]',
  effects_json TEXT NOT NULL DEFAULT '[]',
  once_per_scene_run INTEGER NOT NULL DEFAULT 1 CHECK (once_per_scene_run IN (0, 1)),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_story_flags (
  scene_run_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scene_run_id, flag_key),
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_story_narratives (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  story_event_id TEXT NOT NULL,
  narrative_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_story_event_executions (
  id TEXT PRIMARY KEY,
  story_event_id TEXT NOT NULL,
  scene_run_id TEXT NOT NULL,
  map_instance_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'failed')),
  trigger_type TEXT NOT NULL,
  effects_applied_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  error_message TEXT,
  activated_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_story_events_scene_status
  ON story_events(scene_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_runtime_story_flags_scene
  ON runtime_story_flags(scene_run_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_runtime_story_narratives_scene
  ON runtime_story_narratives(scene_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_story_exec_scene_event
  ON runtime_story_event_executions(scene_run_id, story_event_id, status, created_at);
