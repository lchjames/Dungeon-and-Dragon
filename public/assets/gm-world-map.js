import { $, $$, escapeHtml, toast, emptyState } from './common.js';

let worldState = null;
let worldLoaded = false;

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
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function markup() {
  return `
    <div class="section-heading">
      <div>
        <p class="eyebrow">WORLD / MAP DEFINITIONS</p>
        <h2>Locations & Map Templates</h2>
        <p class="muted">Reusable Map definitions are separate from Scene/play runtime state. This slice creates the definition layer; grid painting and Runtime Map Instances follow next.</p>
      </div>
      <button id="world-map-refresh" class="button button-small button-ghost" type="button">Refresh</button>
    </div>
    <div id="world-map-status" class="auth-status" hidden role="status" aria-live="polite"></div>

    <div class="split-grid">
      <section class="panel">
        <div class="panel-heading"><div><h3>Create Location</h3><span class="muted">Reusable world place</span></div></div>
        <div class="form-grid compact-grid">
          <label class="field"><span>Location Name</span><input id="world-location-name" class="input" maxlength="120" placeholder="e.g. Abandoned Hospital — Floor 1"></label>
          <label class="field"><span>Description</span><textarea id="world-location-description" class="textarea" rows="2" maxlength="5000"></textarea></label>
          <label class="field"><span>GM Notes</span><textarea id="world-location-notes" class="textarea" rows="2" maxlength="5000"></textarea></label>
        </div>
        <div class="form-actions"><button id="world-create-location" class="button" type="button">Create Location</button></div>
      </section>

      <section class="panel">
        <div class="panel-heading"><div><h3>Create Map Template</h3><span class="muted">Structured reusable grid</span></div></div>
        <div class="form-grid compact-grid">
          <label class="field"><span>Location</span><select id="world-map-location" class="input"></select></label>
          <label class="field"><span>Map Name</span><input id="world-map-name" class="input" maxlength="120" placeholder="e.g. Hospital_F1"></label>
          <label class="field"><span>Width</span><input id="world-map-width" class="input" type="number" min="1" max="200" step="1" value="20"></label>
          <label class="field"><span>Height</span><input id="world-map-height" class="input" type="number" min="1" max="200" step="1" value="15"></label>
          <label class="field"><span>Optional Background Asset</span><input id="world-map-background" class="input" maxlength="2000" placeholder="Asset URL / reference"></label>
          <label class="field"><span>GM Notes</span><textarea id="world-map-notes" class="textarea" rows="2" maxlength="5000"></textarea></label>
        </div>
        <div class="form-actions"><button id="world-create-map" class="button" type="button">Create Map Template</button></div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-heading"><div><h3>World Definitions</h3><span class="muted">Locations → reusable Map Templates</span></div></div>
      <div id="world-definition-list" class="stack-list"></div>
    </section>

    <section class="panel">
      <div class="panel-heading"><div><h3>Scene Map Binding</h3><span class="muted">Scene references a reusable Map Template; mutable play state will live in a later Runtime Map Instance.</span></div></div>
      <div id="world-scene-binding-list" class="stack-list"></div>
    </section>
  `;
}

function ensureUi() {
  if (!$('#world-map-side-link')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'world-map-side-link';
    button.className = 'side-link';
    button.dataset.view = 'world-map';
    button.textContent = 'World / Maps';
    $('#combat-side-link')?.before(button);
    button.addEventListener('click', showView);
  }

  if (!$('#view-world-map')) {
    const section = document.createElement('section');
    section.id = 'view-world-map';
    section.className = 'admin-view hidden';
    section.innerHTML = markup();
    $('#gm-content')?.append(section);
    $('#world-map-refresh')?.addEventListener('click', () => loadWorld());
    $('#world-create-location')?.addEventListener('click', createLocation);
    $('#world-create-map')?.addEventListener('click', createMap);
    $('#world-definition-list')?.addEventListener('click', handleDefinitionClick);
    $('#world-scene-binding-list')?.addEventListener('click', handleBindingClick);
  }
}

