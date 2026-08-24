import { rollDie } from './rules.js';

export const MONSTER_ATTRIBUTE_KEYS = Object.freeze(['STR', 'DEX', 'CON', 'POW', 'INT', 'SIZ']);

export const MONSTER_SPREAD_TUNING = Object.freeze({
  level1: Object.freeze({ min: -2, max: 2 }),
  level100: Object.freeze({ min: -5, max: 15 })
});

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be numeric.`);
  return number;
}

export function validateMonsterLevel(level) {
  const value = Number(level);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new RangeError('Monster Level must be an integer from 1 to 100.');
  }
  return value;
}

export function monsterGlobalGrowth(level) {
  const value = validateMonsterLevel(level);
  return ((value - 1) / 21.7) ** 2;
}

export function effectiveMonsterAttribute(natural, level, growthWeight) {
  const base = finiteNumber(natural, 'Natural Attribute');
  const weight = finiteNumber(growthWeight, 'Attribute Growth Weight');
  return Math.round(base * (1 + monsterGlobalGrowth(level) * weight));
}

export function rollMonsterBaseAttributes(ranges, randomUint32) {
  const result = {};
  for (const key of MONSTER_ATTRIBUTE_KEYS) {
    const range = ranges?.[key] || {};
    const min = Number(range.min);
    const max = Number(range.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`${key} range requires integer min <= max.`);
    }
    result[key] = min + rollDie(max - min + 1, randomUint32) - 1;
  }
  return result;
}

export function rollMonsterElite(randomUint32) {
  const eliteRoll = rollDie(100, randomUint32);
  const isElite = eliteRoll <= 10;
  const eliteBonus = isElite ? rollDie(5, randomUint32) : 0;
  return { eliteRoll, isElite, eliteBonus };
}

export function buildMonsterAttributes({ ranges, growthWeights, level, randomUint32 }) {
  const monsterLevel = validateMonsterLevel(level);
  const baseRolls = rollMonsterBaseAttributes(ranges, randomUint32);
  const elite = rollMonsterElite(randomUint32);
  const natural = {};
  const effective = {};

  for (const key of MONSTER_ATTRIBUTE_KEYS) {
    const weight = finiteNumber(growthWeights?.[key], `${key} Growth Weight`);
    natural[key] = baseRolls[key] + elite.eliteBonus;
    effective[key] = effectiveMonsterAttribute(natural[key], monsterLevel, weight);
  }

  return { level: monsterLevel, baseRolls, ...elite, natural, effective };
}

export function monsterCalculatedResources(effectiveAttributes) {
  const con = finiteNumber(effectiveAttributes?.CON, 'Effective CON');
  const siz = finiteNumber(effectiveAttributes?.SIZ, 'Effective SIZ');
  const int = finiteNumber(effectiveAttributes?.INT, 'Effective INT');
  return {
    maxHp: Math.ceil((con + siz) / 2),
    maxMp: int * 3
  };
}

export function monsterDamageGrowth(level) {
  const value = validateMonsterLevel(level);
  return 7 * (((value - 1) / 99) ** 1.5);
}

export function calculatedMonsterBaseDamage(templateBaseDamage, level, damageGrowthWeight) {
  const base = finiteNumber(templateBaseDamage, 'Template Base Damage');
  const weight = finiteNumber(damageGrowthWeight, 'Damage Growth Weight');
  return Math.round(base * (1 + monsterDamageGrowth(level) * weight));
}

export function monsterDamageAttributeBasis(effectiveAttributes, links = []) {
  const unique = [...new Set((Array.isArray(links) ? links : []).map(value => String(value || '').toUpperCase()))]
    .filter(key => MONSTER_ATTRIBUTE_KEYS.includes(key));
  if (!unique.length) return { links: [], values: {}, basis: 0 };

  const values = {};
  let total = 0;
  for (const key of unique) {
    const value = finiteNumber(effectiveAttributes?.[key], `Effective ${key}`);
    values[key] = value;
    total += value;
  }
  return { links: unique, values, basis: total / unique.length };
}

export function suggestedMonsterSpread(level) {
  const value = validateMonsterLevel(level);
  const t = (value - 1) / 99;
  const min = Math.round(MONSTER_SPREAD_TUNING.level1.min
    + (MONSTER_SPREAD_TUNING.level100.min - MONSTER_SPREAD_TUNING.level1.min) * t);
  const max = Math.round(MONSTER_SPREAD_TUNING.level1.max
    + (MONSTER_SPREAD_TUNING.level100.max - MONSTER_SPREAD_TUNING.level1.max) * t);
  return { min, max };
}

export function validateSpreadRange(minValue, maxValue) {
  const min = Number(minValue);
  const max = Number(maxValue);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError('Monster Spread requires integer Final Min <= Final Max.');
  }
  return { min, max };
}

export function rollSignedSpread(minValue, maxValue, randomUint32) {
  const { min, max } = validateSpreadRange(minValue, maxValue);
  return min + rollDie(max - min + 1, randomUint32) - 1;
}

export function snapshotMonsterSkill(skill, instance) {
  const level = validateMonsterLevel(instance?.level);
  const links = Array.isArray(skill?.damageAttributeLinks) ? skill.damageAttributeLinks : [];
  const attribute = monsterDamageAttributeBasis(instance?.effectiveAttributes, links);
  const calculatedBaseDamage = calculatedMonsterBaseDamage(skill?.templateBaseDamage, level, skill?.damageGrowthWeight);
  const calculatedDamageCenter = calculatedBaseDamage + attribute.basis;
  const suggestedSpread = suggestedMonsterSpread(level);
  return {
    storedAccuracy: finiteNumber(skill?.storedAccuracy, 'Stored Accuracy'),
    calculatedBaseDamage,
    damageAttributeLinks: attribute.links,
    damageAttributeValues: attribute.values,
    damageAttributeBasis: attribute.basis,
    calculatedDamageCenter,
    suggestedSpreadMin: suggestedSpread.min,
    suggestedSpreadMax: suggestedSpread.max,
    finalSpreadMin: suggestedSpread.min,
    finalSpreadMax: suggestedSpread.max,
    calculatedMinimumRawDamage: Math.max(0, calculatedDamageCenter + suggestedSpread.min),
    calculatedMaximumRawDamage: Math.max(0, calculatedDamageCenter + suggestedSpread.max)
  };
}

export function monsterEffectiveAccuracy(storedAccuracy, modifier = 0) {
  const stored = finiteNumber(storedAccuracy, 'Stored Accuracy');
  const totalModifier = finiteNumber(modifier, 'Hit Modifier');
  const modifiedAccuracy = stored + totalModifier;
  return {
    storedAccuracy: stored,
    modifier: totalModifier,
    modifiedAccuracy,
    effectiveAccuracy: Math.min(100, modifiedAccuracy)
  };
}
