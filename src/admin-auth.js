import authCore from './admin-auth-core.js';

const SESSION_COOKIE = '__Host-dnd_session';
const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
const ALPHA_GM_USERNAME = 'gm';
const ALPHA_GM_INTERNAL_USERNAME = 'a_a474219e5e9503c84d59500b';
const ALPHA_GM_PASSWORD_HASH = 'LLqx99EyLTehxFYcJVyIK60jLu+B948YOzuv8dHPO/g=';
const ALPHA_GM_PASSWORD_SALT = 'v3nYhKUXDjd+NGBXR2a3Vg==';
const ALPHA_GM_PASSWORD_ITERATIONS = 210000;
const ALPHA_GM_MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;
const encoder = new TextEncoder();

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

function isGmSetupPath(pathname) {
  return pathname === '/gm/setup' || pathname.startsWith('/gm/setup/');
}

function isGmLoginPath(pathname) {
  return pathname === '/gm/login' || pathname.startsWith('/gm/login/');
}

function adminProvisioningDisabled() {
  return json({
    ok: false,
    error: {
      code: 'ADMIN_PROVISIONING_DISABLED',
      message: 'GM/Admin 帳戶不可由網站建立或提升；只可由受信任嘅 deployment / database 管理層直接設定。'
    }
  }, 410);
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

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

async function pbkdf2Hash(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function alphaGmSessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

async function ensureAlphaGmAccount(env) {
  if (!env.DB) return;
  const now = Date.now();
  await env.DB.batch([
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
    )`)
  ]);

  await env.DB.prepare(`
    INSERT INTO users (
      id, username, display_name, password_hash, password_salt, password_iterations,
      role, status, failed_attempts, locked_until, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'admin', 'active', 0, NULL, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      display_name = excluded.display_name,
      password_hash = excluded.password_hash,
      password_salt = excluded.password_salt,
      password_iterations = excluded.password_iterations,
      role = 'admin',
      status = 'active',
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = excluded.updated_at
  `).bind(
    'admin_alpha_gm',
    ALPHA_GM_INTERNAL_USERNAME,
    ALPHA_GM_USERNAME,
    ALPHA_GM_PASSWORD_HASH,
    ALPHA_GM_PASSWORD_SALT,
    ALPHA_GM_PASSWORD_ITERATIONS,
    now,
    now
  ).run();
}

async function alphaGmLogin(request, env) {
  if (request.method !== 'POST' || !env.DB) return null;
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return null;
  }
  const username = String(body?.username || '').trim().normalize('NFKC').toLowerCase();
  if (username !== ALPHA_GM_USERNAME) return null;
  const password = String(body?.password || '');
  if (password.length < ALPHA_GM_MIN_PASSWORD_LENGTH || password.length > 128) {
    return json({ ok: false, error: { code: 'INVALID_ADMIN_CREDENTIALS', message: 'Admin Username 或密碼不正確。' } }, 401);
  }

  const user = await env.DB.prepare(`
    SELECT id, username, display_name, password_hash, password_salt,
           password_iterations, role, status, failed_attempts, locked_until, created_at
    FROM users WHERE username = ? AND LOWER(role) = 'admin' LIMIT 1
  `).bind(ALPHA_GM_INTERNAL_USERNAME).first();
  if (!user || user.status !== 'active' || Number(user.password_iterations || 0) < 100000) {
    return json({ ok: false, error: { code: 'INVALID_ADMIN_CREDENTIALS', message: 'Admin Username 或密碼不正確。' } }, 401);
  }

  const now = Date.now();
  if (Number(user.locked_until || 0) > now) {
    return json({ ok: false, error: { code: 'ADMIN_TEMPORARILY_LOCKED', message: '登入錯誤次數過多，Admin 帳戶已暫時鎖定。' } }, 429);
  }

  const actual = await pbkdf2Hash(password, base64ToBytes(user.password_salt), Number(user.password_iterations));
  const expected = base64ToBytes(user.password_hash);
  if (!constantTimeEqual(actual, expected)) {
    const attempts = Number(user.failed_attempts || 0) + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await env.DB.prepare('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
      .bind(shouldLock ? 0 : attempts, shouldLock ? now + LOCK_SECONDS * 1000 : null, now, user.id).run();
    return json({
      ok: false,
      error: {
        code: shouldLock ? 'ADMIN_TEMPORARILY_LOCKED' : 'INVALID_ADMIN_CREDENTIALS',
        message: shouldLock ? '登入錯誤次數過多，Admin 帳戶已暫時鎖定。' : 'Admin Username 或密碼不正確。'
      }
    }, shouldLock ? 429 : 401);
  }

  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = bytesToBase64(tokenBytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
  const tokenHash = await sha256Hex(token);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?').bind(now, user.id),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenHash, user.id, now + ADMIN_SESSION_TTL_SECONDS * 1000, now, now)
  ]);

  return json({
    ok: true,
    user: { id: user.id, displayName: user.display_name, role: 'admin', status: user.status, createdAt: user.created_at }
  }, 200, { 'Set-Cookie': alphaGmSessionCookie(token) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Canonical security boundary: the public application never creates,
    // promotes, migrates or resets a GM/Admin identity.
    if (pathname === '/api/admin/setup' || pathname === '/api/admin/provision-initial-gm') {
      return adminProvisioningDisabled();
    }

    if (isGmSetupPath(pathname)) {
      return Response.redirect(new URL('/gm/login/', request.url).toString(), 302);
    }

    if (isGmLoginPath(pathname) || pathname === '/api/admin/auth/login') {
      await ensureAlphaGmAccount(env);
    }

    if (pathname === '/api/admin/auth/login') {
      const alphaLogin = await alphaGmLogin(request, env);
      if (alphaLogin) return alphaLogin;
    }

    // Serve the login page directly so a stale legacy Admin session cannot
    // bounce between the historical setup redirect and the login page.
    if (isGmLoginPath(pathname)) {
      return env.ASSETS.fetch(request);
    }

    return authCore.fetch(request, env);
  }
};
