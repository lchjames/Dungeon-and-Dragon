import assert from 'node:assert/strict';
import {
  NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES,
  ORIGINAL_TARGET_RESOLUTIONS,
  clampOpposedNarrativeGap,
  resolveNonDamageEffectSettlement
} from '../src/non-damage-effect-settlement-rules.js';

assert.equal(clampOpposedNarrativeGap(99), 20);
assert.equal(clampOpposedNarrativeGap(-99), -20);
assert.equal(clampOpposedNarrativeGap(7), 7);

const ordinaryWin = resolveNonDamageEffectSettlement({
  sourceRawRoll: 50, resistanceRawRoll: 40, sourceResultValue: 12, resistanceResultValue: 3
});
assert.equal(ordinaryWin.outcome, NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_APPLIES_NORMAL);
assert.equal(ordinaryWin.originalTargetResolution, ORIGINAL_TARGET_RESOLUTIONS.APPLIES);
assert.equal(ordinaryWin.primaryEffectMultiplier, 1);

const ordinaryTie = resolveNonDamageEffectSettlement({
  sourceRawRoll: 50, resistanceRawRoll: 40, sourceResultValue: 5, resistanceResultValue: 5
});
assert.equal(ordinaryTie.outcome, NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_BLOCKED);
assert.equal(ordinaryTie.resistancePriorityOnTie, true);

const sourceGreat = resolveNonDamageEffectSettlement({
  sourceRawRoll: 100, resistanceRawRoll: 20, sourceResultValue: 30, resistanceResultValue: 1
});
assert.equal(sourceGreat.outcome, NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_APPLIES_DOUBLE_PRIMARY);
assert.equal(sourceGreat.primaryEffectMultiplier, 2);
assert.equal(sourceGreat.sourceGreatSuccessApplied, true);

const sourceGreatBlocked = resolveNonDamageEffectSettlement({
  sourceRawRoll: 100, resistanceRawRoll: 100, sourceResultValue: 3, resistanceResultValue: 4
});
assert.equal(sourceGreatBlocked.outcome, NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_BLOCKED);
assert.equal(sourceGreatBlocked.sourceGreatSuccessApplied, false);
assert.equal(sourceGreatBlocked.defenseGreatSuccess, true);

const sourceFailure = resolveNonDamageEffectSettlement({
  sourceRawRoll: 1, resistanceRawRoll: 50, sourceResultValue: 99, resistanceResultValue: 1
});
assert.equal(sourceFailure.outcome, NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.SOURCE_DEVIATION_REQUIRED);
assert.equal(sourceFailure.originalTargetResolution, ORIGINAL_TARGET_RESOLUTIONS.GM_DECISION_REQUIRED);
assert.equal(sourceFailure.gmResolutionRequired, true);

const defenseFailureStillBlocks = resolveNonDamageEffectSettlement({
  sourceRawRoll: 50, resistanceRawRoll: 1, sourceResultValue: 1, resistanceResultValue: 2
});
assert.equal(defenseFailureStillBlocks.outcome, NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_BLOCKED);
assert.equal(defenseFailureStillBlocks.defenseGreatFailure, true);
assert.equal(defenseFailureStillBlocks.primaryEffectMultiplier, 1);

const doubleFailure = resolveNonDamageEffectSettlement({
  sourceRawRoll: 1, resistanceRawRoll: 1, sourceResultValue: -50, resistanceResultValue: 80
});
assert.equal(doubleFailure.outcome, NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.DOUBLE_FAILURE_ACCIDENTAL_SUCCESS);
assert.equal(doubleFailure.originalTargetResolution, ORIGINAL_TARGET_RESOLUTIONS.APPLIES);
assert.equal(doubleFailure.primaryEffectMultiplier, 1);
assert.equal(doubleFailure.doubleFailureOverride, true);
assert.equal(doubleFailure.gmResolutionRequired, false);

const doubleGreatTie = resolveNonDamageEffectSettlement({
  sourceRawRoll: 100, resistanceRawRoll: 100, sourceResultValue: 10, resistanceResultValue: 10
});
assert.equal(doubleGreatTie.outcome, NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_BLOCKED);
assert.equal(doubleGreatTie.defenseGreatSuccess, true);
assert.equal(doubleGreatTie.primaryEffectMultiplier, 1);

assert.throws(() => resolveNonDamageEffectSettlement({
  sourceRawRoll: 0, resistanceRawRoll: 50, sourceResultValue: 1, resistanceResultValue: 0
}), /1 to 100/);

console.log('Non-damage Effect Settlement rules passed.');
