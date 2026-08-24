import { rollDie } from './rules.js';

export function resolveD100(rawRoll, skillValue, modifier = 0) {
  const roll = Number(rawRoll);
  const skill = Number(skillValue);
  const totalModifier = Number(modifier || 0);
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) throw new RangeError('D100 roll must be an integer from 1 to 100.');
  if (!Number.isFinite(skill)) throw new TypeError('D100 skill value must be numeric.');
  if (!Number.isFinite(totalModifier)) throw new TypeError('D100 modifier must be numeric.');

  const effectiveValue = skill + totalModifier;
  const threshold = 100 - effectiveValue;
  const result = roll - threshold;
  return {
    roll,
    skillValue: skill,
    modifier: totalModifier,
    effectiveValue,
    threshold,
    result,
    ordinarySuccess: result > 0,
    greatSuccess: roll === 100,
    greatFailure: roll === 1
  };
}

export function resolveOpposedD100(source, resistance) {
  const sourceCheck = resolveD100(source.roll, source.skillValue, source.modifier || 0);
  const resistanceCheck = resolveD100(resistance.roll, resistance.skillValue, resistance.modifier || 0);
  return {
    source: sourceCheck,
    resistance: resistanceCheck,
    sourceWins: sourceCheck.result > resistanceCheck.result,
    tie: sourceCheck.result === resistanceCheck.result
  };
}

export function rollD100(randomUint32) {
  return rollDie(100, randomUint32);
}

export function rollDamageDice(count, sides, randomUint32) {
  const diceCount = Number(count);
  const diceSides = Number(sides);
  if (!Number.isInteger(diceCount) || diceCount < 1 || diceCount > 20) throw new RangeError('Damage dice count must be an integer from 1 to 20.');
  if (!Number.isInteger(diceSides) || diceSides < 2 || diceSides > 100) throw new RangeError('Damage dice sides must be an integer from 2 to 100.');
  const rolls = [];
  for (let index = 0; index < diceCount; index += 1) rolls.push(rollDie(diceSides, randomUint32));
  return { rolls, total: rolls.reduce((sum, value) => sum + value, 0) };
}

export function characterDamageBonusProfile(str, siz) {
  const total = Number(str) + Number(siz);
  if (!Number.isFinite(total)) throw new TypeError('STR and SIZ are required for Character Damage Bonus.');
  if (total >= 2 && total <= 12) return { sign: -1, count: 1, sides: 6, label: '-1D6' };
  if (total >= 13 && total <= 16) return { sign: -1, count: 1, sides: 4, label: '-1D4' };
  if (total >= 17 && total <= 24) return { sign: 0, count: 0, sides: 0, label: '0' };
  if (total >= 25 && total <= 32) return { sign: 1, count: 1, sides: 4, label: '+1D4' };
  if (total >= 33 && total <= 40) return { sign: 1, count: 1, sides: 6, label: '+1D6' };
  if (total >= 41 && total <= 56) return { sign: 1, count: 2, sides: 6, label: '+2D6' };
  if (total >= 57 && total <= 72) return { sign: 1, count: 3, sides: 6, label: '+3D6' };
  if (total >= 73 && total <= 88) return { sign: 1, count: 4, sides: 6, label: '+4D6' };
  throw new RangeError('STR + SIZ is outside the current Canonical Character Damage Bonus table.');
}

export function rollCharacterDamageBonus(str, siz, randomUint32) {
  const profile = characterDamageBonusProfile(str, siz);
  if (profile.sign === 0) return { ...profile, rolls: [], unsignedTotal: 0, total: 0 };
  const rolled = rollDamageDice(profile.count, profile.sides, randomUint32);
  return {
    ...profile,
    rolls: rolled.rolls,
    unsignedTotal: rolled.total,
    total: profile.sign * rolled.total
  };
}

export function resolveDamage({ damageDiceTotal, fixedDamageModifier = 0, damageBonusTotal = 0, effectiveDefence = 0 }) {
  const dice = Number(damageDiceTotal);
  const fixed = Number(fixedDamageModifier || 0);
  const bonus = Number(damageBonusTotal || 0);
  const defence = Number(effectiveDefence || 0);
  if (![dice, fixed, bonus, defence].every(Number.isFinite)) throw new TypeError('Damage inputs must be numeric.');
  const rawDamage = dice + fixed + bonus;
  const damageResult = rawDamage - defence;
  return {
    rawDamage,
    effectiveDefence: defence,
    damageResult,
    hpDamage: damageResult > 0 ? damageResult : 0
  };
}

export function dyingRoundsFromCon(con) {
  const value = Number(con);
  if (!Number.isFinite(value) || value <= 0) throw new TypeError('Positive CON is required for Dying rounds.');
  return Math.ceil(value / 5);
}
