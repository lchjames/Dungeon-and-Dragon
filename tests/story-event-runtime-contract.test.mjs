import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gateway = await readFile(new URL('../src/story-event-gateway.js', import.meta.url), 'utf8');
const zoneGateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-story-events.js', import.meta.url), 'utf8');
const gmRoot = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-story-narratives.js', import.meta.url), 'utf8');
const playerMapUi = await readFile(new URL('../public/assets/player-map-ui.js', import.meta.url), 'utf8');
const liveRunner = await readFile(new URL('../scripts/production-alpha-story-event-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/story-zone-trigger-gateway\.js"\s*,?\s*$/m);
assert.match(zoneGateway, /import baseWorker from '\.\/story-event-gateway\.js'/);
assert.match(gateway, /import baseWorker from '\.\/runtime-visibility-gateway\.js'/);
for (const table of ['story_events', 'runtime_story_flags', 'runtime_story_narratives', 'runtime_story_event_executions']) {
  assert.match(gateway, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(gateway, /STORY_EVENT_TRIGGER_NOT_MANUAL/);
assert.match(gateway, /STORY_EVENT_ALREADY_FIRED/);
assert.match(gateway, /STORY_EVENT_CONDITIONS_NOT_MET/);
assert.match(gateway, /effects_applied_json/);
assert.ok(
  gateway.includes("pathname.match(/^\\/api\\/gm\\/world\\/runtime\\/maps\\/([^/]+)\\/story-events\\/([^/]+)\\/activate$/)"),
  'Story Event gateway must expose the GM manual activation route for a Runtime Map and Event.'
);
assert.match(gateway, /\/door-state/);
assert.match(gateway, /sourceEdgeId/);
assert.match(gateway, /sourceZoneId/);
assert.match(gateway, /runtime_story_narratives/);
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);

for (const value of ['manual', 'enter_zone', 'event_not_fired', 'flag_equals', 'door_state', 'show_narrative', 'set_flag', 'reveal_zone', 'open_door', 'close_door']) {
  assert.match(rules, new RegExp(`'${value}'`));
}
assert.match(rules, /sourceEdgeId/);
assert.match(rules, /sourceZoneId/);
assert.doesNotMatch(rules, /eval\s*\(/);
assert.doesNotMatch(rules, /new Function\s*\(/);

assert.match(gmUi, /<h3>Story Events<\/h3>/);
assert.match(gmUi, /Trigger \+ Conditions \+ Approved Effects/);
assert.match(gmUi, /id="gm-story-event-conditions"/);
assert.match(gmUi, /id="gm-story-event-effects"/);
assert.match(gmUi, /sourceEdgeId/);
assert.match(gmUi, /sourceZoneId/);
assert.match(gmUi, /Activate Selected/);
assert.match(gmUi, /\/story-events\/\$\{encodeURIComponent\(event\.id\)\}\/activate/);

assert.match(playerUi, /storyNarratives/);
assert.match(playerUi, /GM-revealed narrative/);
assert.match(playerMapUi, /player-story-narratives\.js/);

// Production live coverage must keep proving the full manual Event vertical slice.
assert.match(liveRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(liveRunner, /flag_not_equals/);
assert.match(liveRunner, /set_flag/);
assert.match(liveRunner, /show_narrative/);
assert.match(liveRunner, /STORY_EVENT_ALREADY_FIRED/);
assert.match(liveRunner, /storyExecutions/);
assert.match(liveRunner, /storyNarratives/);
assert.match(orchestrator, /production-alpha-story-event-e2e\.mjs/);
assert.match(orchestrator, /'story-event'/);

// Loading the Story UI must not replace the existing Attack Profile workspace logic.
assert.match(gmRoot, /import '\.\/gm-story-events\.js'/);
assert.match(gmRoot, /gm-create-attack-profile/);
assert.match(gmRoot, /data-profile-save/);

console.log('Story Event manual runtime integration contract passed.');
