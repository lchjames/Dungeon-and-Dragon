PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monster_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  str_min INTEGER NOT NULL,
  str_max INTEGER NOT NULL,
  str_growth_weight REAL NOT NULL DEFAULT 1,
  dex_min INTEGER NOT NULL,
  dex_max INTEGER NOT NULL,
  dex_growth_weight REAL NOT NULL DEFAULT 1,
  con_min INTEGER NOT NULL,
  con_max INTEGER NOT NULL,
  con_growth_weight REAL NOT NULL DEFAULT 1,
  pow_min INTEGER NOT NULL,
  pow_max INTEGER NOT NULL,
  pow_growth_weight REAL NOT NULL DEFAULT 1,
  int_min INTEGER NOT NULL,
  int_max INTEGER NOT NULL,
  int_growth_weight REAL NOT NULL DEFAULT 1,
  siz_min INTEGER NOT NULL,
  siz_max INTEGER NOT NULL,
  siz_growth_weight REAL NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (str_min <= str_max),
  CHECK (dex_min <= dex_max),
  CHECK (con_min <= con_max),
  CHECK (pow_min <= pow_max),
  CHECK (int_min <= int_max),
  CHECK (siz_min <= siz_max)
);

CREATE TABLE IF NOT EXISTS monster_skill_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_scope TEXT NOT NULL DEFAULT 'common' CHECK (source_scope IN ('common', 'template', 'boss')),
  source_template_id TEXT,
  stored_accuracy INTEGER NOT NULL,
  damage_type TEXT NOT NULL DEFAULT 'physical',
  template_base_damage REAL NOT NULL DEFAULT 0,
  damage_growth_weight REAL NOT NULL DEFAULT 1,
  damage_attribute_links TEXT NOT NULL DEFAULT '[]',
  range_text TEXT NOT NULL DEFAULT '',
  targeting_text TEXT NOT NULL DEFAULT 'single target',
  mp_cost INTEGER NOT NULL DEFAULT 0,
  cooldown_rounds INTEGER NOT NULL DEFAULT 0,
  gm_notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (source_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS monster_template_skills (
  template_id TEXT NOT NULL,
  skill_profile_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (template_id, skill_profile_id),
  FOREIGN KEY (template_id) REFERENCES monster_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_profile_id) REFERENCES monster_skill_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS monster_instances (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  level INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'defeated', 'removed')),
  is_elite INTEGER NOT NULL DEFAULT 0,
  elite_roll INTEGER NOT NULL,
  elite_bonus INTEGER NOT NULL DEFAULT 0,

  base_str INTEGER NOT NULL,
  base_dex INTEGER NOT NULL,
  base_con INTEGER NOT NULL,
  base_pow INTEGER NOT NULL,
  base_int INTEGER NOT NULL,
  base_siz INTEGER NOT NULL,

  natural_str INTEGER NOT NULL,
  natural_dex INTEGER NOT NULL,
  natural_con INTEGER NOT NULL,
  natural_pow INTEGER NOT NULL,
  natural_int INTEGER NOT NULL,
  natural_siz INTEGER NOT NULL,

  effective_str INTEGER NOT NULL,
  effective_dex INTEGER NOT NULL,
  effective_con INTEGER NOT NULL,
  effective_pow INTEGER NOT NULL,
  effective_int INTEGER NOT NULL,
  effective_siz INTEGER NOT NULL,

  calculated_max_hp REAL NOT NULL,
  hp_max_adjustment REAL NOT NULL DEFAULT 0,
  final_max_hp REAL NOT NULL,
  current_hp REAL NOT NULL,
  calculated_max_mp REAL NOT NULL,
  mp_max_adjustment REAL NOT NULL DEFAULT 0,
  final_max_mp REAL NOT NULL,
  current_mp REAL NOT NULL,

  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (template_id) REFERENCES monster_templates(id) ON DELETE RESTRICT,
  FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS monster_instance_skills (
  id TEXT PRIMARY KEY,
  monster_instance_id TEXT NOT NULL,
  source_skill_profile_id TEXT,
  source_scope TEXT NOT NULL DEFAULT 'common',
  name TEXT NOT NULL,
  stored_accuracy INTEGER NOT NULL,
  hit_modifier INTEGER NOT NULL DEFAULT 0,
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
  FOREIGN KEY (monster_instance_id) REFERENCES monster_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (source_skill_profile_id) REFERENCES monster_skill_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_monster_templates_active ON monster_templates(is_active, name);
CREATE INDEX IF NOT EXISTS idx_monster_skill_profiles_scope ON monster_skill_profiles(source_scope, is_active, name);
CREATE INDEX IF NOT EXISTS idx_monster_template_skills_template ON monster_template_skills(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_monster_instances_encounter ON monster_instances(encounter_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_monster_instances_template ON monster_instances(template_id, created_at);
CREATE INDEX IF NOT EXISTS idx_monster_instance_skills_instance ON monster_instance_skills(monster_instance_id, is_active, created_at);
