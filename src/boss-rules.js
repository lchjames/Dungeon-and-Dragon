import {
  MONSTER_ATTRIBUTE_KEYS,
  effectiveMonsterAttribute,
  monsterCalculatedResources,
  monsterEffectiveD100Defence,
  monsterFinalArmorDefence,
  validateMonsterLevel
} from './monster-rules.js';

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be numeric.`);
  return number;
}

function optionalFinite(value, label) {
  if (value === null || value === undefined || value === '') return null;
  return finiteNumber(value, label);
}

export function calculateBossProfile(input) {
  const level = validateMonsterLevel(input?.level);
  const natural = {};
  const growthWeights = {};
  const calculated = {};
  const overrides = {};
  const finalAttributes = {};

  for (const key of MONSTER_ATTRIBUTE_KEYS) {
    natural[key] = finiteNumber(input?.naturalAttributes?.[key], `Natural ${key}`);
    growthWeights[key] = finiteNumber(input?.growthWeights?.[key], `${key} Growth Weight`);
    calculated[key] = effectiveMonsterAttribute(natural[key], level, growthWeights[key]);
    overrides[key] = optionalFinite(input?.attributeOverrides?.[key], `${key} Override`);
    finalAttributes[key] = overrides[key] ?? calculated[key];
  }

  const calculatedResources = monsterCalculatedResources(calculated);
  const maxHpOverride = optionalFinite(input?.maxHpOverride, 'Max HP Override');
  const maxMpOverride = optionalFinite(input?.maxMpOverride, 'Max MP Override');
  const finalMaxHp = maxHpOverride ?? calculatedResources.maxHp;
  const finalMaxMp = maxMpOverride ?? calculatedResources.maxMp;
  if (finalMaxHp <= 0 || finalMaxMp < 0) throw new RangeError('Boss Final Max HP must be > 0 and Max MP must be >= 0.');

  const baselineStoredDefence = finiteNumber(input?.baselineStoredDefence ?? 0, 'Baseline Stored Defence');
  const storedDefenceOverride = optionalFinite(input?.storedDefenceOverride, 'Stored Defence Override');
  const finalStoredDefence = storedDefenceOverride ?? baselineStoredDefence;
  if (finalStoredDefence < 0) throw new RangeError('Boss Final Stored Defence must be >= 0.');

  const baselineArmorDefence = finiteNumber(input?.baselineArmorDefence ?? 0, 'Baseline Armor Defence');
  const armorDefenceOverride = optionalFinite(input?.armorDefenceOverride, 'Armor Defence Override');
  const finalArmorDefence = armorDefenceOverride ?? baselineArmorDefence;
  if (finalArmorDefence < 0) throw new RangeError('Boss Final Armor Defence must be >= 0.');

  const baselineArmorName = String(input?.baselineArmorName ?? '').trim();
  const armorNameOverride = input?.armorNameOverride === null || input?.armorNameOverride === undefined
    ? null
    : String(input.armorNameOverride).trim();
  const baselineArmorNotes = String(input?.baselineArmorNotes ?? '').trim();
  const armorNotesOverride = input?.armorNotesOverride === null || input?.armorNotesOverride === undefined
    ? null
    : String(input.armorNotesOverride).trim();

  return {
    level,
    naturalAttributes: natural,
    growthWeights,
    calculatedAttributes: calculated,
    attributeOverrides: overrides,
    finalAttributes,
    calculatedMaxHp: calculatedResources.maxHp,
    maxHpOverride,
    finalMaxHp,
    calculatedMaxMp: calculatedResources.maxMp,
    maxMpOverride,
    finalMaxMp,
    baselineStoredDefence,
    storedDefenceOverride,
    finalStoredDefence,
    baselineArmor: {
      name: baselineArmorName,
      defence: baselineArmorDefence,
      notes: baselineArmorNotes
    },
    armorOverride: {
      name: armorNameOverride,
      defence: armorDefenceOverride,
      notes: armorNotesOverride
    },
    finalArmor: {
      name: armorNameOverride ?? baselineArmorName,
      defence: finalArmorDefence,
      notes: armorNotesOverride ?? baselineArmorNotes
    }
  };
}

export function bossInstanceDefence(storedDefence, defenceModifier, armorBaseDefence, armorAdjustment) {
  return {
    d100: monsterEffectiveD100Defence(storedDefence, defenceModifier),
    armor: monsterFinalArmorDefence(armorBaseDefence, armorAdjustment)
  };
}

export function bossPhaseApplicability({ currentHp, maxHp, currentPhaseNumber, phases = [] }) {
  const hp = finiteNumber(currentHp, 'Current HP');
  const max = finiteNumber(maxHp, 'Max HP');
  if (max <= 0) throw new RangeError('Max HP must be > 0.');
  const hpPercent = Math.max(0, Math.min(100, (hp / max) * 100));
  const ordered = [...phases]
    .map(phase => ({
      ...phase,
      phaseNumber: Number(phase.phaseNumber),
      hpThresholdPercent: phase.hpThresholdPercent === null || phase.hpThresholdPercent === undefined
        ? null
        : Number(phase.hpThresholdPercent)
    }))
    .filter(phase => Number.isInteger(phase.phaseNumber) && phase.phaseNumber > Number(currentPhaseNumber || 0))
    .sort((a, b) => a.phaseNumber - b.phaseNumber);

  const applicable = ordered.find(phase =>
    phase.hpThresholdPercent !== null
    && Number.isFinite(phase.hpThresholdPercent)
    && hpPercent <= phase.hpThresholdPercent
  ) || null;

  return { hpPercent, applicablePhase: applicable };
}

export function validateBossPhases(phases = []) {
  if (!Array.isArray(phases)) throw new TypeError('Boss phases must be an array.');
  if (phases.length > 20) throw new RangeError('Boss MVP supports at most 20 phases.');
  const used = new Set();
  return phases.map((phase, index) => {
    const phaseNumber = Number(phase?.phaseNumber ?? index + 1);
    if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 100) throw new RangeError('Boss Phase number must be an integer from 1 to 100.');
    if (used.has(phaseNumber)) throw new RangeError('Boss Phase numbers must be unique.');
    used.add(phaseNumber);
    const name = String(phase?.name || '').trim();
    if (!name || name.length > 120) throw new RangeError('Boss Phase name must be 1–120 characters.');
    let hpThresholdPercent = phase?.hpThresholdPercent;
    if (hpThresholdPercent === '' || hpThresholdPercent === undefined) hpThresholdPercent = null;
    if (hpThresholdPercent !== null) {
      hpThresholdPercent = Number(hpThresholdPercent);
      if (!Number.isFinite(hpThresholdPercent) || hpThresholdPercent < 0 || hpThresholdPercent > 100) {
        throw new RangeError('Boss Phase HP threshold must be 0–100 or blank.');
      }
    }
    return {
      phaseNumber,
      name,
      hpThresholdPercent,
      gmNotes: String(phase?.gmNotes || '').trim().slice(0, 5000)
    };
  }).sort((a, b) => a.phaseNumber - b.phaseNumber);
}
