import baseWorker from './admin-gateway.js';

const AUDIT_COLUMN_DEFINITIONS = Object.freeze({
  combat_id: 'TEXT',
  round_number: 'INTEGER',
  turn_index: 'INTEGER',
  actor_combatant_id: 'TEXT',
  actor_character_id: 'TEXT',
  target_combatant_id: 'TEXT',
  target_monster_instance_id: 'TEXT',
  profile_id: 'TEXT',
  attack_roll: 'INTEGER',
  attack_result: 'REAL',
  monster_stored_defence: 'REAL',
  monster_defence_modifier: 'REAL NOT NULL DEFAULT 0',
  monster_modified_defence: 'REAL',
  monster_effective_defence: 'REAL',
  defence_roll: 'INTEGER',
  defence_result: 'REAL',
  raw_damage: 'REAL',
  monster_final_armor_defence: 'REAL',
  damage_result: 'REAL',
  hp_damage: 'REAL NOT NULL DEFAULT 0',
  monster_hp_before: 'REAL',
  monster_hp_after: 'REAL',
  monster_status_after: 'TEXT',
  outcome: 'TEXT',
  created_at: 'INTEGER'
});

let auditMigrationPromise = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function tableColumns(env, table) {
  const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  return (rows.results || []).map(row => String(row.name));
}

async function ensurePlayerMonsterAuditCompatibility(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!auditMigrationPromise) {
    auditMigrationPromise = (async () => {
      // Fresh databases receive the current table definition. Existing long-lived
      // production databases are upgraded additively below because CREATE TABLE
      // IF NOT EXISTS does not alter an older table.
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_monster_action_log (
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
      )`).run();

      const existingColumns = await tableColumns(env, 'player_monster_action_log');
      if (!existingColumns.includes('id')) {
        throw Object.assign(new Error('Player Monster audit table is missing its primary identity column.'), {
          stage: 'audit-schema-id'
        });
      }

      const existing = new Set(existingColumns);
      for (const [column, definition] of Object.entries(AUDIT_COLUMN_DEFINITIONS)) {
        if (existing.has(column)) continue;
        await env.DB.prepare(`ALTER TABLE player_monster_action_log ADD COLUMN ${column} ${definition}`).run();
        existing.add(column);
      }

      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_player_monster_action_log_combat
        ON player_monster_action_log(combat_id, round_number, turn_index, created_at)
      `).run();
    })().catch(error => {
      auditMigrationPromise = null;
      throw error;
    });
  }
  await auditMigrationPromise;
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const isPlayerAttack = request.method === 'POST'
      && /^\/api\/player\/combat\/[^/]+\/attack$/.test(pathname);

    if (isPlayerAttack) {
      try {
        await ensurePlayerMonsterAuditCompatibility(env);
      } catch (error) {
        console.error('Player Monster audit compatibility migration failed', {
          stage: error?.stage || 'audit-schema-migration',
          name: error?.name || 'Error',
          message: String(error?.message || error)
        });
        return json({
          ok: false,
          error: {
            code: 'MONSTER_DEFEAT_AUDIT_SCHEMA_MIGRATION_ERROR',
            message: 'Player → Monster audit schema 暫時無法完成相容升級。'
          }
        }, 500);
      }
    }

    return baseWorker.fetch(request, env);
  }
};
