import { loadRuntimeEncounterMap } from './runtime-encounter-state.js';

const RESOLUTION_SOURCES = new Set(['combat_hostiles_cleared', 'gm_manual']);
const TERMINAL_HOSTILE_STATUSES = new Set(['defeated', 'removed']);
let resolutionSchemaPromise = null;

function problem(message, status = 409, code = 'RUNTIME_ENCOUNTER_RESOLUTION_FAILED', extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

function cleanText(value, max = 180) {
  return String(value ?? '').trim().normalize('NFKC').slice(0, max);
}

export async function ensureRuntimeEncounterResolutionSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!resolutionSchemaPromise) {
    resolutionSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_encounter_resolution_log (
        id TEXT PRIMARY KEY,
        scene_run_id TEXT NOT NULL,
        encounter_id TEXT NOT NULL,
        from_status TEXT NOT NULL CHECK (from_status IN ('planned', 'active', 'resolved', 'skipped')),
        to_status TEXT NOT NULL CHECK (to_status = 'resolved'),
        resolution_source TEXT NOT NULL CHECK (resolution_source IN ('combat_hostiles_cleared', 'gm_manual')),
        combat_id TEXT,
        resolved_by_user_id TEXT,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (scene_run_id, encounter_id) REFERENCES runtime_encounter_states(scene_run_id, encounter_id) ON DELETE CASCADE,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE SET NULL,
        FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_resolution_scene ON runtime_encounter_resolution_log(scene_run_id, encounter_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_encounter_resolution_combat ON runtime_encounter_resolution_log(combat_id, created_at)')
    ]).catch(error => {
      resolutionSchemaPromise = null;
      throw error;
    });
  }
  await resolutionSchemaPromise;
}

function mapHostile(participant, row) {
  if (!row) {
    return {
      entityType: participant.entity_type,
      entityId: participant.entity_id,
      displayName: participant.display_name_snapshot || participant.entity_id,
      status: 'missing',
      currentHp: null,
      terminal: false,
      blocker: 'instance_missing'
    };
  }
  const status = String(row.status || '').toLowerCase();
  const currentHp = Number(row.current_hp);
  const terminal = TERMINAL_HOSTILE_STATUSES.has(status);
  return {
    entityType: participant.entity_type,
    entityId: participant.entity_id,
    displayName: participant.display_name_snapshot || row.display_name || participant.entity_id,
    status,
    currentHp: Number.isFinite(currentHp) ? currentHp : null,
    terminal,
    blocker: terminal ? null : (status === 'active' ? 'hostile_active' : 'hostile_state_not_terminal')
  };
}

export async function loadRuntimeEncounterResolutionReadiness(env, sceneRunId, encounterId) {
  const normalizedSceneRunId = cleanText(sceneRunId);
  const normalizedEncounterId = cleanText(encounterId);
  if (!normalizedSceneRunId || !normalizedEncounterId) throw problem('Resolution readiness 缺少 Scene Run / Encounter reference。', 400, 'VALIDATION_ERROR');

  const participantRows = await env.DB.prepare(`
    SELECT entity_type, entity_id, display_name_snapshot
    FROM runtime_encounter_participants
    WHERE scene_run_id = ? AND encounter_id = ?
      AND entity_type IN ('monster_instance', 'boss_instance')
    ORDER BY CASE entity_type WHEN 'monster_instance' THEN 0 ELSE 1 END, created_at, id
  `).bind(normalizedSceneRunId, normalizedEncounterId).all();
  const participants = participantRows.results || [];
  const monsterIds = participants.filter(row => row.entity_type === 'monster_instance').map(row => row.entity_id);
  const bossIds = participants.filter(row => row.entity_type === 'boss_instance').map(row => row.entity_id);

  let monsterRows = [], bossRows = [];
  if (monsterIds.length) {
    const placeholders = monsterIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id, display_name, status, current_hp
      FROM monster_instances WHERE id IN (${placeholders})
    `).bind(...monsterIds).all();
    monsterRows = rows.results || [];
  }
  if (bossIds.length) {
    const placeholders = bossIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id, display_name, status, current_hp
      FROM boss_instances WHERE id IN (${placeholders})
    `).bind(...bossIds).all();
    bossRows = rows.results || [];
  }

  const monsterById = new Map(monsterRows.map(row => [row.id, row]));
  const bossById = new Map(bossRows.map(row => [row.id, row]));
  const hostiles = participants.map(participant => mapHostile(
    participant,
    participant.entity_type === 'monster_instance' ? monsterById.get(participant.entity_id) : bossById.get(participant.entity_id)
  ));
  const blockers = hostiles.filter(item => !item.terminal);
  return {
    sceneRunId: normalizedSceneRunId,
    encounterId: normalizedEncounterId,
    hostileCount: hostiles.length,
    terminalHostileCount: hostiles.length - blockers.length,
    blockerCount: blockers.length,
    cleared: hostiles.length > 0 && blockers.length === 0,
    hostiles,
    blockers
  };
}

