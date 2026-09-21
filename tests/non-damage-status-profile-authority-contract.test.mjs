import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../src/non-damage-status-profile-rules.js', import.meta.url), 'utf8');
const schema = await readFile(new URL('../src/non-damage-status-profile-schema.js', import.meta.url), 'utf8');
const authority = await readFile(new URL('../src/non-damage-status-profile-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/non-damage-status-profile-gateway.js', import.meta.url), 'utf8');
const settlementGateway = await readFile(new URL('../src/non-damage-effect-settlement-gateway.js', import.meta.url), 'utf8');
const abilityGateway = await readFile(new URL('../src/ability-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0040_non_damage_status_application_profile.sql', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-non-damage-status-profiles.js', import.meta.url), 'utf8');
const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/NON_DAMAGE_STATUS_APPLICATION_PROFILE_ALPHA.md', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-non-damage-status-profile-e2e.mjs', import.meta.url), 'utf8');
const aggregate = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');

for (const token of ['DURATION_ROUNDS','STRENGTH_VALUE','EFFECT_PROFILE_NUMERIC','ORIGINAL_TARGET','OPPOSED_D100','DOUBLE_PRIMARY_EFFECT','TARGET_DEVIATION']) {
  assert.match(rules, new RegExp(token));
  assert.match(migration, new RegExp(token));
}
assert.match(rules, /simple top-level JSON key/);
assert.match(rules, /STATUS_DEFINITION_VERSION_STALE/);

for (const source of [schema, migration]) {
  assert.match(source, /non_damage_status_application_profiles/);
  assert.match(source, /non_damage_status_application_profile_revision_log/);
  assert.match(source, /NON_DAMAGE_STATUS_PROFILE_AUDIT_IMMUTABLE/);
  assert.match(source, /NON_DAMAGE_STATUS_PROFILE_DELETE_FORBIDDEN/);
}

assert.match(authority, /ensureStatusEffectAuthority/);
assert.match(authority, /status_definition_version/);
assert.match(authority, /primary_effect_value/);
assert.match(authority, /expectedVersion/);
assert.match(authority, /STATUS_EFFECT_DEFINITION_INACTIVE/);
assert.match(authority, /inspectPrimaryEffect/);
assert.match(authority, /resolveProfileReadiness/);
assert.doesNotMatch(authority, /INSERT INTO runtime_status_effects/i);
assert.doesNotMatch(authority, /UPDATE runtime_status_effects/i);
assert.doesNotMatch(authority, /UPDATE character_resources/i);
assert.doesNotMatch(authority, /UPDATE character_skills/i);

assert.match(gateway, /\/api\/gm\/non-damage-status-profiles/);
assert.match(gateway, /GM_ROLES/);
assert.match(gateway, /validOrigin/);
assert.doesNotMatch(gateway, /\/api\/player\//);
assert.match(settlementGateway, /^import baseWorker from '\.\/non-damage-status-profile-gateway\.js';/);
assert.match(gateway, /^import baseWorker from '\.\/ability-gateway\.js';/);
assert.match(abilityGateway, /export default/);

assert.match(gmHtml, /gm-non-damage-status-profiles\.js/);
assert.match(gmUi, /Approve Profile/);
assert.match(gmUi, /Re-approve Current Definition/);
assert.match(gmUi, /STATUS_DEFINITION_VERSION_STALE|readiness/);
assert.match(gmUi, /今個slice唔會套用 Runtime Status/);

assert.match(doc, /does \*\*not\*\* apply a Runtime Status/i);
assert.match(doc, /Profile never silently follows|never silently follows/i);
assert.match(doc, /next safe adapter/i);
assert.match(doc, /idempotent by Settlement \+ Profile/i);

assert.match(runner, /mode: 'plan-only'/);
assert.match(runner, /productionWrites: false/);
assert.match(aggregate, /production-alpha-non-damage-status-profile-e2e\.mjs/);
assert.match(workflow, /non-damage-status-profile-rules\.test\.mjs/);
assert.match(workflow, /non-damage-status-profile-authority-contract\.test\.mjs/);

console.log('Non-damage Status Application Profile authority contract passed.');
