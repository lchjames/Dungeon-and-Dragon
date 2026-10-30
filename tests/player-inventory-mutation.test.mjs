import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/player-inventory-weapons.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '');
const inventory = name => ({ inventory: [{ id: 'sword', name, itemType: 'WEAPON', active: true, revision: 3, isEquipped: false }] });
function harness() {
  let selected = 'A', observer;
  const elements = new Map(), requests = [], messages = [];
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: '', classList: { contains: () => false } });
    return elements.get(selector);
  };
  const context = vm.createContext({ $, escapeHtml: String, emptyState: title => title,
    toast: (...args) => messages.push(args), queueMicrotask,
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} },
    document: { querySelector: () => selected ? { dataset: { characterId: selected } } : null, addEventListener() {} },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, reject,
      respond: payload => resolve({ ok: true, status: 200, json: async () => payload }) })) });
  vm.runInContext(source, context);
  return { $, requests, messages, run: code => vm.runInContext(code, context),
    select: id => { selected = id; observer(); },
    patch: (owner = 'A', body = { isEquipped: true }) => {
      context.testButton = { disabled: false, dataset: { playerToggleEquip: 'sword', revision: '3' },
        closest: () => ({ dataset: { inventoryCharacter: owner } }) };
      context.testBody = body;
      return vm.runInContext('patchItem(testButton, testBody)', context);
    } };
}
async function load(h, name = 'A sword') {
  const promise = h.run('loadInventory({ force: true })');
  h.requests.at(-1).respond(inventory(name));
  await promise;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

// Selection-driven reads render only the latest character, including late errors and close.
{
  const h = harness();
  const old = h.run('loadInventory()');
  const oldRequest = h.requests.at(-1);
  h.select('B');
  h.requests.at(-1).respond(inventory('B sword'));
  await tick();
  oldRequest.respond(inventory('A sword'));
  await old;
  assert.match(h.$('#inventory-list').innerHTML, /B sword/);
  assert.match(h.$('#inventory-list').innerHTML, /data-inventory-character="B"/);
  const late = h.run('loadInventory()');
  const lateRequest = h.requests.at(-1);
  await load(h, 'B updated');
  lateRequest.reject(new Error('obsolete'));
  await late;
  assert.equal(h.messages.length, 0);
  const closing = h.run('loadInventory()');
  h.select('');
  h.requests.at(-1).respond(inventory('B late'));
  await closing;
  assert.equal(h.run('loadedCharacterId'), '');
  assert.doesNotMatch(h.$('#inventory-list').innerHTML, /B late/);
}

// Repeated writes and refreshes are blocked until a mutation completes and reloads.
{
  const h = harness();
  await load(h);
  const operation = h.patch();
  const patch = h.requests.at(-1);
  await h.patch();
  await h.run('loadInventory({ force: true })');
  assert.equal(h.requests.length, 2);
  assert.deepEqual(JSON.parse(patch.options.body), { isEquipped: true, revision: 3 });
  patch.respond({});
  await tick();
  await h.patch();
  assert.equal(h.requests.length, 3, 'recovery must finish before another write');
  h.requests.at(-1).respond(inventory('A refreshed'));
  await operation;
  assert.equal(h.run('loadedCharacterId'), 'A');
  assert.match(h.$('#inventory-list').innerHTML, /A refreshed/);
}

// A's captured item cannot be submitted as B; completion refreshes B, never reopens A.
{
  const h = harness();
  await load(h);
  const operation = h.patch();
  const patch = h.requests.at(-1);
  h.select('B');
  patch.respond({});
  await tick();
  assert.equal(patch.url, '/api/player/characters/A/inventory/sword');
  assert.equal(h.requests.at(-1).url, '/api/player/characters/B/inventory');
  h.requests.at(-1).respond(inventory('B sword'));
  await operation;
  await h.patch('A');
  assert.equal(h.requests.length, 3);
  assert.match(h.$('#inventory-list').innerHTML, /B sword/);
}

// Unknown mutation outcomes are not replayed; failed recovery leaves no stale controls.
{
  const h = harness();
  await load(h);
  const operation = h.patch('A', { quantity: 2 });
  h.requests.at(-1).reject(new Error('Connection lost'));
  await tick();
  h.requests.at(-1).reject(new Error('Recovery unavailable'));
  await operation;
  await h.patch();
  assert.equal(h.requests.filter(r => r.options.method === 'PATCH').length, 1);
  assert.equal(h.run('loadedCharacterId'), '');
  assert.match(h.$('#inventory-list').innerHTML, /載入失敗/);
  await load(h);
  const closing = h.patch();
  h.select('');
  h.requests.at(-1).respond({});
  const count = h.requests.length;
  await closing;
  assert.equal(h.requests.length, count, 'closing must not trigger a fallback GET');
  assert.equal(h.run('loadedCharacterId'), '');
}
console.log('Player Inventory selection, mutation and recovery regression passed');
