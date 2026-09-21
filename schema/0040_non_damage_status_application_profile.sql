CREATE TABLE IF NOT EXISTS non_damage_status_application_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status_definition_id TEXT NOT NULL,
  status_definition_version INTEGER NOT NULL,
  target_mode TEXT NOT NULL DEFAULT 'ORIGINAL_TARGET',
  primary_effect_field TEXT NOT NULL,
  primary_effect_key TEXT,
  primary_effect_value REAL NOT NULL,
  resistance_type TEXT NOT NULL DEFAULT 'OPPOSED_D100',
  great_success_rule TEXT NOT NULL DEFAULT 'DOUBLE_PRIMARY_EFFECT',
  great_failure_rule TEXT NOT NULL DEFAULT 'TARGET_DEVIATION',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  last_change_reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (target_mode='ORIGINAL_TARGET'),
  CHECK (primary_effect_field IN ('DURATION_ROUNDS','STRENGTH_VALUE','EFFECT_PROFILE_NUMERIC')),
  CHECK ((primary_effect_field='EFFECT_PROFILE_NUMERIC' AND primary_effect_key IS NOT NULL) OR
         (primary_effect_field<>'EFFECT_PROFILE_NUMERIC' AND primary_effect_key IS NULL)),
  CHECK (resistance_type='OPPOSED_D100'),
  CHECK (great_success_rule='DOUBLE_PRIMARY_EFFECT'),
  CHECK (great_failure_rule='TARGET_DEVIATION'),
  CHECK (status IN ('ACTIVE','INACTIVE')),
  CHECK (version >= 1),
  FOREIGN KEY (status_definition_id) REFERENCES status_effect_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_non_damage_status_profiles_definition
  ON non_damage_status_application_profiles(status_definition_id, status, name, id);

CREATE TABLE IF NOT EXISTS non_damage_status_application_profile_revision_log (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_snapshot_json TEXT,
  after_snapshot_json TEXT NOT NULL,
  actor_user_id TEXT,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (action IN ('CREATE','UPDATE')),
  FOREIGN KEY (profile_id) REFERENCES non_damage_status_application_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_non_damage_status_profile_revision
  ON non_damage_status_application_profile_revision_log(profile_id, created_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_profile_revision_insert
AFTER INSERT ON non_damage_status_application_profiles BEGIN
  INSERT INTO non_damage_status_application_profile_revision_log (
    id, profile_id, action, before_snapshot_json, after_snapshot_json, actor_user_id, reason, created_at
  ) VALUES (
    'nd_status_profile_rev_' || lower(hex(randomblob(16))), NEW.id, 'CREATE', NULL,
    json_object('version',NEW.version,'name',NEW.name,'statusDefinitionId',NEW.status_definition_id,
      'statusDefinitionVersion',NEW.status_definition_version,'targetMode',NEW.target_mode,
      'primaryEffectField',NEW.primary_effect_field,'primaryEffectKey',NEW.primary_effect_key,
      'primaryEffectValue',NEW.primary_effect_value,'resistanceType',NEW.resistance_type,
      'greatSuccessRule',NEW.great_success_rule,'greatFailureRule',NEW.great_failure_rule,
      'status',NEW.status,'metadataJson',NEW.metadata_json),
    NEW.created_by_user_id, NEW.last_change_reason, NEW.created_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_profile_revision_update
AFTER UPDATE ON non_damage_status_application_profiles BEGIN
  INSERT INTO non_damage_status_application_profile_revision_log (
    id, profile_id, action, before_snapshot_json, after_snapshot_json, actor_user_id, reason, created_at
  ) VALUES (
    'nd_status_profile_rev_' || lower(hex(randomblob(16))), NEW.id, 'UPDATE',
    json_object('version',OLD.version,'name',OLD.name,'statusDefinitionId',OLD.status_definition_id,
      'statusDefinitionVersion',OLD.status_definition_version,'targetMode',OLD.target_mode,
      'primaryEffectField',OLD.primary_effect_field,'primaryEffectKey',OLD.primary_effect_key,
      'primaryEffectValue',OLD.primary_effect_value,'resistanceType',OLD.resistance_type,
      'greatSuccessRule',OLD.great_success_rule,'greatFailureRule',OLD.great_failure_rule,
      'status',OLD.status,'metadataJson',OLD.metadata_json),
    json_object('version',NEW.version,'name',NEW.name,'statusDefinitionId',NEW.status_definition_id,
      'statusDefinitionVersion',NEW.status_definition_version,'targetMode',NEW.target_mode,
      'primaryEffectField',NEW.primary_effect_field,'primaryEffectKey',NEW.primary_effect_key,
      'primaryEffectValue',NEW.primary_effect_value,'resistanceType',NEW.resistance_type,
      'greatSuccessRule',NEW.great_success_rule,'greatFailureRule',NEW.great_failure_rule,
      'status',NEW.status,'metadataJson',NEW.metadata_json),
    NEW.updated_by_user_id, NEW.last_change_reason, NEW.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_profile_revision_no_update
BEFORE UPDATE ON non_damage_status_application_profile_revision_log
BEGIN SELECT RAISE(ABORT, 'NON_DAMAGE_STATUS_PROFILE_AUDIT_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_profile_revision_no_delete
BEFORE DELETE ON non_damage_status_application_profile_revision_log
BEGIN SELECT RAISE(ABORT, 'NON_DAMAGE_STATUS_PROFILE_AUDIT_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_profiles_no_delete
BEFORE DELETE ON non_damage_status_application_profiles
BEGIN SELECT RAISE(ABORT, 'NON_DAMAGE_STATUS_PROFILE_DELETE_FORBIDDEN'); END;
