import assert from 'node:assert/strict';
import {
  BASIC_SKILLS,
  calculatePlayerResources,
  expThresholdForLevel,
  levelFromExp,
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

const allocation = validateCreationSkillAllocations({ perception: 30, dodge: 10 });
assert.deepEqual({ spent: allocation.spent, remaining: allocation.remaining }, { spent: 40, remaining: 160 });
assert.throws(() => validateCreationSkillAllocations({ dodge: 31 }));
assert.throws(() => validateCreationSkillAllocations({ unknown: 1 }));
