import baseWorker from './runtime-encounter-gateway.js';
import {
  findRuntimeEncounterByCombat,
  loadRuntimeEncounterResolutionLog,
  loadRuntimeEncounterResolutionReadiness,
  resolveRuntimeEncounter
} from './runtime-encounter-resolution.js';
import { processPendingRuntimeStoryLifecycleEvents } from './runtime-story-lifecycle.js';
import { processSceneRunStartStoryEvents } from './scene-run-start-story.js';

const GM_ROLES = new Set(['gm', 'admin']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function apiError(message, status = 400, code = 'BAD_REQUEST', extra = {}) {
  return json({ ok: false, error: { code, message, ...extra } }, status);
}

function validOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function currentUser(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.user || null;
}

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function mapContext(env, mapInstanceId) {
  const row = await env.DB.prepare(`
    SELECT id, scene_run_id, scene_id, status
    FROM runtime_map_instances
    WHERE id = ?
    LIMIT 1
  `).bind(mapInstanceId).first();
  if (!row) throw Object.assign(new Error('Runtime Map 不存在。'), { status: 404, code: 'RUNTIME_MAP_NOT_FOUND' });
  if (row.status !== 'active') throw Object.assign(new Error('Runtime Map 已關閉。'), { status: 409, code: 'RUNTIME_MAP_CLOSED' });
  return { id: row.id, sceneRunId: row.scene_run_id, sceneId: row.scene_id, status: row.status };
}

async function drainRuntimeLifecycle(env, sceneRunId, context = {}) {
  try {
    return {
      events: await processPendingRuntimeStoryLifecycleEvents(env, { sceneRunId }),
      warning: null
    };
  } catch (error) {
    console.error('Runtime Story lifecycle drain failed after committed Runtime mutation', {
      sceneRunId,
      ...context,
      code: error?.code || null,
      message: String(error?.message || error)
    });
    return {
      events: [],
      warning: { code: error?.code || 'STORY_LIFECYCLE_DRAIN_ERROR' }
    };
  }
}

function lifecycleGroups(...eventLists) {
  const all = eventLists.flat().filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const event of all) {
    const key = [event.triggerType || '', event.occurrenceId || '', event.eventId || '', event.executionId || '', event.status || ''].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return {
    storyLifecycleEvents: unique,
    encounterActivatedStoryEvents: unique.filter(event => event.triggerType === 'encounter_activated'),
    combatStartedStoryEvents: unique.filter(event => event.triggerType === 'combat_started'),
    combatEndedStoryEvents: unique.filter(event => event.triggerType === 'combat_ended'),
    encounterResolvedStoryEvents: unique.filter(event => event.triggerType === 'encounter_resolved')
  };
}

async function handleSceneRunStart(request, env) {
  const actor = await currentUser(request, env).catch(() => null);
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;
  const payload = await response.json();
  const map = payload?.mapInstance;
  if (!map?.id || !map?.sceneRunId || !map?.sceneId) return json(payload, response.status);

  let sceneRunStartStoryEvents = [];
  let sceneRunStartStoryWarning = null;
  if (actor?.id) {
    try {
      sceneRunStartStoryEvents = await processSceneRunStartStoryEvents(env, {
        actor,
        sceneRunId: map.sceneRunId,
        sceneId: map.sceneId,
        mapInstanceId: map.id
      });
    } catch (error) {
      console.error('scene_run_start Story processing failed after committed Scene Runtime creation', {
        sceneRunId: map.sceneRunId,
        sceneId: map.sceneId,
        mapInstanceId: map.id,
        message: String(error?.message || error)
      });
      sceneRunStartStoryWarning = { code: 'STORY_SCENE_RUN_START_TRIGGER_ERROR' };
    }
  } else {
    sceneRunStartStoryWarning = { code: 'STORY_SCENE_RUN_START_ACTOR_UNAVAILABLE' };
  }

  const lifecycle = await drainRuntimeLifecycle(env, map.sceneRunId, { mapInstanceId: map.id, source: 'scene_run_start' });
  return json({
    ...payload,
    sceneRunStartStoryEvents,
    ...(sceneRunStartStoryWarning ? { sceneRunStartStoryWarning } : {}),
    ...lifecycleGroups(lifecycle.events),
    ...(lifecycle.warning ? {
      storyLifecycleWarning: lifecycle.warning,
      encounterActivatedStoryWarning: lifecycle.warning
    } : {})
  }, response.status);
}

async function handleManualResolve(request, env, mapInstanceId, encounterId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const gm = await requireGM(request, env);
  const map = await mapContext(env, mapInstanceId);
  const resolution = await resolveRuntimeEncounter(env, {
    sceneRunId: map.sceneRunId,
    sceneId: map.sceneId,
    encounterId,
    actorUserId: gm.id,
    source: 'gm_manual',
    combatId: null,
    requireHostilesCleared: false
  });

  const lifecycle = await drainRuntimeLifecycle(env, map.sceneRunId, { mapInstanceId: map.id, source: 'encounter_resolved_manual' });
  const groups = lifecycleGroups(lifecycle.events);
  return json({
    ok: true,
    resolution,
    storyEventsTriggered: groups.encounterResolvedStoryEvents,
    ...groups,
    ...(lifecycle.warning ? {
      storyTriggerWarning: lifecycle.warning,
      storyLifecycleWarning: lifecycle.warning,
      encounterResolvedStoryWarning: lifecycle.warning,
      encounterActivatedStoryWarning: lifecycle.warning
    } : {})
  });
}

async function handleCombatEnd(request, env, combatId) {
  const actor = await currentUser(request, env).catch(() => null);
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;
  const payload = await response.json();

  let linked;
  try {
    linked = await findRuntimeEncounterByCombat(env, combatId);
  } catch (error) {
    console.error('Unable to inspect Runtime Encounter after committed Combat end', {
      combatId,
      message: String(error?.message || error)
    });
    return json({ ...payload, runtimeEncounterResolutionWarning: { code: 'RUNTIME_ENCOUNTER_LINK_LOOKUP_ERROR' } }, response.status);
  }
  if (!linked) return json(payload, response.status);

  // Combat End lifecycle belongs between the committed Combat transition and Encounter auto-resolution.
  // This preserves the meaningful state boundary: Combat=ended while Runtime Encounter is still active.
  const preResolutionLifecycle = await drainRuntimeLifecycle(env, linked.sceneRunId, {
    mapInstanceId: linked.mapInstanceId,
    combatId,
    source: 'combat_ended_pre_resolution'
  });

  let resolution;
  try {
    resolution = await resolveRuntimeEncounter(env, {
      sceneRunId: linked.sceneRunId,
      sceneId: linked.sceneId,
      encounterId: linked.encounterId,
      actorUserId: linked.endedByUserId || actor?.id || null,
      source: 'combat_hostiles_cleared',
      combatId,
      requireHostilesCleared: true
    });
  } catch (error) {
    console.error('Runtime Encounter auto-resolution failed after committed Combat end', {
      combatId,
      encounterId: linked.encounterId,
      message: String(error?.message || error)
    });
    return json({
      ...payload,
      ...lifecycleGroups(preResolutionLifecycle.events),
      ...(preResolutionLifecycle.warning ? { storyLifecycleWarning: preResolutionLifecycle.warning } : {}),
      runtimeEncounterResolutionWarning: { code: error?.code || 'RUNTIME_ENCOUNTER_AUTO_RESOLUTION_ERROR' }
    }, response.status);
  }

  const postResolutionLifecycle = await drainRuntimeLifecycle(env, linked.sceneRunId, {
    mapInstanceId: linked.mapInstanceId,
    combatId,
    source: 'encounter_resolved_combat'
  });
  const lifecycleWarning = preResolutionLifecycle.warning || postResolutionLifecycle.warning;
  const groups = lifecycleGroups(preResolutionLifecycle.events, postResolutionLifecycle.events);
  return json({
    ...payload,
    runtimeEncounterResolution: resolution,
    storyEventsTriggered: groups.encounterResolvedStoryEvents,
    ...groups,
    ...(lifecycleWarning ? {
      storyTriggerWarning: lifecycleWarning,
      storyLifecycleWarning: lifecycleWarning,
      encounterResolvedStoryWarning: lifecycleWarning,
      encounterActivatedStoryWarning: lifecycleWarning
    } : {})
  }, response.status);
}

async function handleStoryMutationWithEncounterDrain(request, env, mapInstanceId, source) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;
  const payload = await response.json();
  let map;
  try {
    map = await mapContext(env, mapInstanceId);
  } catch (error) {
    console.error('Unable to load Runtime Map after committed Story mutation', {
      mapInstanceId,
      source,
      message: String(error?.message || error)
    });
    return json({
      ...payload,
      storyLifecycleEvents: [],
      encounterActivatedStoryEvents: [],
      combatStartedStoryEvents: [],
      combatEndedStoryEvents: [],
      encounterResolvedStoryEvents: [],
      storyLifecycleWarning: { code: 'STORY_LIFECYCLE_MAP_LOOKUP_ERROR' },
      encounterActivatedStoryWarning: { code: 'STORY_ENCOUNTER_ACTIVATED_MAP_LOOKUP_ERROR' }
    }, response.status);
  }
  const lifecycle = await drainRuntimeLifecycle(env, map.sceneRunId, { mapInstanceId: map.id, source });
  return json({
    ...payload,
    ...lifecycleGroups(lifecycle.events),
    ...(lifecycle.warning ? {
      storyLifecycleWarning: lifecycle.warning,
      encounterActivatedStoryWarning: lifecycle.warning
    } : {})
  }, response.status);
}

