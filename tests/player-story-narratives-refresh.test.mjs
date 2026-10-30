import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/player-story-narratives.js', import.meta.url), 'utf8').replace(/^import .*\n/, '');
const story = text => ({ storyNarratives: [{ id: text, text, createdAt: 1 }] });
function harness() {
  const requests = [], events = new Map();
  const select = { id: 'player-map-character', value: '' };
  let target = null, panel = null, available = true, observe;
  const side = { append(value) { panel = value; target = { innerHTML: '' }; } };
  const document = { visibilityState: 'visible', documentElement: {},
    querySelector(selector) {
      if (selector === '#player-map-character') return select;
      if (selector === '#player-map-detail .player-map-side') return available ? side : null;
      if (selector === '#player-story-narratives') return panel;
      if (selector === '#player-story-narrative-list') return target;
    },
    createElement: () => ({}), addEventListener: (name, callback) => events.set(name, callback) };
  const context = vm.createContext({ document, window: { addEventListener() {} }, escapeHtml: String,
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {} },
    setInterval: () => 1, clearInterval() {},
    fetch: url => new Promise((resolve, reject) => requests.push({ url, reject,
      respond: (body, status = 200) => resolve({ ok: status === 200, json: async () => body }) })) });
  vm.runInContext(source, context);
  return { requests, run: code => vm.runInContext(code, context), html: () => target?.innerHTML,
    select(id) { select.value = id; return events.get('change')({ target: select }); },
    visibility(state) { document.visibilityState = state; events.get('visibilitychange')(); },
    unmount() { available = false; target = null; panel = null; },
    mount() { available = true; observe(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function load(h, text) {
  const pending = h.run('refreshNarratives()');
  h.requests.at(-1).respond(story(text));
  await pending;
}

// Only the latest Character and refresh can render, including obsolete errors.
{
  const h = harness();
  h.select('A');
  const a = h.requests.at(-1);
  h.select('B');
  h.requests.at(-1).respond(story('B story'));
  await tick();
  a.respond(story('A story'));
  await tick();
  assert.match(h.html(), /B story/);
  assert.doesNotMatch(h.html(), /A story/);
  const pending = h.run('refreshNarratives()');
  const old = h.requests.at(-1);
  await load(h, 'Newest B');
  old.reject(new Error('obsolete'));
  await pending;
  assert.match(h.html(), /Newest B/);
  h.select('');
  assert.doesNotMatch(h.html(), /Newest B/);
}

// Switching clears old content immediately; failed reads never leave another story visible.
{
  const h = harness();
  h.select('A');
  h.requests.at(-1).respond(story('A private story'));
  await tick();
  h.select('B');
  assert.doesNotMatch(h.html(), /A private story/);
  h.requests.at(-1).respond({}, 403);
  await tick();
  assert.match(h.html(), /無法載入/);
  await load(h, 'Recovered B');
  assert.match(h.html(), /Recovered B/);
  const pending = h.run('refreshNarratives()');
  h.select('');
  h.requests.at(-1).respond(story('Late B'));
  await pending;
  assert.doesNotMatch(h.html(), /Late B/);
}

// Rebuilt or initially missing panels must render unchanged server content again.
{
  const h = harness();
  h.unmount();
  h.select('A');
  h.requests.at(-1).respond(story('Same story'));
  await tick();
  assert.equal(h.run('lastNarrativeSignature'), '');
  h.mount();
  await load(h, 'Same story');
  assert.match(h.html(), /Same story/);
  h.unmount();
  h.mount();
  await load(h, 'Same story');
  assert.match(h.html(), /Same story/);
}

// Hidden-tab responses are invalidated and returning to the tab gets current data.
{
  const h = harness();
  h.select('A');
  const pending = h.requests.at(-1);
  h.visibility('hidden');
  pending.respond(story('Hidden stale'));
  await tick();
  assert.doesNotMatch(h.html(), /Hidden stale/);
  assert.equal(h.requests.length, 1);
  h.visibility('visible');
  h.requests.at(-1).respond(story('Visible fresh'));
  await tick();
  assert.match(h.html(), /Visible fresh/);
}
console.log('Player Story narrative selection and remount regression passed');