export async function findRuntimeEncounterByCombat(env, combatId) {
  const normalizedCombatId = cleanText(combatId);
  if (!normalizedCombatId) return null;
  const row = await env.DB.prepare(`
    SELECT rec.scene_run_id, rec.encounter_id, rec.map_instance_id, rec.combat_id,
           rmi.scene_id, res.status AS encounter_status, c.status AS combat_status
    FROM runtime_encounter_combats rec
    JOIN runtime_map_instances rmi ON rmi.id = rec.map_instance_id
    JOIN runtime_encounter_states res
      ON res.scene_run_id = rec.scene_run_id AND res.encounter_id = rec.encounter_id
    LEFT JOIN combats c ON c.id = rec.combat_id
    WHERE rec.combat_id = ?
    LIMIT 1
  `).bind(normalizedCombatId).first();
  if (!row) return null;
  return {
    sceneRunId: row.scene_run_id,
    sceneId: row.scene_id,
    encounterId: row.encounter_id,
    mapInstanceId: row.map_instance_id,
    combatId: row.combat_id,
    encounterStatus: row.encounter_status,
    combatStatus: row.combat_status || 'missing'
  };
}

export async function loadRuntimeEncounterResolutionLog(env, sceneRunId, encounterId) {
  await ensureRuntimeEncounterResolutionSchema(env);
  const rows = await env.DB.prepare(`
    SELECT * FROM runtime_encounter_resolution_log
    WHERE scene_run_id = ? AND encounter_id = ?
    ORDER BY created_at DESC, id DESC
  `).bind(sceneRunId, encounterId).all();
  return (rows.results || []).map(row => ({
    id: row.id,
    sceneRunId: row.scene_run_id,
    encounterId: row.encounter_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    source: row.resolution_source,
    combatId: row.combat_id || null,
    resolvedByUserId: row.resolved_by_user_id || null,
    detail: (() => { try { return JSON.parse(row.detail_json || '{}'); } catch { return {}; } })(),
    createdAt: row.created_at
  }));
}

