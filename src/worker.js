const SESSION_COOKIE = '__Host-dnd_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 600000;
const MAX_AUTH_BODY_BYTES = 16 * 1024;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;
const encoder = new TextEncoder();
let schemaPromise = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    status TEXT NOT NULL DEFAULT 'active',
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`
];

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

function error(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function nowMs() { return Date.now(); }

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function derivePasswordHash(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a[i] ^ b[i];
  return result === 0;
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql))).catch(errorValue => {
      schemaPromise = null;
      throw errorValue;
    });
  }
  await schemaPromise;
}

function cookieValue(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function readJsonBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_AUTH_BODY_BYTES) {
    throw Object.assign(new Error('提交內容過大。'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  const text = await request.text();
  if (encoder.encode(text).byteLength > MAX_AUTH_BODY_BYTES) {
    throw Object.assign(new Error('提交內容過大。'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  try { return JSON.parse(text || '{}'); }
  catch { throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' }); }
}

function validateOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

function normaliseUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

function validateRegistration(input) {
  const username = normaliseUsername(input.username);
  const displayName = String(input.displayName ?? '').trim();
  const password = String(input.password ?? '');
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return { error: '使用者名稱需為 3–32 字元，只可使用英文字母、數字、句點、底線或連字號。' };
  if (displayName.length < 1 || displayName.length > 50) return { error: '顯示名稱需為 1–50 字元。' };
  if (password.length < 12 || password.length > 128) return { error: '密碼需為 12–128 字元。' };
  return { username, displayName, password };
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at
  };
}

async function createSession(env, userId) {
  const token = bytesToBase64Url(randomBytes(32));
  const tokenHash = await sha256Hex(token);
  const now = nowMs();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenHash, userId, expiresAt, now, now)
  ]);
  return token;
}

async function sessionUser(request, env) {
  await ensureSchema(env);
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = nowMs();
  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.status, u.created_at,
           s.last_seen_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();
  if (!row || row.status !== 'active') return null;
  if (now - Number(row.last_seen_at || 0) > 60 * 60 * 1000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now, tokenHash).run();
  }
  return publicUser(row);
}

async function register(request, env) {
  if (request.method !== 'POST') return error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validateOrigin(request)) return error('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await ensureSchema(env);
  const body = await readJsonBody(request);
  const validated = validateRegistration(body);
  if (validated.error) return error(validated.error, 400, 'VALIDATION_ERROR');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? LIMIT 1').bind(validated.username).first();
  if (existing) return error('呢個使用者名稱已經有人使用。', 409, 'USERNAME_TAKEN');

  const salt = randomBytes(16);
  const hash = await derivePasswordHash(validated.password, salt);
  const userId = `user_${crypto.randomUUID()}`;
  const now = nowMs();
  try {
    await env.DB.prepare(`
      INSERT INTO users (
        id, username, display_name, password_hash, password_salt,
        password_iterations, role, status, failed_attempts, locked_until,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'player', 'active', 0, NULL, ?, ?)
    `).bind(
      userId,
      validated.username,
      validated.displayName,
      bytesToBase64(hash),
      bytesToBase64(salt),
      PBKDF2_ITERATIONS,
      now,
      now
    ).run();
  } catch (dbError) {
    if (String(dbError?.message || dbError).toLowerCase().includes('unique')) {
      return error('呢個使用者名稱已經有人使用。', 409, 'USERNAME_TAKEN');
    }
    throw dbError;
  }

  const user = {
    id: userId,
    username: validated.username,
    display_name: validated.displayName,
    role: 'player',
    status: 'active',
    created_at: now
  };
  const token = await createSession(env, userId);
  return json({ ok: true, user: publicUser(user) }, 201, { 'Set-Cookie': sessionCookie(token) });
}

const FAKE_SALT = Uint8Array.from([149, 17, 236, 89, 44, 173, 3, 219, 196, 58, 217, 99, 77, 132, 225, 14]);

async function login(request, env) {
  if (request.method !== 'POST') return error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validateOrigin(request)) return error('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await ensureSchema(env);
  const body = await readJsonBody(request);
  const username = normaliseUsername(body.username);
  const password = String(body.password ?? '');
  if (!username || !password || password.length > 128) return error('使用者名稱或密碼不正確。', 401, 'INVALID_CREDENTIALS');

  const user = await env.DB.prepare(`
    SELECT id, username, display_name, password_hash, password_salt,
           password_iterations, role, status, failed_attempts,
           locked_until, created_at
    FROM users
    WHERE username = ?
    LIMIT 1
  `).bind(username).first();

  if (!user) {
    await derivePasswordHash(password, FAKE_SALT, PBKDF2_ITERATIONS);
    return error('使用者名稱或密碼不正確。', 401, 'INVALID_CREDENTIALS');
  }

  const now = nowMs();
  if (user.status !== 'active') return error('此帳戶目前無法登入。', 403, 'ACCOUNT_DISABLED');
  if (Number(user.locked_until || 0) > now) return error('登入嘗試次數過多，請稍後再試。', 429, 'ACCOUNT_TEMPORARILY_LOCKED');

  const hash = await derivePasswordHash(password, base64ToBytes(user.password_salt), Number(user.password_iterations || PBKDF2_ITERATIONS));
  const expected = base64ToBytes(user.password_hash);
  const matches = constantTimeEqual(hash, expected);

  if (!matches) {
    const attempts = Number(user.failed_attempts || 0) + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await env.DB.prepare('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
      .bind(shouldLock ? 0 : attempts, shouldLock ? now + LOCK_SECONDS * 1000 : null, now, user.id)
      .run();
    if (shouldLock) return error('登入嘗試次數過多，帳戶已暫時鎖定。', 429, 'ACCOUNT_TEMPORARILY_LOCKED');
    return error('使用者名稱或密碼不正確。', 401, 'INVALID_CREDENTIALS');
  }

  await env.DB.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .bind(now, user.id)
    .run();
  const token = await createSession(env, user.id);
  return json({ ok: true, user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(token) });
}

async function logout(request, env) {
  if (request.method !== 'POST') return error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validateOrigin(request)) return error('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await ensureSchema(env);
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(tokenHash).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

async function me(request, env) {
  if (request.method !== 'GET') return error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  const user = await sessionUser(request, env);
  if (!user) return error('未登入。', 401, 'UNAUTHENTICATED');
  return json({ ok: true, user });
}

async function handleAuth(request, env, pathname) {
  try {
    if (pathname === '/api/auth/register') return await register(request, env);
    if (pathname === '/api/auth/login') return await login(request, env);
    if (pathname === '/api/auth/logout') return await logout(request, env);
    if (pathname === '/api/auth/me') return await me(request, env);
    return error('Not found.', 404, 'NOT_FOUND');
  } catch (authError) {
    console.error('Auth error', authError);
    if (authError?.status) return error(authError.message, authError.status, authError.code || 'AUTH_ERROR');
    if (String(authError?.message || authError).includes('D1 binding DB is unavailable')) {
      return error('帳戶資料庫尚未完成配置。', 503, 'AUTH_DATABASE_UNAVAILABLE');
    }
    return error('Authentication service unavailable.', 500, 'AUTH_SERVICE_ERROR');
  }
}

function isAuthPage(pathname) {
  return /^\/player\/(login|register)(?:\/|\/index\.html)?$/.test(pathname);
}

function isPlayerPath(pathname) {
  return pathname === '/player' || pathname.startsWith('/player/');
}

function internalPlayerNext(url) {
  const value = `${url.pathname}${url.search}`;
  return value.startsWith('/player/') && !value.startsWith('//') ? value : '/player/';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/auth/')) return handleAuth(request, env, pathname);

    if (isAuthPage(pathname)) {
      try {
        const user = await sessionUser(request, env);
        if (user) return Response.redirect(new URL('/player/', url).toString(), 302);
      } catch (authError) {
        console.error('Unable to check existing session', authError);
      }
      return env.ASSETS.fetch(request);
    }

    if (isPlayerPath(pathname)) {
      try {
        const user = await sessionUser(request, env);
        if (!user) {
          const loginUrl = new URL('/player/login/', url);
          loginUrl.searchParams.set('next', internalPlayerNext(url));
          return Response.redirect(loginUrl.toString(), 302);
        }
        return env.ASSETS.fetch(request);
      } catch (authError) {
        console.error('Player protection error', authError);
        return new Response('Player authentication is temporarily unavailable.', {
          status: 503,
          headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
