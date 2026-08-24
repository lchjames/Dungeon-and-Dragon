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
const bossRuntimeWorker = await readFile(new URL('../src/boss-runtime.js', import.meta.url), 'utf8');
const bossDefeatWorker = await readFile(new URL('../src/boss-defeat.js', import.meta.url), 'utf8');
const monsterRules = await readFile(new URL('../src/monster-rules.js', import.meta.url), 'utf8');
const monsterLife = await readFile(new URL('../src/monster-life.js', import.meta.url), 'utf8');
const bossRules = await readFile(new URL('../src/boss-rules.js', import.meta.url), 'utf8');
const bossLife = await readFile(new URL('../src/boss-life.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

for (const id of [
  'campaign-name', 'gm-user-name', 'gm-user-role', 'view-dashboard', 'view-players',
  'view-characters', 'view-combat', 'combat-side-link', 'gm-attack-profile-panel',
  'gm-create-attack-profile', 'gm-attack-profile-list'
]) {
  assert.match(gmHtml, new RegExp(`id=["']${id}["']`), `GM HTML must contain #${id}`);
}
assert.match(gmHtml, /src=["']\/assets\/gm-attack-profiles\.js["']/, 'GM workspace must load the GM module chain.');
assert.ok(!gmJs.includes('dashboard-campaign-name'), 'GM client must not reference removed Dashboard ids.');
assert.match(gmJs, /combat:\s*['"]Combat['"]/, 'Shared GM navigation must recognize Combat.');
assert.match(gmAttackJs, /import\s+['"]\.\/gm-story\.js['"]/, 'GM module chain must load Story.');
assert.match(gmAttackJs, /import\s+['"]\.\/gm-monsters\.js['"]/, 'GM module chain must load Monsters.');
assert.match(gmAttackJs, /import\s+['"]\.\/gm-monster-defence\.js['"]/, 'GM module chain must load Monster Defence / Armor.');
assert.match(gmAttackJs, /import\s+['"]\.\/gm-bosses\.js['"]/, 'GM module chain must load Bosses.');

assert.match(gmStoryJs, /story-side-link/, 'Story UI must expose navigation.');
assert.match(gmStoryJs, /\/api\/gm\/story/, 'Story UI must read D1-authoritative Story data.');
assert.match(gmStoryJs, /start-combat/, 'Story UI must start Encounter Combat through server routes.');
assert.match(gmStoryJs, /data-encounter-participant/, 'Story UI must manage Encounter participants.');

assert.match(gmMonstersJs, /monster-side-link/, 'Monster UI must expose navigation.');
assert.match(gmMonstersJs, /monster-templates/, 'Monster UI must author Templates.');
assert.match(gmMonstersJs, /monster-skills/, 'Monster UI must author Common Skills.');
assert.match(gmMonstersJs, /monster-instances/, 'Monster UI must manage Instances.');
assert.match(gmMonstersJs, /monster-attack/, 'Monster UI must expose GM Monster attacks.');
assert.match(gmMonsterDefenceJs, /Stored Defence/, 'Monster UI must expose Dedicated Stored Defence.');
assert.match(gmMonsterDefenceJs, /Armor Defence/, 'Monster UI must expose Armor Defence separately.');
assert.match(gmMonsterDefenceJs, /defence-armor/, 'Monster Defence / Armor must use server-authoritative routes.');

assert.match(gmBossesJs, /boss-side-link/, 'Boss UI must expose a dedicated workspace.');
assert.match(gmBossesJs, /\/api\/gm\/bosses/, 'Boss UI must read D1-authoritative Boss data.');
assert.match(gmBossesJs, /boss-profiles/, 'Boss UI must author Boss Design Profiles.');
assert.match(gmBossesJs, /unique-skills/, 'Boss UI must author Unique Boss Skills.');
assert.match(gmBossesJs, /save-phases/, 'Boss UI must author Phase definitions.');
assert.match(gmBossesJs, /boss-instances/, 'Boss UI must spawn and correct Boss Instances.');
assert.match(gmBossesJs, /boss-attack/, 'Boss UI must expose GM Boss attacks.');
assert.match(gmBossesJs, /Current HP \(0 = defeated\)/, 'Boss UI must expose the confirmed HP0 immediate-defeat meaning.');
assert.match(gmBossesJs, /data-bi-hp type=\"number\" min=\"0\"/, 'Boss GM Current HP correction must permit zero.');
assert.ok(!gmBossesJs.includes('HP0 blocked pending lifecycle'), 'Boss UI must not retain pre-decision HP0 wording.');

for (const id of [
  'player-combat-panel', 'player-combat-round', 'player-combat-current',
  'player-combat-initiative', 'player-consume-action', 'player-consume-move',
  'player-end-turn', 'player-attack-controls', 'player-attack-profile',
  'player-attack-target', 'player-attack', 'player-attack-result'
]) {
  assert.match(playerHtml, new RegExp(`id=["']${id}["']`), `Player HTML must contain #${id}`);
}
assert.match(playerHtml, /src=["']\/assets\/player-combat\.js["']/, 'Player workspace must load Combat UI.');
assert.match(playerCombatJs, /\/api\/player\/combat/, 'Player Combat must use server-authoritative Combat APIs.');
assert.match(playerCombatJs, /monster_instance/, 'Player Combat must recognize Monster targets.');
assert.match(playerCombatJs, /boss_instance/, 'Player Combat must recognize Boss targets.');
assert.match(playerCombatJs, /· MONSTER ·/, 'Player target selector must label Monster targets.');
assert.match(playerCombatJs, /· BOSS ·/, 'Player target selector must label Boss targets.');
assert.match(playerCombatJs, /Boss Defence/, 'Player results must distinguish Boss Defence.');
assert.match(playerCombatJs, /boss_stored_defence/, 'Player results must recognize Boss Stored Defence source.');
assert.match(playerCombatJs, /DEFEATED/, 'Player Combat must expose defeated hostile state.');
assert.match(playerCombatJs, /item\.entityType === 'monster_instance' \|\| item\.entityType === 'boss_instance'/, 'Active Monster and Boss targets must share hostile target eligibility.');

assert.match(playerAttackWorker, /controller_user_id/, 'Base Character attacks must resolve controller authority.');
assert.match(playerAttackWorker, /action_available = 0/, 'Base Character attacks must reserve Action.');
assert.match(playerAttackWorker, /TARGET_DODGE_REQUIRED/, 'Character targets must use Canonical Dodge.');
assert.match(playerAttackWorker, /target\.entityType !== 'character'/, 'Outer entity gateways must continue owning Monster/Boss target paths.');
assert.match(combatLife, /last_dying_tick_combat_id/, 'Character DYING countdown must remain idempotent.');
assert.match(lifeCorrection, /life_state = 'alive'/, 'GM Character HP correction may revive DYING to ALIVE.');
assert.match(lifeCorrection, /life_state = 'dying'/, 'Character HP0 correction must preserve Player DYING semantics.');

assert.match(scenarioWorker, /CREATE TABLE IF NOT EXISTS scenarios/, 'Story gateway must persist Scenarios.');
assert.match(scenarioWorker, /CREATE TABLE IF NOT EXISTS scenes/, 'Story gateway must persist Scenes.');
assert.match(scenarioWorker, /CREATE TABLE IF NOT EXISTS encounters/, 'Story gateway must persist Encounters.');
assert.match(scenarioWorker, /encounter_participants/, 'Story gateway must persist Encounter participants.');
assert.match(scenarioWorker, /encounter_combats/, 'Story gateway must link Encounter to Combat.');
assert.match(scenarioWorker, /monster_instance/, 'Encounter participant model must reserve Monster Instance.');
assert.match(scenarioWorker, /boss_instance/, 'Encounter participant model must reserve Boss Instance.');

assert.match(monsterWorker, /import baseWorker from '\.\/scenario\.js'/, 'Monster gateway must layer over Story.');
assert.match(monsterWorker, /CREATE TABLE IF NOT EXISTS monster_templates/, 'Monster gateway must persist Templates.');
assert.match(monsterWorker, /CREATE TABLE IF NOT EXISTS monster_instances/, 'Monster gateway must persist Instances.');
assert.match(monsterWorker, /buildCombatInitiative/, 'Monster combat must reuse shared Initiative.');
assert.match(monsterWorker, /monster-attack/, 'Monster runtime must expose GM attacks.');
assert.match(monsterDefenceWorker, /stored_defence/, 'Monster Defence gateway must persist Stored Defence.');
assert.match(monsterDefenceWorker, /final_armor_defence/, 'Monster Defence gateway must persist Final Armor Defence.');
assert.match(monsterDefeatWorker, /monsterEffectiveD100Defence/, 'Player → Monster must use Dedicated Stored Defence.');
assert.match(monsterDefeatWorker, /monsterFinalArmorDefence/, 'Player → Monster must use Monster Armor post-hit.');
assert.match(monsterDefeatWorker, /player_monster_action_log/, 'Player → Monster must preserve audit.');
assert.match(monsterDefeatWorker, /move_available = 0/, 'Defeated Monster must lose ordinary allowances.');
assert.match(monsterLife, /statusAfter: hpAfter <= 0 \? 'defeated' : 'active'/, 'Monster HP0 must immediately defeat.');
assert.ok(!/dying/i.test(monsterLife), 'Ordinary Monster life helper must not inherit Player DYING.');

assert.match(monsterRules, /\(\(value - 1\) \/ 21\.7\) \*\* 2/, 'Monster Attribute growth curve must remain centralized.');
assert.match(monsterRules, /7 \* \(\(\(value - 1\) \/ 99\) \*\* 1\.5\)/, 'Monster damage growth curve must remain centralized.');
assert.match(monsterRules, /monsterEffectiveD100Defence/, 'Monster D100 Defence must remain centralized.');
assert.match(monsterRules, /monsterFinalArmorDefence/, 'Monster Armor calculation must remain centralized.');

assert.match(bossWorker, /import baseWorker from '\.\/monster-defeat\.js'/, 'Boss feature gateway must layer over completed Monster runtime.');
assert.match(bossWorker, /CREATE TABLE IF NOT EXISTS boss_design_profiles/, 'Boss runtime must persist Design Profiles.');
assert.match(bossWorker, /CREATE TABLE IF NOT EXISTS boss_instances/, 'Boss runtime must persist Instances separately.');
assert.match(bossWorker, /CREATE TABLE IF NOT EXISTS boss_instance_skills/, 'Boss runtime must snapshot executable Skills.');
assert.match(bossWorker, /CREATE TABLE IF NOT EXISTS boss_instance_phases/, 'Boss runtime must snapshot Phases.');
assert.match(bossWorker, /buildCombatInitiative/, 'Boss must join shared Character / Monster Initiative.');
assert.match(bossWorker, /boss-attack/, 'Boss runtime must expose GM attacks.');
assert.match(bossWorker, /boss_action_log/, 'Boss → Character attacks must preserve audit.');

assert.match(bossRuntimeWorker, /import baseWorker from '\.\/boss\.js'/, 'Hardened Boss authoring must layer over Boss feature gateway.');
assert.match(bossRuntimeWorker, /hasOwnProperty/, 'Boss Profile PATCH must distinguish cleared vs omitted nullable overrides.');
assert.match(bossRuntimeWorker, /vals\.length !== 57|vals\.length!==57/, 'Boss Profile INSERT must guard 57-value D1 bind contract.');
assert.match(bossRuntimeWorker, /vals\.length !== 55|vals\.length!==55/, 'Boss Profile UPDATE must guard 55-value D1 bind contract.');
assert.match(bossRuntimeWorker, /bossVals\.length !== 27|bossVals\.length!==27/, 'Boss Instance spawn must guard 27-value D1 bind contract.');
assert.match(bossRuntimeWorker, /Array\(57\)\.fill\('\?'\)/, 'Boss Profile placeholder count must match bind contract.');

assert.match(bossDefeatWorker, /import baseWorker from '\.\/boss-runtime\.js'/, 'Boss defeat gateway must layer over hardened Boss runtime.');
assert.match(bossDefeatWorker, /bossInstanceDefence/, 'Player → Boss must use Boss Stored Defence / Armor.');
assert.match(bossDefeatWorker, /resolveBossHpDamage/, 'Player → Boss must use Boss HP0 helper.');
assert.match(bossDefeatWorker, /player_boss_action_log/, 'Player → Boss must preserve dedicated audit.');
assert.match(bossDefeatWorker, /BOSS_TARGET_NOT_ACTIVE/, 'Defeated / removed Boss must reject normal targeting.');
assert.match(bossDefeatWorker, /reconcileBossStatusFromHp/, 'GM Boss HP correction must reconcile active / defeated.');
assert.match(bossDefeatWorker, /move_available = 0/, 'Defeated Boss must lose ordinary allowances.');
assert.match(bossDefeatWorker, /min: 0, max: maxHp/, 'Boss GM Current HP correction must permit zero.');
assert.match(bossLife, /statusAfter: hpAfter <= 0 \? 'defeated' : 'active'/, 'Boss HP0 must immediately defeat.');
assert.ok(!/dying/i.test(bossLife), 'Boss life helper must not inherit Player DYING.');

assert.match(bossRules, /calculateBossProfile/, 'Boss rules must centralize baseline → override → final.');
assert.match(bossRules, /effectiveMonsterAttribute/, 'Boss baseline must reuse Monster Attribute mathematics.');
assert.match(bossRules, /monsterCalculatedResources/, 'Boss baseline must reuse Monster resource mathematics.');
assert.match(bossRules, /bossPhaseApplicability/, 'Boss Phase applicability must remain advisory.');
assert.match(bossRules, /validateBossPhases/, 'Boss Phase definitions must be validated centrally.');

assert.match(wrangler, /"main"\s*:\s*"\.\/src\/boss-defeat\.js"/, 'Wrangler must route through the Boss defeat gateway.');
