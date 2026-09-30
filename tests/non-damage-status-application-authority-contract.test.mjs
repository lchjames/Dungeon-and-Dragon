import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../src/non-damage-status-application-schema.js', import.meta.url), 'utf8');
const authority = await readFile(new URL('../src/non-damage-status-application-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/non-damage-status-application-gateway.js', import.meta.url), 'utf8');
const statusAuthority = await readFile(new URL('../src/status-effect-authority.js', import.meta.url), 'utf8');
const profileGateway = await readFile(new URL('../src/non-damage-status-profile-gateway.js', import.meta.url), 'utf8');
const abilityGateway = await readFile(new URL('../src/ability-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0041_non_damage_status_application_adapter.sql', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-non-damage-status-applications.js', import.meta.url), 'utf8');
const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/NON_DAMAGE_STATUS_APPLICATION_ADAPTER_ALPHA.md', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-non-damage-status-application-e2e.mjs', import.meta.url), 'utf8');
const aggregate = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');

for (const source of [schema, migration]) {
  assert.match(source, /non_damage_status_application_log/);
  assert.match(source, /non_damage_status_application_audit/);
  assert.match(source, /UNIQUE \(settlement_id, profile_id\)/);
  assert.match(source, /PENDING','APPLIED','BLOCKED/);
  assert.match(source, /NON_DAMAGE_STATUS_APPLICATION_IDENTITY_IMMUTABLE/);
  assert.match(source, /NON_DAMAGE_STATUS_APPLICATION_FINAL_IMMUTABLE/);
  assert.match(source, /NON_DAMAGE_STATUS_APPLICATION_DELETE_FORBIDDEN/);
  assert.match(source, /NON_DAMAGE_STATUS_APPLICATION_AUDIT_IMMUTABLE/);
}

assert.match(authority, /ensureNonDamageEffectSettlementAuthority/);
assert.match(authority, /ensureNonDamageStatusProfileAuthority/);
assert.match(authority, /ensureStatusEffectAuthority/);
assert.match(authority, /NON_DAMAGE_STATUS_APPLICATION_GM_DECISION_REQUIRED/);
assert.match(authority, /NON_DAMAGE_STATUS_APPLICATION_SETTLEMENT_BLOCKED/);
assert.match(authority, /original_target_resolution !== 'APPLIES'/);
assert.match(authority, /STATUS_DEFINITION_VERSION_STALE/);
assert.match(authority, /primary_effect_multiplier/);
assert.match(authority, /const appliedValue = baseValue \* multiplier/);
assert.match(authority, /applyPinnedStatusEffectToCharacter/);
assert.match(authority, /\[ND_STATUS_APP:\$\{application\.id\}\]/);
assert.match(authority, /lease_expires_at/);
assert.match(authority, /reconcileFromStatusAudit/);
assert.match(authority, /json_extract\(after_snapshot_json, '\$\.status'\)='ACTIVE'/);
assert.match(authority, /Meaningful application reason', true/);
assert.match(authority, /idempotent: true/);
assert.match(authority, /idempotent: false/);

assert.match(statusAuthority, /expectedDefinitionVersion/);
assert.match(statusAuthority, /STATUS_EFFECT_DEFINITION_VERSION_STALE/);
assert.match(statusAuthority, /primaryEffectMultiplier/);
assert.match(statusAuthority, /DURATION_ROUNDS/);
assert.match(statusAuthority, /STRENGTH_VALUE/);
assert.match(statusAuthority, /EFFECT_PROFILE_NUMERIC/);
assert.match(statusAuthority, /__approvedPrimaryOverride/);

for (const forbidden of [
  /INSERT\s+INTO\s+runtime_status_effects/i,
  /UPDATE\s+runtime_status_effects/i,
  /UPDATE\s+character_resources/i,
  /UPDATE\s+combat_participants/i,
  /UPDATE\s+runtime_map_positions/i,
  /UPDATE\s+character_skills/i
]) assert.doesNotMatch(authority, forbidden);

assert.match(gateway, /^import baseWorker from '\.\/ability-gateway\.js';/);
assert.match(gateway, /GM_ROLES/);
assert.match(gateway, /validOrigin/);
assert.match(gateway, /pathname !== '\/api\/gm\/non-damage-status-applications'/);
assert.match(gateway, /request\.method === 'GET'/);
assert.match(gateway, /request\.method !== 'POST'/);
assert.doesNotMatch(gateway, /\/api\/player\//);

assert.match(profileGateway, /^import baseWorker from '\.\/non-damage-status-application-gateway\.js';/);
assert.match(abilityGateway, /^import baseWorker from '\.\/story-script-gateway\.js';/);

assert.match(gmHtml, /gm-non-damage-status-applications\.js/);
assert.match(gmUi, /Non-damage Status Application Adapter/);
assert.match(gmUi, /originalTargetResolution === 'APPLIES'/);
assert.match(gmUi, /!s\.gmResolutionRequired/);
assert.match(gmUi, /\/api\/gm\/non-damage-status-applications/);
assert.match(gmUi, /does not apply damage|唔會套Status/i);

assert.match(doc, /BLOCKED[\s\S]*no application ledger row/i);
assert.match(doc, /GM_DECISION_REQUIRED/);
assert.match(doc, /Settlement \+ Profile pair/);
assert.match(doc, /applyPinnedStatusEffectToCharacter/);
assert.match(doc, /second stacking engine/i);
assert.match(doc, /plan-only/i);

assert.match(runner, /mode: 'plan-only'/);
assert.match(runner, /productionWrites: false/);
assert.match(runner, /intentionally plan-only/);
assert.match(aggregate, /production-alpha-non-damage-status-application-e2e\.mjs/);
assert.match(aggregate, /non-damage-status-application-adapter/);
assert.match(workflow, /non-damage-status-application-authority-contract\.test\.mjs/);

console.log('Non-damage Status Application adapter contract passed.');
