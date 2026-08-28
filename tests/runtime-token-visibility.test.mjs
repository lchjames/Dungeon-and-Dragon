import assert from 'node:assert/strict';
import { normalizeViewerVisibility, runtimeTokenVisible } from '../src/runtime-visibility-rules.js';

assert.equal(normalizeViewerVisibility('VISIBLE'), 'visible');
assert.equal(normalizeViewerVisibility('hidden'), 'hidden');
assert.throws(() => normalizeViewerVisibility('default'));

// Own Character is always visible, even when both global and viewer overrides say hidden.
assert.equal(runtimeTokenVisible({
  entityType: 'character', entityId: 'char_self', ownCharacterId: 'char_self',
  globalVisibility: 'hidden', viewerOverride: 'hidden'
}), true);

// Other Player Characters are visible by default.
assert.equal(runtimeTokenVisible({
  entityType: 'character', entityId: 'char_other', ownCharacterId: 'char_self', globalVisibility: 'default'
}), true);
assert.equal(runtimeTokenVisible({
  entityType: 'character', entityId: 'char_other', ownCharacterId: 'char_self', globalVisibility: 'hidden'
}), false);
assert.equal(runtimeTokenVisible({
  entityType: 'character', entityId: 'char_other', ownCharacterId: 'char_self',
  globalVisibility: 'hidden', viewerOverride: 'visible'
}), true);
assert.equal(runtimeTokenVisible({
  entityType: 'character', entityId: 'char_other', ownCharacterId: 'char_self',
  globalVisibility: 'visible', viewerOverride: 'hidden'
}), false);

// Hostiles preserve the existing secure default: hidden unless explicitly visible.
for (const type of ['monster_instance', 'boss_instance']) {
  assert.equal(runtimeTokenVisible({ entityType: type, entityId: `${type}_1`, globalVisibility: 'default' }), false);
  assert.equal(runtimeTokenVisible({ entityType: type, entityId: `${type}_1`, globalVisibility: 'hidden' }), false);
  assert.equal(runtimeTokenVisible({ entityType: type, entityId: `${type}_1`, globalVisibility: 'visible' }), true);
  assert.equal(runtimeTokenVisible({
    entityType: type, entityId: `${type}_1`, globalVisibility: 'hidden', viewerOverride: 'visible'
  }), true);
  assert.equal(runtimeTokenVisible({
    entityType: type, entityId: `${type}_1`, globalVisibility: 'visible', viewerOverride: 'hidden'
  }), false);
}

console.log('Canonical runtime token visibility rules passed.');
