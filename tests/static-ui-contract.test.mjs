import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const gmJs = await readFile(new URL('../public/assets/gm-d1.js', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../public/player/index.html', import.meta.url), 'utf8');
const playerCombatJs = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const playerCombatWorker = await readFile(new URL('../src/player-combat.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

for (const id of [
  'campaign-name',
  'gm-user-name',
  'gm-user-role',
  'view-dashboard',
  'view-players',
  'view-characters',
  'view-combat',
  'combat-side-link'
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

for (const id of [
  'player-combat-panel',
  'player-combat-round',
  'player-combat-current',
  'player-combat-initiative',
  'player-consume-action',
  'player-consume-move',
  'player-end-turn'
]) {
  assert.match(playerHtml, new RegExp(`id=["']${id}["']`), `Player HTML must contain #${id}`);
}

assert.match(playerHtml, /src=["']\/assets\/player-combat\.js["']/, 'Player workspace must load the Player Combat client module.');
assert.match(playerCombatJs, /\/api\/player\/combat/, 'Player Combat client must use the server-authoritative Combat API.');
assert.match(playerCombatJs, /consume-action/, 'Player Combat client must expose Action allowance mutation.');
assert.match(playerCombatJs, /consume-move/, 'Player Combat client must expose Move allowance mutation.');
assert.match(playerCombatJs, /end-turn/, 'Player Combat client must expose End Own Turn.');

assert.match(playerCombatWorker, /controller_user_id/, 'Player Combat authority must resolve through combatant controller ownership.');
assert.match(playerCombatWorker, /NOT_OWN_TURN/, 'Player Combat API must explicitly reject mutation outside the Player own Turn.');
assert.match(playerCombatWorker, /COMBAT_STATE_CHANGED/, 'Player Combat mutations must reject stale Combat state.');
assert.match(
  playerCombatWorker,
  /UPDATE combatants[\s\S]*UPDATE combats/,
  'Turn transition must mutate Combatant state before advancing the Combat pointer.'
);
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/player-combat\.js"/, 'Wrangler must route through the Player Combat gateway.');
