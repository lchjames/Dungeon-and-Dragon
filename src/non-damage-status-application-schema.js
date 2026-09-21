export const NON_DAMAGE_STATUS_APPLICATION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS non_damage_status_application_log (
    id TEXT PRIMARY KEY,
    settlement_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    application_key TEXT NOT NULL UNIQUE,
    target_character_id TEXT NOT NULL,
    source_character_id TEXT NOT NULL,
    status_definition_id TEXT NOT NULL,
    status_definition_version INTEGER NOT NULL,
    primary_effect_field TEXT NOT NULL,
    primary_effect_key TEXT,
    primary_effect_base_value REAL NOT NULL,
    primary_effect_multiplier INTEGER NOT NULL,
    primary_effect_applied_value REAL NOT NULL,
    settlement_outcome TEXT NOT NULL,
    application_status TEXT NOT NULL,
    runtime_status_effect_id TEXT,
    runtime_operation TEXT,
    meaningful_reason TEXT NOT NULL,
    actor_user_id TEXT,
    lease_token TEXT,
    lease_expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (settlement_id, profile_id),
    CHECK (primary_effect_multiplier IN (1,2)),
    CHECK (application_status IN ('PENDING','APPLIED','BLOCKED')),
    FOREIGN KEY (settlement_id) REFERENCES non_damage_effect_settlement_log(id) ON DELETE RESTRICT,
    FOREIGN KEY (profile_id) REFERENCES non_damage_status_application_profiles(id) ON DELETE RESTRICT,
    FOREIGN KEY (target_character_id) REFERENCES characters(id) ON DELETE RESTRICT,
    FOREIGN KEY (source_character_id) REFERENCES characters(id) ON DELETE RESTRICT,
    FOREIGN KEY (status_definition_id) REFERENCES status_effect_definitions(id) ON DELETE RESTRICT,
    FOREIGN KEY (runtime_status_effect_id) REFERENCES runtime_status_effects(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_non_damage_status_application_settlement
    ON non_damage_status_application_log(settlement_id, profile_id)`,
  `CREATE TABLE IF NOT EXISTS non_damage_status_application_audit (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    application_status TEXT NOT NULL,
    runtime_status_effect_id TEXT,
    runtime_operation TEXT,
    actor_user_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES non_damage_status_application_log(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_non_damage_status_application_audit
    ON non_damage_status_application_audit(application_id, created_at, id)`,
  `CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_application_audit_insert
    AFTER INSERT ON non_damage_status_application_log BEGIN
      INSERT INTO non_damage_status_application_audit (
        id, application_id, application_status, runtime_status_effect_id, runtime_operation, actor_user_id, created_at
      ) VALUES (
        'nd_status_app_audit_' || lower(hex(randomblob(16))), NEW.id, NEW.application_status,
        NEW.runtime_status_effect_id, NEW.runtime_operation, NEW.actor_user_id, NEW.updated_at
      );
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_application_audit_update
    AFTER UPDATE ON non_damage_status_application_log
    WHEN OLD.application_status <> NEW.application_status BEGIN
      INSERT INTO non_damage_status_application_audit (
        id, application_id, application_status, runtime_status_effect_id, runtime_operation, actor_user_id, created_at
      ) VALUES (
        'nd_status_app_audit_' || lower(hex(randomblob(16))), NEW.id, NEW.application_status,
        NEW.runtime_status_effect_id, NEW.runtime_operation, NEW.actor_user_id, NEW.updated_at
      );
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_application_identity_immutable
    BEFORE UPDATE ON non_damage_status_application_log
    WHEN OLD.settlement_id <> NEW.settlement_id OR OLD.profile_id <> NEW.profile_id
      OR OLD.application_key <> NEW.application_key OR OLD.target_character_id <> NEW.target_character_id
      OR OLD.source_character_id <> NEW.source_character_id OR OLD.status_definition_id <> NEW.status_definition_id
      OR OLD.status_definition_version <> NEW.status_definition_version
      OR OLD.primary_effect_field <> NEW.primary_effect_field
      OR COALESCE(OLD.primary_effect_key,'') <> COALESCE(NEW.primary_effect_key,'')
      OR OLD.primary_effect_base_value <> NEW.primary_effect_base_value
      OR OLD.primary_effect_multiplier <> NEW.primary_effect_multiplier
      OR OLD.primary_effect_applied_value <> NEW.primary_effect_applied_value
      OR OLD.settlement_outcome <> NEW.settlement_outcome
    BEGIN SELECT RAISE(ABORT, 'NON_DAMAGE_STATUS_APPLICATION_IDENTITY_IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_application_final_immutable
    BEFORE UPDATE ON non_damage_status_application_log
    WHEN OLD.application_status <> 'PENDING'
    BEGIN SELECT RAISE(ABORT, 'NON_DAMAGE_STATUS_APPLICATION_FINAL_IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_application_no_delete
    BEFORE DELETE ON non_damage_status_application_log
    BEGIN SELECT RAISE(ABORT, 'NON_DAMAGE_STATUS_APPLICATION_DELETE_FORBIDDEN'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_application_audit_no_update
    BEFORE UPDATE ON non_damage_status_application_audit
    BEGIN SELECT RAISE(ABORT, 'NON_DAMAGE_STATUS_APPLICATION_AUDIT_IMMUTABLE'); END`,
  `CREATE TRIGGER IF NOT EXISTS trg_non_damage_status_application_audit_no_delete
    BEFORE DELETE ON non_damage_status_application_audit
    BEGIN SELECT RAISE(ABORT, 'NON_DAMAGE_STATUS_APPLICATION_AUDIT_IMMUTABLE'); END`
];