import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
assert.match(gateway, /return authCore\.fetch\(request, env\)/, 'Normal authenticated traffic must still delegate to the existing Admin auth core.');

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
assert.doesNotMatch(loginHtml, /\/gm\/setup\//, 'Admin login must not advertise any creation/setup route.');
assert.doesNotMatch(loginHtml, /首次建立 Admin/, 'Admin creation CTA must stay removed.');
assert.doesNotMatch(loginHtml, /name=["']key["']/i, 'Admin login form must not contain a Player Key field.');
assert.match(loginJs, /\/api\/admin\/auth\/login/);

assert.match(canonical, /不可由網站建立/);
assert.match(canonical, /deployment \/ database/);
assert.match(canonical, /Player.*Admin/s);
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/admin-auth\.js"/);
