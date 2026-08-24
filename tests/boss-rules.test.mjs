import assert from 'node:assert/strict';
import { calculateBossProfile, bossInstanceDefence, bossPhaseApplicability, validateBossPhases } from '../src/boss-rules.js';

const attrs = { STR: 10, DEX: 12, CON: 14, POW: 8, INT: 11, SIZ: 16 };
const weights = { STR: 1, DEX: 1, CON: 1, POW: 1, INT: 1, SIZ: 1 };

const baseline = calculateBossProfile({
  level: 1,
  naturalAttributes: attrs,
  growthWeights: weights,
  attributeOverrides: {},
  baselineStoredDefence: 65,
  baselineArmorName: 'Plate',
  baselineArmorDefence: 4
});
assert.deepEqual(baseline.calculatedAttributes, attrs);
assert.deepEqual(baseline.finalAttributes, attrs);
assert.equal(baseline.calculatedMaxHp, 15);
assert.equal(baseline.calculatedMaxMp, 33);
assert.equal(baseline.finalStoredDefence, 65);
assert.equal(baseline.finalArmor.defence, 4);

const overridden = calculateBossProfile({
  level: 1,
  naturalAttributes: attrs,
  growthWeights: weights,
  attributeOverrides: { STR: 30 },
  maxHpOverride: 420,
  maxMpOverride: 90,
  baselineStoredDefence: 65,
  storedDefenceOverride: 120,
  baselineArmorName: 'Plate',
  baselineArmorDefence: 4,
  armorNameOverride: 'Mythic Plate',
  armorDefenceOverride: 15
});
assert.equal(overridden.calculatedAttributes.STR, 10);
assert.equal(overridden.finalAttributes.STR, 30);
assert.equal(overridden.calculatedMaxHp, 15);
assert.equal(overridden.finalMaxHp, 420);
assert.equal(overridden.finalMaxMp, 90);
assert.equal(overridden.finalStoredDefence, 120);
assert.equal(overridden.finalArmor.name, 'Mythic Plate');
assert.equal(overridden.finalArmor.defence, 15);

assert.deepEqual(bossInstanceDefence(120, -30, 15, 2), {
  d100: { storedDefence: 120, modifier: -30, modifiedDefence: 90, effectiveDefence: 90 },
  armor: { baseDefence: 15, adjustment: 2, finalDefence: 17 }
});

const phases = validateBossPhases([
  { phaseNumber: 1, name: 'Opening' },
  { phaseNumber: 2, name: 'Enraged', hpThresholdPercent: 50 },
  { phaseNumber: 3, name: 'Last Stand', hpThresholdPercent: 20 }
]);
assert.equal(phases.length, 3);
assert.equal(phases[1].hpThresholdPercent, 50);

const phaseAt40 = bossPhaseApplicability({ currentHp: 40, maxHp: 100, currentPhaseNumber: 1, phases });
assert.equal(phaseAt40.applicablePhase.phaseNumber, 2);
const phaseAt60 = bossPhaseApplicability({ currentHp: 60, maxHp: 100, currentPhaseNumber: 1, phases });
assert.equal(phaseAt60.applicablePhase, null);
const phaseAt10 = bossPhaseApplicability({ currentHp: 10, maxHp: 100, currentPhaseNumber: 2, phases });
assert.equal(phaseAt10.applicablePhase.phaseNumber, 3);
