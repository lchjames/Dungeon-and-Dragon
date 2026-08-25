import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import adminGateway from './admin-auth.js';

const SESSION_COOKIE = '__Host-dnd_session';
const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_MIN_PASSWORD_LENGTH = 12;
const ALPHA_GM_MIN_PASSWORD_LENGTH = 8;
const ALPHA_GM_USERNAME = 'gm';
const ALPHA_GM_INTERNAL_USERNAME = 'a_a474219e5e9503c84d59500b';
// Temporary Alpha-only compatibility value. Workers/workerd currently rejects
// PBKDF2 iteration counts above 100,000. Do not copy this into the long-term
// Admin credential design; replace the production Admin KDF before Alpha exit.
const ALPHA_GM_PASSWORD_HASH = 'cxzoZ2CTjgCw1w404Fc/z8eVgc5JuGcI6i15Ng/0GO0=';
const ALPHA_GM_PASSWORD_SALT = 'v3nYhKUXDjd+NGBXR2a3Vg==';
const ALPHA_GM_PASSWORD_ITERATIONS = 100000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;
let loginSchemaPromise = null;

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

function normaliseAdminUsername(value) {
  return String(value || '').trim().normalize('NFKC').toLowerCase();
}

function validAdminUsername(username) {
  return username === ALPHA_GM_USERNAME || /^[a-z0-9._-]{3,32}$/.test(username);
}

function minimumPasswordLength(username) {
  return username === ALPHA_GM_USERNAME ? ALPHA_GM_MIN_PASSWORD_LENGTH : DEFAULT_MIN_PASSWORD_LENGTH;
}

function internalAdminUsername(username) {
  const digest = createHash('sha256').update(normaliseAdminUsername(username), 'utf8').digest('hex');
  return `a_${digest.slice(0, 24)}`;
}

function hashSessionToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function derivePassword(password, salt, iterations) {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, 32, 'sha256', (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function ensureLoginSchema(env) {
  if (!env.DB) throw Object.assign(new Error('D1 binding DB is unavailable.'), { stage: 'database-binding' });
  if (!loginSchemaPromise) {
    loginSchemaPromise = env.DB.batch([
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
      loginSchemaPromise = null;
      error.stage = error.stage || 'schema';
      throw error;
    });
  }
  await loginSchemaPromise;
}

// TEMPORARY ALPHA OPERATOR SEED.
// This does not expose a public provisioning API and cannot create arbitrary
// Admin identities. It deterministically assigns the single Alpha GM account
// requested by the operator. Remove after the first successful live E2E run.
async function ensureAlphaGmOperatorSeed(env) {
  const now = Date.now();
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

async function readJson(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

async function adminLogin(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');

  await ensureLoginSchema(env);
  const body = await readJson(request);
  const username = normaliseAdminUsername(body.username);
  const password = String(body.password || '');
  const minLength = minimumPasswordLength(username);

  // Normal Admin usernames remain 3–32 characters. The fixed Alpha account
  // `gm` is the only two-character exception because it was explicitly
  // operator-assigned before this validation contract was introduced.
  if (!validAdminUsername(username) || password.length < minLength || password.length > 128) {
    return apiError('Admin Username 或密碼不正確。', 401, 'INVALID_ADMIN_CREDENTIALS');
  }

  if (username === ALPHA_GM_USERNAME) {
    await ensureAlphaGmOperatorSeed(env);
  }

  const user = await env.DB.prepare(`
    SELECT id, username, display_name, password_hash, password_salt,
           password_iterations, role, status, failed_attempts, locked_until, created_at
    FROM users
    WHERE username = ? AND LOWER(role) = 'admin'
    LIMIT 1
  `).bind(internalAdminUsername(username)).first();

  if (!user) {
    return apiError(
      username === ALPHA_GM_USERNAME ? 'Alpha GM credential row is missing.' : 'Admin Username 或密碼不正確。',
      401,
      username === ALPHA_GM_USERNAME ? 'ALPHA_GM_ROW_MISSING' : 'INVALID_ADMIN_CREDENTIALS'
    );
  }
  if (user.status !== 'active') return apiError('此 Admin 帳戶目前無法使用。', 403, 'ADMIN_DISABLED');

  const now = Date.now();
  if (Number(user.locked_until || 0) > now) {
    return apiError('登入錯誤次數過多，Admin 帳戶已暫時鎖定。', 429, 'ADMIN_TEMPORARILY_LOCKED');
  }

  const iterations = Number(user.password_iterations || 0);
  if (iterations < 100000 || !String(user.username || '').startsWith('a_')) {
    return apiError('此 Admin 帳戶需要由系統管理員重新設定 credential。', 409, 'ADMIN_CREDENTIAL_RESET_REQUIRED');
  }

  let salt;
  let expected;
  try {
    salt = Buffer.from(String(user.password_salt || ''), 'base64');
    expected = Buffer.from(String(user.password_hash || ''), 'base64');
    if (salt.length < 16 || expected.length !== 32) throw new Error('Stored Admin credential encoding is invalid.');
  } catch (error) {
    error.stage = 'credential-decode';
    throw error;
  }

  let actual;
  try {
    actual = await derivePassword(password, salt, iterations);
  } catch (error) {
    error.stage = 'pbkdf2';
    throw error;
  }
  const credentialMatches = actual.length === expected.length && timingSafeEqual(actual, expected);

  if (!credentialMatches) {
    const attempts = Number(user.failed_attempts || 0) + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await env.DB.prepare('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
      .bind(shouldLock ? 0 : attempts, shouldLock ? now + LOCK_SECONDS * 1000 : null, now, user.id).run();
    return apiError(
      shouldLock ? '登入錯誤次數過多，Admin 帳戶已暫時鎖定。' : 'Admin Username 或密碼不正確。',
      shouldLock ? 429 : 401,
      shouldLock ? 'ADMIN_TEMPORARILY_LOCKED' : 'INVALID_ADMIN_CREDENTIALS'
    );
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?').bind(now, user.id),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
        .bind(tokenHash, user.id, now + ADMIN_SESSION_TTL_SECONDS * 1000, now, now)
    ]);
  } catch (error) {
    error.stage = 'session-write';
    throw error;
  }

  return json({
    ok: true,
    user: {
      id: user.id,
      displayName: user.display_name,
      role: 'admin',
      status: user.status,
      createdAt: user.created_at
    }
  }, 200, { 'Set-Cookie': sessionCookie(token) });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/api/admin/auth/login') return adminGateway.fetch(request, env);

    try {
      return await adminLogin(request, env);
    } catch (error) {
      console.error('Admin login gateway error', {
        stage: error?.stage || 'unknown',
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) {
        return apiError(error.message || 'Admin authentication failed.', error.status, error.code || 'ADMIN_AUTH_ERROR');
      }
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Admin authentication runtime 暫時無法使用。', 500, error?.stage === 'pbkdf2' ? 'ADMIN_AUTH_PBKDF2_RUNTIME_ERROR' : 'ADMIN_AUTH_RUNTIME_ERROR');
    }
  }
};
