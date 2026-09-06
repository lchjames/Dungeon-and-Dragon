PRAGMA foreign_keys = ON;

-- The interaction authority consumes the same exploration Action tracked by the
-- Player Map runtime. Keep the migration standalone for databases that have not
-- lazily materialised these compatibility tables yet.
CREATE TABLE IF NOT EXISTS runtime_exploration_state (
  map_instance_id TEXT PRIMARY KEY,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_exploration_character_state (
  map_instance_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  action_available INTEGER NOT NULL DEFAULT 1 CHECK (action_available IN (0, 1)),
  move_available INTEGER NOT NULL DEFAULT 1 CHECK (move_available IN (0, 1)),
  turn_completed INTEGER NOT NULL DEFAULT 0 CHECK (turn_completed IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (map_instance_id, character_id),
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- Reusable structured Map Object definitions. Object state is snapshotted into
-- Runtime Map Instances and never written back from play state.
CREATE TABLE IF NOT EXISTS map_objects (
  id TEXT PRIMARY KEY,
  map_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  object_type TEXT NOT NULL DEFAULT 'object',
  player_visible_default INTEGER NOT NULL DEFAULT 1 CHECK (player_visible_default IN (0, 1)),
  interactable_default INTEGER NOT NULL DEFAULT 1 CHECK (interactable_default IN (0, 1)),
  interaction_range INTEGER NOT NULL DEFAULT 1 CHECK (interaction_range IN (0, 1)),
  single_use INTEGER NOT NULL DEFAULT 0 CHECK (single_use IN (0, 1)),
  initial_state_key TEXT NOT NULL DEFAULT 'ready',
  gm_notes TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_template_id, name),
  FOREIGN KEY (map_template_id) REFERENCES map_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_map_objects (
  id TEXT PRIMARY KEY,
  map_instance_id TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  object_type TEXT NOT NULL DEFAULT 'object',
  player_visible INTEGER NOT NULL DEFAULT 1 CHECK (player_visible IN (0, 1)),
  interactable INTEGER NOT NULL DEFAULT 1 CHECK (interactable IN (0, 1)),
  interaction_range INTEGER NOT NULL DEFAULT 1 CHECK (interaction_range IN (0, 1)),
  single_use INTEGER NOT NULL DEFAULT 0 CHECK (single_use IN (0, 1)),
  state_key TEXT NOT NULL DEFAULT 'ready',
  interaction_count INTEGER NOT NULL DEFAULT 0 CHECK (interaction_count >= 0),
  last_interacted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (map_instance_id, source_object_id),
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runtime_object_interaction_log (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  map_instance_id TEXT NOT NULL,
  runtime_object_id TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  interaction_mode TEXT NOT NULL CHECK (interaction_mode IN ('exploration', 'combat')),
  exploration_round_number INTEGER,
  combat_id TEXT,
  combat_round_number INTEGER,
  from_state_key TEXT NOT NULL,
  to_state_key TEXT NOT NULL,
  object_interaction_count_before INTEGER NOT NULL CHECK (object_interaction_count_before >= 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_object_id) REFERENCES runtime_map_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS runtime_object_state_log (
  id TEXT PRIMARY KEY,
  scene_run_id TEXT NOT NULL,
  map_instance_id TEXT NOT NULL,
  runtime_object_id TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  from_state_key TEXT NOT NULL,
  to_state_key TEXT NOT NULL,
  change_reason TEXT NOT NULL CHECK (change_reason IN ('interaction', 'gm_override')),
  changed_by_user_id TEXT NOT NULL,
  interaction_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_object_id) REFERENCES runtime_map_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (interaction_id) REFERENCES runtime_object_interaction_log(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_map_objects_template ON map_objects(map_template_id, y, x, name);
CREATE INDEX IF NOT EXISTS idx_runtime_objects_map ON runtime_map_objects(map_instance_id, y, x, player_visible, interactable);
CREATE INDEX IF NOT EXISTS idx_runtime_object_interactions_scene ON runtime_object_interaction_log(scene_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_object_interactions_object ON runtime_object_interaction_log(runtime_object_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_object_state_object ON runtime_object_state_log(runtime_object_id, created_at);

-- Snapshot Object Definitions when a new Runtime Map Instance is committed.
CREATE TRIGGER IF NOT EXISTS trg_runtime_map_clone_objects
AFTER INSERT ON runtime_map_instances
BEGIN
  INSERT OR IGNORE INTO runtime_map_objects (
    id, map_instance_id, source_object_id, name_snapshot, x, y, object_type,
    player_visible, interactable, interaction_range, single_use, state_key,
    interaction_count, last_interacted_at, created_at, updated_at
  )
  SELECT
    'runtime_object_' || lower(hex(randomblob(16))),
    NEW.id,
    mo.id,
    mo.name,
    mo.x,
    mo.y,
    mo.object_type,
    mo.player_visible_default,
    mo.interactable_default,
    mo.interaction_range,
    mo.single_use,
    mo.initial_state_key,
    0,
    NULL,
    NEW.created_at,
    NEW.created_at
  FROM map_objects mo
  WHERE mo.map_template_id = NEW.map_template_id;
END;

-- Interaction audit is the authoritative mutation boundary. These triggers
-- consume the Character Action and mutate the Runtime Object only after a valid
-- interaction audit row has been inserted atomically by the service.
CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_consume_exploration_action
AFTER INSERT ON runtime_object_interaction_log
WHEN NEW.interaction_mode = 'exploration'
BEGIN
  UPDATE runtime_exploration_character_state
  SET action_available = 0, updated_at = NEW.created_at
  WHERE map_instance_id = NEW.map_instance_id
    AND character_id = NEW.character_id
    AND round_number = NEW.exploration_round_number
    AND action_available = 1
    AND turn_completed = 0;
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_consume_combat_action
AFTER INSERT ON runtime_object_interaction_log
WHEN NEW.interaction_mode = 'combat'
BEGIN
  UPDATE combatants
  SET action_available = 0, updated_at = NEW.created_at
  WHERE combat_id = NEW.combat_id
    AND entity_type = 'character'
    AND entity_id = NEW.character_id
    AND controller_user_id = NEW.actor_user_id
    AND action_available = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_apply_object
AFTER INSERT ON runtime_object_interaction_log
BEGIN
  UPDATE runtime_map_objects
  SET state_key = NEW.to_state_key,
      interaction_count = interaction_count + 1,
      last_interacted_at = NEW.created_at,
      interactable = CASE WHEN single_use = 1 THEN 0 ELSE interactable END,
      updated_at = NEW.created_at
  WHERE id = NEW.runtime_object_id
    AND map_instance_id = NEW.map_instance_id
    AND interaction_count = NEW.object_interaction_count_before;
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_state_log
AFTER INSERT ON runtime_object_interaction_log
WHEN NEW.from_state_key IS NOT NEW.to_state_key
BEGIN
  INSERT INTO runtime_object_state_log (
    id, scene_run_id, map_instance_id, runtime_object_id, source_object_id,
    from_state_key, to_state_key, change_reason, changed_by_user_id,
    interaction_id, created_at
  ) VALUES (
    'runtime_object_state_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    NEW.map_instance_id,
    NEW.runtime_object_id,
    NEW.source_object_id,
    NEW.from_state_key,
    NEW.to_state_key,
    'interaction',
    NEW.actor_user_id,
    NEW.id,
    NEW.created_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_object_interaction_story_occurrence
AFTER INSERT ON runtime_object_interaction_log
BEGIN
  INSERT OR IGNORE INTO runtime_story_lifecycle_occurrences (
    id, scene_run_id, trigger_type, subject_type, subject_id,
    source_at, actor_user_id, lease_token, lease_at, completed_at,
    created_at, updated_at
  ) VALUES (
    'story_lifecycle_' || lower(hex(randomblob(16))),
    NEW.scene_run_id,
    'interact_object',
    'object_interaction',
    NEW.id,
    NEW.created_at,
    NEW.actor_user_id,
    NULL,
    NULL,
    NULL,
    NEW.created_at,
    NEW.created_at
  );
END;
