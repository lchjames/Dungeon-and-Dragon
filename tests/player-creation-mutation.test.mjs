import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/player-creation-skills.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/, '').split('\nensureCreationUI();')[0];
const draft = id => ({ id, name: id, status: 'draft', progression: { creationComplete: false, creationSkillPointsTotal: 200 },
  skills: Array.from({ length: 23 }, (_, i) => ({ key: `skill${i}`, label: `Skill ${i}`, category: 'Basic', creationValue: i < 6 ? 30 : i === 6 ? 20 : 0 })) });
function harness() {
  let selected = '';
  let inputs = [];
  let reloads = 0;
  const requests = [], messages = [], elements = new Map();
  const $ = selector => {
    if (selector === '.character-card.selected') return selected ? { dataset: { characterId: selected } } : null;
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, { disabled: false, textContent: '', hidden: false, click() {},
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        set innerHTML(value) {
          if (selector === '#creation-skill-list') inputs = [...value.matchAll(/value="(\d+)"\s+data-creation-skill="([^"]+)"/g)]
            .map(([, number, key]) => ({ value: number, dataset: { creationSkill: key }, disabled: false, addEventListener() {} }));
        } });
    }
    return elements.get(selector);
  };
  const context = vm.createContext({ $, $$: selector => selector === '[data-creation-skill]' ? inputs : [],
    escapeHtml: String, toast: (...args) => messages.push(args), confirm: () => true,
    location: { reload: () => { ++reloads; } },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, reject,
      respond: payload => resolve({ ok: true, status: 200, json: async () => payload }) })) });
  vm.runInContext(source + '\nensureCreationUI = () => true;', context);
  const run = code => vm.runInContext(code, context);
  return { $, run, requests, messages, inputs: () => inputs, reloads: () => reloads,
    select: id => { selected = id; return run('loadSelectedCharacter()'); } };
}
async function load(h, id) {
  const promise = h.select(id);
  h.requests.at(-1).respond({ character: draft(id) });
  await promise;
}
const saved = { progression: { creationSkillPointsRemaining: 0, creationSkillPointsSpent: 200 } };
const tick = () => new Promise(resolve => setImmediate(resolve));

// The complete two-step mutation retains A even after the user opens B.
{
  const h = harness();
  await load(h, 'A');
  const operation = h.run('finalizeCharacter()');
  const patch = h.requests.at(-1);
  h.run('refreshAllocationSummary()');
  assert.equal(h.$('#save-creation-skills').disabled, true);
  assert.equal(h.$('#finalize-character').disabled, true);
  assert.ok(h.inputs().every(input => input.disabled));
  await h.run('finalizeCharacter()');
  await h.run('saveAllocation()');
  assert.equal(h.requests.length, 2, 'duplicate and competing writes are ignored');
  await load(h, 'B');
  assert.ok(h.inputs().every(input => input.disabled));
  patch.respond(saved);
  await tick();
  const finalize = h.requests.at(-1);
  assert.equal(patch.url, '/api/player/characters/A/creation-skills');
  assert.equal(finalize.url, '/api/player/characters/A/finalize-creation');
  assert.equal(finalize.options.method, 'POST');
  assert.equal(Object.values(JSON.parse(patch.options.body).allocations).reduce((a, b) => a + b), 200);
  finalize.respond({});
  await operation;
  assert.equal(h.reloads(), 0, 'completion cannot reload another character');
  assert.equal(h.run('currentCharacter.id'), 'B');
  assert.equal(h.run('currentCharacter.status'), 'draft');
  assert.equal(h.$('#save-creation-skills').disabled, false);
}

// A loading B cannot submit A's still-mounted inputs; closed reads cannot reopen.
{
  const h = harness();
  await load(h, 'A');
  const pending = h.select('B');
  await h.run('saveAllocation()');
  await h.run('finalizeCharacter()');
  assert.equal(h.requests.length, 2);
  await h.select('');
  h.requests.at(-1).respond({ character: draft('B') });
  await pending;
  assert.equal(h.run('currentCharacter'), null);
  assert.equal(h.$('#creation-skills-tab').classList.contains('hidden'), true);
  const failed = h.select('A');
  await h.select('');
  h.requests.at(-1).reject(new Error('obsolete'));
  await failed;
  assert.equal(h.messages.length, 0);
}

// Save A cannot refresh B, force its tab, or overwrite its status.
{
  const h = harness();
  await load(h, 'A');
  const saving = h.run('saveAllocation()');
  const patch = h.requests.at(-1);
  await load(h, 'B');
  h.$('#creation-skill-status').textContent = 'B status';
  patch.respond(saved);
  await saving;
  assert.equal(h.requests.length, 3);
  assert.equal(h.$('#creation-skill-status').textContent, 'B status');
  assert.equal(h.run('currentCharacter.id'), 'B');
}

// Failed PATCH never finalises or retries and leaves an actionable error.
{
  const h = harness();
  await load(h, 'A');
  const operation = h.run('finalizeCharacter()');
  h.requests.at(-1).reject(new Error('offline'));
  await operation;
  assert.equal(h.requests.length, 2);
  assert.equal(h.$('#creation-skill-status').textContent, 'offline');
  assert.equal(h.$('#finalize-character').disabled, false);
  const invalid = h.run('finalizeCharacter()');
  h.requests.at(-1).respond({ progression: { creationSkillPointsRemaining: 1 } });
  await invalid;
  assert.equal(h.requests.length, 3);
  assert.match(h.$('#creation-skill-status').textContent, /Server/);
}

// Normal save refreshes its own data and unlocks; closing during finalise stays closed.
{
  const h = harness();
  await load(h, 'A');
  const saving = h.run('saveAllocation()');
  h.requests.at(-1).respond(saved);
  await tick();
  assert.equal(h.requests.at(-1).url, '/api/player/characters/A');
  h.requests.at(-1).respond({ character: draft('A') });
  await saving;
  assert.equal(h.$('#save-creation-skills').disabled, false);
  const finishing = h.run('finalizeCharacter()');
  const patch = h.requests.at(-1);
  await h.select('');
  patch.respond(saved);
  await tick();
  assert.equal(h.requests.at(-1).url, '/api/player/characters/A/finalize-creation');
  h.requests.at(-1).respond({});
  await finishing;
  assert.equal(h.reloads(), 0);
  assert.equal(h.run('currentCharacter'), null);
  assert.equal(h.$('#save-creation-skills').disabled, true);
}

// Normal completion still finalises and reloads the selected character.
{
  const h = harness();
  await load(h, 'A');
  const operation = h.run('finalizeCharacter()');
  h.requests.at(-1).respond(saved);
  await tick();
  h.requests.at(-1).respond({});
  await operation;
  assert.equal(h.reloads(), 1);
  assert.equal(h.$('#finalize-character').disabled, true);
}
console.log('Player creation mutation regression passed');
