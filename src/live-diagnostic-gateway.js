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

const EXPECTED_MONSTER_COLUMNS = [
  'id', 'display_name', 'status', 'current_hp', 'final_max_hp',
  'stored_defence', 'defence_modifier', 'armor_name', 'armor_base_defence',
  'armor_defence_adjustment', 'final_armor_defence', 'updated_at'
];

const EXPECTED_COMBATANT_COLUMNS = [
  'id', 'combat_id', 'entity_type', 'entity_id', 'controller_user_id',
  'initiative_order', 'action_available', 'move_available', 'turn_completed', 'updated_at'
];

const EXPECTED_COMBAT_COLUMNS = [
  'id', 'status', 'round_number', 'current_turn_index'
];

const EXPECTED_PROFILE_COLUMNS = [
  'id', 'character_id', 'name', 'stored_accuracy', 'damage_dice_count',
  'damage_dice_sides', 'fixed_damage_modifier', 'applies_character_damage_bonus', 'is_active'
];

const EXPECTED_ATTRIBUTE_COLUMNS = ['character_id', 'key', 'value'];

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

function missingColumns(actual, expected) {
  if (!Array.isArray(actual)) return [...expected];
  const available = new Set(actual);
  return expected.filter(column => !available.has(column));
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

async function diagnoseMonsterAttackFailure(env, combatId, targetCombatantId, profileId) {
  if (!env.DB) return { code: 'MONSTER_DEFEAT_DIAG_DATABASE_UNAVAILABLE', stage: 'database-binding' };

  const [auditInfo, monsterColumns, combatantColumns, combatColumns, profileColumns, attributeColumns] = await Promise.all([
    tableInfo(env, 'player_monster_action_log'),
    tableColumns(env, 'monster_instances'),
    tableColumns(env, 'combatants'),
    tableColumns(env, 'combats'),
    tableColumns(env, 'player_attack_profiles'),
    tableColumns(env, 'character_attributes')
  ]);

  if (!auditInfo) return { code: 'MONSTER_DEFEAT_DIAG_AUDIT_SCHEMA_UNREADABLE', stage: 'audit-schema' };
  const auditColumns = auditInfo.map(row => String(row.name));
  const missingAuditColumns = missingColumns(auditColumns, EXPECTED_AUDIT_COLUMNS);
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

  for (const [actual, expected, code, stage] of [
    [monsterColumns, EXPECTED_MONSTER_COLUMNS, 'MONSTER_DEFEAT_DIAG_MONSTER_SCHEMA_DRIFT', 'monster-schema'],
    [combatantColumns, EXPECTED_COMBATANT_COLUMNS, 'MONSTER_DEFEAT_DIAG_COMBATANT_SCHEMA_DRIFT', 'combatant-schema'],
    [combatColumns, EXPECTED_COMBAT_COLUMNS, 'MONSTER_DEFEAT_DIAG_COMBAT_SCHEMA_DRIFT', 'combat-schema'],
    [profileColumns, EXPECTED_PROFILE_COLUMNS, 'MONSTER_DEFEAT_DIAG_PROFILE_SCHEMA_DRIFT', 'profile-schema'],
    [attributeColumns, EXPECTED_ATTRIBUTE_COLUMNS, 'MONSTER_DEFEAT_DIAG_ATTRIBUTE_SCHEMA_DRIFT', 'attribute-schema']
  ]) {
    if (!actual?.length) return { code: code.replace('_DRIFT', '_UNREADABLE'), stage };
    const missing = missingColumns(actual, expected);
    if (missing.length) return { code, stage, missingColumnCount: missing.length };
  }

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

  let actor = null;
  try {
    actor = await env.DB.prepare(`
      SELECT cb.id, cb.entity_type, cb.entity_id, cb.controller_user_id,
             cb.action_available, cb.move_available, cb.turn_completed
      FROM combats c
      JOIN combatants cb
        ON cb.combat_id = c.id AND cb.initiative_order = c.current_turn_index
      WHERE c.id = ? AND c.status = 'active'
      LIMIT 1
    `).bind(combatId).first();
  } catch {
    return { code: 'MONSTER_DEFEAT_DIAG_ACTOR_LOOKUP_FAILED', stage: 'actor-lookup' };
  }
  if (!actor) return { code: 'MONSTER_DEFEAT_DIAG_ACTOR_MISSING', stage: 'actor-lookup' };
  if (actor.entity_type !== 'character') {
    return { code: 'MONSTER_DEFEAT_DIAG_ACTOR_TYPE_CHANGED', stage: 'actor-lookup' };
  }

  if (!profileId) return { code: 'MONSTER_DEFEAT_DIAG_PROFILE_ID_MISSING', stage: 'profile-lookup' };
  try {
    const profile = await env.DB.prepare(`
      SELECT id, character_id, stored_accuracy, damage_dice_count, damage_dice_sides,
             fixed_damage_modifier, applies_character_damage_bonus, is_active
      FROM player_attack_profiles
      WHERE id = ? AND character_id = ? AND is_active = 1
      LIMIT 1
    `).bind(profileId, actor.entity_id).first();
    if (!profile) return { code: 'MONSTER_DEFEAT_DIAG_PROFILE_MISSING', stage: 'profile-lookup' };
  } catch {
    return { code: 'MONSTER_DEFEAT_DIAG_PROFILE_LOOKUP_FAILED', stage: 'profile-lookup' };
  }

  try {
    await env.DB.prepare(`
      SELECT UPPER(key) AS key, value
      FROM character_attributes
      WHERE character_id = ? AND UPPER(key) IN (?, ?)
    `).bind(actor.entity_id, 'STR', 'SIZ').all();
  } catch {
    return { code: 'MONSTER_DEFEAT_DIAG_ATTRIBUTE_LOOKUP_FAILED', stage: 'attribute-lookup' };
  }

  let monster = null;
  try {
    monster = await env.DB.prepare(`
      SELECT id, display_name, status, current_hp, final_max_hp,
             stored_defence, defence_modifier,
             armor_name, armor_base_defence, armor_defence_adjustment, final_armor_defence
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
  const maxHp = Number(monster.final_max_hp);
  const status = String(monster.status || '').toLowerCase();
  const actionReserved = !Boolean(actor.action_available);

  if (auditCount > 0) {
    return {
      code: 'MONSTER_DEFEAT_DIAG_POST_AUDIT_FAILURE',
      stage: 'post-audit-refresh',
      monsterDefeated: status === 'defeated' || hp <= 0,
      actionReserved
    };
  }
  if (status === 'defeated' || hp <= 0 || (Number.isFinite(maxHp) && hp < maxHp)) {
    return {
      code: 'MONSTER_DEFEAT_DIAG_AUDIT_WRITE_FAILURE',
      stage: 'audit-write-after-damage',
      monsterDefeated: status === 'defeated' || hp <= 0,
      actionReserved
    };
  }
  if (actionReserved) {
    return {
      code: 'MONSTER_DEFEAT_DIAG_POST_RESERVATION_FAILURE',
      stage: 'post-action-reservation-pre-audit',
      monsterDefeated: false,
      actionReserved: true
    };
  }

  return {
    code: 'MONSTER_DEFEAT_DIAG_PRE_RESERVATION_FAILURE',
    stage: 'pre-action-reservation',
    monsterDefeated: false,
    actionReserved: false
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
    const profileId = String(body?.profileId || '').trim();
    if (!targetCombatantId) return response;

    const diagnostic = await diagnoseMonsterAttackFailure(
      env,
      decodeURIComponent(match[1]),
      targetCombatantId,
      profileId
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
