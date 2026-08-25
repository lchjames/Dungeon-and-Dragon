import { $, escapeHtml, toast, emptyState } from './common.js';

let runtimeMaps = [];
let selectedMapId = '';
let selectedDetail = null;

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

function panelMarkup() {
  return `<section id="runtime-door-panel" class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">RUNTIME DOOR AUTHORITY</p>
        <h3>Door States</h3>
        <p class="muted">GM runtime override only. Door state changes immediately affect server-authoritative movement.</p>
      </div>
      <button id="runtime-door-refresh" class="button button-small button-ghost" type="button">Refresh Doors</button>
    </div>
    <div id="runtime-door-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Active Runtime Map</span><select id="runtime-door-map" class="input"><option value="">No active Runtime Map</option></select></label>
    </div>
    <p class="muted">This control does not resolve Player opening, lock-picking, keys, or Action costs. It changes the authoritative runtime state as a GM operation.</p>
    <div id="runtime-door-list" class="stack-list"></div>
  </section>`;
}

function ensurePanel() {
  const view = $('#view-world-map');
  if (!view || $('#runtime-door-panel')) return;
  const runtimePanel = $('#runtime-map-panel');
  if (runtimePanel) runtimePanel.insertAdjacentHTML('afterend', panelMarkup());
  else view.insertAdjacentHTML('beforeend', panelMarkup());

  $('#runtime-door-refresh')?.addEventListener('click', () => loadOverview());
  $('#runtime-door-map')?.addEventListener('change', async event => {
    selectedMapId = event.target.value || '';
    await loadSelectedMap();
  });
  $('#runtime-door-list')?.addEventListener('click', handleDoorClick);
  queueMicrotask(() => loadOverview({ quiet: true }));
}

function setStatus(message = '', kind = '') {
  const box = $('#runtime-door-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function renderMapSelect() {
  const select = $('#runtime-door-map');
  if (!select) return;
  const active = runtimeMaps.filter(map => map.status === 'active');
  const ids = new Set(active.map(map => map.id));
  if (!ids.has(selectedMapId)) selectedMapId = active[0]?.id || '';
  select.innerHTML = active.length
    ? active.map(map => `<option value="${escapeHtml(map.id)}" ${map.id === selectedMapId ? 'selected' : ''}>${escapeHtml(map.scenarioName)} → ${escapeHtml(map.sceneName)} · ${escapeHtml(map.locationName)} · ${escapeHtml(map.mapName)}</option>`).join('')
    : '<option value="">No active Runtime Map</option>';
  select.disabled = !active.length;
}

function stateLabel(state) {
  if (state === 'open') return 'open · passable';
  if (state === 'broken') return 'broken · passable';
  if (state === 'locked') return 'locked · blocks movement';
  return 'closed · blocks movement';
}

function renderDoors() {
  const target = $('#runtime-door-list');
  if (!target) return;
  if (!selectedMapId) {
    target.innerHTML = emptyState('No active Runtime Map', 'Start a Scene Runtime first.');
    return;
  }
  const doors = (selectedDetail?.edges || []).filter(edge => edge.edgeType === 'door');
  if (!doors.length) {
    target.innerHTML = emptyState('No doors on this Runtime Map', 'Door edges come from the Map Template snapshot.');
    return;
  }
  target.innerHTML = doors.map(door => {
    const current = door.doorState || 'closed';
    return `<article class="stack-item" data-runtime-door-row="${escapeHtml(door.id)}">
      <div style="flex:1;min-width:0">
        <div class="row-inline">
          <h4>Door · (${escapeHtml(door.x)}, ${escapeHtml(door.y)}) ${escapeHtml(door.direction)}</h4>
          <span class="status-pill">${escapeHtml(stateLabel(current))}</span>
        </div>
        ${door.gmNotes ? `<p>${escapeHtml(door.gmNotes)}</p>` : '<p class="muted">No GM notes.</p>'}
      </div>
      <div class="row-inline">
        <select class="input" data-runtime-door-state="${escapeHtml(door.id)}" aria-label="Door state">
          ${['open', 'closed', 'locked', 'broken'].map(state => `<option value="${state}" ${state === current ? 'selected' : ''}>${escapeHtml(stateLabel(state))}</option>`).join('')}
        </select>
        <button class="button button-small" type="button" data-runtime-door-apply="${escapeHtml(door.id)}">Apply</button>
      </div>
    </article>`;
  }).join('');
}

async function loadSelectedMap({ quiet = false } = {}) {
  selectedDetail = null;
  if (!selectedMapId) {
    renderDoors();
    return;
  }
  if (!quiet) setStatus('Loading Runtime Doors…');
  try {
    selectedDetail = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(selectedMapId)}`);
    renderDoors();
    setStatus('');
  } catch (error) {
    renderDoors();
    setStatus(error.message, 'error');
  }
}

async function loadOverview({ quiet = false } = {}) {
  if (!quiet) setStatus('Loading Runtime Maps…');
  try {
    const payload = await api('/api/gm/world/runtime');
    runtimeMaps = payload.mapInstances || [];
    renderMapSelect();
    await loadSelectedMap({ quiet: true });
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function handleDoorClick(event) {
  const button = event.target.closest?.('[data-runtime-door-apply]');
  if (!button || !selectedMapId) return;
  const edgeId = button.dataset.runtimeDoorApply;
  const select = document.querySelector(`[data-runtime-door-state="${CSS.escape(edgeId)}"]`);
  if (!select) return;
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(selectedMapId)}/edges/${encodeURIComponent(edgeId)}/door-state`, {
      method: 'PATCH',
      body: JSON.stringify({ state: select.value })
    });
    await loadSelectedMap({ quiet: true });
    if (!$('#runtime-map-detail')?.classList.contains('hidden')) {
      $('#runtime-map-detail-reload')?.click();
    }
    toast(payload.unchanged ? 'Door state unchanged.' : `Door is now ${payload.door?.state || select.value}.`, payload.unchanged ? 'info' : 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadSelectedMap({ quiet: true });
  } finally {
    button.disabled = false;
  }
}

function watchRuntimeMapChanges() {
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-runtime-action="start"], [data-runtime-action="open"], #runtime-map-close-run');
    if (!button) return;
    setTimeout(() => loadOverview({ quiet: true }), 350);
  });
}

ensurePanel();
watchRuntimeMapChanges();
