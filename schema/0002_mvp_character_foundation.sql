PRAGMA foreign_keys = ON;

-- Existing production databases receive EXP as the authoritative progression value.
-- Existing Level-only rows are backfilled by src/player-create.js using the Canonical
-- threshold resolver so their visible Level is preserved.
ALTER TABLE characters ADD COLUMN exp INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS character_skills (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  natural_value INTEGER NOT NULL DEFAULT 0,
  creation_value INTEGER NOT NULL DEFAULT 0,
  sp_value INTEGER NOT NULL DEFAULT 0,
  use_growth_value INTEGER NOT NULL DEFAULT 0,
  growth_progress REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(character_id, key),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_progression (
  character_id TEXT PRIMARY KEY,
  creation_skill_points_total INTEGER NOT NULL DEFAULT 200,
  creation_skill_points_spent INTEGER NOT NULL DEFAULT 0,
  level_skill_points_earned INTEGER NOT NULL DEFAULT 0,
  level_skill_points_spent INTEGER NOT NULL DEFAULT 0,
  creation_complete INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_creation_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  attributes_json TEXT NOT NULL,
  primary_total INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_migration_flags (
  character_id TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, code),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_skills_character
  ON character_skills(character_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_creation_drafts_user
  ON character_creation_drafts(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_migration_flags_character
  ON character_migration_flags(character_id);
