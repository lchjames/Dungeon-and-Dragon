import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/player.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/, '').split("\n$('#new-character')")[0];
function harness() {
  const elements = new Map();
  const requests = [];
  const messages = [];
  const $ = selector => {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, { value: '', style: {}, disabled: false,
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) } });
    }
    return elements.get(selector);
  };
  const context = vm.createContext({ $, $$: () => [], escapeHtml: String, emptyState: () => '',
    toast: (...args) => messages.push(args),
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, reject,
      respond: payload => resolve({ ok: true, status: 200, json: async () => payload }) })) });
  vm.runInContext(source + '\nbootstrap = { user: { displayName: "Player" }, characters: [] };', context);
  return { $, requests, messages, run: code => vm.runInContext(code, context) };
}
const character = id => ({ id, name: id, notes: `${id} original`, attributes: [], resources: [], inventory: [], abilities: [] });
async function select(h, id) {
  const promise = h.run(`openCharacter('${id}', false)`);
  h.requests.at(-1).respond({ character: character(id) });
  await promise;
}

// Only the newest selection can render; closing invalidates pending reads.
{
  const h = harness();
  const a = h.run("openCharacter('A', false)");
  const b = h.run("openCharacter('B', false)");
  h.requests[1].respond({ character: character('B') });
  assert.equal(await b, true);
  h.requests[0].respond({ character: character('A') });
  assert.equal(await a, false);
  assert.equal(h.run('selectedCharacter.id'), 'B');
  const late = h.run("openCharacter('A', false)");
  h.run('closeCharacter()');
  h.requests.at(-1).respond({ character: character('A') });
  assert.equal(await late, false);
  assert.equal(h.run('selectedCharacter'), null);
  assert.equal(h.$('#character-detail').classList.contains('hidden'), true);
  const staleError = h.run("openCharacter('A', false)");
  await select(h, 'B');
  h.requests.at(-2).reject(new Error('obsolete'));
  assert.equal(await staleError, false);
  const currentError = h.run("openCharacter('A', false)");
  h.requests.at(-1).reject(new Error('current'));
  await assert.rejects(currentError, /current/);
}

// Saves retain their character and text; another save owns its own button lock.
{
  const h = harness();
  await select(h, 'A');
  h.$('#character-notes').value = 'A saved';
  const a = h.run('saveNotes()');
  const aRequest = h.requests.at(-1);
  await h.run('saveNotes()');
  assert.equal(h.requests.length, 2, 'duplicate save must not issue a PATCH');
  await select(h, 'B');
  assert.equal(h.$('#save-notes').disabled, false);
  h.$('#character-notes').value = 'B saved';
  const b = h.run('saveNotes()');
  const bRequest = h.requests.at(-1);
  h.$('#character-notes').value = 'B newer unsaved edit';
  aRequest.respond({});
  await a;
  assert.equal(h.run('selectedCharacter.notes'), 'B original');
  assert.equal(h.$('#save-notes').disabled, true);
  assert.equal(aRequest.url, '/api/player/characters/A/notes');
  assert.deepEqual(JSON.parse(aRequest.options.body), { notes: 'A saved' });
  bRequest.respond({});
  await b;
  assert.equal(h.run('selectedCharacter.notes'), 'B saved');
  assert.equal(h.$('#character-notes').value, 'B newer unsaved edit');
  assert.equal(h.$('#save-notes').disabled, false);
  const closing = h.run('saveNotes()');
  h.run('closeCharacter()');
  h.requests.at(-1).respond({});
  await closing;
  assert.equal(h.run('selectedCharacter'), null);
  assert.equal(h.$('#save-notes').disabled, true);
  assert.equal(h.messages.some(([text]) => /null|undefined/.test(text)), false);
}

// Failed saves unlock without retrying; stale mutation refreshes cannot steal selection.
{
  const h = harness();
  await select(h, 'A');
  const saving = h.run('saveNotes()');
  h.requests.at(-1).reject(new Error('offline'));
  await saving;
  assert.equal(h.requests.length, 2);
  assert.equal(h.$('#save-notes').disabled, false);
  const oldVersion = h.run('characterRequestVersion');
  const next = h.run("openCharacter('B', false)");
  await h.run(`refreshCharacterAfterMutation('A', ${oldVersion})`);
  await h.run("refreshCharacterAfterMutation('A', characterRequestVersion)");
  assert.equal(h.requests.length, 3);
  h.requests.at(-1).respond({ character: character('B') });
  await next;
  h.run('closeCharacter()');
  await h.run(`refreshCharacterAfterMutation('A', ${oldVersion})`);
  assert.equal(h.requests.length, 3);
}
console.log('Player character selection and notes regression passed');
