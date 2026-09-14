PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ability_definitions (
  id TEXT PRIMARY KEY,
  canonical_name_zh TEXT NOT NULL,
  attribute_type TEXT,
  rank_code TEXT,
  ability_type TEXT NOT NULL DEFAULT 'ABILITY',
  target_pattern TEXT,
  physical_source_category TEXT,
  description_zh TEXT NOT NULL DEFAULT '',
  mechanical_profile_json TEXT NOT NULL DEFAULT '{}',
  prerequisites_json TEXT NOT NULL DEFAULT '{}',
  library_visibility TEXT NOT NULL DEFAULT 'CAMPAIGN',
  status TEXT NOT NULL DEFAULT 'active',
  classification_status TEXT NOT NULL DEFAULT 'CLASSIFIED',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (attribute_type IS NULL OR attribute_type IN ('PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD')),
  CHECK (rank_code IS NULL OR rank_code IN ('1','2','3','4','5','6','7','8','9','SPECIAL')),
  CHECK (target_pattern IS NULL OR target_pattern IN ('SELF','SINGLE','MULTI_TARGET','AREA','LINE','CONE')),
  CHECK (library_visibility IN ('CAMPAIGN','PRIVATE')),
  CHECK (status IN ('active','inactive')),
  CHECK (classification_status IN ('CLASSIFIED','NEEDS_CLASSIFICATION')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ability_definitions_attribute_rank
  ON ability_definitions(attribute_type, rank_code, status, canonical_name_zh);
CREATE INDEX IF NOT EXISTS idx_ability_definitions_visibility
  ON ability_definitions(library_visibility, status, canonical_name_zh);

CREATE TABLE IF NOT EXISTS character_element_progression (
  character_id TEXT NOT NULL,
  attribute_type TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  progression_exp INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (character_id, attribute_type),
  CHECK (attribute_type IN ('PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD')),
  CHECK (rank BETWEEN 0 AND 9),
  CHECK (progression_exp >= 0),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_acquired_abilities (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  ability_definition_id TEXT NOT NULL,
  acquisition_mode TEXT NOT NULL,
  source_item_id TEXT,
  source_store_id TEXT,
  grant_source_type TEXT,
  grant_source_name TEXT,
  grant_note TEXT,
  granted_by_gm_id TEXT,
  acquired_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  legacy_character_ability_id TEXT UNIQUE,
  UNIQUE (character_id, ability_definition_id),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (ability_definition_id) REFERENCES ability_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (granted_by_gm_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_character_acquired_abilities_character
  ON character_acquired_abilities(character_id, acquired_at, id);
CREATE INDEX IF NOT EXISTS idx_character_acquired_abilities_definition
  ON character_acquired_abilities(ability_definition_id, character_id);

CREATE TABLE IF NOT EXISTS ability_definition_revision_history (
  id TEXT PRIMARY KEY,
  ability_definition_id TEXT NOT NULL,
  previous_profile_json TEXT,
  new_profile_json TEXT NOT NULL,
  change_source TEXT NOT NULL,
  changed_by_user_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  CHECK (change_source IN ('LEGACY_IMPORT','GM_CREATE','GM_EDIT')),
  FOREIGN KEY (ability_definition_id) REFERENCES ability_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ability_definition_revision_history_definition
  ON ability_definition_revision_history(ability_definition_id, created_at, id);

CREATE TABLE IF NOT EXISTS character_ability_grant_log (
  id TEXT PRIMARY KEY,
  character_acquired_ability_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  ability_definition_id TEXT NOT NULL,
  action TEXT NOT NULL,
  acquisition_mode TEXT NOT NULL,
  grant_source_type TEXT,
  grant_source_name TEXT,
  grant_note TEXT,
  actor_user_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK (action IN ('LEGACY_IMPORT','GM_GRANT')),
  FOREIGN KEY (character_acquired_ability_id) REFERENCES character_acquired_abilities(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (ability_definition_id) REFERENCES ability_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_character_ability_grant_log_character
  ON character_ability_grant_log(character_id, created_at, id);
