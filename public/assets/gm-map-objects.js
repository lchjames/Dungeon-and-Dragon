import { $, escapeHtml, toast } from './common.js';

let objectEditorState = null;
let selectedObjectId = '';
let runtimeObjectState = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (response.status === 401) {
    location.replace(`/gm/login/?next=${encodeURIComponent('/gm/#world-map')}`);
    throw new Error('Session expired.');
  }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Request failed.');
    error.code = payload?.error?.code || '';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function panelMarkup() {
  return `<section id="map-object-editor-panel" class="panel hidden">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">MAP OBJECT LAYER</p>
        <h3 id="map-object-title">Interactive Objects</h3>
        <p id="map-object-meta" class="muted">Select a Map Template.</p>
      </div>
      <div class="row-inline">
        <button id="map-object-reload" class="button button-small button-ghost" type="button">Reload Objects</button>
        <button id="map-object-save" class="button button-small" type="button">Save Object Layer</button>
        <button id="map-object-close" class="icon-button" type="button" aria-label="Close Object editor">×</button>
      </div>
    </div>
    <div id="map-object-status" class="auth-status" hidden role="status" aria-live="polite"></div>

    <div class="runtime-map-columns">
      <section class="panel">
        <div class="panel-heading"><div><h4>Object Definition</h4><span id="map-object-edit-label" class="muted">New Object</span></div></div>
        <div class="form-grid compact-grid">
          <label class="field"><span>Name</span><input id="map-object-name" class="input" maxlength="120" placeholder="Ancient Lever"></label>
          <label class="field"><span>Type Key</span><input id="map-object-type" class="input" maxlength="80" value="prop" placeholder="lever"></label>
          <label class="field"><span>X</span><input id="map-object-x" class="input" type="number" min="0" step="1" value="0"></label>
          <label class="field"><span>Y</span><input id="map-object-y" class="input" type="number" min="0" step="1" value="0"></label>
          <label class="field"><span>Interaction Range</span><input id="map-object-range" class="input" type="number" min="1" max="20" step="1" value="1"></label>
          <label class="check-field"><input id="map-object-visible" type="checkbox" checked> Player visible by default</label>
          <label class="check-field"><input id="map-object-enabled" type="checkbox" checked> Enabled by default</label>
          <label class="field"><span>Initial State JSON</span><textarea id="map-object-state" class="textarea" rows="5">{}</textarea></label>
          <label class="field"><span>GM Notes</span><textarea id="map-object-notes" class="textarea" rows="3" maxlength="2000"></textarea></label>
        </div>
        <p class="muted">Objects may sit on blocked Cells (for wall switches, statues or scenery). Type/state are data keys only; no JavaScript or SQL is executed.</p>
        <div class="form-actions wrap">
          <button id="map-object-stage" class="button button-small" type="button">Add Object</button>
          <button id="map-object-new" class="button button-small button-ghost" type="button">Clear Form</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-heading"><div><h4>Objects</h4><span class="muted">Stable sourceObjectId is the future Story target.</span></div></div>
        <div id="map-object-list" class="stack-list"></div>
      </section>
    </div>
  </section>

  <section id="runtime-object-panel" class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">RUNTIME OBJECT SNAPSHOTS</p>
        <h3>Runtime Objects</h3>
        <p class="muted">Read-only Alpha view. Each Scene Run owns an independent snapshot; Player interaction is the next slice.</p>
      </div>
      <button id="runtime-object-refresh" class="button button-small button-ghost" type="button">Refresh</button>
    </div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Runtime Map</span><select id="runtime-object-map" class="input"><option value="">Loading…</option></select></label>
    </div>
    <div id="runtime-object-list" class="stack-list"></div>
  </section>`;
}

function ensurePanels() {
  const view = $('#view-world-map');
  if (!view || $('#map-object-editor-panel')) return;
  view.insertAdjacentHTML('beforeend', panelMarkup());
  $('#map-object-close')?.addEventListener('click', closeObjectEditor);
  $('#map-object-reload')?.addEventListener('click', () => objectEditorState && openObjectEditor(objectEditorState.mapTemplate.id));
  $('#map-object-save')?.addEventListener('click', saveObjectLayer);
  $('#map-object-stage')?.addEventListener('click', stageObject);
  $('#map-object-new')?.addEventListener('click', clearObjectForm);
  $('#map-object-list')?.addEventListener('click', handleObjectListClick);
  $('#runtime-object-refresh')?.addEventListener('click', loadRuntimeObjectOverview);
  $('#runtime-object-map')?.addEventListener('change', event => loadRuntimeObjects(event.target.value || ''));
  queueMicrotask(loadRuntimeObjectOverview);
}

function augmentMapCards() {
  ensurePanels();
  document.querySelectorAll('[data-map-row]').forEach(row => {
    if (row.querySelector('[data-open-map-objects]')) return;
    const mapId = row.dataset.mapRow;
    const heading = row.querySelector('.panel-heading');
    if (!heading) return;
    let actions = heading.querySelector('.row-inline');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'row-inline';
      heading.append(actions);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-small button-ghost';
    button.dataset.openMapObjects = mapId;
    button.textContent = 'Edit Objects';
    actions.append(button);
  });
}

