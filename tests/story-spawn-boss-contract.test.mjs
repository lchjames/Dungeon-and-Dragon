import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoryEffect } from '../src/story-event-rules.js';

const migration = await readFile(new URL('../schema/0021_story_runtime_boss_spawn_effects.sql', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/runtime-encounter-service.js', import.meta.url), 'utf8');
const manual = await readFile(new URL('../src/story-event-gateway.js', import.meta.url), 'utf8');
const zone = await readFile(new URL('../src/story-zone-trigger-gateway.js', import.meta.url), 'utf8');
const resolved = await readFile(new URL('../src/encounter-resolved-story.js', import.meta.url), 'utf8');
const help = await readFile(new URL('../public/assets/gm-story-runtime-action-help.js', import.meta.url), 'utf8');
const runner = await readFile(new URL('../scripts/production-alpha-story-boss-e2e.mjs', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../docs/STORY_RUNTIME_BOSS_EFFECT_ALPHA.md', import.meta.url), 'utf8');

const normalized = normalizeStoryEffect({
  type: 'spawn_boss',
  encounterId: 'encounter_alpha',
  profileId: 'boss_profile_alpha',
  sourceSpawnPointId: 'spawn_alpha',
  displayName: 'Alpha Boss',
  level: 100
});
assert.deepEqual(normalized, {
  type: 'spawn_boss',
  encounterId: 'encounter_alpha',
  profileId: 'boss_profile_alpha',
  sourceSpawnPointId: 'spawn_alpha',
  displayName: 'Alpha Boss'
});
assert.equal('level' in normalized, false, 'Story must not override Boss Profile level.');

assert.match(migration, /runtime_story_boss_spawn_effects/);
assert.match(migration, /PRIMARY KEY \(scene_run_id, story_event_id, effect_index\)/);
assert.match(migration, /boss_instance_id TEXT NOT NULL UNIQUE/);
assert.doesNotMatch(migration, /DROP TABLE/i);
assert.doesNotMatch(migration, /DELETE FROM/i);

assert.match(service, /async function bossSpawnReplay/);
assert.match(service, /CREATE TABLE IF NOT EXISTS runtime_story_boss_spawn_effects/);
assert.match(service, /INSERT INTO runtime_story_boss_spawn_effects/);
assert.match(service, /const replay = await bossSpawnReplay/);
assert.match(service, /const concurrentReplay = await bossSpawnReplay/);
assert.match(service, /storyEffectReplay:\s*true/);
assert.match(service, /storyEffectReplay:\s*false/);
assert.match(service, /INSERT INTO boss_instances/);
assert.match(service, /INSERT INTO runtime_encounter_participants/);
assert.match(service, /INSERT INTO runtime_entity_positions/);
assert.doesNotMatch(service, /INSERT INTO encounter_participants/);
assert.doesNotMatch(service, /INSERT INTO encounter_combats/);
assert.doesNotMatch(service, /UPDATE\s+encounters\s+SET\s+status/i);

for (const executor of [manual, zone, resolved]) {
  assert.match(executor, /spawnRuntimeBoss/);
  assert.match(executor, /effect\.type === 'spawn_boss'/);
  assert.match(executor, /profileId:\s*effect\.profileId/);
  assert.match(executor, /storyEffectIndex:\s*context\.event\.oncePerSceneRun \? effectIndex : null/);
}

assert.match(help, /"type": "spawn_boss"/);
assert.match(help, /Boss Design Profiles/);
assert.match(help, /\/api\/gm\/bosses/);

assert.match(runner, /RUNTIME_ENCOUNTER_POSITION_REQUIRED/);
assert.match(runner, /retryBossEffect\.unchanged === true/);
assert.match(runner, /sameBossReplay/);
assert.match(runner, /bossParticipantCount/);
assert.match(runner, /Definition Encounter roster/);
assert.match(runner, /Definition encounter_combats/);
assert.match(runner, /Encounter Definition status/);

assert.match(canonical, /same D1 batch/i);
assert.match(canonical, /same Boss Instance/i);
assert.match(canonical, /Definition \/ Runtime isolation/);
assert.match(canonical, /manual GM Story Event execution/);
assert.match(canonical, /automatic `enter_zone`/);
assert.match(canonical, /automatic `encounter_resolved`/);

console.log('Story Runtime spawn_boss authority and replay contract passed.');