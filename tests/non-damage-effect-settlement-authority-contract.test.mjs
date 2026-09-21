import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../src/non-damage-effect-settlement-rules.js', import.meta.url), 'utf8');
const schema = await readFile(new URL('../src/non-damage-effect-settlement-schema.js', import.meta.url), 'utf8');
const authority = await readFile(new URL('../src/non-damage-effect-settlement-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/non-damage-effect-settlement-gateway.js', import.meta.url), 'utf8');
const currencyGateway = await readFile(new URL('../src/currency-exchange-gateway.js', import.meta.url), 'utf8');
const abilityGateway = await readFile(new URL('../src/ability-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0039_non_damage_effect_settlement_authority.sql', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-non-damage-effect-settlements.js', import.meta.url), 'utf8');
const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/NON_DAMAGE_EFFECT_SETTLEMENT_AUTHORITY_ALPHA.md', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-non-damage-effect-settlement-e2e.mjs', import.meta.url), 'utf8');
const aggregate = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');

for (const token of [
  'EFFECT_BLOCKED',
  'EFFECT_APPLIES_NORMAL',
  'EFFECT_APPLIES_DOUBLE_PRIMARY',
  'SOURCE_DEVIATION_REQUIRED',
  'DOUBLE_FAILURE_ACCIDENTAL_SUCCESS',
  'GM_DECISION_REQUIRED'
]) assert.match(rules, new RegExp(token));

assert.match(rules, /sourceResultValue - resistanceResultValue/);
assert.match(rules, /Math\.max\(-20, Math\.min\(20, gap\)\)/);
assert.match(rules, /sourceRawRoll === 100/);
assert.match(rules, /sourceRawRoll === 1/);
assert.match(rules, /resistanceRawRoll === 100/);
assert.match(rules, /resistanceRawRoll === 1/);
assert.match(rules, /primaryEffectMultiplier = 2/);
assert.match(rules, /doubleFailureOverride/);

for (const source of [schema, migration]) {
  assert.match(source, /non_damage_effect_settlement_log/);
  assert.match(source, /opposed_check_id TEXT NOT NULL UNIQUE/);
  assert.match(source, /narrative_gap/);
  assert.match(source, /primary_effect_multiplier/);
  assert.match(source, /gm_resolution_required/);
  assert.match(source, /NON_DAMAGE_EFFECT_SETTLEMENT_IMMUTABLE/);
  assert.match(source, /trg_non_damage_effect_settlement_no_update/);
  assert.match(source, /trg_non_damage_effect_settlement_no_delete/);
}

assert.match(authority, /ensureOpposedD100Authority/);
assert.match(authority, /basic_skill_opposed_check_log/);
assert.match(authority, /character_skill_check_log/);
assert.match(authority, /resolveNonDamageEffectSettlement/);
assert.match(authority, /verifyOpposedAudit/);
assert.match(authority, /NON_DAMAGE_EFFECT_SETTLEMENT_AUDIT_MISMATCH/);
assert.match(authority, /NON_DAMAGE_EFFECT_SETTLEMENT_EXTREME_MISMATCH/);
assert.match(authority, /idempotent: true/);
assert.match(authority, /idempotent: false/);
assert.match(authority, /meaningfulReason/);

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
assert.match(gateway, /pathname !== '\/api\/gm\/non-damage-effect-settlements'/);
assert.match(gateway, /request\.method === 'GET'/);
assert.match(gateway, /request\.method !== 'POST'/);
assert.doesNotMatch(gateway, /\/api\/player\//);

assert.match(currencyGateway, /^import baseWorker from '\.\/non-damage-effect-settlement-gateway\.js';/);
assert.match(gateway, /^import baseWorker from '\.\/ability-gateway\.js';/);
assert.match(abilityGateway, /export default/);

assert.match(gmHtml, /gm-non-damage-effect-settlements\.js/);
assert.match(gmUi, /Non-damage Effect Settlement/);
assert.match(gmUi, /\/api\/gm\/non-damage-effect-settlements/);
assert.match(gmUi, /primaryEffectMultiplier/);
assert.match(gmUi, /gmResolutionRequired/);
assert.match(gmUi, /no Status\/effect has been applied/i);

assert.match(doc, /100 vs 100/i);
assert.match(doc, /1[- ]vs[- ]1/i);
assert.match(doc, /primary_effect_multiplier = 2/);
assert.match(doc, /GM_DECISION_REQUIRED/);
assert.match(doc, /MUST NOT.*runtime_status_effects/is);
assert.match(doc, /Approved Settlement[\s\S]*Runtime Status application adapter/);

assert.match(runner, /mode: 'plan-only'/);
assert.match(runner, /productionWrites: false/);
assert.match(runner, /intentionally plan-only/);
assert.match(aggregate, /production-alpha-non-damage-effect-settlement-e2e\.mjs/);
assert.match(aggregate, /non-damage-effect-settlement-authority/);
assert.match(workflow, /non-damage-effect-settlement-rules\.test\.mjs/);
assert.match(workflow, /non-damage-effect-settlement-authority-contract\.test\.mjs/);

console.log('Non-damage Effect Settlement Decision authority contract passed.');
