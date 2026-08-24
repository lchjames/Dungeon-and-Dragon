PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS boss_design_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  gm_notes TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),

  natural_str REAL NOT NULL,
  natural_dex REAL NOT NULL,
  natural_con REAL NOT NULL,
  natural_pow REAL NOT NULL,
  natural_int REAL NOT NULL,
  natural_siz REAL NOT NULL,

  str_growth_weight REAL NOT NULL DEFAULT 1,
  dex_growth_weight REAL NOT NULL DEFAULT 1,
  con_growth_weight REAL NOT NULL DEFAULT 1,
  pow_growth_weight REAL NOT NULL DEFAULT 1,
  int_growth_weight REAL NOT NULL DEFAULT 1,
  siz_growth_weight REAL NOT NULL DEFAULT 1,

  calculated_str REAL NOT NULL,
  calculated_dex REAL NOT NULL,
  calculated_con REAL NOT NULL,
  calculated_pow REAL NOT NULL,
  calculated_int REAL NOT NULL,
  calculated_siz REAL NOT NULL,

  override_str REAL,
  override_dex REAL,
  override_con REAL,
  override_pow REAL,
  override_int REAL,
  override_siz REAL,

  final_str REAL NOT NULL,
  final_dex REAL NOT NULL,
  final_con REAL NOT NULL,
  final_pow REAL NOT NULL,
  final_int REAL NOT NULL,
  final_siz REAL NOT NULL,

  calculated_max_hp REAL NOT NULL,
  override_max_hp REAL,
  final_max_hp REAL NOT NULL,
  calculated_max_mp REAL NOT NULL,
  override_max_mp REAL,
  final_max_mp REAL NOT NULL,

  baseline_stored_defence REAL NOT NULL DEFAULT 0,
  override_stored_defence REAL,
  final_stored_defence REAL NOT NULL DEFAULT 0,

  baseline_armor_name TEXT NOT NULL DEFAULT '',
  baseline_armor_defence REAL NOT NULL DEFAULT 0,
  baseline_armor_notes TEXT NOT NULL DEFAULT '',
  override_armor_name TEXT,
  override_armor_defence REAL,
  override_armor_notes TEXT,
  final_armor_name TEXT NOT NULL DEFAULT '',
  final_armor_defence REAL NOT NULL DEFAULT 0,
  final_armor_notes TEXT NOT NULL DEFAULT '',

  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS boss_profile_skills (
  boss_profile_id TEXT NOT NULL,
  skill_profile_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (boss_profile_id, skill_profile_id),
  FOREIGN KEY (boss_profile_id) REFERENCES boss_design_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_profile_id) REFERENCES monster_skill_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boss_profile_phases (
  id TEXT PRIMARY KEY,
  boss_profile_id TEXT NOT NULL,
  phase_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  hp_threshold_percent REAL,
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (boss_profile_id, phase_number),
  FOREIGN KEY (boss_profile_id) REFERENCES boss_design_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boss_instances (
  id TEXT PRIMARY KEY,
  boss_profile_id TEXT NOT NULL,
  source_profile_updated_at INTEGER NOT NULL,
  encounter_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  level INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','defeated','removed')),

  final_str REAL NOT NULL,
  final_dex REAL NOT NULL,
  final_con REAL NOT NULL,
  final_pow REAL NOT NULL,
  final_int REAL NOT NULL,
  final_siz REAL NOT NULL,

  snapshot_max_hp REAL NOT NULL,
  hp_max_adjustment REAL NOT NULL DEFAULT 0,
  final_max_hp REAL NOT NULL,
  current_hp REAL NOT NULL,
  snapshot_max_mp REAL NOT NULL,
  mp_max_adjustment REAL NOT NULL DEFAULT 0,
  final_max_mp REAL NOT NULL,
  current_mp REAL NOT NULL,

  stored_defence REAL NOT NULL DEFAULT 0,
  defence_modifier REAL NOT NULL DEFAULT 0,
  armor_name TEXT NOT NULL DEFAULT '',
  armor_base_defence REAL NOT NULL DEFAULT 0,
  armor_defence_adjustment REAL NOT NULL DEFAULT 0,
  final_armor_defence REAL NOT NULL DEFAULT 0,
  armor_notes TEXT NOT NULL DEFAULT '',

  current_phase_number INTEGER,
  phase_hold INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (boss_profile_id) REFERENCES boss_design_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS boss_instance_skills (
  id TEXT PRIMARY KEY,
  boss_instance_id TEXT NOT NULL,
  source_skill_profile_id TEXT,
  source_scope TEXT NOT NULL,
  name TEXT NOT NULL,
  stored_accuracy REAL NOT NULL,
  hit_modifier REAL NOT NULL DEFAULT 0,
  damage_type TEXT NOT NULL DEFAULT 'physical',
  template_base_damage REAL NOT NULL DEFAULT 0,
  damage_growth_weight REAL NOT NULL DEFAULT 1,
  damage_attribute_links TEXT NOT NULL DEFAULT '[]',
  damage_attribute_values TEXT NOT NULL DEFAULT '{}',
  damage_attribute_basis REAL NOT NULL DEFAULT 0,
  calculated_base_damage REAL NOT NULL DEFAULT 0,
  calculated_damage_center REAL NOT NULL DEFAULT 0,
  suggested_spread_min INTEGER NOT NULL,
  suggested_spread_max INTEGER NOT NULL,
  final_spread_min INTEGER NOT NULL,
  final_spread_max INTEGER NOT NULL,
  range_text TEXT NOT NULL DEFAULT '',
  targeting_text TEXT NOT NULL DEFAULT 'single target',
  mp_cost INTEGER NOT NULL DEFAULT 0,
  cooldown_rounds INTEGER NOT NULL DEFAULT 0,
  gm_notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (boss_instance_id) REFERENCES boss_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (source_skill_profile_id) REFERENCES monster_skill_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS boss_instance_phases (
  id TEXT PRIMARY KEY,
  boss_instance_id TEXT NOT NULL,
  source_phase_id TEXT,
  phase_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  hp_threshold_percent REAL,
  gm_notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (boss_instance_id, phase_number),
  FOREIGN KEY (boss_instance_id) REFERENCES boss_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boss_action_log (
  id TEXT PRIMARY KEY,
  combat_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  actor_combatant_id TEXT NOT NULL,
  boss_instance_id TEXT NOT NULL,
  boss_instance_skill_id TEXT NOT NULL,
  target_combatant_id TEXT NOT NULL,
  stored_accuracy REAL NOT NULL,
  hit_modifier REAL NOT NULL DEFAULT 0,
  modified_accuracy REAL NOT NULL,
  effective_accuracy REAL NOT NULL,
  attack_roll INTEGER NOT NULL,
  attack_result REAL NOT NULL,
  defence_roll INTEGER NOT NULL,
  defence_result REAL NOT NULL,
  spread_roll INTEGER,
  raw_damage REAL,
  effective_defence REAL,
  damage_result REAL,
  hp_damage REAL NOT NULL DEFAULT 0,
  phase_number INTEGER,
  outcome TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
  FOREIGN KEY (boss_instance_id) REFERENCES boss_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (boss_instance_skill_id) REFERENCES boss_instance_skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boss_profiles_status ON boss_design_profiles(status, name);
CREATE INDEX IF NOT EXISTS idx_boss_profile_skills_profile ON boss_profile_skills(boss_profile_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_boss_profile_phases_profile ON boss_profile_phases(boss_profile_id, phase_number);
CREATE INDEX IF NOT EXISTS idx_boss_instances_encounter ON boss_instances(encounter_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_boss_instance_skills_instance ON boss_instance_skills(boss_instance_id, is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_boss_instance_phases_instance ON boss_instance_phases(boss_instance_id, phase_number);
CREATE INDEX IF NOT EXISTS idx_boss_action_log_combat ON boss_action_log(combat_id, round_number, turn_index, created_at);
