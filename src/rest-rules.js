const REST_TYPES = new Set(['short', 'long']);
const REST_RESOURCES = new Set(['HP', 'MP']);

function normalizedRestType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!REST_TYPES.has(type)) throw new RangeError('Rest type must be short or long.');
  return type;
}

function normalizedResource(value) {
  const resource = String(value || '').trim().toUpperCase();
  if (!REST_RESOURCES.has(resource)) throw new RangeError('Rest resource must be HP or MP.');
  return resource;
}

export function restRequiredRounds(restType) {
  return normalizedRestType(restType) === 'short' ? 2 : 5;
}

export function resolveRestRecovery({ restType, resource, current, max }) {
  const type = normalizedRestType(restType);
  const key = normalizedResource(resource);
  const safeMax = Math.max(0, Number(max) || 0);
  const safeCurrent = Math.max(0, Math.min(safeMax, Number(current) || 0));

  let recoveryRequested = 0;
  if (type === 'short' && key === 'HP') recoveryRequested = Math.ceil(safeMax * 0.10);
  else if (type === 'short' && key === 'MP') recoveryRequested = Math.ceil(safeMax * 0.25);
  else if (type === 'long' && key === 'HP') recoveryRequested = Math.ceil(safeMax * 0.50);
  else recoveryRequested = Math.max(0, safeMax - safeCurrent);

  const recoveryApplied = Math.max(0, Math.min(recoveryRequested, safeMax - safeCurrent));
  return {
    restType: type,
    resource: key,
    currentBefore: safeCurrent,
    max: safeMax,
    recoveryRequested,
    recoveryApplied,
    currentAfter: safeCurrent + recoveryApplied
  };
}

export function validateRestChoice(restType, resource) {
  const type = normalizedRestType(restType);
  const key = normalizedResource(resource);
  return { restType: type, resource: key, requiredRounds: restRequiredRounds(type) };
}
