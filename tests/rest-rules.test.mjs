import assert from 'node:assert/strict';
import { restRequiredRounds, resolveRestRecovery, validateRestChoice } from '../src/rest-rules.js';

assert.equal(restRequiredRounds('short'), 2);
assert.equal(restRequiredRounds('LONG'), 5);
assert.deepEqual(validateRestChoice('short', 'hp'), { restType: 'short', resource: 'HP', requiredRounds: 2 });
assert.deepEqual(validateRestChoice('long', 'MP'), { restType: 'long', resource: 'MP', requiredRounds: 5 });
assert.throws(() => validateRestChoice('medium', 'HP'));
assert.throws(() => validateRestChoice('short', 'SP'));

assert.deepEqual(resolveRestRecovery({ restType: 'short', resource: 'HP', current: 100, max: 232 }), {
  restType: 'short', resource: 'HP', currentBefore: 100, max: 232,
  recoveryRequested: 24, recoveryApplied: 24, currentAfter: 124
});
assert.deepEqual(resolveRestRecovery({ restType: 'short', resource: 'MP', current: 400, max: 641 }), {
  restType: 'short', resource: 'MP', currentBefore: 400, max: 641,
  recoveryRequested: 161, recoveryApplied: 161, currentAfter: 561
});
assert.deepEqual(resolveRestRecovery({ restType: 'long', resource: 'HP', current: 120, max: 232 }), {
  restType: 'long', resource: 'HP', currentBefore: 120, max: 232,
  recoveryRequested: 116, recoveryApplied: 112, currentAfter: 232
});
assert.deepEqual(resolveRestRecovery({ restType: 'long', resource: 'MP', current: 400, max: 641 }), {
  restType: 'long', resource: 'MP', currentBefore: 400, max: 641,
  recoveryRequested: 241, recoveryApplied: 241, currentAfter: 641
});
assert.equal(resolveRestRecovery({ restType: 'short', resource: 'HP', current: 231, max: 232 }).recoveryApplied, 1);
assert.equal(resolveRestRecovery({ restType: 'short', resource: 'MP', current: 641, max: 641 }).recoveryApplied, 0);

console.log('Canonical Rest recovery rules passed.');
