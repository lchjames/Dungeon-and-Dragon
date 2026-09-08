from pathlib import Path

# Runtime Object outer gateway: Definition authoring + Runtime authored-route selection.
path = Path('src/runtime-object-gateway.js')
text = path.read_text(encoding='utf-8')
anchor = "import { transitionRuntimeScene } from './runtime-scene-transition.js';\n"
addition = anchor + """import {
  createSceneTransitionDefinition,
  deleteDraftSceneTransitionDefinition,
  ensureSceneTransitionDefinitionSchema,
  listSceneTransitionDefinitions,
  loadRuntimeSceneTransitionOptions,
  recordRuntimeSceneTransitionDefinitionLink,
  resolveRuntimeSceneTransitionDefinition,
  updateSceneTransitionDefinition
} from './scene-transition-definition.js';
"""
assert text.count(anchor) == 1
text = text.replace(anchor, addition, 1)

anchor = """async function enrichRuntimeMapDetail(request, env, mapId) {
"""
helpers = r'''async function transitionDefinitionCollection(request, env, sceneId = null) {
  const actor = await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  await ensureSceneTransitionDefinitionSchema(env);
  if (request.method === 'GET') {
    return json({ ok: true, definitions: await listSceneTransitionDefinitions(env, { sceneId }) });
  }
  if (request.method === 'POST' && sceneId) {
    if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
    const body = await readBody(request);
    const definition = await createSceneTransitionDefinition(env, { sceneId, actorUserId: actor.id, body });
    return json({ ok: true, definition }, 201);
  }
  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function transitionDefinitionItem(request, env, definitionId) {
  const actor = await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  await ensureSceneTransitionDefinitionSchema(env);
  if (request.method === 'PATCH') {
    if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
    const body = await readBody(request);
    return json({
      ok: true,
      definition: await updateSceneTransitionDefinition(env, { definitionId, actorUserId: actor.id, body })
    });
  }
  if (request.method === 'DELETE') {
    if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
    const body = await readBody(request);
    return json({
      ok: true,
      deleted: await deleteDraftSceneTransitionDefinition(env, { definitionId, expectedVersion: body?.expectedVersion })
    });
  }
  return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}

async function runtimeTransitionOptions(request, env, mapInstanceId) {
  if (request.method !== 'GET') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  await requireGM(request, env);
  await ensureRuntimeObjectAuthority(env);
  return json({ ok: true, ...(await loadRuntimeSceneTransitionOptions(env, { mapInstanceId })) });
}

function authoredTransitionOverrideFields(body) {
  return ['mode', 'nextSceneId', 'carryFlagKeys', 'carryCharacters', 'targetSourceSpawnPointId']
    .filter(key => Object.prototype.hasOwnProperty.call(body || {}, key));
}

function parseTransitionSnapshot(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

async function priorAuthoredTransition(env, mapInstanceId, definitionId, actor) {
  await ensureSceneTransitionDefinitionSchema(env);
  const row = await env.DB.prepare(`
    SELECT stl.transition_mode, stl.to_scene_id,
           link.definition_id, link.definition_version, link.definition_snapshot_json,
           link.linked_by_user_id, link.linked_at
    FROM runtime_map_instances rmi
    JOIN runtime_scene_transition_log stl ON stl.from_scene_run_id = rmi.scene_run_id
    LEFT JOIN runtime_scene_transition_definition_links link ON link.transition_id = stl.id
    WHERE rmi.id = ? LIMIT 1
  `).bind(mapInstanceId).first();
  if (!row) return null;
  if (row.definition_id && row.definition_id !== definitionId) {
    throw Object.assign(new Error('呢個 Scene Run 已經由另一個 authored Transition Definition 完成。'), {
      status: 409,
      code: 'SCENE_TRANSITION_DEFINITION_IDEMPOTENCY_MISMATCH'
    });
  }
  const body = row.transition_mode === 'complete_scenario'
    ? { mode: 'complete_scenario', carryFlagKeys: [] }
    : { mode: 'next_scene', nextSceneId: row.to_scene_id, carryFlagKeys: [], carryCharacters: false };
  const result = await transitionRuntimeScene(env, { mapInstanceId, actor, body });
  const snapshot = row.definition_id ? parseTransitionSnapshot(row.definition_snapshot_json) : null;
  return {
    ...result,
    transitionDefinition: snapshot,
    transitionDefinitionLink: row.definition_id ? {
      transitionId: result?.transition?.id || null,
      definitionId: row.definition_id,
      definitionVersion: Number(row.definition_version),
      definitionSnapshot: snapshot,
      linkedByUserId: row.linked_by_user_id,
      linkedAt: row.linked_at
    } : null,
    ...(!row.definition_id ? { transitionDefinitionAuditWarning: { code: 'SCENE_TRANSITION_DEFINITION_LINK_MISSING' } } : {})
  };
}

''' + anchor
assert text.count(anchor) == 1
text = text.replace(anchor, helpers, 1)