async function enrichRuntimeDetail(env, response) {
  if (!response.ok) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;
  const payload = await response.json();
  const sceneRunId = payload?.mapInstance?.sceneRunId;
  if (!sceneRunId || !Array.isArray(payload?.runtimeEncounters)) return json(payload, response.status);
  const enriched = await Promise.all(payload.runtimeEncounters.map(async encounter => {
    const [readiness, logs] = await Promise.all([
      loadRuntimeEncounterResolutionReadiness(env, sceneRunId, encounter.encounterId),
      loadRuntimeEncounterResolutionLog(env, sceneRunId, encounter.encounterId)
    ]);
    return {
      ...encounter,
      resolution: {
        readiness,
        latest: logs[0] || null
      }
    };
  }));
  return json({ ...payload, runtimeEncounters: enriched }, response.status);
}

function errorExtra(error) {
  const extra = {};
  for (const key of ['combatId', 'readiness', 'blockers']) {
    if (error?.[key] !== undefined) extra[key] = error[key];
  }
  return extra;
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/world/runtime/scene-runs' && request.method === 'POST') {
        return await handleSceneRunStart(request, env);
      }

      let match = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/encounters\/([^/]+)\/resolve$/);
      if (match) {
        return await handleManualResolve(request, env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
      }

      match = pathname.match(/^\/api\/gm\/combat\/([^/]+)\/end$/);
      if (match && request.method === 'POST') {
        return await handleCombatEnd(request, env, decodeURIComponent(match[1]));
      }

      match = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/story-events\/([^/]+)\/activate$/);
      if (match && request.method === 'POST') {
        return await handleStoryMutationWithEncounterDrain(request, env, decodeURIComponent(match[1]), 'manual_story_event');
      }

      match = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/move$/);
      if (match && request.method === 'POST') {
        const response = await baseWorker.fetch(request, env);
        if (!response.ok) return response;
        const contentType = response.headers.get('Content-Type') || '';
        if (!contentType.toLowerCase().includes('application/json')) return response;
        const payload = await response.json();
        const mapInstanceId = payload?.map?.id;
        const sceneRunId = payload?.map?.sceneRunId;
        if (!mapInstanceId || !sceneRunId) return json(payload, response.status);
        const lifecycle = await drainRuntimeLifecycle(env, sceneRunId, { mapInstanceId, source: 'player_move_enter_zone' });
        return json({
          ...payload,
          ...lifecycleGroups(lifecycle.events),
          ...(lifecycle.warning ? {
            storyLifecycleWarning: lifecycle.warning,
            encounterActivatedStoryWarning: lifecycle.warning
          } : {})
        }, response.status);
      }

      match = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)$/);
      if (match && request.method === 'GET') {
        return enrichRuntimeDetail(env, await baseWorker.fetch(request, env));
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Runtime Encounter resolution gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'RUNTIME_ENCOUNTER_RESOLUTION_ERROR', errorExtra(error));
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Runtime Encounter resolution service 暫時無法使用。', 500, 'RUNTIME_ENCOUNTER_RESOLUTION_SERVICE_ERROR');
    }
  }
};