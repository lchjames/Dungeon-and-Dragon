import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gateway = await readFile(new URL('../src/status-effect-gateway.js', import.meta.url), 'utf8');
const authority = await readFile(new URL('../src/status-effect-authority.js', import.meta.url), 'utf8');
const playerCombat = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../public/player/index.html', import.meta.url), 'utf8');
const doc = await readFile(new URL('../docs/PLAYER_STATUS_VISIBILITY_ALPHA.md', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-player-status-visibility-e2e.mjs', import.meta.url), 'utf8');
const aggregate = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');

assert.match(gateway, /\/api\\\/player\\\/characters/);
assert.match(gateway, /status-effects\$\/\)/);
assert.match(gateway, /Player Status Effect route is read-only/);
assert.match(gateway, /request\.method !== 'GET'/);
assert.match(gateway, /requireOwnedCharacter/);
assert.match(gateway, /owner_user_id !== user\.id/);
assert.match(gateway, /CHARACTER_NOT_OWNED/);
assert.match(gateway, /includeHistory: false/);
assert.match(gateway, /statusEffects: \(state\.effects \|\| \[\]\)\.map\(playerStatusView\)/);

const projection = gateway.match(/function playerStatusView\(effect\) \{[\s\S]*?\n\}/)?.[0] || '';
for (const key of ['name', 'status', 'durationType', 'remainingRounds', 'stackCount']) {
  assert.match(projection, new RegExp(key));
}
for (const forbidden of [
  'effectSnapshot', 'sourceContext', 'sourceId', 'sourceAbilityDefinitionId',
  'appliedByUserId', 'removedByUserId', 'removalReason', 'lastReason',
  'actorUserId', 'audit', 'strengthValue'
]) assert.doesNotMatch(projection, new RegExp(forbidden));

assert.match(authority, /status='ACTIVE'/);
assert.match(playerHtml, /player-combat-status-conditions/);
assert.match(playerHtml, /player-combat-status-list/);
assert.match(playerCombat, /controlledByCurrentUser/);
assert.match(playerCombat, /\/status-effects/);
assert.match(playerCombat, /status\.durationType === 'PERMANENT'/);
assert.match(playerCombat, /status\.remainingRounds/);
assert.match(playerCombat, /status\.stackCount/);
assert.doesNotMatch(playerCombat, /method:\s*'POST'[\s\S]{0,200}status-effects/);

assert.match(doc, /Player Pages Alpha specification/i);
assert.match(doc, /MUST NOT return/);
assert.match(doc, /does not connect Status duration to Combat turn hooks/i);
assert.match(doc, /GET \/api\/player\/characters\/:characterId\/status-effects/);

assert.match(runner, /mode: 'plan-only'/);
assert.match(runner, /productionWrites: false/);
assert.match(runner, /intentionally plan-only/);
assert.match(aggregate, /production-alpha-player-status-visibility-e2e\.mjs/);
assert.match(aggregate, /player-status-visibility/);
assert.match(workflow, /player-status-visibility-contract\.test\.mjs/);

console.log('Player Status Visibility contract passed.');
