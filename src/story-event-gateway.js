import baseWorker from './runtime-visibility-gateway.js';
import { evaluateStoryConditions, normalizeStoryEventStructure } from './story-event-rules.js';
import {
  activateRuntimeEncounter,
  loadRuntimeEncounterMap,
  loadRuntimeEncounterRows
} from './runtime-encounter-state.js';
import {
  spawnRuntimeMonster,
  startRuntimeEncounterCombat
} from './runtime-encounter-service.js';

const GM_ROLES = new Set(['gm', 'admin']);
const EVENT_STATUSES = new Set(['active', 'archived']);
let storySchemaPromise = null;

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

async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('請使用 JSON 格式提交。'), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

function cleanText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
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

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function ensureStorySchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!storySchemaPromise) {
    storySchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS story_events (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        trigger_type TEXT NOT NULL,
        trigger_json TEXT NOT NULL DEFAULT '{}',
        conditions_json TEXT NOT NULL DEFAULT '[]',
        effects_json TEXT NOT NULL DEFAULT '[]',
        once_per_scene_run INTEGER NOT NULL DEFAULT 1 CHECK (once_per_scene_run IN (0, 1)),
        created_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
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
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_story_events_scene_status ON story_events(scene_id, status, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_flags_scene ON runtime_story_flags(scene_run_id, updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_narratives_scene ON runtime_story_narratives(scene_run_id, created_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_runtime_story_exec_scene_event ON runtime_story_event_executions(scene_run_id, story_event_id, status, created_at)')
    ]).catch(error => {
      storySchemaPromise = null;
      throw error;
    });
  }
  await storySchemaPromise;
}

function eventPayload(row) {
  return {
    id: row.id,
    sceneId: row.scene_id,
    name: row.name,
    status: row.status,
    triggerType: row.trigger_type,
    trigger: parseJson(row.trigger_json, {}),
    conditions: parseJson(row.conditions_json, []),
    effects: parseJson(row.effects_json, []),
    oncePerSceneRun: Boolean(row.once_per_scene_run),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeDefinition(body) {
  const name = cleanText(body?.name, 120);
  if (!name) throw Object.assign(new Error('Story Event name is required.'), { status: 400, code: 'VALIDATION_ERROR' });
  const status = String(body?.status || 'active').trim().toLowerCase();
  if (!EVENT_STATUSES.has(status)) {
    throw Object.assign(new Error('Story Event status is invalid.'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  let structure;
  try {
    structure = normalizeStoryEventStructure({
      triggerType: body?.triggerType || 'manual',
      trigger: body?.trigger || {},
      conditions: body?.conditions || [],
      effects: body?.effects || []
    });
    if (JSON.stringify(structure.trigger).length > 4000) throw new Error('Story Event trigger payload is too large.');
  } catch (error) {
    throw Object.assign(error, { status: 400, code: 'STORY_EVENT_STRUCTURE_INVALID' });
  }
  return { name, status, ...structure, oncePerSceneRun: body?.oncePerSceneRun !== false };
}

async function listStoryEvents(request, env) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureStorySchema(env);
  const sceneId = cleanText(new URL(request.url).searchParams.get('sceneId'), 160);
  if (!sceneId) return apiError('sceneId is required.', 400, 'VALIDATION_ERROR');
  const scene = await env.DB.prepare('SELECT id, scenario_id, name, status FROM scenes WHERE id = ? LIMIT 1').bind(sceneId).first();
  if (!scene) return apiError('Scene 不存在。', 404, 'SCENE_NOT_FOUND');
  const rows = await env.DB.prepare(`
    SELECT * FROM story_events
    WHERE scene_id = ?
    ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at, id
  `).bind(sceneId).all();
  return json({
    ok: true,
    scene: { id: scene.id, scenarioId: scene.scenario_id, name: scene.name, status: scene.status },
    events: (rows.results || []).map(eventPayload)
  });
}

async function createStoryEvent(request, env, sceneId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const gm = await requireGM(request, env);
  await ensureStorySchema(env);
  const scene = await env.DB.prepare('SELECT id FROM scenes WHERE id = ? LIMIT 1').bind(sceneId).first();
  if (!scene) return apiError('Scene 不存在。', 404, 'SCENE_NOT_FOUND');
  const definition = normalizeDefinition(await readBody(request));
  const id = `story_event_${crypto.randomUUID()}`;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO story_events (
      id, scene_id, name, status, trigger_type, trigger_json, conditions_json, effects_json,
      once_per_scene_run, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, sceneId, definition.name, definition.status, definition.triggerType,
    JSON.stringify(definition.trigger), JSON.stringify(definition.conditions), JSON.stringify(definition.effects),
    definition.oncePerSceneRun ? 1 : 0, gm.id, now, now
  ).run();
  return json({ ok: true, event: eventPayload(await env.DB.prepare('SELECT * FROM story_events WHERE id = ?').bind(id).first()) }, 201);
}

async function updateStoryEvent(request, env, eventId) {
  if (request.method !== 'PATCH') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  await ensureStorySchema(env);
  const existing = await env.DB.prepare('SELECT * FROM story_events WHERE id = ? LIMIT 1').bind(eventId).first();
  if (!existing) return apiError('Story Event 不存在。', 404, 'STORY_EVENT_NOT_FOUND');
  const body = await readBody(request);
  const definition = normalizeDefinition({
    name: body?.name ?? existing.name,
    status: body?.status ?? existing.status,
    triggerType: body?.triggerType ?? existing.trigger_type,
    trigger: body?.trigger ?? parseJson(existing.trigger_json, {}),
    conditions: body?.conditions ?? parseJson(existing.conditions_json, []),
    effects: body?.effects ?? parseJson(existing.effects_json, []),
    oncePerSceneRun: body?.oncePerSceneRun ?? Boolean(existing.once_per_scene_run)
  });
  await env.DB.prepare(`
    UPDATE story_events SET
      name = ?, status = ?, trigger_type = ?, trigger_json = ?, conditions_json = ?, effects_json = ?,
      once_per_scene_run = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    definition.name, definition.status, definition.triggerType,
    JSON.stringify(definition.trigger), JSON.stringify(definition.conditions), JSON.stringify(definition.effects),
    definition.oncePerSceneRun ? 1 : 0, Date.now(), eventId
  ).run();
  return json({ ok: true, event: eventPayload(await env.DB.prepare('SELECT * FROM story_events WHERE id = ?').bind(eventId).first()) });
}

async function runtimeDetail(request, env, mapInstanceId) {
  const response = await baseWorker.fetch(new Request(new URL(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`, request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || 'Runtime Map unavailable.'), {
      status: response.status,
      code: payload?.error?.code || 'RUNTIME_MAP_UNAVAILABLE'
    });
  }
  return payload;
}

async function runtimeStoryState(env, sceneRunId, sceneId, mapInstanceId) {
  const [events, flags, narratives, executions, runtimeEncounters] = await Promise.all([
    env.DB.prepare(`SELECT * FROM story_events WHERE scene_id = ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at, id`).bind(sceneId).all(),
    env.DB.prepare(`SELECT flag_key, value_json, updated_at FROM runtime_story_flags WHERE scene_run_id = ? ORDER BY flag_key`).bind(sceneRunId).all(),
    env.DB.prepare(`SELECT id, story_event_id, narrative_text, created_at FROM runtime_story_narratives WHERE scene_run_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`).bind(sceneRunId).all(),
    env.DB.prepare(`SELECT id, story_event_id, status, trigger_type, effects_applied_json, error_code, error_message, created_at FROM runtime_story_event_executions WHERE scene_run_id = ? AND map_instance_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`).bind(sceneRunId, mapInstanceId).all(),
    loadRuntimeEncounterRows(env, sceneRunId, sceneId)
  ]);
  return {
    storyEvents: (events.results || []).map(eventPayload),
    storyFlags: (flags.results || []).map(row => ({ key: row.flag_key, value: parseJson(row.value_json, null), updatedAt: row.updated_at })),
    storyNarratives: (narratives.results || []).map(row => ({ id: row.id, storyEventId: row.story_event_id, text: row.narrative_text, createdAt: row.created_at })),
    runtimeEncounters,
    storyExecutions: (executions.results || []).map(row => ({
      id: row.id,
      storyEventId: row.story_event_id,
      status: row.status,
      triggerType: row.trigger_type,
      effectsApplied: parseJson(row.effects_applied_json, []),
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdAt: row.created_at
    }))
  };
}

async function enrichStartedRuntime(env, response) {
  if (!response.ok) return response;
  const payload = await response.json();
  const sceneRunId = payload?.mapInstance?.sceneRunId;
  const sceneId = payload?.mapInstance?.sceneId;
  if (!sceneRunId || !sceneId) return json(payload, response.status);
  try {
    await ensureStorySchema(env);
    const runtimeEncounters = await loadRuntimeEncounterRows(env, sceneRunId, sceneId);
    return json({ ...payload, runtimeEncounters }, response.status);
  } catch (error) {
    console.error('Runtime Encounter snapshot materialisation failed after committed Scene Runtime creation', {
      sceneRunId,
      sceneId,
      message: String(error?.message || error)
    });
    return json({
      ...payload,
      runtimeEncounterWarning: { code: 'RUNTIME_ENCOUNTER_SNAPSHOT_DELAYED' }
    }, response.status);
  }
}

async function enrichGmRuntimeDetail(env, response) {
  if (!response.ok) return response;
  const payload = await response.json();
  if (!payload?.mapInstance?.sceneRunId || !payload?.mapInstance?.sceneId) return json(payload, response.status);
  await ensureStorySchema(env);
  const state = await runtimeStoryState(env, payload.mapInstance.sceneRunId, payload.mapInstance.sceneId, payload.mapInstance.id);
  return json({ ...payload, ...state }, response.status);
}

async function enrichPlayerWorld(env, response) {
  if (!response.ok) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return response;
  const payload = await response.json();
  const sceneRunId = payload?.map?.sceneRunId;
  if (!sceneRunId) return json(payload, response.status);
  await ensureStorySchema(env);
  const narratives = await env.DB.prepare(`
    SELECT id, story_event_id, narrative_text, created_at
    FROM runtime_story_narratives
    WHERE scene_run_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 20
  `).bind(sceneRunId).all();
  return json({
    ...payload,
    storyNarratives: (narratives.results || []).map(row => ({
      id: row.id,
      storyEventId: row.story_event_id,
      text: row.narrative_text,
      createdAt: row.created_at
    }))
  }, response.status);
}

async function appliedCount(env, sceneRunId, eventId) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM runtime_story_event_executions
    WHERE scene_run_id = ? AND story_event_id = ? AND status = 'applied'
  `).bind(sceneRunId, eventId).first();
  return Number(row?.count || 0);
}

async function loadFlags(env, sceneRunId) {
  const rows = await env.DB.prepare('SELECT flag_key, value_json FROM runtime_story_flags WHERE scene_run_id = ?').bind(sceneRunId).all();
  return new Map((rows.results || []).map(row => [row.flag_key, parseJson(row.value_json, null)]));
}

function runtimeTargets(detail) {
  const zoneBySource = new Map();
  const doorBySource = new Map();
  const spawnBySource = new Map();
  for (const zone of detail?.zones || []) if (zone.sourceZoneId) zoneBySource.set(zone.sourceZoneId, zone);
  for (const edge of detail?.edges || []) {
    if (edge.edgeType === 'door' && edge.sourceEdgeId) doorBySource.set(edge.sourceEdgeId, edge);
  }
  for (const spawn of detail?.spawnPoints || []) {
    if (spawn.sourceSpawnPointId) spawnBySource.set(spawn.sourceSpawnPointId, spawn);
  }
  return { zoneBySource, doorBySource, spawnBySource };
}

function doorStates(detail) {
  return new Map((detail?.edges || [])
    .filter(edge => edge.edgeType === 'door' && edge.sourceEdgeId)
    .map(edge => [edge.sourceEdgeId, edge.doorState || 'closed']));
}

function validateTargets(event, detail, encounters) {
  const targets = runtimeTargets(detail);
  for (const condition of event.conditions || []) {
    if (condition.type === 'encounter_status' && !encounters.has(condition.encounterId)) {
      throw Object.assign(new Error(`Runtime Encounter target not found: ${condition.encounterId}`), {
        status: 409, code: 'STORY_CONDITION_ENCOUNTER_NOT_FOUND'
      });
    }
    if (condition.type === 'door_state' && !targets.doorBySource.has(condition.sourceEdgeId)) {
      throw Object.assign(new Error(`Runtime Door source target not found: ${condition.sourceEdgeId}`), {
        status: 409, code: 'STORY_CONDITION_DOOR_NOT_FOUND'
      });
    }
  }
  for (const effect of event.effects || []) {
    if ((effect.type === 'activate_encounter' || effect.type === 'spawn_monster' || effect.type === 'start_combat') && !encounters.has(effect.encounterId)) {
      throw Object.assign(new Error(`Runtime Encounter target not found: ${effect.encounterId}`), {
        status: 409, code: 'STORY_EFFECT_ENCOUNTER_NOT_FOUND'
      });
    }
    if (effect.type === 'spawn_monster' && !targets.spawnBySource.has(effect.sourceSpawnPointId)) {
      throw Object.assign(new Error(`Runtime Spawn Point source target not found: ${effect.sourceSpawnPointId}`), {
        status: 409, code: 'STORY_EFFECT_SPAWN_POINT_NOT_FOUND'
      });
    }
    if (effect.type === 'reveal_zone' && !targets.zoneBySource.has(effect.sourceZoneId)) {
      throw Object.assign(new Error(`Runtime Zone source target not found: ${effect.sourceZoneId}`), {
        status: 409, code: 'STORY_EFFECT_ZONE_NOT_FOUND'
      });
    }
    if ((effect.type === 'open_door' || effect.type === 'close_door') && !targets.doorBySource.has(effect.sourceEdgeId)) {
      throw Object.assign(new Error(`Runtime Door source target not found: ${effect.sourceEdgeId}`), {
        status: 409, code: 'STORY_EFFECT_DOOR_NOT_FOUND'
      });
    }
  }
  return targets;
}

async function applyDoorEffect(request, env, mapInstanceId, edge, state) {
  const response = await baseWorker.fetch(new Request(new URL(
    `/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/edges/${encodeURIComponent(edge.id)}/door-state`,
    request.url
  ), {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    },
    body: JSON.stringify({ state })
  }), env);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || 'Runtime Door effect failed.'), {
      status: response.status,
      code: payload?.error?.code || 'STORY_EFFECT_DOOR_FAILED'
    });
  }
  return {
    sourceEdgeId: edge.sourceEdgeId,
    runtimeEdgeId: edge.id,
    state: payload?.door?.state || state,
    unchanged: Boolean(payload?.unchanged)
  };
}

async function applyEffect(request, env, context, effect, effectIndex) {
  const now = Date.now();
  if (effect.type === 'show_narrative') {
    const id = `story_narrative_${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO runtime_story_narratives (id, scene_run_id, story_event_id, narrative_text, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, context.sceneRunId, context.event.id, effect.text, now).run();
    return { type: effect.type, narrativeId: id };
  }
  if (effect.type === 'set_flag') {
    await env.DB.prepare(`
      INSERT INTO runtime_story_flags (scene_run_id, flag_key, value_json, updated_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(scene_run_id, flag_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = excluded.updated_at
    `).bind(context.sceneRunId, effect.key, JSON.stringify(effect.value), context.gm.id, now, now).run();
    context.flags.set(effect.key, effect.value);
    return { type: effect.type, key: effect.key, value: effect.value };
  }
  if (effect.type === 'reveal_zone') {
    const zone = context.targets.zoneBySource.get(effect.sourceZoneId);
    const result = await env.DB.prepare(`
      UPDATE runtime_map_zones
      SET player_visible = 1, updated_at = ?
      WHERE id = ? AND map_instance_id = ?
    `).bind(now, zone.id, context.mapInstanceId).run();
    if (Number(result?.meta?.changes || 0) !== 1) {
      throw Object.assign(new Error('Runtime Zone reveal target changed before Story Event effect execution.'), {
        status: 409, code: 'STORY_EFFECT_ZONE_CHANGED'
      });
    }
    return { type: effect.type, sourceZoneId: effect.sourceZoneId, runtimeZoneId: zone.id };
  }
  if (effect.type === 'open_door' || effect.type === 'close_door') {
    const edge = context.targets.doorBySource.get(effect.sourceEdgeId);
    const state = effect.type === 'open_door' ? 'open' : 'closed';
    return { type: effect.type, ...(await applyDoorEffect(request, env, context.mapInstanceId, edge, state)) };
  }
  if (effect.type === 'activate_encounter') {
    const activated = await activateRuntimeEncounter(env, {
      sceneRunId: context.sceneRunId,
      sceneId: context.event.sceneId,
      encounterId: effect.encounterId,
      actorUserId: context.gm.id,
      storyEventId: context.event.id
    });
    context.encounters.set(effect.encounterId, activated);
    return {
      type: effect.type,
      encounterId: effect.encounterId,
      runtimeEncounterId: activated.id,
      status: activated.status,
      unchanged: Boolean(activated.unchanged)
    };
  }
  if (effect.type === 'spawn_monster') {
    const spawned = await spawnRuntimeMonster(env, {
      mapInstanceId: context.mapInstanceId,
      sceneRunId: context.sceneRunId,
      sceneId: context.event.sceneId,
      encounterId: effect.encounterId,
      templateId: effect.templateId,
      level: effect.level,
      sourceSpawnPointId: effect.sourceSpawnPointId,
      displayName: effect.displayName || '',
      actorUserId: context.gm.id,
      storyEventId: context.event.oncePerSceneRun ? context.event.id : null,
      storyEffectIndex: context.event.oncePerSceneRun ? effectIndex : null
    });
    if (spawned.runtimeEncounter) context.encounters.set(effect.encounterId, spawned.runtimeEncounter);
    return {
      type: effect.type,
      encounterId: effect.encounterId,
      monsterId: spawned.monster.id,
      templateId: spawned.monster.templateId,
      displayName: spawned.monster.displayName,
      sourceSpawnPointId: spawned.spawnPoint.sourceSpawnPointId,
      x: spawned.position.x,
      y: spawned.position.y,
      unchanged: Boolean(spawned.unchanged)
    };
  }
  if (effect.type === 'start_combat') {
    const started = await startRuntimeEncounterCombat(env, {
      mapInstanceId: context.mapInstanceId,
      sceneRunId: context.sceneRunId,
      sceneId: context.event.sceneId,
      encounterId: effect.encounterId,
      actorUserId: context.gm.id
    });
    if (started.runtimeEncounter) context.encounters.set(effect.encounterId, started.runtimeEncounter);
    return {
      type: effect.type,
      encounterId: effect.encounterId,
      combatId: started.combat?.id || started.runtimeEncounter?.combat?.combatId || null,
      mapInstanceId: started.mapInstanceId,
      unchanged: Boolean(started.unchanged)
    };
  }
  throw Object.assign(new Error(`Unsupported approved Story Effect: ${effect.type}`), {
    status: 500, code: 'STORY_EFFECT_UNSUPPORTED'
  });
}

async function recordExecution(env, {
  event, sceneRunId, mapInstanceId, gm, status, effectsApplied,
  errorCode = null, errorMessage = null
}) {
  const id = `story_exec_${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO runtime_story_event_executions (
      id, story_event_id, scene_run_id, map_instance_id, status, trigger_type,
      effects_applied_json, error_code, error_message, activated_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, event.id, sceneRunId, mapInstanceId, status, event.triggerType,
    JSON.stringify(effectsApplied), errorCode, errorMessage, gm.id, Date.now()
  ).run();
  return id;
}

async function activateStoryEvent(request, env, mapInstanceId, eventId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  const gm = await requireGM(request, env);
  const detail = await runtimeDetail(request, env, mapInstanceId);
  if (detail?.mapInstance?.status !== 'active') {
    return apiError('只有 Active Runtime Map 可以執行 Story Event。', 409, 'RUNTIME_MAP_CLOSED');
  }
  await ensureStorySchema(env);

  const row = await env.DB.prepare('SELECT * FROM story_events WHERE id = ? LIMIT 1').bind(eventId).first();
  if (!row) return apiError('Story Event 不存在。', 404, 'STORY_EVENT_NOT_FOUND');
  const event = eventPayload(row);
  if (event.sceneId !== detail.mapInstance.sceneId) {
    return apiError('Story Event 唔屬於目前 Scene。', 409, 'STORY_EVENT_SCENE_MISMATCH');
  }
  if (event.status !== 'active') return apiError('Archived Story Event 不可執行。', 409, 'STORY_EVENT_ARCHIVED');
  if (event.triggerType !== 'manual') {
    return apiError('呢個 Story Event 唔係 manual trigger。', 409, 'STORY_EVENT_TRIGGER_NOT_MANUAL');
  }

  const sceneRun = await env.DB.prepare('SELECT id, status FROM scene_runs WHERE id = ? LIMIT 1')
    .bind(detail.mapInstance.sceneRunId).first();
  if (!sceneRun) return apiError('Scene Run 不存在。', 409, 'SCENE_RUN_NOT_FOUND');
  const firedCount = await appliedCount(env, sceneRun.id, event.id);
  if (event.oncePerSceneRun && firedCount > 0) {
    return apiError('Story Event 已經喺呢個 Scene Run 成功執行過。', 409, 'STORY_EVENT_ALREADY_FIRED');
  }

  const encounters = await loadRuntimeEncounterMap(env, sceneRun.id, event.sceneId);
  let targets;
  try {
    targets = validateTargets(event, detail, encounters);
  } catch (error) {
    return apiError(error.message, error.status || 409, error.code || 'STORY_EVENT_TARGET_INVALID');
  }

  const flags = await loadFlags(env, sceneRun.id);
  const conditions = evaluateStoryConditions(event.conditions, {
    flags,
    eventAlreadyFired: firedCount > 0,
    storyEventId: event.id,
    sceneRunStatus: sceneRun.status,
    doors: doorStates(detail),
    encounters
  });
  if (!conditions.ok) {
    return apiError('Story Event conditions 未滿足。', 409, 'STORY_EVENT_CONDITIONS_NOT_MET', {
      failures: conditions.failures
    });
  }

  const effectsApplied = [];
  try {
    const context = {
      event,
      sceneRunId: sceneRun.id,
      mapInstanceId,
      gm,
      targets,
      flags,
      encounters
    };
    for (const [effectIndex, effect] of event.effects.entries()) {
      effectsApplied.push(await applyEffect(request, env, context, effect, effectIndex));
    }
    const executionId = await recordExecution(env, {
      event, sceneRunId: sceneRun.id, mapInstanceId, gm, status: 'applied', effectsApplied
    });
    return json({
      ok: true,
      executionId,
      event,
      effectsApplied,
      ...(await runtimeStoryState(env, sceneRun.id, event.sceneId, mapInstanceId))
    });
  } catch (error) {
    let executionId = null;
    try {
      executionId = await recordExecution(env, {
        event,
        sceneRunId: sceneRun.id,
        mapInstanceId,
        gm,
        status: 'failed',
        effectsApplied,
        errorCode: error?.code || 'STORY_EFFECT_EXECUTION_FAILED',
        errorMessage: String(error?.message || error).slice(0, 1000)
      });
    } catch (auditError) {
      console.error('Story Event failed-execution audit write failed', {
        message: String(auditError?.message || auditError)
      });
    }
    return apiError(
      error?.message || 'Story Event effect execution failed.',
      error?.status || 500,
      error?.code || 'STORY_EFFECT_EXECUTION_FAILED',
      {
        executionId,
        effectsApplied,
        ...(error?.missingPositions ? { missingPositions: error.missingPositions } : {}),
        ...(error?.activeCombatId ? { activeCombatId: error.activeCombatId } : {})
      }
    );
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/story-events') return await listStoryEvents(request, env);

      let match = pathname.match(/^\/api\/gm\/scenes\/([^/]+)\/story-events$/);
      if (match) return await createStoryEvent(request, env, decodeURIComponent(match[1]));

      match = pathname.match(/^\/api\/gm\/story-events\/([^/]+)$/);
      if (match) return await updateStoryEvent(request, env, decodeURIComponent(match[1]));

      match = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/story-events\/([^/]+)\/activate$/);
      if (match) return await activateStoryEvent(request, env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));

      if (pathname === '/api/gm/world/runtime/scene-runs' && request.method === 'POST') {
        return enrichStartedRuntime(env, await baseWorker.fetch(request, env));
      }

      match = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)$/);
      if (match && request.method === 'GET') {
        return enrichGmRuntimeDetail(env, await baseWorker.fetch(request, env));
      }

      match = pathname.match(/^\/api\/player\/world\/characters\/([^/]+)(?:\/.*)?$/);
      if (match) return enrichPlayerWorld(env, await baseWorker.fetch(request, env));

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Story Event gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (error?.status) return apiError(error.message, error.status, error.code || 'STORY_EVENT_ERROR');
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Story Event runtime service 暫時無法使用。', 500, 'STORY_EVENT_SERVICE_ERROR');
    }
  }
};
