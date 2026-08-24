import baseWorker from './gm-d1.js';

const encoder = new TextEncoder();
const GM_ROLES = new Set(['gm', 'admin']);
const MIN_PROVISION_TOKEN_LENGTH = 24;

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

async function readBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE'
    });
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 8 * 1024) {
    throw Object.assign(new Error('提交內容過大。'), {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE'
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

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function secureTokenEqual(left, right) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let result = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    result |= (a[index] || 0) ^ (b[index] || 0);
  }
  return result === 0;
}

async function provisionInitialGM(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');

  const user = await currentUser(request, env);
  if (!user) return apiError('未登入。', 401, 'UNAUTHENTICATED');
  if (GM_ROLES.has(String(user.role || '').toLowerCase())) {
    return json({ ok: true, alreadyGM: true, user });
  }
  if (String(user.role || '').toLowerCase() !== 'player') {
    return apiError('目前 User role 不符合初始 GM provisioning 條件。', 409, 'PROVISION_ROLE_NOT_ELIGIBLE');
  }

  const configuredToken = String(env.INITIAL_GM_PROVISION_TOKEN || '');
  if (!configuredToken) {
    return apiError('初始 GM provisioning secret 尚未配置。', 503, 'PROVISION_SECRET_NOT_CONFIGURED');
  }
  if (configuredToken.length < MIN_PROVISION_TOKEN_LENGTH) {
    return apiError('初始 GM provisioning secret 配置過短。', 503, 'PROVISION_SECRET_TOO_SHORT');
  }

  const body = await readBody(request);
  const submittedToken = String(body?.token || '');
  if (!submittedToken || !(await secureTokenEqual(configuredToken, submittedToken))) {
    return apiError('Provisioning token 不正確。', 403, 'PROVISION_TOKEN_INVALID');
  }

  const now = Date.now();
  const result = await env.DB.prepare(`
    UPDATE users
    SET role = 'gm', updated_at = ?
    WHERE id = ?
      AND status = 'active'
      AND LOWER(role) = 'player'
      AND NOT EXISTS (
        SELECT 1
        FROM users
        WHERE LOWER(role) IN ('gm', 'admin')
      )
  `).bind(now, user.id).run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    const existing = await env.DB.prepare(`
      SELECT id, display_name, role
      FROM users
      WHERE LOWER(role) IN ('gm', 'admin')
      LIMIT 1
    `).first();

    if (existing) {
      return apiError('初始 GM 已經完成 provisioning；此 bootstrap endpoint 已關閉。', 409, 'INITIAL_GM_ALREADY_PROVISIONED');
    }
    return apiError('目前 User 無法完成 GM provisioning。', 409, 'GM_PROVISION_FAILED');
  }

  const promoted = await env.DB.prepare(`
    SELECT id, display_name, role, status, created_at
    FROM users
    WHERE id = ?
    LIMIT 1
  `).bind(user.id).first();

  return json({
    ok: true,
    provisioned: true,
    user: {
      id: promoted.id,
      displayName: promoted.display_name,
      role: promoted.role,
      status: promoted.status,
      createdAt: promoted.created_at
    }
  });
}

async function handleSetupPage(request, env) {
  const url = new URL(request.url);
  const user = await currentUser(request, env);
  if (!user) {
    const login = new URL('/player/login/', url);
    login.searchParams.set('next', '/gm/setup/');
    return Response.redirect(login.toString(), 302);
  }

  if (GM_ROLES.has(String(user.role || '').toLowerCase())) {
    return Response.redirect(new URL('/gm/', url).toString(), 302);
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === '/api/admin/provision-initial-gm') {
        return await provisionInitialGM(request, env);
      }
      if (pathname === '/gm/setup' || pathname.startsWith('/gm/setup/')) {
        return await handleSetupPage(request, env);
      }
      return baseWorker.fetch(request, env);
    } catch (err) {
      console.error('Initial GM provisioning error', err);
      if (err?.status) return apiError(err.message, err.status, err.code || 'PROVISION_API_ERROR');
      if (String(err?.message || err).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('暫時無法完成初始 GM provisioning。', 500, 'GM_PROVISION_SERVICE_ERROR');
    }
  }
};