anchor = """      const definitionCollection = pathname.match(/^\\/api\\/gm\\/world\\/maps\\/([^/]+)\\/objects$/);
"""
routes = r'''      if (pathname === '/api/gm/scene-transitions') {
        return await transitionDefinitionCollection(request, env, null);
      }

      const sceneTransitionDefinitions = pathname.match(/^\/api\/gm\/scenes\/([^/]+)\/transitions$/);
      if (sceneTransitionDefinitions) {
        return await transitionDefinitionCollection(request, env, decodeURIComponent(sceneTransitionDefinitions[1]));
      }

      const sceneTransitionDefinitionItem = pathname.match(/^\/api\/gm\/scene-transitions\/([^/]+)$/);
      if (sceneTransitionDefinitionItem) {
        return await transitionDefinitionItem(request, env, decodeURIComponent(sceneTransitionDefinitionItem[1]));
      }

''' + anchor
assert text.count(anchor) == 1
text = text.replace(anchor, routes, 1)

anchor = """      const sceneTransition = pathname.match(/^\\/api\\/gm\\/world\\/runtime\\/maps\\/([^/]+)\\/transition$/);
      if (sceneTransition) {
        if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
        if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
        const actor = await requireGM(request, env);
        await ensureRuntimeObjectAuthority(env);
        const warmRequest = new Request(new URL('/api/gm/world/runtime', request.url), {
          method: 'GET',
          headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
        });
        const warmResponse = await baseWorker.fetch(warmRequest, env);
        if (!warmResponse.ok) return warmResponse;
        const body = await readBody(request);
        return json(await transitionRuntimeScene(env, {
          mapInstanceId: decodeURIComponent(sceneTransition[1]),
          actor,
          body
        }));
      }
"""
replacement = r'''      const sceneTransitionOptions = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/transition-options$/);
      if (sceneTransitionOptions) {
        return await runtimeTransitionOptions(request, env, decodeURIComponent(sceneTransitionOptions[1]));
      }

      const sceneTransition = pathname.match(/^\/api\/gm\/world\/runtime\/maps\/([^/]+)\/transition$/);
      if (sceneTransition) {
        if (request.method !== 'POST') return apiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
        if (!validOrigin(request)) return apiError('來源驗證失敗。', 403, 'ORIGIN_REJECTED');
        const actor = await requireGM(request, env);
        await ensureRuntimeObjectAuthority(env);
        await ensureSceneTransitionDefinitionSchema(env);
        const warmRequest = new Request(new URL('/api/gm/world/runtime', request.url), {
          method: 'GET',
          headers: { Accept: 'application/json', Cookie: request.headers.get('Cookie') || '' }
        });
        const warmResponse = await baseWorker.fetch(warmRequest, env);
        if (!warmResponse.ok) return warmResponse;
        const body = await readBody(request);
        const mapInstanceId = decodeURIComponent(sceneTransition[1]);
        if (body?.transitionDefinitionId) {
          const overrideFields = authoredTransitionOverrideFields(body);
          if (overrideFields.length) {
            return apiError('使用 transitionDefinitionId 時不可覆寫 authored Runtime policy。', 400, 'SCENE_TRANSITION_DEFINITION_OVERRIDE_FORBIDDEN');
          }
          const definitionId = cleanText(body.transitionDefinitionId, 180);
          const prior = await priorAuthoredTransition(env, mapInstanceId, definitionId, actor);
          if (prior) return json(prior);
          const resolved = await resolveRuntimeSceneTransitionDefinition(env, { mapInstanceId, definitionId });
          const result = await transitionRuntimeScene(env, { mapInstanceId, actor, body: resolved.transitionBody });
          let transitionDefinitionLink = null;
          let transitionDefinitionAuditWarning = null;
          try {
            transitionDefinitionLink = await recordRuntimeSceneTransitionDefinitionLink(env, {
              transitionId: result?.transition?.id,
              definition: resolved.definition,
              actorUserId: actor.id
            });
          } catch (error) {
            console.error('Scene Transition Definition provenance link failed after committed Runtime transition', {
              mapInstanceId,
              definitionId,
              transitionId: result?.transition?.id || null,
              message: String(error?.message || error)
            });
            transitionDefinitionAuditWarning = { code: 'SCENE_TRANSITION_DEFINITION_LINK_FAILED' };
          }
          return json({
            ...result,
            transitionDefinition: resolved.definition,
            transitionDefinitionLink,
            ...(transitionDefinitionAuditWarning ? { transitionDefinitionAuditWarning } : {})
          });
        }
        return json(await transitionRuntimeScene(env, { mapInstanceId, actor, body }));
      }
'''
assert text.count(anchor) == 1
text = text.replace(anchor, replacement, 1)
path.write_text(text, encoding='utf-8')

