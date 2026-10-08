import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/assets/player-combat.js', import.meta.url), 'utf8');
const pending = [];
const controlIds = ['player-focus', 'player-consume-action', 'player-consume-move',
  'player-attack', 'player-end-turn', 'player-attack-profile', 'player-attack-target'];
const nodes = new Map();
for (const id of [...controlIds, 'player-combat-panel', 'player-combat-status',
  'player-combat-status-list', 'player-combat-round', 'player-combat-current',
  'player-combat-initiative', 'player-attack-controls']) {
  nodes.set('#' + id, { disabled: false, value: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {} } });
}
const response = (payload, status = 200) => ({ ok: status < 400, status, json: async () => payload });
const context = vm.createContext({
  $: selector => nodes.get(selector), escapeHtml: value => String(value),
  toast() {}, emptyState() { return ''; }, document: {},
  location: { pathname: '/player/', search: '', replace() {} },
  fetch: (url, options) => url.endsWith('/status-effects')
    ? Promise.resolve(response({ statusEffects: [] }))
    : new Promise((resolve, reject) => pending.push({ url, options, resolve, reject }))
});
vm.runInContext(source.slice(source.indexOf('\n') + 1, source.lastIndexOf('\nensureFocusButton();')), context);
const run = code => vm.runInContext(code, context);
const settle = () => new Promise(resolve => setImmediate(resolve));
function state(ownTurn = true) {
  const actor = { id: 'owner', entityType: 'character', controlledByCurrentUser: true,
    displayName: '玩家', lifeState: 'alive', actionAvailable: true, moveAvailable: true,
    mp: { current: 5, max: 10 }, hp: { current: 10, max: 10 } };
  return { combat: { id: 'combat', status: 'active', isOwnTurn: ownTurn, roundNumber: 1,
    currentCombatant: actor, combatants: [actor, { ...actor, id: 'target', controlledByCurrentUser: false }] },
    attackProfiles: [{ id: 'profile', name: '攻擊', storedAccuracy: 50, damageDiceCount: 1, damageDiceSides: 6 }] };
}
function install(payload) {
  context.input = payload;
  nodes.get('#player-attack-profile').value = 'profile';
  nodes.get('#player-attack-target').value = 'target';
  run('renderState(input)');
}
const operations = ["consumeAllowance('action')", "consumeAllowance('move')", 'focus()', 'attack()', 'endOwnTurn()'];
for (const operation of operations) {
  pending.length = 0;
  install(state());
  const oldPoll = run('loadCombat()');
  const action = run(operation);
  assert.equal(pending.length, 2);
  assert.equal(pending[1].options.method, 'POST');
  assert(controlIds.every(id => nodes.get('#' + id).disabled));
  // Polling, manual refresh and every other handler must leave the write alone.
  await run('loadCombat()');
  for (const other of operations) await run(other);
  assert.equal(pending.length, 2, 'No concurrent POST or refresh may be submitted.');
  pending[0].resolve(response(state(false)));
  await oldPoll;
  assert.equal(run('combatState.combat.isOwnTurn'), true, 'Pre-write poll must be ignored.');
  run('renderCombat(combatState.combat); renderAttackControls(combatState.combat)');
  assert(controlIds.every(id => nodes.get('#' + id).disabled), 'Re-render cannot unlock controls.');
  pending[1].resolve(response(state(false)));
  await action;
  assert.equal(run('combatMutationPending'), false);
  assert.equal(run('combatState.combat.isOwnTurn'), false);
  assert(controlIds.every(id => nodes.get('#' + id).disabled), 'Server turn rules still apply.');
}

// Lost POST response: do not replay it, even if the recovery read also fails.
pending.length = 0;
install(state());
const failedAction = run('focus()');
pending[0].reject(new Error('Connection lost after possible commit'));
await settle();
assert.equal(pending.length, 2);
assert.equal(pending[1].url, '/api/player/combat');
assert.equal(run('combatNeedsSync'), true);
for (const other of operations) await run(other);
assert.equal(pending.length, 2);
pending[1].reject(new Error('Offline'));
await failedAction;
assert.equal(run('combatMutationPending'), false);
assert.equal(run('combatNeedsSync'), true);
assert(controlIds.every(id => nodes.get('#' + id).disabled));
assert.match(nodes.get('#player-combat-status').textContent, /尚未確認/);
for (const other of operations) await run(other);
assert.equal(pending.length, 2, 'Unconfirmed outcome must remain locked.');

const retryRead = run('loadCombat({ quiet: true })');
pending[2].resolve(response(state()));
await retryRead;
assert.equal(run('combatNeedsSync'), false);
assert(controlIds.every(id => !nodes.get('#' + id).disabled));
assert.equal(nodes.get('#player-combat-status').textContent, '');
assert.equal(pending.filter(item => item.options.method === 'POST').length, 1);

pending.length = 0;
install(state(false));
for (const operation of operations) await run(operation);
assert.equal(pending.length, 0);
console.log('Player Combat single-flight mutations and authoritative recovery passed.');
