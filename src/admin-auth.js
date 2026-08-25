import baseWorker from './boss-defeat.js';

const SESSION_COOKIE = '__Host-dnd_session';
const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
const ADMIN_PBKDF2_ITERATIONS = 210000;
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;
const encoder = new TextEncoder();
let authSchemaPromise = null;

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

async function sha256Bytes(value) {
  const input = value instanceof Uint8Array ? value : encoder.encode(String(value));
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

async function sha256Hex(value) {
  return bytesToHex(await sha256Bytes(value));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

async function pbkdf2Hash(password, salt, iterations = ADMIN_PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations
  }, key, 256);
  return new Uint8Array(bits);
}

function normaliseAdminUsername(value) {
  return String(value || '').trim().normalize('NFKC').toLowerCase();
}

function validateAdminCredentials(usernameValue, passwordValue) {
  const username = normaliseAdminUsername(usernameValue);
  const password = String(passwordValue || '');
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { error: 'Admin Username 必須為 3–32 個英文字母、數字、點、底線或連字號。' };
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH || password.length > 128) {
    return { error: `Admin 密碼必須為 ${MIN_ADMIN_PASSWORD_LENGTH}–128 個字元。` };
  }
  if (password.toLowerCase().includes(username)) {
    return { error: 'Admin 密碼不可包含完整 Username。' };
  }
  return { username, password };
}

async function adminInternalUsername(username) {
  return `a_${(await sha256Hex(normaliseAdminUsername(username))).slice(0, 24)}`;
}

async function ensureAuthSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!authSchemaPromise) {
    authSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_iterations INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'player',
        status TEXT NOT NULL DEFAULT 'active',
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)'),
      env.DB.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE LOWER(role) = 'gm'").bind(Date.now())
    ]).catch(error => {
      authSchemaPromise = null;
      throw error;
    });
  }
  await authSchemaPromise;
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
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function sessionUser(request, env) {
  await ensureAuthSchema(env);
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.status,
           u.password_iterations, u.created_at, s.last_seen_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();
  if (!row || row.status !== 'active') return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: String(row.role || '').toLowerCase(),
    status: row.status,
    passwordIterations: Number(row.password_iterations || 0),
    createdAt: row.created_at
  };
}

async function requireRole(request, env, role) {
  const user = await sessionUser(request, env);
  if (!user || user.role !== role) {
    throw Object.assign(new Error(role === 'admin' ? 'Admin 未登入。' : 'Player 未登入。'), {
      status: 401,
      code: role === 'admin' ? 'ADMIN_UNAUTHENTICATED' : 'UNAUTHENTICATED'
    });
  }
  return user;
}

async function createAdminSession(env, userId) {
  const token = bytesToBase64Url(randomBytes(32));
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenHash, userId, now + ADMIN_SESSION_TTL_SECONDS * 1000, now, now)
  ]);
  return token;
}

async function readJson(request) {
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

const FAKE_ADMIN_SALT = Uint8Array.from([41, 99, 203, 12, 88, 177, 34, 201, 7, 155, 246, 16, 110, 63, 144, 221]);

async function adminLogin(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await ensureAuthSchema(env);
  const body = await readJson(request);
  const username = normaliseAdminUsername(body.username);
  const password = String(body.password || '');
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length < MIN_ADMIN_PASSWORD_LENGTH || password.length > 128) {
    await pbkdf2Hash('invalid-admin-password', FAKE_ADMIN_SALT);
    return apiError('Admin Username 或密碼不正確。', 401, 'INVALID_ADMIN_CREDENTIALS');
  }
  const internalUsername = await adminInternalUsername(username);
  const user = await env.DB.prepare(`
    SELECT id, username, display_name, password_hash, password_salt,
           password_iterations, role, status, failed_attempts, locked_until, created_at
    FROM users WHERE username = ? AND LOWER(role) = 'admin' LIMIT 1
  `).bind(internalUsername).first();
  if (!user) {
    await pbkdf2Hash(password, FAKE_ADMIN_SALT);
    return apiError('Admin Username 或密碼不正確。', 401, 'INVALID_ADMIN_CREDENTIALS');
  }
  const now = Date.now();
  if (user.status !== 'active') return apiError('此 Admin 帳戶目前無法使用。', 403, 'ADMIN_DISABLED');
  if (Number(user.locked_until || 0) > now) {
    return apiError('登入錯誤次數過多，Admin 帳戶已暫時鎖定。', 429, 'ADMIN_TEMPORARILY_LOCKED');
  }
  if (Number(user.password_iterations) < 100000) {
    return apiError('此 Admin 帳戶需要重新設定強密碼。', 409, 'ADMIN_CREDENTIAL_RESET_REQUIRED');
  }
  const actual = await pbkdf2Hash(password, base64ToBytes(user.password_salt), Number(user.password_iterations));
  const expected = base64ToBytes(user.password_hash);
  if (!constantTimeEqual(actual, expected)) {
    const attempts = Number(user.failed_attempts || 0) + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await env.DB.prepare(`UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?`)
      .bind(shouldLock ? 0 : attempts, shouldLock ? now + LOCK_SECONDS * 1000 : null, now, user.id).run();
    return apiError(
      shouldLock ? '登入錯誤次數過多，Admin 帳戶已暫時鎖定。' : 'Admin Username 或密碼不正確。',
      shouldLock ? 429 : 401,
      shouldLock ? 'ADMIN_TEMPORARILY_LOCKED' : 'INVALID_ADMIN_CREDENTIALS'
    );
  }
  await env.DB.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .bind(now, user.id).run();
  const token = await createAdminSession(env, user.id);
  return json({ ok: true, user: { id: user.id, displayName: user.display_name, role: 'admin', status: user.status, createdAt: user.created_at } }, 200, {
    'Set-Cookie': sessionCookie(token)
  });
}

