PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  status TEXT NOT NULL DEFAULT 'active',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  template TEXT NOT NULL DEFAULT 'generic',
  portrait_url TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS character_attributes (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  key TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_resources (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  key TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  current_value REAL NOT NULL DEFAULT 0,
  max_value REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_inventory (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_abilities (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Ability',
  description TEXT NOT NULL DEFAULT '',
  proficient INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_characters_owner ON characters(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_attributes_character ON character_attributes(character_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_resources_character ON character_resources(character_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_inventory_character ON character_inventory(character_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_abilities_character ON character_abilities(character_id, sort_order);

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('campaign_name', 'D&D Campaign', 0);
