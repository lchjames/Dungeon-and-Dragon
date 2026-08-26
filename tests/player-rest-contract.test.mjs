import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../src/player-rest.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/rest-rules.js', import.meta.url), 'utf8');
const doorGateway = await readFile(new URL('../src/runtime-door-gateway.js', import.meta.url), 'utf8');
const mapGateway = await readFile(new URL('../src/player-map-gateway.js', import.meta.url), 'utf8');
const mapWorker = await readFile(new URL('../src/player-map.js', import.meta.url), 'utf8');
const uiShell = await readFile(new URL('../public/assets/player-map-ui.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/player-rest.js', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/HP_MP_RECOVERY_REST_ALPHA.md', import.meta.url), 'utf8');

assert.match(doorGateway, /import baseWorker from '\.\/player-rest\.js'/, 'Runtime chain must pass through Rest before Player Map.');
assert.match(worker, /import baseWorker from '\.\/player-map-gateway\.js'/, 'Rest must reuse the existing Exploration Round authority.');
assert.match(mapGateway, /import baseWorker from '\.\/player-map\.js'/);
assert.match(mapWorker, /CREATE TABLE IF NOT EXISTS runtime_exploration_state/);
assert.match(mapWorker, /CREATE TABLE IF NOT EXISTS runtime_exploration_character_state/);
assert.match(mapWorker, /action_available INTEGER NOT NULL DEFAULT 1/);
assert.match(mapWorker, /move_available INTEGER NOT NULL DEFAULT 1/);
assert.match(mapWorker, /pendingExplorationActors/);

assert.match(worker, /CREATE TABLE IF NOT EXISTS character_rest_state/);
assert.match(worker, /CREATE TABLE IF NOT EXISTS character_rest_log/);
assert.match(worker, /status IN \('active', 'completed', 'cancelled', 'combat_interrupted'\)/);
assert.match(worker, /progress_rounds INTEGER NOT NULL/);
assert.match(worker, /last_progress_round INTEGER NOT NULL/);
assert.match(worker, /recovery_applied INTEGER NOT NULL DEFAULT 0/);
assert.doesNotMatch(worker, /setTimeout|setInterval/, 'Rest progress must never use a server wall-clock timer.');

assert.match(worker, /\/rest\/start\$\//);
assert.match(worker, /\/rest\/cancel\$\//);
assert.match(worker, /request\.method !== 'POST'/);
assert.match(worker, /validOrigin\(request\)/);
assert.match(worker, /REST_RUNTIME_MAP_REQUIRED/);
assert.match(worker, /context\.turn\.actionAvailable/);
assert.match(worker, /context\.turn\.moveAvailable/);
assert.match(worker, /REST_TURN_ALREADY_USED/);
assert.match(worker, /progress_rounds[^\n]*1/);
assert.match(worker, /Starting Round counts as Rest progress 1/);
assert.match(worker, /action_available = 0, move_available = 0, turn_completed = 1/);
assert.match(worker, /RESTING_CHARACTER_ACTION_BLOCKED/);
assert.match(worker, /REST_OCCUPIES_TURN/);

assert.match(worker, /roundNumber > Number\(row\.last_progress_round\)/, 'Progress must derive from canonical Exploration Round changes.');
assert.match(worker, /last_progress_round = \?/, 'Rest round synchronization must be idempotent.');
assert.match(worker, /status = 'active'/, 'Completion and interruption must be conditional on the active Rest state.');
assert.match(worker, /progress_rounds >= required_rounds/);
assert.match(worker, /MIN\(max_value, current_value \+ \?\)/, 'Recovery must clamp at the resource Max.');
assert.match(worker, /status = 'completed'/);

assert.match(worker, /pathname === '\/api\/gm\/combat\/start'/);
assert.match(worker, /start-combat\$/.source ? /start-combat/ : /start-combat/);
assert.match(worker, /if \(response\.ok\) await interruptActiveRests/);
assert.match(worker, /status = 'combat_interrupted'/);
assert.match(worker, /combat_started/);

assert.match(rules, /return normalizedRestType\(restType\) === 'short' \? 2 : 5/);
assert.match(rules, /Math\.ceil\(safeMax \* 0\.10\)/);
assert.match(rules, /Math\.ceil\(safeMax \* 0\.25\)/);
assert.match(rules, /Math\.ceil\(safeMax \* 0\.50\)/);
assert.match(rules, /safeMax - safeCurrent/);
assert.match(rules, /Math\.min\(recoveryRequested, safeMax - safeCurrent\)/);

assert.match(uiShell, /await import\('\.\/player-rest\.js'\)/);
assert.match(ui, /Rest uses Exploration Rounds, not a real-time timer/);
assert.match(ui, /Short Rest · 2 Rounds/);
assert.match(ui, /Long Rest · 5 Rounds/);
assert.match(ui, /value="HP"/);
assert.match(ui, /value="MP"/);
assert.match(ui, /\/rest\/start`/);
assert.match(ui, /\/rest\/cancel`/);
assert.match(ui, /INTERRUPTED BY COMBAT/);
assert.match(ui, /no Rest recovery/);

assert.match(canonical, /Short Rest[\s\S]*2 Rounds/);
assert.match(canonical, /Long Rest[\s\S]*5 Rounds/);
assert.match(canonical, /每次 Rest 必須選擇一個資源/);
assert.match(canonical, /完成前進入 Combat，該次 Rest 取消且沒有回復/);
assert.match(canonical, /D1 \+ server resolver/);

console.log('Player Rest runtime contract regression passed.');
