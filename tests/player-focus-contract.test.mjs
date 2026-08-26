import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const focusWorker = await readFile(new URL('../src/player-focus.js', import.meta.url), 'utf8');
const lifeCorrection = await readFile(new URL('../src/life-correction.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/rules.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/HP_MP_RECOVERY_REST_ALPHA.md', import.meta.url), 'utf8');

assert.match(lifeCorrection, /import baseWorker from '\.\/player-focus\.js'/, 'Focus gateway must sit directly above the verified Player Attack runtime.');
assert.match(focusWorker, /import baseWorker from '\.\/player-attack\.js'/, 'Focus gateway must preserve Player Attack below it.');
assert.match(focusWorker, /\/focus\$\//, 'Player Combat must expose a dedicated Focus route.');
assert.match(focusWorker, /request\.method !== 'POST'/, 'Focus must be a state-changing POST resolver.');
assert.match(focusWorker, /validOrigin\(request\)/, 'Focus must preserve same-origin mutation protection.');
assert.match(focusWorker, /combat\.isOwnTurn/, 'Focus must require the Player own turn.');
assert.match(focusWorker, /actor\.entityType !== 'character'/, 'Focus must be Character-only.');
assert.match(focusWorker, /actor\.actionAvailable/, 'Focus must require an available Action.');
assert.match(focusWorker, /lifeState \|\| 'alive'/, 'Focus must reject non-living/non-actionable Characters.');
assert.match(focusWorker, /characterLocked/, 'Focus must respect the Character lock state.');
assert.match(focusWorker, /UPPER\(key\) = 'MP'/, 'Focus must mutate only the canonical MP resource.');
assert.match(focusWorker, /focusMpRecovery\(mpMax\)/, 'Focus recovery must use the centralized 5% Max MP rule.');
assert.match(focusWorker, /Math\.min\(recoveryRequested, mpMax - mpBefore\)/, 'Focus recovery must clamp at Final Max MP.');
assert.match(focusWorker, /player_focus_action_log/, 'Focus must preserve an auditable D1 action record.');
assert.match(focusWorker, /action_available = 0/, 'Focus must consume exactly the normal Action allowance path.');
assert.match(focusWorker, /COMBAT_STATE_CHANGED/, 'Concurrent/stale Focus attempts must fail safely.');
assert.match(focusWorker, /MP_ALREADY_FULL/, 'Focus at full MP must not silently waste an Action.');
assert.doesNotMatch(focusWorker, /HP[^\n]*SET current_value/i, 'Focus must never recover HP.');

assert.match(rules, /export function focusMpRecovery/);
assert.match(rules, /Math\.ceil\(safeMax \* 0\.05\)/, 'Canonical Focus recovery is ceil(Final Max MP × 5%).');
assert.match(canonical, /集中[\s\S]*ceil\(Final Max MP × 5%\)/, 'Runtime Focus must remain anchored to the Canonical recovery document.');
assert.match(canonical, /`集中`\s*只可以在正式 Combat 狀態使用/, 'Focus must remain Combat-only.');

assert.match(playerUi, /Focus \/ 集中 \(\+5% Max MP\)/, 'Player Combat UI must expose Focus explicitly.');
assert.match(playerUi, /\/focus`/, 'Player UI must use the dedicated server Focus resolver.');
assert.match(playerUi, /MP \$\{current\.mp\.current\}\/\$\{current\.mp\.max\}/, 'Player Turn summary must show current/max MP.');
assert.match(playerUi, /mpFull/, 'Player UI must disable Focus when MP is full.');

console.log('Player Combat Focus contract regression passed.');
