import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('schema/0032_ability_definition_grant_authority.sql', 'utf8');
const rules = readFileSync('src/ability-rules.js', 'utf8');
const authority = readFileSync('src/ability-authority.js', 'utf8');
const gateway = readFileSync('src/ability-gateway.js', 'utf8');
const wrangler = readFileSync('wrangler.jsonc', 'utf8');
const playerAbilities = readFileSync('public/assets/player-abilities.js', 'utf8');
const playerInventory = readFileSync('public/assets/player-inventory-weapons.js', 'utf8');
const gmAbilities = readFileSync('public/assets/gm-abilities.js', 'utf8');
const gmHtml = readFileSync('public/gm/index.html', 'utf8');
const doc = readFileSync('docs/ABILITY_DEFINITION_GRANT_AUTHORITY_ALPHA.md', 'utf8');

assert.match(migration, /CREATE TABLE IF NOT EXISTS ability_definitions/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS character_acquired_abilities/);
assert.match(migration, /UNIQUE \(character_id, ability_definition_id\)/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS ability_definition_revision_history/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS character_ability_grant_log/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS character_element_progression/);
assert.match(migration, /'PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD'/);

assert.match(rules, /ABILITY_CLASSIFICATION_REQUIRED/);
assert.match(rules, /ATTRIBUTE_RANK_INSUFFICIENT/);
assert.match(rules, /ABILITY_SPECIAL_USAGE_POLICY_PENDING/);
assert.match(rules, /ABILITY_ADDITIONAL_PREREQUISITES_PENDING/);
assert.doesNotMatch(rules, /Rank 10/);

assert.match(authority, /LEFT JOIN character_acquired_abilities aa ON aa\.legacy_character_ability_id = ca\.id/);
assert.match(authority, /'PRIVATE', 'active', 'NEEDS_CLASSIFICATION'/);
assert.match(authority, /'LEGACY_IMPORT'/);
assert.match(authority, /acquisition_mode, grant_source_type/);
assert.match(authority, /'GM_GRANT'/);
assert.match(authority, /SELECT id FROM character_acquired_abilities WHERE character_id=\? AND ability_definition_id=\?/);
assert.doesNotMatch(authority, /DELETE FROM character_acquired_abilities/);
assert.doesNotMatch(authority, /UPDATE character_abilities SET/);

assert.match(gateway, /import baseWorker from '\.\/inventory-weapon-gateway\.js'/);
assert.match(gateway, /\/api\\\/gm\\\/abilities/);
assert.match(gateway, /abilities\\\/grants/);
assert.match(gateway, /\/api\\\/player\\\/characters/);
assert.match(gateway, /character_locked/);
assert.match(gateway, /CHARACTER_LOCKED_DEAD/);
assert.doesNotMatch(gateway, /request\.method === 'DELETE'/);

assert.match(wrangler, /"main": "\.\/src\/ability-gateway\.js"/);
assert.match(playerInventory, /import '\.\/player-abilities\.js'/);
assert.match(playerAbilities, /\['ALL', \.\.\.ATTRIBUTE_ORDER\]/);
assert.match(playerAbilities, /待 GM 分類（Legacy）/);
assert.match(playerAbilities, /\/abilities`/);
assert.doesNotMatch(playerAbilities, /\/api\/gm\/abilities/);

assert.match(gmHtml, /\/assets\/gm-abilities\.js/);
assert.match(gmAbilities, /Ability Definition \/ Grant Authority/);
assert.match(gmAbilities, /\/api\/gm\/abilities/);
assert.match(gmAbilities, /abilities\/grants/);
assert.match(gmAbilities, /本slice不提供 ungrant/);

assert.match(doc, /acquired != usable/);
assert.match(doc, /No ungrant in this slice/);
assert.match(doc, /SPECIAL/);
assert.match(doc, /plan-only/);

console.log('Ability authority contract passed.');
