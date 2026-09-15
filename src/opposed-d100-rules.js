import { resolveBasicSkillD100 } from './basic-skill-check-rules.js';

export const OPPOSED_D100_COMPARISONS = Object.freeze({
  SOURCE_HIGHER: 'SOURCE_HIGHER',
  RESISTANCE_HIGHER: 'RESISTANCE_HIGHER',
  TIE: 'TIE'
});

export function resolveOpposedD100({ source, resistance }) {
  const sourceResolution = resolveBasicSkillD100(source || {});
  const resistanceResolution = resolveBasicSkillD100(resistance || {});
  const comparison = sourceResolution.resultValue > resistanceResolution.resultValue
    ? OPPOSED_D100_COMPARISONS.SOURCE_HIGHER
    : (sourceResolution.resultValue < resistanceResolution.resultValue
      ? OPPOSED_D100_COMPARISONS.RESISTANCE_HIGHER
      : OPPOSED_D100_COMPARISONS.TIE);

  return {
    source: sourceResolution,
    resistance: resistanceResolution,
    comparison,
    sourceStrictlyBreaksResistance: comparison === OPPOSED_D100_COMPARISONS.SOURCE_HIGHER,
    resistancePriorityOnTie: comparison === OPPOSED_D100_COMPARISONS.TIE
  };
}
