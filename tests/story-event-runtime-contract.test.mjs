import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoryTrigger } from '../src/story-event-rules.js';

const gateway = await readFile(new URL('../src/story-event-gateway.js', import.meta.url), 'utf8');
const zoneGateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const runtimeEncounterGateway = await readFile(new URL('../src/runtime-encounter-gateway.js', import.meta.url), 'utf8');
const resolutionGateway = await readFile(new URL('../src/runtime-encounter-resolution-gateway.js', import.meta.url), 'utf8');
const sceneRunStartStory = await readFile(new URL('../src/scene-run-start-story.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const gmUi = await readFile(new URL('../public/assets/gm-story-events.js', import.meta.url), 'utf8');
const gmRoot = await readFile(new URL('../public/assets/gm-attack-profiles.js', import.meta.url), 'utf8');
const playerUi = await readFile(new URL('../public/assets/player-story-narratives.js', import.meta.url), 'utf8');
const playerMapUi = await readFile(new URL('../public/assets/player-map-ui.js', import.meta.url), 'utf8');
const liveRunner = await readFile(new URL('../scripts/production-alpha-story-event-e2e.mjs', import.meta.url), 'utf8');
const sceneRunStartRunner = await readFile(new URL('../scripts/production-alpha-story-scene-run-start-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/STORY_SCENE_RUN_START_TRIGGER_ALPHA.md', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-encounter-resolution-gateway\.js"\s*,?\s*$/m);
assert.match(resolutionGateway, /import baseWorker from '\.\/runtime-encounter-gateway\.js'/);
assert.match(runtimeEncounterGateway, /import baseWorker from '\.\/story-zone-trigger-gateway\.js'/);
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

for (const value of ['manual', 'scene_run_start', 'enter_zone', 'encounter_resolved', 'event_not_fired', 'flag_equals', 'door_state', 'show_narrative', 'set_flag', 'reveal_zone', 'open_door', 'close_door']) {
  assert.match(rules, new RegExp(`'${value}'`));
}
assert.deepEqual(normalizeStoryTrigger('scene_run_start', { ignored: true }), {});
assert.match(rules, /sourceEdgeId/);
assert.match(rules, /sourceZoneId/);
assert.doesNotMatch(rules, /eval\s*\(/);
assert.doesNotMatch(rules, /new Function\s*\(/);

assert.match(gmUi, /<h3>Story Events<\/h3>/);
assert.match(gmUi, /Trigger \+ Conditions \+ Approved Effects/);
assert.match(gmUi, /'manual', 'scene_run_start', 'enter_zone'/);
assert.match(gmUi, /id="gm-story-event-conditions"/);
assert.match(gmUi, /id="gm-story-event-effects"/);
assert.match(gmUi, /sourceEdgeId/);
assert.match(gmUi, /sourceZoneId/);
assert.match(gmUi, /Activate Selected/);
assert.match(gmUi, /\/story-events\/\$\{encodeURIComponent\(event\.id\)\}\/activate/);

assert.match(playerUi, /storyNarratives/);
assert.match(playerUi, /GM-revealed narrative/);
assert.match(playerMapUi, /player-story-narratives\.js/);

assert.match(liveRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(liveRunner, /flag_not_equals/);
assert.match(liveRunner, /set_flag/);
assert.match(liveRunner, /show_narrative/);
assert.match(liveRunner, /STORY_EVENT_ALREADY_FIRED/);
assert.match(liveRunner, /storyExecutions/);
assert.match(liveRunner, /storyNarratives/);
assert.match(orchestrator, /production-alpha-story-event-e2e\.mjs/);
assert.match(orchestrator, /'story-event'/);

assert.match(resolutionGateway, /import \{ processSceneRunStartStoryEvents \} from '\.\/scene-run-start-story\.js'/);
assert.match(resolutionGateway, /handleSceneRunStart/);
assert.match(resolutionGateway, /const response = await baseWorker\.fetch\(request, env\)/, 'Scene Run creation must commit through existing Runtime authority before lifecycle Story execution.');
assert.match(resolutionGateway, /sceneRunStartStoryEvents/);
assert.match(resolutionGateway, /STORY_SCENE_RUN_START_TRIGGER_ERROR/);
assert.match(resolutionGateway, /STORY_SCENE_RUN_START_ACTOR_UNAVAILABLE/);
assert.match(resolutionGateway, /pathname === '\/api\/gm\/world\/runtime\/scene-runs'/);

assert.match(sceneRunStartStory, /trigger_type = 'scene_run_start'/);
assert.match(sceneRunStartStory, /normalizeStoryTrigger\('scene_run_start'/);
assert.match(sceneRunStartStory, /evaluateStoryConditions/);
assert.match(sceneRunStartStory, /runtime_story_event_executions/);
assert.match(sceneRunStartStory, /spawnRuntimeMonster/);
assert.match(sceneRunStartStory, /spawnRuntimeBoss/);
assert.match(sceneRunStartStory, /startRuntimeEncounterCombat/);
assert.match(sceneRunStartStory, /\.entries\(\)/, 'Lifecycle Story effects must retain stable authored effect indexes.');
assert.doesNotMatch(sceneRunStartStory, /INSERT INTO encounter_participants/);
assert.doesNotMatch(sceneRunStartStory, /INSERT INTO encounter_combats/);
assert.doesNotMatch(sceneRunStartStory, /UPDATE\s+encounters\s+SET\s+status/i);
assert.doesNotMatch(sceneRunStartStory, /eval\s*\(/);
assert.doesNotMatch(sceneRunStartStory, /new Function\s*\(/);

assert.match(sceneRunStartRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(sceneRunStartRunner, /triggerType:\s*'scene_run_start'/);
assert.match(sceneRunStartRunner, /ignoredByCanonicalNormalizer/);
assert.match(sceneRunStartRunner, /type:\s*'show_narrative'/);
assert.match(sceneRunStartRunner, /type:\s*'set_flag'/);
assert.match(sceneRunStartRunner, /type:\s*'activate_encounter'/);
assert.match(sceneRunStartRunner, /type:\s*'start_combat'/);
assert.match(sceneRunStartRunner, /sceneRunStartStoryEvents/);
assert.match(sceneRunStartRunner, /Successful scene_run_start Event was not applied/);
assert.match(sceneRunStartRunner, /Intentional scene_run_start failure was not audited as failed/);
assert.match(sceneRunStartRunner, /Encounter Definition status was polluted/);
assert.match(sceneRunStartRunner, /bestEffortFailureCleanup/);
assert.match(orchestrator, /production-alpha-story-scene-run-start-e2e\.mjs/);
assert.match(orchestrator, /'story-scene-run-start'/);

assert.match(canonical, /Runtime authority commits first/);
assert.match(canonical, /sceneRunStartStoryEvents/);
assert.match(canonical, /STORY_SCENE_RUN_START_TRIGGER_ERROR/);
assert.match(canonical, /Definition data remains authoring input only/);
assert.match(canonical, /interact_object/);

assert.match(gmRoot, /import '\.\/gm-story-events\.js'/);
assert.match(gmRoot, /gm-create-attack-profile/);
assert.match(gmRoot, /data-profile-save/);

console.log('Story Event manual + scene_run_start lifecycle runtime integration contract passed behind Runtime Encounter resolution routing.');
