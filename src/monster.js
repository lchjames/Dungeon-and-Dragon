import baseWorker from './scenario.js';
import { buildCombatInitiative } from './rules.js';
import {
  MONSTER_ATTRIBUTE_KEYS,
  buildMonsterAttributes,
  monsterCalculatedResources,
  monsterEffectiveAccuracy,
  rollSignedSpread,
  snapshotMonsterSkill,
  validateMonsterLevel,
  validateSpreadRange
} from './monster-rules.js';
import { dyingRoundsFromCon, resolveDamage, resolveOpposedD100, rollD100 } from './combat-rules.js';
import { ensureLifeRow, loadCharacterLifeState } from './combat-life.js';

const GM_ROLES = new Set(['gm', 'admin']);
let monsterSchemaPromise = null;

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
  const authRequest = new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  });
  const response = await baseWorker.fetch(authRequest, env);
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.user || null;
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
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().normalize('NFKC').slice(0, max);
}

function requiredName(value, label = 'Name') {
  const name = cleanText(value, 120);
  if (!name) throw Object.assign(new Error(`${label} 必須填寫。`), { status: 400, code: 'VALIDATION_ERROR' });
  return name;
}

function finite(value, label, { min = -1_000_000, max = 1_000_000 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw Object.assign(new Error(`${label} 數值無效。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

function integer(value, label, { min = -1_000_000, max = 1_000_000 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw Object.assign(new Error(`${label} 必須係 ${min}–${max} 整數。`), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return number;
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value ?? ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function ensureMonsterSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!monsterSchemaPromise) {
    monsterSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS monster_templates (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
        str_min INTEGER NOT NULL, str_max INTEGER NOT NULL, str_growth_weight REAL NOT NULL DEFAULT 1,
        dex_min INTEGER NOT NULL, dex_max INTEGER NOT NULL, dex_growth_weight REAL NOT NULL DEFAULT 1,
        con_min INTEGER NOT NULL, con_max INTEGER NOT NULL, con_growth_weight REAL NOT NULL DEFAULT 1,
        pow_min INTEGER NOT NULL, pow_max INTEGER NOT NULL, pow_growth_weight REAL NOT NULL DEFAULT 1,
        int_min INTEGER NOT NULL, int_max INTEGER NOT NULL, int_growth_weight REAL NOT NULL DEFAULT 1,
        siz_min INTEGER NOT NULL, siz_max INTEGER NOT NULL, siz_growth_weight REAL NOT NULL DEFAULT 1,
        created_by_user_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CHECK (str_min <= str_max), CHECK (dex_min <= dex_max), CHECK (con_min <= con_max),
        CHECK (pow_min <= pow_max), CHECK (int_min <= int_max), CHECK (siz_min <= siz_max)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS monster_skill_profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        source_scope TEXT NOT NULL DEFAULT 'common' CHECK (source_scope IN ('common','template','boss')),
        source_template_id TEXT, stored_accuracy INTEGER NOT NULL, damage_type TEXT NOT NULL DEFAULT 'physical',
        template_base_damage REAL NOT NULL DEFAULT 0, damage_growth_weight REAL NOT NULL DEFAULT 1,
        damage_attribute_links TEXT NOT NULL DEFAULT '[]', range_text TEXT NOT NULL DEFAULT '',
        targeting_text TEXT NOT NULL DEFAULT 'single target', mp_cost INTEGER NOT NULL DEFAULT 0,
        cooldown_rounds INTEGER NOT NULL DEFAULT 0, gm_notes TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
        created_by_user_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (source_template_id) REFERENCES monster_templates(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS monster_template_skills (
        template_id TEXT NOT NULL, skill_profile_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, PRIMARY KEY (template_id, skill_profile_id),
        FOREIGN KEY (template_id) REFERENCES monster_templates(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_profile_id) REFERENCES monster_skill_profiles(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS monster_instances (
        id TEXT PRIMARY KEY, template_id TEXT NOT NULL, encounter_id TEXT NOT NULL, display_name TEXT NOT NULL,
        level INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','defeated','removed')),
        is_elite INTEGER NOT NULL DEFAULT 0, elite_roll INTEGER NOT NULL, elite_bonus INTEGER NOT NULL DEFAULT 0,
        base_str INTEGER NOT NULL, base_dex INTEGER NOT NULL, base_con INTEGER NOT NULL, base_pow INTEGER NOT NULL, base_int INTEGER NOT NULL, base_siz INTEGER NOT NULL,
        natural_str INTEGER NOT NULL, natural_dex INTEGER NOT NULL, natural_con INTEGER NOT NULL, natural_pow INTEGER NOT NULL, natural_int INTEGER NOT NULL, natural_siz INTEGER NOT NULL,
        effective_str INTEGER NOT NULL, effective_dex INTEGER NOT NULL, effective_con INTEGER NOT NULL, effective_pow INTEGER NOT NULL, effective_int INTEGER NOT NULL, effective_siz INTEGER NOT NULL,
        calculated_max_hp REAL NOT NULL, hp_max_adjustment REAL NOT NULL DEFAULT 0, final_max_hp REAL NOT NULL, current_hp REAL NOT NULL,
        calculated_max_mp REAL NOT NULL, mp_max_adjustment REAL NOT NULL DEFAULT 0, final_max_mp REAL NOT NULL, current_mp REAL NOT NULL,
        created_by_user_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (template_id) REFERENCES monster_templates(id) ON DELETE RESTRICT,
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS monster_instance_skills (
        id TEXT PRIMARY KEY, monster_instance_id TEXT NOT NULL, source_skill_profile_id TEXT, source_scope TEXT NOT NULL DEFAULT 'common',
        name TEXT NOT NULL, stored_accuracy INTEGER NOT NULL, hit_modifier INTEGER NOT NULL DEFAULT 0,
        damage_type TEXT NOT NULL DEFAULT 'physical', template_base_damage REAL NOT NULL DEFAULT 0, damage_growth_weight REAL NOT NULL DEFAULT 1,
        damage_attribute_links TEXT NOT NULL DEFAULT '[]', damage_attribute_values TEXT NOT NULL DEFAULT '{}', damage_attribute_basis REAL NOT NULL DEFAULT 0,
        calculated_base_damage REAL NOT NULL DEFAULT 0, calculated_damage_center REAL NOT NULL DEFAULT 0,
        suggested_spread_min INTEGER NOT NULL, suggested_spread_max INTEGER NOT NULL, final_spread_min INTEGER NOT NULL, final_spread_max INTEGER NOT NULL,
        range_text TEXT NOT NULL DEFAULT '', targeting_text TEXT NOT NULL DEFAULT 'single target', mp_cost INTEGER NOT NULL DEFAULT 0,
        cooldown_rounds INTEGER NOT NULL DEFAULT 0, gm_notes TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (monster_instance_id) REFERENCES monster_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (source_skill_profile_id) REFERENCES monster_skill_profiles(id) ON DELETE SET NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS monster_action_log (
        id TEXT PRIMARY KEY, combat_id TEXT NOT NULL, round_number INTEGER NOT NULL, turn_index INTEGER NOT NULL,
        actor_combatant_id TEXT NOT NULL, monster_instance_id TEXT NOT NULL, monster_instance_skill_id TEXT NOT NULL,
        target_combatant_id TEXT NOT NULL, stored_accuracy REAL NOT NULL, hit_modifier REAL NOT NULL DEFAULT 0,
        modified_accuracy REAL NOT NULL, effective_accuracy REAL NOT NULL, attack_roll INTEGER NOT NULL, attack_result REAL NOT NULL,
        defence_roll INTEGER NOT NULL, defence_result REAL NOT NULL, great_success INTEGER NOT NULL DEFAULT 0, great_failure INTEGER NOT NULL DEFAULT 0,
        damage_attribute_basis REAL NOT NULL DEFAULT 0, calculated_base_damage REAL NOT NULL DEFAULT 0, calculated_damage_center REAL NOT NULL DEFAULT 0,
        spread_roll INTEGER, raw_damage REAL, effective_defence REAL, damage_result REAL, hp_damage REAL NOT NULL DEFAULT 0,
        outcome TEXT NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY (combat_id) REFERENCES combats(id) ON DELETE CASCADE,
        FOREIGN KEY (monster_instance_id) REFERENCES monster_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (monster_instance_skill_id) REFERENCES monster_instance_skills(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monster_templates_active ON monster_templates(is_active, name)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monster_skill_profiles_scope ON monster_skill_profiles(source_scope, is_active, name)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monster_template_skills_template ON monster_template_skills(template_id, sort_order)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monster_instances_encounter ON monster_instances(encounter_id, status, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monster_instances_template ON monster_instances(template_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monster_instance_skills_instance ON monster_instance_skills(monster_instance_id, is_active, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monster_action_log_combat ON monster_action_log(combat_id, round_number, turn_index, created_at)')
    ]).catch(error => {
      monsterSchemaPromise = null;
      throw error;
    });
  }
  await monsterSchemaPromise;
}

async function storyPayload(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/gm/story', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) throw Object.assign(new Error('Story runtime 未能載入。'), { status: response.status, code: 'STORY_RUNTIME_UNAVAILABLE' });
  return response.json();
}

function flattenEncounters(story) {
  const output = [];
  for (const scenario of story?.scenarios || []) {
    for (const scene of scenario.scenes || []) {
      for (const encounter of scene.encounters || []) {
        output.push({
          id: encounter.id,
          name: encounter.name,
          status: encounter.status,
          combat: encounter.combat || null,
          sceneId: scene.id,
          sceneName: scene.name,
          sceneStatus: scene.status,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          scenarioStatus: scenario.status,
          participants: encounter.participants || []
        });
      }
    }
  }
  return output;
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

function mapTemplate(row, skillIds = []) {
  const config = templateConfig(row);
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    isActive: Boolean(row.is_active),
    attributes: Object.fromEntries(MONSTER_ATTRIBUTE_KEYS.map(key => [key, {
      min: config.ranges[key].min,
      max: config.ranges[key].max,
      growthWeight: config.growthWeights[key]
    }])),
    skillIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSkill(row) {
  return {
    id: row.id,
    name: row.name,
    sourceScope: row.source_scope,
    sourceTemplateId: row.source_template_id || null,
    storedAccuracy: Number(row.stored_accuracy),
    damageType: row.damage_type,
    templateBaseDamage: Number(row.template_base_damage),
    damageGrowthWeight: Number(row.damage_growth_weight),
    damageAttributeLinks: parseJson(row.damage_attribute_links, []),
    rangeText: row.range_text,
    targetingText: row.targeting_text,
    mpCost: Number(row.mp_cost || 0),
    cooldownRounds: Number(row.cooldown_rounds || 0),
    gmNotes: row.gm_notes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInstanceSkill(row) {
  return {
    id: row.id,
    monsterInstanceId: row.monster_instance_id,
    sourceSkillProfileId: row.source_skill_profile_id || null,
    sourceScope: row.source_scope,
    name: row.name,
    storedAccuracy: Number(row.stored_accuracy),
    hitModifier: Number(row.hit_modifier || 0),
    damageType: row.damage_type,
    templateBaseDamage: Number(row.template_base_damage),
    damageGrowthWeight: Number(row.damage_growth_weight),
    damageAttributeLinks: parseJson(row.damage_attribute_links, []),
    damageAttributeValues: parseJson(row.damage_attribute_values, {}),
    damageAttributeBasis: Number(row.damage_attribute_basis),
    calculatedBaseDamage: Number(row.calculated_base_damage),
    calculatedDamageCenter: Number(row.calculated_damage_center),
    suggestedSpreadMin: Number(row.suggested_spread_min),
    suggestedSpreadMax: Number(row.suggested_spread_max),
    finalSpreadMin: Number(row.final_spread_min),
    finalSpreadMax: Number(row.final_spread_max),
    rangeText: row.range_text,
    targetingText: row.targeting_text,
    mpCost: Number(row.mp_cost || 0),
    cooldownRounds: Number(row.cooldown_rounds || 0),
    gmNotes: row.gm_notes,
    isActive: Boolean(row.is_active)
  };
}

function mapInstance(row, skills = []) {
  const base = {}, natural = {}, effective = {};
  for (const key of MONSTER_ATTRIBUTE_KEYS) {
    const lower = key.toLowerCase();
    base[key] = Number(row[`base_${lower}`]);
    natural[key] = Number(row[`natural_${lower}`]);
    effective[key] = Number(row[`effective_${lower}`]);
  }
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name || '',
    encounterId: row.encounter_id,
    encounterName: row.encounter_name || '',
    displayName: row.display_name,
    level: Number(row.level),
    status: row.status,
    isElite: Boolean(row.is_elite),
    eliteRoll: Number(row.elite_roll),
    eliteBonus: Number(row.elite_bonus),
    baseAttributes: base,
    naturalAttributes: natural,
    effectiveAttributes: effective,
    resources: {
      hp: {
        calculatedMax: Number(row.calculated_max_hp),
        maxAdjustment: Number(row.hp_max_adjustment || 0),
        max: Number(row.final_max_hp),
        current: Number(row.current_hp)
      },
      mp: {
        calculatedMax: Number(row.calculated_max_mp),
        maxAdjustment: Number(row.mp_max_adjustment || 0),
        max: Number(row.final_max_mp),
        current: Number(row.current_mp)
      }
    },
    skills,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function validateAttributeConfig(input) {
  const attributes = {};
  for (const key of MONSTER_ATTRIBUTE_KEYS) {
    const source = input?.[key] || input?.[key.toLowerCase()] || {};
    const min = integer(source.min, `${key} Min`, { min: 0, max: 10000 });
    const max = integer(source.max, `${key} Max`, { min: 0, max: 10000 });
    if (min > max) throw Object.assign(new Error(`${key} Min 不能大過 Max。`), { status: 400, code: 'VALIDATION_ERROR' });
    const growthWeight = finite(source.growthWeight, `${key} Growth Weight`, { min: 0, max: 100 });
    attributes[key] = { min, max, growthWeight };
  }
  return attributes;
}

function validateTemplateBody(body, existing = null) {
  const fallbackAttributes = existing ? mapTemplate(existing).attributes : null;
  return {
    name: body?.name === undefined && existing ? existing.name : requiredName(body?.name, 'Monster Template Name'),
    summary: body?.summary === undefined && existing ? existing.summary : cleanText(body?.summary, 5000),
    isActive: body?.isActive === undefined && existing ? Boolean(existing.is_active) : body?.isActive !== false,
    attributes: validateAttributeConfig(body?.attributes || fallbackAttributes)
  };
}

function validateLinks(value) {
  const raw = Array.isArray(value) ? value : [];
  const unique = [...new Set(raw.map(item => String(item || '').toUpperCase()))];
  const invalid = unique.find(key => !MONSTER_ATTRIBUTE_KEYS.includes(key));
  if (invalid) throw Object.assign(new Error(`無效 Damage Attribute Link: ${invalid}`), { status: 400, code: 'VALIDATION_ERROR' });
  return unique;
}

function validateSkillBody(body, existing = null) {
  const get = (key, oldKey, fallback = undefined) => body?.[key] === undefined && existing ? existing[oldKey] : (body?.[key] ?? fallback);
  return {
    name: body?.name === undefined && existing ? existing.name : requiredName(body?.name, 'Monster Skill Name'),
    storedAccuracy: integer(get('storedAccuracy', 'stored_accuracy'), 'Stored Accuracy', { min: 0, max: 10000 }),
    damageType: cleanText(get('damageType', 'damage_type', 'physical'), 80) || 'physical',
    templateBaseDamage: finite(get('templateBaseDamage', 'template_base_damage', 0), 'Template Base Damage', { min: 0, max: 1_000_000 }),
    damageGrowthWeight: finite(get('damageGrowthWeight', 'damage_growth_weight', 1), 'Damage Growth Weight', { min: 0, max: 100 }),
    damageAttributeLinks: body?.damageAttributeLinks === undefined && existing
      ? validateLinks(parseJson(existing.damage_attribute_links, []))
      : validateLinks(body?.damageAttributeLinks),
    rangeText: cleanText(get('rangeText', 'range_text', ''), 300),
    targetingText: cleanText(get('targetingText', 'targeting_text', 'single target'), 300) || 'single target',
    mpCost: integer(get('mpCost', 'mp_cost', 0), 'MP Cost', { min: 0, max: 1_000_000 }),
    cooldownRounds: integer(get('cooldownRounds', 'cooldown_rounds', 0), 'Cooldown', { min: 0, max: 10000 }),
    gmNotes: cleanText(get('gmNotes', 'gm_notes', ''), 10000),
    isActive: body?.isActive === undefined && existing ? Boolean(existing.is_active) : body?.isActive !== false
  };
}

async function monsterOverview(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureMonsterSchema(env);
  const story = await storyPayload(request, env);
  const [templateRows, skillRows, linkRows, instanceRows, instanceSkillRows] = await Promise.all([
    env.DB.prepare('SELECT * FROM monster_templates ORDER BY name COLLATE NOCASE, created_at').all(),
    env.DB.prepare("SELECT * FROM monster_skill_profiles WHERE source_scope = 'common' ORDER BY name COLLATE NOCASE, created_at").all(),
    env.DB.prepare('SELECT template_id, skill_profile_id FROM monster_template_skills ORDER BY template_id, sort_order, created_at').all(),
    env.DB.prepare(`
      SELECT mi.*, mt.name AS template_name, e.name AS encounter_name
      FROM monster_instances mi
      JOIN monster_templates mt ON mt.id = mi.template_id
      LEFT JOIN encounters e ON e.id = mi.encounter_id
      ORDER BY mi.created_at DESC
    `).all(),
    env.DB.prepare('SELECT * FROM monster_instance_skills ORDER BY monster_instance_id, created_at, id').all()
  ]);

  const links = new Map();
  for (const row of linkRows.results || []) {
    if (!links.has(row.template_id)) links.set(row.template_id, []);
    links.get(row.template_id).push(row.skill_profile_id);
  }
  const skillsByInstance = new Map();
  for (const row of instanceSkillRows.results || []) {
    if (!skillsByInstance.has(row.monster_instance_id)) skillsByInstance.set(row.monster_instance_id, []);
    skillsByInstance.get(row.monster_instance_id).push(mapInstanceSkill(row));
  }

  return json({
    ok: true,
    templates: (templateRows.results || []).map(row => mapTemplate(row, links.get(row.id) || [])),
    skills: (skillRows.results || []).map(mapSkill),
    instances: (instanceRows.results || []).map(row => mapInstance(row, skillsByInstance.get(row.id) || [])),
    encounterCandidates: flattenEncounters(story).filter(item =>
      ['planned', 'active'].includes(item.status)
      && item.sceneStatus !== 'completed'
      && item.scenarioStatus !== 'archived'
      && !item.combat
    )
  });
}

async function createSkill(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureMonsterSchema(env);
  const values = validateSkillBody(await readBody(request));
  const id = `mskill_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO monster_skill_profiles (
      id, name, source_scope, source_template_id, stored_accuracy, damage_type,
      template_base_damage, damage_growth_weight, damage_attribute_links,
      range_text, targeting_text, mp_cost, cooldown_rounds, gm_notes, is_active,
      created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, 'common', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, values.name, values.storedAccuracy, values.damageType,
    values.templateBaseDamage, values.damageGrowthWeight, JSON.stringify(values.damageAttributeLinks),
    values.rangeText, values.targetingText, values.mpCost, values.cooldownRounds, values.gmNotes,
    values.isActive ? 1 : 0, user.id, now, now
  ).run();
  return json({ ok: true, id }, 201);
}

async function updateSkill(request, env, skillId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureMonsterSchema(env);
  const existing = await env.DB.prepare("SELECT * FROM monster_skill_profiles WHERE id = ? AND source_scope = 'common' LIMIT 1").bind(skillId).first();
  if (!existing) return apiError('找不到 Common Monster Skill。', 404, 'MONSTER_SKILL_NOT_FOUND');
  const values = validateSkillBody(await readBody(request), existing);
  await env.DB.prepare(`
    UPDATE monster_skill_profiles
    SET name = ?, stored_accuracy = ?, damage_type = ?, template_base_damage = ?, damage_growth_weight = ?,
        damage_attribute_links = ?, range_text = ?, targeting_text = ?, mp_cost = ?, cooldown_rounds = ?,
        gm_notes = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    values.name, values.storedAccuracy, values.damageType, values.templateBaseDamage, values.damageGrowthWeight,
    JSON.stringify(values.damageAttributeLinks), values.rangeText, values.targetingText, values.mpCost,
    values.cooldownRounds, values.gmNotes, values.isActive ? 1 : 0, Date.now(), skillId
  ).run();
  return json({ ok: true, id: skillId });
}

async function createTemplate(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureMonsterSchema(env);
  const values = validateTemplateBody(await readBody(request));
  const a = values.attributes;
  const id = `mtemplate_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO monster_templates (
      id, name, summary, is_active,
      str_min, str_max, str_growth_weight, dex_min, dex_max, dex_growth_weight,
      con_min, con_max, con_growth_weight, pow_min, pow_max, pow_growth_weight,
      int_min, int_max, int_growth_weight, siz_min, siz_max, siz_growth_weight,
      created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, values.name, values.summary, values.isActive ? 1 : 0,
    a.STR.min, a.STR.max, a.STR.growthWeight, a.DEX.min, a.DEX.max, a.DEX.growthWeight,
    a.CON.min, a.CON.max, a.CON.growthWeight, a.POW.min, a.POW.max, a.POW.growthWeight,
    a.INT.min, a.INT.max, a.INT.growthWeight, a.SIZ.min, a.SIZ.max, a.SIZ.growthWeight,
    user.id, now, now
  ).run();
  return json({ ok: true, id }, 201);
}

async function updateTemplate(request, env, templateId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureMonsterSchema(env);
  const existing = await env.DB.prepare('SELECT * FROM monster_templates WHERE id = ? LIMIT 1').bind(templateId).first();
  if (!existing) return apiError('找不到 Monster Template。', 404, 'MONSTER_TEMPLATE_NOT_FOUND');
  const values = validateTemplateBody(await readBody(request), existing);
  const a = values.attributes;
  await env.DB.prepare(`
    UPDATE monster_templates SET
      name = ?, summary = ?, is_active = ?,
      str_min = ?, str_max = ?, str_growth_weight = ?, dex_min = ?, dex_max = ?, dex_growth_weight = ?,
      con_min = ?, con_max = ?, con_growth_weight = ?, pow_min = ?, pow_max = ?, pow_growth_weight = ?,
      int_min = ?, int_max = ?, int_growth_weight = ?, siz_min = ?, siz_max = ?, siz_growth_weight = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    values.name, values.summary, values.isActive ? 1 : 0,
    a.STR.min, a.STR.max, a.STR.growthWeight, a.DEX.min, a.DEX.max, a.DEX.growthWeight,
    a.CON.min, a.CON.max, a.CON.growthWeight, a.POW.min, a.POW.max, a.POW.growthWeight,
    a.INT.min, a.INT.max, a.INT.growthWeight, a.SIZ.min, a.SIZ.max, a.SIZ.growthWeight,
    Date.now(), templateId
  ).run();
  return json({ ok: true, id: templateId });
}

async function setTemplateSkills(request, env, templateId) {
  if (request.method !== 'PUT') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureMonsterSchema(env);
  const template = await env.DB.prepare('SELECT id FROM monster_templates WHERE id = ? LIMIT 1').bind(templateId).first();
  if (!template) return apiError('找不到 Monster Template。', 404, 'MONSTER_TEMPLATE_NOT_FOUND');
  const body = await readBody(request);
  const skillIds = [...new Set((Array.isArray(body?.skillIds) ? body.skillIds : []).map(value => String(value || '').trim()).filter(Boolean))];
  if (skillIds.length > 50) return apiError('Monster Template 最多連結 50 個 Skill。', 400, 'VALIDATION_ERROR');
  if (skillIds.length) {
    const placeholders = skillIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT id, is_active FROM monster_skill_profiles WHERE source_scope = 'common' AND id IN (${placeholders})`).bind(...skillIds).all();
    if ((rows.results || []).length !== skillIds.length) return apiError('部分 Common Monster Skill 不存在。', 400, 'MONSTER_SKILL_NOT_FOUND');
    if ((rows.results || []).some(row => !Boolean(row.is_active))) return apiError('Inactive Monster Skill 不能加入 Template。', 409, 'MONSTER_SKILL_INACTIVE');
  }
  const now = Date.now();
  const statements = [env.DB.prepare('DELETE FROM monster_template_skills WHERE template_id = ?').bind(templateId)];
  skillIds.forEach((skillId, index) => statements.push(env.DB.prepare(`
    INSERT INTO monster_template_skills (template_id, skill_profile_id, sort_order, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(templateId, skillId, index, now)));
  await env.DB.batch(statements);
  return json({ ok: true, templateId, skillIds });
}

async function spawnMonster(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const user = await requireGM(request, env);
  await ensureMonsterSchema(env);
  const story = await storyPayload(request, env);
  const body = await readBody(request);
  const templateId = String(body?.templateId || '').trim();
  const encounterId = String(body?.encounterId || '').trim();
  if (!templateId || !encounterId) return apiError('Template 同 Encounter 都係必填。', 400, 'VALIDATION_ERROR');
  let level;
  try { level = validateMonsterLevel(body?.level); } catch (error) { return apiError(error.message, 400, 'VALIDATION_ERROR'); }

  const encounter = flattenEncounters(story).find(item => item.id === encounterId);
  if (!encounter) return apiError('找不到 Encounter。', 404, 'ENCOUNTER_NOT_FOUND');
  if (!['planned', 'active'].includes(encounter.status) || encounter.sceneStatus === 'completed' || encounter.scenarioStatus === 'archived') {
    return apiError('此 Encounter 目前不能 Spawn Monster。', 409, 'ENCOUNTER_CLOSED');
  }
  if (encounter.combat) return apiError('Encounter 已經連結 Combat，不能再 Spawn Monster Instance。', 409, 'ENCOUNTER_COMBAT_LINKED');

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
  const generated = buildMonsterAttributes({
    ranges: config.ranges,
    growthWeights: config.growthWeights,
    level
  });
  const resources = monsterCalculatedResources(generated.effective);
  const id = `monster_${crypto.randomUUID()}`;
  const displayName = cleanText(body?.displayName, 120) || templateRow.name;
  const now = Date.now();
  const statements = [env.DB.prepare(`
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
    id, templateId, encounterId, displayName, level, generated.isElite ? 1 : 0, generated.eliteRoll, generated.eliteBonus,
    generated.baseRolls.STR, generated.baseRolls.DEX, generated.baseRolls.CON, generated.baseRolls.POW, generated.baseRolls.INT, generated.baseRolls.SIZ,
    generated.natural.STR, generated.natural.DEX, generated.natural.CON, generated.natural.POW, generated.natural.INT, generated.natural.SIZ,
    generated.effective.STR, generated.effective.DEX, generated.effective.CON, generated.effective.POW, generated.effective.INT, generated.effective.SIZ,
    resources.maxHp, resources.maxHp, resources.maxHp, resources.maxMp, resources.maxMp, resources.maxMp,
    user.id, now, now
  )];

  statements.push(env.DB.prepare(`
    INSERT INTO encounter_participants (
      id, encounter_id, entity_type, entity_id, display_name_snapshot, created_at, updated_at
    ) VALUES (?, ?, 'monster_instance', ?, ?, ?, ?)
  `).bind(`ep_${crypto.randomUUID()}`, encounterId, id, displayName, now, now));

  for (const row of skillRows.results || []) {
    const skill = mapSkill(row);
    const snapshot = snapshotMonsterSkill(skill, {
      level,
      effectiveAttributes: generated.effective
    });
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
      `msnap_${crypto.randomUUID()}`, id, skill.id, skill.sourceScope, skill.name,
      skill.storedAccuracy, skill.damageType, skill.templateBaseDamage, skill.damageGrowthWeight,
      JSON.stringify(snapshot.damageAttributeLinks), JSON.stringify(snapshot.damageAttributeValues), snapshot.damageAttributeBasis,
      snapshot.calculatedBaseDamage, snapshot.calculatedDamageCenter,
      snapshot.suggestedSpreadMin, snapshot.suggestedSpreadMax, snapshot.finalSpreadMin, snapshot.finalSpreadMax,
      skill.rangeText, skill.targetingText, skill.mpCost, skill.cooldownRounds, skill.gmNotes, now, now
    ));
  }

  await env.DB.batch(statements);
  return json({
    ok: true,
    id,
    generated: {
      level,
      isElite: generated.isElite,
      eliteRoll: generated.eliteRoll,
      eliteBonus: generated.eliteBonus,
      naturalAttributes: generated.natural,
      effectiveAttributes: generated.effective,
      maxHp: resources.maxHp,
      maxMp: resources.maxMp,
      snapshottedSkills: (skillRows.results || []).length
    }
  }, 201);
}

async function updateInstanceResources(request, env, instanceId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureMonsterSchema(env);
  const row = await env.DB.prepare('SELECT * FROM monster_instances WHERE id = ? LIMIT 1').bind(instanceId).first();
  if (!row) return apiError('找不到 Monster Instance。', 404, 'MONSTER_INSTANCE_NOT_FOUND');
  const body = await readBody(request);
  const oldHpMax = Number(row.final_max_hp);
  const oldMpMax = Number(row.final_max_mp);
  const hpAdjustment = body?.hpMaxAdjustment === undefined ? Number(row.hp_max_adjustment || 0) : finite(body.hpMaxAdjustment, 'HP Max Adjustment');
  const mpAdjustment = body?.mpMaxAdjustment === undefined ? Number(row.mp_max_adjustment || 0) : finite(body.mpMaxAdjustment, 'MP Max Adjustment');
  const newHpMax = Math.max(0, Number(row.calculated_max_hp) + hpAdjustment);
  const newMpMax = Math.max(0, Number(row.calculated_max_mp) + mpAdjustment);
  let currentHp = body?.currentHp === undefined
    ? (newHpMax >= oldHpMax ? Number(row.current_hp) + (newHpMax - oldHpMax) : Math.min(Number(row.current_hp), newHpMax))
    : finite(body.currentHp, 'Current HP', { min: 0, max: newHpMax });
  let currentMp = body?.currentMp === undefined
    ? (newMpMax >= oldMpMax ? Number(row.current_mp) + (newMpMax - oldMpMax) : Math.min(Number(row.current_mp), newMpMax))
    : finite(body.currentMp, 'Current MP', { min: 0, max: newMpMax });
  currentHp = Math.max(0, Math.min(newHpMax, currentHp));
  currentMp = Math.max(0, Math.min(newMpMax, currentMp));
  await env.DB.prepare(`
    UPDATE monster_instances
    SET hp_max_adjustment = ?, final_max_hp = ?, current_hp = ?,
        mp_max_adjustment = ?, final_max_mp = ?, current_mp = ?, updated_at = ?
    WHERE id = ?
  `).bind(hpAdjustment, newHpMax, currentHp, mpAdjustment, newMpMax, currentMp, Date.now(), instanceId).run();
  return json({ ok: true, instanceId, hp: { max: newHpMax, current: currentHp }, mp: { max: newMpMax, current: currentMp } });
}

async function updateInstanceSpread(request, env, instanceId, skillId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureMonsterSchema(env);
  const row = await env.DB.prepare('SELECT id FROM monster_instance_skills WHERE id = ? AND monster_instance_id = ? LIMIT 1').bind(skillId, instanceId).first();
  if (!row) return apiError('找不到 Monster Instance Skill。', 404, 'MONSTER_INSTANCE_SKILL_NOT_FOUND');
  const body = await readBody(request);
  let spread;
  try { spread = validateSpreadRange(body?.min, body?.max); } catch (error) { return apiError(error.message, 400, 'VALIDATION_ERROR'); }
  await env.DB.prepare(`UPDATE monster_instance_skills SET final_spread_min = ?, final_spread_max = ?, updated_at = ? WHERE id = ?`)
    .bind(spread.min, spread.max, Date.now(), skillId).run();
  return json({ ok: true, instanceId, skillId, finalSpreadMin: spread.min, finalSpreadMax: spread.max });
}

async function loadCombat(env, combatId = '') {
  const combat = combatId
    ? await env.DB.prepare('SELECT * FROM combats WHERE id = ? LIMIT 1').bind(combatId).first()
    : await env.DB.prepare("SELECT * FROM combats WHERE status = 'active' ORDER BY started_at DESC LIMIT 1").first();
  if (!combat) return null;
  const rows = await env.DB.prepare(`
    SELECT id, entity_type, entity_id, controller_user_id, display_name, dex_snapshot,
           initiative_order, action_available, move_available, turn_completed
    FROM combatants WHERE combat_id = ? ORDER BY initiative_order
  `).bind(combat.id).all();
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
    startedAt: combat.started_at,
    updatedAt: combat.updated_at,
    combatants,
    currentCombatant: combatants.find(item => item.initiativeOrder === currentTurnIndex) || null
  };
}

async function extendedEncounterStart(request, env, encounterId) {
  if (request.method !== 'POST') return baseWorker.fetch(request, env);
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureMonsterSchema(env);
  const story = await storyPayload(request, env);
  const encounter = flattenEncounters(story).find(item => item.id === encounterId);
  if (!encounter) return apiError('找不到 Encounter。', 404, 'ENCOUNTER_NOT_FOUND');
  const monsterParticipants = (encounter.participants || []).filter(item => item.entityType === 'monster_instance');
  if (!monsterParticipants.length) return baseWorker.fetch(request, env);
  if (encounter.combat) return apiError('此 Encounter 已經有 linked Combat。', 409, 'ENCOUNTER_COMBAT_EXISTS');
  if (!['planned', 'active'].includes(encounter.status) || encounter.sceneStatus === 'completed') {
    return apiError('此 Encounter 目前不能開始 Combat。', 409, 'ENCOUNTER_CLOSED');
  }

  const characterIds = (encounter.participants || []).filter(item => item.entityType === 'character').map(item => item.entityId);
  if (!characterIds.length) return apiError('MVP Encounter Combat 至少要有一個 Character participant。', 409, 'ENCOUNTER_CHARACTER_REQUIRED');
  const monsterIds = monsterParticipants.map(item => item.entityId);
  const placeholders = monsterIds.map(() => '?').join(',');
  const monsterRows = await env.DB.prepare(`
    SELECT id, display_name, effective_dex, status
    FROM monster_instances WHERE id IN (${placeholders})
  `).bind(...monsterIds).all();
  if ((monsterRows.results || []).length !== monsterIds.length) return apiError('部分 Monster Instance 不存在。', 409, 'MONSTER_INSTANCE_NOT_FOUND');
  const invalidMonster = (monsterRows.results || []).find(row => row.status !== 'active');
  if (invalidMonster) return apiError(`${invalidMonster.display_name} 目前唔係 active Monster Instance。`, 409, 'MONSTER_INSTANCE_NOT_ACTIVE');

  const internalStart = new Request(new URL('/api/gm/combat/start', request.url), {
    method: 'POST',
    headers: {
      Accept: 'application/json', 'Content-Type': 'application/json',
      Cookie: request.headers.get('Cookie') || '', Origin: new URL(request.url).origin
    },
    body: JSON.stringify({ characterIds })
  });
  const startResponse = await baseWorker.fetch(internalStart, env);
  if (!startResponse.ok) return startResponse;
  const startPayload = await startResponse.json();
  const baseCombat = startPayload?.combat;
  if (!baseCombat?.id) return apiError('Combat 建立失敗。', 500, 'COMBAT_START_FAILED');

  const participants = [];
  for (const item of baseCombat.combatants || []) {
    participants.push({
      id: `character:${item.entityId}`,
      entityType: 'character',
      entityId: item.entityId,
      controllerUserId: item.controllerUserId,
      displayName: item.displayName,
      dex: Number(item.dex)
    });
  }
  for (const row of monsterRows.results || []) {
    participants.push({
      id: `monster_instance:${row.id}`,
      entityType: 'monster_instance',
      entityId: row.id,
      controllerUserId: null,
      displayName: row.display_name,
      dex: Number(row.effective_dex)
    });
  }

  const initiative = buildCombatInitiative(participants);
  const now = Date.now();
  const statements = [env.DB.prepare('DELETE FROM combatants WHERE combat_id = ?').bind(baseCombat.id)];
  for (const item of initiative) {
    statements.push(env.DB.prepare(`
      INSERT INTO combatants (
        id, combat_id, entity_type, entity_id, controller_user_id, display_name,
        dex_snapshot, initiative_order, action_available, move_available,
        turn_completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)
    `).bind(
      `combatant_${crypto.randomUUID()}`, baseCombat.id, item.entityType, item.entityId,
      item.controllerUserId, item.displayName, item.dex, item.initiativeOrder, now, now
    ));
  }
  statements.push(env.DB.prepare('INSERT INTO encounter_combats (encounter_id, combat_id, linked_at) VALUES (?, ?, ?)').bind(encounterId, baseCombat.id, now));
  statements.push(env.DB.prepare("UPDATE encounters SET status = 'active', updated_at = ? WHERE id = ? AND status IN ('planned','active')").bind(now, encounterId));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error('Extended Encounter Combat setup failed', error);
    try {
      await baseWorker.fetch(new Request(new URL(`/api/gm/combat/${encodeURIComponent(baseCombat.id)}/end`, request.url), {
        method: 'POST',
        headers: {
          Accept: 'application/json', 'Content-Type': 'application/json',
          Cookie: request.headers.get('Cookie') || '', Origin: new URL(request.url).origin
        },
        body: JSON.stringify({})
      }), env);
    } catch (cleanupError) {
      console.error('Unable to clean up Monster Combat', cleanupError);
    }
    return apiError('Monster Combat 無法安全連結 Encounter；已嘗試清理。', 500, 'COMBAT_LINK_FAILED');
  }

  const combat = await loadCombat(env, baseCombat.id);
  return json({ ok: true, encounterId, combat }, 201);
}

