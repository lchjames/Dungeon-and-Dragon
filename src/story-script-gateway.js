import baseWorker from './runtime-object-gateway.js';
import { compileStoryScript } from './story-script-compiler.js';

const GM_ROLES = new Set(['gm', 'admin']);
let scriptSchemaPromise = null;

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
  try { return await request.json(); } catch {
    throw Object.assign(new Error('JSON 格式錯誤。'), { status: 400, code: 'INVALID_JSON' });
  }
}

function cleanText(value, max = 24000) {
  return String(value ?? '').trim().slice(0, max);
}

async function currentUser(request, env) {
  const response = await baseWorker.fetch(new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
  }), env);
  if (!response.ok) return null;
  return (await response.json().catch(() => null))?.user || null;
}

async function requireGM(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('未登入。'), { status: 401, code: 'UNAUTHENTICATED' });
  if (!GM_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('此 User 沒有 GM 權限。'), { status: 403, code: 'GM_ROLE_REQUIRED' });
  }
  return user;
}

async function ensureScriptSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!scriptSchemaPromise) {
    scriptSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS story_script_sources (
        story_event_id TEXT PRIMARY KEY,
        source_text TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (story_event_id) REFERENCES story_events(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_story_script_sources_updated ON story_script_sources(updated_at, story_event_id)')
    ]).catch(error => {
      scriptSchemaPromise = null;
      throw error;
    });
  }
  await scriptSchemaPromise;
}

function internalHeaders(request, body = false) {
  return {
    Accept: 'application/json',
    Cookie: request.headers.get('Cookie') || '',
    Origin: new URL(request.url).origin,
    ...(body ? { 'Content-Type': 'application/json' } : {})
  };
}

async function downstreamJson(request, env, path, options = {}) {
  const response = await baseWorker.fetch(new Request(new URL(path, request.url), {
    method: options.method || 'GET',
    headers: internalHeaders(request, Boolean(options.body)),
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  }), env);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || 'Downstream Story service failed.'), {
      status: response.status,
      code: payload?.error?.code || 'STORY_SCRIPT_DOWNSTREAM_ERROR',
      payload
    });
  }
  return payload;
}

function compileBody(body) {
  const source = cleanText(body?.script, 24000);
  if (!source) throw Object.assign(new Error('Story script is required.'), { status: 400, code: 'STORY_SCRIPT_EMPTY' });
  try {
    return { source, compiled: compileStoryScript(source) };
  } catch (error) {
    throw Object.assign(error, { status: 400, code: error?.code || 'STORY_SCRIPT_INVALID' });
  }
}

async function compileEndpoint(request, env) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  const { source, compiled } = compileBody(await readBody(request));
  return json({ ok: true, source, compiled });
}

async function sceneEvents(request, env, sceneId) {
  return downstreamJson(request, env, `/api/gm/story-events?sceneId=${encodeURIComponent(sceneId)}`);
}

