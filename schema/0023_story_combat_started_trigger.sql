PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_combat_started_story_occurrence
AFTER INSERT ON runtime_encounter_combats
BEGIN
  INSERT OR IGNORE INTO runtime_story_lifecycle_occurrences (
    id, scene_run_id, trigger_type, subject_type, subject_id,
    source_at, actor_user_id, lease_token, lease_at, completed_at,
    created_at, updated_at
  )
  SELECT
    'story_lifecycle_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    'combat_started',
    'combat',
    NEW.combat_id,
    COALESCE(c.started_at, NEW.linked_at),
    NEW.linked_by_user_id,
    NULL,
    NULL,
    NULL,
    NEW.linked_at,
    NEW.linked_at
  FROM combats c
  WHERE c.id = NEW.combat_id;
END;