export async function resolveRuntimeEncounter(env, {
  sceneRunId,
  sceneId,
  encounterId,
  actorUserId = null,
  source = 'gm_manual',
  combatId = null,
  requireHostilesCleared = false
}) {
  await ensureRuntimeEncounterResolutionSchema(env);
  const normalizedSceneRunId = cleanText(sceneRunId);
  const normalizedSceneId = cleanText(sceneId);
  const normalizedEncounterId = cleanText(encounterId);
  const normalizedActor = cleanText(actorUserId);
  const normalizedSource = String(source || '').trim().toLowerCase();
  const normalizedCombatId = cleanText(combatId);
  if (!normalizedSceneRunId || !normalizedSceneId || !normalizedEncounterId) {
    throw problem('Runtime Encounter resolution 缺少必要 reference。', 400, 'VALIDATION_ERROR');
  }
  if (!RESOLUTION_SOURCES.has(normalizedSource)) throw problem('Runtime Encounter resolution source 無效。', 400, 'VALIDATION_ERROR');

  const encounterMap = await loadRuntimeEncounterMap(env, normalizedSceneRunId, normalizedSceneId);
  const current = encounterMap.get(normalizedEncounterId);
  if (!current) throw problem('Runtime Encounter 不存在於呢個 Scene Run。', 404, 'RUNTIME_ENCOUNTER_NOT_FOUND');
  if (current.status === 'resolved') {
    return {
      resolved: true,
      changed: false,
      runtimeEncounter: current,
      readiness: await loadRuntimeEncounterResolutionReadiness(env, normalizedSceneRunId, normalizedEncounterId),
      resolutionLog: (await loadRuntimeEncounterResolutionLog(env, normalizedSceneRunId, normalizedEncounterId))[0] || null
    };
  }
  if (current.status !== 'active') {
    throw problem(`Runtime Encounter cannot resolve from status ${current.status}.`, 409, 'RUNTIME_ENCOUNTER_NOT_ACTIVE');
  }

  if (current.combat?.status === 'active') {
    throw problem('Active Combat 必須先結束先可以 Resolve Runtime Encounter。', 409, 'RUNTIME_ENCOUNTER_COMBAT_ACTIVE', {
      combatId: current.combat.combatId
    });
  }
  if (normalizedCombatId) {
    if (!current.combat || current.combat.combatId !== normalizedCombatId) {
      throw problem('Combat 唔屬於指定 Runtime Encounter。', 409, 'RUNTIME_ENCOUNTER_COMBAT_MISMATCH');
    }
    if (current.combat.status !== 'ended') {
      throw problem('Linked Combat 尚未結束。', 409, 'RUNTIME_ENCOUNTER_COMBAT_NOT_ENDED');
    }
  }

  const readiness = await loadRuntimeEncounterResolutionReadiness(env, normalizedSceneRunId, normalizedEncounterId);
  if (requireHostilesCleared && !readiness.cleared) {
    return {
      resolved: false,
      changed: false,
      reason: readiness.hostileCount === 0 ? 'NO_HOSTILE_PARTICIPANTS' : 'HOSTILES_REMAIN',
      runtimeEncounter: current,
      readiness,
      resolutionLog: null
    };
  }

  const now = Date.now();
  const logId = `runtime_resolution_${crypto.randomUUID()}`;
  const detail = {
    hostileCount: readiness.hostileCount,
    terminalHostileCount: readiness.terminalHostileCount,
    blockers: readiness.blockers.map(item => ({
      entityType: item.entityType,
      entityId: item.entityId,
      status: item.status,
      currentHp: item.currentHp,
      blocker: item.blocker
    }))
  };
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE runtime_encounter_states
      SET status = 'resolved', resolved_at = COALESCE(resolved_at, ?), updated_at = ?
      WHERE scene_run_id = ? AND encounter_id = ? AND status = 'active'
    `).bind(now, now, normalizedSceneRunId, normalizedEncounterId),
    env.DB.prepare(`
      INSERT INTO runtime_encounter_resolution_log (
        id, scene_run_id, encounter_id, from_status, to_status,
        resolution_source, combat_id, resolved_by_user_id, detail_json, created_at
      )
      SELECT ?, ?, ?, 'active', 'resolved', ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM runtime_encounter_states
        WHERE scene_run_id = ? AND encounter_id = ?
          AND status = 'resolved' AND resolved_at = ? AND updated_at = ?
      )
    `).bind(
      logId, normalizedSceneRunId, normalizedEncounterId, normalizedSource,
      normalizedCombatId || null, normalizedActor || null, JSON.stringify(detail), now,
      normalizedSceneRunId, normalizedEncounterId, now, now
    )
  ]);

  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    const refreshedMap = await loadRuntimeEncounterMap(env, normalizedSceneRunId, normalizedSceneId);
    const refreshed = refreshedMap.get(normalizedEncounterId);
    if (refreshed?.status === 'resolved') {
      return {
        resolved: true,
        changed: false,
        runtimeEncounter: refreshed,
        readiness,
        resolutionLog: (await loadRuntimeEncounterResolutionLog(env, normalizedSceneRunId, normalizedEncounterId))[0] || null
      };
    }
    throw problem('Runtime Encounter state changed before resolution.', 409, 'RUNTIME_ENCOUNTER_RESOLUTION_CHANGED');
  }

  const refreshedMap = await loadRuntimeEncounterMap(env, normalizedSceneRunId, normalizedSceneId);
  const logs = await loadRuntimeEncounterResolutionLog(env, normalizedSceneRunId, normalizedEncounterId);
  return {
    resolved: true,
    changed: true,
    runtimeEncounter: refreshedMap.get(normalizedEncounterId) || null,
    readiness,
    resolutionLog: logs.find(item => item.id === logId) || logs[0] || null
  };
}
