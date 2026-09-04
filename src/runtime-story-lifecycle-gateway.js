import baseWorker from './runtime-encounter-resolution-gateway.js';
import {
  ensureRuntimeStoryLifecycleAuthoritySchema,
  processPendingRuntimeStoryLifecycleEvents
} from './runtime-story-lifecycle.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function apiError(message, status = 500, code = 'STORY_LIFECYCLE_ERROR') {
  return json({ ok: false, error: { code, message } }, status);
}

function isLifecycleMutation(pathname, method) {
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
  if (pathname === '/api/gm/world/runtime/scene-runs') return true;
  if (/^\/api\/gm\/world\/runtime\/maps\/[^/]+\/story-events\/[^/]+\/activate$/.test(pathname)) return true;
  if (/^\/api\/player\/world\/characters\/[^/]+\/move$/.test(pathname)) return true;
  if (/^\/api\/gm\/world\/runtime\/maps\/[^/]+\/encounters\/[^/]+\/(resolve|start-combat)$/.test(pathname)) return true;
  if (/^\/api\/gm\/combat\/[^/]+\/end$/.test(pathname)) return true;
  return false;
}

function mapIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\//);
  return match ? decodeURIComponent(match[1]) : null;
}

function combatIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/gm\/combat\/([^/]+)\/end$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function sceneRunIdForResponse(env, pathname, payload) {
  const direct = payload?.mapInstance?.sceneRunId
    || payload?.map?.sceneRunId
    || payload?.runtimeEncounter?.combat?.sceneRunId
    || payload?.runtimeEncounterResolution?.resolutionLog?.sceneRunId
    || payload?.resolution?.resolutionLog?.sceneRunId
    || null;
  if (direct) return direct;

  const mapId = mapIdFromPath(pathname);
  if (mapId) {
    const row = await env.DB.prepare(`
      SELECT scene_run_id FROM runtime_map_instances WHERE id = ? LIMIT 1
    `).bind(mapId).first();
    if (row?.scene_run_id) return row.scene_run_id;
  }

  const combatId = combatIdFromPath(pathname);
  if (combatId) {
    const row = await env.DB.prepare(`
      SELECT scene_run_id FROM runtime_encounter_combats WHERE combat_id = ? LIMIT 1
    `).bind(combatId).first();
    if (row?.scene_run_id) return row.scene_run_id;
  }
  return null;
}

function eventIdentity(event) {
  return [event?.triggerType || '', event?.occurrenceId || '', event?.eventId || '', event?.executionId || '', event?.status || ''].join(':');
}

function normalizeLifecyclePayload(payload, extraEvents = [], warning = null) {
  const sourceEvents = [
    ...(Array.isArray(payload?.storyLifecycleEvents) ? payload.storyLifecycleEvents : []),
    ...(Array.isArray(payload?.encounterActivatedStoryEvents) ? payload.encounterActivatedStoryEvents : []),
    ...(Array.isArray(payload?.combatStartedStoryEvents) ? payload.combatStartedStoryEvents : []),
    ...(Array.isArray(payload?.combatEndedStoryEvents) ? payload.combatEndedStoryEvents : []),
    ...(Array.isArray(payload?.encounterResolvedStoryEvents) ? payload.encounterResolvedStoryEvents : []),
    ...(Array.isArray(payload?.flagChangedStoryEvents) ? payload.flagChangedStoryEvents : []),
    ...(Array.isArray(extraEvents) ? extraEvents : [])
  ];
  const seen = new Set();
  const all = [];
  for (const event of sourceEvents) {
    const identity = eventIdentity(event);
    if (seen.has(identity)) continue;
    seen.add(identity);
    all.push(event);
  }
  const encounterActivated = all.filter(event => event?.triggerType === 'encounter_activated');
  const combatStarted = all.filter(event => event?.triggerType === 'combat_started');
  const combatEnded = all.filter(event => event?.triggerType === 'combat_ended');
  const encounterResolved = all.filter(event => event?.triggerType === 'encounter_resolved');
  const flagChanged = all.filter(event => event?.triggerType === 'flag_changed');
  const hadLifecycleShape = sourceEvents.length > 0
    || Object.prototype.hasOwnProperty.call(payload || {}, 'encounterActivatedStoryEvents')
    || Object.prototype.hasOwnProperty.call(payload || {}, 'combatStartedStoryEvents')
    || Object.prototype.hasOwnProperty.call(payload || {}, 'combatEndedStoryEvents')
    || Object.prototype.hasOwnProperty.call(payload || {}, 'encounterResolvedStoryEvents')
    || Object.prototype.hasOwnProperty.call(payload || {}, 'flagChangedStoryEvents')
    || Object.prototype.hasOwnProperty.call(payload || {}, 'storyLifecycleEvents');
  if (!hadLifecycleShape && !warning) return payload;
  return {
    ...payload,
    storyLifecycleEvents: all,
    encounterActivatedStoryEvents: encounterActivated,
    combatStartedStoryEvents: combatStarted,
    combatEndedStoryEvents: combatEnded,
    encounterResolvedStoryEvents: encounterResolved,
    flagChangedStoryEvents: flagChanged,
    ...(warning ? { storyLifecycleWarning: warning } : {})
  };
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const lifecycleMutation = isLifecycleMutation(pathname, request.method);

    if (lifecycleMutation) {
      try {
        await ensureRuntimeStoryLifecycleAuthoritySchema(env);
      } catch (error) {
        console.error('Unable to prepare Runtime Story lifecycle authority before mutation', {
          path: pathname,
          message: String(error?.message || error)
        });
        return apiError(
          'Runtime Story lifecycle authority 暫時無法使用。',
          503,
          'STORY_LIFECYCLE_AUTHORITY_UNAVAILABLE'
        );
      }
    }

    const response = await baseWorker.fetch(request, env);
    if (!response.ok || !lifecycleMutation) return response;
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('application/json')) return response;

    const payload = await response.json();
    let extraEvents = [];
    let warning = null;
    try {
      const sceneRunId = await sceneRunIdForResponse(env, pathname, payload);
      if (sceneRunId) {
        extraEvents = await processPendingRuntimeStoryLifecycleEvents(env, { sceneRunId });
      }
    } catch (error) {
      console.error('Runtime Story lifecycle drain failed after committed mutation', {
        path: pathname,
        code: error?.code || null,
        message: String(error?.message || error)
      });
      warning = { code: error?.code || 'STORY_LIFECYCLE_DRAIN_ERROR' };
    }

    return json(normalizeLifecyclePayload(payload, extraEvents, warning), response.status);
  }
};
