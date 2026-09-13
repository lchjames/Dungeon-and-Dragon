import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authority = await readFile(new URL('../src/currency-exchange-authority.js', import.meta.url), 'utf8');
const currencyGateway = await readFile(new URL('../src/currency-exchange-gateway.js', import.meta.url), 'utf8');
const inventoryGateway = await readFile(new URL('../src/inventory-weapon-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0031_currency_exchange_authority.sql', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-currency-exchange.js', import.meta.url), 'utf8');
const playerInventoryUi = await readFile(new URL('../public/assets/player-inventory-weapons.js', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../public/player/index.html', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-currency-exchange.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/CURRENCY_EXCHANGE_AUTHORITY_ALPHA.md', import.meta.url), 'utf8');

for (const coin of ['coin_bronze', 'coin_silver', 'coin_gold']) {
  assert.match(authority, new RegExp(coin));
  assert.match(migration, new RegExp(coin));
}
assert.match(authority, /item_subtype[^\n]*'CURRENCY'/);
assert.match(migration, /'ITEM', 'CURRENCY'/);
assert.doesNotMatch(authority, /wallet|base_money/i, 'Currency must remain canonical Inventory ownership rather than a parallel wallet.');

for (const table of [
  'currency_exchange_generation_settings',
  'currency_exchange_rate_sets',
  'currency_exchange_rates',
  'currency_exchange_transactions',
  'currency_exchange_admin_log'
]) {
  assert.match(authority, new RegExp(table));
  assert.match(migration, new RegExp(table));
}
assert.match(authority, /idx_currency_exchange_active_campaign/);
assert.match(migration, /WHERE status = 'ACTIVE'/);

assert.match(authority, /lowToHighPremiumMinPct: 2/);
assert.match(authority, /lowToHighPremiumMaxPct: 10/);
assert.match(authority, /highToLowSpreadMinPct: 0/);
assert.match(authority, /highToLowSpreadMaxPct: 3/);
assert.match(authority, /Math\.ceil\(reference \* \(1 \+ premium \/ 100\)\)/);
assert.match(authority, /Math\.floor\(reference \* \(1 - haircut \/ 100\)\)/);
assert.match(authority, /down >= up/);
assert.doesNotMatch(authority, /coin_bronze[^\n]*coin_gold[^\n]*direction/i, 'Alpha generator must not introduce direct Bronze/Gold direction.');

assert.match(authority, /CREATE TRIGGER IF NOT EXISTS trg_currency_exchange_apply/);
assert.match(migration, /CREATE TRIGGER trg_currency_exchange_apply/);
for (const token of ['CURRENCY_RATE_STALE', 'CURRENCY_BUNDLE_INVALID', 'CURRENCY_INSUFFICIENT_FUNDS', 'CURRENCY_DESTINATION_STACK_MISSING']) {
  assert.match(authority, new RegExp(token));
  assert.match(migration, new RegExp(token));
}
assert.match(authority, /INSERT INTO currency_exchange_transactions/);
assert.match(authority, /currency_exchange_out/);
assert.match(authority, /currency_exchange_in/);
assert.match(migration, /quantity = quantity - NEW\.from_quantity_total/);
assert.match(migration, /quantity = quantity \+ NEW\.to_quantity_total/);
assert.match(doc, /If any step aborts, SQLite rolls back the statement/);

assert.match(inventoryGateway, /import baseWorker from '\.\/currency-exchange-gateway\.js'/);
assert.match(currencyGateway, /import baseWorker from '\.\/story-script-gateway\.js'/);
assert.match(inventoryGateway, /CURRENCY_GENERIC_INVENTORY_WRITE_BLOCKED/);
assert.match(inventoryGateway, /itemSubtype/);
assert.match(inventoryGateway, /ensureCurrencyExchangeAuthority/);
assert.match(currencyGateway, /\/api\\\/gm\\\/currency-exchange/);
assert.match(currencyGateway, /\/api\\\/player\\\/characters/);
assert.match(currencyGateway, /currency\\\/exchange/);
assert.doesNotMatch(currencyGateway, /eval\s*\(/);
assert.doesNotMatch(currencyGateway, /new Function\s*\(/);
assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/inventory-weapon-gateway\.js"\s*,?\s*$/m);

assert.match(playerHtml, /player-currency-exchange\.js/);
assert.match(playerInventoryUi, /itemSubtype/);
assert.match(playerInventoryUi, /CURRENCY/);
assert.match(playerUi, /Today's Exchange Rate/);
assert.match(playerUi, /Confirm Exchange/);
assert.match(playerUi, /expectedRateSetId/);
assert.match(playerUi, /quotedFromQuantity/);
assert.match(playerUi, /quotedToQuantity/);
assert.match(playerUi, /Max/);
assert.match(gmUi, /Randomise Today's Rates/);
assert.match(gmUi, /Save as Current Rates/);
assert.match(gmUi, /Character Currency/);

assert.match(doc, /generic `\/inventory\/:inventoryId` quantity\/qty PATCH/);
assert.match(doc, /whole-bundle/i);
assert.match(doc, /stale-rate/i);
assert.match(doc, /Store purchase\/sale authority/);
assert.match(doc, /Weapon-derived combat formula changes/);

console.log('Currency Exchange authority, routing, atomicity and Player surface contract passed.');
