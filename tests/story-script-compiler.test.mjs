import assert from 'node:assert/strict';
import { compileStoryScript, STORY_SCRIPT_LIMITS } from '../src/story-script-compiler.js';

const manual = compileStoryScript(`
# A compact GM-authored Event
NAME Vault alarm
STATUS active
ONCE yes
TRIGGER MANUAL
WHEN NOT_FIRED
WHEN FLAG_EQ vault.power true
WHEN OBJECT vault-door locked
DO SAY The vault alarm starts ringing.
DO SET_FLAG vault.alert "raised"
DO SET_OBJECT vault-door open
DO OPEN_DOOR edge-vault
`);

assert.equal(manual.name, 'Vault alarm');
assert.equal(manual.status, 'active');
assert.equal(manual.oncePerSceneRun, true);
assert.equal(manual.triggerType, 'manual');
assert.deepEqual(manual.trigger, {});
assert.deepEqual(manual.conditions, [
  { type: 'event_not_fired' },
  { type: 'flag_equals', key: 'vault.power', value: true },
  { type: 'object_state', sourceObjectId: 'vault-door', stateKey: 'locked' }
]);
assert.deepEqual(manual.effects, [
  { type: 'show_narrative', text: 'The vault alarm starts ringing.' },
  { type: 'set_flag', key: 'vault.alert', value: 'raised' },
  { type: 'set_object_state', sourceObjectId: 'vault-door', stateKey: 'open' },
  { type: 'open_door', sourceEdgeId: 'edge-vault' }
]);

const lifecycle = compileStoryScript(`
NAME Reinforcements
ONCE no
TRIGGER ENCOUNTER_ACTIVATED enc-alpha
WHEN ENCOUNTER enc-alpha active
EFFECT {"type":"spawn_monster","encounterId":"enc-alpha","templateId":"monster-guard","level":4,"sourceSpawnPointId":"spawn-a"}
DO START_COMBAT enc-alpha
`);
assert.equal(lifecycle.triggerType, 'encounter_activated');
assert.deepEqual(lifecycle.trigger, { encounterId: 'enc-alpha' });
assert.equal(lifecycle.oncePerSceneRun, false);
assert.equal(lifecycle.effects[0].type, 'spawn_monster');
assert.equal(lifecycle.effects[0].level, 4);

const enterZone = compileStoryScript(`
NAME Reveal room
TRIGGER ENTER_ZONE zone-secret
CONDITION {"type":"door_state","sourceEdgeId":"edge-secret","state":"open"}
DO REVEAL_ZONE zone-secret
`);
assert.equal(enterZone.triggerType, 'enter_zone');
assert.deepEqual(enterZone.trigger, { sourceZoneId: 'zone-secret' });
assert.deepEqual(enterZone.conditions[0], { type: 'door_state', sourceEdgeId: 'edge-secret', state: 'open' });

assert.throws(() => compileStoryScript('NAME Missing trigger\nDO SAY hello'), /TRIGGER is required/);
assert.throws(() => compileStoryScript('NAME No effects\nTRIGGER MANUAL'), /effects must contain 1 to 20 approved effects/);
assert.throws(() => compileStoryScript('NAME Bad\nTRIGGER MANUAL\nDO SET_FLAG x {"not":"scalar"}'), /JSON scalar/);
assert.throws(() => compileStoryScript('NAME Bad\nTRIGGER MANUAL\nEFFECT {"type":"arbitrary_sql","sql":"DROP TABLE users"}'), /condition type|effect type|not approved/i);
assert.throws(() => compileStoryScript('NAME Bad\nTRIGGER EXEC_JS alert(1)\nDO SAY x'), /Unknown TRIGGER command/);
assert.throws(() => compileStoryScript('NAME Bad\nTRIGGER MANUAL\nRUN SELECT * FROM users'), /Unknown directive/);
assert.ok(STORY_SCRIPT_LIMITS.maxScriptLength <= 24000);
assert.ok(STORY_SCRIPT_LIMITS.maxLines <= 120);

console.log('Safe GM Story script compiler regression passed.');
