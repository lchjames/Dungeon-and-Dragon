const SESSION_COOKIE = '__Host-dnd_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;
const KEY_HASH_VERSION = 0;
const encoder = new TextEncoder();
let schemaPromise = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
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
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    level INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    template TEXT NOT NULL DEFAULT 'generic',
    portrait_url TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS character_attributes (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    key TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS character_resources (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    key TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL,
    current_value REAL NOT NULL DEFAULT 0,
    max_value REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS character_inventory (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS character_abilities (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Ability',
    description TEXT NOT NULL DEFAULT '',
    proficient INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_characters_owner ON characters(owner_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attributes_character ON character_attributes(character_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_resources_character ON character_resources(character_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_character ON character_inventory(character_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_abilities_character ON character_abilities(character_id, sort_order)`,
  `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('campaign_name', 'D&D Campaign', 0)`
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

function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}

function nowMs() {
  return Date.now();
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
  return bytesToBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Bytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

async function sha256Hex(value) {
  return bytesToHex(await sha256Bytes(encoder.encode(value)));
}

async function hashAccessKey(password, saltBytes) {
  const secret = encoder.encode(password);
  const payload = new Uint8Array(saltBytes.length + secret.length);
  payload.set(saltBytes, 0);
  payload.set(secret, saltBytes.length);
  return sha256Bytes(payload);
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
    schemaPromise = env.DB
      .batch(SCHEMA.map(sql => env.DB.prepare(sql)))
      .catch(error => {
        schemaPromise = null;
        throw error;
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

function validateOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE'
    });
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > maxBytes) {
    throw Object.assign(new Error('提交內容過大。'), {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE'
    });
  }

  const text = await request.text();
  if (encoder.encode(text).byteLength > maxBytes) {
    throw Object.assign(new Error('提交內容過大。'), {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE'
    });
  }

  try {
    return JSON.parse(text || '{}');
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), {
      status: 400,
      code: 'INVALID_JSON'
    });
  }
}

function normaliseUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

function validateRegistration(input) {
  const username = normaliseUsername(input.username);
  const displayName = String(input.displayName ?? '').trim().normalize('NFKC');
  const password = String(input.password ?? '');

  if (!/^u_[a-f0-9]{24}$/.test(username)) {
    return { error: 'User 格式無效。' };
  }

  if (displayName.length < 1 || displayName.length > 50) {
    return { error: 'User 必須為 1–50 個字元。' };
  }

  if (!/^dnd-key:\d{4}$/.test(password)) {
    return { error: 'Key 必須係 4 位數字。' };
  }

  return { username, displayName, password };
}

function publicUser(row) {
  return {
    id: row.id,
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
    env.DB
      .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
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
    SELECT u.id, u.display_name, u.role, u.status, u.created_at,
           s.last_seen_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();

  if (!row || row.status !== 'active') return null;

  if (now - Number(row.last_seen_at || 0) > 60 * 60 * 1000) {
    await env.DB
      .prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
      .bind(now, tokenHash)
      .run();
  }

  return publicUser(row);
}

async function requireUser(request, env) {
  const user = await sessionUser(request, env);
  if (!user) {
    throw Object.assign(new Error('未登入。'), {
      status: 401,
      code: 'UNAUTHENTICATED'
    });
  }
  return user;
}

async function register(request, env) {
  if (request.method !== 'POST') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }
  if (!validateOrigin(request)) {
    return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  }

  await ensureSchema(env);
  const body = await readJsonBody(request, 16 * 1024);
  const validated = validateRegistration(body);
  if (validated.error) {
    return apiError(validated.error, 400, 'VALIDATION_ERROR');
  }

  const existing = await env.DB
    .prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
    .bind(validated.username)
    .first();

  if (existing) {
    return apiError('呢個 User 已經存在。', 409, 'USERNAME_TAKEN');
  }

  const salt = randomBytes(16);
  const hash = await hashAccessKey(validated.password, salt);
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
      KEY_HASH_VERSION,
      now,
      now
    ).run();
  } catch (dbError) {
    if (String(dbError?.message || dbError).toLowerCase().includes('unique')) {
      return apiError('呢個 User 已經存在。', 409, 'USERNAME_TAKEN');
    }
    throw dbError;
  }

  const token = await createSession(env, userId);
  return json(
    {
      ok: true,
      user: {
        id: userId,
        displayName: validated.displayName,
        role: 'player',
        status: 'active',
        createdAt: now
      }
    },
    201,
    { 'Set-Cookie': sessionCookie(token) }
  );
}

const FAKE_SALT = Uint8Array.from([
  149, 17, 236, 89, 44, 173, 3, 219,
  196, 58, 217, 99, 77, 132, 225, 14
]);

async function login(request, env) {
  if (request.method !== 'POST') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }
  if (!validateOrigin(request)) {
    return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  }

  await ensureSchema(env);
  const body = await readJsonBody(request, 16 * 1024);
  const username = normaliseUsername(body.username);
  const password = String(body.password ?? '');

  if (!/^u_[a-f0-9]{24}$/.test(username) || !/^dnd-key:\d{4}$/.test(password)) {
    await hashAccessKey('dnd-key:0000', FAKE_SALT);
    return apiError('User 或 Key 不正確。', 401, 'INVALID_CREDENTIALS');
  }

  const user = await env.DB.prepare(`
    SELECT id, username, display_name, password_hash, password_salt,
           password_iterations, role, status, failed_attempts,
           locked_until, created_at
    FROM users
    WHERE username = ?
    LIMIT 1
  `).bind(username).first();

  if (!user) {
    await hashAccessKey(password, FAKE_SALT);
    return apiError('User 或 Key 不正確。', 401, 'INVALID_CREDENTIALS');
  }

  const now = nowMs();
  if (user.status !== 'active') {
    return apiError('此 User 目前無法使用。', 403, 'ACCOUNT_DISABLED');
  }

  if (Number(user.locked_until || 0) > now) {
    return apiError('Key 輸入錯誤次數過多，請稍後再試。', 429, 'ACCOUNT_TEMPORARILY_LOCKED');
  }

  if (Number(user.password_iterations) !== KEY_HASH_VERSION) {
    return apiError('此 User 使用舊登入格式，請重新建立 User。', 409, 'LEGACY_ACCOUNT');
  }

  const actual = await hashAccessKey(password, base64ToBytes(user.password_salt));
  const expected = base64ToBytes(user.password_hash);

  if (!constantTimeEqual(actual, expected)) {
    const attempts = Number(user.failed_attempts || 0) + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await env.DB.prepare(`
      UPDATE users
      SET failed_attempts = ?, locked_until = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      shouldLock ? 0 : attempts,
      shouldLock ? now + LOCK_SECONDS * 1000 : null,
      now,
      user.id
    ).run();

    return apiError(
      shouldLock
        ? 'Key 輸入錯誤次數過多，User 已暫時鎖定。'
        : 'User 或 Key 不正確。',
      shouldLock ? 429 : 401,
      shouldLock ? 'ACCOUNT_TEMPORARILY_LOCKED' : 'INVALID_CREDENTIALS'
    );
  }

  await env.DB.prepare(`
    UPDATE users
    SET failed_attempts = 0, locked_until = NULL, updated_at = ?
    WHERE id = ?
  `).bind(now, user.id).run();

  const token = await createSession(env, user.id);
  return json(
    { ok: true, user: publicUser(user) },
    200,
    { 'Set-Cookie': sessionCookie(token) }
  );
}

async function logout(request, env) {
  if (request.method !== 'POST') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }
  if (!validateOrigin(request)) {
    return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  }

  await ensureSchema(env);
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(tokenHash).run();
  }

  return json(
    { ok: true },
    200,
    { 'Set-Cookie': clearSessionCookie() }
  );
}

async function me(request, env) {
  if (request.method !== 'GET') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }

  const user = await sessionUser(request, env);
  if (!user) {
    return apiError('未登入。', 401, 'UNAUTHENTICATED');
  }

  return json({ ok: true, user });
}

async function ownedCharacter(env, userId, characterId) {
  return env.DB.prepare(`
    SELECT id, owner_user_id, name, role, level, status, template,
           portrait_url, summary, notes, created_at, updated_at
    FROM characters
    WHERE id = ? AND owner_user_id = ?
    LIMIT 1
  `).bind(characterId, userId).first();
}

function mapCharacterRow(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    level: Number(row.level || 1),
    status: row.status,
    template: row.template,
    portraitUrl: row.portrait_url,
    summary: row.summary,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadCharacterDetail(env, userId, characterId) {
  const row = await ownedCharacter(env, userId, characterId);
  if (!row) return null;

  const [attributes, resources, inventory, abilities] = await env.DB.batch([
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
      SELECT id, name, qty, notes
      FROM character_inventory
      WHERE character_id = ?
      ORDER BY sort_order, id
    `).bind(characterId),
    env.DB.prepare(`
      SELECT id, name, type, description, proficient
      FROM character_abilities
      WHERE character_id = ?
      ORDER BY sort_order, id
    `).bind(characterId)
  ]);

  return {
    ...mapCharacterRow(row),
    attributes: (attributes.results || []).map(item => ({
      id: item.id,
      key: item.key,
      label: item.label,
      value: item.value,
      description: item.description
    })),
    resources: (resources.results || []).map(item => ({
      id: item.id,
      key: item.key,
      label: item.label,
      current: Number(item.current_value || 0),
      max: Number(item.max_value || 0),
      description: item.description
    })),
    inventory: (inventory.results || []).map(item => ({
      id: item.id,
      name: item.name,
      qty: Number(item.qty || 0),
      notes: item.notes
    })),
    abilities: (abilities.results || []).map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      description: item.description,
      proficient: Boolean(item.proficient)
    }))
  };
}

async function playerBootstrap(request, env) {
  if (request.method !== 'GET') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }

  const user = await requireUser(request, env);
  const [campaign, characters] = await env.DB.batch([
    env.DB.prepare("SELECT value FROM settings WHERE key = 'campaign_name' LIMIT 1"),
    env.DB.prepare(`
      SELECT id, name, role, level, status, template, portrait_url, summary, updated_at
      FROM characters
      WHERE owner_user_id = ? AND status <> 'retired'
      ORDER BY name COLLATE NOCASE
    `).bind(user.id)
  ]);

  return json({
    ok: true,
    user,
    campaign: {
      name: campaign.results?.[0]?.value || 'D&D Campaign'
    },
    characters: (characters.results || []).map(row => ({
      id: row.id,
      name: row.name,
      role: row.role,
      level: Number(row.level || 1),
      status: row.status,
      template: row.template,
      portraitUrl: row.portrait_url,
      summary: row.summary,
      updatedAt: row.updated_at
    }))
  });
}

async function playerCharacter(request, env, characterId) {
  if (request.method !== 'GET') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }

  const user = await requireUser(request, env);
  const character = await loadCharacterDetail(env, user.id, characterId);

  if (!character) {
    return apiError('找不到角色。', 404, 'CHARACTER_NOT_FOUND');
  }

  return json({ ok: true, character });
}

async function updateNotes(request, env, characterId) {
  if (request.method !== 'PATCH') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }
  if (!validateOrigin(request)) {
    return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  }

  const user = await requireUser(request, env);
  const body = await readJsonBody(request);
  const notes = String(body.notes ?? '');

  if (notes.length > 20000) {
    return apiError('筆記內容過長。', 400, 'VALIDATION_ERROR');
  }

  const result = await env.DB.prepare(`
    UPDATE characters
    SET notes = ?, updated_at = ?
    WHERE id = ? AND owner_user_id = ?
  `).bind(notes, nowMs(), characterId, user.id).run();

  if (!result.meta?.changes) {
    return apiError('找不到角色。', 404, 'CHARACTER_NOT_FOUND');
  }

  return json({ ok: true, notes });
}

async function updateResource(request, env, characterId, resourceId) {
  if (request.method !== 'PATCH') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }
  if (!validateOrigin(request)) {
    return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  }

  const user = await requireUser(request, env);
  const body = await readJsonBody(request);
  const current = Number(body.current);

  if (!Number.isFinite(current)) {
    return apiError('請輸入有效數字。', 400, 'VALIDATION_ERROR');
  }

  const owned = await env.DB.prepare(`
    SELECT r.id
    FROM character_resources r
    JOIN characters c ON c.id = r.character_id
    WHERE r.id = ? AND r.character_id = ? AND c.owner_user_id = ?
    LIMIT 1
  `).bind(resourceId, characterId, user.id).first();

  if (!owned) {
    return apiError('找不到資源。', 404, 'RESOURCE_NOT_FOUND');
  }

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE character_resources
      SET current_value = ?
      WHERE id = ? AND character_id = ?
    `).bind(current, resourceId, characterId),
    env.DB.prepare('UPDATE characters SET updated_at = ? WHERE id = ?')
      .bind(nowMs(), characterId)
  ]);

  return json({ ok: true, current });
}

async function updateInventory(request, env, characterId, itemId) {
  if (request.method !== 'PATCH') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }
  if (!validateOrigin(request)) {
    return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  }

  const user = await requireUser(request, env);
  const body = await readJsonBody(request);
  const qty = Number(body.qty);

  if (!Number.isFinite(qty) || qty < 0) {
    return apiError('數量必須係 0 或以上。', 400, 'VALIDATION_ERROR');
  }

  const owned = await env.DB.prepare(`
    SELECT i.id
    FROM character_inventory i
    JOIN characters c ON c.id = i.character_id
    WHERE i.id = ? AND i.character_id = ? AND c.owner_user_id = ?
    LIMIT 1
  `).bind(itemId, characterId, user.id).first();

  if (!owned) {
    return apiError('找不到物品。', 404, 'ITEM_NOT_FOUND');
  }

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE character_inventory
      SET qty = ?
      WHERE id = ? AND character_id = ?
    `).bind(qty, itemId, characterId),
    env.DB.prepare('UPDATE characters SET updated_at = ? WHERE id = ?')
      .bind(nowMs(), characterId)
  ]);

  return json({ ok: true, qty });
}

async function health(request, env) {
  if (request.method !== 'GET') {
    return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  }
  await ensureSchema(env);
  const result = await env.DB.prepare('SELECT 1 AS ok').first();
  return json({ ok: Boolean(result?.ok), database: 'dnd-db' });
}

async function handleApi(request, env, pathname) {
  try {
    await ensureSchema(env);

    if (pathname === '/api/health') return health(request, env);
    if (pathname === '/api/auth/register') return register(request, env);
    if (pathname === '/api/auth/login') return login(request, env);
    if (pathname === '/api/auth/logout') return logout(request, env);
    if (pathname === '/api/auth/me') return me(request, env);
    if (pathname === '/api/player/bootstrap') return playerBootstrap(request, env);

    const characterMatch = pathname.match(/^\/api\/player\/characters\/([^/]+)$/);
    if (characterMatch) {
      return playerCharacter(request, env, decodeURIComponent(characterMatch[1]));
    }

    const notesMatch = pathname.match(/^\/api\/player\/characters\/([^/]+)\/notes$/);
    if (notesMatch) {
      return updateNotes(request, env, decodeURIComponent(notesMatch[1]));
    }

    const resourceMatch = pathname.match(
      /^\/api\/player\/characters\/([^/]+)\/resources\/([^/]+)$/
    );
    if (resourceMatch) {
      return updateResource(
        request,
        env,
        decodeURIComponent(resourceMatch[1]),
        decodeURIComponent(resourceMatch[2])
      );
    }

    const inventoryMatch = pathname.match(
      /^\/api\/player\/characters\/([^/]+)\/inventory\/([^/]+)$/
    );
    if (inventoryMatch) {
      return updateInventory(
        request,
        env,
        decodeURIComponent(inventoryMatch[1]),
        decodeURIComponent(inventoryMatch[2])
      );
    }

    return apiError('Not found.', 404, 'NOT_FOUND');
  } catch (error) {
    console.error('API error', error);

    if (error?.status) {
      return apiError(error.message, error.status, error.code || 'API_ERROR');
    }

    if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
      return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
    }

    return apiError('暫時無法完成要求，請稍後再試。', 500, 'SERVICE_ERROR');
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
  return value.startsWith('/player/') && !value.startsWith('//')
    ? value
    : '/player/';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      return handleApi(request, env, pathname);
    }

    if (isAuthPage(pathname)) {
      try {
        const user = await sessionUser(request, env);
        if (user) {
          return Response.redirect(new URL('/player/', url).toString(), 302);
        }
      } catch (error) {
        console.error('Session check error', error);
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
      } catch (error) {
        console.error('Player protection error', error);
        return new Response('Player service is temporarily unavailable.', {
          status: 503,
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
