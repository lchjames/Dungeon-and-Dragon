import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../src/opposed-d100-rules.js', import.meta.url), 'utf8');
const authority = await readFile(new URL('../src/opposed-d100-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/opposed-d100-gateway.js', import.meta.url), 'utf8');
const basicGateway = await readFile(new URL('../src/basic-skill-check-gateway.js', import.meta.url), 'utf8');
const statusEffectGateway = await readFile(new URL('../src/status-effect-gateway.js', import.meta.url), 'utf8');
const currencyGateway = await readFile(new URL('../src/currency-exchange-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0037_shared_opposed_d100_authority.sql', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-opposed-d100-checks.js', import.meta.url), 'utf8');
const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/SHARED_OPPOSED_D100_AUTHORITY_ALPHA.md', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-shared-opposed-d100-e2e.mjs', import.meta.url), 'utf8');
const aggregate = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');

// One canonical resolver per side; raw extremes never replace Result comparison.
assert.match(rules, /resolveBasicSkillD100/);
assert.match(rules, /SOURCE_HIGHER/);
assert.match(rules, /RESISTANCE_HIGHER/);
assert.match(rules, /TIE/);
assert.match(rules, /sourceResolution\.resultValue > resistanceResolution\.resultValue/);
assert.match(rules, /sourceStrictlyBreaksResistance: comparison === OPPOSED_D100_COMPARISONS\.SOURCE_HIGHER/);
assert.match(rules, /resistancePriorityOnTie: comparison === OPPOSED_D100_COMPARISONS\.TIE/);

// D1 audit links two normal Basic Skill checks and remains immutable.
for (const token of [
  'basic_skill_opposed_check_log',
  'source_check_id',
  'resistance_check_id',
  'source_strictly_breaks_resistance',
  'resistance_priority_on_tie',
  'meaningful_reason'
]) {
  assert.match(authority, new RegExp(token));
  assert.match(migration, new RegExp(token));
}
assert.match(migration, /trg_basic_skill_opposed_check_log_no_update/);
assert.match(migration, /trg_basic_skill_opposed_check_log_no_delete/);
assert.match(authority, /env\.DB\.batch\(statements\)/);
assert.match(authority, /INSERT INTO character_skill_check_log/g);
assert.match(authority, /INSERT INTO character_skill_growth_eligibility_log/);
assert.match(authority, /sourceGrowthId/);
assert.match(authority, /resistanceGrowthId/);
assert.match(authority, /'PENDING_BALANCE'/);
assert.doesNotMatch(authority, /UPDATE\s+character_skills/i, 'Opposed D100 must not settle growth or mutate Skill values.');
assert.doesNotMatch(authority, /UPDATE\s+character_resources/i, 'Opposed D100 must not spend resources.');
assert.doesNotMatch(authority, /damage|hit_points|status_effect/i, 'Opposed authority must not apply downstream combat/effect consequences.');

// Character Basic Skills only; no invented Monster/NPC percentile-skill bridge.
assert.match(authority, /CANONICAL_SKILL_KEYS/);
assert.match(authority, /FROM character_skills WHERE character_id=\? AND key=\?/);
assert.doesNotMatch(authority, /monster_skills|boss_skills|npc_skills/i);

// GM-only HTTP write, same-origin and dual dead-Character protection.
assert.match(gateway, /GM_ROLES/);
assert.match(gateway, /pathname === '\/api\/gm\/basic-skill-opposed-checks'/);
assert.match(gateway, /request\.method === 'GET'/);
assert.match(gateway, /request\.method !== 'POST'/);
assert.match(gateway, /validOrigin/);
assert.match(gateway, /CHARACTER_LOCKED_DEAD/);
assert.match(gateway, /assertCharacterUnlocked\(env, sourceCharacter, 'Source'\)/);
assert.match(gateway, /assertCharacterUnlocked\(env, resistanceCharacter, 'Resistance'\)/);
assert.doesNotMatch(gateway, /\/api\/player\/.*opposed/i, 'No Player opposed-write or opposed-detail route is introduced.');

// Stable outer routing: Inventory -> Basic Skill -> Opposed -> Status Effect -> Currency.
assert.match(basicGateway, /^import baseWorker from '\.\/opposed-d100-gateway\.js';/);
assert.match(gateway, /^import baseWorker from '\.\/status-effect-gateway\.js';/);
assert.match(statusEffectGateway, /^import baseWorker from '\.\/currency-exchange-gateway\.js';/);
assert.match(currencyGateway, /export default/);

// GM UI resolves both sides in one request and warns that no effects are applied.
assert.match(gmHtml, /gm-opposed-d100-checks\.js/);
assert.match(gmUi, /Resolve Both Sides/);
assert.match(gmUi, /\/api\/gm\/basic-skill-opposed-checks/);
assert.match(gmUi, /sourceStrictlyBreaksResistance/);
assert.match(gmUi, /Resistance tie priority|resistance priority/i);
assert.match(gmUi, /does not apply damage, control, status, movement/i);
assert.match(gmUi, /\/api\/gm\/bootstrap/);

// Canonical documentation locks the current non-goals and independent raw-100 growth eligibility.
assert.match(doc, /raw 100.*still lose|raw 100.*lose/is);
assert.match(doc, /Each side is evaluated independently/);
assert.match(doc, /PENDING_BALANCE/);
assert.match(doc, /does not.*Damage/is);
assert.match(doc, /Monster \/ NPC.*waits/is);

// Production descriptor is explicitly plan-only and aggregate CI knows about it.
assert.match(runner, /mode: 'plan-only'/);
assert.match(runner, /productionWrites: false/);
assert.match(runner, /intentionally plan-only/);
assert.match(aggregate, /production-alpha-shared-opposed-d100-e2e\.mjs/);
assert.match(aggregate, /shared-opposed-d100-authority/);
assert.match(workflow, /shared-opposed-d100-authority-contract\.test\.mjs/);
assert.match(workflow, /opposed-d100-rules\.test\.mjs/);

console.log('Shared Opposed D100 authority contract passed.');
