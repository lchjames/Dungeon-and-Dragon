import { $, escapeHtml, toast, emptyState } from './common.js';

let selectedMapId = '';
let objectState = null;

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
    throw new Error('Admin session expired.');
  }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Request failed.');
    error.code = payload?.error?.code || '';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function markup() {
  return `<section id="gm-map-object-panel" class="panel hidden">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">STRUCTURED MAP OBJECTS</p>
        <h3 id="gm-map-object-title">Map Objects</h3>
        <p id="gm-map-object-meta" class="muted">Select a Map Template.</p>
      </div>
      <div class="row-inline">
        <button id="gm-map-object-refresh" class="button button-small button-ghost" type="button">Refresh</button>
        <button id="gm-map-object-close" class="icon-button" type="button" aria-label="Close Object editor">×</button>
      </div>
    </div>
    <div id="gm-map-object-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="split-grid">
      <section class="panel">
        <div class="panel-heading"><div><h4>Create Object</h4><span class="muted">Reusable Map Definition</span></div></div>
        <div class="form-grid compact-grid">
          <label class="field"><span>Name</span><input id="gm-map-object-name" class="input" maxlength="120" placeholder="e.g. Security Terminal"></label>
          <label class="field"><span>Type</span><input id="gm-map-object-type" class="input" maxlength="40" value="object" placeholder="terminal"></label>
          <label class="field"><span>X</span><input id="gm-map-object-x" class="input" type="number" min="0" step="1" value="0"></label>
          <label class="field"><span>Y</span><input id="gm-map-object-y" class="input" type="number" min="0" step="1" value="0"></label>
          <label class="field"><span>Interaction Range</span><select id="gm-map-object-range" class="input"><option value="1">1 · same/adjacent</option><option value="0">0 · same cell only</option></select></label>
          <label class="field"><span>Initial State</span><input id="gm-map-object-state" class="input" maxlength="80" value="ready"></label>
          <label class="check-field"><input id="gm-map-object-visible" type="checkbox" checked> Player visible by default</label>
          <label class="check-field"><input id="gm-map-object-interactable" type="checkbox" checked> Interactable by default</label>
          <label class="check-field"><input id="gm-map-object-single" type="checkbox"> Single use (first interaction → used)</label>
          <label class="field"><span>GM Notes</span><textarea id="gm-map-object-notes" class="textarea" rows="2" maxlength="1000"></textarea></label>
        </div>
        <div class="form-actions"><button id="gm-map-object-create" class="button" type="button">Create Object</button></div>
      </section>
      <section class="panel">
        <div class="panel-heading"><div><h4>Story Authoring</h4><span class="muted">Use stable sourceObjectId</span></div></div>
        <pre class="code-block">{
  "triggerType": "interact_object",
  "trigger": { "sourceObjectId": "object_..." }
}</pre>
        <p class="muted">Runtime Object IDs are per Scene Run. Story definitions always target the stable Map Object ID shown below.</p>
      </section>
    </div>
    <section class="panel">
      <div class="panel-heading"><div><h4>Object Definitions</h4><span class="muted">Existing Runtime Maps keep their own snapshot.</span></div></div>
      <div id="gm-map-object-list" class="stack-list"></div>
    </section>
  </section>`;
}

function ensurePanel() {
  const view = $('#view-world-map');
  if (!view || $('#gm-map-object-panel')) return;
  view.insertAdjacentHTML('beforeend', markup());
  $('#gm-map-object-close')?.addEventListener('click', () => $('#gm-map-object-panel')?.classList.add('hidden'));
  $('#gm-map-object-refresh')?.addEventListener('click', () => selectedMapId && loadObjects(selectedMapId));
  $('#gm-map-object-create')?.addEventListener('click', createObject);
  $('#gm-map-object-list')?.addEventListener('click', handleListClick);
}

