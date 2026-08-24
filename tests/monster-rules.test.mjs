import assert from 'node:assert/strict';
import {
  buildMonsterAttributes,
  calculatedMonsterBaseDamage,
  effectiveMonsterAttribute,
  monsterCalculatedResources,
  monsterDamageAttributeBasis,
  monsterDamageGrowth,
  monsterEffectiveAccuracy,
  monsterGlobalGrowth,
  snapshotMonsterSkill,
  suggestedMonsterSpread
} from '../src/monster-rules.js';

assert.equal(monsterGlobalGrowth(1), 0);
assert.equal(effectiveMonsterAttribute(10, 1, 1), 10);
assert.equal(calculatedMonsterBaseDamage(10, 1, 1), 10);
assert.equal(Math.round(monsterDamageGrowth(100)), 7);
assert.equal(calculatedMonsterBaseDamage(10, 100, 1), 80);

assert.deepEqual(monsterCalculatedResources({ CON: 11, SIZ: 10, INT: 7 }), { maxHp: 11, maxMp: 21 });

assert.deepEqual(monsterDamageAttributeBasis({ STR: 20, DEX: 10 }, []), { links: [], values: {}, basis: 0 });
assert.equal(monsterDamageAttributeBasis({ STR: 20, DEX: 10 }, ['STR']).basis, 20);
assert.equal(monsterDamageAttributeBasis({ STR: 20, DEX: 10 }, ['STR', 'DEX']).basis, 15);

assert.deepEqual(suggestedMonsterSpread(1), { min: -2, max: 2 });
assert.deepEqual(suggestedMonsterSpread(100), { min: -5, max: 15 });

assert.deepEqual(monsterEffectiveAccuracy(130, -20), {
  storedAccuracy: 130,
  modifier: -20,
  modifiedAccuracy: 110,
  effectiveAccuracy: 100
});
assert.equal(monsterEffectiveAccuracy(130, -40).effectiveAccuracy, 90);

const deterministic = [
  0, // STR range -> min
  0, // DEX
  0, // CON
  0, // POW
  0, // INT
  0, // SIZ
  0, // elite roll -> 1, elite
  0  // elite bonus -> 1
];
let index = 0;
const generated = buildMonsterAttributes({
  ranges: Object.fromEntries(['STR', 'DEX', 'CON', 'POW', 'INT', 'SIZ'].map(key => [key, { min: 10, max: 10 }])),
  growthWeights: Object.fromEntries(['STR', 'DEX', 'CON', 'POW', 'INT', 'SIZ'].map(key => [key, 1])),
  level: 1,
  randomUint32: () => deterministic[index++] ?? 0
});
assert.equal(generated.isElite, true);
assert.equal(generated.eliteBonus, 1);
assert.equal(generated.natural.STR, 11);
assert.equal(generated.effective.STR, 11);

const snapshot = snapshotMonsterSkill({
  storedAccuracy: 80,
  templateBaseDamage: 10,
  damageGrowthWeight: 1,
  damageAttributeLinks: ['STR', 'DEX']
}, {
  level: 1,
  effectiveAttributes: { STR: 20, DEX: 10, CON: 1, POW: 1, INT: 1, SIZ: 1 }
});
assert.equal(snapshot.calculatedBaseDamage, 10);
assert.equal(snapshot.damageAttributeBasis, 15);
assert.equal(snapshot.calculatedDamageCenter, 25);
assert.equal(snapshot.finalSpreadMin, -2);
assert.equal(snapshot.finalSpreadMax, 2);
