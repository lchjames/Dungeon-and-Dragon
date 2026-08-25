import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const releaseDoc = await readFile(new URL('../docs/PRODUCTION_RELEASE_ALPHA.md', import.meta.url), 'utf8');
const adminGateway = await readFile(new URL('../src/admin-gateway.js', import.meta.url), 'utf8');

assert.match(workflow, /deploy-production:/);
assert.match(workflow, /needs:\s*node-checks/);
assert.match(workflow, /github\.event_name == 'push'/);
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
assert.match(workflow, /npx --yes wrangler@4 deploy/);
assert.match(workflow, /group:\s*cloudflare-production/);
assert.match(workflow, /cancel-in-progress:\s*false/);

assert.match(workflow, /Smoke test production routes/);
assert.match(workflow, /CUSTOM_DOMAIN="https:\/\/dungeon-and-dragon\.lchjames\.com"/);
assert.match(workflow, /WORKER_BASE="https:\/\/dnd\.apswsttss\.workers\.dev"/);
assert.match(workflow, /cf-mitigated:/);
assert.match(workflow, /edge_mitigation" == "challenge"/);
assert.match(workflow, /expect_2xx "\/"/);
assert.match(workflow, /expect_2xx "\/player\/login\/"/);
assert.match(workflow, /expect_2xx "\/gm\/login\/"/);
assert.match(workflow, /expect_redirect "\/player\/" "\/player\/login\/"/);
assert.match(workflow, /expect_redirect "\/gm\/" "\/gm\/login\/"/);
assert.match(workflow, /request_worker "\/api\/auth\/me"/);
assert.match(workflow, /request_worker "\/api\/admin\/auth\/me"/);
assert.match(workflow, /--retry 8/);

assert.match(wrangler, /"name"\s*:\s*"dnd"/);
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/admin-gateway\.js"/);
assert.match(wrangler, /"binding"\s*:\s*"DB"/);
assert.match(wrangler, /"database_name"\s*:\s*"dnd-db"/);
assert.match(wrangler, /"database_id"\s*:\s*"7a9abf7b-5f87-4295-89b1-8187e991b782"/);
assert.match(wrangler, /"pattern"\s*:\s*"dungeon-and-dragon\.lchjames\.com"/);

assert.match(adminGateway, /from 'node:crypto'/);
assert.match(adminGateway, /pbkdf2\(/);
assert.match(adminGateway, /ALPHA_GM_USERNAME\s*=\s*'gm'/);
assert.match(adminGateway, /return username === ALPHA_GM_USERNAME \|\| \/\^\[a-z0-9\._-\]\{3,32\}\$\//, 'The fixed two-character Alpha GM username must bypass only the normal 3-character minimum.');
assert.match(adminGateway, /username === ALPHA_GM_USERNAME \? ALPHA_GM_MIN_PASSWORD_LENGTH : DEFAULT_MIN_PASSWORD_LENGTH/);
assert.match(adminGateway, /ensureAlphaGmOperatorSeed/);
assert.match(adminGateway, /ALPHA_GM_PASSWORD_ITERATIONS\s*=\s*210000/);
assert.match(adminGateway, /ON CONFLICT\(username\) DO UPDATE SET/);
const seedConflictStart = adminGateway.indexOf('ON CONFLICT(username) DO UPDATE SET');
const seedConflictEnd = adminGateway.indexOf('`).bind(', seedConflictStart);
assert.ok(seedConflictStart >= 0 && seedConflictEnd > seedConflictStart, 'Temporary operator seed conflict clause must be inspectable.');
const seedConflictClause = adminGateway.slice(seedConflictStart, seedConflictEnd);
assert.doesNotMatch(seedConflictClause, /failed_attempts\s*=/, 'Temporary operator seed must preserve failed-attempt state.');
assert.doesNotMatch(seedConflictClause, /locked_until\s*=/, 'Temporary operator seed must preserve lockout expiry.');
assert.match(adminGateway, /pathname !== '\/api\/admin\/auth\/login'/);
assert.match(adminGateway, /adminGateway\.fetch\(request, env\)/);
assert.match(adminGateway, /ADMIN_AUTH_RUNTIME_ERROR/);

assert.match(releaseDoc, /Do \*\*not\*\* blindly execute every file under `schema\/`/);
assert.match(releaseDoc, /Pull requests and feature-branch pushes must never deploy production/);
assert.match(releaseDoc, /Cloudflare challenge/);
assert.match(releaseDoc, /workers\.dev/);
