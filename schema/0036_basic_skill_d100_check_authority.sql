-- Basic Skill D100 Check + Great-Success Growth Eligibility Authority — Alpha
-- Records GM-recognized meaningful checks. Great Success creates an immutable pending growth marker only.

CREATE TABLE IF NOT EXISTS character_skill_check_log (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_key TEXT NOT NULL,
  skill_label TEXT NOT NULL,
  natural_skill_value INTEGER NOT NULL,
  total_modifier INTEGER NOT NULL,
  effective_skill_value INTEGER NOT NULL,
  raw_roll INTEGER NOT NULL,
  result_value INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  extreme_result TEXT NOT NULL,
  roll_source TEXT NOT NULL,
  meaningful_reason TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK (natural_skill_value BETWEEN 0 AND 98),
  CHECK (raw_roll BETWEEN 1 AND 100),
  CHECK (passed IN (0,1)),
  CHECK (extreme_result IN ('NONE','GREAT_SUCCESS','GREAT_FAILURE')),
  CHECK (roll_source IN ('SERVER','GM_ENTRY')),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES character_skills(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_character_skill_check_log_character
ON character_skill_check_log(character_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_character_skill_check_log_skill
ON character_skill_check_log(character_id, skill_key, created_at DESC, id);

CREATE TABLE IF NOT EXISTS character_skill_growth_eligibility_log (
  id TEXT PRIMARY KEY,
  skill_check_id TEXT NOT NULL UNIQUE,
  character_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_key TEXT NOT NULL,
  growth_status TEXT NOT NULL DEFAULT 'PENDING_BALANCE',
  growth_progress_before REAL NOT NULL,
  growth_progress_after REAL,
  skill_value_before INTEGER NOT NULL,
  skill_value_after INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (growth_status IN ('PENDING_BALANCE')),
  CHECK (skill_value_before BETWEEN 0 AND 98),
  FOREIGN KEY (skill_check_id) REFERENCES character_skill_check_log(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES character_skills(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_character_skill_growth_eligibility_character
ON character_skill_growth_eligibility_log(character_id, created_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_character_skill_check_log_no_update
BEFORE UPDATE ON character_skill_check_log
BEGIN
  SELECT RAISE(ABORT, 'BASIC_SKILL_CHECK_AUDIT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_character_skill_check_log_no_delete
BEFORE DELETE ON character_skill_check_log
BEGIN
  SELECT RAISE(ABORT, 'BASIC_SKILL_CHECK_AUDIT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_character_skill_growth_eligibility_no_update
BEFORE UPDATE ON character_skill_growth_eligibility_log
BEGIN
  SELECT RAISE(ABORT, 'BASIC_SKILL_GROWTH_AUDIT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_character_skill_growth_eligibility_no_delete
BEFORE DELETE ON character_skill_growth_eligibility_log
BEGIN
  SELECT RAISE(ABORT, 'BASIC_SKILL_GROWTH_AUDIT_IMMUTABLE');
END;
