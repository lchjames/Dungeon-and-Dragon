import baseWorker from './story-event-gateway.js';
import { normalizeStoryTrigger } from './story-event-rules.js';
import { loadRuntimeEncounterMap } from './runtime-encounter-state.js';
import {
  loadRuntimeObjectTargets,
  runtimeObjectStateMap
} from './runtime-object-state.js';
import { executeRuntimeStoryEvent } from './story-execution-authority.js';


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

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
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

function eventPayload(row) {
  return {
    id: row.id,
    sceneId: row.scene_id,
    name: row.name,
    triggerType: row.trigger_type,
    trigger: parseJson(row.trigger_json, {}),
    conditions: parseJson(row.conditions_json, []),
    effects: parseJson(row.effects_json, []),
    oncePerSceneRun: Boolean(row.once_per_scene_run)
  };
}

async function enteredRuntimeZones(env, mapInstanceId, from, to) {
  const rows = await env.DB.prepare(`
    SELECT rz.id, rz.source_zone_id, rz.name, rz.player_visible
    FROM runtime_map_zones rz
    JOIN runtime_map_zone_cells destination
      ON destination.runtime_zone_id = rz.id
     AND destination.x = ? AND destination.y = ?
    LEFT JOIN runtime_map_zone_cells origin
      ON origin.runtime_zone_id = rz.id
     AND origin.x = ? AND origin.y = ?
    WHERE rz.map_instance_id = ?
      AND rz.source_zone_id IS NOT NULL
      AND TRIM(rz.source_zone_id) <> ''
      AND origin.runtime_zone_id IS NULL
    ORDER BY rz.created_at, rz.id
  `).bind(to.x, to.y, from.x, from.y, mapInstanceId).all();
  return (rows.results || []).map(row => ({
    runtimeZoneId: row.id,
    sourceZoneId: row.source_zone_id,
    name: row.name,
    playerVisible: Boolean(row.player_visible)
  }));
}

async function loadRuntimeTargets(env, mapInstanceId) {
  const [zones, doors, spawns] = await Promise.all([
    env.DB.prepare(`
      SELECT id, source_zone_id, name, player_visible
      FROM runtime_map_zones
      WHERE map_instance_id = ? AND source_zone_id IS NOT NULL
      ORDER BY created_at, id
    `).bind(mapInstanceId).all(),
    env.DB.prepare(`
      SELECT id, source_edge_id, x, y, direction, door_state, blocks_movement
      FROM runtime_map_edges
      WHERE map_instance_id = ? AND edge_type = 'door' AND source_edge_id IS NOT NULL
      ORDER BY y, x, direction, id
    `).bind(mapInstanceId).all(),
    env.DB.prepare(`
      SELECT id, source_spawn_point_id, name, x, y, spawn_type, enabled
      FROM runtime_map_spawn_points
      WHERE map_instance_id = ? AND source_spawn_point_id IS NOT NULL
      ORDER BY created_at, id
    `).bind(mapInstanceId).all()
  ]);
  const zoneBySource = new Map((zones.results || []).map(row => [row.source_zone_id, {
    id: row.id,
    sourceZoneId: row.source_zone_id,
    name: row.name,
    playerVisible: Boolean(row.player_visible)
  }]));
  const doorBySource = new Map((doors.results || []).map(row => [row.source_edge_id, {
    id: row.id,
    sourceEdgeId: row.source_edge_id,
    x: Number(row.x),
    y: Number(row.y),
    direction: row.direction,
    doorState: row.door_state || 'closed',
    blocksMovement: Boolean(row.blocks_movement)
  }]));
  const spawnBySource = new Map((spawns.results || []).map(row => [row.source_spawn_point_id, {
    id: row.id,
    sourceSpawnPointId: row.source_spawn_point_id,
    name: row.name,
    x: Number(row.x),
    y: Number(row.y),
    spawnType: row.spawn_type,
    enabled: Boolean(row.enabled)
  }]));
  return { zoneBySource, doorBySource, spawnBySource };
}

function doorStates(targets) {
  return new Map([...targets.doorBySource].map(([id, edge]) => [id, edge.doorState || 'closed']));
}

