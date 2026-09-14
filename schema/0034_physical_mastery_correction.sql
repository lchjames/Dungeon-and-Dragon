PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS character_physical_masteries (
  character_id TEXT NOT NULL,
  mastery_type TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  progression_exp INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (character_id, mastery_type),
  CHECK (rank BETWEEN 0 AND 9),
  CHECK (progression_exp >= 0),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_physical_mastery_log (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  mastery_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  from_rank INTEGER NOT NULL,
  to_rank INTEGER NOT NULL,
  from_progression_exp INTEGER NOT NULL,
  to_progression_exp INTEGER NOT NULL,
  delta_progression_exp INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,
  source_name TEXT,
  reason TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK (operation IN ('SET_RANK','SET_PROGRESSION','AWARD_PROGRESSION','SET_BOTH')),
  CHECK (from_rank BETWEEN 0 AND 9),
  CHECK (to_rank BETWEEN 0 AND 9),
  CHECK (from_progression_exp >= 0),
  CHECK (to_progression_exp >= 0),
  CHECK (delta_progression_exp >= 0),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_character_physical_mastery_log_character
  ON character_physical_mastery_log(character_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_character_physical_mastery_log_mastery
  ON character_physical_mastery_log(character_id, mastery_type, created_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_character_physical_mastery_log_validate
BEFORE INSERT ON character_physical_mastery_log
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM character_physical_masteries p
    WHERE p.character_id = NEW.character_id AND p.mastery_type = NEW.mastery_type
  ) THEN RAISE(ABORT, 'PHYSICAL_MASTERY_ROW_MISSING') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM character_physical_masteries p
    WHERE p.character_id = NEW.character_id
      AND p.mastery_type = NEW.mastery_type
      AND p.rank = NEW.from_rank
      AND p.progression_exp = NEW.from_progression_exp
  ) THEN RAISE(ABORT, 'PHYSICAL_MASTERY_STALE') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_character_physical_mastery_log_apply
AFTER INSERT ON character_physical_mastery_log
BEGIN
  UPDATE character_physical_masteries
  SET rank = NEW.to_rank,
      progression_exp = NEW.to_progression_exp,
      updated_at = NEW.created_at
  WHERE character_id = NEW.character_id
    AND mastery_type = NEW.mastery_type;
END;

CREATE TRIGGER IF NOT EXISTS trg_character_physical_mastery_log_no_update
BEFORE UPDATE ON character_physical_mastery_log
BEGIN
  SELECT RAISE(ABORT, 'PHYSICAL_MASTERY_AUDIT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_character_physical_mastery_log_no_delete
BEFORE DELETE ON character_physical_mastery_log
BEGIN
  SELECT RAISE(ABORT, 'PHYSICAL_MASTERY_AUDIT_IMMUTABLE');
END;

-- PHYSICAL remains a valid Ability classification but is no longer an active
-- character_element_progression axis. Existing PHYSICAL rows are preserved as
-- historical compatibility data and ignored by canonical reads/mutations.
