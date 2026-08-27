import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const gateway = await readFile(new URL('../src/admin-auth.js', import.meta.url), 'utf8');
const core = await readFile(new URL('../src/admin-auth-core.js', import.meta.url), 'utf8');
const loginHtml = await readFile(new URL('../public/gm/login/index.html', import.meta.url), 'utf8');
const loginJs = await readFile(new URL('../public/assets/admin-auth.js', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/GM_INITIAL_PROVISIONING_MVP.md', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(gateway, /import authCore from '\.\/admin-auth-core\.js'/, 'Admin lockdown must remain the outer production gateway.');
assert.match(gateway, /ADMIN_PROVISIONING_DISABLED/, 'Public Admin provisioning must be permanently disabled.');
assert.match(gateway, /pathname === '\/api\/admin\/setup'/, 'The historical Admin setup API must be blocked before the auth core.');
assert.match(gateway, /pathname === '\/api\/admin\/provision-initial-gm'/, 'The historical Player-to-GM provisioning API must remain blocked.');
assert.match(gateway, /isGmSetupPath/, 'The historical GM setup page must be intercepted.');
assert.match(gateway, /new URL\('\/gm\/login\/'/, 'GM setup requests must return to login, never to a creation form.');
assert.match(gateway, /return await authCore\.fetch\(request, env\)/, 'The outer gateway must await core auth so async authorization errors remain catchable.');
assert.match(gateway, /if \(error\?\.status\)/, 'Typed async auth errors must preserve their HTTP status instead of becoming 500.');
assert.match(gateway, /PRAGMA table_info\(/, 'Live Admin auth must inspect legacy D1 columns before delegation.');
assert.match(gateway, /ALTER TABLE \$\{table\} ADD COLUMN/, 'Live Admin auth must add missing legacy columns idempotently.');
assert.match(gateway, /ensureAdminAuthCompatibility/, 'Admin auth compatibility migration must run before the core auth path.');
assert.match(gateway, /password_iterations.*INTEGER NOT NULL DEFAULT 0/s, 'Legacy users must gain the Admin password iteration field when missing.');
assert.match(gateway, /last_seen_at.*INTEGER NOT NULL DEFAULT 0/s, 'Legacy sessions must gain last_seen_at when missing.');

assert.match(core, /import baseWorker from '\.\/boss-defeat\.js'/, 'Admin auth core must still delegate to the gameplay runtime.');
assert.match(core, /ADMIN_PBKDF2_ITERATIONS\s*=\s*210000/, 'Admin passwords must use a dedicated slow hash.');
assert.match(core, /PBKDF2/);
assert.match(core, /role\s*=\s*'admin'/);
assert.match(core, /UPDATE users SET role = 'admin'.*LOWER\(role\) = 'gm'/s, 'Legacy gm rows remain migration-only input.');
assert.match(core, /function isProvisionedAdmin/);
assert.match(core, /passwordIterations >= 100000/);
assert.match(core, /startsWith\('a_'\)/, 'Admin authorization must require the dedicated Admin username namespace.');
assert.match(core, /\/api\/admin\/auth\/login/);
assert.match(core, /\/api\/admin\/auth\/me/);
assert.match(core, /await requireRole\(request, env, 'admin'\)/, 'GM APIs must be protected by Admin role.');
assert.match(core, /await requireRole\(request, env, 'player'\)/, 'Player APIs must remain Player-only.');

assert.match(loginHtml, /Admin Access/);
assert.match(loginHtml, /Admin Username/);
assert.match(loginHtml, /Admin Password/);
assert.match(loginHtml, /Admin 帳戶不設公開註冊/);
assert.match(loginHtml, /name="username"[^>]*minlength="2"[^>]*maxlength="32"/, 'The browser must allow the fixed two-character Alpha GM username to reach JavaScript validation.');
assert.doesNotMatch(loginHtml, /name="username"[^>]*minlength="3"/, 'The old browser-level three-character minimum must not block gm.');
assert.doesNotMatch(loginHtml, /\/gm\/setup\//, 'Admin login must not advertise any creation/setup route.');
assert.doesNotMatch(loginHtml, /首次建立 Admin/, 'Admin creation CTA must stay removed.');
assert.doesNotMatch(loginHtml, /name=["']key["']/i, 'Admin login form must not contain a Player Key field.');
assert.match(loginJs, /\/api\/admin\/auth\/login/);
assert.match(loginJs, /function validAdminUsername/);
assert.match(loginJs, /normalized\.toLowerCase\(\) === 'gm'/, 'Only the fixed Alpha gm username may use the two-character exception.');
assert.match(loginJs, /\^\[A-Za-z0-9\._-\]\{3,32\}\$/, 'All non-gm Admin usernames must retain the normal 3-32 character rule.');
assert.match(loginJs, /if \(!validAdminUsername\(username\)\)/, 'Login submission must use the canonical frontend username validator.');
assert.match(loginJs, /value === '\/gm\/setup'/, 'Login next-path sanitization must reject retired setup URLs.');
assert.doesNotMatch(loginJs, /Initial Admin Setup/, 'Login guidance must not direct legacy accounts to a public setup form.');

await assert.rejects(access(new URL('../public/gm/setup/index.html', import.meta.url)), 'Public GM setup HTML must not be shipped.');
await assert.rejects(access(new URL('../public/assets/gm-setup.js', import.meta.url)), 'Public GM setup JavaScript must not be shipped.');

assert.match(canonical, /不可由網站建立/);
assert.match(canonical, /deployment \/ database/);
assert.match(canonical, /Player.*Admin/s);
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/admin-auth\.js"/);