# GM Story UI: inject Transition Definition authoring into each Scene.
path = Path('public/assets/gm-story.js')
text = path.read_text(encoding='utf-8')
anchor = "let storyLoaded = false;\n"
assert text.count(anchor) == 1
text = text.replace(anchor, anchor + "let transitionDefinitions = [];\n", 1)

anchor = """function sceneHtml(scene) {
"""
functions = r'''function routeTargetOptions(scenario, sourceSceneId, selectedId = '') {
  const scenes = (scenario?.scenes || []).filter(item => item.id !== sourceSceneId);
  return '<option value="">Select target Scene</option>' + scenes.map(item =>
    `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.status)}</option>`
  ).join('');
}

function transitionConditionsText(definition) {
  return escapeHtml(JSON.stringify(definition?.conditions || [], null, 2));
}

function transitionDefinitionHtml(definition, scene, scenario) {
  const terminal = definition.mode === 'complete_scenario';
  return `<article class="stack-item" style="display:block" data-transition-definition="${escapeHtml(definition.id)}">
    <div class="panel-heading"><div><div class="row-inline"><strong>${escapeHtml(definition.name)}</strong><span class="status-pill">${escapeHtml(definition.status)}</span><span class="tag">${escapeHtml(definition.mode)}</span><span class="tag">v${definition.version}</span></div><p>${terminal ? 'Terminal Scenario completion' : `→ ${escapeHtml((scenario.scenes || []).find(item => item.id === definition.toSceneId)?.name || definition.toSceneId || 'No target')}`}</p></div></div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Name</span><input class="input" data-transition-name value="${escapeHtml(definition.name)}" maxlength="120"></label>
      <label class="field"><span>Status</span><select class="input" data-transition-status><option value="draft" ${selected(definition.status, 'draft')}>draft</option><option value="active" ${selected(definition.status, 'active')}>active</option><option value="archived" ${selected(definition.status, 'archived')}>archived</option></select></label>
      <label class="field"><span>Mode</span><select class="input" data-transition-mode><option value="next_scene" ${selected(definition.mode, 'next_scene')}>next_scene</option><option value="complete_scenario" ${selected(definition.mode, 'complete_scenario')}>complete_scenario</option></select></label>
      <label class="field"><span>Target Scene</span><select class="input" data-transition-target>${routeTargetOptions(scenario, scene.id, definition.toSceneId || '')}</select></label>
      <label class="field"><span>Carry Story flags</span><input class="input" data-transition-carry-flags value="${escapeHtml((definition.carryFlagKeys || []).join(', '))}" placeholder="quest.key_found, route.alpha"></label>
      <label class="field"><span>Character entry sourceSpawnPointId</span><input class="input" data-transition-spawn value="${escapeHtml(definition.targetSourceSpawnPointId || '')}" placeholder="spawn_..."></label>
      <label class="check-field"><input type="checkbox" data-transition-carry-characters ${definition.carryCharacters ? 'checked' : ''}> Carry positioned Characters</label>
      <label class="field"><span>Sort order</span><input class="input" data-transition-sort type="number" step="1" value="${definition.sortOrder || 0}"></label>
      <label class="field" style="grid-column:1/-1"><span>Conditions JSON</span><textarea class="textarea" data-transition-conditions rows="5">${transitionConditionsText(definition)}</textarea></label>
      <label class="field" style="grid-column:1/-1"><span>GM Notes</span><textarea class="textarea" data-transition-notes rows="2">${escapeHtml(definition.gmNotes || '')}</textarea></label>
    </div>
    <div class="form-actions wrap">
      <button class="button button-small" type="button" data-story-action="save-transition" data-transition-id="${escapeHtml(definition.id)}" data-transition-version="${definition.version}">Save Route</button>
      ${definition.status === 'draft' ? `<button class="button button-small button-danger-soft" type="button" data-story-action="delete-transition" data-transition-id="${escapeHtml(definition.id)}" data-transition-version="${definition.version}">Delete Draft</button>` : ''}
    </div>
  </article>`;
}

function transitionDefinitionsHtml(scene, scenario) {
  const definitions = scene.transitions || [];
  return `<details>
    <summary>Transition Definitions (${definitions.length})</summary>
    <p class="muted">Authored routes never auto-transition. Runtime GM explicitly selects one eligible active route.</p>
    <div class="stack-list">${definitions.length ? definitions.map(definition => transitionDefinitionHtml(definition, scene, scenario)).join('') : '<p class="muted">No authored routes yet.</p>'}</div>
    <article class="stack-item" style="display:block" data-new-transition-definition="${escapeHtml(scene.id)}">
      <div class="form-grid compact-grid">
        <label class="field"><span>New route name</span><input class="input" data-new-transition-name maxlength="120" placeholder="e.g. Take the hidden passage"></label>
        <label class="field"><span>Status</span><select class="input" data-new-transition-status><option value="draft">draft</option><option value="active">active</option></select></label>
        <label class="field"><span>Mode</span><select class="input" data-new-transition-mode><option value="next_scene">next_scene</option><option value="complete_scenario">complete_scenario</option></select></label>
        <label class="field"><span>Target Scene</span><select class="input" data-new-transition-target>${routeTargetOptions(scenario, scene.id)}</select></label>
        <label class="field"><span>Carry Story flags</span><input class="input" data-new-transition-carry-flags placeholder="quest.key_found"></label>
        <label class="field"><span>Character entry sourceSpawnPointId</span><input class="input" data-new-transition-spawn placeholder="spawn_..."></label>
        <label class="check-field"><input type="checkbox" data-new-transition-carry-characters checked> Carry positioned Characters</label>
        <label class="field"><span>Sort order</span><input class="input" data-new-transition-sort type="number" step="1" value="0"></label>
        <label class="field" style="grid-column:1/-1"><span>Conditions JSON</span><textarea class="textarea" data-new-transition-conditions rows="4" placeholder='[{"type":"flag_equals","key":"quest.key_found","value":true}]'>[]</textarea></label>
        <label class="field" style="grid-column:1/-1"><span>GM Notes</span><textarea class="textarea" data-new-transition-notes rows="2"></textarea></label>
      </div>
      <div class="form-actions"><button class="button button-small button-ghost" type="button" data-story-action="add-transition" data-scene-id="${escapeHtml(scene.id)}">+ Transition Definition</button></div>
    </article>
  </details>`;
}

function sceneHtml(scene, scenario) {
'''
assert text.count(anchor) == 1
text = text.replace(anchor, functions, 1)

