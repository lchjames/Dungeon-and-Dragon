import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('schema/0029_runtime_scene_transition_policy.sql', 'utf8');
const service = readFileSync('src/runtime-scene-transition.js', 'utf8');
const gateway = readFileSync('src/runtime-object-gateway.js', 'utf8');
const ui = readFileSync('public/assets/gm-runtime-map.js', 'utf8');
const runner = readFileSync('scripts/production-alpha-scene-transition-e2e.mjs', 'utf8');
const orchestrator = readFileSync('scripts/production-alpha-e2e.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/mvp-checks.yml', 'utf8');
const canonical = readFileSync('docs/RUNTIME_SCENE_TRANSITION_POLICY_ALPHA.md', 'utf8');

assert.match(schema, /CREATE TABLE IF NOT EXISTS runtime_scene_transition_log/);
assert.match(schema, /from_scene_run_id TEXT NOT NULL UNIQUE/);
assert.match(schema, /transition_mode IN \('next_scene', 'complete_scenario'\)/);
assert.match(schema, /carry_flag_keys_json/);
assert.match(schema, /carried_character_ids_json/);
assert.match(schema, /target_source_spawn_point_id/);
assert.match(schema, /skipped_encounter_count/);
assert.match(schema, /cancelled_rest_count/);

assert.match(service, /SCENE_TRANSITION_ACTIVE_COMBAT/);
assert.match(service, /SCENE_TRANSITION_ACTIVE_ENCOUNTER/);
assert.match(service, /SCENARIO_RUN_ACTIVE_SCENE_CONFLICT/);
assert.match(service, /SCENE_TRANSITION_TARGET_INACTIVE/);
assert.match(service, /SCENE_TRANSITION_SPAWN_REQUIRED/);
assert.match(service, /SCENE_TRANSITION_FLAG_NOT_FOUND/);
assert.match(service, /SET status = 'skipped'/);
assert.match(service, /interrupted_reason = 'scene_transition'/);
assert.match(service, /status = 'closed'/);
assert.match(service, /status = 'completed'/);
assert.match(service, /INSERT INTO scene_runs/);
assert.match(service, /INSERT INTO runtime_map_instances/);
assert.match(service, /INSERT INTO runtime_entity_positions/);
assert.match(service, /INSERT INTO runtime_story_flags/);
assert.match(service, /processSceneRunStartStoryEvents/);
assert.match(service, /processPendingRuntimeStoryLifecycleEvents/);
assert.match(service, /existingTransition/);
assert.match(service, /idempotent: true/);
assert.match(service, /destination\.scene_status !== 'active'/);
assert.match(service, /destination\.scenario_id|sc\.id AS scenario_id/);
assert.match(service, /source\.scenario_run_id/);

assert.match(gateway, /runtime-scene-transition\.js/);
assert.match(gateway, /\/transition\$/);
assert.match(gateway, /transitionRuntimeScene/);
assert.match(gateway, /ensureRuntimeObjectAuthority/);
assert.match(gateway, /requireGM/);
assert.match(gateway, /validOrigin/);

assert.match(ui, /runtime-transition-scene/);
assert.match(ui, /runtime-transition-spawn/);
assert.match(ui, /runtime-transition-flags/);
assert.match(ui, /runtime-transition-carry-characters/);
assert.match(ui, /data-runtime-transition="next_scene"/);
assert.match(ui, /data-runtime-transition="complete_scenario"/);
assert.match(ui, /\/transition`/);
assert.match(ui, /targetSourceSpawnPointId/);
assert.match(ui, /carryFlagKeys/);

assert.match(runner, /mode: 'next_scene'/);
assert.match(runner, /mode: 'complete_scenario'/);
assert.match(runner, /carryFlagKeys: \[FLAG_KEY\]/);
assert.match(runner, /targetSourceSpawnPointId: SPAWN_ID/);
assert.match(runner, /sceneRunStartStoryEvents/);
assert.match(runner, /idempotent === true/);
assert.match(runner, /playerAfter\?\.map\?\.id === mapBId/);
assert.match(orchestrator, /Production Scene Transition E2E/);
assert.match(orchestrator, /production-alpha-scene-transition-e2e\.mjs/);
assert.match(orchestrator, /runtime-scene-transition/);
assert.match(workflow, /runtime-scene-transition-contract\.test\.mjs/);

assert.match(canonical, /explicit Scene transition operation/);
assert.match(canonical, /Story flags are Scene-Run-scoped by default/);
assert.match(canonical, /carried flags are committed \*\*before\*\* destination `scene_run_start` Story evaluation/);
assert.match(canonical, /does \*\*not\*\* mutate/);
assert.match(canonical, /low-level `\/close`/i);
assert.match(canonical, /one D1 batch/);
assert.match(canonical, /UNIQUE\(from_scene_run_id\)/);

console.log('Runtime Scene completion/transition authority, carry policy, idempotency, UI and production coverage contract passed.');