async function processEnterZoneTriggers(request, env, payload) {
  const map = payload?.map;
  const movement = payload?.movement;
  if (!map?.id || !map?.sceneRunId || !map?.sceneId || !movement?.from || !movement?.to) return [];

  const enteredZones = await enteredRuntimeZones(env, map.id, movement.from, movement.to);
  if (!enteredZones.length) return [];
  const enteredSourceIds = new Set(enteredZones.map(zone => zone.sourceZoneId));

  const [actor, sceneRun, eventRows, targets, flags, counts, encounters] = await Promise.all([
    currentUser(request, env),
    env.DB.prepare('SELECT id, status FROM scene_runs WHERE id = ? LIMIT 1').bind(map.sceneRunId).first(),
    env.DB.prepare(`
      SELECT * FROM story_events
      WHERE scene_id = ? AND status = 'active' AND trigger_type = 'enter_zone'
      ORDER BY created_at, id
    `).bind(map.sceneId).all(),
    loadRuntimeTargets(env, map.id),
    loadFlags(env, map.sceneRunId),
    appliedCounts(env, map.sceneRunId),
    loadRuntimeEncounterMap(env, map.sceneRunId, map.sceneId)
  ]);
  if (!actor || !sceneRun || sceneRun.status !== 'active') return [];

  targets.objectBySource = await loadRuntimeObjectTargets(env, map.id);

  const shared = {
    actor,
    sceneRunId: map.sceneRunId,
    sceneRunStatus: sceneRun.status,
    sceneId: map.sceneId,
    mapInstanceId: map.id,
    targets,
    flags,
    doors: doorStates(targets),
    objects: runtimeObjectStateMap(targets.objectBySource),
    encounters,
    enteredZones,
    movement
  };

  const results = [];
  for (const row of eventRows.results || []) {
    const event = eventPayload(row);
    let trigger;
    try {
      trigger = normalizeStoryTrigger('enter_zone', event.trigger);
    } catch (error) {
      console.error('Invalid enter_zone Story Event trigger definition', {
        eventId: event.id,
        message: String(error?.message || error)
      });
      continue;
    }
    if (!enteredSourceIds.has(trigger.sourceZoneId)) continue;
    const firedCount = counts.get(event.id) || 0;
    const result = await executeRuntimeStoryEvent(env, { shared, event, firedCount });
    if (result.status === 'applied') counts.set(event.id, firedCount + 1);
    results.push({ ...result, sourceZoneId: trigger.sourceZoneId });
  }
  return results;
}

async function refreshPlayerWorld(request, env, characterId) {
  const response = await baseWorker.fetch(new Request(new URL(`/api/player/world/characters/${encodeURIComponent(characterId)}`, request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function handlePlayerMove(request, env, characterId) {
  const response = await baseWorker.fetch(request, env);
  if (!response.ok) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;
  const payload = await response.json();
  if (!payload?.movement || !payload?.map?.id) return json(payload, response.status);

  let storyEventsTriggered = [];
  try {
    storyEventsTriggered = await processEnterZoneTriggers(request, env, payload);
  } catch (error) {
    console.error('Automatic enter-zone Story Event processing failed after committed Player movement', {
      characterId,
      mapInstanceId: payload?.map?.id || null,
      movementId: payload?.movement?.id || null,
      message: String(error?.message || error)
    });
    return json({
      ...payload,
      storyEventsTriggered: [],
      storyTriggerWarning: { code: 'STORY_ENTER_ZONE_TRIGGER_ERROR' }
    }, response.status);
  }

  if (!storyEventsTriggered.length) return json({ ...payload, storyEventsTriggered }, response.status);
  const refreshed = await refreshPlayerWorld(request, env, characterId).catch(() => null);
  return json({
    ...(refreshed || payload),
    movement: payload.movement,
    storyEventsTriggered
  }, response.status);
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const moveMatch = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)\/move$/);
    if (moveMatch && request.method === 'POST') {
      return handlePlayerMove(request, env, decodeURIComponent(moveMatch[1]));
    }
    return baseWorker.fetch(request, env);
  }
};