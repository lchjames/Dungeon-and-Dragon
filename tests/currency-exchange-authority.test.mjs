import assert from 'node:assert/strict';
import {
  generateExchangeRates,
  normalizeGenerationSettings,
  normalizeManualRates
} from '../src/currency-exchange-authority.js';

const defaults = normalizeGenerationSettings({});
assert.deepEqual(defaults, {
  bronzePerSilverReference: 100,
  silverPerGoldReference: 100,
  lowToHighPremiumMinPct: 2,
  lowToHighPremiumMaxPct: 10,
  highToLowSpreadMinPct: 0,
  highToLowSpreadMaxPct: 3
});

assert.throws(
  () => normalizeGenerationSettings({ lowToHighPremiumMinPct: 20, lowToHighPremiumMaxPct: 10 }),
  /minimum cannot exceed maximum/
);
assert.throws(
  () => normalizeGenerationSettings({ highToLowSpreadMinPct: 5, highToLowSpreadMaxPct: 3 }),
  /minimum cannot exceed maximum/
);

for (let i = 0; i < 100; i += 1) {
  const rates = generateExchangeRates(defaults);
  assert.equal(rates.length, 4);
  const byKey = new Map(rates.map(rate => [`${rate.fromItemDefinitionId}->${rate.toItemDefinitionId}`, rate]));
  const bs = byKey.get('coin_bronze->coin_silver');
  const sb = byKey.get('coin_silver->coin_bronze');
  const sg = byKey.get('coin_silver->coin_gold');
  const gs = byKey.get('coin_gold->coin_silver');
  assert.ok(bs.fromQuantity >= 102 && bs.fromQuantity <= 111, `Bronze→Silver out of Alpha range: ${bs.fromQuantity}`);
  assert.equal(bs.toQuantity, 1);
  assert.equal(sb.fromQuantity, 1);
  assert.ok(sb.toQuantity >= 97 && sb.toQuantity <= 100, `Silver→Bronze out of Alpha range: ${sb.toQuantity}`);
  assert.ok(sb.toQuantity < bs.fromQuantity, 'Bronze/Silver no-arbitrage invariant failed.');
  assert.ok(sg.fromQuantity >= 102 && sg.fromQuantity <= 111, `Silver→Gold out of Alpha range: ${sg.fromQuantity}`);
  assert.equal(sg.toQuantity, 1);
  assert.equal(gs.fromQuantity, 1);
  assert.ok(gs.toQuantity >= 97 && gs.toQuantity <= 100, `Gold→Silver out of Alpha range: ${gs.toQuantity}`);
  assert.ok(gs.toQuantity < sg.fromQuantity, 'Silver/Gold no-arbitrage invariant failed.');
}

const manual = normalizeManualRates([
  { fromItemDefinitionId: 'coin_gold', toItemDefinitionId: 'coin_silver', fromQuantity: 1, toQuantity: 99, enabled: true },
  { fromItemDefinitionId: 'coin_bronze', toItemDefinitionId: 'coin_silver', fromQuantity: 104, toQuantity: 1, enabled: true },
  { fromItemDefinitionId: 'coin_silver', toItemDefinitionId: 'coin_gold', fromQuantity: 107, toQuantity: 1, enabled: false },
  { fromItemDefinitionId: 'coin_silver', toItemDefinitionId: 'coin_bronze', fromQuantity: 1, toQuantity: 98, enabled: true }
]);
assert.deepEqual(manual.map(rate => `${rate.fromItemDefinitionId}->${rate.toItemDefinitionId}`), [
  'coin_bronze->coin_silver',
  'coin_silver->coin_bronze',
  'coin_silver->coin_gold',
  'coin_gold->coin_silver'
]);
assert.equal(manual[2].enabled, false);
assert.throws(() => normalizeManualRates(manual.slice(0, 3)), /Missing Alpha exchange direction/);
assert.throws(() => normalizeManualRates([
  ...manual,
  manual[0]
]), /Duplicate exchange direction/);
assert.throws(() => normalizeManualRates([
  ...manual.slice(0, 3),
  { fromItemDefinitionId: 'coin_bronze', toItemDefinitionId: 'coin_gold', fromQuantity: 10000, toQuantity: 1 }
]), /Unsupported Alpha exchange direction/);

console.log('Currency Exchange authority unit tests passed.');
