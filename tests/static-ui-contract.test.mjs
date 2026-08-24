import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const gmJs = await readFile(new URL('../public/assets/gm-d1.js', import.meta.url), 'utf8');
const gmAttackJs = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const gmStoryJs = await readFile(new URL('../public/assets/gm-story.js', import.meta.url), 'utf8');
const gmMonstersJs = await readFile(new URL('../public/assets/gm-monsters.js', import.meta.url), 'utf8');
const gmMonsterDefenceJs = await readFile(new URL('../public/assets/gm-monster-defence.js', import.meta.url), 'utf8');
const gmBossesJs = await readFile(new URL('../public/assets/gm-bosses.js', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../public/player/index.html', import.meta.url), 'utf8');
const playerCombatJs = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const playerAttackWorker = await readFile(new URL('../src/player-attack.js', import.meta.url), 'utf8');
const combatLife = await readFile(new URL('../src/combat-life.js', import.meta.url), 'utf8');
const lifeCorrection = await readFile(new URL('../src/life-correction.js', import.meta.url), 'utf8');
const scenarioWorker = await readFile(new URL('../src/scenario.js', import.meta.url), 'utf8');
const monsterWorker = await readFile(new URL('../src/monster.js', import.meta.url), 'utf8');
const monsterDefenceWorker = await readFile(new URL('../src/monster-defence.js', import.meta.url), 'utf8');
const monsterDefeatWorker = await readFile(new URL('../src/monster-defeat.js', import.meta.url), 'utf8');
const bossWorker = await readFile(new URL('../src/boss.js', import.meta.url), 'utf8');
const monsterRules = await readFile(new URL('../src/monster-rules.js', import.meta.url), 'utf8');
const monsterLife = await readFile(new URL('../src/monster-life.js', import.meta.url), 'utf8');
const bossRules = await readFile(new URL('../src/boss-rules.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

for (const id of [
  'campaign-name',
  'gm-user-name',
  'gm-user-role',
  'view-dashboard',
  'view-players',
  'view-characters',
  'view-combat',
  'combat-side-link',
  'gm-attack-profile-panel',
  'gm-create-attack-profile',
  'gm-attack-profile-list'
]) {
  assert.match(gmHtml, new RegExp(`id=["']${id}["']`), `GM HTML must contain #${id}`);
}

assert.match(
  gmHtml,
  /id=["']combat-side-link["'][^>]*data-view=["']combat["']|data-view=["']combat["'][^>]*id=["']combat-side-link["']/,
  'Combat navigation button must participate in the shared GM view contract.'
);

assert.ok(!gmJs.includes('dashboard-campaign-name'), 'GM client must not reference the removed #dashboard-campaign-name id.');
assert.match(gmJs, /combat:\s*['"]Combat['"]/, 'Shared GM navigation must recognize the Combat view.');
assert.match(gmJs, /#campaign-name/, 'GM client must use the actual #campaign-name element.');
assert.match(gmHtml, /src=["']\/assets\/gm-attack-profiles\.js["']/, 'GM workspace must load Attack Profile authoring module.');
assert.match(gmAttackJs, /attack-profiles/, 'GM Attack Profile client must use the server-authoritative Profile API.');
assert.match(gmAttackJs, /import\s+['"]\.\/gm-story\.js['"]/, 'GM module chain must load the Story workspace.');
assert.match(gmAttackJs, /import\s+['"]\.\/gm-monsters\.js['"]/, 'GM module chain must load the Monster workspace.');
assert.match(gmAttackJs, /import\s+['"]\.\/gm-monster-defence\.js['"]/, 'GM module chain must load Monster Defence / Armor controls.');
assert.match(gmAttackJs, /import\s+['"]\.\/gm-bosses\.js['"]/, 'GM module chain must load the Boss workspace.');

assert.match(gmStoryJs, /story-side-link/, 'Story client must expose a GM Story navigation entry.');
assert.match(gmStoryJs, /\/api\/gm\/story/, 'Story client must read the server-authoritative Story API.');
assert.match(gmStoryJs, /start-combat/, 'Story client must be able to start Combat from an Encounter.');
assert.match(gmStoryJs, /data-encounter-participant/, 'Story client must manage Encounter Character participants.');

assert.match(gmMonstersJs, /monster-side-link/, 'Monster client must expose a GM Monster navigation entry.');
assert.match(gmMonstersJs, /\/api\/gm\/monsters/, 'Monster client must read the server-authoritative Monster API.');
assert.match(gmMonstersJs, /monster-templates/, 'Monster client must author Templates.');
assert.match(gmMonstersJs, /monster-skills/, 'Monster client must author Common Monster Skills.');
assert.match(gmMonstersJs, /monster-instances/, 'Monster client must spawn / inspect Monster Instances.');
assert.match(gmMonstersJs, /monster-attack/, 'Monster client must expose GM-controlled Monster attack resolution.');

assert.match(gmMonsterDefenceJs, /Stored Defence/, 'Monster Defence UI must expose Dedicated Stored Defence separately from Armor.');
assert.match(gmMonsterDefenceJs, /Armor Defence/, 'Monster Defence UI must expose Armor Defence data.');
assert.match(gmMonsterDefenceJs, /defence-armor/, 'Monster Defence UI must use the dedicated server-authoritative Defence / Armor routes.');
assert.match(gmMonsterDefenceJs, /Armor Defence is not added to the D100 check/, 'GM UI must keep D100 Defence and Armor reduction conceptually separate.');

assert.match(gmBossesJs, /boss-side-link/, 'Boss client must expose a dedicated GM Boss navigation entry.');
assert.match(gmBossesJs, /\/api\/gm\/bosses/, 'Boss client must read the server-authoritative Boss overview.');
assert.match(gmBossesJs, /boss-profiles/, 'Boss client must author Boss Design Profiles.');
assert.match(gmBossesJs, /unique-skills/, 'Boss client must create GM-authored Unique Boss Skills.');
assert.match(gmBossesJs, /save-phases/, 'Boss client must author Phase definitions.');
assert.match(gmBossesJs, /boss-instances/, 'Boss client must spawn and correct Boss Instances.');
assert.match(gmBossesJs, /boss-attack/, 'Boss client must expose GM-controlled Boss attack resolution.');
assert.match(gmBossesJs, /HP0 blocked pending lifecycle/, 'Boss runtime UI must not silently invent the unresolved Boss HP0 rule.');

for (const id of [
  'player-combat-panel',
  'player-combat-round',
  'player-combat-current',
  'player-combat-initiative',
  'player-consume-action',
  'player-consume-move',
  'player-end-turn',
  'player-attack-controls',
  'player-attack-profile',
  'player-attack-target',
  'player-attack',
  'player-attack-result'
]) {
  assert.match(playerHtml, new RegExp(`id=["']${id}["']`), `Player HTML must contain #${id}`);
}

assert.match(playerHtml, /src=["']\/assets\/player-combat\.js["']/, 'Player workspace must load the Player Combat client module.');
assert.match(playerCombatJs, /\/api\/player\/combat/, 'Player Combat client must use the server-authoritative Combat API.');
assert.match(playerCombatJs, /\/attack/, 'Player Combat client must call the dedicated Attack resolver.');
assert.match(playerCombatJs, /consume-action/, 'Player Combat client must expose Action allowance mutation.');
assert.match(playerCombatJs, /consume-move/, 'Player Combat client must expose Move allowance mutation.');
assert.match(playerCombatJs, /end-turn/, 'Player Combat client must expose End Own Turn.');
assert.match(playerCombatJs, /monster_instance/, 'Player Combat target selection must recognize Monster Instance combatants.');
assert.match(playerCombatJs, /MONSTER/, 'Player Combat UI must identify Monster targets explicitly.');
assert.match(playerCombatJs, /Armor/, 'Player Combat result / target UI must expose Monster Armor context.');
assert.match(playerCombatJs, /DEFEATED/, 'Player Combat UI must expose defeated Monster state.');
assert.ok(!/item\.entityType === 'boss_instance'[\s\S]{0,300}return true/.test(playerCombatJs), 'Player target UI must not make Boss Instance attackable before Boss HP0 lifecycle is confirmed.');

assert.match(playerAttackWorker, /controller_user_id/, 'Attack authority must resolve through combatant controller ownership.');
assert.match(playerAttackWorker, /action_available = 0/, 'Base Character attack resolver must reserve and consume the authoritative Action.');
assert.match(playerAttackWorker, /ATTACK_PROFILE_UNAVAILABLE/, 'Attack resolver must reject unapproved or inactive Profiles.');
assert.match(playerAttackWorker, /TARGET_DODGE_REQUIRED/, 'Character target attack resolver must require the Canonical target Dodge Skill.');
assert.match(playerAttackWorker, /effectiveDefence:\s*0/, 'Character target MVP attack path must keep post-hit Effective Defence at zero until Character Armor sources are integrated.');
assert.match(playerAttackWorker, /target\.entityType !== 'character'/, 'Base Player attack resolver must continue refusing non-Character targets because outer entity gateways own those paths.');
assert.match(playerAttackWorker, /character_locked = 1/, 'Death resolution must lock the Character.');
assert.match(combatLife, /last_dying_tick_combat_id/, 'Dying Turn countdown must keep an idempotency marker.');
assert.match(combatLife, /UPDATE combatants[\s\S]*UPDATE combats/, 'Dying-aware Turn transition must mutate Combatant state before advancing the Combat pointer.');
assert.match(lifeCorrection, /life_state = 'alive'/, 'GM HP correction above zero must be able to clear DYING state.');
assert.match(lifeCorrection, /life_state = 'dying'/, 'GM HP correction to zero must enter DYING when CON is valid.');

assert.match(scenarioWorker, /import baseWorker from '\.\/life-correction\.js'/, 'Story gateway must layer over the existing Life correction gateway.');
assert.match(scenarioWorker, /CREATE TABLE IF NOT EXISTS scenarios/, 'Story gateway must persist Scenarios in D1.');
assert.match(scenarioWorker, /CREATE TABLE IF NOT EXISTS scenes/, 'Story gateway must persist Scenes in D1.');
assert.match(scenarioWorker, /CREATE TABLE IF NOT EXISTS encounters/, 'Story gateway must persist Encounters in D1.');
assert.match(scenarioWorker, /encounter_participants/, 'Story gateway must persist Encounter participants.');
assert.match(scenarioWorker, /encounter_combats/, 'Story gateway must link Encounter to Combat without duplicating Combat runtime state.');
assert.match(scenarioWorker, /monster_instance/, 'Encounter participant schema must reserve Monster Instance integration.');
assert.match(scenarioWorker, /boss_instance/, 'Encounter participant schema must reserve Boss Instance integration.');
assert.match(scenarioWorker, /\/api\/gm\/combat\/start/, 'Encounter Combat start must reuse the existing Combat Start resolver.');

assert.match(monsterWorker, /import baseWorker from '\.\/scenario\.js'/, 'Monster gateway must layer over the Scenario gateway.');
assert.match(monsterWorker, /CREATE TABLE IF NOT EXISTS monster_templates/, 'Monster gateway must persist Templates in D1.');
assert.match(monsterWorker, /CREATE TABLE IF NOT EXISTS monster_skill_profiles/, 'Monster gateway must persist Monster Skill Profiles in D1.');
assert.match(monsterWorker, /CREATE TABLE IF NOT EXISTS monster_instances/, 'Monster gateway must persist Monster Instances in D1.');
assert.match(monsterWorker, /entity_type, entity_id/, 'Monster runtime must integrate through the shared Combatant entity model.');
assert.match(monsterWorker, /'monster_instance'/, 'Monster runtime must activate monster_instance Encounter / Combat participation.');
assert.match(monsterWorker, /buildCombatInitiative/, 'Character + Monster Combat must reuse shared Initiative ordering.');
assert.match(monsterWorker, /monster-attack/, 'Monster gateway must expose GM-controlled Monster attack resolution.');
assert.match(monsterWorker, /action_available = 0/, 'Monster attack must reserve the authoritative Action before rolling.');
assert.match(monsterWorker, /TARGET_DODGE_REQUIRED/, 'Monster attack must resolve against Character Canonical Dodge.');
assert.match(monsterWorker, /monster_action_log/, 'Monster attack must preserve runtime audit data.');

assert.match(monsterDefenceWorker, /import baseWorker from '\.\/monster\.js'/, 'Monster Defence gateway must layer over the already-tested Monster runtime.');
assert.match(monsterDefenceWorker, /stored_defence/, 'Monster Defence gateway must persist Dedicated Stored Defence.');
assert.match(monsterDefenceWorker, /armor_base_defence/, 'Monster Defence gateway must preserve Armor base snapshot data.');
assert.match(monsterDefenceWorker, /armor_defence_adjustment/, 'Monster Defence gateway must preserve Instance Armor adjustment data.');
assert.match(monsterDefenceWorker, /final_armor_defence/, 'Monster Defence gateway must persist Final Armor Defence.');
assert.match(monsterDefenceWorker, /snapshotSpawnedDefence/, 'Spawn must snapshot Template Defence / Armor into the Instance.');
assert.match(monsterDefenceWorker, /effectiveD100Defence/, 'Combat payload must expose calculated Effective D100 Defence separately from Armor.');

assert.match(monsterDefeatWorker, /import baseWorker from '\.\/monster-defence\.js'/, 'Monster Defeat gateway must layer over the confirmed Defence / Armor runtime.');
assert.match(monsterDefeatWorker, /monsterEffectiveD100Defence/, 'Player → Monster resolver must use Dedicated Stored Defence.');
assert.match(monsterDefeatWorker, /monsterFinalArmorDefence/, 'Player → Monster resolver must use Monster Armor after a successful hit.');
assert.match(monsterDefeatWorker, /action_available = 0/, 'Player → Monster attack must reserve the authoritative Player Action.');
assert.match(monsterDefeatWorker, /player_monster_action_log/, 'Player → Monster attack must preserve a dedicated audit trail.');
assert.match(monsterDefeatWorker, /status = \?/, 'Player-origin damage must persist Monster status together with HP.');
assert.match(monsterDefeatWorker, /MONSTER_TARGET_NOT_ACTIVE/, 'Defeated / removed Monsters must reject normal Player attacks.');
assert.match(monsterDefeatWorker, /reconcileMonsterStatusFromHp/, 'GM HP correction must reconcile active / defeated status.');
assert.match(monsterDefeatWorker, /move_available = 0/, 'Defeated Monsters must lose ordinary Action / Move allowances in active Combat.');

assert.match(monsterLife, /statusAfter: hpAfter <= 0 \? 'defeated' : 'active'/, 'Ordinary Monster HP0 must resolve immediately to defeated.');
assert.ok(!/dying/i.test(monsterLife), 'Ordinary Monster life helper must not inherit Player DYING semantics.');
assert.match(monsterLife, /currentStatus === 'removed'/, 'GM HP correction must not silently revive removed Monsters.');

assert.match(monsterRules, /\(\(value - 1\) \/ 21\.7\) \*\* 2/, 'Monster rules must use the locked global Attribute growth curve.');
assert.match(monsterRules, /7 \* \(\(\(value - 1\) \/ 99\) \*\* 1\.5\)/, 'Monster rules must use the locked damage growth curve.');
assert.match(monsterRules, /level1:[\s\S]*min: -2,[\s\S]*max: 2/, 'Monster Spread tuning must keep the documented low-Level MVP anchor centralized.');
assert.match(monsterRules, /level100:[\s\S]*min: -5,[\s\S]*max: 15/, 'Monster Spread tuning must keep the documented high-Level MVP anchor centralized.');
assert.match(monsterRules, /monsterEffectiveD100Defence/, 'Monster rules must centralize the Dedicated Stored Defence cap calculation.');
assert.match(monsterRules, /monsterFinalArmorDefence/, 'Monster rules must centralize the Armor base + adjustment calculation.');

assert.match(bossWorker, /import baseWorker from '\.\/monster-defeat\.js'/, 'Boss gateway must layer over the completed ordinary Monster combat loop.');
assert.match(bossWorker, /CREATE TABLE IF NOT EXISTS boss_design_profiles/, 'Boss runtime must persist Boss Design Profiles.');
assert.match(bossWorker, /CREATE TABLE IF NOT EXISTS boss_instances/, 'Boss runtime must persist Boss Instances separately from Profiles.');
assert.match(bossWorker, /CREATE TABLE IF NOT EXISTS boss_instance_skills/, 'Boss runtime must snapshot executable Boss Skills.');
assert.match(bossWorker, /CREATE TABLE IF NOT EXISTS boss_instance_phases/, 'Boss runtime must snapshot Boss Phase definitions.');
assert.match(bossWorker, /source_scope = 'boss'|source_scope,'boss'|source_scope,source_template_id/, 'Boss runtime must reuse the Monster Skill Profile model for unique Boss Skills.');
assert.match(bossWorker, /buildCombatInitiative/, 'Boss Instance must join the shared Character / Monster Combat Initiative resolver.');
assert.match(bossWorker, /entityType:'boss_instance'|entityType: 'boss_instance'/, 'Boss runtime must activate boss_instance Combat participation.');
assert.match(bossWorker, /boss-attack/, 'Boss runtime must expose GM-controlled Boss attack resolution.');
assert.match(bossWorker, /action_available=0|action_available = 0/, 'Boss attacks must reserve the authoritative Action.');
assert.match(bossWorker, /currentHp.*min:1|Current HP.*min:1/, 'Boss runtime correction must block HP0 until the Boss lifecycle is confirmed.');
assert.match(bossWorker, /boss_action_log/, 'Boss attack must preserve an audit trail.');

assert.match(bossRules, /calculateBossProfile/, 'Boss rules must centralize baseline → override → final calculation.');
assert.match(bossRules, /effectiveMonsterAttribute/, 'Boss Attribute baseline must reuse shared Monster Attribute mathematics.');
assert.match(bossRules, /monsterCalculatedResources/, 'Boss HP / MP baseline must reuse shared Monster resource mathematics.');
assert.match(bossRules, /bossPhaseApplicability/, 'Boss rules must centralize Phase applicability without forcing transition.');
assert.match(bossRules, /validateBossPhases/, 'Boss Phase definitions must be validated centrally.');

assert.match(wrangler, /"main"\s*:\s*"\.\/src\/boss\.js"/, 'Wrangler must route through the Boss runtime gateway.');