function setStatus(message = '', kind = '') {
  const box = $('#gm-map-object-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function augmentMapCards() {
  ensurePanel();
  document.querySelectorAll('[data-map-row]').forEach(row => {
    if (row.querySelector('[data-open-map-objects]')) return;
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
    button.dataset.openMapObjects = row.dataset.mapRow;
    button.textContent = 'Objects';
    actions.append(button);
  });
}

function renderObjects() {
  const target = $('#gm-map-object-list');
  if (!target || !objectState) return;
  const objects = objectState.objects || [];
  if (!objects.length) {
    target.innerHTML = emptyState('No Map Objects', 'Create an interactable Object for this reusable Map Template.');
    return;
  }
  target.innerHTML = objects.map(object => `<article class="stack-item" style="display:block" data-object-row="${escapeHtml(object.id)}">
    <div class="panel-heading">
      <div>
        <div class="row-inline"><strong>${escapeHtml(object.name)}</strong><span class="tag">${escapeHtml(object.objectType)}</span><span class="status-pill">${object.interactableDefault ? 'interactable' : 'disabled'}</span></div>
        <p><code>${escapeHtml(object.id)}</code> · (${object.x}, ${object.y}) · range ${object.interactionRange} · state ${escapeHtml(object.initialStateKey)}${object.singleUse ? ' · single-use' : ''}</p>
      </div>
    </div>
    <details>
      <summary>Edit Object Definition</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-object-name value="${escapeHtml(object.name)}" maxlength="120"></label>
        <label class="field"><span>Type</span><input class="input" data-object-type value="${escapeHtml(object.objectType)}" maxlength="40"></label>
        <label class="field"><span>X</span><input class="input" data-object-x type="number" min="0" value="${object.x}"></label>
        <label class="field"><span>Y</span><input class="input" data-object-y type="number" min="0" value="${object.y}"></label>
        <label class="field"><span>Range</span><select class="input" data-object-range><option value="1" ${object.interactionRange === 1 ? 'selected' : ''}>1</option><option value="0" ${object.interactionRange === 0 ? 'selected' : ''}>0</option></select></label>
        <label class="field"><span>Initial State</span><input class="input" data-object-state value="${escapeHtml(object.initialStateKey)}" maxlength="80"></label>
        <label class="check-field"><input data-object-visible type="checkbox" ${object.playerVisibleDefault ? 'checked' : ''}> Player visible</label>
        <label class="check-field"><input data-object-interactable type="checkbox" ${object.interactableDefault ? 'checked' : ''}> Interactable</label>
        <label class="check-field"><input data-object-single type="checkbox" ${object.singleUse ? 'checked' : ''}> Single use</label>
        <label class="field"><span>GM Notes</span><textarea class="textarea" data-object-notes rows="2">${escapeHtml(object.gmNotes || '')}</textarea></label>
      </div>
      <div class="form-actions wrap">
        <button class="button button-small" type="button" data-save-object="${escapeHtml(object.id)}">Save Object</button>
        <button class="button button-small button-danger-soft" type="button" data-delete-object="${escapeHtml(object.id)}">Delete Object</button>
      </div>
    </details>
  </article>`).join('');
}

async function loadObjects(mapId, { quiet = false } = {}) {
  selectedMapId = mapId;
  const panel = $('#gm-map-object-panel');
  panel?.classList.remove('hidden');
  if (!quiet) setStatus('Loading Map Objects…');
  try {
    objectState = await api(`/api/gm/world/maps/${encodeURIComponent(mapId)}/objects`);
    $('#gm-map-object-title').textContent = `${objectState.mapTemplate.name} · Objects`;
    $('#gm-map-object-meta').textContent = `${objectState.mapTemplate.width}×${objectState.mapTemplate.height} · Template v${objectState.mapTemplate.version}`;
    $('#gm-map-object-x').max = Math.max(0, objectState.mapTemplate.width - 1);
    $('#gm-map-object-y').max = Math.max(0, objectState.mapTemplate.height - 1);
    renderObjects();
    if (!quiet) setStatus('');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function createBody() {
  return {
    expectedVersion: objectState.mapTemplate.version,
    name: $('#gm-map-object-name')?.value || '',
    objectType: $('#gm-map-object-type')?.value || 'object',
    x: Number($('#gm-map-object-x')?.value || 0),
    y: Number($('#gm-map-object-y')?.value || 0),
    interactionRange: Number($('#gm-map-object-range')?.value || 1),
    initialStateKey: $('#gm-map-object-state')?.value || 'ready',
    playerVisibleDefault: Boolean($('#gm-map-object-visible')?.checked),
    interactableDefault: Boolean($('#gm-map-object-interactable')?.checked),
    singleUse: Boolean($('#gm-map-object-single')?.checked),
    gmNotes: $('#gm-map-object-notes')?.value || ''
  };
}

async function createObject() {
  if (!selectedMapId || !objectState) return;
  const button = $('#gm-map-object-create');
  button.disabled = true;
  try {
    await api(`/api/gm/world/maps/${encodeURIComponent(selectedMapId)}/objects`, {
      method: 'POST', body: JSON.stringify(createBody())
    });
    $('#gm-map-object-name').value = '';
    $('#gm-map-object-notes').value = '';
    await loadObjects(selectedMapId, { quiet: true });
    $('#world-map-refresh')?.click();
    toast('Map Object created.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    if (error.code === 'MAP_TEMPLATE_CHANGED') await loadObjects(selectedMapId, { quiet: true });
  } finally {
    button.disabled = false;
  }
}

function rowBody(row) {
  return {
    expectedVersion: objectState.mapTemplate.version,
    name: row.querySelector('[data-object-name]')?.value || '',
    objectType: row.querySelector('[data-object-type]')?.value || 'object',
    x: Number(row.querySelector('[data-object-x]')?.value || 0),
    y: Number(row.querySelector('[data-object-y]')?.value || 0),
    interactionRange: Number(row.querySelector('[data-object-range]')?.value || 1),
    initialStateKey: row.querySelector('[data-object-state]')?.value || 'ready',
    playerVisibleDefault: Boolean(row.querySelector('[data-object-visible]')?.checked),
    interactableDefault: Boolean(row.querySelector('[data-object-interactable]')?.checked),
    singleUse: Boolean(row.querySelector('[data-object-single]')?.checked),
    gmNotes: row.querySelector('[data-object-notes]')?.value || ''
  };
}

async function saveObject(id, row) {
  try {
    await api(`/api/gm/world/maps/${encodeURIComponent(selectedMapId)}/objects/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(rowBody(row))
    });
    await loadObjects(selectedMapId, { quiet: true });
    $('#world-map-refresh')?.click();
    toast('Map Object saved.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    if (error.code === 'MAP_TEMPLATE_CHANGED') await loadObjects(selectedMapId, { quiet: true });
  }
}

async function deleteObject(id) {
  try {
    await api(`/api/gm/world/maps/${encodeURIComponent(selectedMapId)}/objects/${encodeURIComponent(id)}`, {
      method: 'DELETE', body: JSON.stringify({ expectedVersion: objectState.mapTemplate.version })
    });
    await loadObjects(selectedMapId, { quiet: true });
    $('#world-map-refresh')?.click();
    toast('Map Object deleted.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    if (error.code === 'MAP_TEMPLATE_CHANGED') await loadObjects(selectedMapId, { quiet: true });
  }
}

function handleListClick(event) {
  const save = event.target.closest?.('[data-save-object]');
  if (save) {
    const row = save.closest('[data-object-row]');
    if (row) saveObject(save.dataset.saveObject, row);
    return;
  }
  const remove = event.target.closest?.('[data-delete-object]');
  if (remove) deleteObject(remove.dataset.deleteObject);
}

function onDocumentClick(event) {
  const button = event.target.closest?.('[data-open-map-objects]');
  if (button) loadObjects(button.dataset.openMapObjects);
}

function initialise() {
  ensurePanel();
  augmentMapCards();
  document.addEventListener('click', onDocumentClick);
  const observer = new MutationObserver(augmentMapCards);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
else initialise();
