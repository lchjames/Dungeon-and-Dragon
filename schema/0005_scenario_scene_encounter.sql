PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  gm_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  gm_notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('locked', 'active', 'completed')),
  map_name TEXT NOT NULL DEFAULT '',
  map_asset_ref TEXT NOT NULL DEFAULT '',
  map_gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'resolved', 'skipped')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  trigger_notes TEXT NOT NULL DEFAULT '',
  gm_notes TEXT NOT NULL DEFAULT '',
  resolution_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS encounter_participants (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'monster_instance', 'boss_instance')),
  entity_id TEXT NOT NULL,
  display_name_snapshot TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(encounter_id, entity_type, entity_id),
  FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS encounter_combats (
  encounter_id TEXT PRIMARY KEY,
  combat_id TEXT NOT NULL UNIQUE,
  linked_at INTEGER NOT NULL,
  FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scenarios_status_order ON scenarios(status, sort_order, updated_at);
CREATE INDEX IF NOT EXISTS idx_scenes_scenario_order ON scenes(scenario_id, sort_order, updated_at);
CREATE INDEX IF NOT EXISTS idx_encounters_scene_order ON encounters(scene_id, sort_order, updated_at);
CREATE INDEX IF NOT EXISTS idx_encounter_participants_encounter ON encounter_participants(encounter_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_encounter_combats_combat ON encounter_combats(combat_id);
