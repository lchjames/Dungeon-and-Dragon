import baseWorker from './player-skill-allocation.js';
import {
  STARTING_EXP,
  calculatePlayerResources,
  levelFromExp,
  reconcileResourceCurrentOnMaxChange
} from './rules.js';

const GM_ROLES = new Set(['gm', 'admin']);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
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

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) {
    throw Object.assign(new Error('未登入。'), {
      status: 401,
      code: 'UNAUTHENTICATED'
    });
  }
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), {
      status: 403,
      code: 'GM_ROLE_REQUIRED'
    });
  }
  return user;
}

async function readBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE'
    });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), {
      status: 400,
      code: 'INVALID_JSON'
    });
  }
}

function numericAttributeMap(rows) {
  const attributes = {};
  for (const row of rows || []) {
    const key = String(row.key || '').toUpperCase();
    const value = Number(row.value);
    if (key && Number.isFinite(value)) attributes[key] = value;
  }
  return attributes;
}

function mapResource(row) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    current: Number(row.current_value || 0),
    max: Number(row.max_value || 0),
    description: row.description || ''
  };
}

async function loadGMCharacter(env, characterId) {
  const row = await env.DB.prepare(`
    SELECT c.id, c.owner_user_id, c.name, c.role, c.level, c.exp,
           c.status, c.template, c.portrait_url, c.summary, c.notes,
           c.created_at, c.updated_at,
           u.display_name AS owner_display_name,
           u.status AS owner_status,
           p.creation_skill_points_total,
           p.creation_skill_points_spent,
           p.creation_complete
    FROM characters c
    LEFT JOIN users u ON u.id = c.owner_user_id
    LEFT JOIN character_progression p ON p.character_id = c.id
    WHERE c.id = ?
    LIMIT 1
  `).bind(characterId).first();

  if (!row) return null;

  const [attributes, resources, skills, flags] = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, key, label, value, description
      FROM character_attributes
      WHERE character_id = ?
      ORDER BY sort_order, id
    `).bind(characterId),
    env.DB.prepare(`
      SELECT id, key, label, current_value, max_value, description
      FROM character_resources
      WHERE character_id = ?
      ORDER BY sort_order, id
    `).bind(characterId),
    env.DB.prepare(`
      SELECT id, key, label, category, natural_value, creation_value,
             sp_value, use_growth_value, growth_progress
      FROM character_skills
      WHERE character_id = ?
      ORDER BY sort_order, id
    `).bind(characterId),
    env.DB.prepare(`
      SELECT code
      FROM character_migration_flags
      WHERE character_id = ?
      ORDER BY code
    `).bind(characterId)
  ]);

  const exp = Math.max(STARTING_EXP, Math.trunc(Number(row.exp) || STARTING_EXP));
  const total = Number(row.creation_skill_points_total);
  const spent = Number(row.creation_skill_points_spent);

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerDisplayName: row.owner_display_name || 'Unassigned',
    ownerStatus: row.owner_status || '',
    name: row.name,
    role: row.role || '',
    level: levelFromExp(exp),
    exp,
    status: row.status,
    template: row.template,
    portraitUrl: row.portrait_url || '',
    summary: row.summary || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attributes: (attributes.results || []).map(item => ({
      id: item.id,
      key: item.key,
      label: item.label,
      value: item.value,
      description: item.description || ''
    })),
    resources: (resources.results || []).map(mapResource),
    skills: (skills.results || []).map(item => ({
      id: item.id,
      key: item.key,
      label: item.label,
      category: item.category,
      value: Number(item.natural_value || 0),
      creationValue: Number(item.creation_value || 0),
      spValue: Number(item.sp_value || 0),
      useGrowthValue: Number(item.use_growth_value || 0),
      growthProgress: Number(item.growth_progress || 0)
    })),
    progression: Number.isFinite(total) ? {
      creationSkillPointsTotal: total,
      creationSkillPointsSpent: Number.isFinite(spent) ? spent : 0,
      creationSkillPointsRemaining: Math.max(0, total - (Number.isFinite(spent) ? spent : 0)),
      creationComplete: Boolean(row.creation_complete)
    } : null,
    migrationFlags: (flags.results || []).map(item => item.code)
  };
}

async function gmBootstrap(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  const user = await requireGM(request, env);

  const [campaign, users, characters] = await env.DB.batch([
    env.DB.prepare("SELECT value FROM settings WHERE key = 'campaign_name' LIMIT 1"),
    env.DB.prepare(`
      SELECT id, display_name, role, status, created_at
      FROM users
      ORDER BY display_name COLLATE NOCASE
    `),
    env.DB.prepare(`
      SELECT c.id, c.owner_user_id, c.name, c.role, c.level, c.exp,
             c.status, c.template, c.summary, c.updated_at,
             u.display_name AS owner_display_name,
             p.creation_complete
      FROM characters c
      LEFT JOIN users u ON u.id = c.owner_user_id
      LEFT JOIN character_progression p ON p.character_id = c.id
      ORDER BY c.name COLLATE NOCASE
    `)
  ]);

  const userRows = (users.results || []).map(row => ({
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at
  }));
  const characterRows = (characters.results || []).map(row => {
    const exp = Math.max(STARTING_EXP, Math.trunc(Number(row.exp) || STARTING_EXP));
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      ownerDisplayName: row.owner_display_name || 'Unassigned',
      name: row.name,
      role: row.role || '',
      level: levelFromExp(exp),
      exp,
      status: row.status,
      template: row.template,
      summary: row.summary || '',
      creationComplete: Boolean(row.creation_complete),
      updatedAt: row.updated_at
    };
  });

  return json({
    ok: true,
    user,
    campaign: { name: campaign.results?.[0]?.value || 'D&D Campaign' },
    metrics: {
      users: userRows.length,
      playerUsers: userRows.filter(row => row.role === 'player' && row.status === 'active').length,
      characters: characterRows.length,
      activeCharacters: characterRows.filter(row => row.status === 'active').length,
      draftCharacters: characterRows.filter(row => row.status === 'draft').length
    },
    users: userRows,
    characters: characterRows
  });
}

async function gmCharacter(request, env, characterId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  const character = await loadGMCharacter(env, characterId);
  if (!character) return apiError('找不到角色。', 404, 'CHARACTER_NOT_FOUND');
  return json({ ok: true, character });
}

async function updateExp(request, env, characterId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);

  const body = await readBody(request);
  const mode = String(body.mode || 'add').toLowerCase();
  const value = Number(body.value);
  if (!['add', 'set'].includes(mode) || !Number.isInteger(value)) {
    return apiError('EXP 更新必須提供 mode=add/set 同整數 value。', 400, 'VALIDATION_ERROR');
  }

  const character = await env.DB.prepare(`
    SELECT id, exp
    FROM characters
    WHERE id = ?
    LIMIT 1
  `).bind(characterId).first();
  if (!character) return apiError('找不到角色。', 404, 'CHARACTER_NOT_FOUND');

  const oldExp = Math.max(STARTING_EXP, Math.trunc(Number(character.exp) || STARTING_EXP));
  const newExp = mode === 'set' ? value : oldExp + value;
  if (!Number.isInteger(newExp) || newExp < STARTING_EXP) {
    return apiError(`EXP 不可低於 ${STARTING_EXP}。`, 400, 'VALIDATION_ERROR');
  }

  const newLevel = levelFromExp(newExp);
  const [attributesResult, resourceResult] = await env.DB.batch([
    env.DB.prepare(`
      SELECT key, value
      FROM character_attributes
      WHERE character_id = ?
    `).bind(characterId),
    env.DB.prepare(`
      SELECT id, key, label, current_value, max_value
      FROM character_resources
      WHERE character_id = ? AND UPPER(key) IN ('HP', 'MP')
      ORDER BY sort_order, id
    `).bind(characterId)
  ]);

  const attributes = numericAttributeMap(attributesResult.results || []);
  const hasFormulaAttributes = ['CON', 'SIZ', 'INT'].every(key => Number.isFinite(attributes[key]));
  const now = Date.now();
  const statements = [
    env.DB.prepare(`
      UPDATE characters
      SET exp = ?, level = ?, updated_at = ?
      WHERE id = ?
    `).bind(newExp, newLevel, now, characterId)
  ];

  if (hasFormulaAttributes) {
    const calculated = calculatePlayerResources(attributes, newLevel);
    const byKey = new Map();
    for (const row of resourceResult.results || []) {
      const key = String(row.key || '').toUpperCase();
      if (!byKey.has(key)) byKey.set(key, row);
    }

    for (const [key, newMax, sortOrder] of [
      ['HP', calculated.finalMaxHP, 0],
      ['MP', calculated.finalMaxMP, 1]
    ]) {
      const existing = byKey.get(key);
      if (existing) {
        const newCurrent = reconcileResourceCurrentOnMaxChange(
          existing.current_value,
          existing.max_value,
          newMax
        );
        statements.push(env.DB.prepare(`
          UPDATE character_resources
          SET current_value = ?, max_value = ?
          WHERE id = ? AND character_id = ?
        `).bind(newCurrent, newMax, existing.id, characterId));
      } else {
        statements.push(env.DB.prepare(`
          INSERT INTO character_resources (
            id, character_id, sort_order, key, label,
            current_value, max_value, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          `res_${crypto.randomUUID()}`,
          characterId,
          sortOrder,
          key,
          key,
          newMax,
          newMax,
          `Formula-derived ${key}; GM direct current correction allowed.`
        ));
      }
    }

    statements.push(
      env.DB.prepare(`
        DELETE FROM character_migration_flags
        WHERE character_id = ? AND code = 'MISSING_RESOURCE_ATTRIBUTES'
      `).bind(characterId)
    );
  } else {
    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO character_migration_flags (character_id, code, created_at)
        VALUES (?, 'MISSING_RESOURCE_ATTRIBUTES', ?)
      `).bind(characterId, now)
    );
  }

  await env.DB.batch(statements);
  const updated = await loadGMCharacter(env, characterId);
  return json({
    ok: true,
    mode,
    value,
    previousExp: oldExp,
    character: updated,
    resourcesRecalculated: hasFormulaAttributes
  });
}

async function correctResource(request, env, characterId, resourceKey) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);

  const key = String(resourceKey || '').toUpperCase();
  if (!['HP', 'MP'].includes(key)) {
    return apiError('MVP 只允許直接修正 HP / MP Current。', 400, 'RESOURCE_NOT_SUPPORTED');
  }

  const body = await readBody(request);
  const current = Number(body.current);
  if (!Number.isInteger(current) || current < 0) {
    return apiError('Current HP / MP 必須係 0 或以上整數。', 400, 'VALIDATION_ERROR');
  }

  const row = await env.DB.prepare(`
    SELECT r.id, r.max_value
    FROM character_resources r
    JOIN characters c ON c.id = r.character_id
    WHERE r.character_id = ? AND UPPER(r.key) = ?
    ORDER BY r.sort_order, r.id
    LIMIT 1
  `).bind(characterId, key).first();

  if (!row) return apiError(`找不到 ${key} 資源。`, 404, 'RESOURCE_NOT_FOUND');
  const max = Number(row.max_value || 0);
  if (current > max) {
    return apiError(`Current ${key} 不可高於 Max ${max}。`, 400, 'RESOURCE_ABOVE_MAX');
  }

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE character_resources
      SET current_value = ?
      WHERE id = ? AND character_id = ?
    `).bind(current, row.id, characterId),
    env.DB.prepare('UPDATE characters SET updated_at = ? WHERE id = ?')
      .bind(now, characterId)
  ]);

  return json({ ok: true, characterId, resource: { key, current, max } });
}

