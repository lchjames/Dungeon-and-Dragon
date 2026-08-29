import assert from 'node:assert/strict';
import {
  evaluateStoryConditions,
  normalizeStoryCondition,
  normalizeStoryEffect,
  normalizeStoryEventStructure,
  normalizeStoryFlagKey,
  normalizeStoryTrigger,
  STORY_EVENT_CONDITION_TYPES,
  STORY_EVENT_EFFECT_TYPES,
  STORY_EVENT_TRIGGER_TYPES
} from '../src/story-event-rules.js';

assert.ok(STORY_EVENT_TRIGGER_TYPES.includes('manual'));
assert.ok(STORY_EVENT_TRIGGER_TYPES.includes('enter_zone'));
assert.ok(STORY_EVENT_CONDITION_TYPES.includes('flag_equals'));
assert.ok(STORY_EVENT_CONDITION_TYPES.includes('encounter_status'));
assert.ok(STORY_EVENT_EFFECT_TYPES.includes('show_narrative'));
assert.ok(STORY_EVENT_EFFECT_TYPES.includes('close_door'));
assert.ok(STORY_EVENT_EFFECT_TYPES.includes('activate_encounter'));
assert.ok(STORY_EVENT_EFFECT_TYPES.includes('spawn_monster'));
assert.ok(STORY_EVENT_EFFECT_TYPES.includes('start_combat'));

assert.equal(normalizeStoryFlagKey('Boss.Defeated'), 'boss.defeated');
assert.throws(() => normalizeStoryFlagKey('bad key'));
assert.deepEqual(normalizeStoryTrigger('manual', {}), {});
assert.deepEqual(normalizeStoryTrigger('enter_zone', { sourceZoneId: 'zone_er', ignored: true }), {
  sourceZoneId: 'zone_er'
});
assert.throws(() => normalizeStoryTrigger('enter_zone', {}));
assert.throws(() => normalizeStoryTrigger('enter_zone', []));
assert.deepEqual(normalizeStoryCondition({ type: 'event_not_fired' }), { type: 'event_not_fired' });
assert.deepEqual(normalizeStoryCondition({ type: 'door_state', sourceEdgeId: 'edge_1', state: 'CLOSED' }), {
  type: 'door_state', sourceEdgeId: 'edge_1', state: 'closed'
});
assert.deepEqual(normalizeStoryCondition({ type: 'encounter_status', encounterId: 'encounter_1', status: 'PLANNED' }), {
  type: 'encounter_status', encounterId: 'encounter_1', status: 'planned'
});
assert.deepEqual(normalizeStoryEffect({ type: 'set_flag', key: 'door.opened', value: true }), {
  type: 'set_flag', key: 'door.opened', value: true
});
assert.deepEqual(normalizeStoryEffect({ type: 'open_door', sourceEdgeId: 'edge_2' }), {
  type: 'open_door', sourceEdgeId: 'edge_2'
});
assert.deepEqual(normalizeStoryEffect({ type: 'reveal_zone', sourceZoneId: 'zone_er' }), {
  type: 'reveal_zone', sourceZoneId: 'zone_er'
});
assert.deepEqual(normalizeStoryEffect({ type: 'activate_encounter', encounterId: 'encounter_1' }), {
  type: 'activate_encounter', encounterId: 'encounter_1'
});
assert.deepEqual(normalizeStoryEffect({
  type: 'spawn_monster',
  encounterId: 'encounter_1',
  templateId: 'monster_template_1',
  level: 12,
  sourceSpawnPointId: 'spawn_ambush',
  displayName: 'Hall Stalker'
}), {
  type: 'spawn_monster',
  encounterId: 'encounter_1',
  templateId: 'monster_template_1',
  level: 12,
  sourceSpawnPointId: 'spawn_ambush',
  displayName: 'Hall Stalker'
});
assert.deepEqual(normalizeStoryEffect({
  type: 'spawn_monster', encounterId: 'encounter_1', templateId: 'monster_template_1', level: 1, sourceSpawnPointId: 'spawn_ambush'
}), {
  type: 'spawn_monster', encounterId: 'encounter_1', templateId: 'monster_template_1', level: 1, sourceSpawnPointId: 'spawn_ambush'
});
assert.deepEqual(normalizeStoryEffect({ type: 'start_combat', encounterId: 'encounter_1' }), {
  type: 'start_combat', encounterId: 'encounter_1'
});
assert.throws(() => normalizeStoryCondition({ type: 'encounter_status', encounterId: 'encounter_1', status: 'deleted' }));
assert.throws(() => normalizeStoryEffect({ type: 'activate_encounter' }));
assert.throws(() => normalizeStoryEffect({ type: 'spawn_monster', encounterId: 'encounter_1', templateId: 'monster_template_1', level: 0, sourceSpawnPointId: 'spawn_ambush' }));
assert.throws(() => normalizeStoryEffect({ type: 'spawn_monster', encounterId: 'encounter_1', templateId: 'monster_template_1', level: 101, sourceSpawnPointId: 'spawn_ambush' }));
assert.throws(() => normalizeStoryEffect({ type: 'spawn_monster', encounterId: 'encounter_1', templateId: 'monster_template_1', level: 1.5, sourceSpawnPointId: 'spawn_ambush' }));
assert.throws(() => normalizeStoryEffect({ type: 'spawn_monster', encounterId: 'encounter_1', templateId: 'monster_template_1', level: 1 }));
assert.throws(() => normalizeStoryEffect({ type: 'start_combat' }));
assert.throws(() => normalizeStoryEffect({ type: 'open_door', edgeId: 'runtime-edge-is-not-stable' }));
assert.throws(() => normalizeStoryEffect({ type: 'javascript', code: 'alert(1)' }));
assert.throws(() => normalizeStoryEffect({ type: 'set_flag', key: 'x', value: { arbitrary: 'object' } }));

