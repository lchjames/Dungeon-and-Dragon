import baseWorker from './player-focus.js';
import { dyingRoundsFromCon } from './combat-rules.js';

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

function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
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

async function readCurrentFromClone(request) {
  const clone = request.clone();
  try {
    const body = await clone.json();
    const current = Number(body?.current);
    return Number.isFinite(current) ? current : null;
  } catch {
    return null;
  }
}

async function conValue(env, characterId) {
  const row = await env.DB.prepare(`
    SELECT value
    FROM character_attributes
    WHERE character_id = ? AND UPPER(key) = 'CON'
    ORDER BY sort_order, id
    LIMIT 1
  `).bind(characterId).first();
  if (row?.value === null || row?.value === undefined || String(row.value).trim() === '') return null;
  const value = Number(row.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function reconcileAfterGmHpCorrection(request, env, characterId) {
  await requireGM(request, env);
  const requestedCurrent = await readCurrentFromClone(request);
  if (requestedCurrent === 0) {
    const con = await conValue(env, characterId);
    if (con === null) {
      return apiError('Character 缺少有效 CON，不能將 HP correction 設為 0，因為無法建立 Dying countdown。', 409, 'TARGET_CON_REQUIRED');
    }
  }

  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;

  const hpRow = await env.DB.prepare(`
    SELECT current_value
    FROM character_resources
    WHERE character_id = ? AND UPPER(key) = 'HP'
    LIMIT 1
  `).bind(characterId).first();
  if (!hpRow) return response;

  const currentHp = Number(hpRow.current_value || 0);
  const life = await env.DB.prepare(`
    SELECT life_state, character_locked
    FROM character_life_states
    WHERE character_id = ?
    LIMIT 1
  `).bind(characterId).first();
  if (!life || Boolean(life.character_locked) || String(life.life_state || '').toLowerCase() === 'dead') return response;

  const now = Date.now();
  if (currentHp > 0 && String(life.life_state || 'alive').toLowerCase() === 'dying') {
    await env.DB.prepare(`
      UPDATE character_life_states
      SET life_state = 'alive',
          dying_rounds_remaining = NULL,
          last_dying_tick_combat_id = NULL,
          last_dying_tick_round = NULL,
          updated_at = ?
      WHERE character_id = ? AND life_state = 'dying' AND character_locked = 0
    `).bind(now, characterId).run();
    return response;
  }

  if (currentHp <= 0 && String(life.life_state || 'alive').toLowerCase() === 'alive') {
    const con = await conValue(env, characterId);
    if (con !== null) {
      await env.DB.prepare(`
        UPDATE character_life_states
        SET life_state = 'dying',
            dying_rounds_remaining = ?,
            last_dying_tick_combat_id = NULL,
            last_dying_tick_round = NULL,
            updated_at = ?
        WHERE character_id = ? AND life_state = 'alive' AND character_locked = 0
      `).bind(dyingRoundsFromCon(con), now, characterId).run();
    }
  }

  return response;
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const match = pathname.match(/^\/api\/gm\/characters\/([^/]+)\/resources\/([^/]+)$/);
    try {
      if (match && request.method === 'PATCH' && decodeURIComponent(match[2]).toUpperCase() === 'HP') {
        return await reconcileAfterGmHpCorrection(request, env, decodeURIComponent(match[1]));
      }
      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Life correction gateway error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'LIFE_CORRECTION_ERROR');
      return apiError('暫時無法完成 Life State correction。', 500, 'LIFE_CORRECTION_SERVICE_ERROR');
    }
  }
};
