import baseWorker from './worker.js';
import {
  BASIC_SKILLS,
  CREATION_SKILL_POINTS,
  MAX_LEVEL,
  PLAYER_ATTRIBUTE_ORDER,
  STARTING_EXP,
  calculatePlayerResources,
  expThresholdForLevel,
  isValidPrimaryAttributeTotal,
  levelFromExp,
  primaryAttributeTotal,
  rollPlayerAttributes
} from './rules.js';

const CREATION_DRAFT_TTL_MS = 60 * 60 * 1000;
let foundationSchemaPromise = null;

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

function error(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function currentUser(request, env) {
  const url = new URL('/api/auth/me', request.url);
  const authRequest = new Request(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
  });
  const response = await baseWorker.fetch(authRequest, env);
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.user || null;
}

async function ensureBaseSchema(env, origin) {
  const healthRequest = new Request(new URL('/api/health', origin), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  const response = await baseWorker.fetch(healthRequest, env);
  if (!response.ok) throw new Error('Base schema initialization failed.');
}

async function ensureFoundationSchema(env, origin) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!foundationSchemaPromise) {
    foundationSchemaPromise = (async () => {
      await ensureBaseSchema(env, origin);

      const tableInfo = await env.DB.prepare('PRAGMA table_info(characters)').all();
      const columns = new Set((tableInfo.results || []).map(column => String(column.name || '').toLowerCase()));
      if (!columns.has('exp')) {
        try {
          await env.DB.prepare('ALTER TABLE characters ADD COLUMN exp INTEGER NOT NULL DEFAULT 1').run();
        } catch (schemaError) {
          if (!String(schemaError?.message || schemaError).toLowerCase().includes('duplicate column')) throw schemaError;
        }
      }

      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_skills (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          key TEXT NOT NULL,
          label TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT '',
          natural_value INTEGER NOT NULL DEFAULT 0,
          creation_value INTEGER NOT NULL DEFAULT 0,
          sp_value INTEGER NOT NULL DEFAULT 0,
          use_growth_value INTEGER NOT NULL DEFAULT 0,
          growth_progress REAL NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(character_id, key),
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_progression (
          character_id TEXT PRIMARY KEY,
          creation_skill_points_total INTEGER NOT NULL DEFAULT 200,
          creation_skill_points_spent INTEGER NOT NULL DEFAULT 0,
          level_skill_points_earned INTEGER NOT NULL DEFAULT 0,
          level_skill_points_spent INTEGER NOT NULL DEFAULT 0,
          creation_complete INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_creation_drafts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          attributes_json TEXT NOT NULL,
          primary_total INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_migration_flags (
          character_id TEXT NOT NULL,
          code TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (character_id, code),
          FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_character_skills_character ON character_skills(character_id, sort_order)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_creation_drafts_user ON character_creation_drafts(user_id, expires_at)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_migration_flags_character ON character_migration_flags(character_id)')
      ]);

      const legacyCharacters = await env.DB.prepare('SELECT id, level, exp FROM characters').all();
      const updates = [];
      for (const row of legacyCharacters.results || []) {
        const legacyLevel = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(Number(row.level) || 1)));
        let exp = Math.trunc(Number(row.exp));
        if (!Number.isFinite(exp) || exp < STARTING_EXP || (exp === STARTING_EXP && legacyLevel > 1)) {
          exp = expThresholdForLevel(legacyLevel);
        }
        const derivedLevel = levelFromExp(exp);
        if (Number(row.exp) !== exp || Number(row.level) !== derivedLevel) {
          updates.push(env.DB.prepare('UPDATE characters SET exp = ?, level = ? WHERE id = ?').bind(exp, derivedLevel, row.id));
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const now = Date.now();
      await env.DB.prepare(`
        INSERT OR IGNORE INTO character_migration_flags (character_id, code, created_at)
        SELECT c.id, 'MISSING_RESOURCE_ATTRIBUTES', ?
        FROM characters c
        WHERE (
          SELECT COUNT(DISTINCT UPPER(a.key))
          FROM character_attributes a
          WHERE a.character_id = c.id AND UPPER(a.key) IN ('CON', 'SIZ', 'INT')
        ) < 3
      `).bind(now).run();
    })().catch(errorValue => {
      foundationSchemaPromise = null;
      throw errorValue;
    });
  }
  await foundationSchemaPromise;
}