old = "<div class=\"stack-list\">${(scenario.scenes || []).map(scene => sceneHtml(scene)).join('')}</div>"
new = "<div class=\"stack-list\">${(scenario.scenes || []).map(scene => sceneHtml(scene, scenario)).join('')}</div>"
assert text.count(old) == 1
text = text.replace(old, new, 1)

anchor = """    </details>
    <div class="stack-list">${(scene.encounters || []).map(encounter => encounterHtml(encounter)).join('')}</div>
"""
replacement = """    </details>
    ${transitionDefinitionsHtml(scene, scenario)}
    <div class="stack-list">${(scene.encounters || []).map(encounter => encounterHtml(encounter)).join('')}</div>
"""
assert text.count(anchor) == 1
text = text.replace(anchor, replacement, 1)

anchor = """    storyState = await api('/api/gm/story');
    storyLoaded = true;
"""
replacement = """    const [story, transitionPayload] = await Promise.all([
      api('/api/gm/story'),
      api('/api/gm/scene-transitions')
    ]);
    transitionDefinitions = transitionPayload?.definitions || [];
    const byScene = new Map();
    for (const definition of transitionDefinitions) {
      if (!byScene.has(definition.fromSceneId)) byScene.set(definition.fromSceneId, []);
      byScene.get(definition.fromSceneId).push(definition);
    }
    for (const scenario of story?.scenarios || []) {
      for (const scene of scenario.scenes || []) scene.transitions = byScene.get(scene.id) || [];
    }
    storyState = story;
    storyLoaded = true;
"""
assert text.count(anchor) == 1
text = text.replace(anchor, replacement, 1)

