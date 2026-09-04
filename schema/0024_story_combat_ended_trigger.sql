PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_combat_end_audit (
  combat_id TEXT PRIMARY KEY,
  ended_by_user_id TEXT NOT NULL,
  ended_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
  FOREIGN KEY (ended_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runtime_combat_end_actor
ON runtime_combat_end_audit(ended_by_user_id, ended_at);

CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_combat_ended_story_occurrence
AFTER INSERT ON runtime_combat_end_audit
BEGIN
  INSERT OR IGNORE INTO runtime_story_lifecycle_occurrences (
    id, scene_run_id, trigger_type, subject_type, subject_id,
    source_at, actor_user_id, lease_token, lease_at, completed_at,
    created_at, updated_at
  )
  SELECT
    'story_lifecycle_' || lower(hex(randomblob(16))),
    rec.scene_run_id,
    'combat_ended',
    'combat',
    NEW.combat_id,
    NEW.ended_at,
    NEW.ended_by_user_id,
    NULL,
    NULL,
    NULL,
    NEW.created_at,
    NEW.created_at
  FROM runtime_encounter_combats rec
  WHERE rec.combat_id = NEW.combat_id;
END;
