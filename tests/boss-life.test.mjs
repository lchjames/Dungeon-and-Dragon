import assert from 'node:assert/strict';
import {
  isBossActionable,
  reconcileBossStatusFromHp,
  resolveBossHpDamage
} from '../src/boss-life.js';

assert.deepEqual(resolveBossHpDamage(10, 3), {
  hpBefore: 10,
  hpDamage: 3,
  hpAfter: 7,
  statusAfter: 'active',
  defeated: false
});

assert.deepEqual(resolveBossHpDamage(10, 10), {
  hpBefore: 10,
  hpDamage: 10,
  hpAfter: 0,
  statusAfter: 'defeated',
  defeated: true
});

assert.deepEqual(resolveBossHpDamage(10, 99), {
  hpBefore: 10,
  hpDamage: 99,
  hpAfter: 0,
  statusAfter: 'defeated',
  defeated: true
});

assert.equal(reconcileBossStatusFromHp('active', 0), 'defeated');
assert.equal(reconcileBossStatusFromHp('defeated', 5), 'active');
assert.equal(reconcileBossStatusFromHp('removed', 5), 'removed');
assert.equal(isBossActionable('active', 1), true);
assert.equal(isBossActionable('defeated', 0), false);
assert.equal(isBossActionable('removed', 10), false);

assert.throws(() => resolveBossHpDamage(-1, 1), /cannot be negative/i);
assert.throws(() => resolveBossHpDamage(1, -1), /cannot be negative/i);