anchor = """async function handleStoryClick(event) {
"""
helpers = r'''function transitionFlagValues(value) {
  return [...new Set(String(value || '').split(/[\s,]+/).map(item => item.trim().toLowerCase()).filter(Boolean))];
}

function transitionConditions(value) {
  let parsed;
  try { parsed = JSON.parse(String(value || '[]')); }
  catch { throw new Error('Transition Conditions 必須係有效 JSON。'); }
  if (!Array.isArray(parsed)) throw new Error('Transition Conditions 必須係 JSON array。');
  return parsed;
}

function transitionBodyFromContainer(container, prefix = '') {
  const attr = name => `[data-${prefix ? `${prefix}-` : ''}transition-${name}]`;
  const mode = $(attr('mode'), container)?.value || 'next_scene';
  return {
    name: $(attr('name'), container)?.value || '',
    status: $(attr('status'), container)?.value || 'draft',
    mode,
    toSceneId: mode === 'next_scene' ? ($(attr('target'), container)?.value || '') : '',
    carryFlagKeys: mode === 'next_scene' ? transitionFlagValues($(attr('carry-flags'), container)?.value) : [],
    carryCharacters: mode === 'next_scene' && Boolean($(attr('carry-characters'), container)?.checked),
    targetSourceSpawnPointId: mode === 'next_scene' ? ($(attr('spawn'), container)?.value || '') : '',
    conditions: transitionConditions($(attr('conditions'), container)?.value),
    sortOrder: Number($(attr('sort'), container)?.value || 0),
    gmNotes: $(attr('notes'), container)?.value || ''
  };
}

''' + anchor
assert text.count(anchor) == 1
text = text.replace(anchor, helpers, 1)

