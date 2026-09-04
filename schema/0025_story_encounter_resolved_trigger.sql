PRAGMA foreign_keys = ON;

-- Runtime Encounter resolution already owns the authoritative transition audit.
-- The durable Story occurrence is derived from that exact audit row, not from a later HTTP callback.
CREATE TRIGGER IF NOT EXISTS trg_runtime_encounter_resolved_story_occurrence
AFTER INSERT ON runtime_encounter_resolution_log
WHEN NEW.to_status = 'resolved' AND NEW.resolved_by_user_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO runtime_story_lifecycle_occurrences (
    id, scene_run_id, trigger_type, subject_type, subject_id,
    source_at, actor_user_id, lease_token, lease_at, completed_at,
    created_at, updated_at
  ) VALUES (
    'story_lifecycle_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    'encounter_resolved',
    'encounter_resolution',
    NEW.id,
    NEW.created_at,
    NEW.resolved_by_user_id,
    NULL,
    NULL,
    NULL,
    NEW.created_at,
    NEW.created_at
  );
END;
