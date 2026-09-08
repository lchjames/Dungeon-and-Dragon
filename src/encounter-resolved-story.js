import { processPendingRuntimeStoryLifecycleEvents } from './runtime-story-lifecycle.js';

// Compatibility shim only. encounter_resolved Story execution is owned by the
// canonical durable lifecycle adapter and shared Story execution authority.
export async function processEncounterResolvedStoryEvents(env, { sceneRunId } = {}) {
  return processPendingRuntimeStoryLifecycleEvents(env, { sceneRunId });
}

export { processPendingRuntimeStoryLifecycleEvents } from './runtime-story-lifecycle.js';