function normalizeName(value) {
  return String(value ?? '').trim().normalize('NFKC');
}

function publicAttributeList(attributes) {
  return PLAYER_ATTRIBUTE_ORDER.map((key, index) => ({
    id: `attr_${key.toLowerCase()}`,
    key,
    label: key,
    value: attributes[key],
    description: '',
    sortOrder: index
  }));
}

async function rollCharacterCreation(request, env) {
  if (request.method !== 'POST') return error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return error('來源驗證失敗。', 403, 'ORIGIN_REJECTED');

  const user = await currentUser(request, env);
  if (!user) return error('未登入。', 401, 'UNAUTHENTICATED');

  const rolled = rollPlayerAttributes();
  const draftId = `draft_${crypto.randomUUID()}`;
  const now = Date.now();
  const expiresAt = now + CREATION_DRAFT_TTL_MS;

  await env.DB.batch([
    env.DB.prepare('DELETE FROM character_creation_drafts WHERE user_id = ? OR expires_at <= ?').bind(user.id, now),
    env.DB.prepare(`
      INSERT INTO character_creation_drafts (
        id, user_id, attributes_json, primary_total, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(draftId, user.id, JSON.stringify(rolled.attributes), rolled.primaryTotal, now, expiresAt)
  ]);

  return json({
    ok: true,
    draft: {
      id: draftId,
      attributes: rolled.attributes,
      primaryTotal: rolled.primaryTotal,
      expiresAt
    }
  }, 201);
}

async function createCharacter(request, env) {
  if (!validOrigin(request)) return error('來源驗證失敗。', 403, 'ORIGIN_REJECTED');

  const user = await currentUser(request, env);
  if (!user) return error('未登入。', 401, 'UNAUTHENTICATED');

  let body;
  try {
    body = await request.json();
  } catch {
    return error('JSON 格式錯誤。', 400, 'INVALID_JSON');
  }

  const name = normalizeName(body.name);
  const summary = String(body.summary ?? '').trim();
  const draftId = String(body.draftId ?? '').trim();

  if (name.length < 1 || name.length > 80) return error('角色名稱必須為 1–80 個字元。', 400, 'VALIDATION_ERROR');
  if (summary.length > 2000) return error('角色簡介最多 2000 個字元。', 400, 'VALIDATION_ERROR');
  if (!/^draft_[0-9a-f-]{36}$/i.test(draftId)) return error('請先完成角色屬性擲骰。', 400, 'CREATION_DRAFT_REQUIRED');

  const now = Date.now();
  const draft = await env.DB.prepare(`
    SELECT id, attributes_json, primary_total, expires_at
    FROM character_creation_drafts
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(draftId, user.id).first();

  if (!draft || Number(draft.expires_at) <= now) {
    if (draft) await env.DB.prepare('DELETE FROM character_creation_drafts WHERE id = ?').bind(draftId).run();
    return error('角色屬性擲骰已過期，請重新擲骰。', 409, 'CREATION_DRAFT_EXPIRED');
  }

  let attributes;
  try {
    attributes = JSON.parse(draft.attributes_json);
  } catch {
    return error('角色屬性草稿損壞，請重新擲骰。', 409, 'CREATION_DRAFT_INVALID');
  }

  const total = primaryAttributeTotal(attributes);
  if (!isValidPrimaryAttributeTotal(total) || total !== Number(draft.primary_total)) {
    return error('角色屬性草稿驗證失敗，請重新擲骰。', 409, 'CREATION_DRAFT_INVALID');
  }
  if (!PLAYER_ATTRIBUTE_ORDER.every(key => Number.isFinite(Number(attributes[key])))) {
    return error('角色屬性草稿缺少必要屬性，請重新擲骰。', 409, 'CREATION_DRAFT_INVALID');
  }

  const level = levelFromExp(STARTING_EXP);
  const resources = calculatePlayerResources(attributes, level);
  const characterId = `char_${crypto.randomUUID()}`;

  const statements = [
    env.DB.prepare(`
      INSERT INTO characters (
        id, owner_user_id, name, role, level, exp, status, template,
        portrait_url, summary, notes, created_at, updated_at
      ) VALUES (?, ?, ?, '', ?, ?, 'draft', 'generic', '', ?, '', ?, ?)
    `).bind(characterId, user.id, name, level, STARTING_EXP, summary, now, now)
  ];

  PLAYER_ATTRIBUTE_ORDER.forEach((key, index) => {
    statements.push(env.DB.prepare(`
      INSERT INTO character_attributes (
        id, character_id, sort_order, key, label, value, description
      ) VALUES (?, ?, ?, ?, ?, ?, '')
    `).bind(`attr_${crypto.randomUUID()}`, characterId, index, key, key, String(attributes[key])));
  });

  statements.push(
    env.DB.prepare(`
      INSERT INTO character_resources (
        id, character_id, sort_order, key, label, current_value, max_value, description
      ) VALUES (?, ?, 0, 'HP', 'HP', ?, ?, 'Formula-derived HP; Player direct numeric editing is disabled.')
    `).bind(`res_${crypto.randomUUID()}`, characterId, resources.finalMaxHP, resources.finalMaxHP),
    env.DB.prepare(`
      INSERT INTO character_resources (
        id, character_id, sort_order, key, label, current_value, max_value, description
      ) VALUES (?, ?, 1, 'MP', 'MP', ?, ?, 'Formula-derived MP; Player direct numeric editing is disabled.')
    `).bind(`res_${crypto.randomUUID()}`, characterId, resources.finalMaxMP, resources.finalMaxMP)
  );

  BASIC_SKILLS.forEach((skill, index) => {
    statements.push(env.DB.prepare(`
      INSERT INTO character_skills (
        id, character_id, sort_order, key, label, category,
        natural_value, creation_value, sp_value, use_growth_value,
        growth_progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)
    `).bind(`skill_${crypto.randomUUID()}`, characterId, index, skill.key, skill.label, skill.category, now, now));
  });

  statements.push(
    env.DB.prepare(`
      INSERT INTO character_progression (
        character_id, creation_skill_points_total, creation_skill_points_spent,
        level_skill_points_earned, level_skill_points_spent, creation_complete, updated_at
      ) VALUES (?, ?, 0, 0, 0, 0, ?)
    `).bind(characterId, CREATION_SKILL_POINTS, now),
    env.DB.prepare('DELETE FROM character_creation_drafts WHERE id = ? AND user_id = ?').bind(draftId, user.id)
  );

  await env.DB.batch(statements);

  return json({
    ok: true,
    character: {
      id: characterId,
      name,
      role: '',
      level,
      exp: STARTING_EXP,
      status: 'draft',
      template: 'generic',
      portraitUrl: '',
      summary,
      notes: '',
      attributes: publicAttributeList(attributes),
      resources: [
        { key: 'HP', label: 'HP', current: resources.finalMaxHP, max: resources.finalMaxHP },
        { key: 'MP', label: 'MP', current: resources.finalMaxMP, max: resources.finalMaxMP }
      ],
      skills: BASIC_SKILLS.map(skill => ({ ...skill, value: 0 })),
      progression: {
        creationSkillPointsTotal: CREATION_SKILL_POINTS,
        creationSkillPointsSpent: 0,
        creationSkillPointsRemaining: CREATION_SKILL_POINTS,
        creationComplete: false
      },
      createdAt: now,
      updatedAt: now
    }
  }, 201);
}

async function augmentBootstrap(request, env) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const payload = await response.json();
  const userId = payload?.user?.id;
  if (!userId || !Array.isArray(payload.characters) || !payload.characters.length) return json(payload, response.status);

  const ids = payload.characters.map(character => character.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT id, exp FROM characters WHERE owner_user_id = ? AND id IN (${placeholders})`)
    .bind(userId, ...ids).all();
  const byId = new Map((rows.results || []).map(row => [row.id, Math.max(STARTING_EXP, Number(row.exp) || STARTING_EXP)]));

  payload.characters = payload.characters.map(character => {
    const exp = byId.get(character.id) ?? STARTING_EXP;
    return { ...character, exp, level: levelFromExp(exp) };
  });
  return json(payload, response.status);
}

async function augmentCharacterDetail(request, env, characterId) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const payload = await response.json();
  if (!payload?.character) return json(payload, response.status);

  const user = await currentUser(request, env);
  if (!user) return error('未登入。', 401, 'UNAUTHENTICATED');

  const [row, skills, progression, flags] = await env.DB.batch([
    env.DB.prepare('SELECT exp FROM characters WHERE id = ? AND owner_user_id = ? LIMIT 1').bind(characterId, user.id),
    env.DB.prepare(`
      SELECT id, key, label, category, natural_value, creation_value,
             sp_value, use_growth_value, growth_progress
      FROM character_skills
      WHERE character_id = ?
      ORDER BY sort_order, id
    `).bind(characterId),
    env.DB.prepare(`
      SELECT creation_skill_points_total, creation_skill_points_spent,
             level_skill_points_earned, level_skill_points_spent,
             creation_complete
      FROM character_progression
      WHERE character_id = ?
      LIMIT 1
    `).bind(characterId),
    env.DB.prepare('SELECT code FROM character_migration_flags WHERE character_id = ? ORDER BY code').bind(characterId)
  ]);

  const exp = Math.max(STARTING_EXP, Number(row.results?.[0]?.exp) || STARTING_EXP);
  const progressionRow = progression.results?.[0];
  payload.character.exp = exp;
  payload.character.level = levelFromExp(exp);
  payload.character.skills = (skills.results || []).map(skill => ({
    id: skill.id,
    key: skill.key,
    label: skill.label,
    category: skill.category,
    value: Number(skill.natural_value || 0),
    creationValue: Number(skill.creation_value || 0),
    spValue: Number(skill.sp_value || 0),
    useGrowthValue: Number(skill.use_growth_value || 0),
    growthProgress: Number(skill.growth_progress || 0)
  }));
  payload.character.progression = progressionRow ? {
    creationSkillPointsTotal: Number(progressionRow.creation_skill_points_total || 0),
    creationSkillPointsSpent: Number(progressionRow.creation_skill_points_spent || 0),
    creationSkillPointsRemaining: Math.max(0, Number(progressionRow.creation_skill_points_total || 0) - Number(progressionRow.creation_skill_points_spent || 0)),
    levelSkillPointsEarned: Number(progressionRow.level_skill_points_earned || 0),
    levelSkillPointsSpent: Number(progressionRow.level_skill_points_spent || 0),
    creationComplete: Boolean(progressionRow.creation_complete)
  } : null;
  payload.character.migrationFlags = (flags.results || []).map(flag => flag.code);
  return json(payload, response.status);
}

async function protectCanonicalResourceWrite(request, env, characterId, resourceId) {
  if (request.method !== 'PATCH') return null;
  const user = await currentUser(request, env);
  if (!user) return error('未登入。', 401, 'UNAUTHENTICATED');
  const row = await env.DB.prepare(`
    SELECT r.key
    FROM character_resources r
    JOIN characters c ON c.id = r.character_id
    WHERE r.id = ? AND r.character_id = ? AND c.owner_user_id = ?
    LIMIT 1
  `).bind(resourceId, characterId, user.id).first();
  if (!row) return null;
  const key = String(row.key || '').toUpperCase();
  if (key === 'HP' || key === 'MP') {
    return error('HP / MP 由遊戲 Resolver 管理，Player 不能直接輸入數值。', 403, 'RESOURCE_RESOLVER_REQUIRED');
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname.startsWith('/api/') || pathname === '/player' || pathname.startsWith('/player/')) {
        await ensureFoundationSchema(env, url.origin);
      }

      if (pathname === '/api/player/character-creation/roll') {
        return await rollCharacterCreation(request, env);
      }

      if (pathname === '/api/player/characters' && request.method === 'POST') {
        return await createCharacter(request, env);
      }

      if (pathname === '/api/player/bootstrap' && request.method === 'GET') {
        return await augmentBootstrap(request, env);
      }

      const characterMatch = pathname.match(/^\/api\/player\/characters\/([^/]+)$/);
      if (characterMatch && request.method === 'GET') {
        return await augmentCharacterDetail(request, env, decodeURIComponent(characterMatch[1]));
      }

      const resourceMatch = pathname.match(/^\/api\/player\/characters\/([^/]+)\/resources\/([^/]+)$/);
      if (resourceMatch) {
        const blocked = await protectCanonicalResourceWrite(
          request,
          env,
          decodeURIComponent(resourceMatch[1]),
          decodeURIComponent(resourceMatch[2])
        );
        if (blocked) return blocked;
      }

      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('MVP foundation error', err);
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return error('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return error('暫時無法完成要求，請稍後再試。', 500, 'MVP_FOUNDATION_ERROR');
    }
  }
};
