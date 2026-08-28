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
assert.ok(STORY_EVENT_EFFECT_TYPES.includes('show_narrative'));
assert.ok(STORY_EVENT_EFFECT_TYPES.includes('close_door'));

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
assert.deepEqual(normalizeStoryEffect({ type: 'set_flag', key: 'door.opened', value: true }), {
  type: 'set_flag', key: 'door.opened', value: true
});
assert.deepEqual(normalizeStoryEffect({ type: 'open_door', sourceEdgeId: 'edge_2' }), {
  type: 'open_door', sourceEdgeId: 'edge_2'
});
assert.deepEqual(normalizeStoryEffect({ type: 'reveal_zone', sourceZoneId: 'zone_er' }), {
  type: 'reveal_zone', sourceZoneId: 'zone_er'
});
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
    { type: 'door_state', sourceEdgeId: 'edge_er', state: 'open' }
  ],
  effects: [
    { type: 'show_narrative', text: 'The lights go out.' },
    { type: 'set_flag', key: 'ambush.done', value: true },
    { type: 'close_door', sourceEdgeId: 'edge_er' }
  ]
});
assert.equal(structure.triggerType, 'manual');
assert.equal(structure.conditions.length, 4);
assert.equal(structure.effects.length, 3);

const enterZoneStructure = normalizeStoryEventStructure({
  triggerType: 'enter_zone',
  trigger: { sourceZoneId: 'zone_er' },
  conditions: [{ type: 'event_not_fired' }],
  effects: [{ type: 'show_narrative', text: 'You entered the emergency room.' }]
});
assert.deepEqual(enterZoneStructure.trigger, { sourceZoneId: 'zone_er' });
assert.throws(() => normalizeStoryEventStructure({
  triggerType: 'enter_zone',
  trigger: {},
  effects: [{ type: 'show_narrative', text: 'Invalid trigger.' }]
}));

const pass = evaluateStoryConditions(structure.conditions, {
  eventAlreadyFired: false,
  flags: new Map([['ambush.done', false]]),
  sceneRunStatus: 'active',
  doors: new Map([['edge_er', 'open']])
});
assert.equal(pass.ok, true);
assert.deepEqual(pass.failures, []);

const fail = evaluateStoryConditions(structure.conditions, {
  eventAlreadyFired: true,
  flags: new Map([['ambush.done', true]]),
  sceneRunStatus: 'completed',
  doors: new Map([['edge_er', 'closed']])
});
assert.equal(fail.ok, false);
assert.equal(fail.failures.length, 4);

console.log('Structured Story Event rules passed.');
