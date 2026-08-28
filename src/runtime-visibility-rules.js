const ENTITY_TYPES = new Set(['character', 'monster_instance', 'boss_instance']);
const GLOBAL_MODES = new Set(['default', 'visible', 'hidden']);
const VIEWER_MODES = new Set(['visible', 'hidden']);

function entityType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!ENTITY_TYPES.has(normalized)) throw new RangeError('Unsupported runtime entity type.');
  return normalized;
}

function globalMode(value) {
  const normalized = String(value || 'default').trim().toLowerCase();
  if (!GLOBAL_MODES.has(normalized)) throw new RangeError('Unsupported global visibility mode.');
  return normalized;
}

export function normalizeViewerVisibility(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!VIEWER_MODES.has(normalized)) throw new RangeError('Viewer visibility override must be visible or hidden.');
  return normalized;
}

export function runtimeTokenVisible({
  entityType: rawEntityType,
  entityId,
  ownCharacterId = '',
  globalVisibility = 'default',
  viewerOverride = ''
}) {
  const type = entityType(rawEntityType);
  const mode = globalMode(globalVisibility);
  const id = String(entityId || '').trim();
  const ownId = String(ownCharacterId || '').trim();

  // Canonical invariant: a Player always sees their own Character token.
  if (type === 'character' && id && ownId && id === ownId) return true;

  if (viewerOverride) {
    return normalizeViewerVisibility(viewerOverride) === 'visible';
  }

  // Player Characters are public to other Players by default.
  if (type === 'character') return mode !== 'hidden';

  // Hostiles remain hidden unless explicitly made visible. This preserves the
  // existing Alpha information boundary while allowing a per-viewer reveal.
  return mode === 'visible';
}
