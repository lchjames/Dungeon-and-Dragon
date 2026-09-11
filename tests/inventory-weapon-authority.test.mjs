import assert from 'node:assert/strict';
import { normalizeWeaponDefinition } from '../src/inventory-weapon-authority.js';

const weapon = normalizeWeaponDefinition({
  name: ' Longsword ',
  description: 'Steel blade',
  weapon: {
    weaponGroup: 'sword',
    linkedSkillId: 'melee_sword',
    damageFormula: '1D8',
    damageType: 'slashing',
    rangeValue: 1,
    attacksPerRound: 1,
    hitModifier: 5,
    resourceCost: { stamina: 1 },
    properties: { versatile: true }
  }
});

assert.equal(weapon.name, 'Longsword');
assert.equal(weapon.weaponGroup, 'sword');
assert.equal(weapon.damageFormula, '1D8');
assert.equal(weapon.damageType, 'slashing');
assert.equal(weapon.rangeValue, 1);
assert.equal(weapon.attacksPerRound, 1);
assert.equal(weapon.hitModifier, 5);
assert.deepEqual(JSON.parse(weapon.resourceCost), { stamina: 1 });
assert.deepEqual(JSON.parse(weapon.properties), { versatile: true });

assert.throws(() => normalizeWeaponDefinition({ name: '' }), /Weapon name is required/);
assert.throws(() => normalizeWeaponDefinition({ name: 'Bad range', rangeValue: -1 }), /range/i);
assert.throws(() => normalizeWeaponDefinition({ name: 'Bad APR', attacksPerRound: 0 }), /Attacks per round/i);
assert.throws(() => normalizeWeaponDefinition({ name: 'Bad hit', hitModifier: Number.NaN }), /hit modifier/i);

console.log('Inventory / Weapon authority rules passed.');
