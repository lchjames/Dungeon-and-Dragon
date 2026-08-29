import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeEncounterGateway = await readFile(new URL('../src/runtime-encounter-gateway.js', import.meta.url), 'utf8');
const gateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0016_story_event_runtime.sql', import.meta.url), 'utf8');
const liveRunner = await readFile(new URL('../scripts/production-alpha-story-zone-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-encounter-gateway\.js"\s*,?\s*$/m);
assert.match(runtimeEncounterGateway, /import baseWorker from '\.\/story-zone-trigger-gateway\.js'/);
assert.match(gateway, /import baseWorker from '\.\/story-event-gateway\.js'/);
assert.match(gateway, /import \{ evaluateStoryConditions, normalizeStoryTrigger \} from '\.\/story-event-rules\.js'/);
assert.match(gateway, /\/api\\\/player\\\/world\\\/characters\\\/\(\[\^\/\]\+\)\\\/move/);
assert.match(gateway, /trigger_type = 'enter_zone'/);
assert.match(gateway, /runtime_map_zone_cells/);
assert.match(gateway, /origin\.runtime_zone_id IS NULL/);
assert.match(gateway, /source_zone_id/);
assert.match(gateway, /normalizeStoryTrigger\('enter_zone'/);
assert.match(gateway, /STORY_EVENT_ALREADY_FIRED/);
assert.match(gateway, /STORY_EVENT_CONDITIONS_NOT_MET/);
assert.match(gateway, /runtime_story_event_executions/);
assert.match(gateway, /storyEventsTriggered/);
assert.match(gateway, /STORY_ENTER_ZONE_TRIGGER_ERROR/);
assert.match(gateway, /Automatic enter-zone Story Event processing failed after committed Player movement/);
assert.match(gateway, /runtime_door_state_log/);
assert.match(gateway, /updated_by_user_id/);
assert.match(gateway, /activated_by_user_id/);
assert.doesNotMatch(gateway, /eval\s*\(/);
assert.doesNotMatch(gateway, /new Function\s*\(/);

assert.match(rules, /export function normalizeStoryTrigger/);
assert.match(rules, /type === 'enter_zone'/);
assert.match(rules, /sourceZoneId/);

for (const table of ['story_events', 'runtime_story_flags', 'runtime_story_narratives', 'runtime_story_event_executions']) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);

// Production live coverage must prove the actual automatic Player Move path,
// including a hidden server-side trigger Zone and the refreshed Player payload.
assert.match(liveRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(liveRunner, /triggerType:\s*'enter_zone'/);
assert.match(liveRunner, /sourceZoneId:\s*ZONE_ID/);
assert.match(liveRunner, /playerVisibleDefault:\s*false/);
assert.match(liveRunner, /zoneType:\s*'trigger'/);
assert.match(liveRunner, /\/move`/);
assert.match(liveRunner, /storyEventsTriggered/);
assert.match(liveRunner, /reveal_zone/);
assert.match(liveRunner, /triggerType === 'enter_zone'/);
assert.match(orchestrator, /production-alpha-story-zone-e2e\.mjs/);
assert.match(orchestrator, /'story-enter-zone'/);

console.log('Story Event enter-zone trigger integration contract passed behind Runtime Encounter routing.');
