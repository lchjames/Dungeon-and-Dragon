import { processPendingRuntimeStoryLifecycleEvents } from './runtime-story-lifecycle.js';

export async function processPendingEncounterActivatedStoryEvents(env, { sceneRunId } = {}) {
  return processPendingRuntimeStoryLifecycleEvents(env, { sceneRunId });
}

export { processPendingRuntimeStoryLifecycleEvents } from './runtime-story-lifecycle.js';
