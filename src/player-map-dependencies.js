export const PLAYER_MAP_DEPENDENCY_SQL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS combats (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    round_number INTEGER NOT NULL DEFAULT 1,
    current_turn_index INTEGER NOT NULL DEFAULT 0,
    created_by_user_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS character_life_states (
    character_id TEXT PRIMARY KEY,
    life_state TEXT NOT NULL DEFAULT 'alive',
    character_locked INTEGER NOT NULL DEFAULT 0,
    dying_rounds_remaining INTEGER,
    died_at INTEGER,
    last_dying_tick_combat_id TEXT,
    last_dying_tick_round INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS idx_combats_status ON combats(status, updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_character_life_states_state ON character_life_states(life_state, character_locked)'
]);

export const PLAYER_MAP_LIFE_BOOTSTRAP_SQL = `
  INSERT OR IGNORE INTO character_life_states (
    character_id, life_state, character_locked, dying_rounds_remaining,
    died_at, last_dying_tick_combat_id, last_dying_tick_round, updated_at
  )
  SELECT id, 'alive', 0, NULL, NULL, NULL, NULL, 0
  FROM characters
`;

let dependencyPromise = null;

export async function ensurePlayerMapDependencies(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!dependencyPromise) {
    dependencyPromise = (async () => {
      await env.DB.batch(PLAYER_MAP_DEPENDENCY_SQL.map(sql => env.DB.prepare(sql)));
      await env.DB.prepare(PLAYER_MAP_LIFE_BOOTSTRAP_SQL).run();
    })().catch(error => {
      dependencyPromise = null;
      throw error;
    });
  }
  await dependencyPromise;
}