function setStatus(message = '', kind = '') {
  const box = $('#map-object-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function clearObjectForm() {
  selectedObjectId = '';
  if ($('#map-object-edit-label')) $('#map-object-edit-label').textContent = 'New Object';
  if ($('#map-object-name')) $('#map-object-name').value = '';
  if ($('#map-object-type')) $('#map-object-type').value = 'prop';
  if ($('#map-object-x')) $('#map-object-x').value = '0';
  if ($('#map-object-y')) $('#map-object-y').value = '0';
  if ($('#map-object-range')) $('#map-object-range').value = '1';
  if ($('#map-object-visible')) $('#map-object-visible').checked = true;
  if ($('#map-object-enabled')) $('#map-object-enabled').checked = true;
  if ($('#map-object-state')) $('#map-object-state').value = '{}';
  if ($('#map-object-notes')) $('#map-object-notes').value = '';
  if ($('#map-object-stage')) $('#map-object-stage').textContent = 'Add Object';
}

function objectFromForm() {
  const name = ($('#map-object-name')?.value || '').trim();
  if (!name) throw new Error('Object Name is required.');
  const objectType = ($('#map-object-type')?.value || 'prop').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(objectType)) throw new Error('Type Key may use lowercase letters, numbers, _ and - only.');
  const x = Number($('#map-object-x')?.value);
  const y = Number($('#map-object-y')?.value);
  const interactionRange = Number($('#map-object-range')?.value);
  const map = objectEditorState?.mapTemplate;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !map || x < 0 || y < 0 || x >= map.width || y >= map.height) {
    throw new Error('Object coordinates are outside the Map.');
  }
  if (!Number.isInteger(interactionRange) || interactionRange < 1 || interactionRange > 20) throw new Error('Interaction Range must be 1–20.');
  let initialState;
  try { initialState = JSON.parse($('#map-object-state')?.value || '{}'); } catch { throw new Error('Initial State must be valid JSON.'); }
  if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState)) throw new Error('Initial State must be a JSON object.');
  return {
    id: selectedObjectId || `object_${crypto.randomUUID()}`,
    name,
    objectType,
    x,
    y,
    interactionRange,
    playerVisibleDefault: Boolean($('#map-object-visible')?.checked),
    enabledDefault: Boolean($('#map-object-enabled')?.checked),
    initialState,
    gmNotes: ($('#map-object-notes')?.value || '').trim()
  };
}

function renderObjectList() {
  const target = $('#map-object-list');
  if (!target) return;
  const objects = objectEditorState?.objects || [];
  if (!objects.length) {
    target.innerHTML = '<p class="muted">No Map Objects yet.</p>';
    return;
  }
  target.innerHTML = objects.map(object => `<article class="stack-item">
    <div style="min-width:0">
      <div class="row-inline"><strong>${escapeHtml(object.name)}</strong><span class="tag">${escapeHtml(object.objectType)}</span>${object.enabledDefault ? '' : '<span class="tag">disabled</span>'}${object.playerVisibleDefault ? '' : '<span class="tag">hidden</span>'}</div>
      <p>(${object.x}, ${object.y}) · range ${object.interactionRange}</p>
      <small class="muted">${escapeHtml(object.id)}</small>
      <pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(JSON.stringify(object.initialState || {}))}</pre>
    </div>
    <div class="quantity-editor">
      <button class="button button-small button-ghost" type="button" data-edit-map-object="${escapeHtml(object.id)}">Edit</button>
      <button class="button button-small button-danger-soft" type="button" data-remove-map-object="${escapeHtml(object.id)}">Remove</button>
    </div>
  </article>`).join('');
}

