import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');
const liveWorkflow = await readFile(new URL('../.github/workflows/production-alpha-live.yml', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const releaseDoc = await readFile(new URL('../docs/PRODUCTION_RELEASE_ALPHA.md', import.meta.url), 'utf8');
const adminGateway = await readFile(new URL('../src/admin-gateway.js', import.meta.url), 'utf8');
const liveDiagnosticGateway = await readFile(new URL('../src/live-diagnostic-gateway.js', import.meta.url), 'utf8');

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
  /^\s*"main"\s*:\s*"\.\/src\/hostile-combat-movement-gateway\.js"\s*,?\s*$/m,
  'Deployment contract must validate the actual Wrangler main property, not a historical gateway marker inside a comment.'
);
assert.match(wrangler, /"binding"\s*:\s*"DB"/);
assert.match(wrangler, /"database_name"\s*:\s*"dnd-db"/);
assert.match(wrangler, /"database_id"\s*:\s*"7a9abf7b-5f87-4295-89b1-8187e991b782"/);
assert.match(wrangler, /"pattern"\s*:\s*"dungeon-and-dragon\.lchjames\.com"/);

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
// player_monster_action_log definition. The outer compatibility gateway must
// inspect the existing columns and add only the missing audit fields before an attack.
assert.match(liveDiagnosticGateway, /ensurePlayerMonsterAuditCompatibility/);
assert.match(liveDiagnosticGateway, /PRAGMA table_info\(\$\{table\}\)/);
assert.match(liveDiagnosticGateway, /ALTER TABLE player_monster_action_log ADD COLUMN \$\{column\} \$\{definition\}/);
assert.match(liveDiagnosticGateway, /AUDIT_COLUMN_DEFINITIONS/);
for (const column of [
  'target_monster_instance_id',
  'monster_stored_defence',
  'monster_defence_modifier',
  'monster_modified_defence',
  'monster_effective_defence',
  'monster_final_armor_defence',
  'monster_status_after'
]) {
  assert.match(liveDiagnosticGateway, new RegExp(`${column}:`), `Compatibility migration must define ${column}.`);
}
assert.match(liveDiagnosticGateway, /MONSTER_DEFEAT_AUDIT_SCHEMA_MIGRATION_ERROR/);
assert.doesNotMatch(liveDiagnosticGateway, /DROP TABLE player_monster_action_log/, 'Audit compatibility migration must never drop production audit data.');
assert.doesNotMatch(liveDiagnosticGateway, /DELETE FROM player_monster_action_log/, 'Audit compatibility migration must never delete production audit rows.');

// The temporary production diagnostic must narrow unexpected Player→Monster 500s
// without exposing column names or raw SQL to the client. It distinguishes schema/query
// failures from failures before and after the Action reservation boundary.
for (const marker of [
  'EXPECTED_MONSTER_COLUMNS',
  'EXPECTED_COMBATANT_COLUMNS',
  'EXPECTED_COMBAT_COLUMNS',
  'EXPECTED_PROFILE_COLUMNS',
  'EXPECTED_ATTRIBUTE_COLUMNS',
  'MONSTER_DEFEAT_DIAG_MONSTER_SCHEMA_DRIFT',
  'MONSTER_DEFEAT_DIAG_COMBATANT_SCHEMA_DRIFT',
  'MONSTER_DEFEAT_DIAG_PROFILE_SCHEMA_DRIFT',
  'MONSTER_DEFEAT_DIAG_ATTRIBUTE_SCHEMA_DRIFT',
  'MONSTER_DEFEAT_DIAG_PROFILE_LOOKUP_FAILED',
  'MONSTER_DEFEAT_DIAG_ATTRIBUTE_LOOKUP_FAILED',
  'MONSTER_DEFEAT_DIAG_POST_RESERVATION_FAILURE',
  'MONSTER_DEFEAT_DIAG_PRE_RESERVATION_FAILURE'
]) {
  assert.match(liveDiagnosticGateway, new RegExp(marker), `Live diagnostic must retain ${marker}.`);
}
assert.match(liveDiagnosticGateway, /const profileId = String\(body\?\.profileId/);
assert.match(liveDiagnosticGateway, /actionReserved = !Boolean\(actor\.action_available\)/);

assert.match(releaseDoc, /Do \*\*not\*\* blindly execute every file under `schema\/`/);
assert.match(releaseDoc, /Pull requests and feature-branch pushes must never deploy production/);
assert.match(releaseDoc, /Cloudflare challenge/);
assert.match(releaseDoc, /workers\.dev/);
