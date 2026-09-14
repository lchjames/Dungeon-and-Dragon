import assert from 'node:assert/strict';
import { normalizeAbilityDefinition, resolveAbilityUsability } from '../src/ability-rules.js';

const base = normalizeAbilityDefinition({
  canonicalNameZh: '火球術',
  attributeType: 'FIRE',
  rankCode: '2',
  abilityType: 'DAMAGE',
  targetPattern: 'SINGLE',
  descriptionZh: '測試能力',
  prerequisites: { minimumCharacterLevel: 3 }
});
assert.equal(base.attributeType, 'FIRE');
assert.equal(base.rankCode, '2');
assert.equal(base.classificationStatus, 'CLASSIFIED');

assert.throws(() => normalizeAbilityDefinition({ canonicalNameZh: '錯誤', attributeType: 'POW', rankCode: '1' }), /Attribute/);
assert.throws(() => normalizeAbilityDefinition({ canonicalNameZh: '錯誤', attributeType: 'FIRE', rankCode: '10' }), /Rank/);
assert.throws(() => normalizeAbilityDefinition({ canonicalNameZh: '錯誤', attributeType: 'FIRE', rankCode: '1', physicalSourceCategory: 'SWORD' }), /PHYSICAL/);

const character = { level: 4, status: 'active' };
let result = resolveAbilityUsability(base, character, 1);
assert.equal(result.status, 'UNUSABLE');
assert.equal(result.usable, false);
assert.ok(result.blockers.some(row => row.code === 'ATTRIBUTE_RANK_INSUFFICIENT'));

result = resolveAbilityUsability(base, character, 2);
assert.equal(result.status, 'USABLE');
assert.equal(result.usable, true);

result = resolveAbilityUsability({ ...base, classificationStatus: 'NEEDS_CLASSIFICATION', attributeType: null, rankCode: null }, character, 0);
assert.equal(result.status, 'UNRESOLVED');
assert.ok(result.unresolved.some(row => row.code === 'ABILITY_CLASSIFICATION_REQUIRED'));

result = resolveAbilityUsability({ ...base, rankCode: 'SPECIAL' }, character, 9);
assert.equal(result.status, 'UNRESOLVED');
assert.ok(result.unresolved.some(row => row.code === 'ABILITY_SPECIAL_USAGE_POLICY_PENDING'));

result = resolveAbilityUsability({ ...base, prerequisites: { minimumCharacterLevel: 5 } }, character, 2);
assert.equal(result.status, 'UNUSABLE');
assert.ok(result.blockers.some(row => row.code === 'CHARACTER_LEVEL_INSUFFICIENT'));

result = resolveAbilityUsability({ ...base, prerequisites: { requiredBuff: 'focus' } }, character, 2);
assert.equal(result.status, 'UNRESOLVED');
assert.ok(result.unresolved.some(row => row.code === 'ABILITY_ADDITIONAL_PREREQUISITES_PENDING'));

console.log('Ability rules tests passed.');
