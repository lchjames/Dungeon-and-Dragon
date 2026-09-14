import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ABILITY_DEFAULT_MP_COSTS,
  defaultAbilityMpCost,
  normalizeAbilityMpCost,
  resolveAbilityResourceAffordability
} from '../src/ability-rules.js';

assert.deepEqual(ABILITY_DEFAULT_MP_COSTS, { '1':1, '2':5, '3':10, '4':20, '5':40, '6':80, '7':160, '8':320, '9':640 });
assert.equal(defaultAbilityMpCost('1'), 1);
assert.equal(defaultAbilityMpCost(9), 640);
assert.equal(defaultAbilityMpCost('SPECIAL'), null);
assert.equal(normalizeAbilityMpCost(20, { required:true }), 20);
assert.throws(() => normalizeAbilityMpCost(null, { required:true }), error => error?.code === 'ABILITY_MP_COST_REQUIRED');
assert.throws(() => normalizeAbilityMpCost(0, { required:true }), error => error?.code === 'ABILITY_MP_COST_INVALID');
assert.throws(() => normalizeAbilityMpCost(2.5, { required:true }), error => error?.code === 'ABILITY_MP_COST_INVALID');

const ranked = { rankCode:'4', mpCost:18 };
assert.deepEqual(resolveAbilityResourceAffordability(ranked, 18, 30), {
  status:'AFFORDABLE', affordable:true, mpCost:18, referenceMpCost:20, currentMp:18, maxMp:30
});
assert.equal(resolveAbilityResourceAffordability(ranked, 17, 30).status, 'INSUFFICIENT_MP');
assert.equal(resolveAbilityResourceAffordability({ rankCode:'4', mpCost:null }, 30, 30).status, 'PENDING_PROFILE');
assert.equal(resolveAbilityResourceAffordability(ranked, null, null).status, 'MP_RESOURCE_MISSING');
assert.equal(resolveAbilityResourceAffordability(ranked, 31, 30).status, 'MP_RESOURCE_INVALID');
assert.deepEqual(resolveAbilityResourceAffordability({ rankCode:'SPECIAL', mpCost:75 }, 100, 100), {
  status:'AFFORDABLE', affordable:true, mpCost:75, referenceMpCost:null, currentMp:100, maxMp:100
});

const schema = await readFile(new URL('../src/ability-schema.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0035_ability_mp_cost_authority.sql', import.meta.url), 'utf8');
const authority = await readFile(new URL('../src/ability-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/ability-gateway.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-abilities.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-abilities.js', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/ABILITY_MP_COST_AUTHORITY_ALPHA.md', import.meta.url), 'utf8');

assert.match(schema, /CREATE TABLE IF NOT EXISTS ability_resource_profiles/);
assert.match(schema, /CHECK \(mp_cost >= 1\)/);
assert.match(migration, /ability_resource_profiles/);
assert.doesNotMatch(migration, /UPDATE\s+ability_resource_profiles[\s\S]*reference/i);
assert.doesNotMatch(migration, /INSERT[\s\S]*SELECT[\s\S]*rank_code/i);
assert.doesNotMatch(migration, /DELETE\s+FROM|DROP\s+TABLE/i);

assert.match(authority, /normalizeAbilityMpCost\(input\?\.mpCost \?\? input\?\.mp_cost, \{ required: true \}\)/);
assert.match(authority, /INSERT INTO ability_resource_profiles/);
assert.match(authority, /ON CONFLICT\(ability_definition_id\) DO UPDATE SET/);
assert.match(authority, /mpCost: definition\.mpCost \?\? null/);
assert.match(authority, /resourceProfileStatus: mpCost === null \? 'PENDING' : 'APPROVED'/);
assert.match(authority, /LEFT JOIN ability_resource_profiles rp/);

assert.match(gateway, /characterMpState/);
assert.match(gateway, /resolveAbilityResourceAffordability/);
assert.match(gateway, /activationResource/);
assert.match(gateway, /abilityResource: mpState/);
assert.doesNotMatch(gateway, /UPDATE\s+character_resources/);
assert.doesNotMatch(gateway, /action_available\s*=\s*0/);
assert.doesNotMatch(gateway, /\/activate|\/cast/);

assert.match(gmUi, /Approved MP Cost/);
assert.match(gmUi, /DEFAULT_MP_COSTS/);
assert.match(gmUi, /SPECIAL 沒有固定Rank Reference/);
assert.match(gmUi, /mpCost/);
assert.match(gmUi, /今個slice只顯示MP affordability，唔會扣MP或消耗Action/);
assert.match(playerUi, /activationResource/);
assert.match(playerUi, /目前MP不足/);
assert.match(playerUi, /MP成本待GM批准/);

assert.match(doc, /reference value is exposed as `referenceMpCost`/);
assert.match(doc, /MUST NOT overwrite or recalculate `mpCost`/);
assert.match(doc, /does \*\*not\*\*:/);
assert.match(doc, /spend MP/);
assert.match(doc, /consume Combat Action/);
assert.match(doc, /half-cast route/i);
assert.match(doc, /plan-only/);

console.log('Ability MP cost authority, approved profile and read-only affordability contract passed.');
