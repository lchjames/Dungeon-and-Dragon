import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const compiler = await readFile(new URL('../src/story-script-compiler.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/story-script-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0029_story_script_sources.sql', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-story-script-tool.js', import.meta.url), 'utf8');
const gmHtml = await readFile(new URL('../public/gm/index.html', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-story-script-tool-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/GM_STORY_SCRIPT_TOOL_ALPHA.md', import.meta.url), 'utf8');

assert.match(compiler, /normalizeStoryEventStructure/);
assert.match(compiler, /export function compileStoryScript/);
assert.match(compiler, /directive === 'TRIGGER'/);
assert.match(compiler, /directive === 'WHEN'/);
assert.match(compiler, /directive === 'DO'/);
assert.match(compiler, /directive === 'CONDITION'/);
assert.match(compiler, /directive === 'EFFECT'/);
assert.match(compiler, /JSON\.parse/);
assert.match(compiler, /MAX_SCRIPT_LENGTH = 24000/);
assert.match(compiler, /MAX_LINES = 120/);
assert.doesNotMatch(compiler, /eval\s*\(/);
assert.doesNotMatch(compiler, /new Function\s*\(/);
assert.doesNotMatch(compiler, /env\.DB/);
assert.doesNotMatch(compiler, /fetch\s*\(/);

assert.match(gateway, /import baseWorker from '\.\/runtime-object-gateway\.js'/);
assert.match(gateway, /compileStoryScript/);
assert.match(gateway, /story_script_sources/);
assert.match(gateway, /\/api\/gm\/story-scripts\/compile/);
assert.match(gateway, /\/story-scripts\$\/|story-scripts\$\//);
assert.match(gateway, /story-scripts\\\/apply/);
assert.match(gateway, /STORY_SCRIPT_APPLY_MANUAL_ONLY/);
assert.match(gateway, /\/api\/gm\/scenes\/\$\{encodeURIComponent\(sceneId\)\}\/story-events/);
assert.match(gateway, /\/story-events\/\$\{encodeURIComponent\(eventId\)\}/);
assert.match(gateway, /\/story-events\/\$\{encodeURIComponent\(event\.id\)\}\/activate/);
assert.doesNotMatch(gateway, /executeRuntimeStoryEvent/);
assert.doesNotMatch(gateway, /runtime_story_event_executions/);
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS story_script_sources/);
assert.match(migration, /story_event_id TEXT PRIMARY KEY/);
assert.match(migration, /FOREIGN KEY \(story_event_id\) REFERENCES story_events\(id\) ON DELETE CASCADE/);
assert.doesNotMatch(migration, /runtime_story_flags/);
assert.doesNotMatch(migration, /runtime_story_event_executions/);

assert.match(ui, /GM Script Tool · Alpha/);
assert.match(ui, /\/api\/gm\/story-scripts\/compile/);
assert.match(ui, /\/story-scripts\/apply/);
assert.match(ui, /Publish \+ Apply Now/);
assert.match(ui, /TRIGGER MANUAL/);
assert.match(ui, /Saved Script Sources/);
assert.doesNotMatch(ui, /eval\s*\(/);
assert.doesNotMatch(ui, /new Function\s*\(/);

assert.match(gmHtml, /gm-story-script-tool\.js/);
assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/story-script-gateway\.js"\s*,?\s*$/m);

assert.match(runner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(runner, /production-writing GM Story Script Tool E2E/);
assert.match(runner, /\/api\/gm\/story-scripts\/compile/);
assert.match(runner, /\/story-scripts/);
assert.match(runner, /sourcePersistenceVerified/);
assert.match(runner, /runtimeWrites:\s*false/);
assert.match(orchestrator, /production-alpha-story-script-tool-e2e\.mjs/);
assert.match(orchestrator, /'gm-story-script-tool'/);

assert.match(canonical, /does \*\*not\*\* introduce a second Story runtime/);
assert.match(canonical, /normalizeStoryEventStructure\(\)/);
assert.match(canonical, /Apply Now is intentionally limited/);
assert.match(canonical, /story_script_sources/);
assert.match(canonical, /no variables, loops, branches, functions, expressions, macros, includes, imports, timers, network calls, JavaScript, or SQL/);

console.log('GM Story Script Tool compiler, authoring gateway, UI, source persistence and production safety contract passed.');
