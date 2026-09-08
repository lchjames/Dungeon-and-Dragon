import fs from 'node:fs';
import assert from 'node:assert/strict';

const definition = fs.readFileSync('src/scene-transition-definition.js', 'utf8');
const gateway = fs.readFileSync('src/runtime-object-gateway.js', 'utf8');
const storyUi = fs.readFileSync('public/assets/gm-story.js', 'utf8');
const runtimeUi = fs.readFileSync('public/assets/gm-runtime-map.js', 'utf8');
const migration = fs.readFileSync('schema/0030_scene_transition_authoring.sql', 'utf8');
const docs = fs.readFileSync('docs/SCENE_TRANSITION_AUTHORING_ALPHA.md', 'utf8');
const runner = fs.readFileSync('scripts/production-alpha-scene-transition-authoring-e2e.mjs', 'utf8');
const orchestrator = fs.readFileSync('scripts/production-alpha-e2e.mjs', 'utf8');

assert.match(migration, /CREATE TABLE IF NOT EXISTS scene_transition_definitions/);
assert.match(migration, /status IN \('draft', 'active', 'archived'\)/);
assert.match(migration, /transition_mode IN \('next_scene', 'complete_scenario'\)/);
assert.match(migration, /version INTEGER NOT NULL DEFAULT 1/);
assert.match(migration, /runtime_scene_transition_definition_links/);
assert.match(migration, /definition_snapshot_json TEXT NOT NULL/);

assert.match(definition, /const CONDITION_TYPES = new Set\(\[/);
for (const type of ['flag_equals', 'flag_not_equals', 'door_state', 'object_state', 'encounter_status']) {
  assert.match(definition, new RegExp(`'${type}'`));
}
assert.match(definition, /SCENE_TRANSITION_DEFINITION_CONDITION_UNSUPPORTED/);
assert.match(definition, /expectedVersion/);
assert.match(definition, /SCENE_TRANSITION_DEFINITION_DELETE_REQUIRES_DRAFT/);
assert.match(definition, /loadRuntimeSceneTransitionOptions/);
assert.match(definition, /resolveRuntimeSceneTransitionDefinition/);
assert.match(definition, /recordRuntimeSceneTransitionDefinitionLink/);
assert.match(definition, /evaluateStoryConditions/);
assert.match(definition, /targetSourceSpawnPointId/);

assert.match(gateway, /\/api\/gm\/scene-transitions/);
assert.match(gateway, /\/api\/gm\/scenes\/\(\[\^\/\]\+\)\/transitions/);
assert.match(gateway, /transition-options/);
assert.match(gateway, /transitionDefinitionId/);
assert.match(gateway, /SCENE_TRANSITION_DEFINITION_OVERRIDE_FORBIDDEN/);
assert.match(gateway, /transitionDefinitionLink/);

assert.match(storyUi, /Transition Definitions/);
assert.match(storyUi, /data-transition-definition/);
assert.match(storyUi, /transition-conditions/);
assert.match(storyUi, /transition-carry-flags/);
assert.match(storyUi, /transition-spawn/);

assert.match(runtimeUi, /Authored Route/);
assert.match(runtimeUi, /transition-options/);
assert.match(runtimeUi, /transitionDefinitionId/);
assert.match(runtimeUi, /Manual Override/);

assert.match(runner, /transition-options/);
assert.match(runner, /transitionDefinitionId/);
assert.match(runner, /flag_mismatch/);
assert.match(runner, /transitionDefinitionLink/);
assert.match(runner, /idempotent/);
assert.match(orchestrator, /Production Scene Transition Authoring E2E/);
assert.match(orchestrator, /scene-transition-authoring/);

assert.match(docs, /A Definition never auto-transitions the game/);
assert.match(docs, /explicit authored-route execution/i);
assert.match(docs, /Manual Override/);
assert.match(docs, /Story processor consolidation/);

console.log('Scene transition Definition authoring, Runtime eligibility, provenance, GM UI and production coverage contract passed.');
