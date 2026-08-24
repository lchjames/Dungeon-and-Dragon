PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS player_attack_profiles (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  name TEXT NOT NULL,
  stored_accuracy INTEGER NOT NULL,
  damage_dice_count INTEGER NOT NULL,
  damage_dice_sides INTEGER NOT NULL,
  fixed_damage_modifier INTEGER NOT NULL DEFAULT 0,
  applies_character_damage_bonus INTEGER NOT NULL DEFAULT 1,
  defence_skill_key TEXT NOT NULL DEFAULT 'dodge',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_player_attack_profiles_character
  ON player_attack_profiles(character_id, is_active, updated_at);

CREATE TABLE IF NOT EXISTS character_life_states (
  character_id TEXT PRIMARY KEY,
  life_state TEXT NOT NULL DEFAULT 'alive',
  character_locked INTEGER NOT NULL DEFAULT 0,
  dying_rounds_remaining INTEGER,
  died_at INTEGER,
  last_dying_tick_combat_id TEXT,
  last_dying_tick_round INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_life_states_state
  ON character_life_states(life_state, character_locked);

CREATE TABLE IF NOT EXISTS combat_action_log (
  id TEXT PRIMARY KEY,
  combat_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  actor_combatant_id TEXT NOT NULL,
  target_combatant_id TEXT,
  action_type TEXT NOT NULL,
  profile_id TEXT,
  attack_roll INTEGER,
  attack_result INTEGER,
  defence_roll INTEGER,
  defence_result INTEGER,
  outcome TEXT NOT NULL,
  raw_damage INTEGER,
  effective_defence INTEGER,
  damage_result INTEGER,
  hp_damage INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_combat_action_log_combat
  ON combat_action_log(combat_id, round_number, turn_index, created_at);

INSERT OR IGNORE INTO character_life_states (
  character_id, life_state, character_locked, dying_rounds_remaining,
  died_at, last_dying_tick_combat_id, last_dying_tick_round, updated_at
)
SELECT id, 'alive', 0, NULL, NULL, NULL, NULL, 0
FROM characters;
