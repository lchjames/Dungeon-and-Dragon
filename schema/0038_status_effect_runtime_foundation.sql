CREATE TABLE IF NOT EXISTS status_effect_definitions (
  id TEXT PRIMARY KEY,
  canonical_name_zh TEXT NOT NULL,
  category TEXT NOT NULL,
  layers_json TEXT NOT NULL DEFAULT '[]',
  source_attribute TEXT,
  duration_type TEXT NOT NULL,
  default_duration_rounds INTEGER,
  effect_profile_json TEXT NOT NULL DEFAULT '{}',
  trigger_timings_json TEXT NOT NULL DEFAULT '[]',
  stacking_rule TEXT NOT NULL,
  stack_key TEXT NOT NULL,
  max_stacks INTEGER,
  strength_value REAL,
  dispel_tags_json TEXT NOT NULL DEFAULT '[]',
  immunity_rules_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version INTEGER NOT NULL DEFAULT 1,
  description_zh TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  last_change_reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (category IN ('DAMAGE_OVER_TIME','ACTION_CONTROL','MENTAL_CONTROL','PERCEPTION_INTERFERENCE','NUMERIC_MODIFIER','RECOVERY_SUPPORT','OTHER')),
  CHECK (source_attribute IS NULL OR source_attribute IN ('PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD','NONE')),
  CHECK (duration_type IN ('ROUNDS','PERMANENT')),
  CHECK ((duration_type='ROUNDS' AND default_duration_rounds IS NOT NULL AND default_duration_rounds >= 1) OR (duration_type='PERMANENT' AND default_duration_rounds IS NULL)),
  CHECK (stacking_rule IN ('NO_STACK','REFRESH_DURATION','EXTEND_DURATION','ADD_STACKS','KEEP_STRONGER','TAKE_LATEST')),
  CHECK ((stacking_rule='ADD_STACKS' AND max_stacks IS NOT NULL AND max_stacks >= 2) OR (stacking_rule<>'ADD_STACKS' AND max_stacks IS NULL)),
  CHECK (stacking_rule<>'KEEP_STRONGER' OR strength_value IS NOT NULL),
  CHECK (status IN ('ACTIVE','INACTIVE')),
  CHECK (version >= 1),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_status_effect_definitions_stack_name
  ON status_effect_definitions(stack_key, id);
CREATE INDEX IF NOT EXISTS idx_status_effect_definitions_status
  ON status_effect_definitions(status, canonical_name_zh, id);

CREATE TABLE IF NOT EXISTS status_effect_definition_revision_log (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_snapshot_json TEXT,
  after_snapshot_json TEXT NOT NULL,
  actor_user_id TEXT,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (action IN ('CREATE','UPDATE')),
  FOREIGN KEY (definition_id) REFERENCES status_effect_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_status_effect_definition_revision
  ON status_effect_definition_revision_log(definition_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS runtime_status_effects (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  stack_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  duration_type TEXT NOT NULL,
  remaining_rounds INTEGER,
  stack_count INTEGER NOT NULL DEFAULT 1,
  strength_value REAL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_ability_definition_id TEXT,
  effect_snapshot_json TEXT NOT NULL,
  source_context_json TEXT NOT NULL DEFAULT '{}',
  applied_by_user_id TEXT,
  removed_by_user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  applied_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER,
  removal_reason TEXT,
  last_action TEXT NOT NULL,
  last_reason TEXT NOT NULL,
  last_actor_user_id TEXT,
  CHECK (target_type IN ('CHARACTER','MONSTER','BOSS','OBJECT','ENVIRONMENT')),
  CHECK (status IN ('ACTIVE','REMOVED','EXPIRED','REPLACED')),
  CHECK (duration_type IN ('ROUNDS','PERMANENT')),
  CHECK ((duration_type='ROUNDS' AND remaining_rounds IS NOT NULL AND remaining_rounds >= 0) OR (duration_type='PERMANENT' AND remaining_rounds IS NULL)),
  CHECK (stack_count >= 1),
  CHECK (source_type IN ('GM','CHARACTER','MONSTER','BOSS','OBJECT','ABILITY','STORY','OTHER')),
  CHECK (version >= 1),
  CHECK (last_action IN ('APPLY_CREATE','REFRESH','EXTEND','STACK','REPLACE_STRONGER','REPLACE_LATEST','TICK','EXPIRE','REMOVE')),
  FOREIGN KEY (definition_id) REFERENCES status_effect_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_ability_definition_id) REFERENCES ability_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY (applied_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (removed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (last_actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_status_effects_active_stack
  ON runtime_status_effects(target_type, target_id, stack_key)
  WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_runtime_status_effects_target
  ON runtime_status_effects(target_type, target_id, status, applied_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_runtime_status_effects_definition
  ON runtime_status_effects(definition_id, status, applied_at DESC, id);

CREATE TABLE IF NOT EXISTS runtime_status_effect_audit (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  definition_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_snapshot_json TEXT,
  after_snapshot_json TEXT,
  reason TEXT NOT NULL,
  actor_user_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK (action IN ('APPLY_CREATE','APPLY_BLOCKED','REFRESH','EXTEND','STACK','REPLACE_STRONGER','REPLACE_LATEST','TICK','EXPIRE','REMOVE')),
  FOREIGN KEY (instance_id) REFERENCES runtime_status_effects(id) ON DELETE RESTRICT,
  FOREIGN KEY (definition_id) REFERENCES status_effect_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_runtime_status_effect_audit_instance
  ON runtime_status_effect_audit(instance_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_runtime_status_effect_audit_target
  ON runtime_status_effect_audit(target_type, target_id, created_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_status_effect_definition_revision_insert
AFTER INSERT ON status_effect_definitions
BEGIN
  INSERT INTO status_effect_definition_revision_log (
    id, definition_id, action, before_snapshot_json, after_snapshot_json, actor_user_id, reason, created_at
  ) VALUES (
    'status_def_rev_' || lower(hex(randomblob(16))), NEW.id, 'CREATE', NULL,
    json_object(
      'version', NEW.version, 'canonicalNameZh', NEW.canonical_name_zh, 'category', NEW.category,
      'layersJson', NEW.layers_json, 'sourceAttribute', NEW.source_attribute, 'durationType', NEW.duration_type,
      'defaultDurationRounds', NEW.default_duration_rounds, 'effectProfileJson', NEW.effect_profile_json,
      'triggerTimingsJson', NEW.trigger_timings_json, 'stackingRule', NEW.stacking_rule, 'stackKey', NEW.stack_key,
      'maxStacks', NEW.max_stacks, 'strengthValue', NEW.strength_value, 'dispelTagsJson', NEW.dispel_tags_json,
      'immunityRulesJson', NEW.immunity_rules_json, 'status', NEW.status, 'descriptionZh', NEW.description_zh,
      'metadataJson', NEW.metadata_json
    ),
    NEW.created_by_user_id, NEW.last_change_reason, NEW.created_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_status_effect_definition_revision_update
AFTER UPDATE ON status_effect_definitions
BEGIN
  INSERT INTO status_effect_definition_revision_log (
    id, definition_id, action, before_snapshot_json, after_snapshot_json, actor_user_id, reason, created_at
  ) VALUES (
    'status_def_rev_' || lower(hex(randomblob(16))), NEW.id, 'UPDATE',
    json_object(
      'version', OLD.version, 'canonicalNameZh', OLD.canonical_name_zh, 'category', OLD.category,
      'layersJson', OLD.layers_json, 'sourceAttribute', OLD.source_attribute, 'durationType', OLD.duration_type,
      'defaultDurationRounds', OLD.default_duration_rounds, 'effectProfileJson', OLD.effect_profile_json,
      'triggerTimingsJson', OLD.trigger_timings_json, 'stackingRule', OLD.stacking_rule, 'stackKey', OLD.stack_key,
      'maxStacks', OLD.max_stacks, 'strengthValue', OLD.strength_value, 'dispelTagsJson', OLD.dispel_tags_json,
      'immunityRulesJson', OLD.immunity_rules_json, 'status', OLD.status, 'descriptionZh', OLD.description_zh,
      'metadataJson', OLD.metadata_json
    ),
    json_object(
      'version', NEW.version, 'canonicalNameZh', NEW.canonical_name_zh, 'category', NEW.category,
      'layersJson', NEW.layers_json, 'sourceAttribute', NEW.source_attribute, 'durationType', NEW.duration_type,
      'defaultDurationRounds', NEW.default_duration_rounds, 'effectProfileJson', NEW.effect_profile_json,
      'triggerTimingsJson', NEW.trigger_timings_json, 'stackingRule', NEW.stacking_rule, 'stackKey', NEW.stack_key,
      'maxStacks', NEW.max_stacks, 'strengthValue', NEW.strength_value, 'dispelTagsJson', NEW.dispel_tags_json,
      'immunityRulesJson', NEW.immunity_rules_json, 'status', NEW.status, 'descriptionZh', NEW.description_zh,
      'metadataJson', NEW.metadata_json
    ),
    NEW.updated_by_user_id, NEW.last_change_reason, NEW.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_status_effect_audit_insert
AFTER INSERT ON runtime_status_effects
BEGIN
  INSERT INTO runtime_status_effect_audit (
    id, instance_id, definition_id, target_type, target_id, action,
    before_snapshot_json, after_snapshot_json, reason, actor_user_id, created_at
  ) VALUES (
    'status_runtime_audit_' || lower(hex(randomblob(16))), NEW.id, NEW.definition_id, NEW.target_type, NEW.target_id,
    NEW.last_action, NULL,
    json_object(
      'definitionId', NEW.definition_id, 'definitionVersion', NEW.definition_version, 'status', NEW.status,
      'durationType', NEW.duration_type, 'remainingRounds', NEW.remaining_rounds, 'stackCount', NEW.stack_count,
      'strengthValue', NEW.strength_value, 'stackKey', NEW.stack_key, 'sourceType', NEW.source_type,
      'sourceId', NEW.source_id, 'sourceAbilityDefinitionId', NEW.source_ability_definition_id,
      'effectSnapshotJson', NEW.effect_snapshot_json, 'sourceContextJson', NEW.source_context_json,
      'version', NEW.version
    ),
    NEW.last_reason, NEW.last_actor_user_id, NEW.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_status_effect_audit_update
AFTER UPDATE ON runtime_status_effects
BEGIN
  INSERT INTO runtime_status_effect_audit (
    id, instance_id, definition_id, target_type, target_id, action,
    before_snapshot_json, after_snapshot_json, reason, actor_user_id, created_at
  ) VALUES (
    'status_runtime_audit_' || lower(hex(randomblob(16))), NEW.id, NEW.definition_id, NEW.target_type, NEW.target_id,
    NEW.last_action,
    json_object(
      'definitionId', OLD.definition_id, 'definitionVersion', OLD.definition_version, 'status', OLD.status,
      'durationType', OLD.duration_type, 'remainingRounds', OLD.remaining_rounds, 'stackCount', OLD.stack_count,
      'strengthValue', OLD.strength_value, 'stackKey', OLD.stack_key, 'sourceType', OLD.source_type,
      'sourceId', OLD.source_id, 'sourceAbilityDefinitionId', OLD.source_ability_definition_id,
      'effectSnapshotJson', OLD.effect_snapshot_json, 'sourceContextJson', OLD.source_context_json,
      'version', OLD.version
    ),
    json_object(
      'definitionId', NEW.definition_id, 'definitionVersion', NEW.definition_version, 'status', NEW.status,
      'durationType', NEW.duration_type, 'remainingRounds', NEW.remaining_rounds, 'stackCount', NEW.stack_count,
      'strengthValue', NEW.strength_value, 'stackKey', NEW.stack_key, 'sourceType', NEW.source_type,
      'sourceId', NEW.source_id, 'sourceAbilityDefinitionId', NEW.source_ability_definition_id,
      'effectSnapshotJson', NEW.effect_snapshot_json, 'sourceContextJson', NEW.source_context_json,
      'version', NEW.version
    ),
    NEW.last_reason, NEW.last_actor_user_id, NEW.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_status_effect_definition_revision_no_update
BEFORE UPDATE ON status_effect_definition_revision_log
BEGIN SELECT RAISE(ABORT, 'STATUS_EFFECT_DEFINITION_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_status_effect_definition_revision_no_delete
BEFORE DELETE ON status_effect_definition_revision_log
BEGIN SELECT RAISE(ABORT, 'STATUS_EFFECT_DEFINITION_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_runtime_status_effect_audit_no_update
BEFORE UPDATE ON runtime_status_effect_audit
BEGIN SELECT RAISE(ABORT, 'STATUS_EFFECT_RUNTIME_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_runtime_status_effect_audit_no_delete
BEFORE DELETE ON runtime_status_effect_audit
BEGIN SELECT RAISE(ABORT, 'STATUS_EFFECT_RUNTIME_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_runtime_status_effects_no_delete
BEFORE DELETE ON runtime_status_effects
BEGIN SELECT RAISE(ABORT, 'RUNTIME_STATUS_EFFECT_DELETE_FORBIDDEN'); END;
CREATE TRIGGER IF NOT EXISTS trg_status_effect_definitions_no_delete
BEFORE DELETE ON status_effect_definitions
BEGIN SELECT RAISE(ABORT, 'STATUS_EFFECT_DEFINITION_DELETE_FORBIDDEN'); END;
