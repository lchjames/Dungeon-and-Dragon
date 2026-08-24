import baseWorker from './monster-defeat.js';
import { buildCombatInitiative } from './rules.js';
import {
  MONSTER_ATTRIBUTE_KEYS,
  monsterEffectiveAccuracy,
  rollSignedSpread,
  snapshotMonsterSkill
} from './monster-rules.js';
import { calculateBossProfile, bossInstanceDefence, bossPhaseApplicability, validateBossPhases } from './boss-rules.js';
import { dyingRoundsFromCon, resolveDamage, resolveOpposedD100, rollD100 } from './combat-rules.js';
import { ensureLifeRow, loadCharacterLifeState } from './combat-life.js';

const GM_ROLES = new Set(['gm', 'admin']);
let bossSchemaPromise = null;

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

function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function currentUser(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), {
    method: 'GET', headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  return (await response.json())?.user || null;
}

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try { return await request.json(); }
  catch { throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' }); }
}

function text(value, max = 5000) {
  return String(value ?? '').trim().normalize('NFKC').slice(0, max);
}

function name(value, label = 'Name') {
  const output = text(value, 120);
  if (!output) throw Object.assign(new Error(`${label} 必須填寫。`), { status: 400, code: 'VALIDATION_ERROR' });
  return output;
}

