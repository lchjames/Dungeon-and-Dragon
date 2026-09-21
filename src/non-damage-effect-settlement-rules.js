export const NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES = Object.freeze({
  EFFECT_BLOCKED: 'EFFECT_BLOCKED',
  EFFECT_APPLIES_NORMAL: 'EFFECT_APPLIES_NORMAL',
  EFFECT_APPLIES_DOUBLE_PRIMARY: 'EFFECT_APPLIES_DOUBLE_PRIMARY',
  SOURCE_DEVIATION_REQUIRED: 'SOURCE_DEVIATION_REQUIRED',
  DOUBLE_FAILURE_ACCIDENTAL_SUCCESS: 'DOUBLE_FAILURE_ACCIDENTAL_SUCCESS'
});

export const ORIGINAL_TARGET_RESOLUTIONS = Object.freeze({
  APPLIES: 'APPLIES',
  BLOCKED: 'BLOCKED',
  GM_DECISION_REQUIRED: 'GM_DECISION_REQUIRED'
});

function integer(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError(`${field} must be a safe integer.`);
  return number;
}

function rawRoll(value, field) {
  const number = integer(value, field);
  if (number < 1 || number > 100) throw new RangeError(`${field} must be from 1 to 100.`);
  return number;
}

export function clampOpposedNarrativeGap(value) {
  const gap = integer(value, 'Result gap');
  return Math.max(-20, Math.min(20, gap));
}

export function resolveNonDamageEffectSettlement(input = {}) {
  const sourceRawRoll = rawRoll(input.sourceRawRoll, 'Source raw roll');
  const resistanceRawRoll = rawRoll(input.resistanceRawRoll, 'Resistance raw roll');
  const sourceResultValue = integer(input.sourceResultValue, 'Source Result');
  const resistanceResultValue = integer(input.resistanceResultValue, 'Resistance Result');

  const resultGap = sourceResultValue - resistanceResultValue;
  const comparison = resultGap > 0 ? 'SOURCE_HIGHER' : (resultGap < 0 ? 'RESISTANCE_HIGHER' : 'TIE');
  const sourceStrictlyBreaksResistance = comparison === 'SOURCE_HIGHER';
  const resistancePriorityOnTie = comparison === 'TIE';

  const sourceGreatSuccess = sourceRawRoll === 100;
  const sourceGreatFailure = sourceRawRoll === 1;
  const defenseGreatSuccessRoll = resistanceRawRoll === 100;
  const defenseGreatFailure = resistanceRawRoll === 1;
  const doubleFailureOverride = sourceGreatFailure && defenseGreatFailure;

  let outcome;
  let originalTargetResolution;
  let primaryEffectMultiplier = 1;
  let gmResolutionRequired = false;

  if (doubleFailureOverride) {
    outcome = NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.DOUBLE_FAILURE_ACCIDENTAL_SUCCESS;
    originalTargetResolution = ORIGINAL_TARGET_RESOLUTIONS.APPLIES;
  } else if (sourceGreatFailure) {
    outcome = NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.SOURCE_DEVIATION_REQUIRED;
    originalTargetResolution = ORIGINAL_TARGET_RESOLUTIONS.GM_DECISION_REQUIRED;
    gmResolutionRequired = true;
  } else if (sourceStrictlyBreaksResistance) {
    if (sourceGreatSuccess) {
      outcome = NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_APPLIES_DOUBLE_PRIMARY;
      primaryEffectMultiplier = 2;
    } else {
      outcome = NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_APPLIES_NORMAL;
    }
    originalTargetResolution = ORIGINAL_TARGET_RESOLUTIONS.APPLIES;
  } else {
    outcome = NON_DAMAGE_EFFECT_SETTLEMENT_OUTCOMES.EFFECT_BLOCKED;
    originalTargetResolution = ORIGINAL_TARGET_RESOLUTIONS.BLOCKED;
  }

  const sourceGreatSuccessApplied = sourceGreatSuccess && originalTargetResolution === ORIGINAL_TARGET_RESOLUTIONS.APPLIES;
  const defenseGreatSuccess = defenseGreatSuccessRoll && !sourceStrictlyBreaksResistance && !doubleFailureOverride;

  return {
    comparison,
    sourceStrictlyBreaksResistance,
    resistancePriorityOnTie,
    sourceRawRoll,
    resistanceRawRoll,
    sourceResultValue,
    resistanceResultValue,
    resultGap,
    narrativeGap: clampOpposedNarrativeGap(resultGap),
    sourceGreatSuccess,
    sourceGreatSuccessApplied,
    sourceGreatFailure,
    defenseGreatSuccess,
    defenseGreatFailure,
    doubleFailureOverride,
    outcome,
    originalTargetResolution,
    primaryEffectMultiplier,
    gmResolutionRequired
  };
}
