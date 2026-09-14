import { NATURAL_SKILL_CAP } from './rules.js';

export const BASIC_SKILL_EXTREMES = Object.freeze({
  GREAT_FAILURE: 'GREAT_FAILURE',
  NONE: 'NONE',
  GREAT_SUCCESS: 'GREAT_SUCCESS'
});

export function basicSkillRuleError(message, code = 'BASIC_SKILL_CHECK_INVALID') {
  return Object.assign(new Error(message), { status: 400, code });
}

function integer(value, field, min, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw basicSkillRuleError(`${field} must be an integer from ${min} to ${max}.`, 'BASIC_SKILL_CHECK_INVALID');
  }
  return number;
}

export function resolveBasicSkillD100({ naturalSkillValue, totalModifier = 0, rawRoll }) {
  const natural = integer(naturalSkillValue, 'Natural skill value', 0, NATURAL_SKILL_CAP);
  const modifier = integer(totalModifier, 'Total modifier', -10000, 10000);
  const roll = integer(rawRoll, 'Raw D100 roll', 1, 100);
  const effectiveSkillValue = natural + modifier;
  const resultValue = roll - (100 - effectiveSkillValue);
  const passed = resultValue > 0;
  const extremeResult = roll === 100
    ? BASIC_SKILL_EXTREMES.GREAT_SUCCESS
    : (roll === 1 ? BASIC_SKILL_EXTREMES.GREAT_FAILURE : BASIC_SKILL_EXTREMES.NONE);
  return {
    naturalSkillValue: natural,
    totalModifier: modifier,
    effectiveSkillValue,
    rawRoll: roll,
    resultValue,
    passed,
    extremeResult,
    greatSuccessGrowthEligible: extremeResult === BASIC_SKILL_EXTREMES.GREAT_SUCCESS
  };
}
