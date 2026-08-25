import baseWorker from './admin-gateway.js';

const EXPECTED_AUDIT_COLUMNS = [
  'id', 'combat_id', 'round_number', 'turn_index', 'actor_combatant_id',
  'actor_character_id', 'target_combatant_id', 'target_monster_instance_id',
  'profile_id', 'attack_roll', 'attack_result', 'monster_stored_defence',
  'monster_defence_modifier', 'monster_modified_defence', 'monster_effective_defence',
  'defence_roll', 'defence_result', 'raw_damage', 'monster_final_armor_defence',
  'damage_result', 'hp_damage', 'monster_hp_before', 'monster_hp_after',
  'monster_status_after', 'outcome', 'created_at'
];

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

async function safeJson(response) {
  try { return await response.clone().json(); }
  catch { return null; }
}

async function tableInfo(env, table) {
  try {
    const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    return rows.results || [];
  } catch {
    return null;
  }
}

async function tableColumns(env, table) {
  const rows = await tableInfo(env, table);
  return rows ? rows.map(row => String(row.name)) : null;
}

function legacyRequiredColumns(rows) {
  if (!Array.isArray(rows)) return [];
  const expected = new Set(EXPECTED_AUDIT_COLUMNS);
  return rows.filter(row => {
    const name = String(row.name || '');
    const required = Number(row.notnull || 0) === 1;
    const hasDefault = row.dflt_value !== null && row.dflt_value !== undefined;
    const primaryKey = Number(row.pk || 0) > 0;
    return name && !expected.has(name) && required && !hasDefault && !primaryKey;
  });
}

async function ensurePlayerMonsterAuditCompatibility(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!auditMigrationPromise) {
    auditMigrationPromise = (async () => {
      // CREATE TABLE handles fresh databases. Existing production tables require
      // explicit additive migration because CREATE TABLE IF NOT EXISTS never
      // upgrades an older table definition.
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
      if (!existingColumns?.includes('id')) {
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

async function diagnoseMonsterAttackFailure(env, combatId, targetCombatantId) {
  if (!env.DB) return { code: 'MONSTER_DEFEAT_DIAG_DATABASE_UNAVAILABLE', stage: 'database-binding' };

  const [auditInfo, monsterColumns, combatantColumns] = await Promise.all([
    tableInfo(env, 'player_monster_action_log'),
    tableColumns(env, 'monster_instances'),
    tableColumns(env, 'combatants')
  ]);

  if (!auditInfo) return { code: 'MONSTER_DEFEAT_DIAG_AUDIT_SCHEMA_UNREADABLE', stage: 'audit-schema' };
  const auditColumns = auditInfo.map(row => String(row.name));
  const missingAuditColumns = EXPECTED_AUDIT_COLUMNS.filter(column => !auditColumns.includes(column));
  if (missingAuditColumns.length) {
    return {
      code: 'MONSTER_DEFEAT_DIAG_AUDIT_SCHEMA_DRIFT',
      stage: 'audit-schema',
      missingColumnCount: missingAuditColumns.length
    };
  }
  const legacyRequired = legacyRequiredColumns(auditInfo);
  if (legacyRequired.length) {
    return {
      code: 'MONSTER_DEFEAT_DIAG_AUDIT_LEGACY_REQUIRED_COLUMNS',
      stage: 'audit-legacy-constraints',
      requiredColumnCount: legacyRequired.length
    };
  }
  if (!monsterColumns?.length) return { code: 'MONSTER_DEFEAT_DIAG_MONSTER_SCHEMA_UNREADABLE', stage: 'monster-schema' };
  if (!combatantColumns?.length) return { code: 'MONSTER_DEFEAT_DIAG_COMBATANT_SCHEMA_UNREADABLE', stage: 'combatant-schema' };

  let target = null;
  try {
    target = await env.DB.prepare(`
      SELECT id, entity_type, entity_id, action_available, move_available, turn_completed
      FROM combatants
      WHERE id = ? AND combat_id = ?
      LIMIT 1
    `).bind(targetCombatantId, combatId).first();
  } catch {
    return { code: 'MONSTER_DEFEAT_DIAG_TARGET_LOOKUP_FAILED', stage: 'target-lookup' };
  }
  if (!target) return { code: 'MONSTER_DEFEAT_DIAG_TARGET_MISSING', stage: 'target-lookup' };
  if (target.entity_type !== 'monster_instance') {
    return { code: 'MONSTER_DEFEAT_DIAG_TARGET_TYPE_CHANGED', stage: 'target-lookup' };
  }

  let monster = null;
  try {
    monster = await env.DB.prepare(`
      SELECT id, status, current_hp, final_max_hp, stored_defence, defence_modifier,
             armor_base_defence, armor_defence_adjustment
      FROM monster_instances WHERE id = ? LIMIT 1
    `).bind(target.entity_id).first();
  } catch {
    return { code: 'MONSTER_DEFEAT_DIAG_MONSTER_LOOKUP_FAILED', stage: 'monster-lookup' };
  }
  if (!monster) return { code: 'MONSTER_DEFEAT_DIAG_MONSTER_MISSING', stage: 'monster-lookup' };

  let auditCount = null;
  try {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM player_monster_action_log
      WHERE combat_id = ? AND target_combatant_id = ?
    `).bind(combatId, targetCombatantId).first();
    auditCount = Number(row?.total || 0);
  } catch {
    return { code: 'MONSTER_DEFEAT_DIAG_AUDIT_READ_FAILED', stage: 'audit-read' };
  }

  const hp = Number(monster.current_hp);
  const status = String(monster.status || '').toLowerCase();
  if (auditCount > 0) {
    return {
      code: 'MONSTER_DEFEAT_DIAG_POST_AUDIT_FAILURE',
      stage: 'post-audit-refresh',
      monsterDefeated: status === 'defeated' || hp <= 0
    };
  }
  if (status === 'defeated' || hp <= 0) {
    return {
      code: 'MONSTER_DEFEAT_DIAG_AUDIT_WRITE_FAILURE',
      stage: 'audit-write-after-damage',
      monsterDefeated: true
    };
  }

  return {
    code: 'MONSTER_DEFEAT_DIAG_PRE_AUDIT_FAILURE',
    stage: 'pre-audit',
    monsterDefeated: false
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/player\/combat\/([^/]+)\/attack$/);
    if (!match || request.method !== 'POST') return baseWorker.fetch(request, env);

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

    const requestCopy = request.clone();
    const response = await baseWorker.fetch(request, env);
    if (response.status !== 500) return response;

    const payload = await safeJson(response);
    if (payload?.error?.code !== 'MONSTER_DEFEAT_SERVICE_ERROR') return response;

    let body = null;
    try { body = await requestCopy.json(); }
    catch { return response; }
    const targetCombatantId = String(body?.targetCombatantId || '').trim();
    if (!targetCombatantId) return response;

    const diagnostic = await diagnoseMonsterAttackFailure(
      env,
      decodeURIComponent(match[1]),
      targetCombatantId
    );
    console.error('Temporary Monster defeat live diagnostic', diagnostic);
    return json({
      ok: false,
      error: {
        code: diagnostic.code,
        message: 'Player → Monster Attack production diagnostic detected a runtime integration failure.',
        stage: diagnostic.stage
      }
    }, 500);
  }
};
