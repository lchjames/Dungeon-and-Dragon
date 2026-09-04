PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_story_flag_change_log (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  from_value_json TEXT,
  to_value_json TEXT NOT NULL,
  changed_by_user_id TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runtime_story_flag_change_scene
  ON runtime_story_flag_change_log(scene_run_id, flag_key, changed_at, created_at);

CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_insert_change_log
AFTER INSERT ON runtime_story_flags
BEGIN
  INSERT INTO runtime_story_flag_change_log (
    id, scene_run_id, flag_key, from_value_json, to_value_json,
    changed_by_user_id, changed_at, created_at
  ) VALUES (
    'story_flag_change_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    NEW.flag_key,
    NULL,
    NEW.value_json,
    NEW.updated_by_user_id,
    NEW.updated_at,
    NEW.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_update_change_log
AFTER UPDATE OF value_json ON runtime_story_flags
WHEN OLD.value_json IS NOT NEW.value_json
BEGIN
  INSERT INTO runtime_story_flag_change_log (
    id, scene_run_id, flag_key, from_value_json, to_value_json,
    changed_by_user_id, changed_at, created_at
  ) VALUES (
    'story_flag_change_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    NEW.flag_key,
    OLD.value_json,
    NEW.value_json,
    NEW.updated_by_user_id,
    NEW.updated_at,
    NEW.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_story_flag_changed_occurrence
AFTER INSERT ON runtime_story_flag_change_log
BEGIN
  INSERT OR IGNORE INTO runtime_story_lifecycle_occurrences (
    id, scene_run_id, trigger_type, subject_type, subject_id,
    source_at, actor_user_id, lease_token, lease_at, completed_at,
    created_at, updated_at
  ) VALUES (
    'story_lifecycle_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    'flag_changed',
    'story_flag_change',
    NEW.id,
    NEW.changed_at,
    NEW.changed_by_user_id,
    NULL,
    NULL,
    NULL,
    NEW.created_at,
    NEW.created_at
  );
END;