function forbiddenPage(user) {
  const displayName = String(user?.displayName || 'User')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GM access denied</title><body style="font-family:system-ui,sans-serif;max-width:680px;margin:80px auto;padding:24px"><h1>GM access denied</h1><p>${displayName} 目前角色係 <strong>${String(user?.role || 'player')}</strong>，未有 GM / admin 權限。</p><p><a href="/player/">返回 Player Workspace</a></p></body></html>`, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function handleGMPage(request, env) {
  const url = new URL(request.url);
  const user = await currentUser(request, env);
  if (!user) {
    const login = new URL('/player/login/', url);
    login.searchParams.set('next', '/gm/');
    return Response.redirect(login.toString(), 302);
  }
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) return forbiddenPage(user);
  return env.ASSETS.fetch(request);
}

async function handleGMApi(request, env, pathname) {
  if (pathname === '/api/gm/bootstrap') return gmBootstrap(request, env);

  const characterMatch = pathname.match(/^\/api\/gm\/characters\/([^/]+)$/);
  if (characterMatch) return gmCharacter(request, env, decodeURIComponent(characterMatch[1]));

  const expMatch = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/exp$/);
  if (expMatch) return updateExp(request, env, decodeURIComponent(expMatch[1]));

  const resourceMatch = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/resources\/([^/]+)$/);
  if (resourceMatch) {
    return correctResource(
      request,
      env,
      decodeURIComponent(resourceMatch[1]),
      decodeURIComponent(resourceMatch[2])
    );
  }

  return apiError('Not found.', 404, 'NOT_FOUND');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname.startsWith('/api/gm/')) return await handleGMApi(request, env, pathname);
      if (pathname === '/gm' || pathname.startsWith('/gm/')) return await handleGMPage(request, env);
      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('GM D1 foundation error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'GM_API_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('暫時無法完成 GM 要求。', 500, 'GM_SERVICE_ERROR');
    }
  }
};
