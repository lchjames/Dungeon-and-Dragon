import { buildCombatInitiative } from './rules.js';
import {
  MONSTER_ATTRIBUTE_KEYS,
  buildMonsterAttributes,
  monsterCalculatedResources,
  snapshotMonsterSkill,
  validateMonsterLevel
} from './monster-rules.js';
import { loadRuntimeEncounterMap } from './runtime-encounter-state.js';

let runtimeActionSchemaPromise = null;

function problem(message, status = 409, code = 'RUNTIME_ENCOUNTER_ACTION_FAILED', extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

function cleanText(value, max = 4000) {
  return String(value ?? '').trim().normalize('NFKC').slice(0, max);
}

function numericDex(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const dex = Number(text);
  return Number.isFinite(dex) ? dex : null;
}

export async function ensureRuntimeEncounterActionSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!runtimeActionSchemaPromise) {
    runtimeActionSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS combats (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        round_number INTEGER NOT NULL DEFAULT 1,
        current_turn_index INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS combatants (
        id TEXT PRIMARY KEY,
        combat_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        controller_user_id TEXT,
        display_name TEXT NOT NULL,
        dex_snapshot REAL NOT NULL,
        initiative_order INTEGER NOT NULL,
        action_available INTEGER NOT NULL DEFAULT 1,
        move_available INTEGER NOT NULL DEFAULT 1,
        turn_completed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(combat_id, entity_type, entity_id),
        UNIQUE(combat_id, initiative_order),
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (controller_user_id) REFERENCES users(id) ON DELETE SET NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_story_spawn_effects (
        scene_run_id TEXT NOT NULL,
        story_event_id TEXT NOT NULL,
        effect_index INTEGER NOT NULL CHECK (effect_index >= 0),
        map_instance_id TEXT NOT NULL,
        encounter_id TEXT NOT NULL,
        monster_instance_id TEXT NOT NULL UNIQUE,
        source_spawn_point_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (scene_run_id, story_event_id, effect_index),
        FOREIGN KEY (scene_run_id, encounter_id) REFERENCES runtime_encounter_states(scene_run_id, encounter_id) ON DELETE CASCADE,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (monster_instance_id) REFERENCES monster_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_story_boss_spawn_effects (
        scene_run_id TEXT NOT NULL,
        story_event_id TEXT NOT NULL,
        effect_index INTEGER NOT NULL CHECK (effect_index >= 0),
        map_instance_id TEXT NOT NULL,
        encounter_id TEXT NOT NULL,
        boss_instance_id TEXT NOT NULL UNIQUE,
        profile_id TEXT NOT NULL,
        source_spawn_point_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (scene_run_id, story_event_id, effect_index),
        FOREIGN KEY (scene_run_id, encounter_id) REFERENCES runtime_encounter_states(scene_run_id, encounter_id) ON DELETE CASCADE,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (boss_instance_id) REFERENCES boss_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_combat ON combats(status) WHERE status = 'active'"),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_combatants_combat_order ON combatants(combat_id, initiative_order)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_spawn_monster ON runtime_story_spawn_effects(monster_instance_id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_spawn_map ON runtime_story_spawn_effects(map_instance_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_spawn_boss ON runtime_story_boss_spawn_effects(boss_instance_id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_boss_spawn_map ON runtime_story_boss_spawn_effects(map_instance_id, created_at)')
    ]).catch(error => {
      runtimeActionSchemaPromise = null;
      throw error;
    });
  }
  await runtimeActionSchemaPromise;
}

async function mapContext(env, mapInstanceId, sceneRunId = '', sceneId = '') {
  const row = await env.DB.prepare(`
    SELECT id, scene_run_id, scene_id, status
    FROM runtime_map_instances
    WHERE id = ?
    LIMIT 1
  `).bind(mapInstanceId).first();
  if (!row) throw problem('Runtime Map 不存在。', 404, 'RUNTIME_MAP_NOT_FOUND');
  if (row.status !== 'active') throw problem('Runtime Map 已關閉。', 409, 'RUNTIME_MAP_CLOSED');
  if (sceneRunId && row.scene_run_id !== sceneRunId) throw problem('Runtime Map 唔屬於指定 Scene Run。', 409, 'RUNTIME_MAP_SCENE_RUN_MISMATCH');
  if (sceneId && row.scene_id !== sceneId) throw problem('Runtime Map 唔屬於指定 Scene。', 409, 'RUNTIME_MAP_SCENE_MISMATCH');
  return { id: row.id, sceneRunId: row.scene_run_id, sceneId: row.scene_id, status: row.status };
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

async function spawnReplay(env, { sceneRunId, sceneId, storyEventId, storyEffectIndex }) {
  if (!storyEventId || !Number.isInteger(storyEffectIndex) || storyEffectIndex < 0) return null;
  const row = await env.DB.prepare(`
    SELECT rse.map_instance_id, rse.encounter_id, rse.monster_instance_id, rse.source_spawn_point_id,
           mi.template_id, mi.display_name, mi.level, mi.is_elite, mi.status,
           rep.id AS position_id, rep.x, rep.y,
           rsp.id AS runtime_spawn_point_id
    FROM runtime_story_spawn_effects rse
    LEFT JOIN monster_instances mi ON mi.id = rse.monster_instance_id
    LEFT JOIN runtime_entity_positions rep
      ON rep.map_instance_id = rse.map_instance_id
     AND rep.entity_type = 'monster_instance'
     AND rep.entity_id = rse.monster_instance_id
    LEFT JOIN runtime_map_spawn_points rsp
      ON rsp.map_instance_id = rse.map_instance_id
     AND rsp.source_spawn_point_id = rse.source_spawn_point_id
    WHERE rse.scene_run_id = ? AND rse.story_event_id = ? AND rse.effect_index = ?
    LIMIT 1
  `).bind(sceneRunId, storyEventId, storyEffectIndex).first();
  if (!row) return null;
  if (!row.monster_instance_id || !row.template_id || !row.position_id) {
    throw problem('Story spawn provenance exists but its Runtime Monster or position is missing.', 409, 'STORY_SPAWN_PROVENANCE_BROKEN');
  }
  const encounters = await loadRuntimeEncounterMap(env, sceneRunId, sceneId);
  return {
    monster: {
      id: row.monster_instance_id,
      templateId: row.template_id,
      encounterId: row.encounter_id,
      displayName: row.display_name,
      level: Number(row.level),
      isElite: Boolean(row.is_elite),
      status: row.status
    },
    spawnPoint: {
      sourceSpawnPointId: row.source_spawn_point_id,
      runtimeSpawnPointId: row.runtime_spawn_point_id || null,
      x: Number(row.x),
      y: Number(row.y)
    },
    position: {
      id: row.position_id,
      entityType: 'monster_instance',
      entityId: row.monster_instance_id,
      x: Number(row.x),
      y: Number(row.y)
    },
    runtimeEncounter: encounters.get(row.encounter_id) || null,
    unchanged: true,
    storyEffectReplay: true
  };
}

async function bossSpawnReplay(env, { sceneRunId, sceneId, storyEventId, storyEffectIndex }) {
  if (!storyEventId || !Number.isInteger(storyEffectIndex) || storyEffectIndex < 0) return null;
  const row = await env.DB.prepare(`
    SELECT rbse.map_instance_id, rbse.encounter_id, rbse.boss_instance_id,
           rbse.profile_id, rbse.source_spawn_point_id,
           bi.boss_profile_id, bi.display_name, bi.level, bi.status,
           rep.id AS position_id, rep.x, rep.y,
           rsp.id AS runtime_spawn_point_id
    FROM runtime_story_boss_spawn_effects rbse
    LEFT JOIN boss_instances bi ON bi.id = rbse.boss_instance_id
    LEFT JOIN runtime_entity_positions rep
      ON rep.map_instance_id = rbse.map_instance_id
     AND rep.entity_type = 'boss_instance'
     AND rep.entity_id = rbse.boss_instance_id
    LEFT JOIN runtime_map_spawn_points rsp
      ON rsp.map_instance_id = rbse.map_instance_id
     AND rsp.source_spawn_point_id = rbse.source_spawn_point_id
    WHERE rbse.scene_run_id = ? AND rbse.story_event_id = ? AND rbse.effect_index = ?
    LIMIT 1
  `).bind(sceneRunId, storyEventId, storyEffectIndex).first();
  if (!row) return null;
  if (!row.boss_instance_id || !row.boss_profile_id || !row.position_id) {
    throw problem('Story Boss spawn provenance exists but its Runtime Boss or position is missing.', 409, 'STORY_BOSS_SPAWN_PROVENANCE_BROKEN');
  }
  if (row.profile_id !== row.boss_profile_id) {
    throw problem('Story Boss spawn provenance profile does not match the Runtime Boss snapshot.', 409, 'STORY_BOSS_SPAWN_PROVENANCE_MISMATCH');
  }
  const encounters = await loadRuntimeEncounterMap(env, sceneRunId, sceneId);
  return {
    boss: {
      id: row.boss_instance_id,
      profileId: row.boss_profile_id,
      encounterId: row.encounter_id,
      displayName: row.display_name,
      level: Number(row.level),
      status: row.status
    },
    spawnPoint: {
      sourceSpawnPointId: row.source_spawn_point_id,
      runtimeSpawnPointId: row.runtime_spawn_point_id || null,
      x: Number(row.x),
      y: Number(row.y)
    },
    position: {
      id: row.position_id,
      entityType: 'boss_instance',
      entityId: row.boss_instance_id,
      x: Number(row.x),
      y: Number(row.y)
    },
    runtimeEncounter: encounters.get(row.encounter_id) || null,
    unchanged: true,
    storyEffectReplay: true
  };
}

export async function spawnRuntimeMonster(env, {
  mapInstanceId,
  sceneRunId = '',
  sceneId = '',
  encounterId,
  templateId,
  level,
  sourceSpawnPointId,
  displayName = '',
  actorUserId,
  storyEventId = null,
  storyEffectIndex = null
}) {
  await ensureRuntimeEncounterActionSchema(env);
  const map = await mapContext(env, cleanText(mapInstanceId, 180), cleanText(sceneRunId, 180), cleanText(sceneId, 180));
  const normalizedEncounterId = cleanText(encounterId, 180);
  const normalizedTemplateId = cleanText(templateId, 180);
  const normalizedSpawnId = cleanText(sourceSpawnPointId, 180);
  const normalizedActor = cleanText(actorUserId, 180);
  if (!normalizedEncounterId || !normalizedTemplateId || !normalizedSpawnId || !normalizedActor) {
    throw problem('Runtime Monster spawn 缺少必要 reference。', 400, 'VALIDATION_ERROR');
  }
  let monsterLevel;
  try { monsterLevel = validateMonsterLevel(level); } catch (error) {
    throw problem(error.message, 400, 'VALIDATION_ERROR');
  }

  const replay = await spawnReplay(env, {
    sceneRunId: map.sceneRunId,
    sceneId: map.sceneId,
    storyEventId: cleanText(storyEventId, 180),
    storyEffectIndex
  });
  if (replay) return replay;

  const encounters = await loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId);
  const encounter = encounters.get(normalizedEncounterId);
  if (!encounter) throw problem('Runtime Encounter 不存在於呢個 Scene Run。', 404, 'RUNTIME_ENCOUNTER_NOT_FOUND');
  if (encounter.status !== 'active') throw problem('Runtime Encounter 必須先 active 先可以 Spawn Monster。', 409, 'RUNTIME_ENCOUNTER_NOT_ACTIVE');
  if (encounter.combat) throw problem('Runtime Encounter 已連結 Combat，唔可以再 Spawn Monster。', 409, 'RUNTIME_ENCOUNTER_COMBAT_EXISTS');

  const spawn = await env.DB.prepare(`
    SELECT id, source_spawn_point_id, x, y, spawn_type, enabled
    FROM runtime_map_spawn_points
    WHERE map_instance_id = ? AND source_spawn_point_id = ?
    LIMIT 1
  `).bind(map.id, normalizedSpawnId).first();
  if (!spawn || !Boolean(spawn.enabled)) throw problem('Runtime Spawn Point 不存在或已停用。', 404, 'RUNTIME_SPAWN_NOT_FOUND');
  if (spawn.spawn_type !== 'any' && spawn.spawn_type !== 'monster') throw problem('呢個 Spawn Point 唔接受 Monster。', 409, 'SPAWN_TYPE_MISMATCH');

  const cell = await env.DB.prepare(`
    SELECT is_walkable FROM runtime_map_cells
    WHERE map_instance_id = ? AND x = ? AND y = ?
    LIMIT 1
  `).bind(map.id, spawn.x, spawn.y).first();
  if (!cell) throw problem('Monster Spawn Point 對應唔到 Runtime Cell。', 409, 'RUNTIME_SPAWN_CELL_NOT_FOUND');
  if (!Boolean(cell.is_walkable)) throw problem('Monster Spawn Point 位於 blocked Cell。', 409, 'POSITION_BLOCKED');

  const occupied = await env.DB.prepare(`
    SELECT entity_type, entity_id FROM runtime_entity_positions
    WHERE map_instance_id = ? AND x = ? AND y = ? LIMIT 1
  `).bind(map.id, spawn.x, spawn.y).first();
  if (occupied) {
    throw problem('Monster Spawn Point 已被其他 Entity 佔用。', 409, 'POSITION_OCCUPIED', {
      occupiedBy: { entityType: occupied.entity_type, entityId: occupied.entity_id }
    });
  }

  const templateRow = await env.DB.prepare('SELECT * FROM monster_templates WHERE id = ? LIMIT 1').bind(normalizedTemplateId).first();
  if (!templateRow) throw problem('找不到 Monster Template。', 404, 'MONSTER_TEMPLATE_NOT_FOUND');
  if (!Boolean(templateRow.is_active)) throw problem('Inactive Monster Template 不能 Spawn。', 409, 'MONSTER_TEMPLATE_INACTIVE');
  const skillRows = await env.DB.prepare(`
    SELECT sp.*
    FROM monster_template_skills ts
    JOIN monster_skill_profiles sp ON sp.id = ts.skill_profile_id
    WHERE ts.template_id = ? AND sp.is_active = 1
    ORDER BY ts.sort_order, ts.created_at
  `).bind(normalizedTemplateId).all();

  const config = templateConfig(templateRow);
  const generated = buildMonsterAttributes({ ranges: config.ranges, growthWeights: config.growthWeights, level: monsterLevel });
  const resources = monsterCalculatedResources(generated.effective);
  const monsterId = `monster_${crypto.randomUUID()}`;
  const monsterName = cleanText(displayName, 120) || templateRow.name;
  const now = Date.now();
  const positionId = `runtime_position_${crypto.randomUUID()}`;
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
      monsterId, normalizedTemplateId, normalizedEncounterId, monsterName, monsterLevel,
      generated.isElite ? 1 : 0, generated.eliteRoll, generated.eliteBonus,
      generated.baseRolls.STR, generated.baseRolls.DEX, generated.baseRolls.CON, generated.baseRolls.POW, generated.baseRolls.INT, generated.baseRolls.SIZ,
      generated.natural.STR, generated.natural.DEX, generated.natural.CON, generated.natural.POW, generated.natural.INT, generated.natural.SIZ,
      generated.effective.STR, generated.effective.DEX, generated.effective.CON, generated.effective.POW, generated.effective.INT, generated.effective.SIZ,
      resources.maxHp, resources.maxHp, resources.maxHp,
      resources.maxMp, resources.maxMp, resources.maxMp,
      normalizedActor, now, now
    ),
    env.DB.prepare(`
      INSERT INTO runtime_encounter_participants (
        id, scene_run_id, encounter_id, entity_type, entity_id, display_name_snapshot,
        source_encounter_participant_id, source_kind, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'monster_instance', ?, ?, NULL, 'runtime_spawn', ?, ?, ?)
    `).bind(`runtime_ep_${crypto.randomUUID()}`, map.sceneRunId, normalizedEncounterId, monsterId, monsterName, normalizedActor, now, now),
    env.DB.prepare(`
      INSERT INTO runtime_entity_positions (
        id, map_instance_id, entity_type, entity_id, x, y, visibility_mode,
        placed_by_user_id, created_at, updated_at
      ) VALUES (?, ?, 'monster_instance', ?, ?, ?, 'default', ?, ?, ?)
    `).bind(positionId, map.id, monsterId, spawn.x, spawn.y, normalizedActor, now, now)
  ];

  for (const row of skillRows.results || []) {
    const skill = skillProfile(row);
    const snapshot = snapshotMonsterSkill(skill, { level: monsterLevel, effectiveAttributes: generated.effective });
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

  const normalizedStoryEventId = cleanText(storyEventId, 180);
  if (normalizedStoryEventId && Number.isInteger(storyEffectIndex) && storyEffectIndex >= 0) {
    statements.push(env.DB.prepare(`
      INSERT INTO runtime_story_spawn_effects (
        scene_run_id, story_event_id, effect_index, map_instance_id,
        encounter_id, monster_instance_id, source_spawn_point_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      map.sceneRunId, normalizedStoryEventId, storyEffectIndex, map.id,
      normalizedEncounterId, monsterId, normalizedSpawnId, now
    ));
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (normalizedStoryEventId && Number.isInteger(storyEffectIndex)) {
      const concurrentReplay = await spawnReplay(env, {
        sceneRunId: map.sceneRunId,
        sceneId: map.sceneId,
        storyEventId: normalizedStoryEventId,
        storyEffectIndex
      }).catch(() => null);
      if (concurrentReplay) return concurrentReplay;
    }
    throw error;
  }

  const refreshed = await loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId);
  return {
    monster: {
      id: monsterId,
      templateId: normalizedTemplateId,
      encounterId: normalizedEncounterId,
      displayName: monsterName,
      level: monsterLevel,
      isElite: Boolean(generated.isElite),
      status: 'active'
    },
    spawnPoint: {
      sourceSpawnPointId: normalizedSpawnId,
      runtimeSpawnPointId: spawn.id,
      x: Number(spawn.x),
      y: Number(spawn.y)
    },
    runtimeEncounter: refreshed.get(normalizedEncounterId) || null,
    position: {
      id: positionId,
      entityType: 'monster_instance',
      entityId: monsterId,
      x: Number(spawn.x),
      y: Number(spawn.y)
    },
    unchanged: false,
    storyEffectReplay: false
  };
}

export async function spawnRuntimeBoss(env, {
  mapInstanceId,
  sceneRunId = '',
  sceneId = '',
  encounterId,
  profileId,
  sourceSpawnPointId,
  displayName = '',
  actorUserId,
  storyEventId = null,
  storyEffectIndex = null
}) {
  await ensureRuntimeEncounterActionSchema(env);
  const map = await mapContext(env, cleanText(mapInstanceId, 180), cleanText(sceneRunId, 180), cleanText(sceneId, 180));
  const normalizedEncounterId = cleanText(encounterId, 180);
  const normalizedProfileId = cleanText(profileId, 180);
  const normalizedSpawnId = cleanText(sourceSpawnPointId, 180);
  const normalizedActor = cleanText(actorUserId, 180);
  const normalizedStoryEventId = cleanText(storyEventId, 180);
  if (!normalizedEncounterId || !normalizedProfileId || !normalizedSpawnId || !normalizedActor) {
    throw problem('Runtime Boss spawn 缺少必要 reference。', 400, 'VALIDATION_ERROR');
  }

  const replay = await bossSpawnReplay(env, {
    sceneRunId: map.sceneRunId,
    sceneId: map.sceneId,
    storyEventId: normalizedStoryEventId,
    storyEffectIndex
  });
  if (replay) return replay;

  const encounters = await loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId);
  const encounter = encounters.get(normalizedEncounterId);
  if (!encounter) throw problem('Runtime Encounter 不存在於呢個 Scene Run。', 404, 'RUNTIME_ENCOUNTER_NOT_FOUND');
  if (encounter.status !== 'active') throw problem('Runtime Encounter 必須先 active 先可以 Spawn Boss。', 409, 'RUNTIME_ENCOUNTER_NOT_ACTIVE');
  if (encounter.combat) throw problem('Runtime Encounter 已連結 Combat，唔可以再 Spawn Boss。', 409, 'RUNTIME_ENCOUNTER_COMBAT_EXISTS');

  const spawn = await env.DB.prepare(`
    SELECT id, source_spawn_point_id, x, y, spawn_type, enabled
    FROM runtime_map_spawn_points
    WHERE map_instance_id = ? AND source_spawn_point_id = ?
    LIMIT 1
  `).bind(map.id, normalizedSpawnId).first();
  if (!spawn || !Boolean(spawn.enabled)) throw problem('Runtime Spawn Point 不存在或已停用。', 404, 'RUNTIME_SPAWN_NOT_FOUND');
  if (spawn.spawn_type !== 'any' && spawn.spawn_type !== 'boss') throw problem('呢個 Spawn Point 唔接受 Boss。', 409, 'SPAWN_TYPE_MISMATCH');

  const cell = await env.DB.prepare(`
    SELECT is_walkable FROM runtime_map_cells
    WHERE map_instance_id = ? AND x = ? AND y = ?
    LIMIT 1
  `).bind(map.id, spawn.x, spawn.y).first();
  if (!cell) throw problem('Boss Spawn Point 對應唔到 Runtime Cell。', 409, 'RUNTIME_SPAWN_CELL_NOT_FOUND');
  if (!Boolean(cell.is_walkable)) throw problem('Boss Spawn Point 位於 blocked Cell。', 409, 'POSITION_BLOCKED');

  const occupied = await env.DB.prepare(`
    SELECT entity_type, entity_id FROM runtime_entity_positions
    WHERE map_instance_id = ? AND x = ? AND y = ? LIMIT 1
  `).bind(map.id, spawn.x, spawn.y).first();
  if (occupied) {
    throw problem('Boss Spawn Point 已被其他 Entity 佔用。', 409, 'POSITION_OCCUPIED', {
      occupiedBy: { entityType: occupied.entity_type, entityId: occupied.entity_id }
    });
  }

  const profile = await env.DB.prepare(`
    SELECT * FROM boss_design_profiles WHERE id = ? LIMIT 1
  `).bind(normalizedProfileId).first();
  if (!profile) throw problem('找不到 Boss Design Profile。', 404, 'BOSS_PROFILE_NOT_FOUND');
  if (profile.status !== 'active') throw problem('Archived Boss Profile 不能 Spawn。', 409, 'BOSS_PROFILE_INACTIVE');

  const [skillRows, phaseRows] = await Promise.all([
    env.DB.prepare(`
      SELECT sp.*, bps.skill_profile_id AS linked_skill_profile_id, bps.sort_order AS boss_sort_order
      FROM boss_profile_skills bps
      LEFT JOIN monster_skill_profiles sp ON sp.id = bps.skill_profile_id
      WHERE bps.boss_profile_id = ?
      ORDER BY bps.sort_order, bps.created_at
    `).bind(normalizedProfileId).all(),
    env.DB.prepare(`
      SELECT id, phase_number, name, hp_threshold_percent, gm_notes
      FROM boss_profile_phases
      WHERE boss_profile_id = ?
      ORDER BY phase_number, created_at
    `).bind(normalizedProfileId).all()
  ]);
  const linkedSkills = skillRows.results || [];
  if (linkedSkills.some(row => !row.id || !Boolean(row.is_active))) {
    throw problem('Boss Skill loadout 有缺失或包含 inactive Skill。', 409, 'BOSS_SKILL_SNAPSHOT_FAILED');
  }

  const attributes = {
    STR: Number(profile.final_str),
    DEX: Number(profile.final_dex),
    CON: Number(profile.final_con),
    POW: Number(profile.final_pow),
    INT: Number(profile.final_int),
    SIZ: Number(profile.final_siz)
  };
  if (!Object.values(attributes).every(Number.isFinite)) {
    throw problem('Boss Profile 最終屬性 snapshot 無效。', 409, 'BOSS_PROFILE_INVALID');
  }

  const bossId = `bossinst_${crypto.randomUUID()}`;
  const bossName = cleanText(displayName, 120) || profile.name;
  const bossLevel = Number(profile.level);
  const firstPhase = (phaseRows.results || [])[0]?.phase_number ?? null;
  const now = Date.now();
  const positionId = `runtime_position_${crypto.randomUUID()}`;
  const bossValues = [
    bossId, normalizedProfileId, profile.updated_at, normalizedEncounterId, bossName, bossLevel,
    attributes.STR, attributes.DEX, attributes.CON, attributes.POW, attributes.INT, attributes.SIZ,
    Number(profile.final_max_hp), Number(profile.final_max_hp), Number(profile.final_max_hp),
    Number(profile.final_max_mp), Number(profile.final_max_mp), Number(profile.final_max_mp),
    Number(profile.final_stored_defence || 0), profile.final_armor_name || '',
    Number(profile.final_armor_defence || 0), Number(profile.final_armor_defence || 0),
    profile.final_armor_notes || '', firstPhase, normalizedActor, now, now
  ];
  if (bossValues.length !== 27) throw problem('Boss Instance snapshot bind contract invalid.', 500, 'BOSS_INSTANCE_SNAPSHOT_FAILED');

  const statements = [
    env.DB.prepare(`
      INSERT INTO boss_instances (
        id, boss_profile_id, source_profile_updated_at, encounter_id, display_name, level, status,
        final_str, final_dex, final_con, final_pow, final_int, final_siz,
        snapshot_max_hp, hp_max_adjustment, final_max_hp, current_hp,
        snapshot_max_mp, mp_max_adjustment, final_max_mp, current_mp,
        stored_defence, defence_modifier, armor_name, armor_base_defence,
        armor_defence_adjustment, final_armor_defence, armor_notes,
        current_phase_number, phase_hold, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)
    `).bind(...bossValues),
    env.DB.prepare(`
      INSERT INTO runtime_encounter_participants (
        id, scene_run_id, encounter_id, entity_type, entity_id, display_name_snapshot,
        source_encounter_participant_id, source_kind, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'boss_instance', ?, ?, NULL, 'runtime_spawn', ?, ?, ?)
    `).bind(`runtime_ep_${crypto.randomUUID()}`, map.sceneRunId, normalizedEncounterId, bossId, bossName, normalizedActor, now, now),
    env.DB.prepare(`
      INSERT INTO runtime_entity_positions (
        id, map_instance_id, entity_type, entity_id, x, y, visibility_mode,
        placed_by_user_id, created_at, updated_at
      ) VALUES (?, ?, 'boss_instance', ?, ?, ?, 'default', ?, ?, ?)
    `).bind(positionId, map.id, bossId, spawn.x, spawn.y, normalizedActor, now, now)
  ];

  for (const row of linkedSkills) {
    const skill = skillProfile(row);
    const snapshot = snapshotMonsterSkill(skill, { level: bossLevel, effectiveAttributes: attributes });
    statements.push(env.DB.prepare(`
      INSERT INTO boss_instance_skills (
        id, boss_instance_id, source_skill_profile_id, source_scope, name,
        stored_accuracy, hit_modifier, damage_type, template_base_damage, damage_growth_weight,
        damage_attribute_links, damage_attribute_values, damage_attribute_basis,
        calculated_base_damage, calculated_damage_center,
        suggested_spread_min, suggested_spread_max, final_spread_min, final_spread_max,
        range_text, targeting_text, mp_cost, cooldown_rounds, gm_notes, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      `bis_${crypto.randomUUID()}`, bossId, skill.id, skill.sourceScope, skill.name,
      skill.storedAccuracy, skill.damageType, skill.templateBaseDamage, skill.damageGrowthWeight,
      JSON.stringify(snapshot.damageAttributeLinks), JSON.stringify(snapshot.damageAttributeValues), snapshot.damageAttributeBasis,
      snapshot.calculatedBaseDamage, snapshot.calculatedDamageCenter,
      snapshot.suggestedSpreadMin, snapshot.suggestedSpreadMax, snapshot.finalSpreadMin, snapshot.finalSpreadMax,
      skill.rangeText, skill.targetingText, skill.mpCost, skill.cooldownRounds, skill.gmNotes, now, now
    ));
  }

  for (const phase of phaseRows.results || []) {
    statements.push(env.DB.prepare(`
      INSERT INTO boss_instance_phases (
        id, boss_instance_id, source_phase_id, phase_number, name,
        hp_threshold_percent, gm_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `bip_${crypto.randomUUID()}`, bossId, phase.id, Number(phase.phase_number), phase.name,
      phase.hp_threshold_percent === null ? null : Number(phase.hp_threshold_percent), phase.gm_notes || '', now
    ));
  }

  if (normalizedStoryEventId && Number.isInteger(storyEffectIndex) && storyEffectIndex >= 0) {
    statements.push(env.DB.prepare(`
      INSERT INTO runtime_story_boss_spawn_effects (
        scene_run_id, story_event_id, effect_index, map_instance_id,
        encounter_id, boss_instance_id, profile_id, source_spawn_point_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      map.sceneRunId, normalizedStoryEventId, storyEffectIndex, map.id,
      normalizedEncounterId, bossId, normalizedProfileId, normalizedSpawnId, now
    ));
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (normalizedStoryEventId && Number.isInteger(storyEffectIndex)) {
      const concurrentReplay = await bossSpawnReplay(env, {
        sceneRunId: map.sceneRunId,
        sceneId: map.sceneId,
        storyEventId: normalizedStoryEventId,
        storyEffectIndex
      }).catch(() => null);
      if (concurrentReplay) return concurrentReplay;
    }
    throw error;
  }

  const refreshed = await loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId);
  return {
    boss: {
      id: bossId,
      profileId: normalizedProfileId,
      encounterId: normalizedEncounterId,
      displayName: bossName,
      level: bossLevel,
      status: 'active'
    },
    spawnPoint: {
      sourceSpawnPointId: normalizedSpawnId,
      runtimeSpawnPointId: spawn.id,
      x: Number(spawn.x),
      y: Number(spawn.y)
    },
    runtimeEncounter: refreshed.get(normalizedEncounterId) || null,
    position: {
      id: positionId,
      entityType: 'boss_instance',
      entityId: bossId,
      x: Number(spawn.x),
      y: Number(spawn.y)
    },
    unchanged: false,
    storyEffectReplay: false
  };
}

async function selectedCharacters(env, characterIds) {
  const placeholders = characterIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT c.id, c.name, c.owner_user_id, c.status,
           (
             SELECT a.value
             FROM character_attributes a
             WHERE a.character_id = c.id AND UPPER(a.key) = 'DEX'
             ORDER BY a.sort_order, a.id
             LIMIT 1
           ) AS dex_value
    FROM characters c
    WHERE c.id IN (${placeholders})
  `).bind(...characterIds).all();
  return rows.results || [];
}

async function loadCombat(env, combatId) {
  const combat = await env.DB.prepare(`
    SELECT id, status, round_number, current_turn_index, created_by_user_id, started_at, ended_at, updated_at
    FROM combats WHERE id = ? LIMIT 1
  `).bind(combatId).first();
  if (!combat) return null;
  const rows = await env.DB.prepare(`
    SELECT id, entity_type, entity_id, controller_user_id, display_name,
           dex_snapshot, initiative_order, action_available, move_available, turn_completed
    FROM combatants WHERE combat_id = ? ORDER BY initiative_order
  `).bind(combatId).all();
  const combatants = (rows.results || []).map(row => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    controllerUserId: row.controller_user_id,
    displayName: row.display_name,
    dex: Number(row.dex_snapshot),
    initiativeOrder: Number(row.initiative_order),
    actionAvailable: Boolean(row.action_available),
    moveAvailable: Boolean(row.move_available),
    turnCompleted: Boolean(row.turn_completed)
  }));
  const currentTurnIndex = Number(combat.current_turn_index || 0);
  return {
    id: combat.id,
    status: combat.status,
    roundNumber: Number(combat.round_number || 1),
    currentTurnIndex,
    createdByUserId: combat.created_by_user_id,
    startedAt: combat.started_at,
    endedAt: combat.ended_at,
    updatedAt: combat.updated_at,
    combatants,
    currentCombatant: combatants.find(item => item.initiativeOrder === currentTurnIndex) || null
  };
}

export async function startRuntimeEncounterCombat(env, {
  mapInstanceId,
  sceneRunId = '',
  sceneId = '',
  encounterId,
  actorUserId
}) {
  await ensureRuntimeEncounterActionSchema(env);
  const map = await mapContext(env, cleanText(mapInstanceId, 180), cleanText(sceneRunId, 180), cleanText(sceneId, 180));
  const normalizedEncounterId = cleanText(encounterId, 180);
  const normalizedActor = cleanText(actorUserId, 180);
  if (!normalizedEncounterId || !normalizedActor) throw problem('Runtime Combat 缺少必要 reference。', 400, 'VALIDATION_ERROR');

  const encounters = await loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId);
  const encounter = encounters.get(normalizedEncounterId);
  if (!encounter) throw problem('Runtime Encounter 不存在於呢個 Scene Run。', 404, 'RUNTIME_ENCOUNTER_NOT_FOUND');
  if (encounter.status !== 'active') throw problem('Runtime Encounter 必須為 active 先可以開始 Combat。', 409, 'RUNTIME_ENCOUNTER_NOT_ACTIVE');
  if (encounter.combat) {
    return {
      runtimeEncounter: encounter,
      combat: await loadCombat(env, encounter.combat.combatId),
      mapInstanceId: map.id,
      unchanged: true
    };
  }

  const participants = encounter.participants || [];
  const characterIds = participants.filter(item => item.entityType === 'character').map(item => item.entityId);
  const monsterIds = participants.filter(item => item.entityType === 'monster_instance').map(item => item.entityId);
  const bossIds = participants.filter(item => item.entityType === 'boss_instance').map(item => item.entityId);
  if (!characterIds.length) throw problem('Runtime Encounter 至少要有一個 Character participant。', 409, 'ENCOUNTER_CHARACTER_REQUIRED');

  const positionRows = await env.DB.prepare(`
    SELECT entity_type, entity_id FROM runtime_entity_positions WHERE map_instance_id = ?
  `).bind(map.id).all();
  const positioned = new Set((positionRows.results || []).map(row => `${row.entity_type}:${row.entity_id}`));
  const missingPositions = participants
    .filter(item => !positioned.has(`${item.entityType}:${item.entityId}`))
    .map(item => ({ entityType: item.entityType, entityId: item.entityId, displayName: item.displayName }));
  if (missingPositions.length) {
    throw problem('所有 Runtime Encounter participants 必須先放喺同一張 Runtime Map。', 409, 'RUNTIME_ENCOUNTER_POSITION_REQUIRED', { missingPositions });
  }

  const characterRows = await selectedCharacters(env, characterIds);
  if (characterRows.length !== characterIds.length) throw problem('部分 Character participant 不存在。', 409, 'COMBATANT_NOT_FOUND');
  const characterById = new Map(characterRows.map(row => [row.id, row]));
  const initiativeInput = [];
  for (const characterId of characterIds) {
    const row = characterById.get(characterId);
    if (row.status !== 'active') throw problem(`${row.name} 目前唔係 active Character。`, 409, 'COMBATANT_NOT_ACTIVE');
    const dex = numericDex(row.dex_value);
    if (dex === null) throw problem(`${row.name} 缺少有效 DEX，不能建立 Initiative。`, 409, 'COMBATANT_DEX_REQUIRED');
    initiativeInput.push({
      id: `character:${row.id}`,
      entityType: 'character',
      entityId: row.id,
      controllerUserId: row.owner_user_id,
      displayName: row.name,
      dex
    });
  }

  if (monsterIds.length) {
    const placeholders = monsterIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id, display_name, effective_dex, status
      FROM monster_instances WHERE id IN (${placeholders})
    `).bind(...monsterIds).all();
    const monsters = rows.results || [];
    if (monsters.length !== monsterIds.length) throw problem('部分 Runtime Monster Instance 不存在。', 409, 'MONSTER_INSTANCE_NOT_FOUND');
    const byId = new Map(monsters.map(row => [row.id, row]));
    for (const monsterId of monsterIds) {
      const row = byId.get(monsterId);
      if (row.status !== 'active') throw problem(`${row.display_name} 目前唔係 active Monster Instance。`, 409, 'MONSTER_INSTANCE_NOT_ACTIVE');
      const dex = Number(row.effective_dex);
      if (!Number.isFinite(dex)) throw problem(`${row.display_name} 缺少有效 DEX。`, 409, 'MONSTER_INSTANCE_DEX_REQUIRED');
      initiativeInput.push({
        id: `monster_instance:${row.id}`,
        entityType: 'monster_instance',
        entityId: row.id,
        controllerUserId: null,
        displayName: row.display_name,
        dex
      });
    }
  }

  if (bossIds.length) {
    const placeholders = bossIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id, display_name, final_dex, status, current_hp
      FROM boss_instances WHERE id IN (${placeholders})
    `).bind(...bossIds).all();
    const bosses = rows.results || [];
    if (bosses.length !== bossIds.length) throw problem('部分 Runtime Boss Instance 不存在。', 409, 'BOSS_INSTANCE_NOT_FOUND');
    const byId = new Map(bosses.map(row => [row.id, row]));
    for (const bossId of bossIds) {
      const row = byId.get(bossId);
      if (row.status !== 'active' || Number(row.current_hp) <= 0) {
        throw problem(`${row.display_name} 目前唔係可戰鬥 Boss Instance。`, 409, 'BOSS_INSTANCE_NOT_ACTIVE');
      }
      const dex = Number(row.final_dex);
      if (!Number.isFinite(dex)) throw problem(`${row.display_name} 缺少有效 DEX。`, 409, 'BOSS_INSTANCE_DEX_REQUIRED');
      initiativeInput.push({
        id: `boss_instance:${row.id}`,
        entityType: 'boss_instance',
        entityId: row.id,
        controllerUserId: null,
        displayName: row.display_name,
        dex
      });
    }
  }

  const active = await env.DB.prepare("SELECT id FROM combats WHERE status = 'active' LIMIT 1").first();
  if (active) throw problem('目前已有進行中的 Combat。', 409, 'ACTIVE_COMBAT_EXISTS', { activeCombatId: active.id });

  const initiative = buildCombatInitiative(initiativeInput);
  const combatId = `combat_${crypto.randomUUID()}`;
  const now = Date.now();
  const statements = [
    env.DB.prepare(`
      INSERT INTO combats (
        id, status, round_number, current_turn_index,
        created_by_user_id, started_at, ended_at, updated_at
      ) VALUES (?, 'active', 1, 0, ?, ?, NULL, ?)
    `).bind(combatId, normalizedActor, now, now)
  ];
  for (const item of initiative) {
    statements.push(env.DB.prepare(`
      INSERT INTO combatants (
        id, combat_id, entity_type, entity_id, controller_user_id, display_name,
        dex_snapshot, initiative_order, action_available, move_available,
        turn_completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)
    `).bind(
      `combatant_${crypto.randomUUID()}`, combatId, item.entityType, item.entityId,
      item.controllerUserId, item.displayName, item.dex, item.initiativeOrder, now, now
    ));
  }
  statements.push(env.DB.prepare(`
    INSERT INTO runtime_encounter_combats (
      scene_run_id, encounter_id, map_instance_id, combat_id, linked_by_user_id, linked_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(map.sceneRunId, normalizedEncounterId, map.id, combatId, normalizedActor, now));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const concurrentEncounters = await loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId).catch(() => new Map());
    const concurrentEncounter = concurrentEncounters.get(normalizedEncounterId);
    if (concurrentEncounter?.combat) {
      return {
        runtimeEncounter: concurrentEncounter,
        combat: await loadCombat(env, concurrentEncounter.combat.combatId),
        mapInstanceId: map.id,
        unchanged: true
      };
    }
    const nowActive = await env.DB.prepare("SELECT id FROM combats WHERE status = 'active' LIMIT 1").first().catch(() => null);
    if (nowActive) throw problem('另一個 Combat 已經開始，請重新載入。', 409, 'ACTIVE_COMBAT_EXISTS', { activeCombatId: nowActive.id });
    throw error;
  }

  const refreshed = await loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId);
  return {
    runtimeEncounter: refreshed.get(normalizedEncounterId) || null,
    combat: await loadCombat(env, combatId),
    mapInstanceId: map.id,
    unchanged: false
  };
}