async function adminLogout(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await ensureAuthSchema(env);
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

async function adminMe(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  const user = await requireRole(request, env, 'admin');
  return json({ ok: true, user: { id: user.id, displayName: user.displayName, role: 'admin', status: user.status, createdAt: user.createdAt } });
}

async function configuredProvisionToken(env) {
  return String(env.INITIAL_ADMIN_PROVISION_TOKEN || env.INITIAL_GM_PROVISION_TOKEN || '');
}

async function adminSetup(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await ensureAuthSchema(env);
  const body = await readJson(request);
  const validated = validateAdminCredentials(body.username, body.password);
  if (validated.error) return apiError(validated.error, 400, 'VALIDATION_ERROR');
  const configuredToken = await configuredProvisionToken(env);
  if (!configuredToken) return apiError('Initial Admin provisioning secret 尚未配置。', 503, 'PROVISION_SECRET_NOT_CONFIGURED');
  if (configuredToken.length < 24) return apiError('Initial Admin provisioning secret 配置過短。', 503, 'PROVISION_SECRET_TOO_SHORT');
  const submittedToken = String(body.token || '');
  const [tokenActual, tokenExpected] = await Promise.all([sha256Bytes(submittedToken), sha256Bytes(configuredToken)]);
  if (!submittedToken || !constantTimeEqual(tokenActual, tokenExpected)) {
    return apiError('Provisioning Token 不正確。', 403, 'PROVISION_TOKEN_INVALID');
  }

  const adminRows = await env.DB.prepare(`
    SELECT id, username, display_name, password_iterations, status
    FROM users WHERE LOWER(role) = 'admin' ORDER BY created_at
  `).all();
  const admins = adminRows.results || [];
  const legacy = admins.length === 1 && (
    Number(admins[0].password_iterations || 0) < 100000 || !String(admins[0].username || '').startsWith('a_')
  );
  if (admins.length > 0 && !legacy) {
    return apiError('Admin 已經完成 provisioning；初始 setup 已關閉。', 409, 'INITIAL_ADMIN_ALREADY_PROVISIONED');
  }
  if (admins.length > 1) {
    return apiError('偵測到多個 legacy Admin；請先進行資料修復。', 409, 'MULTIPLE_LEGACY_ADMINS');
  }

  const salt = randomBytes(16);
  const hash = await pbkdf2Hash(validated.password, salt);
  const internalUsername = await adminInternalUsername(validated.username);
  const now = Date.now();
  let userId;

  if (legacy) {
    userId = admins[0].id;
    const collision = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1').bind(internalUsername, userId).first();
    if (collision) return apiError('呢個 Admin Username 已被使用。', 409, 'ADMIN_USERNAME_TAKEN');
    await env.DB.batch([
      env.DB.prepare(`UPDATE users
        SET username = ?, display_name = ?, password_hash = ?, password_salt = ?,
            password_iterations = ?, role = 'admin', status = 'active', failed_attempts = 0,
            locked_until = NULL, updated_at = ? WHERE id = ?`)
        .bind(internalUsername, validated.username, bytesToBase64(hash), bytesToBase64(salt), ADMIN_PBKDF2_ITERATIONS, now, userId),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId)
    ]);
  } else {
    const collision = await env.DB.prepare('SELECT id FROM users WHERE username = ? LIMIT 1').bind(internalUsername).first();
    if (collision) return apiError('呢個 Admin Username 已被使用。', 409, 'ADMIN_USERNAME_TAKEN');
    userId = `admin_${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO users (
      id, username, display_name, password_hash, password_salt, password_iterations,
      role, status, failed_attempts, locked_until, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'admin', 'active', 0, NULL, ?, ?)`)
      .bind(userId, internalUsername, validated.username, bytesToBase64(hash), bytesToBase64(salt), ADMIN_PBKDF2_ITERATIONS, now, now).run();
  }

  const token = await createAdminSession(env, userId);
  return json({ ok: true, provisioned: true, migratedLegacyGM: legacy, user: { id: userId, displayName: validated.username, role: 'admin', status: 'active', createdAt: now } }, 201, {
    'Set-Cookie': sessionCookie(token)
  });
}