anchor = """    if (action === 'save-scenario') {
"""
insert = r'''    if (action === 'add-transition') {
      const sceneId = button.dataset.sceneId;
      const container = document.querySelector(`[data-new-transition-definition="${CSS.escape(sceneId)}"]`);
      const body = transitionBodyFromContainer(container, 'new');
      if (!body.name.trim()) throw new Error('Transition Definition Name is required.');
      await api(`/api/gm/scenes/${encodeURIComponent(sceneId)}/transitions`, { method: 'POST', body: JSON.stringify(body) });
      toast('Transition Definition created.', 'success');
    } else if (action === 'save-transition') {
      const id = button.dataset.transitionId;
      const container = document.querySelector(`[data-transition-definition="${CSS.escape(id)}"]`);
      const body = transitionBodyFromContainer(container);
      body.expectedVersion = Number(button.dataset.transitionVersion);
      await api(`/api/gm/scene-transitions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('Transition Definition updated.', 'success');
    } else if (action === 'delete-transition') {
      const id = button.dataset.transitionId;
      await api(`/api/gm/scene-transitions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ expectedVersion: Number(button.dataset.transitionVersion) })
      });
      toast('Draft Transition Definition deleted.', 'success');
    } else if (action === 'save-scenario') {
'''
assert text.count(anchor) == 1
text = text.replace(anchor, insert, 1)
path.write_text(text, encoding='utf-8')

# GM Runtime UI: authored route eligibility + explicit selection, manual controls retained as override.
path = Path('public/assets/gm-runtime-map.js')
text = path.read_text(encoding='utf-8')
anchor = "let transitionTargetEditor = null;\n"
assert text.count(anchor) == 1
text = text.replace(anchor, anchor + "let transitionOptionsState = null;\n", 1)

anchor = """          <div class="form-grid compact-grid">
            <label class="field"><span>Next Scene</span><select id="runtime-transition-scene" class="input"></select></label>
"""
replacement = """          <div class="form-grid compact-grid">
            <label class="field" style="grid-column:1/-1"><span>Authored Route</span><select id="runtime-transition-definition" class="input"><option value="">Loading authored routes…</option></select></label>
          </div>
          <p id="runtime-transition-definition-note" class="muted">Active authored routes are re-evaluated against current Runtime state before execution.</p>
          <div class="form-actions"><button class="button button-small" type="button" data-runtime-transition="authored">Use Authored Route</button></div>
          <hr>
          <p class="muted"><strong>Manual Override</strong> · Direct Runtime policy bypasses Definition route authoring but not Runtime transition invariants.</p>
          <div class="form-grid compact-grid">
            <label class="field"><span>Next Scene</span><select id="runtime-transition-scene" class="input"></select></label>
"""
assert text.count(anchor) == 1
text = text.replace(anchor, replacement, 1)

anchor = """function renderTransitionControls() {
"""
functions = r'''async function loadAuthoredTransitionOptions() {
  const map = runtimeDetailState?.mapInstance;
  const select = $('#runtime-transition-definition');
  const note = $('#runtime-transition-definition-note');
  if (!map || !select || !note) return;
  if (map.status !== 'active') {
    transitionOptionsState = null;
    select.innerHTML = '<option value="">Runtime closed</option>';
    select.disabled = true;
    return;
  }
  select.disabled = true;
  select.innerHTML = '<option value="">Loading authored routes…</option>';
  try {
    transitionOptionsState = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(map.id)}/transition-options`);
    const options = transitionOptionsState?.options || [];
    select.innerHTML = options.length
      ? options.map(option => {
          const definition = option.definition;
          const target = definition.mode === 'complete_scenario' ? 'Complete Scenario' : `→ ${definition.toSceneId}`;
          return `<option value="${escapeHtml(definition.id)}" ${option.eligible ? '' : 'disabled'}>${option.eligible ? '✓' : '×'} ${escapeHtml(definition.name)} · ${escapeHtml(target)}</option>`;
        }).join('')
      : '<option value="">No active authored routes</option>';
    select.disabled = !options.some(option => option.eligible);
    const blockers = transitionOptionsState?.globalBlockers || [];
    const ineligible = options.filter(option => !option.eligible).length;
    note.textContent = blockers.length
      ? `Transition blocked: ${blockers.map(item => item.reason).join(', ')}.`
      : `${options.filter(option => option.eligible).length} eligible authored route(s)${ineligible ? ` · ${ineligible} currently unavailable` : ''}.`;
  } catch (error) {
    transitionOptionsState = null;
    select.innerHTML = '<option value="">Unable to load authored routes</option>';
    select.disabled = true;
    note.textContent = error.message;
  }
}

''' + anchor
assert text.count(anchor) == 1
text = text.replace(anchor, functions, 1)