async function publishCompiled(request, env, sceneId, source, compiled, eventId = '') {
  let payload;
  if (eventId) {
    const listed = await sceneEvents(request, env, sceneId);
    if (!(listed.events || []).some(event => event.id === eventId)) {
      throw Object.assign(new Error('Story Event 唔屬於指定 Scene。'), { status: 409, code: 'STORY_SCRIPT_EVENT_SCENE_MISMATCH' });
    }
    payload = await downstreamJson(request, env, `/api/gm/story-events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH', body: compiled
    });
  } else {
    payload = await downstreamJson(request, env, `/api/gm/scenes/${encodeURIComponent(sceneId)}/story-events`, {
      method: 'POST', body: compiled
    });
  }
  const event = payload?.event;
  if (!event?.id) throw Object.assign(new Error('Published Story Event ID is missing.'), { status: 500, code: 'STORY_SCRIPT_PUBLISH_INVALID' });
  const gm = await requireGM(request, env);
  await ensureScriptSchema(env);
  await env.DB.prepare(`
    INSERT INTO story_script_sources (story_event_id, source_text, updated_by_user_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(story_event_id) DO UPDATE SET
      source_text = excluded.source_text,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = excluded.updated_at
  `).bind(event.id, source, gm.id, Date.now()).run();
  return event;
}

async function publishEndpoint(request, env, sceneId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  const body = await readBody(request);
  const { source, compiled } = compileBody(body);
  const eventId = cleanText(body?.eventId, 220);
  const event = await publishCompiled(request, env, sceneId, source, compiled, eventId);
  return json({ ok: true, source, compiled, event }, eventId ? 200 : 201);
}

async function listEndpoint(request, env, sceneId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureScriptSchema(env);
  const listed = await sceneEvents(request, env, sceneId);
  const rows = await env.DB.prepare(`
    SELECT s.story_event_id, s.source_text, s.updated_at
    FROM story_script_sources s
    JOIN story_events e ON e.id = s.story_event_id
    WHERE e.scene_id = ?
    ORDER BY s.updated_at DESC, s.story_event_id
  `).bind(sceneId).all();
  const eventById = new Map((listed.events || []).map(event => [event.id, event]));
  return json({
    ok: true,
    scene: listed.scene,
    scripts: (rows.results || []).map(row => ({
      event: eventById.get(row.story_event_id) || { id: row.story_event_id },
      source: row.source_text,
      updatedAt: row.updated_at
    }))
  });
}

async function runtimeScene(request, env, mapInstanceId) {
  const payload = await downstreamJson(request, env, `/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  const sceneId = payload?.mapInstance?.sceneId;
  if (!sceneId) throw Object.assign(new Error('Runtime Map Scene is unavailable.'), { status: 409, code: 'STORY_SCRIPT_RUNTIME_SCENE_MISSING' });
  return { sceneId, detail: payload };
}

async function applyEndpoint(request, env, mapInstanceId) {
  if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
  await requireGM(request, env);
  const body = await readBody(request);
  const { source, compiled } = compileBody(body);
  if (compiled.triggerType !== 'manual') {
    return apiError('Apply Now 只支援 manual TRIGGER；其他 trigger 請 Publish 後由 Runtime lifecycle 觸發。', 409, 'STORY_SCRIPT_APPLY_MANUAL_ONLY');
  }
  const { sceneId } = await runtimeScene(request, env, mapInstanceId);
  const eventId = cleanText(body?.eventId, 220);
  const event = await publishCompiled(request, env, sceneId, source, compiled, eventId);
  const execution = await downstreamJson(
    request,
    env,
    `/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/story-events/${encodeURIComponent(event.id)}/activate`,
    { method: 'POST', body: {} }
  );
  return json({ ok: true, source, compiled, event, execution });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/api/gm/story-scripts/compile') return await compileEndpoint(request, env);

      let match = pathname.match(/^\/api\/gm\/scenes\/([^/]+)\/story-scripts$/);
      if (match) {
        const sceneId = decodeURIComponent(match[1]);
        if (request.method === 'GET') return await listEndpoint(request, env, sceneId);
        return await publishEndpoint(request, env, sceneId);
      }

      match = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/story-scripts\/apply$/);
      if (match) return await applyEndpoint(request, env, decodeURIComponent(match[1]));

      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Story Script gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error),
        code: error?.code || null
      });
      if (error?.status) {
        return apiError(error.message, error.status, error.code || 'STORY_SCRIPT_ERROR', {
          ...(error.line ? { line: error.line } : {}),
          ...(error.payload?.error?.failures ? { failures: error.payload.error.failures } : {})
        });
      }
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return apiError('資料庫尚未完成配置。', 503, 'DATABASE_UNAVAILABLE');
      }
      return apiError('Story Script service 暫時無法使用。', 500, 'STORY_SCRIPT_SERVICE_ERROR');
    }
  }
};
