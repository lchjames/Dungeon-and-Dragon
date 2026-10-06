import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute production page functions with a minimal DOM and controlled HTTP responses.
const source = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const pending = [];
const nodes = new Map([
  ['#player-combat-status-list', { innerHTML: '' }],
  ['#player-combat-status', { textContent: '', className: '', hidden: true }]
]);
const context = vm.createContext({
  $: selector => nodes.get(selector),
  escapeHtml: value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  fetch: (url, options) => new Promise((resolve, reject) => pending.push({ url, options, resolve, reject })),
  location: { pathname: '/player/', search: '', replace() {} },
  toast() {}, emptyState() { return ''; },
  setInterval() {}, clearInterval() {}, document: {}
});
vm.runInContext(source.slice(source.indexOf('\n') + 1, source.lastIndexOf('\nensureFocusButton();')), context);
const run = code => vm.runInContext(code, context);
const html = () => nodes.get('#player-combat-status-list').innerHTML;
function respond(request, payload, status = 200) {
  request.resolve({ ok: status >= 200 && status < 300, status, json: async () => payload });
}
const character = (id, displayName = id) => ({ id, displayName, entityType: 'character', controlledByCurrentUser: true });
const combat = (id, combatants = [character('owner')]) => ({ id, status: 'active', combatants });
const status = name => ({ name, durationType: 'ROUNDS', remainingRounds: 3, stackCount: 2 });
const load = state => { context.input = state; return run('loadCombatStatuses(input)'); };

const old = load(combat('old'));
const fresh = load(combat('new'));
respond(pending[1], { statusEffects: [status('新的狀態')] });
await fresh;
respond(pending[0], { statusEffects: [status('過時的狀態')] });
await old;
assert.match(html(), /新的狀態/);
assert.doesNotMatch(html(), /過時的狀態/);
assert.match(html(), /剩餘 3 回合/);
assert.match(html(), /2 層/);

pending.length = 0;
const ending = load(combat('ending'));
await load(null);
respond(pending[0], { statusEffects: [status('不應復活')] });
await ending;
assert.match(html(), /沒有進行中的戰鬥/);
assert.doesNotMatch(html(), /不應復活/);
await load({ ...combat('ended'), status: 'ended' });
assert.equal(pending.length, 1, 'Ended Combat must not request Status data.');

pending.length = 0;
const mixed = load(combat('mixed', [character('a'), character('b', '<img src=x>'),
  { ...character('other'), controlledByCurrentUser: false }, { ...character('monster'), entityType: 'monster_instance' }]));
assert.equal(pending.length, 2, 'Only Player-owned Characters may be requested.');
respond(pending[0], { statusEffects: [status('<script>alert(1)</script>')] });
respond(pending[1], { error: { message: 'internal diagnostic' } }, 500);
await mixed;
assert.match(html(), /&lt;script&gt;/);
assert.match(html(), /&lt;img src=x&gt;/);
assert.match(html(), /暫時無法載入/);
assert.doesNotMatch(html(), /<script>|<img|internal diagnostic/);

pending.length = 0;
const failing = load(combat('failure'));
pending[0].reject(new Error('offline'));
await failing;
assert.match(html(), /暫時無法載入/);
assert.doesNotMatch(html(), /沒有生效/);
const recovering = load(combat('recovered'));
respond(pending[1], { statusEffects: [] });
await recovering;
assert.match(html(), /沒有生效/);
assert.doesNotMatch(html(), /無法載入/);

pending.length = 0;
const abandoned = load(combat('abandoned'));
await load(combat('no-owner', []));
pending[0].reject(new Error('late failure'));
await abandoned;
assert.match(html(), /沒有角色參與/);
assert.doesNotMatch(html(), /無法載入/);

// Actual loadCombat/renderState orchestration, without the optional Combat panel.
pending.length = 0;
const firstPoll = run('loadCombat()');
const secondPoll = run('loadCombat()');
respond(pending[1], { combat: combat('latest', []) });
await secondPoll;
respond(pending[0], { combat: combat('stale', []) });
await firstPoll;
assert.equal(run('combatState.combat.id'), 'latest');

pending.length = 0;
const beforeMutation = run('loadCombat()');
context.input = { combat: combat('mutation-result', []) };
run('renderState(input)');
respond(pending[0], { combat: combat('pre-mutation', []) });
await beforeMutation;
assert.equal(run('combatState.combat.id'), 'mutation-result');

pending.length = 0;
const lateError = run('loadCombat()');
const successfulPoll = run('loadCombat()');
respond(pending[1], { combat: null });
await successfulPoll;
pending[0].reject(new Error('obsolete error'));
await lateError;
assert.equal(nodes.get('#player-combat-status').textContent, '');
assert.equal(run('combatState.combat'), null);
assert(pending.every(request => !request.options.method || request.options.method === 'GET'));
console.log('Player Combat refresh ordering, partial failure and safe Status rendering passed.');