function num(value, label, { min = -1_000_000, max = 1_000_000, integer = false } = {}) {
  const output = Number(value);
  if (!Number.isFinite(output) || (integer && !Number.isInteger(output)) || output < min || output > max) {
    throw Object.assign(new Error(`${label} 數值無效。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return output;
}

function optionalNum(value, label, range = {}) {
  if (value === null || value === undefined || value === '') return null;
  return num(value, label, range);
}

function parseJson(value, fallback) {
  try { return JSON.parse(String(value ?? '')) ?? fallback; }
  catch { return fallback; }
}

async function ensureBossSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!bossSchemaPromise) {
    bossSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS boss_design_profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', gm_notes TEXT NOT NULL DEFAULT '',
        level INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
        natural_str REAL NOT NULL, natural_dex REAL NOT NULL, natural_con REAL NOT NULL, natural_pow REAL NOT NULL, natural_int REAL NOT NULL, natural_siz REAL NOT NULL,
        str_growth_weight REAL NOT NULL DEFAULT 1, dex_growth_weight REAL NOT NULL DEFAULT 1, con_growth_weight REAL NOT NULL DEFAULT 1,
        pow_growth_weight REAL NOT NULL DEFAULT 1, int_growth_weight REAL NOT NULL DEFAULT 1, siz_growth_weight REAL NOT NULL DEFAULT 1,
        calculated_str REAL NOT NULL, calculated_dex REAL NOT NULL, calculated_con REAL NOT NULL, calculated_pow REAL NOT NULL, calculated_int REAL NOT NULL, calculated_siz REAL NOT NULL,
        override_str REAL, override_dex REAL, override_con REAL, override_pow REAL, override_int REAL, override_siz REAL,
        final_str REAL NOT NULL, final_dex REAL NOT NULL, final_con REAL NOT NULL, final_pow REAL NOT NULL, final_int REAL NOT NULL, final_siz REAL NOT NULL,
        calculated_max_hp REAL NOT NULL, override_max_hp REAL, final_max_hp REAL NOT NULL,
        calculated_max_mp REAL NOT NULL, override_max_mp REAL, final_max_mp REAL NOT NULL,
        baseline_stored_defence REAL NOT NULL DEFAULT 0, override_stored_defence REAL, final_stored_defence REAL NOT NULL DEFAULT 0,
        baseline_armor_name TEXT NOT NULL DEFAULT '', baseline_armor_defence REAL NOT NULL DEFAULT 0, baseline_armor_notes TEXT NOT NULL DEFAULT '',
        override_armor_name TEXT, override_armor_defence REAL, override_armor_notes TEXT,
        final_armor_name TEXT NOT NULL DEFAULT '', final_armor_defence REAL NOT NULL DEFAULT 0, final_armor_notes TEXT NOT NULL DEFAULT '',
        created_by_user_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS boss_profile_skills (
        boss_profile_id TEXT NOT NULL, skill_profile_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
        PRIMARY KEY (boss_profile_id, skill_profile_id),
        FOREIGN KEY (boss_profile_id) REFERENCES boss_design_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_profile_id) REFERENCES monster_skill_profiles(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS boss_profile_phases (
        id TEXT PRIMARY KEY, boss_profile_id TEXT NOT NULL, phase_number INTEGER NOT NULL, name TEXT NOT NULL,
        hp_threshold_percent REAL, gm_notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE (boss_profile_id, phase_number), FOREIGN KEY (boss_profile_id) REFERENCES boss_design_profiles(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS boss_instances (
        id TEXT PRIMARY KEY, boss_profile_id TEXT NOT NULL, source_profile_updated_at INTEGER NOT NULL, encounter_id TEXT NOT NULL,
        display_name TEXT NOT NULL, level INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','defeated','removed')),
        final_str REAL NOT NULL, final_dex REAL NOT NULL, final_con REAL NOT NULL, final_pow REAL NOT NULL, final_int REAL NOT NULL, final_siz REAL NOT NULL,
        snapshot_max_hp REAL NOT NULL, hp_max_adjustment REAL NOT NULL DEFAULT 0, final_max_hp REAL NOT NULL, current_hp REAL NOT NULL,
        snapshot_max_mp REAL NOT NULL, mp_max_adjustment REAL NOT NULL DEFAULT 0, final_max_mp REAL NOT NULL, current_mp REAL NOT NULL,
        stored_defence REAL NOT NULL DEFAULT 0, defence_modifier REAL NOT NULL DEFAULT 0,
        armor_name TEXT NOT NULL DEFAULT '', armor_base_defence REAL NOT NULL DEFAULT 0, armor_defence_adjustment REAL NOT NULL DEFAULT 0,
        final_armor_defence REAL NOT NULL DEFAULT 0, armor_notes TEXT NOT NULL DEFAULT '',
        current_phase_number INTEGER, phase_hold INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (boss_profile_id) REFERENCES boss_design_profiles(id) ON DELETE RESTRICT,
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS boss_instance_skills (
        id TEXT PRIMARY KEY, boss_instance_id TEXT NOT NULL, source_skill_profile_id TEXT, source_scope TEXT NOT NULL,
        name TEXT NOT NULL, stored_accuracy REAL NOT NULL, hit_modifier REAL NOT NULL DEFAULT 0,
        damage_type TEXT NOT NULL DEFAULT 'physical', template_base_damage REAL NOT NULL DEFAULT 0, damage_growth_weight REAL NOT NULL DEFAULT 1,
        damage_attribute_links TEXT NOT NULL DEFAULT '[]', damage_attribute_values TEXT NOT NULL DEFAULT '{}', damage_attribute_basis REAL NOT NULL DEFAULT 0,
        calculated_base_damage REAL NOT NULL DEFAULT 0, calculated_damage_center REAL NOT NULL DEFAULT 0,
        suggested_spread_min INTEGER NOT NULL, suggested_spread_max INTEGER NOT NULL, final_spread_min INTEGER NOT NULL, final_spread_max INTEGER NOT NULL,
        range_text TEXT NOT NULL DEFAULT '', targeting_text TEXT NOT NULL DEFAULT 'single target', mp_cost INTEGER NOT NULL DEFAULT 0,
        cooldown_rounds INTEGER NOT NULL DEFAULT 0, gm_notes TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (boss_instance_id) REFERENCES boss_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (source_skill_profile_id) REFERENCES monster_skill_profiles(id) ON DELETE SET NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS boss_instance_phases (
        id TEXT PRIMARY KEY, boss_instance_id TEXT NOT NULL, source_phase_id TEXT, phase_number INTEGER NOT NULL, name TEXT NOT NULL,
        hp_threshold_percent REAL, gm_notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
        UNIQUE (boss_instance_id, phase_number), FOREIGN KEY (boss_instance_id) REFERENCES boss_instances(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS boss_action_log (
        id TEXT PRIMARY KEY, combat_id TEXT NOT NULL, round_number INTEGER NOT NULL, turn_index INTEGER NOT NULL,
        actor_combatant_id TEXT NOT NULL, boss_instance_id TEXT NOT NULL, boss_instance_skill_id TEXT NOT NULL, target_combatant_id TEXT NOT NULL,
        stored_accuracy REAL NOT NULL, hit_modifier REAL NOT NULL DEFAULT 0, modified_accuracy REAL NOT NULL, effective_accuracy REAL NOT NULL,
        attack_roll INTEGER NOT NULL, attack_result REAL NOT NULL, defence_roll INTEGER NOT NULL, defence_result REAL NOT NULL,
        spread_roll INTEGER, raw_damage REAL, effective_defence REAL, damage_result REAL, hp_damage REAL NOT NULL DEFAULT 0,
        phase_number INTEGER, outcome TEXT NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (boss_instance_id) REFERENCES boss_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (boss_instance_skill_id) REFERENCES boss_instance_skills(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_boss_profiles_status ON boss_design_profiles(status, name)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_boss_profile_skills_profile ON boss_profile_skills(boss_profile_id, sort_order)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_boss_profile_phases_profile ON boss_profile_phases(boss_profile_id, phase_number)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_boss_instances_encounter ON boss_instances(encounter_id, status, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_boss_instance_skills_instance ON boss_instance_skills(boss_instance_id, is_active, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_boss_instance_phases_instance ON boss_instance_phases(boss_instance_id, phase_number)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_boss_action_log_combat ON boss_action_log(combat_id, round_number, turn_index, created_at)')
    ]).catch(error => { bossSchemaPromise = null; throw error; });
  }
  await bossSchemaPromise;
}

async function storyPayload(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/gm/story', request.url), {
    method: 'GET', headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) throw Object.assign(new Error('Story runtime 未能載入。'), { status: response.status, code: 'STORY_RUNTIME_UNAVAILABLE' });
  return response.json();
}

function flattenEncounters(story) {
  const out = [];
  for (const scenario of story?.scenarios || []) for (const scene of scenario.scenes || []) for (const encounter of scene.encounters || []) {
    out.push({ ...encounter, sceneName: scene.name, sceneStatus: scene.status, scenarioName: scenario.name, scenarioStatus: scenario.status });
  }
  return out;
}

function profileInput(body, existing = null) {
  const attr = {}, weights = {}, overrides = {};
  for (const key of MONSTER_ATTRIBUTE_KEYS) {
    const low = key.toLowerCase();
    attr[key] = body?.naturalAttributes?.[key] ?? existing?.[`natural_${low}`];
    weights[key] = body?.growthWeights?.[key] ?? existing?.[`${low}_growth_weight`] ?? 1;
    overrides[key] = body?.attributeOverrides?.[key] ?? existing?.[`override_${low}`] ?? null;
  }
  return {
    level: body?.level ?? existing?.level,
    naturalAttributes: attr,
    growthWeights: weights,
    attributeOverrides: overrides,
    maxHpOverride: body?.maxHpOverride ?? existing?.override_max_hp ?? null,
    maxMpOverride: body?.maxMpOverride ?? existing?.override_max_mp ?? null,
    baselineStoredDefence: body?.baselineStoredDefence ?? existing?.baseline_stored_defence ?? 0,
    storedDefenceOverride: body?.storedDefenceOverride ?? existing?.override_stored_defence ?? null,
    baselineArmorName: body?.baselineArmorName ?? existing?.baseline_armor_name ?? '',
    baselineArmorDefence: body?.baselineArmorDefence ?? existing?.baseline_armor_defence ?? 0,
    baselineArmorNotes: body?.baselineArmorNotes ?? existing?.baseline_armor_notes ?? '',
    armorNameOverride: body?.armorNameOverride ?? existing?.override_armor_name ?? null,
    armorDefenceOverride: body?.armorDefenceOverride ?? existing?.override_armor_defence ?? null,
    armorNotesOverride: body?.armorNotesOverride ?? existing?.override_armor_notes ?? null
  };
}

function mapSkill(row) {
  return {
    id: row.id, name: row.name, sourceScope: row.source_scope,
    storedAccuracy: Number(row.stored_accuracy), damageType: row.damage_type,
    templateBaseDamage: Number(row.template_base_damage), damageGrowthWeight: Number(row.damage_growth_weight),
    damageAttributeLinks: parseJson(row.damage_attribute_links, []), rangeText: row.range_text,
    targetingText: row.targeting_text, mpCost: Number(row.mp_cost || 0), cooldownRounds: Number(row.cooldown_rounds || 0),
    gmNotes: row.gm_notes || '', isActive: Boolean(row.is_active)
  };
}

function mapPhase(row) {
  return {
    id: row.id, phaseNumber: Number(row.phase_number), name: row.name,
    hpThresholdPercent: row.hp_threshold_percent === null ? null : Number(row.hp_threshold_percent), gmNotes: row.gm_notes || ''
  };
}

function mapProfile(row, skillIds = [], phases = []) {
  const naturalAttributes = {}, growthWeights = {}, calculatedAttributes = {}, attributeOverrides = {}, finalAttributes = {};
  for (const key of MONSTER_ATTRIBUTE_KEYS) {
    const low = key.toLowerCase();
    naturalAttributes[key] = Number(row[`natural_${low}`]);
    growthWeights[key] = Number(row[`${low}_growth_weight`]);
    calculatedAttributes[key] = Number(row[`calculated_${low}`]);
    attributeOverrides[key] = row[`override_${low}`] === null ? null : Number(row[`override_${low}`]);
    finalAttributes[key] = Number(row[`final_${low}`]);
  }
  return {
    id: row.id, name: row.name, summary: row.summary, gmNotes: row.gm_notes, level: Number(row.level), status: row.status,
    naturalAttributes, growthWeights, calculatedAttributes, attributeOverrides, finalAttributes,
    calculatedMaxHp: Number(row.calculated_max_hp), maxHpOverride: row.override_max_hp === null ? null : Number(row.override_max_hp), finalMaxHp: Number(row.final_max_hp),
    calculatedMaxMp: Number(row.calculated_max_mp), maxMpOverride: row.override_max_mp === null ? null : Number(row.override_max_mp), finalMaxMp: Number(row.final_max_mp),
    baselineStoredDefence: Number(row.baseline_stored_defence), storedDefenceOverride: row.override_stored_defence === null ? null : Number(row.override_stored_defence), finalStoredDefence: Number(row.final_stored_defence),
    baselineArmor: { name: row.baseline_armor_name, defence: Number(row.baseline_armor_defence), notes: row.baseline_armor_notes },
    armorOverride: { name: row.override_armor_name, defence: row.override_armor_defence === null ? null : Number(row.override_armor_defence), notes: row.override_armor_notes },
    finalArmor: { name: row.final_armor_name, defence: Number(row.final_armor_defence), notes: row.final_armor_notes },
    skillIds, phases, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function mapInstanceSkill(row) {
  return {
    id: row.id, sourceSkillProfileId: row.source_skill_profile_id, sourceScope: row.source_scope, name: row.name,
    storedAccuracy: Number(row.stored_accuracy), hitModifier: Number(row.hit_modifier || 0), damageType: row.damage_type,
    templateBaseDamage: Number(row.template_base_damage), damageGrowthWeight: Number(row.damage_growth_weight),
    damageAttributeLinks: parseJson(row.damage_attribute_links, []), damageAttributeValues: parseJson(row.damage_attribute_values, {}),
    damageAttributeBasis: Number(row.damage_attribute_basis), calculatedBaseDamage: Number(row.calculated_base_damage), calculatedDamageCenter: Number(row.calculated_damage_center),
    suggestedSpreadMin: Number(row.suggested_spread_min), suggestedSpreadMax: Number(row.suggested_spread_max), finalSpreadMin: Number(row.final_spread_min), finalSpreadMax: Number(row.final_spread_max),
    rangeText: row.range_text, targetingText: row.targeting_text, mpCost: Number(row.mp_cost || 0), cooldownRounds: Number(row.cooldown_rounds || 0), gmNotes: row.gm_notes || '', isActive: Boolean(row.is_active)
  };
}

function mapInstance(row, skills = [], phases = []) {
  const finalAttributes = {};
  for (const key of MONSTER_ATTRIBUTE_KEYS) finalAttributes[key] = Number(row[`final_${key.toLowerCase()}`]);
  const defence = bossInstanceDefence(row.stored_defence, row.defence_modifier, row.armor_base_defence, row.armor_defence_adjustment);
  const phaseState = bossPhaseApplicability({ currentHp: row.current_hp, maxHp: row.final_max_hp, currentPhaseNumber: row.current_phase_number, phases });
  return {
    id: row.id, bossProfileId: row.boss_profile_id, profileName: row.profile_name || '', sourceProfileUpdatedAt: row.source_profile_updated_at,
    encounterId: row.encounter_id, encounterName: row.encounter_name || '', displayName: row.display_name, level: Number(row.level), status: row.status,
    finalAttributes,
    hp: { snapshotMax: Number(row.snapshot_max_hp), maxAdjustment: Number(row.hp_max_adjustment || 0), max: Number(row.final_max_hp), current: Number(row.current_hp) },
    mp: { snapshotMax: Number(row.snapshot_max_mp), maxAdjustment: Number(row.mp_max_adjustment || 0), max: Number(row.final_max_mp), current: Number(row.current_mp) },
    defence: { storedDefence: defence.d100.storedDefence, modifier: defence.d100.modifier, modifiedDefence: defence.d100.modifiedDefence, effectiveD100Defence: defence.d100.effectiveDefence,
      armor: { name: row.armor_name, baseDefence: defence.armor.baseDefence, adjustment: defence.armor.adjustment, finalDefence: defence.armor.finalDefence, notes: row.armor_notes || '' } },
    currentPhaseNumber: row.current_phase_number === null ? null : Number(row.current_phase_number), phaseHold: Boolean(row.phase_hold), phases,
    hpPercent: phaseState.hpPercent, applicablePhase: phaseState.applicablePhase, skills, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function profileRows(env) {
  return env.DB.prepare('SELECT * FROM boss_design_profiles ORDER BY status, name COLLATE NOCASE, created_at').all();
}

async function bossOverview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env); await ensureBossSchema(env);
  const story = await storyPayload(request, env);
  const [profilesR, linksR, phasesR, commonR, uniqueR, instancesR, instanceSkillsR, instancePhasesR] = await Promise.all([
    profileRows(env), env.DB.prepare('SELECT * FROM boss_profile_skills ORDER BY boss_profile_id, sort_order, created_at').all(),
    env.DB.prepare('SELECT * FROM boss_profile_phases ORDER BY boss_profile_id, phase_number').all(),
    env.DB.prepare("SELECT * FROM monster_skill_profiles WHERE source_scope = 'common' ORDER BY name COLLATE NOCASE").all(),
    env.DB.prepare("SELECT * FROM monster_skill_profiles WHERE source_scope = 'boss' ORDER BY name COLLATE NOCASE").all(),
    env.DB.prepare(`SELECT bi.*, bp.name AS profile_name, e.name AS encounter_name FROM boss_instances bi JOIN boss_design_profiles bp ON bp.id = bi.boss_profile_id LEFT JOIN encounters e ON e.id = bi.encounter_id ORDER BY bi.created_at DESC`).all(),
    env.DB.prepare('SELECT * FROM boss_instance_skills ORDER BY boss_instance_id, created_at, id').all(),
    env.DB.prepare('SELECT * FROM boss_instance_phases ORDER BY boss_instance_id, phase_number').all()
  ]);
  const links = new Map(), phases = new Map(), skillsByInstance = new Map(), phasesByInstance = new Map();
  for (const row of linksR.results || []) { if (!links.has(row.boss_profile_id)) links.set(row.boss_profile_id, []); links.get(row.boss_profile_id).push(row.skill_profile_id); }
  for (const row of phasesR.results || []) { if (!phases.has(row.boss_profile_id)) phases.set(row.boss_profile_id, []); phases.get(row.boss_profile_id).push(mapPhase(row)); }
  for (const row of instanceSkillsR.results || []) { if (!skillsByInstance.has(row.boss_instance_id)) skillsByInstance.set(row.boss_instance_id, []); skillsByInstance.get(row.boss_instance_id).push(mapInstanceSkill(row)); }
  for (const row of instancePhasesR.results || []) { if (!phasesByInstance.has(row.boss_instance_id)) phasesByInstance.set(row.boss_instance_id, []); phasesByInstance.get(row.boss_instance_id).push(mapPhase(row)); }
  const encounters = flattenEncounters(story).filter(item => ['planned','active'].includes(item.status) && item.sceneStatus !== 'completed' && item.scenarioStatus !== 'archived' && !item.combat);
  return json({ ok: true,
    profiles: (profilesR.results || []).map(row => mapProfile(row, links.get(row.id) || [], phases.get(row.id) || [])),
    commonSkills: (commonR.results || []).map(mapSkill), uniqueSkills: (uniqueR.results || []).map(mapSkill),
    instances: (instancesR.results || []).map(row => mapInstance(row, skillsByInstance.get(row.id) || [], phasesByInstance.get(row.id) || [])),
    encounterCandidates: encounters
  });
}

function validateProfileBody(body, existing = null) {
  const profile = calculateBossProfile(profileInput(body, existing));
  return {
    ...profile,
    name: body?.name === undefined && existing ? existing.name : name(body?.name, 'Boss Name'),
    summary: body?.summary === undefined && existing ? existing.summary : text(body?.summary, 5000),
    gmNotes: body?.gmNotes === undefined && existing ? existing.gm_notes : text(body?.gmNotes, 10000),
    status: body?.status === undefined && existing ? existing.status : (body?.status === 'archived' ? 'archived' : 'active')
  };
}

function profileSqlValues(v, userId, id, now, isInsert) {
  const a = v.naturalAttributes, w = v.growthWeights, c = v.calculatedAttributes, o = v.attributeOverrides, f = v.finalAttributes;
  const values = [v.name, v.summary, v.gmNotes, v.level, v.status,
    a.STR,a.DEX,a.CON,a.POW,a.INT,a.SIZ, w.STR,w.DEX,w.CON,w.POW,w.INT,w.SIZ,
    c.STR,c.DEX,c.CON,c.POW,c.INT,c.SIZ, o.STR,o.DEX,o.CON,o.POW,o.INT,o.SIZ,
    f.STR,f.DEX,f.CON,f.POW,f.INT,f.SIZ,
    v.calculatedMaxHp,v.maxHpOverride,v.finalMaxHp,v.calculatedMaxMp,v.maxMpOverride,v.finalMaxMp,
    v.baselineStoredDefence,v.storedDefenceOverride,v.finalStoredDefence,
    v.baselineArmor.name,v.baselineArmor.defence,v.baselineArmor.notes,
    v.armorOverride.name,v.armorOverride.defence,v.armorOverride.notes,
    v.finalArmor.name,v.finalArmor.defence,v.finalArmor.notes];
  return isInsert ? [id, ...values, userId, now, now] : [...values, now, id];
}

async function createProfile(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  const user = await requireGM(request, env); await ensureBossSchema(env);
  let v; try { v = validateProfileBody(await readBody(request)); } catch (e) { return apiError(e.message,400,'VALIDATION_ERROR'); }
  const id = `boss_${crypto.randomUUID()}`, now = Date.now();
  await env.DB.prepare(`INSERT INTO boss_design_profiles (
    id,name,summary,gm_notes,level,status,natural_str,natural_dex,natural_con,natural_pow,natural_int,natural_siz,
    str_growth_weight,dex_growth_weight,con_growth_weight,pow_growth_weight,int_growth_weight,siz_growth_weight,
    calculated_str,calculated_dex,calculated_con,calculated_pow,calculated_int,calculated_siz,
    override_str,override_dex,override_con,override_pow,override_int,override_siz,
    final_str,final_dex,final_con,final_pow,final_int,final_siz,
    calculated_max_hp,override_max_hp,final_max_hp,calculated_max_mp,override_max_mp,final_max_mp,
    baseline_stored_defence,override_stored_defence,final_stored_defence,
    baseline_armor_name,baseline_armor_defence,baseline_armor_notes,override_armor_name,override_armor_defence,override_armor_notes,
    final_armor_name,final_armor_defence,final_armor_notes,created_by_user_id,created_at,updated_at
  ) VALUES (${Array(58).fill('?').join(',')})`).bind(...profileSqlValues(v,user.id,id,now,true)).run();
  return json({ok:true,id},201);
}

async function updateProfile(request, env, id) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  await requireGM(request, env); await ensureBossSchema(env);
  const existing = await env.DB.prepare('SELECT * FROM boss_design_profiles WHERE id=? LIMIT 1').bind(id).first();
  if (!existing) return apiError('找不到 Boss Design Profile。',404,'BOSS_PROFILE_NOT_FOUND');
  let v; try { v = validateProfileBody(await readBody(request), existing); } catch (e) { return apiError(e.message,400,'VALIDATION_ERROR'); }
  await env.DB.prepare(`UPDATE boss_design_profiles SET
    name=?,summary=?,gm_notes=?,level=?,status=?,natural_str=?,natural_dex=?,natural_con=?,natural_pow=?,natural_int=?,natural_siz=?,
    str_growth_weight=?,dex_growth_weight=?,con_growth_weight=?,pow_growth_weight=?,int_growth_weight=?,siz_growth_weight=?,
    calculated_str=?,calculated_dex=?,calculated_con=?,calculated_pow=?,calculated_int=?,calculated_siz=?,
    override_str=?,override_dex=?,override_con=?,override_pow=?,override_int=?,override_siz=?,
    final_str=?,final_dex=?,final_con=?,final_pow=?,final_int=?,final_siz=?,
    calculated_max_hp=?,override_max_hp=?,final_max_hp=?,calculated_max_mp=?,override_max_mp=?,final_max_mp=?,
    baseline_stored_defence=?,override_stored_defence=?,final_stored_defence=?,
    baseline_armor_name=?,baseline_armor_defence=?,baseline_armor_notes=?,override_armor_name=?,override_armor_defence=?,override_armor_notes=?,
    final_armor_name=?,final_armor_defence=?,final_armor_notes=?,updated_at=? WHERE id=?`)
    .bind(...profileSqlValues(v,null,id,Date.now(),false)).run();
  return json({ok:true,id});
}

function validateSkillBody(body) {
  const links = [...new Set((Array.isArray(body?.damageAttributeLinks) ? body.damageAttributeLinks : []).map(x => String(x).toUpperCase()))];
  if (links.some(x => !MONSTER_ATTRIBUTE_KEYS.includes(x))) throw new Error('Damage Attribute Links 無效。');
  return {
    name: name(body?.name,'Boss Skill Name'), storedAccuracy: num(body?.storedAccuracy,'Stored Accuracy',{min:0,max:10000,integer:true}),
    damageType: text(body?.damageType || 'physical',80) || 'physical', templateBaseDamage: num(body?.templateBaseDamage ?? 0,'Template Base Damage',{min:0,max:1_000_000}),
    damageGrowthWeight: num(body?.damageGrowthWeight ?? 1,'Damage Growth Weight',{min:0,max:100}), damageAttributeLinks: links,
    rangeText: text(body?.rangeText,300), targetingText: text(body?.targetingText || 'single target',300) || 'single target',
    mpCost: num(body?.mpCost ?? 0,'MP Cost',{min:0,max:1_000_000,integer:true}), cooldownRounds: num(body?.cooldownRounds ?? 0,'Cooldown',{min:0,max:10000,integer:true}),
    gmNotes: text(body?.gmNotes,10000), isActive: body?.isActive !== false
  };
}

async function createUniqueSkill(request, env, profileId) {
  if (request.method !== 'POST') return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  const user = await requireGM(request, env); await ensureBossSchema(env);
  const profile = await env.DB.prepare('SELECT id FROM boss_design_profiles WHERE id=?').bind(profileId).first();
  if (!profile) return apiError('找不到 Boss Profile。',404,'BOSS_PROFILE_NOT_FOUND');
  let v; try { v = validateSkillBody(await readBody(request)); } catch(e) { return apiError(e.message,400,'VALIDATION_ERROR'); }
  const id=`bskill_${crypto.randomUUID()}`, now=Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO monster_skill_profiles (id,name,source_scope,source_template_id,stored_accuracy,damage_type,template_base_damage,damage_growth_weight,damage_attribute_links,range_text,targeting_text,mp_cost,cooldown_rounds,gm_notes,is_active,created_by_user_id,created_at,updated_at) VALUES (?,?,'boss',NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,v.name,v.storedAccuracy,v.damageType,v.templateBaseDamage,v.damageGrowthWeight,JSON.stringify(v.damageAttributeLinks),v.rangeText,v.targetingText,v.mpCost,v.cooldownRounds,v.gmNotes,v.isActive?1:0,user.id,now,now),
    env.DB.prepare('INSERT INTO boss_profile_skills (boss_profile_id,skill_profile_id,sort_order,created_at) VALUES (?,?,999,?)').bind(profileId,id,now)
  ]);
  return json({ok:true,id},201);
}

async function setProfileSkills(request, env, profileId) {
  if (request.method !== 'PUT') return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  await requireGM(request, env); await ensureBossSchema(env);
  const body=await readBody(request); const ids=[...new Set((Array.isArray(body?.skillIds)?body.skillIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(ids.length>60) return apiError('Boss最多60個 Skill。',400,'VALIDATION_ERROR');
  if(ids.length){const p=ids.map(()=>'?').join(','); const rows=await env.DB.prepare(`SELECT id,source_scope,is_active FROM monster_skill_profiles WHERE id IN (${p})`).bind(...ids).all();
    if((rows.results||[]).length!==ids.length) return apiError('部分 Skill 不存在。',400,'BOSS_SKILL_NOT_FOUND');
    if((rows.results||[]).some(r=>!Boolean(r.is_active)||!['common','boss'].includes(r.source_scope))) return apiError('只能加入 active Common / Boss Skill。',409,'BOSS_SKILL_UNAVAILABLE');}
  const statements=[env.DB.prepare('DELETE FROM boss_profile_skills WHERE boss_profile_id=?').bind(profileId)], now=Date.now();
  ids.forEach((id,i)=>statements.push(env.DB.prepare('INSERT INTO boss_profile_skills (boss_profile_id,skill_profile_id,sort_order,created_at) VALUES (?,?,?,?)').bind(profileId,id,i,now)));
  await env.DB.batch(statements); return json({ok:true,profileId,skillIds:ids});
}

async function setPhases(request, env, profileId) {
  if (request.method !== 'PUT') return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  await requireGM(request, env); await ensureBossSchema(env);
  let phases; try { phases=validateBossPhases((await readBody(request))?.phases || []); } catch(e){return apiError(e.message,400,'VALIDATION_ERROR');}
  const now=Date.now(), statements=[env.DB.prepare('DELETE FROM boss_profile_phases WHERE boss_profile_id=?').bind(profileId)];
  for(const p of phases) statements.push(env.DB.prepare('INSERT INTO boss_profile_phases (id,boss_profile_id,phase_number,name,hp_threshold_percent,gm_notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(`bphase_${crypto.randomUUID()}`,profileId,p.phaseNumber,p.name,p.hpThresholdPercent,p.gmNotes,now,now));
  await env.DB.batch(statements); return json({ok:true,profileId,phases});
}

async function spawnBoss(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  const user=await requireGM(request,env); await ensureBossSchema(env); const body=await readBody(request);
  const profileId=String(body?.profileId||'').trim(), encounterId=String(body?.encounterId||'').trim();
  const profile=await env.DB.prepare('SELECT * FROM boss_design_profiles WHERE id=? AND status=\'active\' LIMIT 1').bind(profileId).first();
  if(!profile) return apiError('找不到 active Boss Profile。',404,'BOSS_PROFILE_NOT_FOUND');
  const story=await storyPayload(request,env), encounter=flattenEncounters(story).find(x=>x.id===encounterId);
  if(!encounter||!['planned','active'].includes(encounter.status)||encounter.combat) return apiError('此 Encounter 目前不能 Spawn Boss。',409,'ENCOUNTER_UNAVAILABLE');
  const [skillRows,phaseRows]=await Promise.all([
    env.DB.prepare(`SELECT sp.* FROM boss_profile_skills bs JOIN monster_skill_profiles sp ON sp.id=bs.skill_profile_id WHERE bs.boss_profile_id=? AND sp.is_active=1 ORDER BY bs.sort_order,bs.created_at`).bind(profileId).all(),
    env.DB.prepare('SELECT * FROM boss_profile_phases WHERE boss_profile_id=? ORDER BY phase_number').bind(profileId).all()
  ]);
  const finalAttributes={}; for(const key of MONSTER_ATTRIBUTE_KEYS) finalAttributes[key]=Number(profile[`final_${key.toLowerCase()}`]);
  const id=`bossinst_${crypto.randomUUID()}`, now=Date.now(), displayName=text(body?.displayName,120)||profile.name;
  const firstPhase=(phaseRows.results||[])[0]?.phase_number ?? null;
  const statements=[env.DB.prepare(`INSERT INTO boss_instances (
    id,boss_profile_id,source_profile_updated_at,encounter_id,display_name,level,status,
    final_str,final_dex,final_con,final_pow,final_int,final_siz,
    snapshot_max_hp,hp_max_adjustment,final_max_hp,current_hp,snapshot_max_mp,mp_max_adjustment,final_max_mp,current_mp,
    stored_defence,defence_modifier,armor_name,armor_base_defence,armor_defence_adjustment,final_armor_defence,armor_notes,
    current_phase_number,phase_hold,created_by_user_id,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,'active',?,?,?,?,?,?,?,0,?,?,?,0,?,?,?,0,?,?,0,?,?,?, ?,0,?,?,?)`).bind(
    id,profileId,profile.updated_at,encounterId,displayName,profile.level,
    finalAttributes.STR,finalAttributes.DEX,finalAttributes.CON,finalAttributes.POW,finalAttributes.INT,finalAttributes.SIZ,
    profile.final_max_hp,profile.final_max_hp,profile.final_max_hp,profile.final_max_mp,profile.final_max_mp,profile.final_max_mp,
    profile.final_stored_defence,profile.final_armor_name,profile.final_armor_defence,profile.final_armor_defence,profile.final_armor_notes,
    firstPhase,user.id,now,now
  ), env.DB.prepare(`INSERT INTO encounter_participants (id,encounter_id,entity_type,entity_id,display_name_snapshot,created_at,updated_at) VALUES (?,?,'boss_instance',?,?,?,?)`).bind(`ep_${crypto.randomUUID()}`,encounterId,id,displayName,now,now)];
  for(const row of skillRows.results||[]){const skill=mapSkill(row), snap=snapshotMonsterSkill(skill,{level:Number(profile.level),effectiveAttributes:finalAttributes}); statements.push(env.DB.prepare(`INSERT INTO boss_instance_skills (id,boss_instance_id,source_skill_profile_id,source_scope,name,stored_accuracy,hit_modifier,damage_type,template_base_damage,damage_growth_weight,damage_attribute_links,damage_attribute_values,damage_attribute_basis,calculated_base_damage,calculated_damage_center,suggested_spread_min,suggested_spread_max,final_spread_min,final_spread_max,range_text,targeting_text,mp_cost,cooldown_rounds,gm_notes,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).bind(`bis_${crypto.randomUUID()}`,id,skill.id,skill.sourceScope,skill.name,skill.storedAccuracy,skill.damageType,skill.templateBaseDamage,skill.damageGrowthWeight,JSON.stringify(snap.damageAttributeLinks),JSON.stringify(snap.damageAttributeValues),snap.damageAttributeBasis,snap.calculatedBaseDamage,snap.calculatedDamageCenter,snap.suggestedSpreadMin,snap.suggestedSpreadMax,snap.finalSpreadMin,snap.finalSpreadMax,skill.rangeText,skill.targetingText,skill.mpCost,skill.cooldownRounds,skill.gmNotes,now,now));}
  for(const row of phaseRows.results||[]) statements.push(env.DB.prepare('INSERT INTO boss_instance_phases (id,boss_instance_id,source_phase_id,phase_number,name,hp_threshold_percent,gm_notes,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(`bip_${crypto.randomUUID()}`,id,row.id,row.phase_number,row.name,row.hp_threshold_percent,row.gm_notes,now));
  await env.DB.batch(statements); return json({ok:true,id},201);
}

async function updateInstanceRuntime(request, env, instanceId) {
  if(request.method!=='PATCH') return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');
  if(!validOrigin(request)) return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  await requireGM(request,env); await ensureBossSchema(env); const row=await env.DB.prepare('SELECT * FROM boss_instances WHERE id=?').bind(instanceId).first();
  if(!row) return apiError('找不到 Boss Instance。',404,'BOSS_INSTANCE_NOT_FOUND'); const body=await readBody(request);
  const hpAdj=body?.hpMaxAdjustment===undefined?Number(row.hp_max_adjustment):num(body.hpMaxAdjustment,'HP Max Adjustment');
  const mpAdj=body?.mpMaxAdjustment===undefined?Number(row.mp_max_adjustment):num(body.mpMaxAdjustment,'MP Max Adjustment');
  const hpMax=Math.max(1,Number(row.snapshot_max_hp)+hpAdj), mpMax=Math.max(0,Number(row.snapshot_max_mp)+mpAdj);
  const currentHp=body?.currentHp===undefined?Math.min(Number(row.current_hp),hpMax):num(body.currentHp,'Current HP',{min:1,max:hpMax});
  const currentMp=body?.currentMp===undefined?Math.min(Number(row.current_mp),mpMax):num(body.currentMp,'Current MP',{min:0,max:mpMax});
  const defenceModifier=body?.defenceModifier===undefined?Number(row.defence_modifier):num(body.defenceModifier,'Defence Modifier');
  const armorAdjustment=body?.armorDefenceAdjustment===undefined?Number(row.armor_defence_adjustment):num(body.armorDefenceAdjustment,'Armor Adjustment');
  const armor=bossInstanceDefence(row.stored_defence,defenceModifier,row.armor_base_defence,armorAdjustment).armor;
  if(armor.finalDefence<0) return apiError('Final Armor Defence 不能低過0。',400,'VALIDATION_ERROR');
  await env.DB.prepare('UPDATE boss_instances SET hp_max_adjustment=?,final_max_hp=?,current_hp=?,mp_max_adjustment=?,final_max_mp=?,current_mp=?,defence_modifier=?,armor_defence_adjustment=?,final_armor_defence=?,updated_at=? WHERE id=?').bind(hpAdj,hpMax,currentHp,mpAdj,mpMax,currentMp,defenceModifier,armorAdjustment,armor.finalDefence,Date.now(),instanceId).run();
  return json({ok:true,instanceId});
}

async function setInstancePhase(request, env, instanceId) {
  if(request.method!=='POST') return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');
  if(!validOrigin(request)) return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  await requireGM(request,env); await ensureBossSchema(env); const body=await readBody(request), phaseNumber=num(body?.phaseNumber,'Phase Number',{min:1,max:100,integer:true});
  const phase=await env.DB.prepare('SELECT phase_number FROM boss_instance_phases WHERE boss_instance_id=? AND phase_number=?').bind(instanceId,phaseNumber).first();
  if(!phase) return apiError('Boss Instance 冇呢個 Phase。',404,'BOSS_PHASE_NOT_FOUND');
  await env.DB.prepare('UPDATE boss_instances SET current_phase_number=?,phase_hold=?,updated_at=? WHERE id=?').bind(phaseNumber,body?.hold?1:0,Date.now(),instanceId).run();
  return json({ok:true,instanceId,currentPhaseNumber:phaseNumber,phaseHold:Boolean(body?.hold)});
}

async function loadCombat(env, combatId='') {
  const combat=combatId?await env.DB.prepare('SELECT * FROM combats WHERE id=? LIMIT 1').bind(combatId).first():await env.DB.prepare("SELECT * FROM combats WHERE status='active' ORDER BY started_at DESC LIMIT 1").first();
  if(!combat) return null; const rows=await env.DB.prepare('SELECT * FROM combatants WHERE combat_id=? ORDER BY initiative_order').bind(combat.id).all();
  const combatants=(rows.results||[]).map(r=>({id:r.id,entityType:r.entity_type,entityId:r.entity_id,controllerUserId:r.controller_user_id,displayName:r.display_name,dex:Number(r.dex_snapshot),initiativeOrder:Number(r.initiative_order),actionAvailable:Boolean(r.action_available),moveAvailable:Boolean(r.move_available),turnCompleted:Boolean(r.turn_completed)}));
  const idx=Number(combat.current_turn_index||0); return {id:combat.id,status:combat.status,roundNumber:Number(combat.round_number||1),currentTurnIndex:idx,combatants,currentCombatant:combatants.find(x=>x.initiativeOrder===idx)||null};
}

async function addBossToEncounterCombat(request, env, encounterId) {
  if(request.method!=='POST') return baseWorker.fetch(request,env);
  await requireGM(request,env); await ensureBossSchema(env); const story=await storyPayload(request,env), encounter=flattenEncounters(story).find(x=>x.id===encounterId);
  const bossParts=(encounter?.participants||[]).filter(x=>x.entityType==='boss_instance'); if(!bossParts.length) return baseWorker.fetch(request,env);
  const response=await baseWorker.fetch(request,env); if(!response.ok) return response; const payload=await response.json(); const combatId=payload?.combat?.id;
  if(!combatId) return apiError('Combat 建立失敗。',500,'COMBAT_START_FAILED');
  const ids=bossParts.map(x=>x.entityId), p=ids.map(()=>'?').join(','); const rows=await env.DB.prepare(`SELECT id,display_name,final_dex,status,current_hp FROM boss_instances WHERE id IN (${p})`).bind(...ids).all();
  if((rows.results||[]).length!==ids.length||(rows.results||[]).some(r=>r.status!=='active'||Number(r.current_hp)<=0)) return apiError('部分 Boss Instance 目前不可加入 Combat。',409,'BOSS_INSTANCE_NOT_ACTIVE');
  const current=await loadCombat(env,combatId); const participants=current.combatants.map(x=>({id:`${x.entityType}:${x.entityId}`,entityType:x.entityType,entityId:x.entityId,controllerUserId:x.controllerUserId,displayName:x.displayName,dex:x.dex}));
  for(const r of rows.results||[]) participants.push({id:`boss_instance:${r.id}`,entityType:'boss_instance',entityId:r.id,controllerUserId:null,displayName:r.display_name,dex:Number(r.final_dex)});
  const initiative=buildCombatInitiative(participants), now=Date.now(), statements=[env.DB.prepare('DELETE FROM combatants WHERE combat_id=?').bind(combatId)];
  for(const item of initiative) statements.push(env.DB.prepare(`INSERT INTO combatants (id,combat_id,entity_type,entity_id,controller_user_id,display_name,dex_snapshot,initiative_order,action_available,move_available,turn_completed,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,1,0,?,?)`).bind(`combatant_${crypto.randomUUID()}`,combatId,item.entityType,item.entityId,item.controllerUserId,item.displayName,item.dex,item.initiativeOrder,now,now));
  await env.DB.batch(statements); return json({...payload,combat:await loadCombat(env,combatId)},response.status);
}

async function bossMap(env, combat) {
  const ids=(combat?.combatants||[]).filter(x=>x.entityType==='boss_instance').map(x=>x.entityId); const map=new Map(); if(!ids.length) return map;
  const p=ids.map(()=>'?').join(','), rows=await env.DB.prepare(`SELECT * FROM boss_instances WHERE id IN (${p})`).bind(...ids).all();
  for(const row of rows.results||[]){const phases=await env.DB.prepare('SELECT * FROM boss_instance_phases WHERE boss_instance_id=? ORDER BY phase_number').bind(row.id).all(); const skills=await env.DB.prepare('SELECT * FROM boss_instance_skills WHERE boss_instance_id=? AND is_active=1 ORDER BY created_at,id').bind(row.id).all(); map.set(row.id,mapInstance(row,(skills.results||[]).map(mapInstanceSkill),(phases.results||[]).map(mapPhase)));}
  return map;
}

async function enrichCombat(env,payload){const combat=payload?.combat;if(!combat)return payload;const full=await loadCombat(env,combat.id),map=await bossMap(env,full);const add=item=>item?.entityType==='boss_instance'?{...item,boss:map.get(item.entityId)||null,status:map.get(item.entityId)?.status||'active',hp:map.get(item.entityId)?.hp||null,lifeState:'alive'}:item;payload.combat={...combat,combatants:(combat.combatants||[]).map(add),currentCombatant:combat.currentCombatant?add(combat.currentCombatant):null};return payload;}

async function bossTurn(env,combat,map){const actor=combat?.currentCombatant;if(!actor||actor.entityType!=='boss_instance')return null;const boss=map.get(actor.entityId);if(!boss||boss.status!=='active')return{unavailable:true,reason:'Boss Instance is not active.'};const targets=[];for(const t of combat.combatants.filter(x=>x.entityType==='character')){const life=await ensureLifeRow(env,t.entityId);if(life.lifeState==='dead'||life.characterLocked)continue;const hp=await env.DB.prepare("SELECT current_value,max_value FROM character_resources WHERE character_id=? AND UPPER(key)='HP' LIMIT 1").bind(t.entityId).first();targets.push({combatantId:t.id,characterId:t.entityId,displayName:t.displayName,lifeState:life.lifeState,hp:hp?{current:Number(hp.current_value),max:Number(hp.max_value)}:null});}return{instance:{...actor,...boss},skills:boss.skills,targets,applicablePhase:boss.applicablePhase};}

async function combatOverview(request,env){const response=await baseWorker.fetch(request,env);if(!response.ok)return response;await ensureBossSchema(env);let payload=await response.json();payload=await enrichCombat(env,payload);if(new URL(request.url).pathname==='/api/gm/combat'&&payload?.combat){const full=await loadCombat(env,payload.combat.id),map=await bossMap(env,full);payload.bossTurn=await bossTurn(env,full,map);}return json(payload,response.status);}

async function applyCharacterDamage(env,characterId,hpRow,conValue,hpDamage){const life=await ensureLifeRow(env,characterId);if(!(hpDamage>0))return{hp:Number(hpRow.current_value),life};const now=Date.now();if(life.lifeState==='dying'){await env.DB.batch([env.DB.prepare('UPDATE character_resources SET current_value=0 WHERE id=?').bind(hpRow.id),env.DB.prepare("UPDATE character_life_states SET life_state='dead',character_locked=1,dying_rounds_remaining=0,died_at=COALESCE(died_at,?),updated_at=? WHERE character_id=? AND life_state='dying'").bind(now,now,characterId)]);}else{const rounds=dyingRoundsFromCon(conValue);await env.DB.batch([env.DB.prepare('UPDATE character_resources SET current_value=MAX(0,current_value-?) WHERE id=?').bind(hpDamage,hpRow.id),env.DB.prepare("UPDATE character_life_states SET life_state='dying',character_locked=0,dying_rounds_remaining=?,died_at=NULL,last_dying_tick_combat_id=NULL,last_dying_tick_round=NULL,updated_at=? WHERE character_id=? AND life_state='alive' AND EXISTS (SELECT 1 FROM character_resources WHERE id=? AND current_value<=0)").bind(rounds,now,characterId,hpRow.id)]);}const hp=await env.DB.prepare('SELECT current_value FROM character_resources WHERE id=?').bind(hpRow.id).first(), refreshed=await loadCharacterLifeState(env,characterId);return{hp:Number(hp?.current_value||0),life:refreshed};}

async function bossAttack(request,env,combatId){if(request.method!=='POST')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');if(!validOrigin(request))return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');await requireGM(request,env);await ensureBossSchema(env);const body=await readBody(request),skillId=String(body?.skillId||''),targetId=String(body?.targetCombatantId||'');const combat=await loadCombat(env,combatId);if(!combat||combat.status!=='active'||combat.currentCombatant?.entityType!=='boss_instance')return apiError('Current Turn 唔係 Boss。',409,'BOSS_TURN_REQUIRED');const actor=combat.currentCombatant;if(!actor.actionAvailable)return apiError('Boss Action 已使用。',409,'ACTION_ALREADY_SPENT');const boss=await env.DB.prepare("SELECT * FROM boss_instances WHERE id=? AND status='active'").bind(actor.entityId).first();if(!boss)return apiError('Boss Instance 不可行動。',409,'BOSS_NOT_ACTIVE');const skillRow=await env.DB.prepare('SELECT * FROM boss_instance_skills WHERE id=? AND boss_instance_id=? AND is_active=1').bind(skillId,actor.entityId).first();if(!skillRow)return apiError('Boss Skill 不可用。',409,'BOSS_SKILL_UNAVAILABLE');const target=combat.combatants.find(x=>x.id===targetId&&x.entityType==='character');if(!target)return apiError('Target 必須係同場 Character。',400,'TARGET_INVALID');const life=await ensureLifeRow(env,target.entityId);if(life.lifeState==='dead'||life.characterLocked)return apiError('Target 已死亡。',409,'TARGET_DEAD');const [dodge,hp,con]=await Promise.all([env.DB.prepare("SELECT natural_value FROM character_skills WHERE character_id=? AND key='dodge' LIMIT 1").bind(target.entityId).first(),env.DB.prepare("SELECT id,current_value,max_value FROM character_resources WHERE character_id=? AND UPPER(key)='HP' LIMIT 1").bind(target.entityId).first(),env.DB.prepare("SELECT value FROM character_attributes WHERE character_id=? AND UPPER(key)='CON' LIMIT 1").bind(target.entityId).first()]);if(!dodge||!hp||!con)return apiError('Target 缺少 Dodge / HP / CON。',409,'TARGET_DATA_REQUIRED');const reserve=await env.DB.prepare("UPDATE combatants SET action_available=0,updated_at=? WHERE id=? AND combat_id=? AND action_available=1 AND EXISTS(SELECT 1 FROM combats WHERE id=? AND status='active' AND round_number=? AND current_turn_index=?)").bind(Date.now(),actor.id,combat.id,combat.id,combat.roundNumber,combat.currentTurnIndex).run();if(Number(reserve?.meta?.changes||0)!==1)return apiError('Combat state 已改變。',409,'COMBAT_STATE_CHANGED');const skill=mapInstanceSkill(skillRow),accuracy=monsterEffectiveAccuracy(skill.storedAccuracy,skill.hitModifier),attackRoll=rollD100(),defenceRoll=rollD100(),opposed=resolveOpposedD100({roll:attackRoll,skillValue:accuracy.effectiveAccuracy,modifier:0},{roll:defenceRoll,skillValue:Number(dodge.natural_value),modifier:0});let spreadRoll=null,damage={rawDamage:null,effectiveDefence:0,damageResult:null,hpDamage:0},outcome='defended',hpAfter=Number(hp.current_value),lifeAfter=life;if(opposed.sourceWins){spreadRoll=rollSignedSpread(skill.finalSpreadMin,skill.finalSpreadMax);damage=resolveDamage({damageDiceTotal:Math.max(0,skill.calculatedDamageCenter+spreadRoll),effectiveDefence:0});if(damage.hpDamage>0){const applied=await applyCharacterDamage(env,target.entityId,hp,Number(con.value),damage.hpDamage);hpAfter=applied.hp;lifeAfter=applied.life;outcome=lifeAfter.lifeState==='dead'?'hit_target_dead':lifeAfter.lifeState==='dying'?'hit_target_dying':'hit_damage';}else outcome='hit_ineffective';}await env.DB.prepare('INSERT INTO boss_action_log (id,combat_id,round_number,turn_index,actor_combatant_id,boss_instance_id,boss_instance_skill_id,target_combatant_id,stored_accuracy,hit_modifier,modified_accuracy,effective_accuracy,attack_roll,attack_result,defence_roll,defence_result,spread_roll,raw_damage,effective_defence,damage_result,hp_damage,phase_number,outcome,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`ba_${crypto.randomUUID()}`,combat.id,combat.roundNumber,combat.currentTurnIndex,actor.id,actor.entityId,skill.id,target.id,accuracy.storedAccuracy,accuracy.modifier,accuracy.modifiedAccuracy,accuracy.effectiveAccuracy,opposed.source.roll,opposed.source.result,opposed.resistance.roll,opposed.resistance.result,spreadRoll,damage.rawDamage,damage.effectiveDefence,damage.damageResult,damage.hpDamage,boss.current_phase_number,outcome,Date.now()).run();const refreshed=await loadCombat(env,combat.id),map=await bossMap(env,refreshed);return json({ok:true,combat:await enrichCombat(env,{combat:refreshed}).then(x=>x.combat),bossTurn:await bossTurn(env,refreshed,map),bossAttack:{actor:{combatantId:actor.id,bossInstanceId:actor.entityId,name:actor.displayName},target:{combatantId:target.id,characterId:target.entityId,name:target.displayName,hpAfter,lifeStateAfter:lifeAfter.lifeState},skill,accuracy,attackCheck:opposed.source,defenceCheck:opposed.resistance,hit:opposed.sourceWins,spreadRoll,damage,outcome}});}

export default { async fetch(request,env){const pathname=new URL(request.url).pathname;try{
  if(pathname==='/api/gm/bosses') return await bossOverview(request,env);
  if(pathname==='/api/gm/boss-profiles') return await createProfile(request,env);
  let m=pathname.match(/^\/api\/gm\/boss-profiles\/([^/]+)$/); if(m) return await updateProfile(request,env,decodeURIComponent(m[1]));
  m=pathname.match(/^\/api\/gm\/boss-profiles\/([^/]+)\/skills$/); if(m) return await setProfileSkills(request,env,decodeURIComponent(m[1]));
  m=pathname.match(/^\/api\/gm\/boss-profiles\/([^/]+)\/unique-skills$/); if(m) return await createUniqueSkill(request,env,decodeURIComponent(m[1]));
  m=pathname.match(/^\/api\/gm\/boss-profiles\/([^/]+)\/phases$/); if(m) return await setPhases(request,env,decodeURIComponent(m[1]));
  if(pathname==='/api/gm/boss-instances') return await spawnBoss(request,env);
  m=pathname.match(/^\/api\/gm\/boss-instances\/([^/]+)\/runtime$/); if(m) return await updateInstanceRuntime(request,env,decodeURIComponent(m[1]));
  m=pathname.match(/^\/api\/gm\/boss-instances\/([^/]+)\/phase$/); if(m) return await setInstancePhase(request,env,decodeURIComponent(m[1]));
  m=pathname.match(/^\/api\/gm\/encounters\/([^/]+)\/start-combat$/); if(m) return await addBossToEncounterCombat(request,env,decodeURIComponent(m[1]));
  if((pathname==='/api/gm/combat'||pathname==='/api/player/combat')&&request.method==='GET') return await combatOverview(request,env);
  m=pathname.match(/^\/api\/gm\/combat\/([^/]+)\/boss-attack$/); if(m) return await bossAttack(request,env,decodeURIComponent(m[1]));
  return baseWorker.fetch(request,env);
}catch(err){console.error('Boss runtime error',err);if(err?.status)return apiError(err.message,err.status,err.code||'BOSS_RUNTIME_ERROR');if(String(err?.message||err).includes('D1 binding DB is unavailable'))return apiError('資料庫尚未完成配置。',503,'DATABASE_UNAVAILABLE');return apiError('暫時無法完成 Boss Runtime 要求。',500,'BOSS_RUNTIME_SERVICE_ERROR');}}};
