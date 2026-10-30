import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/player-abilities.js', import.meta.url), 'utf8').replace(/^import .*\n/, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const payload = name => ({ abilities: [
  { name: `${name} fire`, attributeType: 'FIRE' }, { name: `${name} water`, attributeType: 'WATER' }
] });
function harness() {
  let selected = '';
  const observers = [], elements = new Map(), requests = [], messages = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.version = 0; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.target = null; ++this.version; }
    notify(target) {
      if (this.target !== target) return;
      const version = this.version;
      queueMicrotask(() => { if (this.target === target && version === this.version) this.callback(); });
    }
  }
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      html: '', buttons: [],
      get innerHTML() { return this.html; },
      set innerHTML(html) {
        this.html = html;
        this.buttons = [...html.matchAll(/data-ability-filter="([^"]+)"/g)].map(([, type]) => ({
          dataset: { abilityFilter: type }, addEventListener(event, callback) { this.click = callback; }
        }));
        for (const observer of observers) observer.notify(this);
      },
      querySelectorAll() { return this.buttons; }
    });
    return elements.get(selector);
  };
  const context = vm.createContext({ $, escapeHtml: String, toast: (...args) => messages.push(args),
    queueMicrotask, MutationObserver: Observer,
    document: { querySelector: () => selected ? { dataset: { characterId: selected } } : null, addEventListener() {} },
    fetch: url => new Promise((resolve, reject) => requests.push({ url, reject,
      respond: (body, status = 200) => resolve({ ok: status === 200, status, json: async () => body }) })) });
  vm.runInContext(source, context);
  return { $, requests, messages, run: code => vm.runInContext(code, context),
    select: id => { selected = id; $('#character-list').innerHTML = id; },
    filter: type => $('#ability-list').buttons.find(b => b.dataset.abilityFilter === type).click() };
}
async function load(h, id) {
  await tick();
  h.select(id);
  await tick();
  h.requests.at(-1).respond(payload(id));
  await tick();
}

// B must start while A is still pending; A cannot overwrite B or reopen after close.
{
  const h = harness();
  await tick();
  h.select('A');
  await tick();
  const a = h.requests.at(-1);
  h.select('B');
  await tick();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests.at(-1).url, '/api/player/characters/B/abilities');
  h.requests.at(-1).respond(payload('B'));
  await tick();
  a.respond(payload('A'));
  await tick();
  assert.match(h.$('#ability-list').innerHTML, /B fire/);
  assert.doesNotMatch(h.$('#ability-list').innerHTML, /A fire/);
  h.run('scheduleRefresh()');
  await tick();
  const closing = h.requests.at(-1);
  h.select('');
  await tick();
  closing.respond(payload('B late'));
  await tick();
  assert.equal(h.$('#ability-list').innerHTML, '');
}

// Local filter renders never cause network requests; external Character renders still do.
{
  const h = harness();
  await load(h, 'A');
  assert.equal(h.requests.length, 1);
  h.filter('FIRE');
  await tick();
  assert.equal(h.requests.length, 1);
  assert.match(h.$('#ability-list').innerHTML, /A fire/);
  assert.doesNotMatch(h.$('#ability-list').innerHTML, /A water/);
  h.$('#ability-list').innerHTML = 'legacy render from Character refresh';
  await tick();
  assert.equal(h.requests.length, 2);
  h.requests.at(-1).respond(payload('A refreshed'));
  await tick();
  assert.match(h.$('#ability-list').innerHTML, /A refreshed fire/);
  assert.doesNotMatch(h.$('#ability-list').innerHTML, /A refreshed water/);
  await load(h, 'B');
  assert.match(h.$('#ability-list').innerHTML, /B water/, 'new character resets the filter');
}

// Same-character refresh ordering, coalescing and obsolete failures.
{
  const h = harness();
  await load(h, 'A');
  h.run('scheduleRefresh(); scheduleRefresh(); scheduleRefresh();');
  await tick();
  assert.equal(h.requests.length, 2);
  const old = h.requests.at(-1);
  h.run('scheduleRefresh()');
  await tick();
  h.requests.at(-1).respond(payload('Newest'));
  await tick();
  old.reject(new Error('obsolete'));
  await tick();
  assert.equal(h.messages.length, 0);
  assert.match(h.$('#ability-list').innerHTML, /Newest fire/);
  assert.equal(h.requests.length, 3, 'no observer request loop');
}

// Current failures and expired sessions replace stale cards; retry can recover.
{
  const h = harness();
  await load(h, 'A');
  h.run('scheduleRefresh()');
  await tick();
  h.requests.at(-1).reject(new Error('offline'));
  await tick();
  assert.match(h.$('#ability-list').innerHTML, /載入失敗/);
  assert.equal(h.messages.length, 1);
  h.run('scheduleRefresh()');
  await tick();
  h.requests.at(-1).respond({}, 401);
  await tick();
  assert.match(h.$('#ability-list').innerHTML, /登入已過期/);
  await load(h, 'A');
  assert.match(h.$('#ability-list').innerHTML, /A fire/);
}
console.log('Player Abilities selection and observer refresh regression passed');
