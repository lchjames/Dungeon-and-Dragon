import assert from 'node:assert/strict';
import {
  normalizeStatusEffectDefinition,
  planStatusEffectApplication,
  planStatusEffectRoundTick
} from '../src/status-effect-rules.js';

const base = normalizeStatusEffectDefinition({
  canonicalNameZh: '燃燒',
  category: 'DAMAGE_OVER_TIME',
  layers: ['BODY'],
  sourceAttribute: 'FIRE',
  durationType: 'ROUNDS',
  defaultDurationRounds: 3,
  effectProfile: { type: 'burning' },
  triggerTimings: ['TARGET_TURN_END'],
  stackingRule: 'NO_STACK',
  status: 'ACTIVE',
  changeReason: 'rule test'
}, { fallbackStackKey: 'status_def_test' });

assert.equal(base.stackKey, 'status_def_test');
assert.equal(base.defaultDurationRounds, 3);
assert.deepEqual(base.layers, ['BODY']);
assert.deepEqual(base.triggerTimings, ['TARGET_TURN_END']);

assert.throws(() => normalizeStatusEffectDefinition({
  ...base,
  canonicalNameZh: '永久刷新錯誤',
  durationType: 'PERMANENT',
  stackingRule: 'REFRESH_DURATION',
  changeReason: 'invalid'
}), /Permanent Status/);

assert.throws(() => normalizeStatusEffectDefinition({
  ...base,
  canonicalNameZh: '層數錯誤',
  stackingRule: 'ADD_STACKS',
  maxStacks: 1,
  changeReason: 'invalid'
}), /maximum stack count/);

assert.throws(() => normalizeStatusEffectDefinition({
  ...base,
  canonicalNameZh: '強度錯誤',
  stackingRule: 'KEEP_STRONGER',
  strengthValue: null,
  changeReason: 'invalid'
}), /strength value/);

const existing = {
  status: 'ACTIVE',
  durationType: 'ROUNDS',
  remainingRounds: 2,
  stackCount: 2,
  strengthValue: 5
};

assert.deepEqual(planStatusEffectApplication(null, { stackingRule: 'NO_STACK' }), { operation: 'CREATE' });
assert.deepEqual(planStatusEffectApplication(existing, { stackingRule: 'NO_STACK' }), { operation: 'BLOCK', reason: 'NO_STACK_ACTIVE' });
assert.deepEqual(planStatusEffectApplication(existing, {
  stackingRule: 'REFRESH_DURATION', durationType: 'ROUNDS', defaultDurationRounds: 4
}), { operation: 'REFRESH', remainingRounds: 4 });
assert.deepEqual(planStatusEffectApplication(existing, {
  stackingRule: 'EXTEND_DURATION', durationType: 'ROUNDS', defaultDurationRounds: 4
}), { operation: 'EXTEND', remainingRounds: 6 });
assert.deepEqual(planStatusEffectApplication(existing, {
  stackingRule: 'ADD_STACKS', durationType: 'ROUNDS', maxStacks: 3
}), { operation: 'STACK', stackCount: 3 });
assert.deepEqual(planStatusEffectApplication({ ...existing, stackCount: 3 }, {
  stackingRule: 'ADD_STACKS', durationType: 'ROUNDS', maxStacks: 3
}), { operation: 'BLOCK', reason: 'MAX_STACKS_REACHED' });
assert.deepEqual(planStatusEffectApplication(existing, {
  stackingRule: 'KEEP_STRONGER', strengthValue: 6
}), { operation: 'REPLACE_STRONGER' });
assert.deepEqual(planStatusEffectApplication(existing, {
  stackingRule: 'KEEP_STRONGER', strengthValue: 5
}), { operation: 'BLOCK', reason: 'EXISTING_NOT_WEAKER' });
assert.deepEqual(planStatusEffectApplication(existing, {
  stackingRule: 'TAKE_LATEST'
}), { operation: 'REPLACE_LATEST' });

assert.deepEqual(planStatusEffectRoundTick({ status: 'ACTIVE', durationType: 'PERMANENT' }), { operation: 'NONE' });
assert.deepEqual(planStatusEffectRoundTick({ status: 'ACTIVE', durationType: 'ROUNDS', remainingRounds: 3 }), { operation: 'TICK', remainingRounds: 2 });
assert.deepEqual(planStatusEffectRoundTick({ status: 'ACTIVE', durationType: 'ROUNDS', remainingRounds: 1 }), { operation: 'EXPIRE', remainingRounds: 0 });
assert.deepEqual(planStatusEffectRoundTick({ status: 'REMOVED', durationType: 'ROUNDS', remainingRounds: 1 }), { operation: 'NONE' });

console.log('Status Effect lifecycle rules passed.');
