PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS item_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('WEAPON','ARMOUR','ITEM')),
  item_subtype TEXT,
  description TEXT NOT NULL DEFAULT '',
  stackable INTEGER NOT NULL DEFAULT 0,
  max_stack INTEGER,
  tradeable INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  image_ref TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS weapon_definitions (
  item_definition_id TEXT PRIMARY KEY,
  weapon_group TEXT,
  linked_skill_id TEXT,
  damage_formula TEXT,
  damage_type TEXT,
  range_value REAL,
  attacks_per_round INTEGER,
  hit_modifier REAL NOT NULL DEFAULT 0,
  resource_cost TEXT,
  properties TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (item_definition_id) REFERENCES item_definitions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_definitions_type_active
  ON item_definitions(item_type, active, name);

-- character_inventory already exists in the platform foundation. Upgrade that
-- same authority in place so old Character detail readers do not become a
-- second inventory store. name/qty/notes remain compatibility mirrors only.
ALTER TABLE character_inventory ADD COLUMN item_definition_id TEXT;
ALTER TABLE character_inventory ADD COLUMN quantity INTEGER;
ALTER TABLE character_inventory ADD COLUMN is_equipped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_inventory ADD COLUMN equip_slot TEXT;
ALTER TABLE character_inventory ADD COLUMN custom_name TEXT;
ALTER TABLE character_inventory ADD COLUMN custom_description TEXT;
ALTER TABLE character_inventory ADD COLUMN condition_value REAL;
ALTER TABLE character_inventory ADD COLUMN acquired_at INTEGER;
ALTER TABLE character_inventory ADD COLUMN source TEXT;
ALTER TABLE character_inventory ADD COLUMN revision INTEGER;
ALTER TABLE character_inventory ADD COLUMN instance_metadata TEXT NOT NULL DEFAULT '{}';

-- Never silently round old prototype quantities. A fractional or negative
-- legacy row makes the migration fail instead of changing gameplay data.
CREATE TABLE _inventory_quantity_guard_0030 (
  invalid_count INTEGER NOT NULL CHECK (invalid_count = 0)
);
INSERT INTO _inventory_quantity_guard_0030 (invalid_count)
SELECT COUNT(*)
FROM character_inventory
WHERE qty < 0 OR qty != CAST(qty AS INTEGER);
DROP TABLE _inventory_quantity_guard_0030;

INSERT OR IGNORE INTO item_definitions (
  id, name, item_type, item_subtype, description, stackable, max_stack,
  tradeable, active, image_ref, created_at, updated_at, metadata
)
SELECT 'legacy_item_' || id, name, 'ITEM', 'OTHER', notes,
       1, NULL, 1, 1, NULL, 0, 0, '{"source":"legacy_character_inventory"}'
FROM character_inventory
WHERE item_definition_id IS NULL;

UPDATE character_inventory
SET item_definition_id = 'legacy_item_' || id,
    quantity = CAST(qty AS INTEGER),
    is_equipped = 0,
    equip_slot = NULL,
    custom_description = CASE WHEN notes = '' THEN NULL ELSE notes END,
    acquired_at = 0,
    source = 'legacy_migration',
    revision = 1,
    instance_metadata = '{}'
WHERE item_definition_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_character_inventory_definition
  ON character_inventory(item_definition_id, character_id);
CREATE INDEX IF NOT EXISTS idx_character_inventory_equipped
  ON character_inventory(character_id, is_equipped, equip_slot);

CREATE TABLE IF NOT EXISTS character_inventory_log (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  inventory_id TEXT NOT NULL,
  item_definition_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  from_quantity INTEGER,
  to_quantity INTEGER,
  from_equipped INTEGER,
  to_equipped INTEGER,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_character_inventory_log_character
  ON character_inventory_log(character_id, created_at);

-- Attack Profiles remain the approved numeric bridge in this slice. A nullable
-- source link makes a Profile Weapon-backed without inventing Weapon→Accuracy
-- or Weapon→Damage derivation rules that are not canonical yet.
ALTER TABLE player_attack_profiles ADD COLUMN source_inventory_id TEXT REFERENCES character_inventory(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_player_attack_profiles_source_inventory
  ON player_attack_profiles(source_inventory_id, character_id, is_active);

CREATE TABLE IF NOT EXISTS player_attack_profile_source_log (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  from_inventory_id TEXT,
  to_inventory_id TEXT,
  changed_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES player_attack_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_player_attack_profile_source_log_profile
  ON player_attack_profile_source_log(profile_id, created_at);
