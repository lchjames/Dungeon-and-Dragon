import assert from 'node:assert/strict';
import {
  characterDamageBonusProfile,
  dyingRoundsFromCon,
  resolveD100,
  resolveDamage,
  resolveOpposedD100
} from '../src/combat-rules.js';

const skill70 = resolveD100(31, 70, 0);
assert.equal(skill70.result, 1);
assert.equal(skill70.ordinarySuccess, true);
assert.equal(resolveD100(30, 70, 0).ordinarySuccess, false);
assert.equal(resolveD100(100, 0, 0).greatSuccess, true);
assert.equal(resolveD100(1, 98, 0).greatFailure, true);

const opposedWin = resolveOpposedD100(
  { roll: 80, skillValue: 60, modifier: 0 },
  { roll: 70, skillValue: 50, modifier: 0 }
);
assert.equal(opposedWin.sourceWins, true);
const opposedTie = resolveOpposedD100(
  { roll: 70, skillValue: 50, modifier: 0 },
  { roll: 70, skillValue: 50, modifier: 0 }
);
assert.equal(opposedTie.sourceWins, false);
assert.equal(opposedTie.tie, true);

assert.deepEqual(characterDamageBonusProfile(12, 13), { sign: 1, count: 1, sides: 4, label: '+1D4' });
assert.deepEqual(characterDamageBonusProfile(8, 9), { sign: 0, count: 0, sides: 0, label: '0' });

assert.deepEqual(
  resolveDamage({ damageDiceTotal: 6, fixedDamageModifier: 2, damageBonusTotal: 3, effectiveDefence: 7 }),
  { rawDamage: 11, effectiveDefence: 7, damageResult: 4, hpDamage: 4 }
);
assert.deepEqual(
  resolveDamage({ damageDiceTotal: 2, fixedDamageModifier: -3, damageBonusTotal: 0, effectiveDefence: 2 }),
  { rawDamage: -1, effectiveDefence: 2, damageResult: -3, hpDamage: 0 }
);

assert.equal(dyingRoundsFromCon(5), 1);
assert.equal(dyingRoundsFromCon(6), 2);
assert.equal(dyingRoundsFromCon(15), 3);
assert.equal(dyingRoundsFromCon(16), 4);