async function monsterMapForCombat(env, combat) {
  const ids = (combat?.combatants || []).filter(item => item.entityType === 'monster_instance').map(item => item.entityId);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, display_name, level, status, is_elite, current_hp, final_max_hp, current_mp, final_max_mp,
           effective_str, effective_dex, effective_con, effective_pow, effective_int, effective_siz
    FROM monster_instances WHERE id IN (${placeholders})
  `).bind(...ids).all();
  return new Map((rows.results || []).map(row => [row.id, row]));
}

function enrichMonsterCombatant(item, row) {
  if (!row) return item;
  return {
    ...item,
    monsterStatus: row.status,
    level: Number(row.level),
    isElite: Boolean(row.is_elite),
    hp: { current: Number(row.current_hp), max: Number(row.final_max_hp) },
    mp: { current: Number(row.current_mp), max: Number(row.final_max_mp) },
    effectiveAttributes: {
      STR: Number(row.effective_str), DEX: Number(row.effective_dex), CON: Number(row.effective_con),
      POW: Number(row.effective_pow), INT: Number(row.effective_int), SIZ: Number(row.effective_siz)
    },
    lifeState: row.status === 'active' ? 'alive' : 'dead'
  };
}

async function monsterTurnPayload(env, combat, monsterMap) {
  const current = combat?.currentCombatant;
  if (!current || current.entityType !== 'monster_instance') return null;
  const monster = monsterMap.get(current.entityId);
  if (!monster || monster.status !== 'active') return { unavailable: true, reason: 'Monster Instance is not active.' };
  const skillRows = await env.DB.prepare(`SELECT * FROM monster_instance_skills WHERE monster_instance_id = ? AND is_active = 1 ORDER BY created_at, id`).bind(current.entityId).all();
  const targets = [];
  for (const target of combat.combatants.filter(item => item.entityType === 'character')) {
    const life = await ensureLifeRow(env, target.entityId);
    if (life.lifeState === 'dead' || life.characterLocked) continue;
    const hp = await env.DB.prepare("SELECT current_value, max_value FROM character_resources WHERE character_id = ? AND UPPER(key) = 'HP' LIMIT 1").bind(target.entityId).first();
    targets.push({
      combatantId: target.id,
      characterId: target.entityId,
      displayName: target.displayName,
      lifeState: life.lifeState,
      dyingRoundsRemaining: life.dyingRoundsRemaining,
      hp: hp ? { current: Number(hp.current_value), max: Number(hp.max_value) } : null
    });
  }
  return {
    instance: enrichMonsterCombatant(current, monster),
    skills: (skillRows.results || []).map(mapInstanceSkill),
    targets
  };
}

async function enrichGmCombat(request, env) {
  const baseResponse = await baseWorker.fetch(request, env);
  if (!baseResponse.ok) return baseResponse;
  await ensureMonsterSchema(env);
  const payload = await baseResponse.json();
  if (!payload?.combat) return json({ ...payload, monsterTurn: null });
  const combat = await loadCombat(env, payload.combat.id);
  const monsterMap = await monsterMapForCombat(env, combat);
  const enrich = item => item.entityType === 'monster_instance' ? enrichMonsterCombatant(item, monsterMap.get(item.entityId)) : item;
  const combatants = combat.combatants.map(enrich);
  const currentCombatant = combat.currentCombatant ? enrich(combat.currentCombatant) : null;
  const enrichedCombat = { ...payload.combat, combatants, currentCombatant };
  return json({ ...payload, combat: enrichedCombat, monsterTurn: await monsterTurnPayload(env, { ...combat, combatants, currentCombatant }, monsterMap) });
}

async function enrichPlayerCombat(request, env) {
  const baseResponse = await baseWorker.fetch(request, env);
  if (!baseResponse.ok) return baseResponse;
  await ensureMonsterSchema(env);
  const payload = await baseResponse.json();
  if (!payload?.combat) return json(payload);
  const combat = await loadCombat(env, payload.combat.id);
  const monsterMap = await monsterMapForCombat(env, combat);
  const info = new Map();
  for (const item of combat.combatants) {
    if (item.entityType === 'monster_instance') info.set(item.id, enrichMonsterCombatant(item, monsterMap.get(item.entityId)));
  }
  const enrich = item => info.get(item.id) ? { ...item, ...info.get(item.id) } : item;
  return json({
    ...payload,
    combat: {
      ...payload.combat,
      combatants: (payload.combat.combatants || []).map(enrich),
      currentCombatant: payload.combat.currentCombatant ? enrich(payload.combat.currentCombatant) : null
    }
  });
}

async function applyCharacterDamage(env, characterId, hpRow, conValue, hpDamage) {
  const life = await ensureLifeRow(env, characterId);
  if (!(hpDamage > 0)) return { hp: Number(hpRow.current_value), life };
  const now = Date.now();
  if (life.lifeState === 'dying') {
    await env.DB.batch([
      env.DB.prepare('UPDATE character_resources SET current_value = 0 WHERE id = ?').bind(hpRow.id),
      env.DB.prepare(`
        UPDATE character_life_states
        SET life_state = 'dead', character_locked = 1, dying_rounds_remaining = 0,
            died_at = COALESCE(died_at, ?), updated_at = ?
        WHERE character_id = ? AND life_state = 'dying'
      `).bind(now, now, characterId)
    ]);
  } else {
    const dyingRounds = dyingRoundsFromCon(conValue);
    await env.DB.batch([
      env.DB.prepare('UPDATE character_resources SET current_value = MAX(0, current_value - ?) WHERE id = ?').bind(hpDamage, hpRow.id),
      env.DB.prepare(`
        UPDATE character_life_states
        SET life_state = 'dying', character_locked = 0, dying_rounds_remaining = ?, died_at = NULL,
            last_dying_tick_combat_id = NULL, last_dying_tick_round = NULL, updated_at = ?
        WHERE character_id = ? AND life_state = 'alive'
          AND EXISTS (SELECT 1 FROM character_resources WHERE id = ? AND current_value <= 0)
      `).bind(dyingRounds, now, characterId, hpRow.id)
    ]);
  }
  const [hp, refreshedLife] = await Promise.all([
    env.DB.prepare('SELECT current_value FROM character_resources WHERE id = ?').bind(hpRow.id).first(),
    loadCharacterLifeState(env, characterId)
  ]);
  return { hp: Number(hp?.current_value || 0), life: refreshedLife };
}

async function monsterAttack(request, env, combatId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureMonsterSchema(env);
  const body = await readBody(request);
  const skillId = String(body?.skillId || '').trim();
  const targetCombatantId = String(body?.targetCombatantId || '').trim();
  if (!skillId || !targetCombatantId) return apiError('Monster Skill 同 Target 都係必填。', 400, 'VALIDATION_ERROR');

  const combat = await loadCombat(env, combatId);
  if (!combat) return apiError('找不到 Combat。', 404, 'COMBAT_NOT_FOUND');
  if (combat.status !== 'active' || !combat.currentCombatant) return apiError('Combat / Current Turn 無效。', 409, 'COMBAT_NOT_ACTIVE');
  const actor = combat.currentCombatant;
  if (actor.entityType !== 'monster_instance') return apiError('Current Combatant 唔係 Monster Instance。', 409, 'MONSTER_TURN_REQUIRED');
  if (!actor.actionAvailable) return apiError('Monster 本 Turn Action 已使用。', 409, 'ACTION_ALREADY_SPENT');

  const monster = await env.DB.prepare('SELECT * FROM monster_instances WHERE id = ? LIMIT 1').bind(actor.entityId).first();
  if (!monster || monster.status !== 'active') return apiError('Monster Instance 目前不可行動。', 409, 'MONSTER_INSTANCE_NOT_ACTIVE');
  const skillRow = await env.DB.prepare('SELECT * FROM monster_instance_skills WHERE id = ? AND monster_instance_id = ? AND is_active = 1 LIMIT 1').bind(skillId, actor.entityId).first();
  if (!skillRow) return apiError('Monster Skill 不存在或已停用。', 409, 'MONSTER_SKILL_UNAVAILABLE');
  const skill = mapInstanceSkill(skillRow);

  const target = combat.combatants.find(item => item.id === targetCombatantId && item.entityType === 'character');
  if (!target) return apiError('Target 必須係同一 Combat 入面嘅 Character。', 400, 'TARGET_INVALID');
  const targetLife = await ensureLifeRow(env, target.entityId);
  if (targetLife.lifeState === 'dead' || targetLife.characterLocked) return apiError('Target 已經死亡。', 409, 'TARGET_DEAD');
  const [dodgeRow, hpRow, conRow] = await Promise.all([
    env.DB.prepare("SELECT natural_value FROM character_skills WHERE character_id = ? AND key = 'dodge' LIMIT 1").bind(target.entityId).first(),
    env.DB.prepare("SELECT id, current_value, max_value FROM character_resources WHERE character_id = ? AND UPPER(key) = 'HP' LIMIT 1").bind(target.entityId).first(),
    env.DB.prepare("SELECT value FROM character_attributes WHERE character_id = ? AND UPPER(key) = 'CON' ORDER BY sort_order, id LIMIT 1").bind(target.entityId).first()
  ]);
  if (!dodgeRow || !Number.isFinite(Number(dodgeRow.natural_value))) return apiError('Target 缺少有效 Dodge。', 409, 'TARGET_DODGE_REQUIRED');
  if (!hpRow) return apiError('Target 缺少 HP。', 409, 'TARGET_HP_REQUIRED');
  if (!conRow || !Number.isFinite(Number(conRow.value)) || Number(conRow.value) <= 0) return apiError('Target 缺少有效 CON。', 409, 'TARGET_CON_REQUIRED');

  const expectedRound = combat.roundNumber;
  const expectedIndex = combat.currentTurnIndex;
  const reserve = await env.DB.prepare(`
    UPDATE combatants SET action_available = 0, updated_at = ?
    WHERE id = ? AND combat_id = ? AND entity_type = 'monster_instance' AND action_available = 1
      AND EXISTS (
        SELECT 1 FROM combats
        WHERE id = ? AND status = 'active' AND round_number = ? AND current_turn_index = ?
      )
  `).bind(Date.now(), actor.id, combat.id, combat.id, expectedRound, expectedIndex).run();
  if (Number(reserve?.meta?.changes || 0) !== 1) return apiError('Combat state 已改變，Monster Attack 未執行。', 409, 'COMBAT_STATE_CHANGED');

  const accuracy = monsterEffectiveAccuracy(skill.storedAccuracy, skill.hitModifier);
  const attackRoll = rollD100();
  const defenceRoll = rollD100();
  const opposed = resolveOpposedD100(
    { roll: attackRoll, skillValue: accuracy.effectiveAccuracy, modifier: 0 },
    { roll: defenceRoll, skillValue: Number(dodgeRow.natural_value), modifier: 0 }
  );
  const hit = !opposed.source.greatFailure && opposed.sourceWins;
  let spreadRoll = null;
  let damage = { rawDamage: null, effectiveDefence: 0, damageResult: null, hpDamage: 0 };
  let outcome = 'miss';
  let targetHpAfter = Number(hpRow.current_value);
  let targetLifeAfter = targetLife;

  if (hit) {
    spreadRoll = rollSignedSpread(skill.finalSpreadMin, skill.finalSpreadMax);
    const rawMonsterDamage = Math.max(0, skill.calculatedDamageCenter + spreadRoll);
    damage = resolveDamage({ damageDiceTotal: rawMonsterDamage, effectiveDefence: 0 });
    if (damage.hpDamage > 0) {
      const applied = await applyCharacterDamage(env, target.entityId, hpRow, Number(conRow.value), damage.hpDamage);
      targetHpAfter = applied.hp;
      targetLifeAfter = applied.life;
      outcome = targetLifeAfter.lifeState === 'dead'
        ? 'hit_target_dead'
        : targetLifeAfter.lifeState === 'dying' ? 'hit_target_dying' : 'hit_damage';
    } else outcome = 'hit_ineffective';
  }

  await env.DB.prepare(`
    INSERT INTO monster_action_log (
      id, combat_id, round_number, turn_index, actor_combatant_id, monster_instance_id,
      monster_instance_skill_id, target_combatant_id, stored_accuracy, hit_modifier,
      modified_accuracy, effective_accuracy, attack_roll, attack_result, defence_roll, defence_result,
      great_success, great_failure, damage_attribute_basis, calculated_base_damage, calculated_damage_center,
      spread_roll, raw_damage, effective_defence, damage_result, hp_damage, outcome, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `maction_${crypto.randomUUID()}`, combat.id, expectedRound, expectedIndex, actor.id, actor.entityId,
    skill.id, target.id, accuracy.storedAccuracy, accuracy.modifier, accuracy.modifiedAccuracy, accuracy.effectiveAccuracy,
    opposed.source.roll, opposed.source.result, opposed.resistance.roll, opposed.resistance.result,
    opposed.source.greatSuccess ? 1 : 0, opposed.source.greatFailure ? 1 : 0,
    skill.damageAttributeBasis, skill.calculatedBaseDamage, skill.calculatedDamageCenter,
    spreadRoll, damage.rawDamage, damage.effectiveDefence, damage.damageResult, damage.hpDamage, outcome, Date.now()
  ).run();

  const refreshed = await loadCombat(env, combat.id);
  const monsterMap = await monsterMapForCombat(env, refreshed);
  return json({
    ok: true,
    combat: {
      ...refreshed,
      combatants: refreshed.combatants.map(item => item.entityType === 'monster_instance' ? enrichMonsterCombatant(item, monsterMap.get(item.entityId)) : item),
      currentCombatant: refreshed.currentCombatant?.entityType === 'monster_instance'
        ? enrichMonsterCombatant(refreshed.currentCombatant, monsterMap.get(refreshed.currentCombatant.entityId))
        : refreshed.currentCombatant
    },
    monsterTurn: await monsterTurnPayload(env, refreshed, monsterMap),
    monsterAttack: {
      actor: { combatantId: actor.id, instanceId: actor.entityId, name: actor.displayName },
      target: {
        combatantId: target.id, characterId: target.entityId, name: target.displayName,
        hpAfter: targetHpAfter, lifeStateAfter: targetLifeAfter.lifeState,
        dyingRoundsRemaining: targetLifeAfter.dyingRoundsRemaining
      },
      skill,
      accuracy,
      attackCheck: opposed.source,
      defenceCheck: opposed.resistance,
      hit,
      spreadRoll,
      damage,
      outcome
    }
  });
}

