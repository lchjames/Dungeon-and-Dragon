import assert from 'node:assert/strict';
import {
  isMonsterActionable,
  reconcileMonsterStatusFromHp,
  resolveMonsterHpDamage
} from '../src/monster-life.js';

assert.deepEqual(resolveMonsterHpDamage(10, 3), {
  hpBefore: 10,
  hpDamage: 3,
  hpAfter: 7,
  statusAfter: 'active',
  defeated: false
});

assert.deepEqual(resolveMonsterHpDamage(10, 10), {
  hpBefore: 10,
  hpDamage: 10,
  hpAfter: 0,
  statusAfter: 'defeated',
  defeated: true
});

assert.deepEqual(resolveMonsterHpDamage(10, 999), {
  hpBefore: 10,
  hpDamage: 999,
  hpAfter: 0,
  statusAfter: 'defeated',
  defeated: true
});

assert.equal(reconcileMonsterStatusFromHp('active', 0), 'defeated');
assert.equal(reconcileMonsterStatusFromHp('defeated', 4), 'active');
assert.equal(reconcileMonsterStatusFromHp('removed', 0), 'removed');
assert.equal(reconcileMonsterStatusFromHp('removed', 10), 'removed');
assert.equal(isMonsterActionable('active', 1), true);
assert.equal(isMonsterActionable('defeated', 0), false);
assert.equal(isMonsterActionable('removed', 100), false);

assert.throws(() => resolveMonsterHpDamage(-1, 1), /cannot be negative/i);
assert.throws(() => resolveMonsterHpDamage(1, -1), /cannot be negative/i);
