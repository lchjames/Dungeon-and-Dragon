import { normalizeStoryTrigger } from './story-event-rules.js';
import { loadRuntimeEncounterMap } from './runtime-encounter-state.js';
import {
  loadRuntimeObjectTargets,
  runtimeObjectStateMap
} from './runtime-object-state.js';
import { executeRuntimeStoryEvent } from './story-execution-authority.js';

let schemaPromise = null;

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

async function ensureSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_story_flags (
        scene_run_id TEXT NOT NULL,
        flag_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scene_run_id, flag_key),
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_story_narratives (
        id TEXT PRIMARY KEY,
        scene_run_id TEXT NOT NULL,
        story_event_id TEXT NOT NULL,
        narrative_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE CASCADE
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_story_event_executions (
        id TEXT PRIMARY KEY,
        story_event_id TEXT NOT NULL,
        scene_run_id TEXT NOT NULL,
        map_instance_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('applied', 'failed')),
        trigger_type TEXT NOT NULL,
        effects_applied_json TEXT NOT NULL DEFAULT '[]',
        error_code TEXT,
        error_message TEXT,
        activated_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE CASCADE,
        FOREIGN KEY (scene_run_id) REFERENCES scene_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_door_state_log (
        id TEXT PRIMARY KEY,
        map_instance_id TEXT NOT NULL,
        runtime_edge_id TEXT NOT NULL,
        from_state TEXT NOT NULL CHECK (from_state IN ('open', 'closed', 'locked', 'broken')),
        to_state TEXT NOT NULL CHECK (to_state IN ('open', 'closed', 'locked', 'broken')),
        changed_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (map_instance_id) REFERENCES runtime_map_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (runtime_edge_id) REFERENCES runtime_map_edges(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_exec_scene_event ON runtime_story_event_executions(scene_run_id, story_event_id, status, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_door_state_log_edge ON runtime_door_state_log(runtime_edge_id, created_at)')
    ]).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
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

async function loadTargets(env, mapInstanceId) {
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
  return {
    zoneBySource: new Map((zones.results || []).map(row => [row.source_zone_id, {
      id: row.id, sourceZoneId: row.source_zone_id, name: row.name, playerVisible: Boolean(row.player_visible)
    }])),
    doorBySource: new Map((doors.results || []).map(row => [row.source_edge_id, {
      id: row.id, sourceEdgeId: row.source_edge_id, x: Number(row.x), y: Number(row.y), direction: row.direction,
      doorState: row.door_state || 'closed', blocksMovement: Boolean(row.blocks_movement)
    }])),
    spawnBySource: new Map((spawns.results || []).map(row => [row.source_spawn_point_id, {
      id: row.id, sourceSpawnPointId: row.source_spawn_point_id, name: row.name,
      x: Number(row.x), y: Number(row.y), spawnType: row.spawn_type, enabled: Boolean(row.enabled)
    }]))
  };
}

function doorStates(targets) {
  return new Map([...targets.doorBySource].map(([id, edge]) => [id, edge.doorState || 'closed']));
}

async function loadFlags(env, sceneRunId) {
  const rows = await env.DB.prepare('SELECT flag_key, value_json FROM runtime_story_flags WHERE scene_run_id = ?').bind(sceneRunId).all();
  return new Map((rows.results || []).map(row => [row.flag_key, parseJson(row.value_json, null)]));
}

async function appliedCounts(env, sceneRunId) {
  const rows = await env.DB.prepare(`
    SELECT story_event_id, COUNT(*) AS count
    FROM runtime_story_event_executions
    WHERE scene_run_id = ? AND status = 'applied'
    GROUP BY story_event_id
  `).bind(sceneRunId).all();
  return new Map((rows.results || []).map(row => [row.story_event_id, Number(row.count || 0)]));
}

export async function processSceneRunStartStoryEvents(env, {
  actor,
  sceneRunId,
  sceneId,
  mapInstanceId
}) {
  if (!actor?.id || !sceneRunId || !sceneId || !mapInstanceId) return [];
  await ensureSchema(env);
  const [sceneRun, eventRows, targets, flags, counts, encounters] = await Promise.all([
    env.DB.prepare('SELECT id, status FROM scene_runs WHERE id = ? LIMIT 1').bind(sceneRunId).first(),
    env.DB.prepare(`
      SELECT * FROM story_events
      WHERE scene_id = ? AND status = 'active' AND trigger_type = 'scene_run_start'
      ORDER BY created_at, id
    `).bind(sceneId).all(),
    loadTargets(env, mapInstanceId),
    loadFlags(env, sceneRunId),
    appliedCounts(env, sceneRunId),
    loadRuntimeEncounterMap(env, sceneRunId, sceneId)
  ]);
  if (!sceneRun || sceneRun.status !== 'active') return [];

  targets.objectBySource = await loadRuntimeObjectTargets(env, mapInstanceId);

  const shared = {
    actor,
    sceneRunId,
    sceneRunStatus: sceneRun.status,
    sceneId,
    mapInstanceId,
    targets,
    flags,
    doors: doorStates(targets),
    objects: runtimeObjectStateMap(targets.objectBySource),
    encounters
  };
  const results = [];
  for (const row of eventRows.results || []) {
    const event = eventPayload(row);
    const firedCount = counts.get(event.id) || 0;
    const result = await executeRuntimeStoryEvent(env, { shared, event, firedCount });
    if (result.status === 'applied') counts.set(event.id, firedCount + 1);
    results.push(result);
  }
  return results;
}