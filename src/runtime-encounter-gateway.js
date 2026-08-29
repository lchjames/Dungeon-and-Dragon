import baseWorker from './story-zone-trigger-gateway.js';
import { buildCombatInitiative } from './rules.js';
import {
  MONSTER_ATTRIBUTE_KEYS,
  buildMonsterAttributes,
  monsterCalculatedResources,
  snapshotMonsterSkill,
  validateMonsterLevel
} from './monster-rules.js';
import {
  linkRuntimeEncounterCombat,
  loadRuntimeEncounterMap
} from './runtime-encounter-state.js';

const GM_ROLES = new Set(['gm', 'admin']);

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

function apiError(message, status = 400, code = 'BAD_REQUEST', extra = {}) {
  return json({ ok: false, error: { code, message, ...extra } }, status);
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

function cleanText(value, max = 4000) {
  return String(value ?? '').trim().normalize('NFKC').slice(0, max);
}

async function downstreamJson(request, env, pathname, options = {}) {
  const response = await baseWorker.fetch(new Request(new URL(pathname, request.url), {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || '',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json', Origin: new URL(request.url).origin } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  }), env);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || `Downstream request failed: ${pathname}`), {
      status: response.status,
      code: payload?.error?.code || 'DOWNSTREAM_REQUEST_FAILED',
      payload
    });
  }
  return payload;
}

async function requireGM(request, env) {
  const payload = await downstreamJson(request, env, '/api/auth/me');
  const user = payload?.user || null;
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function ensureMonsterDependencies(request, env) {
  // The legacy Monster gateway remains the schema owner during this migration slice.
  // Calling its GM overview route is an idempotent compatibility guard and avoids
  // duplicating the large Monster schema definition here.
  await downstreamJson(request, env, '/api/gm/monsters');
}

async function runtimeDetail(request, env, mapInstanceId) {
  return downstreamJson(request, env, `/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
}

function runtimeEncounter(detail, encounterId) {
  return (detail?.runtimeEncounters || []).find(item => item.encounterId === encounterId) || null;
}

function templateConfig(row) {
  const ranges = {};
  const growthWeights = {};
  for (const key of MONSTER_ATTRIBUTE_KEYS) {
    const lower = key.toLowerCase();
    ranges[key] = { min: Number(row[`${lower}_min`]), max: Number(row[`${lower}_max`]) };
    growthWeights[key] = Number(row[`${lower}_growth_weight`]);
  }
  return { ranges, growthWeights };
}

function skillProfile(row) {
  let links = [];
  try { links = JSON.parse(row.damage_attribute_links || '[]'); } catch { links = []; }
  return {
    id: row.id,
    sourceScope: row.source_scope,
    name: row.name,
    storedAccuracy: Number(row.stored_accuracy),
    damageType: row.damage_type,
    templateBaseDamage: Number(row.template_base_damage),
    damageGrowthWeight: Number(row.damage_growth_weight),
    damageAttributeLinks: links,
    rangeText: row.range_text || '',
    targetingText: row.targeting_text || 'single target',
    mpCost: Number(row.mp_cost || 0),
    cooldownRounds: Number(row.cooldown_rounds || 0),
    gmNotes: row.gm_notes || ''
  };
}

async function spawnRuntimeMonster(request, env, mapInstanceId, encounterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const gm = await requireGM(request, env);
  await ensureMonsterDependencies(request, env);
  const body = await readBody(request);
  const templateId = cleanText(body?.templateId, 160);
  const sourceSpawnPointId = cleanText(body?.sourceSpawnPointId, 160);
  if (!templateId || !sourceSpawnPointId) {
    return apiError('templateId 同 sourceSpawnPointId 都係必填。', 400, 'VALIDATION_ERROR');
  }
  let level;
  try { level = validateMonsterLevel(body?.level); } catch (error) {
    return apiError(error.message, 400, 'VALIDATION_ERROR');
  }

  const detail = await runtimeDetail(request, env, mapInstanceId);
  if (detail?.mapInstance?.status !== 'active') return apiError('Runtime Map 已關閉。', 409, 'RUNTIME_MAP_CLOSED');
  const encounter = runtimeEncounter(detail, encounterId);
  if (!encounter) return apiError('Runtime Encounter 不存在於呢個 Scene Run。', 404, 'RUNTIME_ENCOUNTER_NOT_FOUND');
  if (encounter.status !== 'active') return apiError('Runtime Encounter 必須先 active 先可以 Spawn Monster。', 409, 'RUNTIME_ENCOUNTER_NOT_ACTIVE');
  if (encounter.combat) return apiError('Runtime Encounter 已連結 Combat，唔可以再 Spawn Monster。', 409, 'RUNTIME_ENCOUNTER_COMBAT_EXISTS');

  const spawn = (detail.spawnPoints || []).find(item => item.sourceSpawnPointId === sourceSpawnPointId);
  if (!spawn || !spawn.enabled) return apiError('Runtime Spawn Point 不存在或已停用。', 404, 'RUNTIME_SPAWN_NOT_FOUND');
  if (spawn.spawnType !== 'any' && spawn.spawnType !== 'monster') {
    return apiError('呢個 Spawn Point 唔接受 Monster。', 409, 'SPAWN_TYPE_MISMATCH');
  }
  const blocked = await env.DB.prepare(`
    SELECT 1 AS blocked FROM runtime_map_cells
    WHERE map_instance_id = ? AND x = ? AND y = ? AND is_walkable = 0 LIMIT 1
  `).bind(mapInstanceId, spawn.x, spawn.y).first();
  if (blocked) return apiError('Monster Spawn Point 位於 blocked Cell。', 409, 'POSITION_BLOCKED');
  const occupied = await env.DB.prepare(`
    SELECT entity_type, entity_id FROM runtime_entity_positions
    WHERE map_instance_id = ? AND x = ? AND y = ? LIMIT 1
  `).bind(mapInstanceId, spawn.x, spawn.y).first();
  if (occupied) {
    return apiError('Monster Spawn Point 已被其他 Entity 佔用。', 409, 'POSITION_OCCUPIED', {
      occupiedBy: { entityType: occupied.entity_type, entityId: occupied.entity_id }
    });
  }

  const templateRow = await env.DB.prepare('SELECT * FROM monster_templates WHERE id = ? LIMIT 1').bind(templateId).first();
  if (!templateRow) return apiError('找不到 Monster Template。', 404, 'MONSTER_TEMPLATE_NOT_FOUND');
  if (!Boolean(templateRow.is_active)) return apiError('Inactive Monster Template 不能 Spawn。', 409, 'MONSTER_TEMPLATE_INACTIVE');
  const skillRows = await env.DB.prepare(`
    SELECT sp.*
    FROM monster_template_skills ts
    JOIN monster_skill_profiles sp ON sp.id = ts.skill_profile_id
    WHERE ts.template_id = ? AND sp.is_active = 1
    ORDER BY ts.sort_order, ts.created_at
  `).bind(templateId).all();

  const config = templateConfig(templateRow);
  const generated = buildMonsterAttributes({ ranges: config.ranges, growthWeights: config.growthWeights, level });
  const resources = monsterCalculatedResources(generated.effective);
  const monsterId = `monster_${crypto.randomUUID()}`;
  const displayName = cleanText(body?.displayName, 120) || templateRow.name;
  const now = Date.now();
  const statements = [
    env.DB.prepare(`
      INSERT INTO monster_instances (
        id, template_id, encounter_id, display_name, level, status, is_elite, elite_roll, elite_bonus,
        base_str, base_dex, base_con, base_pow, base_int, base_siz,
        natural_str, natural_dex, natural_con, natural_pow, natural_int, natural_siz,
        effective_str, effective_dex, effective_con, effective_pow, effective_int, effective_siz,
        calculated_max_hp, hp_max_adjustment, final_max_hp, current_hp,
        calculated_max_mp, mp_max_adjustment, final_max_mp, current_mp,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).bind(
      monsterId, templateId, encounterId, displayName, level,
      generated.isElite ? 1 : 0, generated.eliteRoll, generated.eliteBonus,
      generated.baseRolls.STR, generated.baseRolls.DEX, generated.baseRolls.CON, generated.baseRolls.POW, generated.baseRolls.INT, generated.baseRolls.SIZ,
      generated.natural.STR, generated.natural.DEX, generated.natural.CON, generated.natural.POW, generated.natural.INT, generated.natural.SIZ,
      generated.effective.STR, generated.effective.DEX, generated.effective.CON, generated.effective.POW, generated.effective.INT, generated.effective.SIZ,
      resources.maxHp, resources.maxHp, resources.maxHp,
      resources.maxMp, resources.maxMp, resources.maxMp,
      gm.id, now, now
    ),
    env.DB.prepare(`
      INSERT INTO runtime_encounter_participants (
        id, scene_run_id, encounter_id, entity_type, entity_id, display_name_snapshot,
        source_encounter_participant_id, source_kind, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'monster_instance', ?, ?, NULL, 'runtime_spawn', ?, ?, ?)
    `).bind(
      `runtime_ep_${crypto.randomUUID()}`,
      detail.mapInstance.sceneRunId,
      encounterId,
      monsterId,
      displayName,
      gm.id,
      now,
      now
    ),
    env.DB.prepare(`
      INSERT INTO runtime_entity_positions (
        id, map_instance_id, entity_type, entity_id, x, y, visibility_mode,
        placed_by_user_id, created_at, updated_at
      ) VALUES (?, ?, 'monster_instance', ?, ?, ?, 'default', ?, ?, ?)
    `).bind(
      `runtime_position_${crypto.randomUUID()}`,
      mapInstanceId,
      monsterId,
      spawn.x,
      spawn.y,
      gm.id,
      now,
      now
    )
  ];

  for (const row of skillRows.results || []) {
    const skill = skillProfile(row);
    const snapshot = snapshotMonsterSkill(skill, { level, effectiveAttributes: generated.effective });
    statements.push(env.DB.prepare(`
      INSERT INTO monster_instance_skills (
        id, monster_instance_id, source_skill_profile_id, source_scope, name,
        stored_accuracy, hit_modifier, damage_type, template_base_damage, damage_growth_weight,
        damage_attribute_links, damage_attribute_values, damage_attribute_basis,
        calculated_base_damage, calculated_damage_center,
        suggested_spread_min, suggested_spread_max, final_spread_min, final_spread_max,
        range_text, targeting_text, mp_cost, cooldown_rounds, gm_notes, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      `msnap_${crypto.randomUUID()}`, monsterId, skill.id, skill.sourceScope, skill.name,
      skill.storedAccuracy, skill.damageType, skill.templateBaseDamage, skill.damageGrowthWeight,
      JSON.stringify(snapshot.damageAttributeLinks), JSON.stringify(snapshot.damageAttributeValues), snapshot.damageAttributeBasis,
      snapshot.calculatedBaseDamage, snapshot.calculatedDamageCenter,
      snapshot.suggestedSpreadMin, snapshot.suggestedSpreadMax, snapshot.finalSpreadMin, snapshot.finalSpreadMax,
      skill.rangeText, skill.targetingText, skill.mpCost, skill.cooldownRounds, skill.gmNotes, now, now
    ));
  }

  await env.DB.batch(statements);
  const refreshed = await runtimeDetail(request, env, mapInstanceId);
  return json({
    ok: true,
    monster: {
      id: monsterId,
      templateId,
      encounterId,
      displayName,
      level,
      isElite: Boolean(generated.isElite),
      status: 'active'
    },
    spawnPoint: {
      sourceSpawnPointId,
      runtimeSpawnPointId: spawn.id,
      x: spawn.x,
      y: spawn.y
    },
    runtimeEncounter: runtimeEncounter(refreshed, encounterId),
    position: (refreshed.positions || []).find(item => item.entityType === 'monster_instance' && item.entityId === monsterId) || null
  }, 201);
}

async function cleanupCombat(request, env, combatId) {
  try {
    await downstreamJson(request, env, `/api/gm/combat/${encodeURIComponent(combatId)}/end`, { method: 'POST', body: {} });
  } catch (error) {
    console.error('Unable to clean up Runtime Encounter Combat', { combatId, message: String(error?.message || error) });
  }
}

async function startRuntimeEncounterCombat(request, env, mapInstanceId, encounterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const gm = await requireGM(request, env);
  await ensureMonsterDependencies(request, env);
  const detail = await runtimeDetail(request, env, mapInstanceId);
  if (detail?.mapInstance?.status !== 'active') return apiError('Runtime Map 已關閉。', 409, 'RUNTIME_MAP_CLOSED');
  const encounter = runtimeEncounter(detail, encounterId);
  if (!encounter) return apiError('Runtime Encounter 不存在於呢個 Scene Run。', 404, 'RUNTIME_ENCOUNTER_NOT_FOUND');
  if (encounter.status !== 'active') return apiError('Runtime Encounter 必須為 active 先可以開始 Combat。', 409, 'RUNTIME_ENCOUNTER_NOT_ACTIVE');
  if (encounter.combat) return apiError('Runtime Encounter 已經有 linked Combat。', 409, 'RUNTIME_ENCOUNTER_COMBAT_EXISTS');

  const participants = encounter.participants || [];
  const bossParticipants = participants.filter(item => item.entityType === 'boss_instance');
  if (bossParticipants.length) {
    return apiError('Runtime Boss Combat 會喺下一個 Boss migration slice 接入；目前唔會 fallback 去 Definition Combat。', 409, 'RUNTIME_BOSS_COMBAT_NOT_READY');
  }
  const characterIds = participants.filter(item => item.entityType === 'character').map(item => item.entityId);
  const monsterIds = participants.filter(item => item.entityType === 'monster_instance').map(item => item.entityId);
  if (!characterIds.length) return apiError('Runtime Encounter 至少要有一個 Character participant。', 409, 'ENCOUNTER_CHARACTER_REQUIRED');

  const positioned = new Set((detail.positions || []).map(item => `${item.entityType}:${item.entityId}`));
  const missingPositions = participants
    .filter(item => !positioned.has(`${item.entityType}:${item.entityId}`))
    .map(item => ({ entityType: item.entityType, entityId: item.entityId, displayName: item.displayName }));
  if (missingPositions.length) {
    return apiError('所有 Runtime Encounter participants 必須先放喺同一張 Runtime Map。', 409, 'RUNTIME_ENCOUNTER_POSITION_REQUIRED', { missingPositions });
  }

  let monsterRows = [];
  if (monsterIds.length) {
    const placeholders = monsterIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id, display_name, effective_dex, status
      FROM monster_instances
      WHERE id IN (${placeholders})
    `).bind(...monsterIds).all();
    monsterRows = rows.results || [];
    if (monsterRows.length !== monsterIds.length) return apiError('部分 Runtime Monster Instance 不存在。', 409, 'MONSTER_INSTANCE_NOT_FOUND');
    const invalid = monsterRows.find(row => row.status !== 'active');
    if (invalid) return apiError(`${invalid.display_name} 目前唔係 active Monster Instance。`, 409, 'MONSTER_INSTANCE_NOT_ACTIVE');
  }

  const startPayload = await downstreamJson(request, env, '/api/gm/combat/start', {
    method: 'POST',
    body: { characterIds }
  });
  const baseCombat = startPayload?.combat;
  if (!baseCombat?.id) return apiError('Combat 建立失敗。', 500, 'COMBAT_START_FAILED');

  const initiativeInput = [];
  for (const item of baseCombat.combatants || []) {
    initiativeInput.push({
      id: `character:${item.entityId}`,
      entityType: 'character',
      entityId: item.entityId,
      controllerUserId: item.controllerUserId,
      displayName: item.displayName,
      dex: Number(item.dex)
    });
  }
  for (const row of monsterRows) {
    initiativeInput.push({
      id: `monster_instance:${row.id}`,
      entityType: 'monster_instance',
      entityId: row.id,
      controllerUserId: null,
      displayName: row.display_name,
      dex: Number(row.effective_dex)
    });
  }

  const initiative = buildCombatInitiative(initiativeInput);
  const now = Date.now();
  const rebuild = [env.DB.prepare('DELETE FROM combatants WHERE combat_id = ?').bind(baseCombat.id)];
  for (const item of initiative) {
    rebuild.push(env.DB.prepare(`
      INSERT INTO combatants (
        id, combat_id, entity_type, entity_id, controller_user_id, display_name,
        dex_snapshot, initiative_order, action_available, move_available,
        turn_completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)
    `).bind(
      `combatant_${crypto.randomUUID()}`,
      baseCombat.id,
      item.entityType,
      item.entityId,
      item.controllerUserId,
      item.displayName,
      item.dex,
      item.initiativeOrder,
      now,
      now
    ));
  }

  try {
    await env.DB.batch(rebuild);
    await linkRuntimeEncounterCombat(env, {
      sceneRunId: detail.mapInstance.sceneRunId,
      sceneId: detail.mapInstance.sceneId,
      encounterId,
      mapInstanceId,
      combatId: baseCombat.id,
      actorUserId: gm.id
    });
  } catch (error) {
    await cleanupCombat(request, env, baseCombat.id);
    throw Object.assign(new Error(error?.message || 'Runtime Encounter Combat 無法安全連結。'), {
      status: error?.status || 500,
      code: error?.code || 'RUNTIME_COMBAT_LINK_FAILED'
    });
  }

  const [combatState, refreshed] = await Promise.all([
    downstreamJson(request, env, '/api/gm/combat'),
    runtimeDetail(request, env, mapInstanceId)
  ]);
  return json({
    ok: true,
    runtimeEncounter: runtimeEncounter(refreshed, encounterId),
    combat: combatState?.combat || null,
    mapInstanceId
  }, 201);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      const spawnMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/encounters\/([^/]+)\/monsters$/);
      if (spawnMatch) {
        return await spawnRuntimeMonster(request, env, decodeURIComponent(spawnMatch[1]), decodeURIComponent(spawnMatch[2]));
      }

      const combatMatch = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/encounters\/([^/]+)\/start-combat$/);
      if (combatMatch) {
        return await startRuntimeEncounterCombat(request, env, decodeURIComponent(combatMatch[1]), decodeURIComponent(combatMatch[2]));
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Runtime Encounter gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'RUNTIME_ENCOUNTER_ERROR', error.payload?.error || {});
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Runtime Encounter service 暫時無法使用。', 500, 'RUNTIME_ENCOUNTER_SERVICE_ERROR');
    }
  }
};
