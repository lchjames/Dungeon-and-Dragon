import assert from 'node:assert/strict';
import { resolveOpposedD100 } from '../src/opposed-d100-rules.js';

{
  const result = resolveOpposedD100({
    source: { naturalSkillValue: 60, totalModifier: 0, rawRoll: 80 },
    resistance: { naturalSkillValue: 50, totalModifier: 0, rawRoll: 60 }
  });
  assert.equal(result.comparison, 'SOURCE_HIGHER');
  assert.equal(result.sourceStrictlyBreaksResistance, true);
  assert.equal(result.resistancePriorityOnTie, false);
}

{
  const result = resolveOpposedD100({
    source: { naturalSkillValue: 40, totalModifier: 0, rawRoll: 50 },
    resistance: { naturalSkillValue: 70, totalModifier: 0, rawRoll: 70 }
  });
  assert.equal(result.comparison, 'RESISTANCE_HIGHER');
  assert.equal(result.sourceStrictlyBreaksResistance, false);
}

{
  const result = resolveOpposedD100({
    source: { naturalSkillValue: 60, totalModifier: 0, rawRoll: 60 },
    resistance: { naturalSkillValue: 60, totalModifier: 0, rawRoll: 60 }
  });
  assert.equal(result.comparison, 'TIE');
  assert.equal(result.sourceStrictlyBreaksResistance, false);
  assert.equal(result.resistancePriorityOnTie, true);
}

{
  const result = resolveOpposedD100({
    source: { naturalSkillValue: 10, totalModifier: 0, rawRoll: 100 },
    resistance: { naturalSkillValue: 98, totalModifier: 0, rawRoll: 99 }
  });
  assert.equal(result.source.extremeResult, 'GREAT_SUCCESS');
  assert.equal(result.source.greatSuccessGrowthEligible, true);
  assert.equal(result.comparison, 'RESISTANCE_HIGHER', 'Raw 100 must not override the final Result comparison.');
  assert.equal(result.sourceStrictlyBreaksResistance, false);
}

{
  const result = resolveOpposedD100({
    source: { naturalSkillValue: 98, totalModifier: 0, rawRoll: 100 },
    resistance: { naturalSkillValue: 98, totalModifier: 0, rawRoll: 100 }
  });
  assert.equal(result.source.extremeResult, 'GREAT_SUCCESS');
  assert.equal(result.resistance.extremeResult, 'GREAT_SUCCESS');
  assert.equal(result.comparison, 'TIE');
  assert.equal(result.resistancePriorityOnTie, true, '100 vs 100 exact Result tie keeps resistance priority.');
}

{
  const result = resolveOpposedD100({
    source: { naturalSkillValue: 98, totalModifier: 100, rawRoll: 1 },
    resistance: { naturalSkillValue: 0, totalModifier: 0, rawRoll: 2 }
  });
  assert.equal(result.source.extremeResult, 'GREAT_FAILURE');
  assert.equal(result.comparison, 'SOURCE_HIGHER', 'Raw 1 marks Great Failure but does not replace Result comparison.');
}

console.log('Shared Opposed D100 rule tests passed.');