function stageObject() {
  if (!objectEditorState) return;
  try {
    const object = objectFromForm();
    const duplicate = objectEditorState.objects.find(other => other.id !== object.id && other.name.toLocaleLowerCase() === object.name.toLocaleLowerCase());
    if (duplicate) throw new Error('Object Name must be unique on this Map.');
    const index = objectEditorState.objects.findIndex(other => other.id === object.id);
    if (index >= 0) objectEditorState.objects[index] = object;
    else objectEditorState.objects.push(object);
    clearObjectForm();
    renderObjectList();
    toast(index >= 0 ? 'Object staged for update.' : 'Object staged.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function handleObjectListClick(event) {
  const edit = event.target.closest?.('[data-edit-map-object]');
  if (edit && objectEditorState) {
    const object = objectEditorState.objects.find(item => item.id === edit.dataset.editMapObject);
    if (!object) return;
    selectedObjectId = object.id;
    $('#map-object-edit-label').textContent = `Editing ${object.id}`;
    $('#map-object-name').value = object.name;
    $('#map-object-type').value = object.objectType;
    $('#map-object-x').value = String(object.x);
    $('#map-object-y').value = String(object.y);
    $('#map-object-range').value = String(object.interactionRange);
    $('#map-object-visible').checked = Boolean(object.playerVisibleDefault);
    $('#map-object-enabled').checked = Boolean(object.enabledDefault);
    $('#map-object-state').value = JSON.stringify(object.initialState || {}, null, 2);
    $('#map-object-notes').value = object.gmNotes || '';
    $('#map-object-stage').textContent = 'Update Object';
    return;
  }
  const remove = event.target.closest?.('[data-remove-map-object]');
  if (remove && objectEditorState) {
    objectEditorState.objects = objectEditorState.objects.filter(item => item.id !== remove.dataset.removeMapObject);
    if (selectedObjectId === remove.dataset.removeMapObject) clearObjectForm();
    renderObjectList();
  }
}

async function openObjectEditor(mapId) {
  ensurePanels();
  document.querySelector('#map-editor-close')?.click();
  setStatus('Loading Map Objects…');
  $('#map-object-editor-panel')?.classList.remove('hidden');
  try {
    objectEditorState = await api(`/api/gm/world/maps/${encodeURIComponent(mapId)}/objects`);
    selectedObjectId = '';
    $('#map-object-title').textContent = `${objectEditorState.mapTemplate.name} · Objects`;
    $('#map-object-meta').textContent = `${objectEditorState.mapTemplate.locationName} · ${objectEditorState.mapTemplate.width}×${objectEditorState.mapTemplate.height} · Template v${objectEditorState.mapTemplate.version}`;
    $('#map-object-x').max = String(Math.max(0, objectEditorState.mapTemplate.width - 1));
    $('#map-object-y').max = String(Math.max(0, objectEditorState.mapTemplate.height - 1));
    clearObjectForm();
    renderObjectList();
    setStatus('');
    $('#map-object-editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    objectEditorState = null;
    setStatus(error.message, 'error');
  }
}

function closeObjectEditor() {
  objectEditorState = null;
  selectedObjectId = '';
  $('#map-object-editor-panel')?.classList.add('hidden');
}

async function saveObjectLayer() {
  if (!objectEditorState) return;
  const button = $('#map-object-save');
  button.disabled = true;
  setStatus('Saving Object Layer…');
  try {
    const payload = await api(`/api/gm/world/maps/${encodeURIComponent(objectEditorState.mapTemplate.id)}/objects`, {
      method: 'PUT',
      body: JSON.stringify({ expectedVersion: objectEditorState.mapTemplate.version, objects: objectEditorState.objects })
    });
    objectEditorState = payload;
    $('#map-object-meta').textContent = `${payload.mapTemplate.locationName} · ${payload.mapTemplate.width}×${payload.mapTemplate.height} · Template v${payload.mapTemplate.version}`;
    renderObjectList();
    setStatus('Saved.', 'success');
    $('#world-map-refresh')?.click();
    toast('Map Object Layer saved.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function renderRuntimeObjects() {
  const target = $('#runtime-object-list');
  const objects = runtimeObjectState?.objects || [];
  if (!target) return;
  target.innerHTML = objects.length ? objects.map(object => `<article class="stack-item">
    <div>
      <div class="row-inline"><strong>${escapeHtml(object.name)}</strong><span class="tag">${escapeHtml(object.objectType)}</span><span class="status-pill">${object.enabled ? 'enabled' : 'disabled'}</span></div>
      <p>(${object.x}, ${object.y}) · range ${object.interactionRange} · ${object.playerVisible ? 'visible' : 'hidden'}</p>
      <small class="muted">source: ${escapeHtml(object.sourceObjectId)} · runtime: ${escapeHtml(object.id)}</small>
      <pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(JSON.stringify(object.state || {}))}</pre>
    </div>
  </article>`).join('') : '<p class="muted">No Runtime Objects in this snapshot.</p>';
}

async function loadRuntimeObjects(mapInstanceId) {
  if (!mapInstanceId) {
    runtimeObjectState = null;
    renderRuntimeObjects();
    return;
  }
  try {
    runtimeObjectState = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}/objects`);
    renderRuntimeObjects();
  } catch (error) {
    $('#runtime-object-list').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

async function loadRuntimeObjectOverview() {
  const select = $('#runtime-object-map');
  if (!select) return;
  try {
    const overview = await api('/api/gm/world/runtime');
    const maps = overview.mapInstances || [];
    const prior = select.value || '';
    select.innerHTML = maps.length ? maps.map(map => `<option value="${escapeHtml(map.id)}">${escapeHtml(map.scenarioName)} → ${escapeHtml(map.sceneName)} · ${escapeHtml(map.status)} · v${map.sourceMapVersion}</option>`).join('') : '<option value="">No Runtime Maps</option>';
    if (maps.some(map => map.id === prior)) select.value = prior;
    await loadRuntimeObjects(select.value || '');
  } catch (error) {
    select.innerHTML = '<option value="">Runtime unavailable</option>';
    $('#runtime-object-list').innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

function onDocumentClick(event) {
  const open = event.target.closest?.('[data-open-map-objects]');
  if (open) {
    openObjectEditor(open.dataset.openMapObjects);
    return;
  }
  if (event.target.closest?.('[data-open-map-grid]')) closeObjectEditor();
}

function initialise() {
  ensurePanels();
  augmentMapCards();
  document.addEventListener('click', onDocumentClick);
  const observer = new MutationObserver(() => augmentMapCards());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
else initialise();
