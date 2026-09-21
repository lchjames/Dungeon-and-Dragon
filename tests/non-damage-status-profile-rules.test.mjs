import assert from 'node:assert/strict';
import {
  inspectPrimaryEffect,
  normalizeNonDamageStatusProfile,
  resolveProfileReadiness
} from '../src/non-damage-status-profile-rules.js';

const base = normalizeNonDamageStatusProfile({
  name: 'Stun Profile',
  statusDefinitionId: 'status_1',
  primaryEffectField: 'DURATION_ROUNDS',
  changeReason: 'Approve canonical Status mapping.'
});
assert.equal(base.targetMode, 'ORIGINAL_TARGET');
assert.equal(base.resistanceType, 'OPPOSED_D100');
assert.equal(base.greatSuccessRule, 'DOUBLE_PRIMARY_EFFECT');
assert.equal(base.greatFailureRule, 'TARGET_DEVIATION');
assert.equal(inspectPrimaryEffect({ durationType: 'ROUNDS', defaultDurationRounds: 2 }, base).value, 2);

assert.equal(inspectPrimaryEffect(
  { effectProfile: { modifierValue: -10 } },
  normalizeNonDamageStatusProfile({
    name: 'Blind',
    statusDefinitionId: 'status_2',
    primaryEffectField: 'EFFECT_PROFILE_NUMERIC',
    primaryEffectKey: 'modifierValue',
    changeReason: 'Approve.'
  })
).value, -10);

assert.throws(() => normalizeNonDamageStatusProfile({
  name: 'Bad',
  statusDefinitionId: 'status_3',
  primaryEffectField: 'EFFECT_PROFILE_NUMERIC',
  primaryEffectKey: 'nested.value',
  changeReason: 'Reject nested path.'
}), /simple top-level JSON key/);

assert.throws(() => inspectPrimaryEffect(
  { effectProfile: { text: 'x' } },
  normalizeNonDamageStatusProfile({
    name: 'Bad numeric',
    statusDefinitionId: 'status_4',
    primaryEffectField: 'EFFECT_PROFILE_NUMERIC',
    primaryEffectKey: 'text',
    changeReason: 'Reject.'
  })
), /finite numeric value/);

assert.deepEqual(resolveProfileReadiness(
  { status: 'ACTIVE', statusDefinitionVersion: 2 },
  { status: 'ACTIVE', version: 2 }
), { ready: true, reason: null });

assert.equal(resolveProfileReadiness(
  { status: 'ACTIVE', statusDefinitionVersion: 1 },
  { status: 'ACTIVE', version: 2 }
).reason, 'STATUS_DEFINITION_VERSION_STALE');

console.log('Non-damage Status Profile rules passed.');
