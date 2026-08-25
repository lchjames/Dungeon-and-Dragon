PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS world_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  gm_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS map_templates (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 200),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 200),
  background_asset_ref TEXT NOT NULL DEFAULT '',
  gm_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES world_locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Sparse template-cell overrides. A cell inside the template dimensions is
-- walkable/floor by default unless an override row says otherwise.
CREATE TABLE IF NOT EXISTS map_cells (
  map_template_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  is_walkable INTEGER NOT NULL DEFAULT 1 CHECK (is_walkable IN (0, 1)),
  terrain_key TEXT NOT NULL DEFAULT 'floor',
  gm_notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (map_template_id, x, y),
  FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
);

-- Orthogonal edge definitions are sufficient for walls/doors and diagonal
-- corner-cut validation. The movement resolver must inspect both sides of an
-- edge when validating a move.
CREATE TABLE IF NOT EXISTS map_edges (
  id TEXT PRIMARY KEY,
  map_template_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('N', 'E', 'S', 'W')),
  edge_type TEXT NOT NULL CHECK (edge_type IN ('wall', 'door')),
  blocks_movement INTEGER NOT NULL DEFAULT 1 CHECK (blocks_movement IN (0, 1)),
  door_default_state TEXT CHECK (door_default_state IS NULL OR door_default_state IN ('open', 'closed', 'locked', 'broken')),
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_template_id, x, y, direction),
  FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS map_zones (
  id TEXT PRIMARY KEY,
  map_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'area' CHECK (zone_type IN ('area', 'room', 'trigger', 'custom')),
  player_visible_default INTEGER NOT NULL DEFAULT 1 CHECK (player_visible_default IN (0, 1)),
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS map_zone_cells (
  zone_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  PRIMARY KEY (zone_id, x, y),
  FOREIGN KEY (zone_id) REFERENCES map_zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS map_spawn_points (
  id TEXT PRIMARY KEY,
  map_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  spawn_type TEXT NOT NULL DEFAULT 'any' CHECK (spawn_type IN ('any', 'character', 'monster', 'boss')),
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_template_id, name),
  FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
);

-- One structured Map binding per Scene for the first Alpha slice. The reusable
-- Map Template is not mutated by Scene configuration; scene_config_json stores
-- only Scene-specific initial configuration until dedicated structured tables
-- are introduced for those override types.
CREATE TABLE IF NOT EXISTS scene_map_bindings (
  scene_id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  map_template_id TEXT NOT NULL,
  scene_config_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES world_locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_world_locations_status_name
  ON world_locations(status, name, updated_at);
CREATE INDEX IF NOT EXISTS idx_map_templates_location_status
  ON map_templates(location_id, status, name, updated_at);
CREATE INDEX IF NOT EXISTS idx_map_cells_template
  ON map_cells(map_template_id, y, x);
CREATE INDEX IF NOT EXISTS idx_map_edges_template
  ON map_edges(map_template_id, y, x, direction);
CREATE INDEX IF NOT EXISTS idx_map_zones_template
  ON map_zones(map_template_id, name);
CREATE INDEX IF NOT EXISTS idx_map_zone_cells_zone
  ON map_zone_cells(zone_id, y, x);
CREATE INDEX IF NOT EXISTS idx_map_spawn_points_template
  ON map_spawn_points(map_template_id, spawn_type, name);
CREATE INDEX IF NOT EXISTS idx_scene_map_bindings_template
  ON scene_map_bindings(map_template_id, scene_id);
