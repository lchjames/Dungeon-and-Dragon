import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCombatInitiative } from '../src/rules.js';
import { dyingRoundsFromCon, resolveDamage, resolveOpposedD100 } from '../src/combat-rules.js';
import { isMonsterActionable, resolveMonsterHpDamage } from '../src/monster-life.js';
import { isBossActionable, resolveBossHpDamage } from '../src/boss-life.js';

const scenario = await readFile(new URL('../src/scenario.js', import.meta.url), 'utf8');
const monster = await readFile(new URL('../src/monster.js', import.meta.url), 'utf8');
const monsterDefence = await readFile(new URL('../src/monster-defence.js', import.meta.url), 'utf8');
const monsterDefeat = await readFile(new URL('../src/monster-defeat.js', import.meta.url), 'utf8');
const boss = await readFile(new URL('../src/boss.js', import.meta.url), 'utf8');
const bossRuntime = await readFile(new URL('../src/boss-runtime.js', import.meta.url), 'utf8');
const bossDefeat = await readFile(new URL('../src/boss-defeat.js', import.meta.url), 'utf8');
const combatState = await readFile(new URL('../src/combat-state.js', import.meta.url), 'utf8');
const playerCombat = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const gmStory = await readFile(new URL('../public/assets/gm-story.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

// Production gateway chain: the playable Scenario must pass through every runtime layer.
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/boss-defeat\.js"/);
assert.match(bossDefeat, /import baseWorker from '\.\/boss-runtime\.js'/);
assert.match(bossRuntime, /import baseWorker from '\.\/boss\.js'/);
assert.match(boss, /import baseWorker from '\.\/monster-defeat\.js'/);
assert.match(monsterDefeat, /import baseWorker from '\.\/monster-defence\.js'/);
assert.match(monsterDefence, /import baseWorker from '\.\/monster\.js'/);
assert.match(monster, /import baseWorker from '\.\/scenario\.js'/);

// Story foundation: Scenario -> Scene -> Encounter -> participants -> optional Combat.
for (const table of ['scenarios', 'scenes', 'encounters', 'encounter_participants', 'encounter_combats']) {
  assert.match(scenario, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(scenario, /'planned', 'active', 'resolved', 'skipped'/);
assert.ok(scenario.includes('startEncounterCombat') && scenario.includes('start-combat'), 'Story gateway must expose Encounter Combat start.');
assert.match(scenario, /UPDATE encounters SET status = 'active'/);
assert.match(gmStory, /data-story-action="start-combat"/);
assert.match(gmStory, /data-encounter-status/);
assert.match(gmStory, /data-encounter-resolution/);

// Encounter spawning and shared Initiative must include both hostile Instance types.
assert.match(monster, /'monster_instance'/);
assert.match(monster, /extendedEncounterStart/);
assert.match(monster, /buildCombatInitiative/);
assert.match(boss, /'boss_instance'/);
assert.match(boss, /addBossToEncounterCombat/);
assert.match(boss, /buildCombatInitiative/);

// Boss preflight must validate Boss state before delegating to the lower start-combat layer.
const bossPreflight = bossRuntime.indexOf("SELECT id,display_name,status,current_hp FROM boss_instances");
const bossDelegate = bossRuntime.indexOf('const response=await baseWorker.fetch(request,env);', bossPreflight);
assert.ok(bossPreflight >= 0 && bossDelegate > bossPreflight, 'Boss Encounter Combat must preflight Boss state before starting the lower-layer Combat.');
assert.match(bossRuntime, /BOSS_INSTANCE_NOT_ACTIVE/);
assert.match(bossRuntime, /cleanupFailedEncounterStart/);
assert.ok(bossRuntime.includes('DELETE FROM encounter_combats WHERE encounter_id=? AND combat_id=?'), 'Failed Boss augmentation must unlink a newly-created Encounter Combat.');

// Player side must be able to target both active Monster and active Boss combatants.
assert.match(playerCombat, /monster_instance/);
assert.match(playerCombat, /boss_instance/);
assert.match(playerCombat, /boss_stored_defence/);
assert.match(playerCombat, /monster_stored_defence/);

// Combat can be completed explicitly by the GM without silently resolving the Encounter.
assert.match(combatState, /SET status = 'ended'/);
assert.ok(combatState.includes('endCombat') && combatState.includes('/end'), 'Combat gateway must expose explicit GM End Combat.');
assert.doesNotMatch(combatState, /UPDATE encounters[\s\S]{0,200}status\s*=\s*'resolved'/);

// Deterministic vertical-slice domain smoke: Character + Monster + Boss share Initiative.
const initiative = buildCombatInitiative([
  { id: 'character:c1', entityType: 'character', dex: 16 },
  { id: 'monster_instance:m1', entityType: 'monster_instance', dex: 12 },
  { id: 'boss_instance:b1', entityType: 'boss_instance', dex: 14 }
], () => 0);
assert.deepEqual(initiative.map(item => item.id), ['character:c1', 'boss_instance:b1', 'monster_instance:m1']);
assert.deepEqual(initiative.map(item => item.initiativeOrder), [0, 1, 2]);

// One opposed D100 hit enters the shared fixed-defence Damage pipeline.
const opposed = resolveOpposedD100(
  { roll: 80, skillValue: 70, modifier: 0 },
  { roll: 20, skillValue: 40, modifier: 0 }
);
assert.equal(opposed.sourceWins, true);
const damage = resolveDamage({ damageDiceTotal: 18, fixedDamageModifier: 2, damageBonusTotal: 0, effectiveDefence: 5 });
assert.deepEqual(damage, { rawDamage: 20, effectiveDefence: 5, damageResult: 15, hpDamage: 15 });

// Ordinary Monster and Boss both resolve HP0 immediately, while Player DYING remains Character-only.
const monsterDefeatState = resolveMonsterHpDamage(10, damage.hpDamage);
assert.equal(monsterDefeatState.hpAfter, 0);
assert.equal(monsterDefeatState.statusAfter, 'defeated');
assert.equal(isMonsterActionable(monsterDefeatState.statusAfter, monsterDefeatState.hpAfter), false);

const bossDefeatState = resolveBossHpDamage(12, damage.hpDamage);
assert.equal(bossDefeatState.hpAfter, 0);
assert.equal(bossDefeatState.statusAfter, 'defeated');
assert.equal(isBossActionable(bossDefeatState.statusAfter, bossDefeatState.hpAfter), false);

assert.equal(dyingRoundsFromCon(12), 3);
