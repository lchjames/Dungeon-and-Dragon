import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/player-currency-exchange.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/, '');
function currency(quantity = 100) {
  return { balances: { coin_bronze: { quantity }, coin_silver: { quantity: 0 } },
    activeRateSet: { id: 'quote1', label: 'Today', updatedAt: 0, rates: [{ id: 'rate1', enabled: true,
      fromItemDefinitionId: 'coin_bronze', toItemDefinitionId: 'coin_silver', fromQuantity: 10, toQuantity: 1 }] } };
}
function harness() {
  let selected = 'A', observer;
  const elements = new Map(), requests = [], messages = [], listeners = new Map();
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, { value: '', disabled: false, open: false,
      textContent: '', innerHTML: '', classList: { contains: () => false }, addEventListener() {},
      close() { this.open = false; }, showModal() { this.open = true; } });
    return elements.get(selector);
  };
  const context = vm.createContext({ $, escapeHtml: String, toast: (...args) => messages.push(args),
    queueMicrotask, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} },
    document: { querySelector: () => selected ? { dataset: { characterId: selected } } : null,
      addEventListener: (type, callback) => listeners.set(type, callback),
      dispatchEvent: event => listeners.get(event.type)?.(event) },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, reject,
      respond: (payload, status = 200) => resolve({ ok: status === 200, status, json: async () => payload }) })) });
  vm.runInContext(source, context);
  return { $, requests, messages, run: code => vm.runInContext(code, context),
    select: id => { selected = id; observer(); } };
}
async function load(h, quantity = 100) {
  const promise = h.run('loadCurrency({ force: true })');
  h.requests.at(-1).respond(currency(quantity));
  await promise;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

// Older GET successes and errors never replace the latest character or latest refresh.
{
  const h = harness();
  const a = h.run('loadCurrency()');
  const aRequest = h.requests.at(-1);
  h.select('B');
  h.requests.at(-1).respond(currency(200));
  await tick();
  aRequest.respond(currency(10));
  await a;
  assert.equal(h.run('balance("coin_bronze")'), 200);
  const old = h.run('loadCurrency()');
  const oldRequest = h.requests.at(-1);
  await load(h, 300);
  oldRequest.reject(new Error('obsolete'));
  await old;
  assert.equal(h.run('balance("coin_bronze")'), 300);
  assert.equal(h.$('#player-currency-status').textContent, '');
  const closing = h.run('loadCurrency()');
  h.select('');
  h.requests.at(-1).respond(currency(999));
  await closing;
  assert.equal(h.run('state'), null);
  assert.equal(h.run('selectedCharacterId()'), '');
}

// Repeated submits and input events cannot spend twice; old reads cannot roll back balances.
{
  const h = harness();
  await load(h);
  h.run("openExchange('rate1')");
  const operation = h.run('confirmExchange()');
  const post = h.requests.at(-1);
  h.$('#player-exchange-amount').value = '20';
  h.run('updatePreview()');
  assert.equal(h.$('#player-confirm-exchange').disabled, true);
  await h.run('confirmExchange()');
  await h.run('loadCurrency({ force: true })');
  assert.equal(h.requests.length, 2);
  assert.equal(JSON.parse(post.options.body).sourceQuantity, 10, 'submitted amount is captured');
  post.respond({ ...currency(90), transaction: { fromQuantityTotal: 10, toQuantityTotal: 1 } });
  await tick();
  assert.equal(h.requests.at(-1).options.method, undefined, 'completion reconciles via GET');
  h.requests.at(-1).respond(currency(90));
  await operation;
  assert.equal(h.run('balance("coin_bronze")'), 90);
  assert.equal(h.$('#player-currency-dialog').open, false);
  assert.equal(h.requests.filter(r => r.options.method === 'POST').length, 1);
}

// The captured quote belongs to A; completing A never installs its balance into B.
{
  const h = harness();
  await load(h);
  h.run("openExchange('rate1')");
  const operation = h.run('confirmExchange()');
  const post = h.requests.at(-1);
  h.select('B');
  assert.equal(h.run('state'), null);
  assert.equal(h.$('#player-currency-dialog').open, false);
  post.respond({ ...currency(90), transaction: { fromQuantityTotal: 10, toQuantityTotal: 1 } });
  await tick();
  assert.equal(post.url, '/api/player/characters/A/currency/exchange');
  assert.equal(h.requests.at(-1).url, '/api/player/characters/B/currency');
  assert.equal(h.run('state'), null);
  h.requests.at(-1).respond(currency(500));
  await operation;
  assert.equal(h.run('balance("coin_bronze")'), 500);
}

// Closing during a write cannot reopen the dialog or trigger a fallback read for A.
{
  const h = harness();
  await load(h);
  h.run("openExchange('rate1')");
  h.$('#player-exchange-amount').value = '11';
  await h.run('confirmExchange()');
  assert.equal(h.requests.length, 1, 'invalid bundles never reach the API');
  h.$('#player-exchange-amount').value = '10';
  const operation = h.run('confirmExchange()');
  h.select('');
  h.requests.at(-1).respond({ ...currency(90), transaction: { fromQuantityTotal: 10, toQuantityTotal: 1 } });
  await operation;
  assert.equal(h.requests.length, 2);
  assert.equal(h.run('state'), null);
  assert.equal(h.$('#player-currency-dialog').open, false);
}

// Ambiguous failures and stale quotes require a fresh read and a new explicit confirmation.
for (const stale of [false, true]) {
  const h = harness();
  await load(h);
  h.run("openExchange('rate1')");
  const operation = h.run('confirmExchange()');
  const post = h.requests.at(-1);
  if (stale) post.respond({ error: { code: 'CURRENCY_RATE_STALE', message: 'Quote changed' } }, 409);
  else post.reject(new Error('Connection lost'));
  await tick();
  assert.equal(h.run('selectedRate'), null);
  await h.run('confirmExchange()');
  h.requests.at(-1).reject(new Error('Recovery unavailable'));
  await operation;
  assert.equal(h.run('state'), null);
  h.run("openExchange('rate1')");
  assert.equal(h.$('#player-currency-dialog').open, false);
  assert.equal(h.requests.filter(r => r.options.method === 'POST').length, 1);
  await load(h, 80);
  h.run("openExchange('rate1')");
  assert.equal(h.$('#player-confirm-exchange').disabled, false);
}
console.log('Player Currency selection, submission and recovery regression passed');
