import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../src/admin-auth.js', import.meta.url), 'utf8');
const loginHtml = await readFile(new URL('../public/gm/login/index.html', import.meta.url), 'utf8');
const loginJs = await readFile(new URL('../public/assets/admin-auth.js', import.meta.url), 'utf8');
const setupHtml = await readFile(new URL('../public/gm/setup/index.html', import.meta.url), 'utf8');
const setupJs = await readFile(new URL('../public/assets/gm-setup.js', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/GM_INITIAL_PROVISIONING_MVP.md', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(worker, /import baseWorker from '\.\/boss-defeat\.js'/, 'Admin auth must be the outer production gateway.');
assert.match(worker, /ADMIN_PBKDF2_ITERATIONS\s*=\s*210000/, 'Admin passwords must use a dedicated slow hash.');
assert.match(worker, /PBKDF2/);
assert.match(worker, /role\s*=\s*'admin'/);
assert.match(worker, /UPDATE users SET role = 'admin'.*LOWER\(role\) = 'gm'/s, 'Legacy gm rows must migrate to admin.');
assert.match(worker, /function isProvisionedAdmin/);
assert.match(worker, /passwordIterations >= 100000/);
assert.match(worker, /startsWith\('a_'\)/, 'Admin authorization must require the dedicated Admin username namespace.');
assert.match(worker, /ADMIN_CREDENTIAL_RESET_REQUIRED/, 'Legacy Player-key GM sessions must be blocked until credential reset.');
assert.match(worker, /DELETE FROM sessions WHERE user_id = \?/, 'Legacy credential migration must invalidate old sessions.');
assert.match(worker, /\/api\/admin\/auth\/login/);
assert.match(worker, /\/api\/admin\/auth\/me/);
assert.match(worker, /\/api\/admin\/setup/);
assert.match(worker, /GM_PROVISIONING_SUPERSEDED/, 'Player-to-GM promotion endpoint must be retired.');
assert.match(worker, /await requireRole\(request, env, 'admin'\)/, 'GM APIs must be protected by Admin role.');
assert.match(worker, /await requireRole\(request, env, 'player'\)/, 'Player APIs must remain Player-only.');
assert.match(worker, /new URL\('\/gm\/login\/'/, 'Unauthenticated GM access must go to Admin login.');
assert.match(worker, /new URL\('\/gm\/setup\/'/, 'Legacy Admin sessions must be routed to credential reset setup.');

assert.match(loginHtml, /Admin Access/);
assert.match(loginHtml, /Admin Username/);
assert.match(loginHtml, /Admin Password/);
assert.doesNotMatch(loginHtml, /name=["']key["']/i, 'Admin login form must not contain a Player Key field.');
assert.doesNotMatch(loginHtml, /inputmode=["']numeric["']/i, 'Admin login form must not expose a numeric Player-Key input.');
assert.match(loginJs, /\/api\/admin\/auth\/login/);

assert.match(setupHtml, /建立第一個 Admin/);
assert.match(setupHtml, /唔需要 Player User/);
assert.match(setupHtml, /Admin Password/);
assert.match(setupJs, /\/api\/admin\/setup/);
assert.ok(!setupJs.includes('/api/admin/provision-initial-gm'), 'Setup must not use Player promotion.');

assert.match(canonical, /GM = Admin/);
assert.match(canonical, /Player.*Admin/s);
assert.match(canonical, /強密碼/);
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/admin-auth\.js"/);
