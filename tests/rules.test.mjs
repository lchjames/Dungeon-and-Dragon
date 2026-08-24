import assert from 'node:assert/strict';
import {
  BASIC_SKILLS,
  calculatePlayerResources,
  expThresholdForLevel,
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
assert.equal(reconcileResourceCurrentOnMaxChange(7, 10, 15), 12);
assert.equal(reconcileResourceCurrentOnMaxChange(7, 10, 6), 6);
assert.equal(reconcileResourceCurrentOnMaxChange(2, 10, 6), 2);

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