async function playerLoginPreflight(request, env) {
  if (request.method !== 'POST') return null;
  try {
    await ensureAuthSchema(env);
    const body = await request.clone().json();
    const username = String(body?.username || '').trim().toLowerCase();
    if (!username) return null;
    const row = await env.DB.prepare('SELECT role FROM users WHERE username = ? LIMIT 1').bind(username).first();
    if (row && String(row.role || '').toLowerCase() !== 'player') {
      return apiError('User 或 Key 不正確。', 401, 'INVALID_CREDENTIALS');
    }
  } catch {
    return null;
  }
  return null;
}

function isPlayerAuthPage(pathname) {
  return /^\/player\/(login|register)(?:\/|\/index\.html)?$/.test(pathname);
}

function isPlayerPath(pathname) {
  return pathname === '/player' || pathname.startsWith('/player/');
}

function isGmLogin(pathname) {
  return pathname === '/gm/login' || pathname.startsWith('/gm/login/');
}

function isGmSetup(pathname) {
  return pathname === '/gm/setup' || pathname.startsWith('/gm/setup/');
}

function internalGmNext(url) {
  const value = `${url.pathname}${url.search}`;
  return (value === '/gm' || value.startsWith('/gm/')) && !value.startsWith('//') ? value : '/gm/';
}

async function handleGmLoginPage(request, env) {
  const user = await sessionUser(request, env);
  if (user?.role === 'admin') return Response.redirect(new URL('/gm/', request.url).toString(), 302);
  return env.ASSETS.fetch(request);
}

async function handleGmSetupPage(request, env) {
  await ensureAuthSchema(env);
  const user = await sessionUser(request, env);
  if (user?.role === 'admin' && user.passwordIterations >= 100000 && String(user.username || '').startsWith('a_')) {
    return Response.redirect(new URL('/gm/', request.url).toString(), 302);
  }
  const rows = await env.DB.prepare(`SELECT username, password_iterations FROM users WHERE LOWER(role) = 'admin'`).all();
  const admins = rows.results || [];
  const legacy = admins.length === 1 && (Number(admins[0].password_iterations || 0) < 100000 || !String(admins[0].username || '').startsWith('a_'));
  if (admins.length > 0 && !legacy) return Response.redirect(new URL('/gm/login/', request.url).toString(), 302);
  return env.ASSETS.fetch(request);
}

async function handleGmPage(request, env) {
  const user = await sessionUser(request, env);
  if (!user || user.role !== 'admin') {
    const login = new URL('/gm/login/', request.url);
    login.searchParams.set('next', internalGmNext(new URL(request.url)));
    return Response.redirect(login.toString(), 302);
  }
  return env.ASSETS.fetch(request);
}

async function handlePlayerBoundary(request, env, pathname) {
  if (isPlayerAuthPage(pathname)) {
    const next = new URL(request.url).searchParams.get('next') || '';
    if (next === '/gm' || next.startsWith('/gm/')) {
      const login = new URL('/gm/login/', request.url);
      login.searchParams.set('next', next);
      return Response.redirect(login.toString(), 302);
    }
    const user = await sessionUser(request, env);
    if (user?.role === 'player') return baseWorker.fetch(request, env);
    return env.ASSETS.fetch(request);
  }
  if (isPlayerPath(pathname)) {
    const user = await sessionUser(request, env);
    if (!user || user.role !== 'player') {
      const login = new URL('/player/login/', request.url);
      login.searchParams.set('next', `${new URL(request.url).pathname}${new URL(request.url).search}`);
      return Response.redirect(login.toString(), 302);
    }
  }
  if (pathname.startsWith('/api/player/')) await requireRole(request, env, 'player');
  return baseWorker.fetch(request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    try {
      await ensureAuthSchema(env);

      if (pathname === '/api/admin/auth/login') return adminLogin(request, env);
      if (pathname === '/api/admin/auth/logout') return adminLogout(request, env);
      if (pathname === '/api/admin/auth/me') return adminMe(request, env);
      if (pathname === '/api/admin/setup') return adminSetup(request, env);
      if (pathname === '/api/admin/provision-initial-gm') {
        return apiError('Player → GM promotion 已被 Admin-only authentication supersede。', 410, 'GM_PROVISIONING_SUPERSEDED');
      }

      if (pathname === '/api/auth/login') {
        const blocked = await playerLoginPreflight(request, env);
        if (blocked) return blocked;
      }

      if (isGmLogin(pathname)) return handleGmLoginPage(request, env);
      if (isGmSetup(pathname)) return handleGmSetupPage(request, env);
      if (pathname === '/gm' || pathname.startsWith('/gm/')) return handleGmPage(request, env);

      if (pathname.startsWith('/api/gm/')) {
        await requireRole(request, env, 'admin');
        return baseWorker.fetch(request, env);
      }

      if (isPlayerPath(pathname) || pathname.startsWith('/api/player/')) {
        return handlePlayerBoundary(request, env, pathname);
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Admin authentication boundary error', error);
      if (error?.status) return apiError(error.message, error.status, error.code || 'AUTH_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Admin authentication service 暫時無法使用。', 500, 'ADMIN_AUTH_SERVICE_ERROR');
    }
  }
};
