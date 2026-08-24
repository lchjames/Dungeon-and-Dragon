import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const gmJs = await readFile(new URL('../public/assets/gm-d1.js', import.meta.url), 'utf8');
const gmAttackJs = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const gmStoryJs = await readFile(new URL('../public/assets/gm-story.js', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../public/player/index.html', import.meta.url), 'utf8');
const playerCombatJs = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const playerAttackWorker = await readFile(new URL('../src/player-attack.js', import.meta.url), 'utf8');
const combatLife = await readFile(new URL('../src/combat-life.js', import.meta.url), 'utf8');
const lifeCorrection = await readFile(new URL('../src/life-correction.js', import.meta.url), 'utf8');
const scenarioWorker = await readFile(new URL('../src/scenario.js', import.meta.url), 'utf8');
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
assert.match(gmStoryJs, /story-side-link/, 'Story client must expose a GM Story navigation entry.');
assert.match(gmStoryJs, /\/api\/gm\/story/, 'Story client must read the server-authoritative Story API.');
assert.match(gmStoryJs, /start-combat/, 'Story client must be able to start Combat from an Encounter.');
assert.match(gmStoryJs, /data-encounter-participant/, 'Story client must manage Encounter Character participants.');

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

assert.match(playerAttackWorker, /controller_user_id/, 'Attack authority must resolve through combatant controller ownership.');
assert.match(playerAttackWorker, /action_available = 0/, 'Attack resolver must reserve and consume the authoritative Action.');
assert.match(playerAttackWorker, /ATTACK_PROFILE_UNAVAILABLE/, 'Attack resolver must reject unapproved or inactive Profiles.');
assert.match(playerAttackWorker, /TARGET_DODGE_REQUIRED/, 'Attack resolver must require the Canonical target Dodge Skill.');
assert.match(playerAttackWorker, /effectiveDefence:\s*0/, 'MVP attack path must keep post-hit Effective Defence at zero until Defence sources are integrated.');
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
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/scenario\.js"/, 'Wrangler must route through the Scenario gateway.');
