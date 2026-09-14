PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS character_element_progression_log (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  attribute_type TEXT NOT NULL,
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
  CHECK (attribute_type IN ('PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD')),
  CHECK (operation IN ('SET_RANK','SET_PROGRESSION','AWARD_PROGRESSION','SET_BOTH')),
  CHECK (from_rank BETWEEN 0 AND 9),
  CHECK (to_rank BETWEEN 0 AND 9),
  CHECK (from_progression_exp >= 0),
  CHECK (to_progression_exp >= 0),
  CHECK (delta_progression_exp >= 0),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_character_element_progression_log_character
  ON character_element_progression_log(character_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_character_element_progression_log_attribute
  ON character_element_progression_log(character_id, attribute_type, created_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_character_element_progression_log_validate
BEFORE INSERT ON character_element_progression_log
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM character_element_progression p
    WHERE p.character_id = NEW.character_id AND p.attribute_type = NEW.attribute_type
  ) THEN RAISE(ABORT, 'ELEMENT_PROGRESSION_ROW_MISSING') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM character_element_progression p
    WHERE p.character_id = NEW.character_id
      AND p.attribute_type = NEW.attribute_type
      AND p.rank = NEW.from_rank
      AND p.progression_exp = NEW.from_progression_exp
  ) THEN RAISE(ABORT, 'ELEMENT_PROGRESSION_STALE') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_character_element_progression_log_apply
AFTER INSERT ON character_element_progression_log
BEGIN
  UPDATE character_element_progression
  SET rank = NEW.to_rank,
      progression_exp = NEW.to_progression_exp,
      updated_at = NEW.created_at
  WHERE character_id = NEW.character_id
    AND attribute_type = NEW.attribute_type;
END;