anchor = """  transitionTargetEditor = null;
  loadTransitionSpawns().catch(error => toast(error.message, 'error'));
}
"""
replacement = """  transitionTargetEditor = null;
  loadTransitionSpawns().catch(error => toast(error.message, 'error'));
  loadAuthoredTransitionOptions().catch(error => toast(error.message, 'error'));
}
"""
assert text.count(anchor) == 1
text = text.replace(anchor, replacement, 1)

anchor = """  const mode = button.dataset.runtimeTransition;
  const body = { mode, carryFlagKeys: transitionFlagKeys() };
  if (mode === 'next_scene') {
"""
replacement = """  const mode = button.dataset.runtimeTransition;
  const body = mode === 'authored'
    ? { transitionDefinitionId: $('#runtime-transition-definition')?.value || '' }
    : { mode, carryFlagKeys: transitionFlagKeys() };
  if (mode === 'authored' && !body.transitionDefinitionId) return toast('Select an eligible Authored Route first.', 'error');
  if (mode === 'next_scene') {
"""
assert text.count(anchor) == 1
text = text.replace(anchor, replacement, 1)

anchor = """  transitionTargetEditor = null;
}

const observer = new MutationObserver"""
replacement = """  transitionTargetEditor = null;
  transitionOptionsState = null;
}

const observer = new MutationObserver"""
assert text.count(anchor) == 1
text = text.replace(anchor, replacement, 1)
path.write_text(text, encoding='utf-8')

# Production orchestrator registration.
path = Path('scripts/production-alpha-e2e.mjs')
text = path.read_text(encoding='utf-8')
anchor = "  runComponent('Production Scene Transition E2E', './production-alpha-scene-transition-e2e.mjs');\n"
assert text.count(anchor) == 1
text = text.replace(anchor, anchor + "  runComponent('Production Scene Transition Authoring E2E', './production-alpha-scene-transition-authoring-e2e.mjs');\n", 1)
anchor = "      'runtime-scene-transition',\n"
assert text.count(anchor) == 1
text = text.replace(anchor, anchor + "      'scene-transition-authoring',\n", 1)
path.write_text(text, encoding='utf-8')

# Previous Runtime policy checkpoint now points to the delivered authoring layer.
path = Path('docs/RUNTIME_SCENE_TRANSITION_POLICY_ALPHA.md')
text = path.read_text(encoding='utf-8')
old = "The next useful slice after this authority is stable is **Definition-level branching / transition authoring** if needed, followed by broader consolidation of older direct Story processors only when that reduces maintenance without changing Runtime semantics."
new = "Definition-level branching / transition authoring is now canonical in `SCENE_TRANSITION_AUTHORING_ALPHA.md`. The next major architecture slice is **Story processor consolidation / shared execution authority**, but only where consolidation preserves existing trigger ordering, Runtime audit identity and Definition/Runtime isolation."
assert text.count(old) == 1
path.write_text(text.replace(old, new, 1), encoding='utf-8')
