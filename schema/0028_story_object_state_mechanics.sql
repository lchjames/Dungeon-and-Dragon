PRAGMA foreign_keys = ON;

-- Upgrade the existing canonical Runtime Object state audit instead of creating
-- a parallel Story-only log. Interaction and GM history is preserved verbatim.
DROP TRIGGER IF EXISTS trg_runtime_object_interaction_state_log;
DROP INDEX IF EXISTS idx_runtime_object_state_object;

ALTER TABLE runtime_object_state_log RENAME TO runtime_object_state_log_legacy_0028;

CREATE TABLE runtime_object_state_log (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  map_instance_id TEXT NOT NULL,
  runtime_object_id TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  from_state_key TEXT NOT NULL,
  to_state_key TEXT NOT NULL,
  change_reason TEXT NOT NULL CHECK (change_reason IN ('interaction', 'gm_override', 'story_effect')),
  changed_by_user_id TEXT NOT NULL,
  interaction_id TEXT,
  story_event_id TEXT,
  story_effect_index INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_object_id) REFERENCES runtime_map_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (interaction_id) REFERENCES runtime_object_interaction_log(id) ON DELETE SET NULL,
  FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE SET NULL
);

INSERT INTO runtime_object_state_log (
  id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
  from_state_key, to_state_key, change_reason, changed_by_user_id,
  interaction_id, story_event_id, story_effect_index, created_at
)
SELECT
  id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
  from_state_key, to_state_key, change_reason, changed_by_user_id,
  interaction_id, NULL, NULL, created_at
FROM runtime_object_state_log_legacy_0028;

DROP TABLE runtime_object_state_log_legacy_0028;

CREATE INDEX IF NOT EXISTS idx_runtime_object_state_object
  ON runtime_object_state_log(runtime_object_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_state_log
AFTER INSERT ON runtime_object_interaction_log
WHEN NEW.from_state_key IS NOT NEW.to_state_key
BEGIN
  INSERT INTO runtime_object_state_log (
    id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
    from_state_key, to_state_key, change_reason, changed_by_user_id,
    interaction_id, story_event_id, story_effect_index, created_at
  ) VALUES (
    'runtime_object_state_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    NEW.map_instance_id,
    NEW.runtime_object_id,
    NEW.source_object_id,
    NEW.from_state_key,
    NEW.to_state_key,
    'interaction',
    NEW.actor_user_id,
    NEW.id,
    NULL,
    NULL,
    NEW.created_at
  );
END;
