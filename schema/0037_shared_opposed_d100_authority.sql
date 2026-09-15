-- Shared Opposed D100 Authority — Alpha
-- Links two immutable Basic Skill D100 checks into one atomic opposed resolution.

CREATE TABLE IF NOT EXISTS basic_skill_opposed_check_log (
  id TEXT PRIMARY KEY,
  source_check_id TEXT NOT NULL UNIQUE,
  resistance_check_id TEXT NOT NULL UNIQUE,
  source_character_id TEXT NOT NULL,
  resistance_character_id TEXT NOT NULL,
  comparison TEXT NOT NULL,
  source_strictly_breaks_resistance INTEGER NOT NULL,
  resistance_priority_on_tie INTEGER NOT NULL,
  meaningful_reason TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK (comparison IN ('SOURCE_HIGHER','RESISTANCE_HIGHER','TIE')),
  CHECK (source_strictly_breaks_resistance IN (0,1)),
  CHECK (resistance_priority_on_tie IN (0,1)),
  FOREIGN KEY (source_check_id) REFERENCES character_skill_check_log(id) ON DELETE RESTRICT,
  FOREIGN KEY (resistance_check_id) REFERENCES character_skill_check_log(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (resistance_character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_basic_skill_opposed_source
ON basic_skill_opposed_check_log(source_character_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_basic_skill_opposed_resistance
ON basic_skill_opposed_check_log(resistance_character_id, created_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_basic_skill_opposed_check_log_no_update
BEFORE UPDATE ON basic_skill_opposed_check_log
BEGIN
  SELECT RAISE(ABORT, 'OPPOSED_D100_AUDIT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_basic_skill_opposed_check_log_no_delete
BEFORE DELETE ON basic_skill_opposed_check_log
BEGIN
  SELECT RAISE(ABORT, 'OPPOSED_D100_AUDIT_IMMUTABLE');
END;
