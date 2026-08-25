import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adminAuth = await readFile(new URL('../src/admin-auth.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/boss-defeat.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/BOSS_DEFEAT_MVP.md', import.meta.url), 'utf8');

assert.match(worker, /import baseWorker from '\.\/boss-runtime\.js'/, 'Boss defeat gateway must layer over hardened Boss runtime.');
assert.match(worker, /bossInstanceDefence/, 'Player → Boss must use Boss Stored Defence / Armor helpers.');
assert.match(worker, /resolveBossHpDamage/, 'Player → Boss damage must use the Boss HP0 lifecycle helper.');
assert.match(worker, /player_boss_action_log/, 'Player → Boss attacks must write a dedicated audit trail.');
assert.match(worker, /status = 'active' AND current_hp = \?/, 'Boss HP update must use a stale-state-safe active/current-HP guard.');
assert.match(worker, /move_available = 0/, 'Defeated Boss must lose ordinary Action / Move allowances.');
assert.match(worker, /BOSS_TARGET_NOT_ACTIVE/, 'Defeated / removed Boss must reject ordinary Player targeting.');
assert.match(worker, /reconcileBossStatusFromHp/, 'GM Boss HP correction must reconcile active / defeated state.');
assert.match(worker, /min: 0, max: maxHp/, 'GM Boss runtime correction must permit Current HP 0.');

assert.match(playerUi, /boss_instance/, 'Player Combat UI must recognize Boss Instance targets.');
assert.match(playerUi, /· BOSS ·/, 'Player Combat UI must label Boss targets.');
assert.match(playerUi, /Boss Defence/, 'Player attack result must distinguish Boss Defence from Character Dodge / Monster Defence.');
assert.match(playerUi, /boss_stored_defence/, 'Player result handling must recognize Boss Stored Defence source.');

assert.match(wrangler, /"main"\s*:\s*"\.\/src\/admin-auth\.js"/, 'Wrangler must route through the Admin authentication boundary.');
assert.match(adminAuth, /import baseWorker from '\.\/boss-defeat\.js'/, 'Admin authentication boundary must preserve the Boss defeat runtime gateway immediately below it.');
assert.match(canonical, /Current HP <= 0[\s\S]*status = defeated immediately/, 'Canonical Boss HP0 must resolve immediately to defeated.');
assert.ok(!/Boss Instances do not inherit the Player Character DYING system merely because they are important enemies[\s\S]*ceil\(CON \/ 5\) dying rounds[\s\S]*apply/i.test(canonical), 'Canonical must not instruct implementation to apply Player DYING to Bosses.');