const structure = normalizeStoryEventStructure({
  triggerType: 'manual',
  trigger: {},
  conditions: [
    { type: 'event_not_fired' },
    { type: 'flag_not_equals', key: 'ambush.done', value: true },
    { type: 'scene_run_status', status: 'active' },
    { type: 'door_state', sourceEdgeId: 'edge_er', state: 'open' },
    { type: 'encounter_status', encounterId: 'encounter_er', status: 'planned' }
  ],
  effects: [
    { type: 'show_narrative', text: 'The lights go out.' },
    { type: 'set_flag', key: 'ambush.done', value: true },
    { type: 'close_door', sourceEdgeId: 'edge_er' },
    { type: 'activate_encounter', encounterId: 'encounter_er' }
  ]
});
assert.equal(structure.triggerType, 'manual');
assert.equal(structure.conditions.length, 5);
assert.equal(structure.effects.length, 4);

const enterZoneStructure = normalizeStoryEventStructure({
  triggerType: 'enter_zone',
  trigger: { sourceZoneId: 'zone_er' },
  conditions: [{ type: 'event_not_fired' }],
  effects: [
    { type: 'activate_encounter', encounterId: 'encounter_er' },
    { type: 'spawn_monster', encounterId: 'encounter_er', templateId: 'monster_template_er', level: 4, sourceSpawnPointId: 'spawn_er' },
    { type: 'start_combat', encounterId: 'encounter_er' }
  ]
});
assert.deepEqual(enterZoneStructure.trigger, { sourceZoneId: 'zone_er' });
assert.deepEqual(enterZoneStructure.effects.map(item => item.type), ['activate_encounter', 'spawn_monster', 'start_combat']);
assert.throws(() => normalizeStoryEventStructure({
  triggerType: 'enter_zone',
  trigger: {},
  effects: [{ type: 'show_narrative', text: 'Invalid trigger.' }]
}));

const pass = evaluateStoryConditions(structure.conditions, {
  eventAlreadyFired: false,
  flags: new Map([['ambush.done', false]]),
  sceneRunStatus: 'active',
  doors: new Map([['edge_er', 'open']]),
  encounters: new Map([['encounter_er', { status: 'planned' }]])
});
assert.equal(pass.ok, true);
assert.deepEqual(pass.failures, []);

const fail = evaluateStoryConditions(structure.conditions, {
  eventAlreadyFired: true,
  flags: new Map([['ambush.done', true]]),
  sceneRunStatus: 'completed',
  doors: new Map([['edge_er', 'closed']]),
  encounters: new Map([['encounter_er', { status: 'active' }]])
});
assert.equal(fail.ok, false);
assert.equal(fail.failures.length, 5);
assert.ok(fail.failures.some(item => item.reason === 'encounter_status_mismatch'));

console.log('Structured Story Event rules passed.');
