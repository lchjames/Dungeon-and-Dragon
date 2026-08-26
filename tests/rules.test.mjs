import assert from 'node:assert/strict';
import {
  BASIC_SKILLS,
  buildCombatInitiative,
  calculatePlayerResources,
  expThresholdForLevel,
  focusMpRecovery,
  levelFromExp,
  reconcileResourceCurrentOnMaxChange,
  validateCreationSkillAllocations
} from '../src/rules.js';

assert.equal(BASIC_SKILLS.length, 23);
assert.equal(expThresholdForLevel(1), 1);
assert.equal(expThresholdForLevel(5), 1641);
assert.equal(expThresholdForLevel(10), 22661);
assert.equal(expThresholdForLevel(20), 280791);
assert.equal(expThresholdForLevel(100), 84233586);
assert.equal(levelFromExp(1), 1);
assert.equal(levelFromExp(1640), 4);
assert.equal(levelFromExp(1641), 5);
assert.equal(levelFromExp(999999999), 100);

const resources = calculatePlayerResources({ CON: 12, SIZ: 14, INT: 13 }, 1);
assert.deepEqual({ hp: resources.finalMaxHP, mp: resources.finalMaxMP }, { hp: 13, mp: 39 });
assert.equal(reconcileResourceCurrentOnMaxChange(5, 10, 15), 10);
assert.equal(reconcileResourceCurrentOnMaxChange(12, 15, 8), 8);
assert.equal(reconcileResourceCurrentOnMaxChange(4, 15, 8), 4);
assert.equal(focusMpRecovery(0), 0);
assert.equal(focusMpRecovery(39), 2);
assert.equal(focusMpRecovery(100), 5);
assert.equal(focusMpRecovery(641), 33);

const randomValues = [0, 0];
const initiative = buildCombatInitiative([
  { id: 'a', dex: 12 },
  { id: 'b', dex: 18 },
  { id: 'c', dex: 12 }
], () => randomValues.shift() ?? 0);
assert.equal(initiative[0].id, 'b');
assert.equal(initiative[0].initiativeOrder, 0);
assert.deepEqual(initiative.slice(1).map(item => item.id), ['c', 'a']);
assert.deepEqual(initiative.map(item => item.initiativeOrder), [0, 1, 2]);
assert.throws(() => buildCombatInitiative([{ id: 'a', dex: 10 }, { id: 'a', dex: 9 }]));
assert.throws(() => buildCombatInitiative([{ id: 'a', dex: 'not-a-number' }]));

const allocation = validateCreationSkillAllocations({ perception: 30, dodge: 10 });
assert.deepEqual({ spent: allocation.spent, remaining: allocation.remaining }, { spent: 40, remaining: 160 });
assert.throws(() => validateCreationSkillAllocations({ dodge: 31 }));
assert.throws(() => validateCreationSkillAllocations({ unknown: 1 }));

const completeAllocation = Object.fromEntries(BASIC_SKILLS.map(skill => [skill.key, 0]));
completeAllocation.perception = 30;
completeAllocation.dodge = 10;
const completeResult = validateCreationSkillAllocations(completeAllocation, { requireAllSkills: true });
assert.deepEqual({ spent: completeResult.spent, remaining: completeResult.remaining }, { spent: 40, remaining: 160 });
const missingAllocation = { ...completeAllocation };
delete missingAllocation.dodge;
assert.throws(() => validateCreationSkillAllocations(missingAllocation, { requireAllSkills: true }));

assert.throws(() => validateCreationSkillAllocations(completeAllocation, {
  requireAllSkills: true,
  requireFullSpend: true
}));

const fullSpendAllocation = Object.fromEntries(BASIC_SKILLS.map(skill => [skill.key, 0]));
for (let index = 0; index < 6; index += 1) fullSpendAllocation[BASIC_SKILLS[index].key] = 30;
fullSpendAllocation[BASIC_SKILLS[6].key] = 20;
const fullSpendResult = validateCreationSkillAllocations(fullSpendAllocation, {
  requireAllSkills: true,
  requireFullSpend: true
});
assert.deepEqual({ spent: fullSpendResult.spent, remaining: fullSpendResult.remaining }, { spent: 200, remaining: 0 });
