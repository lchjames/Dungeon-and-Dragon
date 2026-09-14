import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAbilityDefinition, resolveAbilityUsability, MAGIC_ABILITY_ATTRIBUTE_TYPES } from '../src/ability-rules.js';

assert.deepEqual(MAGIC_ABILITY_ATTRIBUTE_TYPES, ['LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD']);

assert.throws(
  () => normalizeAbilityDefinition({ canonicalNameZh:'斬擊', attributeType:'PHYSICAL', rankCode:'3', abilityType:'ABILITY' }),
  error => error?.code === 'ABILITY_PHYSICAL_MASTERY_REQUIRED'
);

const physical = normalizeAbilityDefinition({
  canonicalNameZh:'三階劍技', attributeType:'PHYSICAL', rankCode:'3', abilityType:'ABILITY', physicalSourceCategory:'SWORD'
});
const character = { status:'active', level:10 };
let usage = resolveAbilityUsability(physical, character, 9, 2);
assert.equal(usage.usable, false);
assert.equal(usage.blockers[0]?.code, 'PHYSICAL_MASTERY_RANK_INSUFFICIENT');
assert.equal(usage.currentAttributeRank, null);
assert.equal(usage.currentMasteryRank, 2);
assert.equal(usage.requiredMasteryType, 'SWORD');
usage = resolveAbilityUsability(physical, character, 0, 3);
assert.equal(usage.usable, true);

const fire = normalizeAbilityDefinition({ canonicalNameZh:'火球', attributeType:'FIRE', rankCode:'3', abilityType:'ABILITY' });
assert.equal(resolveAbilityUsability(fire, character, 2, 9).usable, false);
assert.equal(resolveAbilityUsability(fire, character, 3, 0).usable, true);

const authority = await readFile(new URL('../src/ability-authority.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/ability-gateway.js', import.meta.url), 'utf8');
const masteryAuthority = await readFile(new URL('../src/physical-mastery-authority.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0034_physical_mastery_correction.sql', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-abilities.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-abilities.js', import.meta.url), 'utf8');

assert.match(authority, /MAGIC_ABILITY_ATTRIBUTE_TYPES\.map/);
assert.match(authority, /attribute_type <> 'PHYSICAL'/);
assert.doesNotMatch(authority, /ABILITY_ATTRIBUTE_TYPES\.map/);
assert.match(gateway, /PHYSICAL_PROGRESSION_REMOVED/);
assert.match(gateway, /physical-masteries/);
assert.match(gateway, /abilityProgression: rawProgression\.filter\(row => row\.attributeType !== 'PHYSICAL'\)/);
assert.match(masteryAuthority, /character_physical_masteries/);
assert.match(masteryAuthority, /character_physical_mastery_log/);
assert.match(masteryAuthority, /PHYSICAL_MASTERY_STALE/);
assert.doesNotMatch(masteryAuthority, /auto.*rank/i);
assert.match(migration, /CREATE TABLE IF NOT EXISTS character_physical_masteries/);
assert.doesNotMatch(migration, /DELETE\s+FROM\s+character_element_progression/i);
assert.doesNotMatch(migration, /DROP\s+TABLE/i);
assert.match(playerUi, /MAGIC_ATTRIBUTE_ORDER/);
assert.match(playerUi, /physicalMasteries/);
assert.match(gmUi, /MAGIC_ATTRIBUTES/);
assert.match(gmUi, /八元素 Rank \/ 修習進度/);
assert.match(gmUi, /Physical Mastery Rank \/ 修習進度/);
assert.doesNotMatch(gmUi, /九屬性 Rank \/ 修習進度/);

console.log('Physical Mastery correction contract passed.');
