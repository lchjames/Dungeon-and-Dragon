import baseWorker from './worker.js';

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

  const name = String(body.name ?? '').trim().normalize('NFKC');
  const role = String(body.role ?? '').trim().normalize('NFKC');
  const summary = String(body.summary ?? '').trim();
  const rawLevel = body.level === '' || body.level == null ? 1 : Number(body.level);
  const level = Number.isInteger(rawLevel) ? rawLevel : NaN;

  if (name.length < 1 || name.length > 80) return error('角色名稱必須為 1–80 個字元。', 400, 'VALIDATION_ERROR');
  if (role.length > 80) return error('Role 最多 80 個字元。', 400, 'VALIDATION_ERROR');
  if (!Number.isInteger(level) || level < 0 || level > 999) return error('Level 必須係 0–999 之間嘅整數。', 400, 'VALIDATION_ERROR');
  if (summary.length > 2000) return error('角色簡介最多 2000 個字元。', 400, 'VALIDATION_ERROR');

  const id = `char_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO characters (
      id, owner_user_id, name, role, level, status, template,
      portrait_url, summary, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', 'generic', '', ?, '', ?, ?)
  `).bind(id, user.id, name, role, level, summary, now, now).run();

  return json({
    ok: true,
    character: {
      id,
      name,
      role,
      level,
      status: 'active',
      template: 'generic',
      portraitUrl: '',
      summary,
      notes: '',
      attributes: [],
      resources: [],
      inventory: [],
      abilities: [],
      createdAt: now,
      updatedAt: now
    }
  }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/player/characters' && request.method === 'POST') {
      try {
        return await createCharacter(request, env);
      } catch (err) {
        console.error('Character create error', err);
        return error('暫時無法建立角色，請稍後再試。', 500, 'CHARACTER_CREATE_ERROR');
      }
    }
    return baseWorker.fetch(request, env);
  }
};