function setStatus(message = '', kind = '') {
  const box = $('#world-map-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function selected(value, expected) {
  return value === expected ? 'selected' : '';
}

function mapOptions(selectedId = '') {
  const maps = (worldState?.mapTemplates || []).filter(map => map.status === 'active');
  if (!maps.length) return '<option value="">No active Map Templates</option>';
  return `<option value="">Select Map Template…</option>${maps.map(map => `<option value="${escapeHtml(map.id)}" ${selected(map.id, selectedId)}>${escapeHtml(map.locationName)} · ${escapeHtml(map.name)} · ${map.width}×${map.height}</option>`).join('')}`;
}

function renderLocationSelect() {
  const select = $('#world-map-location');
  if (!select) return;
  const locations = (worldState?.locations || []).filter(location => location.status === 'active');
  select.innerHTML = locations.length
    ? `<option value="">Select Location…</option>${locations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('')}`
    : '<option value="">Create an active Location first</option>';
  $('#world-create-map').disabled = !locations.length;
}

function locationCard(location) {
  const maps = (worldState?.mapTemplates || []).filter(map => map.locationId === location.id);
  return `<article class="stack-item" style="display:block" data-location-row="${escapeHtml(location.id)}">
    <div class="panel-heading">
      <div><div class="row-inline"><h4>${escapeHtml(location.name)}</h4><span class="tag">Location</span><span class="status-pill">${escapeHtml(location.status)}</span></div><p>${escapeHtml(location.description || 'No description')}</p></div>
    </div>
    <details>
      <summary>Edit Location</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-location-name value="${escapeHtml(location.name)}" maxlength="120"></label>
        <label class="field"><span>Status</span><select class="input" data-location-status><option value="active" ${selected(location.status, 'active')}>active</option><option value="archived" ${selected(location.status, 'archived')}>archived</option></select></label>
        <label class="field"><span>Description</span><textarea class="textarea" data-location-description rows="2">${escapeHtml(location.description || '')}</textarea></label>
        <label class="field"><span>GM Notes</span><textarea class="textarea" data-location-notes rows="2">${escapeHtml(location.gmNotes || '')}</textarea></label>
      </div>
      <div class="form-actions"><button class="button button-small" type="button" data-world-action="save-location" data-location-id="${escapeHtml(location.id)}">Save Location</button></div>
    </details>
    <div class="stack-list">${maps.length ? maps.map(mapCard).join('') : '<p class="muted">No Map Templates in this Location.</p>'}</div>
  </article>`;
}

function mapCard(map) {
  return `<article class="stack-item" style="display:block" data-map-row="${escapeHtml(map.id)}">
    <div class="panel-heading">
      <div><div class="row-inline"><strong>${escapeHtml(map.name)}</strong><span class="tag">Map Template v${map.version}</span><span class="status-pill">${escapeHtml(map.status)}</span></div><p>${map.width}×${map.height} · cell overrides ${map.cellOverrideCount} · edges ${map.edgeCount} · zones ${map.zoneCount} · spawns ${map.spawnPointCount}</p></div>
    </div>
    <details>
      <summary>Edit Map Template</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-map-name value="${escapeHtml(map.name)}" maxlength="120"></label>
        <label class="field"><span>Status</span><select class="input" data-map-status><option value="active" ${selected(map.status, 'active')}>active</option><option value="archived" ${selected(map.status, 'archived')}>archived</option></select></label>
        <label class="field"><span>Width</span><input class="input" data-map-width type="number" min="1" max="200" value="${map.width}"></label>
        <label class="field"><span>Height</span><input class="input" data-map-height type="number" min="1" max="200" value="${map.height}"></label>
        <label class="field"><span>Background Asset</span><input class="input" data-map-background value="${escapeHtml(map.backgroundAssetRef || '')}" maxlength="2000"></label>
        <label class="field"><span>GM Notes</span><textarea class="textarea" data-map-notes rows="2">${escapeHtml(map.gmNotes || '')}</textarea></label>
      </div>
      <div class="form-actions"><button class="button button-small" type="button" data-world-action="save-map" data-map-id="${escapeHtml(map.id)}">Save Map Template</button></div>
      <p class="muted">Grid cell / wall / door / zone / spawn editing is the next implementation slice.</p>
    </details>
  </article>`;
}

function renderDefinitions() {
  const list = $('#world-definition-list');
  const locations = worldState?.locations || [];
  if (!locations.length) {
    list.innerHTML = emptyState('No World Locations', 'Create the first reusable Location, then add a Map Template.');
    return;
  }
  list.innerHTML = locations.map(locationCard).join('');
}

function bindingFor(sceneId) {
  return (worldState?.sceneBindings || []).find(binding => binding.sceneId === sceneId) || null;
}

function renderBindings() {
  const list = $('#world-scene-binding-list');
  const scenes = worldState?.scenes || [];
  if (!scenes.length) {
    list.innerHTML = emptyState('No Scenes', 'Create a Scenario / Scene in Story first.');
    return;
  }
  list.innerHTML = scenes.map(scene => {
    const binding = bindingFor(scene.id);
    return `<article class="stack-item" data-scene-binding-row="${escapeHtml(scene.id)}">
      <div>
        <div class="row-inline"><strong>${escapeHtml(scene.scenarioName)} → ${escapeHtml(scene.name)}</strong><span class="status-pill">${escapeHtml(scene.status)}</span></div>
        <p class="muted">${binding ? `${escapeHtml(binding.locationName)} · ${escapeHtml(binding.mapTemplateName)}` : 'No structured Map binding yet.'}</p>
      </div>
      <div class="row-inline">
        <select class="input" data-scene-map-select>${mapOptions(binding?.mapTemplateId || '')}</select>
        <button class="button button-small" type="button" data-world-action="bind-scene" data-scene-id="${escapeHtml(scene.id)}">Save Binding</button>
      </div>
    </article>`;
  }).join('');
}

function render() {
  renderLocationSelect();
  renderDefinitions();
  renderBindings();
}

async function loadWorld({ quiet = false } = {}) {
  if (!quiet) setStatus('Loading World / Map definitions…');
  try {
    worldState = await api('/api/gm/world-maps');
    worldLoaded = true;
    render();
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function createLocation() {
  const button = $('#world-create-location');
  button.disabled = true;
  try {
    const name = $('#world-location-name')?.value || '';
    if (!name.trim()) throw new Error('Location Name is required.');
    await api('/api/gm/world/locations', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: $('#world-location-description')?.value || '',
        gmNotes: $('#world-location-notes')?.value || ''
      })
    });
    $('#world-location-name').value = '';
    $('#world-location-description').value = '';
    $('#world-location-notes').value = '';
    await loadWorld({ quiet: true });
    toast('Location created.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function createMap() {
  const button = $('#world-create-map');
  button.disabled = true;
  try {
    const locationId = $('#world-map-location')?.value || '';
    const name = $('#world-map-name')?.value || '';
    if (!locationId) throw new Error('Location is required.');
    if (!name.trim()) throw new Error('Map Name is required.');
    await api('/api/gm/world/maps', {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        name,
        width: Number($('#world-map-width')?.value || 0),
        height: Number($('#world-map-height')?.value || 0),
        backgroundAssetRef: $('#world-map-background')?.value || '',
        gmNotes: $('#world-map-notes')?.value || ''
      })
    });
    $('#world-map-name').value = '';
    $('#world-map-background').value = '';
    $('#world-map-notes').value = '';
    await loadWorld({ quiet: true });
    toast('Map Template created.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function handleDefinitionClick(event) {
  const button = event.target.closest?.('[data-world-action]');
  if (!button) return;
  const action = button.dataset.worldAction;
  button.disabled = true;
  try {
    if (action === 'save-location') {
      const id = button.dataset.locationId;
      const row = document.querySelector(`[data-location-row="${CSS.escape(id)}"]`);
      await api(`/api/gm/world/locations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: $('[data-location-name]', row)?.value,
          status: $('[data-location-status]', row)?.value,
          description: $('[data-location-description]', row)?.value,
          gmNotes: $('[data-location-notes]', row)?.value
        })
      });
      toast('Location updated.', 'success');
    } else if (action === 'save-map') {
      const id = button.dataset.mapId;
      const row = document.querySelector(`[data-map-row="${CSS.escape(id)}"]`);
      await api(`/api/gm/world/maps/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: $('[data-map-name]', row)?.value,
          status: $('[data-map-status]', row)?.value,
          width: Number($('[data-map-width]', row)?.value || 0),
          height: Number($('[data-map-height]', row)?.value || 0),
          backgroundAssetRef: $('[data-map-background]', row)?.value,
          gmNotes: $('[data-map-notes]', row)?.value
        })
      });
      toast('Map Template updated.', 'success');
    }
    await loadWorld({ quiet: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function handleBindingClick(event) {
  const button = event.target.closest?.('[data-world-action="bind-scene"]');
  if (!button) return;
  button.disabled = true;
  try {
    const sceneId = button.dataset.sceneId;
    const row = document.querySelector(`[data-scene-binding-row="${CSS.escape(sceneId)}"]`);
    const mapTemplateId = $('[data-scene-map-select]', row)?.value || '';
    if (!mapTemplateId) throw new Error('Select a Map Template.');
    await api(`/api/gm/scenes/${encodeURIComponent(sceneId)}/map-binding`, {
      method: 'PUT',
      body: JSON.stringify({ mapTemplateId, configuration: {} })
    });
    await loadWorld({ quiet: true });
    toast('Scene Map binding saved.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function showView() {
  ensureUi();
  $$('.side-link').forEach(button => button.classList.toggle('active', button.id === 'world-map-side-link'));
  $$('.admin-view').forEach(section => section.classList.add('hidden'));
  $('#view-world-map')?.classList.remove('hidden');
  if ($('#view-title')) $('#view-title').textContent = 'World / Maps';
  history.replaceState(null, '', '#world-map');
  loadWorld({ quiet: worldLoaded });
}

function initialise() {
  ensureUi();
  if (location.hash === '#world-map') showView();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialise, { once: true });
} else {
  initialise();
}
