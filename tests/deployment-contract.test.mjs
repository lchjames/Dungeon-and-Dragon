import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');
const liveWorkflow = await readFile(new URL('../.github/workflows/production-alpha-live.yml', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const releaseDoc = await readFile(new URL('../docs/PRODUCTION_RELEASE_ALPHA.md', import.meta.url), 'utf8');
const adminGateway = await readFile(new URL('../src/admin-gateway.js', import.meta.url), 'utf8');
const auditCompatGateway = await readFile(new URL('../src/player-monster-audit-compat.js', import.meta.url), 'utf8');
const worldMap = await readFile(new URL('../src/world-map.js', import.meta.url), 'utf8');
const runtimeVisibilityGateway = await readFile(new URL('../src/runtime-visibility-gateway.js', import.meta.url), 'utf8');

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

// Automatic main deployment must remain read-only with respect to gameplay data.
// Production-writing Alpha execution is operator-triggered only.
assert.doesNotMatch(workflow, /DND_ALPHA_GM_PASSWORD/);
assert.doesNotMatch(workflow, /DND_ALPHA_EXECUTE:\s*'1'/);
assert.doesNotMatch(workflow, /cleanup-stale-alpha-combat\.mjs/);
assert.doesNotMatch(workflow, /Temporary production Alpha diagnostic probe/);
assert.match(liveWorkflow, /workflow_dispatch:/);
assert.match(liveWorkflow, /Checkout current main/);
assert.match(liveWorkflow, /ref:\s*main/);
assert.match(liveWorkflow, /secrets\.DND_ALPHA_GM_PASSWORD/);
assert.match(liveWorkflow, /DND_ALPHA_EXECUTE:\s*'1'/);
assert.match(liveWorkflow, /cleanup-stale-alpha-combat\.mjs/);
assert.match(liveWorkflow, /production-alpha-e2e\.mjs/);
assert.doesNotMatch(liveWorkflow, /\npush:/, 'Production-writing Alpha workflow must not run on push.');
assert.doesNotMatch(liveWorkflow, /\npull_request:/, 'Production-writing Alpha workflow must not run on pull requests.');

assert.match(wrangler, /"name"\s*:\s*"dnd"/);
assert.match(
  wrangler,
  /^\s*"main"\s*:\s*"\.\/src\/runtime-visibility-gateway\.js"\s*,?\s*$/m,
  'Deployment contract must validate the actual Wrangler main property, not a historical gateway marker inside a comment.'
);
assert.match(wrangler, /"binding"\s*:\s*"DB"/);
assert.match(wrangler, /"database_name"\s*:\s*"dnd-db"/);
assert.match(wrangler, /"database_id"\s*:\s*"7a9abf7b-5f87-4295-89b1-8187e991b782"/);
assert.match(wrangler, /"pattern"\s*:\s*"dungeon-and-dragon\.lchjames\.com"/);
assert.doesNotMatch(wrangler, /live-diagnostic-gateway/, 'Temporary live diagnostic gateway must stay out of the deployment chain.');

assert.match(runtimeVisibilityGateway, /import baseWorker from '\.\/hostile-combat-movement-gateway\.js'/);
assert.match(runtimeVisibilityGateway, /runtime_entity_visibility_overrides/);
assert.match(runtimeVisibilityGateway, /runtimeTokenVisible/);
assert.ok(runtimeVisibilityGateway.includes('visibility\\/([^/]+)$'), 'Visibility gateway must expose the per-viewer route segment.');
assert.doesNotMatch(runtimeVisibilityGateway, /eval\s*\(/, 'Visibility gateway must not execute arbitrary code.');

assert.match(adminGateway, /from 'node:crypto'/);
assert.match(adminGateway, /pbkdf2\(/);
assert.match(adminGateway, /ALPHA_GM_USERNAME\s*=\s*'gm'/);
assert.match(adminGateway, /return username === ALPHA_GM_USERNAME \|\| \/\^\[a-z0-9\._-\]\{3,32\}\$\//, 'The fixed two-character Alpha GM username must bypass only the normal 3-character minimum.');
assert.match(adminGateway, /username === ALPHA_GM_USERNAME \? ALPHA_GM_MIN_PASSWORD_LENGTH : DEFAULT_MIN_PASSWORD_LENGTH/);
assert.match(adminGateway, /const iterations = Number\(user\.password_iterations \|\| 0\)/);
assert.match(adminGateway, /iterations < 100000/, 'Persisted Alpha credential remains subject to the current minimum compatible iteration floor.');
assert.match(adminGateway, /ADMIN_AUTH_PBKDF2_RUNTIME_ERROR/);
assert.match(adminGateway, /pathname !== '\/api\/admin\/auth\/login'/);
assert.match(adminGateway, /adminGateway\.fetch\(request, env\)/);
assert.match(adminGateway, /ADMIN_AUTH_RUNTIME_ERROR/);

// The verified Alpha credential now lives only in production D1. Runtime source
// must never recreate or overwrite that Admin row with deterministic seed material.
for (const forbidden of [
  /ensureAlphaGmOperatorSeed/,
  /ALPHA_GM_INTERNAL_USERNAME/,
  /ALPHA_GM_PASSWORD_HASH/,
  /ALPHA_GM_PASSWORD_SALT/,
  /ALPHA_GM_PASSWORD_ITERATIONS/,
  /admin_alpha_gm/,
  /ON CONFLICT\(username\) DO UPDATE SET/
]) {
  assert.doesNotMatch(adminGateway, forbidden, `Temporary Alpha GM runtime seed material must stay removed: ${forbidden}`);
}

// Production D1 is long-lived: CREATE TABLE IF NOT EXISTS cannot upgrade an older
// player_monster_action_log definition. The permanent compatibility boundary must
// inspect the existing columns and add only missing audit fields before Player attacks.
assert.match(auditCompatGateway, /ensurePlayerMonsterAuditCompatibility/);
assert.match(auditCompatGateway, /PRAGMA table_info\(\$\{table\}\)/);
assert.match(auditCompatGateway, /ALTER TABLE player_monster_action_log ADD COLUMN \$\{column\} \$\{definition\}/);
assert.match(auditCompatGateway, /AUDIT_COLUMN_DEFINITIONS/);
assert.match(auditCompatGateway, /isPlayerAttack/);
for (const column of [
  'target_monster_instance_id',
  'monster_stored_defence',
  'monster_defence_modifier',
  'monster_modified_defence',
  'monster_effective_defence',
  'monster_final_armor_defence',
  'monster_status_after'
]) {
  assert.match(auditCompatGateway, new RegExp(`${column}:`), `Compatibility migration must define ${column}.`);
}
assert.match(auditCompatGateway, /MONSTER_DEFEAT_AUDIT_SCHEMA_MIGRATION_ERROR/);
assert.doesNotMatch(auditCompatGateway, /DROP TABLE player_monster_action_log/, 'Audit compatibility migration must never drop production audit data.');
assert.doesNotMatch(auditCompatGateway, /DELETE FROM player_monster_action_log/, 'Audit compatibility migration must never delete production audit rows.');
assert.doesNotMatch(auditCompatGateway, /MONSTER_DEFEAT_DIAG_/, 'Temporary Monster defeat live diagnostic codes must stay removed.');
assert.doesNotMatch(auditCompatGateway, /diagnoseMonsterAttackFailure/, 'Compatibility boundary must not retain the one-off production failure probe.');
assert.match(worldMap, /import baseWorker from '\.\/player-monster-audit-compat\.js'/);
assert.doesNotMatch(worldMap, /live-diagnostic-gateway/, 'World Map chain must not retain the temporary diagnostic gateway.');

assert.match(releaseDoc, /Do \*\*not\*\* blindly execute every file under `schema\/`/);
assert.match(releaseDoc, /Pull requests and feature-branch pushes must never deploy production/);
assert.match(releaseDoc, /Cloudflare challenge/);
assert.match(releaseDoc, /workers\.dev/);
