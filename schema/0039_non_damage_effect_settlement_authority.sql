-- Non-damage Effect Settlement Decision Authority — Alpha
-- Converts one immutable Shared Opposed D100 audit into one immutable canonical effect-settlement decision.
-- This table does not apply Status, damage, healing, movement, Action/Move, MP, or any other downstream effect.

CREATE TABLE IF NOT EXISTS non_damage_effect_settlement_log (
  id TEXT PRIMARY KEY,
  opposed_check_id TEXT NOT NULL UNIQUE,
  source_check_id TEXT NOT NULL,
  resistance_check_id TEXT NOT NULL,
  source_character_id TEXT NOT NULL,
  resistance_character_id TEXT NOT NULL,
  comparison TEXT NOT NULL,
  source_raw_roll INTEGER NOT NULL,
  resistance_raw_roll INTEGER NOT NULL,
  source_result_value INTEGER NOT NULL,
  resistance_result_value INTEGER NOT NULL,
  result_gap INTEGER NOT NULL,
  narrative_gap INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  original_target_resolution TEXT NOT NULL,
  primary_effect_multiplier INTEGER NOT NULL,
  source_great_success INTEGER NOT NULL,
  source_great_success_applied INTEGER NOT NULL,
  source_great_failure INTEGER NOT NULL,
  defense_great_success INTEGER NOT NULL,
  defense_great_failure INTEGER NOT NULL,
  double_failure_override INTEGER NOT NULL,
  gm_resolution_required INTEGER NOT NULL,
  meaningful_reason TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK (comparison IN ('SOURCE_HIGHER','RESISTANCE_HIGHER','TIE')),
  CHECK (narrative_gap BETWEEN -20 AND 20),
  CHECK (outcome IN (
    'EFFECT_BLOCKED',
    'EFFECT_APPLIES_NORMAL',
    'EFFECT_APPLIES_DOUBLE_PRIMARY',
    'SOURCE_DEVIATION_REQUIRED',
    'DOUBLE_FAILURE_ACCIDENTAL_SUCCESS'
  )),
  CHECK (original_target_resolution IN ('APPLIES','BLOCKED','GM_DECISION_REQUIRED')),
  CHECK (primary_effect_multiplier IN (1,2)),
  CHECK (source_great_success IN (0,1)),
  CHECK (source_great_success_applied IN (0,1)),
  CHECK (source_great_failure IN (0,1)),
  CHECK (defense_great_success IN (0,1)),
  CHECK (defense_great_failure IN (0,1)),
  CHECK (double_failure_override IN (0,1)),
  CHECK (gm_resolution_required IN (0,1)),
  FOREIGN KEY (opposed_check_id) REFERENCES basic_skill_opposed_check_log(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_check_id) REFERENCES character_skill_check_log(id) ON DELETE RESTRICT,
  FOREIGN KEY (resistance_check_id) REFERENCES character_skill_check_log(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_character_id) REFERENCES characters(id) ON DELETE RESTRICT,
  FOREIGN KEY (resistance_character_id) REFERENCES characters(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_non_damage_effect_settlement_source
ON non_damage_effect_settlement_log(source_character_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_non_damage_effect_settlement_resistance
ON non_damage_effect_settlement_log(resistance_character_id, created_at DESC, id);

CREATE TRIGGER IF NOT EXISTS trg_non_damage_effect_settlement_no_update
BEFORE UPDATE ON non_damage_effect_settlement_log
BEGIN
  SELECT RAISE(ABORT, 'NON_DAMAGE_EFFECT_SETTLEMENT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_non_damage_effect_settlement_no_delete
BEFORE DELETE ON non_damage_effect_settlement_log
BEGIN
  SELECT RAISE(ABORT, 'NON_DAMAGE_EFFECT_SETTLEMENT_IMMUTABLE');
END;
