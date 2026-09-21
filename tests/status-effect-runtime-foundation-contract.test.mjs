import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../src/status-effect-rules.js', import.meta.url), 'utf8');
const schema = await readFile(new URL('../src/status-effect-schema.js', import.meta.url), 'utf8');
const authority = await readFile(new URL('../src/status-effect-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/status-effect-gateway.js', import.meta.url), 'utf8');
const opposedGateway = await readFile(new URL('../src/opposed-d100-gateway.js', import.meta.url), 'utf8');
const currencyGateway = await readFile(new URL('../src/currency-exchange-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0038_status_effect_runtime_foundation.sql', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-status-effects.js', import.meta.url), 'utf8');
const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/STATUS_EFFECT_RUNTIME_FOUNDATION_ALPHA.md', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-status-effect-runtime-e2e.mjs', import.meta.url), 'utf8');
const aggregate = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');

for (const token of [
  'NO_STACK', 'REFRESH_DURATION', 'EXTEND_DURATION', 'ADD_STACKS', 'KEEP_STRONGER', 'TAKE_LATEST',
  'BODY', 'MIND', 'PERCEPTION', 'ENVIRONMENT', 'ROUNDS', 'PERMANENT'
]) assert.match(rules, new RegExp(token));
assert.match(rules, /incomingStrength > currentStrength/);
assert.match(rules, /remainingRounds: remaining - 1/);
assert.match(rules, /operation: 'EXPIRE'/);
assert.match(rules, /Permanent Status cannot use a time-refresh or time-extension stacking rule/);

for (const source of [schema, migration]) {
  for (const table of ['status_effect_definitions', 'status_effect_definition_revision_log', 'runtime_status_effects', 'runtime_status_effect_audit']) {
    assert.match(source, new RegExp(table));
  }
  assert.match(source, /idx_runtime_status_effects_active_stack/);
  assert.match(source, /WHERE status='ACTIVE'/);
  assert.match(source, /trg_status_effect_definition_revision_insert/);
  assert.match(source, /trg_status_effect_definition_revision_update/);
  assert.match(source, /trg_runtime_status_effect_audit_insert/);
  assert.match(source, /trg_runtime_status_effect_audit_update/);
  assert.match(source, /STATUS_EFFECT_DEFINITION_AUDIT_IMMUTABLE/);
  assert.match(source, /STATUS_EFFECT_RUNTIME_AUDIT_IMMUTABLE/);
  assert.match(source, /RUNTIME_STATUS_EFFECT_DELETE_FORBIDDEN/);
  assert.match(source, /STATUS_EFFECT_DEFINITION_DELETE_FORBIDDEN/);
}

assert.match(authority, /normalizeStatusEffectDefinition/);
assert.match(authority, /planStatusEffectApplication/);
assert.match(authority, /planStatusEffectRoundTick/);
assert.match(authority, /expectedVersion/);
assert.match(authority, /STATUS_EFFECT_DEFINITION_VERSION_CONFLICT/);
assert.match(authority, /effect_snapshot_json/);
assert.match(authority, /definition_version/);
assert.match(authority, /APPLY_BLOCKED/);
assert.match(rules, /REPLACE_STRONGER/);
assert.match(rules, /REPLACE_LATEST/);
assert.match(authority, /const action = plan\.operation/);
assert.match(authority, /status='EXPIRED'/);
assert.match(authority, /duration_type='ROUNDS'/);
assert.match(authority, /env\.DB\.batch\(statements\)/);
assert.doesNotMatch(authority, /UPDATE\s+character_resources/i, 'Status lifecycle foundation must not mutate HP/MP resources.');
assert.doesNotMatch(authority, /UPDATE\s+combat_participants/i, 'Status lifecycle foundation must not mutate Combat actions or combatants.');
assert.doesNotMatch(authority, /UPDATE\s+runtime_map_positions/i, 'Status lifecycle foundation must not move targets.');
assert.doesNotMatch(authority, /UPDATE\s+character_skills/i, 'Status lifecycle foundation must not mutate Basic Skill values.');

assert.match(gateway, /^import baseWorker from '\.\/currency-exchange-gateway\.js';/);
assert.match(gateway, /GM_ROLES/);
assert.match(gateway, /validOrigin/);
assert.match(gateway, /\/api\/gm\/status-effects\/definitions/);
assert.match(gateway, /tick-round/);
assert.match(gateway, /handleTickRound/);
assert.match(gateway, /instances/);
assert.match(gateway, /handleRemove/);
assert.doesNotMatch(gateway, /\/api\/player\//, 'No Player Status write surface is introduced.');

// Stable gateway composition: Basic Skill -> Opposed -> Status Effect -> Currency -> Ability.
assert.match(opposedGateway, /^import baseWorker from '\.\/status-effect-gateway\.js';/);
assert.match(gateway, /^import baseWorker from '\.\/currency-exchange-gateway\.js';/);
assert.match(currencyGateway, /^import baseWorker from '\.\/ability-gateway\.js';/);

assert.match(gmHtml, /gm-status-effects\.js/);
assert.match(gmUi, /Status Effect Runtime Foundation/);
assert.match(gmUi, /Advance Status Round/);
assert.match(gmUi, /不會自動造成傷害、治療、控制、Action \/ Move、MP/);
assert.match(gmUi, /\/api\/gm\/status-effects\/definitions/);
assert.match(gmUi, /status-effects\/tick-round/);
assert.match(gmUi, /data-status-remove/);

assert.match(doc, /not yet automatically wired into Combat round advancement/i);
assert.match(doc, /Advance Status Round changes counters only/i);
assert.match(doc, /does \*\*not\*\* decide or execute/i);
assert.match(doc, /DoT damage/);
assert.match(doc, /Ability cast \/ activation/);
assert.match(doc, /Status Runtime authority may mutate only its own Definition \/ Runtime \/ audit tables/);

assert.match(runner, /mode: 'plan-only'/);
assert.match(runner, /productionWrites: false/);
assert.match(runner, /intentionally plan-only/);
assert.match(aggregate, /production-alpha-status-effect-runtime-e2e\.mjs/);
assert.match(aggregate, /status-effect-runtime-foundation/);
assert.match(workflow, /status-effect-rules\.test\.mjs/);
assert.match(workflow, /status-effect-runtime-foundation-contract\.test\.mjs/);

console.log('Status Effect Runtime foundation contract passed.');
