import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rules = await readFile(new URL('../src/story-event-rules.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/runtime-encounter-service.js', import.meta.url), 'utf8');
const manualGateway = await readFile(new URL('../src/story-event-gateway.js', import.meta.url), 'utf8');
const zoneGateway = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../schema/0019_story_runtime_spawn_effects.sql', import.meta.url), 'utf8');
const liveRunner = await readFile(new URL('../scripts/production-alpha-story-combat-e2e.mjs', import.meta.url), 'utf8');
const orchestrator = await readFile(new URL('../scripts/production-alpha-e2e.mjs', import.meta.url), 'utf8');
const authoringHelp = await readFile(new URL('../public/assets/gm-story-runtime-action-help.js', import.meta.url), 'utf8');
const hostileLoader = await readFile(new URL('../public/assets/gm-hostile-movement.js', import.meta.url), 'utf8');

for (const type of ['spawn_monster', 'start_combat']) {
  assert.match(rules, new RegExp(`'${type}'`), `Approved Story effect vocabulary must contain ${type}.`);
}
assert.match(rules, /Story Monster Level must be an integer from 1 to 100/);
assert.match(rules, /sourceSpawnPointId/);
assert.match(rules, /templateId/);
assert.match(rules, /encounterId/);
assert.match(rules, /sameEventActivationRetry/);
assert.match(rules, /activatedByStoryEventId/);
assert.match(rules, /context\.storyEventId/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_story_spawn_effects/);
assert.match(migration, /PRIMARY KEY \(scene_run_id, story_event_id, effect_index\)/);
assert.match(migration, /FOREIGN KEY \(scene_run_id, encounter_id\)/);
assert.doesNotMatch(migration, /FOREIGN KEY \(story_event_id\)/, 'Story spawn provenance must not depend on Story schema creation order.');
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);

assert.match(service, /CREATE TABLE IF NOT EXISTS runtime_story_spawn_effects/);
assert.match(service, /scene_run_id, story_event_id, effect_index/);
assert.match(service, /spawnReplay/);
assert.match(service, /storyEffectReplay:\s*true/);
assert.match(service, /storyEffectReplay:\s*false/);
assert.match(service, /INSERT INTO runtime_story_spawn_effects/);
assert.match(service, /INSERT INTO runtime_encounter_participants/);
assert.match(service, /INSERT INTO runtime_entity_positions/);
assert.match(service, /INSERT INTO runtime_encounter_combats/);
assert.match(service, /buildCombatInitiative/);
assert.doesNotMatch(service, /\/api\/gm\//, 'Shared service must not depend on GM HTTP endpoints.');
assert.doesNotMatch(service, /Cookie/, 'Shared service must not impersonate a GM browser session.');
assert.doesNotMatch(service, /INSERT INTO encounter_participants/);
assert.doesNotMatch(service, /INSERT INTO encounter_combats/);
assert.doesNotMatch(service, /UPDATE\s+encounters\s+SET\s+status/i);

for (const gateway of [manualGateway, zoneGateway]) {
  assert.match(gateway, /from '\.\/runtime-encounter-service\.js'/);
  assert.match(gateway, /spawnRuntimeMonster\(/);
  assert.match(gateway, /startRuntimeEncounterCombat\(/);
  assert.match(gateway, /spawnBySource/);
  assert.match(gateway, /STORY_EFFECT_SPAWN_POINT_NOT_FOUND/);
  assert.match(gateway, /\.entries\(\)/, 'Story effect execution must preserve a stable effect index for spawn provenance.');
  assert.match(gateway, /context\.event\.oncePerSceneRun \? context\.event\.id : null/);
  assert.match(gateway, /context\.event\.oncePerSceneRun \? effectIndex : null/);
  assert.match(gateway, /storyEventId:\s*event\.id/, 'Retry-aware condition evaluation must receive the current Story Event identity.');
  assert.doesNotMatch(gateway, /INSERT INTO encounter_participants/);
  assert.doesNotMatch(gateway, /INSERT INTO encounter_combats/);
  assert.doesNotMatch(gateway, /UPDATE\s+encounters\s+SET\s+status/i);
}

assert.match(zoneGateway, /runtime_map_spawn_points/);
assert.match(zoneGateway, /effect\.type === 'spawn_monster'/);
assert.match(zoneGateway, /effect\.type === 'start_combat'/);
assert.match(zoneGateway, /actorUserId:\s*context\.actor\.id/);
assert.doesNotMatch(zoneGateway, /\/api\/gm\/world\/runtime\/maps\/.*\/monsters/, 'Player-triggered Story must call the service directly, not a GM HTTP route.');
assert.doesNotMatch(zoneGateway, /\/api\/gm\/world\/runtime\/maps\/.*\/start-combat/, 'Player-triggered Story must call the service directly, not a GM HTTP route.');

assert.match(manualGateway, /actorUserId:\s*context\.gm\.id/);

assert.match(hostileLoader, /import '\.\/gm-story-runtime-action-help\.js'/);
assert.match(authoringHelp, /<h4>Runtime Spawn & Combat<\/h4>/);
assert.match(authoringHelp, /sourceSpawnPointId/);
assert.match(authoringHelp, /templateId/);
assert.match(authoringHelp, /encounterId/);
assert.match(authoringHelp, /"type": "spawn_monster"/);
assert.match(authoringHelp, /"type": "start_combat"/);
assert.match(authoringHelp, /\/api\/gm\/monsters/);
assert.match(authoringHelp, /spawnPoints/);
assert.match(authoringHelp, /Monster Level must be 1–100/);
assert.doesNotMatch(authoringHelp, /eval\s*\(/);
assert.doesNotMatch(authoringHelp, /new Function\s*\(/);

assert.match(liveRunner, /DND_ALPHA_EXECUTE === '1'/);
assert.match(liveRunner, /triggerType:\s*'enter_zone'/);
assert.match(liveRunner, /sourceZoneId:\s*ZONE_ID/);
assert.match(liveRunner, /type:\s*'activate_encounter'/);
assert.match(liveRunner, /type:\s*'spawn_monster'/);
assert.match(liveRunner, /type:\s*'start_combat'/);
assert.match(liveRunner, /sourceSpawnPointId:\s*MONSTER_SPAWN_ID/);
assert.match(liveRunner, /\/move`/);
assert.match(liveRunner, /storyEventsTriggered/);
assert.match(liveRunner, /Definition Encounter roster/);
assert.match(liveRunner, /Definition encounter_combats/);
assert.match(liveRunner, /Encounter Definition status/);
assert.match(liveRunner, /bestEffortFailureCleanup/);
assert.match(orchestrator, /production-alpha-story-combat-e2e\.mjs/);
assert.match(orchestrator, /'story-runtime-spawn-combat'/);

console.log('Story Runtime spawn_monster + start_combat effect, retry identity, GM authoring and production vertical contract passed.');
