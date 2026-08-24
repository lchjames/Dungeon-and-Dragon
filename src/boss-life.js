function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be numeric.`);
  return number;
}

export function resolveBossHpDamage(currentHp, hpDamage) {
  const current = finite(currentHp, 'Boss Current HP');
  const damage = finite(hpDamage, 'Boss HP Damage');
  if (current < 0) throw new RangeError('Boss Current HP cannot be negative.');
  if (damage < 0) throw new RangeError('Boss HP Damage cannot be negative.');
  const hpAfter = Math.max(0, current - damage);
  return {
    hpBefore: current,
    hpDamage: damage,
    hpAfter,
    statusAfter: hpAfter <= 0 ? 'defeated' : 'active',
    defeated: hpAfter <= 0
  };
}

export function reconcileBossStatusFromHp(status, currentHp) {
  const currentStatus = String(status || '').toLowerCase();
  const hp = finite(currentHp, 'Boss Current HP');
  if (hp < 0) throw new RangeError('Boss Current HP cannot be negative.');
  if (currentStatus === 'removed') return 'removed';
  if (!['active', 'defeated'].includes(currentStatus)) throw new RangeError('Boss status must be active, defeated or removed.');
  return hp <= 0 ? 'defeated' : 'active';
}

export function isBossActionable(status, currentHp) {
  return reconcileBossStatusFromHp(status, currentHp) === 'active' && Number(currentHp) > 0;
}
