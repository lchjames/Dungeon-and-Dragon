PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS player_monster_action_log (
  id TEXT PRIMARY KEY,
  combat_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  actor_combatant_id TEXT NOT NULL,
  actor_character_id TEXT NOT NULL,
  target_combatant_id TEXT NOT NULL,
  target_monster_instance_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  attack_roll INTEGER NOT NULL,
  attack_result REAL NOT NULL,
  monster_stored_defence REAL NOT NULL,
  monster_defence_modifier REAL NOT NULL DEFAULT 0,
  monster_modified_defence REAL NOT NULL,
  monster_effective_defence REAL NOT NULL,
  defence_roll INTEGER NOT NULL,
  defence_result REAL NOT NULL,
  raw_damage REAL,
  monster_final_armor_defence REAL,
  damage_result REAL,
  hp_damage REAL NOT NULL DEFAULT 0,
  monster_hp_before REAL NOT NULL,
  monster_hp_after REAL NOT NULL,
  monster_status_after TEXT NOT NULL,
  outcome TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (target_monster_instance_id) REFERENCES monster_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES player_attack_profiles(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_player_monster_action_log_combat
ON player_monster_action_log(combat_id, round_number, turn_index, created_at);
