PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scenario_runs (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'aborted')),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS scene_runs (
  id TEXT PRIMARY KEY,
  scenario_run_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'aborted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (scenario_run_id) REFERENCES scenario_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_map_instances (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL UNIQUE,
  scenario_run_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  map_template_id TEXT NOT NULL,
  source_map_version INTEGER NOT NULL,
  map_name_snapshot TEXT NOT NULL,
  location_name_snapshot TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 200),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 200),
  background_asset_ref TEXT NOT NULL DEFAULT '',
  scene_config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (scenario_run_id) REFERENCES scenario_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES world_locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_map_cells (
  map_instance_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  is_walkable INTEGER NOT NULL DEFAULT 1 CHECK (is_walkable IN (0, 1)),
  terrain_key TEXT NOT NULL DEFAULT 'floor',
  gm_notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (map_instance_id, x, y),
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_map_edges (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  source_edge_id TEXT,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('N', 'E', 'S', 'W')),
  edge_type TEXT NOT NULL CHECK (edge_type IN ('wall', 'door')),
  blocks_movement INTEGER NOT NULL DEFAULT 1 CHECK (blocks_movement IN (0, 1)),
  door_state TEXT CHECK (door_state IS NULL OR door_state IN ('open', 'closed', 'locked', 'broken')),
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_instance_id, x, y, direction),
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_map_zones (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  source_zone_id TEXT,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'area' CHECK (zone_type IN ('area', 'room', 'trigger', 'custom')),
  player_visible INTEGER NOT NULL DEFAULT 1 CHECK (player_visible IN (0, 1)),
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_map_zone_cells (
  runtime_zone_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  PRIMARY KEY (runtime_zone_id, x, y),
  FOREIGN KEY (runtime_zone_id) REFERENCES runtime_map_zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_map_spawn_points (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  source_spawn_point_id TEXT,
  name TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  spawn_type TEXT NOT NULL DEFAULT 'any' CHECK (spawn_type IN ('any', 'character', 'monster', 'boss')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_instance_id, name),
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_entity_positions (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'monster_instance', 'boss_instance')),
  entity_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  visibility_mode TEXT NOT NULL DEFAULT 'default' CHECK (visibility_mode IN ('default', 'visible', 'hidden')),
  placed_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_instance_id, entity_type, entity_id),
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (placed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_scenario_runs_scenario_status ON scenario_runs(scenario_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_scene_runs_scenario_run_status ON scene_runs(scenario_run_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_scene_runs_scene ON scene_runs(scene_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_runtime_maps_status ON runtime_map_instances(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_runtime_cells_map ON runtime_map_cells(map_instance_id, y, x);
CREATE INDEX IF NOT EXISTS idx_runtime_edges_map ON runtime_map_edges(map_instance_id, y, x, direction);
CREATE INDEX IF NOT EXISTS idx_runtime_zones_map ON runtime_map_zones(map_instance_id, name);
CREATE INDEX IF NOT EXISTS idx_runtime_zone_cells_zone ON runtime_map_zone_cells(runtime_zone_id, y, x);
CREATE INDEX IF NOT EXISTS idx_runtime_spawns_map ON runtime_map_spawn_points(map_instance_id, spawn_type, name);
CREATE INDEX IF NOT EXISTS idx_runtime_positions_map ON runtime_entity_positions(map_instance_id, y, x, entity_type);
CREATE INDEX IF NOT EXISTS idx_runtime_positions_entity ON runtime_entity_positions(entity_type, entity_id, updated_at);
