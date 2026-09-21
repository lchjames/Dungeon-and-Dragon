import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BASIC_SKILL_EXTREMES, resolveBasicSkillD100 } from '../src/basic-skill-check-rules.js';

const authority = await readFile(new URL('../src/basic-skill-check-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/basic-skill-check-gateway.js', import.meta.url), 'utf8');
const opposedGateway = await readFile(new URL('../src/opposed-d100-gateway.js', import.meta.url), 'utf8');
const statusEffectGateway = await readFile(new URL('../src/status-effect-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0036_basic_skill_d100_check_authority.sql', import.meta.url), 'utf8');
const inventoryGateway = await readFile(new URL('../src/inventory-weapon-gateway.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-basic-skill-checks.js', import.meta.url), 'utf8');
const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-basic-skill-d100-check-e2e.mjs', import.meta.url), 'utf8');
const aggregateRunner = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/BASIC_SKILL_D100_CHECK_AUTHORITY_ALPHA.md', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');

// Canonical D100 formula and >0 success boundary.
assert.deepEqual(resolveBasicSkillD100({ naturalSkillValue: 70, totalModifier: 0, rawRoll: 31 }), {
  naturalSkillValue: 70,
  totalModifier: 0,
  effectiveSkillValue: 70,
  rawRoll: 31,
  resultValue: 1,
  passed: true,
  extremeResult: BASIC_SKILL_EXTREMES.NONE,
  greatSuccessGrowthEligible: false
});
assert.equal(resolveBasicSkillD100({ naturalSkillValue: 70, totalModifier: 0, rawRoll: 30 }).passed, false);
assert.equal(resolveBasicSkillD100({ naturalSkillValue: 70, totalModifier: 5, rawRoll: 26 }).resultValue, 1);
assert.throws(() => resolveBasicSkillD100({ naturalSkillValue: 99, totalModifier: 0, rawRoll: 50 }), /0 to 98/);

// Raw extremes are markers independent from the ordinary numeric result path.
const great = resolveBasicSkillD100({ naturalSkillValue: 0, totalModifier: -100, rawRoll: 100 });
assert.equal(great.extremeResult, BASIC_SKILL_EXTREMES.GREAT_SUCCESS);
assert.equal(great.greatSuccessGrowthEligible, true);
assert.equal(great.passed, false);
const fumble = resolveBasicSkillD100({ naturalSkillValue: 98, totalModifier: 100, rawRoll: 1 });
assert.equal(fumble.extremeResult, BASIC_SKILL_EXTREMES.GREAT_FAILURE);
assert.equal(fumble.passed, true);

// D1 audit + pending growth eligibility authority.
for (const token of [
  'character_skill_check_log',
  'character_skill_growth_eligibility_log',
  'PENDING_BALANCE',
  'meaningful_reason',
  'roll_source',
  'growth_progress_before',
  'skill_value_before'
]) {
  assert.match(authority, new RegExp(token));
  assert.match(migration, new RegExp(token));
}
assert.match(authority, /rollDie\(100\)/);
assert.match(authority, /CANONICAL_SKILL_KEYS/);
assert.match(authority, /growth_progress_after, skill_value_before, skill_value_after/);
assert.match(authority, /VALUES \(\?, \?, \?, \?, \?, 'PENDING_BALANCE', \?, NULL, \?, NULL, \?\)/);
assert.doesNotMatch(authority, /UPDATE\s+character_skills/i, 'This slice must not settle growth or mutate Skill values.');
assert.match(migration, /trg_character_skill_check_log_no_update/);
assert.match(migration, /trg_character_skill_check_log_no_delete/);
assert.match(migration, /trg_character_skill_growth_eligibility_no_update/);
assert.match(migration, /trg_character_skill_growth_eligibility_no_delete/);

// GM writes, Player history is strictly read-only and redacts GM-only provenance.
assert.match(gateway, /\/api\\\/gm\\\/characters/);
assert.match(gateway, /\/api\\\/player\\\/characters/);
assert.match(gateway, /Player Basic Skill Check history is read-only/);
assert.match(gateway, /checks\.map\(playerCheckView\)/);
assert.doesNotMatch(gateway.match(/function playerCheckView[\s\S]*?\n\}/)?.[0] || '', /context|actorUserId/);
assert.match(gateway, /CHARACTER_LOCKED_DEAD/);
assert.doesNotMatch(gateway, /CHARACTER_NOT_ACTIVE/);

// Keep the mature top-level Inventory gateway; compose Opposed D100 downstream without replacing Basic Skill authority.
assert.match(inventoryGateway, /^import baseWorker from '\.\/basic-skill-check-gateway\.js';/);
assert.match(gateway, /^import baseWorker from '\.\/opposed-d100-gateway\.js';/);
assert.match(opposedGateway, /^import baseWorker from '\.\/currency-exchange-gateway\.js';/);

// GM surface requires meaningful reason and makes pending growth semantics explicit.
assert.match(gmHtml, /gm-basic-skill-checks\.js/);
assert.match(gmUi, /Meaningful Reason/);
assert.match(gmUi, /blank = server roll/);
assert.match(gmUi, /PENDING_BALANCE/);
assert.match(gmUi, /does not add progress|does not add progress/i);
assert.match(gmUi, /Context JSON/);

// Production verification remains plan-only and is registered in the aggregate safety gate.
assert.match(runner, /mode: 'plan-only'/);
assert.match(runner, /writesProduction: false/);
assert.match(runner, /does not claim live Basic Skill mutation coverage/);
assert.match(aggregateRunner, /production-alpha-basic-skill-d100-check-e2e\.mjs/);
assert.match(aggregateRunner, /basic-skill-d100-check-authority/);

// Canonical doc and CI checkpoint lock the no-invented-growth boundary.
assert.match(doc, /不得.*UPDATE character_skills SET growth_progress/s);
assert.match(doc, /不新增.*Character status 必須等於 active/s);
assert.match(doc, /Player projection不回傳/);
assert.match(workflow, /basic-skill-d100-check-authority\.test\.mjs/);

console.log('Basic Skill D100 Check Authority contract passed.');
