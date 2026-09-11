import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authority = await readFile(new URL('../src/inventory-weapon-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/inventory-weapon-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0030_inventory_weapon_foundation.sql', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-inventory-weapons.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-inventory-weapons.js', import.meta.url), 'utf8');
const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../public/player/index.html', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-inventory-weapon-e2e.mjs', import.meta.url), 'utf8');
const aggregateRunner = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/INVENTORY_WEAPON_FOUNDATION_ALPHA.md', import.meta.url), 'utf8');

// One authority: upgrade the original Character Inventory table in place.
assert.match(migration, /ALTER TABLE character_inventory ADD COLUMN item_definition_id TEXT/);
assert.match(authority, /ALTER TABLE \$\{table\} ADD COLUMN \$\{name\}/);
assert.match(authority, /item_definition_id: 'TEXT'/);
assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS character_inventory_v2/i);
assert.doesNotMatch(authority, /character_inventory_v2/i);
assert.match(migration, /legacy_item_/);
assert.match(authority, /INVENTORY_LEGACY_QUANTITY_INVALID/);
assert.match(migration, /CHECK \(invalid_count = 0\)/);

// Canonical reusable definition + owned instance + Weapon extension.
for (const token of ['item_definitions', 'weapon_definitions', 'quantity', 'is_equipped', 'equip_slot', 'revision', 'instance_metadata']) {
  assert.match(authority, new RegExp(token));
  assert.match(migration, new RegExp(token));
}
assert.match(authority, /character_inventory_log/);
assert.match(authority, /INVENTORY_REVISION_CHANGED/);
assert.match(authority, /WEAPON_QUANTITY_FIXED/);
assert.match(authority, /equip_slot = \?/);
assert.match(authority, /equipped \? 'weapon' : null/);
assert.doesNotMatch(authority, /UNIQUE[^\n]*is_equipped/i, 'Alpha must not invent a one-Weapon or hand-capacity rule.');

// Weapon metadata exists, but this slice must not become a second combat engine.
for (const token of ['damage_formula', 'hit_modifier', 'linked_skill_id']) assert.match(authority, new RegExp(token));
assert.doesNotMatch(authority, /resolveOpposedD100|rollD100|rollDamageDice|resolveDamage/);
assert.doesNotMatch(gateway, /resolveOpposedD100|rollD100|rollDamageDice|resolveDamage/);
assert.match(doc, /not yet combat formula authority/i);
assert.match(doc, /must not add `hit_modifier`/i);
assert.match(doc, /must not parse `damage_formula`/i);

// Profile source bridge and attack-time gating are shared above all target resolvers.
assert.match(authority, /source_inventory_id/);
assert.match(authority, /player_attack_profile_source_log/);
assert.match(authority, /row\.item_type === 'WEAPON'/);
assert.match(authority, /Number\(row\.is_equipped\) === 1/);
assert.match(authority, /Number\(row\.definition_active\) === 1/);
assert.match(gateway, /ATTACK_PROFILE_WEAPON_NOT_EQUIPPED/);
assert.match(gateway, /profileSourceStatus\(env, profileId, actor\.entityId\)/);
const gateIndex = gateway.indexOf('ATTACK_PROFILE_WEAPON_NOT_EQUIPPED');
const delegateIndex = gateway.indexOf('const response = await baseWorker.fetch(request, env);', gateIndex);
assert.ok(gateIndex >= 0 && delegateIndex > gateIndex, 'Weapon source gate must happen before the delegated attack can consume Action.');
assert.match(gateway, /onlyAvailable: true/);

// Thin top-level gateway over the existing Story / Runtime chain.
assert.match(gateway, /import baseWorker from '\.\/story-script-gateway\.js'/);
assert.match(gateway, /\/api\\\/gm\\\/items/);
assert.match(gateway, /\/api\\\/gm\\\/characters/);
assert.match(gateway, /\/api\\\/player\\\/characters/);
assert.match(gateway, /\/api\\\/player\\\/combat/);
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);
assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/inventory-weapon-gateway\.js"\s*,?\s*$/m);

// GM and Player surfaces expose the new authority.
assert.match(gmHtml, /gm-inventory-weapons\.js/);
assert.match(playerHtml, /player-inventory-weapons\.js/);
assert.match(gmUi, /Create Weapon Definition/);
assert.match(gmUi, /Attack Profile → Weapon Source/);
assert.match(gmUi, /data-gm-toggle-equip/);
assert.match(playerUi, /data-player-toggle-equip/);
assert.match(playerUi, /Quantity must be a non-negative integer/);

// Production runner is plan-only unless explicit operator credentials enable writes.
assert.match(runner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(runner, /mode: 'plan-only'/);
assert.match(runner, /doesNotStartCombat: true/);
assert.match(runner, /sourceAvailable/);
assert.match(aggregateRunner, /production-alpha-inventory-weapon-e2e\.mjs/);
assert.match(aggregateRunner, /inventory-weapon-foundation/);

// Canonical scope explicitly defers economy and formula invention.
assert.match(doc, /Store \/ Shop \/ Merchant stock/);
assert.match(doc, /Currency or Exchange Rates/);
assert.match(doc, /hand capacity, dual-wield/i);
assert.match(doc, /ATTACK_PROFILE_WEAPON_NOT_EQUIPPED/);

console.log('Inventory / Weapon foundation integration contract passed.');
