import baseWorker from './player-create.js';
import {
  BASIC_SKILLS,
  CREATION_SKILL_POINTS,
  validateCreationSkillAllocations
} from './rules.js';

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

async function ownedDraftCreation(env, userId, characterId) {
  return env.DB.prepare(`
    SELECT c.id, c.status,
           p.creation_skill_points_total,
           p.creation_skill_points_spent,
           p.creation_complete
    FROM characters c
    LEFT JOIN character_progression p ON p.character_id = c.id
    WHERE c.id = ? AND c.owner_user_id = ?
    LIMIT 1
  `).bind(characterId, userId).first();
}

function assertEditableDraft(character) {
  if (!character) return error('找不到角色。', 404, 'CHARACTER_NOT_FOUND');
  if (character.creation_complete === null || character.creation_complete === undefined) {
    return error('此角色未初始化新版建角進度資料。', 409, 'CREATION_PROGRESS_NOT_INITIALIZED');
  }
  if (character.status !== 'draft' || Boolean(character.creation_complete)) {
    return error('此角色已離開建角階段，不能再修改 Creation Skill Points。', 409, 'CREATION_SKILLS_LOCKED');
  }
  return null;
}

async function saveCreationSkills(request, env, characterId) {
  if (request.method !== 'PATCH') return error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return error('來源驗證失敗。', 403, 'ORIGIN_REJECTED');

  const user = await currentUser(request, env);
  if (!user) return error('未登入。', 401, 'UNAUTHENTICATED');

  const character = await ownedDraftCreation(env, user.id, characterId);
  const blocked = assertEditableDraft(character);
  if (blocked) return blocked;

  const body = await readBody(request);
  let validated;
  try {
    validated = validateCreationSkillAllocations(body?.allocations, { requireAllSkills: true });
  } catch (validationError) {
    return error(validationError.message, 400, 'VALIDATION_ERROR');
  }

  const existing = await env.DB.prepare(`
    SELECT key
    FROM character_skills
    WHERE character_id = ?
  `).bind(characterId).all();
  const keys = new Set((existing.results || []).map(row => row.key));
  if (keys.size !== BASIC_SKILLS.length || !BASIC_SKILLS.every(skill => keys.has(skill.key))) {
    return error('此角色嘅 23 個基礎技能未完整初始化。', 409, 'CREATION_SKILLS_NOT_INITIALIZED');
  }

  const now = Date.now();
  const statements = BASIC_SKILLS.map(skill => {
    const value = validated.allocations[skill.key];
    return env.DB.prepare(`
      UPDATE character_skills
      SET creation_value = ?, natural_value = ?, updated_at = ?
      WHERE character_id = ? AND key = ?
    `).bind(value, value, now, characterId, skill.key);
  });

  statements.push(
    env.DB.prepare(`
      UPDATE character_progression
      SET creation_skill_points_spent = ?, updated_at = ?
      WHERE character_id = ? AND creation_complete = 0
    `).bind(validated.spent, now, characterId),
    env.DB.prepare("UPDATE characters SET updated_at = ? WHERE id = ? AND owner_user_id = ? AND status = 'draft'")
      .bind(now, characterId, user.id)
  );

  await env.DB.batch(statements);

  return json({
    ok: true,
    characterId,
    skills: BASIC_SKILLS.map(skill => ({
      key: skill.key,
      label: skill.label,
      category: skill.category,
      value: validated.allocations[skill.key]
    })),
    progression: {
      creationSkillPointsTotal: CREATION_SKILL_POINTS,
      creationSkillPointsSpent: validated.spent,
      creationSkillPointsRemaining: validated.remaining,
      creationComplete: false
    }
  });
}

async function finalizeCharacterCreation(request, env, characterId) {
  if (request.method !== 'POST') return error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return error('來源驗證失敗。', 403, 'ORIGIN_REJECTED');

  const user = await currentUser(request, env);
  if (!user) return error('未登入。', 401, 'UNAUTHENTICATED');

  const character = await ownedDraftCreation(env, user.id, characterId);
  const blocked = assertEditableDraft(character);
  if (blocked) return blocked;

  if (Number(character.creation_skill_points_total) !== CREATION_SKILL_POINTS) {
    return error('此角色嘅 Creation Skill Point pool 資料不正確。', 409, 'CREATION_POOL_INVALID');
  }

  const storedSkills = await env.DB.prepare(`
    SELECT key, creation_value
    FROM character_skills
    WHERE character_id = ?
    ORDER BY sort_order, id
  `).bind(characterId).all();

  const rows = storedSkills.results || [];
  const allocations = {};
  for (const row of rows) {
    if (Object.hasOwn(allocations, row.key)) {
      return error('此角色嘅基礎技能資料有重複項目。', 409, 'CREATION_SKILLS_INVALID');
    }
    allocations[row.key] = Number(row.creation_value);
  }

  let validated;
  try {
    validated = validateCreationSkillAllocations(allocations, {
      requireAllSkills: true,
      requireFullSpend: true
    });
  } catch (validationError) {
    return error(
      `必須完整分配 ${CREATION_SKILL_POINTS} Creation Skill Points 先可以完成建角。`,
      409,
      'CREATION_POINTS_REMAINING'
    );
  }

  if (rows.length !== BASIC_SKILLS.length || validated.spent !== CREATION_SKILL_POINTS) {
    return error('23 個基礎技能未完整分配。', 409, 'CREATION_SKILLS_INVALID');
  }

  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE character_progression
      SET creation_skill_points_spent = ?, creation_complete = 1, updated_at = ?
      WHERE character_id = ? AND creation_complete = 0
    `).bind(CREATION_SKILL_POINTS, now, characterId),
    env.DB.prepare(`
      UPDATE characters
      SET status = 'active', updated_at = ?
      WHERE id = ? AND owner_user_id = ? AND status = 'draft'
    `).bind(now, characterId, user.id)
  ]);

  const progressionChanged = Number(results?.[0]?.meta?.changes || 0);
  const characterChanged = Number(results?.[1]?.meta?.changes || 0);
  if (progressionChanged !== 1 || characterChanged !== 1) {
    return error('角色建角狀態已被更新，請重新載入。', 409, 'CREATION_STATE_CHANGED');
  }

  return json({
    ok: true,
    character: {
      id: characterId,
      status: 'active'
    },
    progression: {
      creationSkillPointsTotal: CREATION_SKILL_POINTS,
      creationSkillPointsSpent: CREATION_SKILL_POINTS,
      creationSkillPointsRemaining: 0,
      creationComplete: true
    }
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const creationSkillsMatch = pathname.match(/^\/api\/player\/characters\/([^/]+)\/creation-skills$/);
    const finalizeMatch = pathname.match(/^\/api\/player\/characters\/([^/]+)\/finalize-creation$/);

    if (!creationSkillsMatch && !finalizeMatch) return baseWorker.fetch(request, env);

    try {
      if (creationSkillsMatch) {
        return await saveCreationSkills(
          request,
          env,
          decodeURIComponent(creationSkillsMatch[1])
        );
      }

      return await finalizeCharacterCreation(
        request,
        env,
        decodeURIComponent(finalizeMatch[1])
      );
    } catch (err) {
      console.error('Character creation progression error', err);
      if (err?.status) return error(err.message, err.status, err.code || 'API_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return error('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return error('暫時無法更新角色建角資料。', 500, 'CHARACTER_CREATION_UPDATE_ERROR');
    }
  }
};
