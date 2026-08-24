function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be numeric.`);
  return number;
}

export function resolveMonsterHpDamage(currentHp, hpDamage) {
  const current = finite(currentHp, 'Monster Current HP');
  const damage = finite(hpDamage, 'Monster HP Damage');
  if (current < 0) throw new RangeError('Monster Current HP cannot be negative.');
  if (damage < 0) throw new RangeError('Monster HP Damage cannot be negative.');
  const hpAfter = Math.max(0, current - damage);
  return {
    hpBefore: current,
    hpDamage: damage,
    hpAfter,
    statusAfter: hpAfter <= 0 ? 'defeated' : 'active',
    defeated: hpAfter <= 0
  };
}

export function reconcileMonsterStatusFromHp(status, currentHp) {
  const currentStatus = String(status || '').toLowerCase();
  const hp = finite(currentHp, 'Monster Current HP');
  if (hp < 0) throw new RangeError('Monster Current HP cannot be negative.');
  if (currentStatus === 'removed') return 'removed';
  if (!['active', 'defeated'].includes(currentStatus)) {
    throw new RangeError('Monster status must be active, defeated or removed.');
  }
  return hp <= 0 ? 'defeated' : 'active';
}

export function isMonsterActionable(status, currentHp) {
  return reconcileMonsterStatusFromHp(status, currentHp) === 'active' && Number(currentHp) > 0;
}