async function handleMonsterApi(request, env, pathname) {
  if (pathname === '/api/gm/monsters') return monsterOverview(request, env);
  if (pathname === '/api/gm/monster-skills') return createSkill(request, env);
  const skillMatch = pathname.match(/^\/api\/gm\/monster-skills\/([^/]+)$/);
  if (skillMatch) return updateSkill(request, env, decodeURIComponent(skillMatch[1]));
  if (pathname === '/api/gm/monster-templates') return createTemplate(request, env);
  const templateSkillsMatch = pathname.match(/^\/api\/gm\/monster-templates\/([^/]+)\/skills$/);
  if (templateSkillsMatch) return setTemplateSkills(request, env, decodeURIComponent(templateSkillsMatch[1]));
  const templateMatch = pathname.match(/^\/api\/gm\/monster-templates\/([^/]+)$/);
  if (templateMatch) return updateTemplate(request, env, decodeURIComponent(templateMatch[1]));
  if (pathname === '/api/gm/monster-instances') return spawnMonster(request, env);
  const resourceMatch = pathname.match(/^\/api\/gm\/monster-instances\/([^/]+)\/resources$/);
  if (resourceMatch) return updateInstanceResources(request, env, decodeURIComponent(resourceMatch[1]));
  const spreadMatch = pathname.match(/^\/api\/gm\/monster-instances\/([^/]+)\/skills\/([^/]+)\/spread$/);
  if (spreadMatch) return updateInstanceSpread(request, env, decodeURIComponent(spreadMatch[1]), decodeURIComponent(spreadMatch[2]));
  return apiError('Not found.', 404, 'NOT_FOUND');
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/monsters' || pathname.startsWith('/api/gm/monster-skills') || pathname.startsWith('/api/gm/monster-templates') || pathname.startsWith('/api/gm/monster-instances')) {
        return await handleMonsterApi(request, env, pathname);
      }

      const encounterStart = pathname.match(/^\/api\/gm\/encounters\/([^/]+)\/start-combat$/);
      if (encounterStart) return await extendedEncounterStart(request, env, decodeURIComponent(encounterStart[1]));

      if (pathname === '/api/gm/combat' && request.method === 'GET') return await enrichGmCombat(request, env);
      if (pathname === '/api/player/combat' && request.method === 'GET') return await enrichPlayerCombat(request, env);

      const monsterAttackMatch = pathname.match(/^\/api\/gm\/combat\/([^/]+)\/monster-attack$/);
      if (monsterAttackMatch) return await monsterAttack(request, env, decodeURIComponent(monsterAttackMatch[1]));

      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Monster runtime error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'MONSTER_RUNTIME_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('暫時無法完成 Monster Runtime 要求。', 500, 'MONSTER_RUNTIME_SERVICE_ERROR');
    }
  }
};
