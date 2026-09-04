PRAGMA foreign_keys = ON;

-- Reusable Map Object definitions. Object type and state are deliberately
-- data-driven so future levers, chests, terminals, statues and custom
-- mechanisms do not require schema changes.
CREATE TABLE IF NOT EXISTS map_objects (
  id TEXT PRIMARY KEY,
  map_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  object_type TEXT NOT NULL DEFAULT 'prop',
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  interaction_range INTEGER NOT NULL DEFAULT 1 CHECK (interaction_range BETWEEN 1 AND 20),
  player_visible_default INTEGER NOT NULL DEFAULT 1 CHECK (player_visible_default IN (0, 1)),
  enabled_default INTEGER NOT NULL DEFAULT 1 CHECK (enabled_default IN (0, 1)),
  initial_state_json TEXT NOT NULL DEFAULT '{}',
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_template_id, name),
  FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_map_objects_template
  ON map_objects(map_template_id, y, x, object_type, name);

-- Runtime Objects are immutable-definition snapshots with mutable Runtime
-- state. There is intentionally no FK from source_object_id to map_objects:
-- deleting or editing a reusable definition must not erase play history.
CREATE TABLE IF NOT EXISTS runtime_map_objects (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  object_type TEXT NOT NULL DEFAULT 'prop',
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  interaction_range INTEGER NOT NULL DEFAULT 1 CHECK (interaction_range BETWEEN 1 AND 20),
  player_visible INTEGER NOT NULL DEFAULT 1 CHECK (player_visible IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  state_json TEXT NOT NULL DEFAULT '{}',
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_instance_id, source_object_id),
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runtime_map_objects_map
  ON runtime_map_objects(map_instance_id, y, x, object_type, enabled);
CREATE INDEX IF NOT EXISTS idx_runtime_map_objects_source
  ON runtime_map_objects(source_object_id, map_instance_id);

-- Runtime Map creation already inserts runtime_map_instances inside its
-- authoritative D1 batch. This trigger snapshots Map Objects in that exact
-- transaction, before any post-commit Story lifecycle work can run.
CREATE TRIGGER IF NOT EXISTS trg_runtime_map_object_snapshot
AFTER INSERT ON runtime_map_instances
BEGIN
  INSERT INTO runtime_map_objects
    (id, map_instance_id, source_object_id, name_snapshot, object_type, x, y,
     interaction_range, player_visible, enabled, state_json, gm_notes,
     created_at, updated_at)
  SELECT 'runtime_object_' || lower(hex(randomblob(16))), NEW.id, mo.id, mo.name,
         mo.object_type, mo.x, mo.y, mo.interaction_range,
         mo.player_visible_default, mo.enabled_default, mo.initial_state_json,
         mo.gm_notes, NEW.created_at, NEW.created_at
  FROM map_objects mo
  WHERE mo.map_template_id = NEW.map_template_id;
END;
