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

async function tableColumns(env, table) {
  try {
    const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    return (rows.results || []).map(row => String(row.name));
  } catch {
    return null;
  }
}

async function diagnoseMonsterAttackFailure(env, combatId, targetCombatantId) {
  if (!env.DB) return { code: 'MONSTER_DEFEAT_DIAG_DATABASE_UNAVAILABLE', stage: 'database-binding' };

  const [auditColumns, monsterColumns, combatantColumns] = await Promise.all([
    tableColumns(env, 'player_monster_action_log'),
    tableColumns(env, 'monster_instances'),
    tableColumns(env, 'combatants')
  ]);

  if (!auditColumns) return { code: 'MONSTER_DEFEAT_DIAG_AUDIT_SCHEMA_UNREADABLE', stage: 'audit-schema' };
  const missingAuditColumns = EXPECTED_AUDIT_COLUMNS.filter(column => !auditColumns.includes(column));
  if (missingAuditColumns.length) {
    return {
      code: 'MONSTER_DEFEAT_DIAG_AUDIT_SCHEMA_DRIFT',
      stage: 'audit-schema',
      missingColumnCount: missingAuditColumns.length
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
