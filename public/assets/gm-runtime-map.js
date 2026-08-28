import { $, escapeHtml, toast, emptyState } from './common.js';

let runtimeOverviewState = null;
let runtimeDetailState = null;
let selectedEntityKey = '';

function ensureStylesheet() {
  if (document.querySelector('link[href="/assets/gm-runtime-map.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/gm-runtime-map.css';
  document.head.append(link);
}

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
  return `<section id="runtime-map-panel" class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">PLAY RUNTIME</p>
        <h3>Scene Runtime & Positions</h3>
        <p class="muted">Instantiate a Scene-bound Map as an independent runtime snapshot, then place Characters / Monsters / Bosses on authoritative cells.</p>
      </div>
      <button id="runtime-map-refresh" class="button button-small button-ghost" type="button">Refresh Runtime</button>
    </div>
    <div id="runtime-map-status" class="auth-status" hidden role="status" aria-live="polite"></div>

    <div class="runtime-map-columns">
      <section>
        <div class="panel-heading"><div><h4>Start Scene Runtime</h4><span class="muted">Requires a Structured Map binding.</span></div></div>
        <div id="runtime-bound-scenes" class="stack-list"></div>
      </section>
      <section>
        <div class="panel-heading"><div><h4>Runtime Map Instances</h4><span class="muted">Template edits do not mutate these snapshots.</span></div></div>
        <div id="runtime-map-list" class="stack-list"></div>
      </section>
    </div>
  </section>

  <section id="runtime-map-detail" class="panel hidden">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">AUTHORITATIVE RUNTIME MAP</p>
        <h3 id="runtime-map-title">Runtime Map</h3>
        <p id="runtime-map-meta" class="muted"></p>
      </div>
      <div class="row-inline">
        <button id="runtime-map-detail-reload" class="button button-small button-ghost" type="button">Reload</button>
        <button id="runtime-map-close-run" class="button button-small button-danger-soft" type="button">Close Runtime</button>
        <button id="runtime-map-detail-close" class="icon-button" type="button" aria-label="Close Runtime Map detail">×</button>
      </div>
    </div>

    <div class="runtime-map-layout">
      <div class="runtime-map-scroll">
        <div id="runtime-map-grid" class="runtime-map-grid" role="grid" aria-label="Runtime Map"></div>
      </div>

      <aside class="runtime-map-inspector">
        <section class="panel">
          <h4>Place Entity</h4>
          <div class="form-grid compact-grid">
            <label class="field"><span>Entity</span><select id="runtime-map-entity" class="input"></select></label>
            <label class="field"><span>Global Visibility</span><select id="runtime-map-visibility" class="input"><option value="default">default</option><option value="visible">visible</option><option value="hidden">hidden</option></select></label>
            <label class="check-field"><input id="runtime-map-allow-overlap" type="checkbox"> Allow overlap (GM override)</label>
          </div>
          <p class="muted">Select an Entity, then click a walkable cell.</p>
          <div class="form-actions wrap">
            <button id="runtime-map-unplace" class="button button-small button-danger-soft" type="button">Unplace Selected</button>
          </div>
        </section>

        <section class="panel">
          <h4>Spawn Point</h4>
          <div class="form-grid compact-grid">
            <label class="field"><span>Spawn</span><select id="runtime-map-spawn" class="input"></select></label>
          </div>
          <div class="form-actions wrap">
            <button id="runtime-map-place-spawn" class="button button-small button-ghost" type="button">Place Selected at Spawn</button>
          </div>
        </section>

        <section class="panel">
          <h4>Token Visibility</h4>
          <p id="runtime-token-visibility-summary" class="muted">Select a positioned Entity.</p>
          <div class="form-grid compact-grid">
            <label class="field"><span>Global fallback</span><select id="runtime-token-global" class="input"><option value="default">default</option><option value="visible">visible</option><option value="hidden">hidden</option></select></label>
            <label class="field"><span>Player viewer</span><select id="runtime-token-viewer" class="input"></select></label>
            <label class="field"><span>Viewer override</span><select id="runtime-token-viewer-mode" class="input"><option value="inherit">inherit global</option><option value="visible">visible</option><option value="hidden">hidden</option></select></label>
          </div>
          <p id="runtime-token-visibility-note" class="muted">Per-viewer override wins over global fallback. A Character owner always sees their own token.</p>
          <div class="form-actions wrap">
            <button id="runtime-token-save-global" class="button button-small button-ghost" type="button">Save Global</button>
            <button id="runtime-token-save-viewer" class="button button-small" type="button">Save Viewer Override</button>
          </div>
          <div id="runtime-token-visibility-list" class="stack-list"></div>
        </section>

        <section class="panel">
          <h4>Positions</h4>
          <div id="runtime-position-list" class="stack-list"></div>
        </section>
      </aside>
    </div>
  </section>`;
}

function ensurePanel() {
  ensureStylesheet();
  const view = $('#view-world-map');
  if (!view || $('#runtime-map-panel')) return;
  view.insertAdjacentHTML('beforeend', panelMarkup());
  $('#runtime-map-refresh')?.addEventListener('click', () => loadRuntimeOverview());
  $('#runtime-bound-scenes')?.addEventListener('click', handleOverviewClick);
  $('#runtime-map-list')?.addEventListener('click', handleOverviewClick);
  $('#runtime-map-detail-reload')?.addEventListener('click', () => runtimeDetailState && openRuntimeMap(runtimeDetailState.mapInstance.id));
  $('#runtime-map-detail-close')?.addEventListener('click', closeDetail);
  $('#runtime-map-close-run')?.addEventListener('click', closeRuntimeMap);
  $('#runtime-map-grid')?.addEventListener('click', handleGridClick);
  $('#runtime-map-entity')?.addEventListener('change', event => {
    selectedEntityKey = event.target.value || '';
    renderRuntimeGrid();
    renderPositions();
    renderVisibilityControls();
  });
  $('#runtime-map-place-spawn')?.addEventListener('click', placeAtSpawn);
  $('#runtime-map-unplace')?.addEventListener('click', unplaceSelected);
  $('#runtime-token-viewer')?.addEventListener('change', syncViewerOverrideControl);
  $('#runtime-token-save-global')?.addEventListener('click', saveGlobalVisibility);
  $('#runtime-token-save-viewer')?.addEventListener('click', saveViewerVisibility);
  queueMicrotask(() => loadRuntimeOverview({ quiet: true }));
}

function setStatus(message = '', kind = '') {
  const box = $('#runtime-map-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function runtimeForScene(sceneId) {
  return (runtimeOverviewState?.mapInstances || []).filter(map => map.sceneId === sceneId && map.status === 'active');
}

function renderBoundScenes() {
  const target = $('#runtime-bound-scenes');
  const scenes = runtimeOverviewState?.boundScenes || [];
  if (!scenes.length) {
    target.innerHTML = emptyState('No Scene Map bindings', 'Bind a Scene to a Structured Map Template first.');
    return;
  }
  target.innerHTML = scenes.map(scene => {
    const active = runtimeForScene(scene.sceneId).length;
    return `<article class="stack-item runtime-scene-row">
      <div>
        <div class="row-inline"><strong>${escapeHtml(scene.scenarioName)} → ${escapeHtml(scene.sceneName)}</strong>${active ? `<span class="status-pill">${active} active runtime</span>` : ''}</div>
        <p>${escapeHtml(scene.locationName)} · ${escapeHtml(scene.mapTemplateName)} v${scene.mapVersion} · ${scene.width}×${scene.height}</p>
      </div>
      <button class="button button-small" type="button" data-runtime-action="start" data-scene-id="${escapeHtml(scene.sceneId)}">Start Runtime</button>
    </article>`;
  }).join('');
}

function renderRuntimeList() {
  const target = $('#runtime-map-list');
  const maps = runtimeOverviewState?.mapInstances || [];
  if (!maps.length) {
    target.innerHTML = emptyState('No Runtime Maps', 'Start a Scene Runtime to create an isolated play snapshot.');
    return;
  }
  target.innerHTML = maps.map(map => `<article class="stack-item runtime-instance-row">
    <div>
      <div class="row-inline"><strong>${escapeHtml(map.scenarioName)} → ${escapeHtml(map.sceneName)}</strong><span class="status-pill">${escapeHtml(map.status)}</span></div>
      <p>${escapeHtml(map.locationName)} · ${escapeHtml(map.mapName)} snapshot v${map.sourceMapVersion} · ${map.positionCount} positioned</p>
    </div>
    <button class="button button-small button-ghost" type="button" data-runtime-action="open" data-map-instance-id="${escapeHtml(map.id)}">Open Runtime</button>
  </article>`).join('');
}

function renderOverview() {
  renderBoundScenes();
  renderRuntimeList();
}

async function loadRuntimeOverview({ quiet = false } = {}) {
  if (!quiet) setStatus('Loading Runtime Maps…');
  try {
    runtimeOverviewState = await api('/api/gm/world/runtime');
    renderOverview();
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function handleOverviewClick(event) {
  const button = event.target.closest?.('[data-runtime-action]');
  if (!button) return;
  button.disabled = true;
  try {
    if (button.dataset.runtimeAction === 'start') {
      const payload = await api('/api/gm/world/runtime/scene-runs', {
        method: 'POST',
        body: JSON.stringify({ sceneId: button.dataset.sceneId })
      });
      runtimeDetailState = payload;
      await loadRuntimeOverview({ quiet: true });
      renderDetail();
      toast('Scene Runtime instantiated from Map snapshot.', 'success');
    } else if (button.dataset.runtimeAction === 'open') {
      await openRuntimeMap(button.dataset.mapInstanceId);
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function edgeSlotForCell(x, y, direction) {
  const width = runtimeDetailState?.mapInstance?.width || 0;
  const height = runtimeDetailState?.mapInstance?.height || 0;
  if (direction === 'E' && x < width - 1) return { x: x + 1, y, direction: 'W' };
  if (direction === 'S' && y < height - 1) return { x, y: y + 1, direction: 'N' };
  return { x, y, direction };
}

function runtimeEdgeAt(x, y, direction) {
  const slot = edgeSlotForCell(x, y, direction);
  return (runtimeDetailState?.edges || []).find(edge => edge.x === slot.x && edge.y === slot.y && edge.direction === slot.direction) || null;
}

function cellOverride(x, y) {
  return (runtimeDetailState?.cells || []).find(cell => cell.x === x && cell.y === y) || null;
}

function cellWalkable(x, y) {
  return cellOverride(x, y)?.isWalkable !== false;
}

function positionsAt(x, y) {
  return (runtimeDetailState?.positions || []).filter(position => position.x === x && position.y === y);
}

function spawnsAt(x, y) {
  return (runtimeDetailState?.spawnPoints || []).filter(spawn => spawn.enabled && spawn.x === x && spawn.y === y);
}

function zonesAt(x, y) {
  return (runtimeDetailState?.zones || []).filter(zone => zone.cells?.some(cell => cell.x === x && cell.y === y));
}

function runtimeCellClasses(x, y) {
  const classes = ['runtime-map-cell'];
  if (!cellWalkable(x, y)) classes.push('blocked');
  if (positionsAt(x, y).length) classes.push('occupied');
  if (spawnsAt(x, y).length) classes.push('has-spawn');
  if (zonesAt(x, y).length) classes.push('in-zone');
  for (const direction of ['N', 'E', 'S', 'W']) {
    const edge = runtimeEdgeAt(x, y, direction);
    if (!edge) continue;
    classes.push(`edge-${direction.toLowerCase()}`);
    if (edge.edgeType === 'door') classes.push(`door-${direction.toLowerCase()}`);
    if (edge.edgeType === 'door' && (edge.doorState === 'open' || edge.doorState === 'broken')) classes.push(`door-passable-${direction.toLowerCase()}`);
  }
  return classes.join(' ');
}

function entityInitials(position) {
  const label = position.displayName || position.entityId;
  const words = label.split(/\s+/).filter(Boolean);
  return escapeHtml((words.length > 1 ? `${words[0][0]}${words[1][0]}` : label.slice(0, 2)).toUpperCase());
}

function renderRuntimeGrid() {
  const grid = $('#runtime-map-grid');
  if (!grid || !runtimeDetailState) return;
  const { width, height } = runtimeDetailState.mapInstance;
  grid.style.gridTemplateColumns = `repeat(${width}, var(--runtime-map-cell-size))`;
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const positions = positionsAt(x, y);
      const spawns = spawnsAt(x, y);
      const zones = zonesAt(x, y);
      const labels = [`(${x}, ${y})`, cellWalkable(x, y) ? 'walkable' : 'blocked'];
      if (positions.length) labels.push(`Entities: ${positions.map(position => position.displayName).join(', ')}`);
      if (spawns.length) labels.push(`Spawn: ${spawns.map(spawn => spawn.name).join(', ')}`);
      if (zones.length) labels.push(`Zones: ${zones.map(zone => zone.name).join(', ')}`);
      const tokens = positions.map(position => `<span class="runtime-map-token ${selectedEntityKey === `${position.entityType}:${position.entityId}` ? 'selected' : ''}" title="${escapeHtml(position.displayName)}">${entityInitials(position)}</span>`).join('');
      cells.push(`<button type="button" class="${runtimeCellClasses(x, y)}" data-runtime-cell data-x="${x}" data-y="${y}" title="${escapeHtml(labels.join(' · '))}" aria-label="${escapeHtml(labels.join(', '))}" ${runtimeDetailState.mapInstance.status === 'active' && cellWalkable(x, y) ? '' : 'disabled'}>${tokens}</button>`);
    }
  }
  grid.innerHTML = cells.join('');
}

function selectedPosition() {
  const entity = selectedEntity();
  if (!entity) return null;
  return (runtimeDetailState?.positions || []).find(position => position.entityType === entity.entityType && position.entityId === entity.entityId) || null;
}

function visibilityOverrideFor(positionId, viewerUserId) {
  return (runtimeDetailState?.visibilityOverrides || []).find(item => item.positionId === positionId && item.viewerUserId === viewerUserId) || null;
}

function renderEntitySelect() {
  const select = $('#runtime-map-entity');
  if (!select || !runtimeDetailState) return;
  const entities = runtimeDetailState.availableEntities || [];
  if (!entities.length) {
    select.innerHTML = '<option value="">No available entities</option>';
    selectedEntityKey = '';
    return;
  }
  const validKeys = new Set(entities.map(entity => `${entity.entityType}:${entity.id}`));
  if (!validKeys.has(selectedEntityKey)) selectedEntityKey = `${entities[0].entityType}:${entities[0].id}`;
  select.innerHTML = entities.map(entity => {
    const key = `${entity.entityType}:${entity.id}`;
    const type = entity.entityType === 'monster_instance' ? 'Monster' : entity.entityType === 'boss_instance' ? 'Boss' : 'Character';
    return `<option value="${escapeHtml(key)}" ${key === selectedEntityKey ? 'selected' : ''}>${escapeHtml(type)} · ${escapeHtml(entity.name)} · ${escapeHtml(entity.status || '')}</option>`;
  }).join('');
  const position = selectedPosition();
  if ($('#runtime-map-visibility')) $('#runtime-map-visibility').value = position?.visibilityMode || 'default';
}

function renderSpawnSelect() {
  const select = $('#runtime-map-spawn');
  if (!select || !runtimeDetailState) return;
  const spawns = (runtimeDetailState.spawnPoints || []).filter(spawn => spawn.enabled);
  select.innerHTML = spawns.length
    ? spawns.map(spawn => `<option value="${escapeHtml(spawn.id)}">${escapeHtml(spawn.name)} · ${escapeHtml(spawn.spawnType)} · (${spawn.x}, ${spawn.y})</option>`).join('')
    : '<option value="">No enabled Spawn Points</option>';
  $('#runtime-map-place-spawn').disabled = !spawns.length || runtimeDetailState.mapInstance.status !== 'active';
}

function renderPositions() {
  const target = $('#runtime-position-list');
  if (!target || !runtimeDetailState) return;
  const positions = runtimeDetailState.positions || [];
  if (!positions.length) {
    target.innerHTML = '<p class="muted">No Entities positioned yet.</p>';
    return;
  }
  target.innerHTML = positions.map(position => {
    const key = `${position.entityType}:${position.entityId}`;
    return `<button type="button" class="runtime-position-row ${key === selectedEntityKey ? 'selected' : ''}" data-select-runtime-entity="${escapeHtml(key)}">
      <span><strong>${escapeHtml(position.displayName)}</strong><small>${escapeHtml(position.entityType)}</small></span>
      <span>(${position.x}, ${position.y}) · ${escapeHtml(position.visibilityMode)}</span>
    </button>`;
  }).join('');
  target.querySelectorAll('[data-select-runtime-entity]').forEach(button => button.addEventListener('click', () => {
    selectedEntityKey = button.dataset.selectRuntimeEntity || '';
    renderEntitySelect();
    renderPositions();
    renderRuntimeGrid();
    renderVisibilityControls();
  }));
}

function syncViewerOverrideControl() {
  const position = selectedPosition();
  const viewerSelect = $('#runtime-token-viewer');
  const modeSelect = $('#runtime-token-viewer-mode');
  const saveButton = $('#runtime-token-save-viewer');
  const note = $('#runtime-token-visibility-note');
  if (!position || !viewerSelect || !modeSelect || !saveButton || !note) return;
  const viewerUserId = viewerSelect.value || '';
  const ownViewer = Boolean(position.ownerUserId && viewerUserId === position.ownerUserId);
  const override = visibilityOverrideFor(position.id, viewerUserId);
  modeSelect.value = override?.visibilityMode || 'inherit';
  modeSelect.disabled = !viewerUserId || ownViewer || runtimeDetailState?.mapInstance?.status !== 'active';
  saveButton.disabled = modeSelect.disabled;
  note.textContent = ownViewer
    ? 'Own Character token is always visible to its owner; no override is needed or allowed.'
    : 'Per-viewer override wins over global fallback. Clear it with “inherit global”.';
}

function renderVisibilityControls() {
  const position = selectedPosition();
  const summary = $('#runtime-token-visibility-summary');
  const globalSelect = $('#runtime-token-global');
  const viewerSelect = $('#runtime-token-viewer');
  const globalButton = $('#runtime-token-save-global');
  const list = $('#runtime-token-visibility-list');
  if (!summary || !globalSelect || !viewerSelect || !globalButton || !list) return;

  if (!position) {
    summary.textContent = 'Select a positioned Entity. Per-viewer visibility belongs to the runtime token, not the reusable Map Template.';
    globalSelect.value = 'default';
    globalSelect.disabled = true;
    globalButton.disabled = true;
    viewerSelect.innerHTML = '<option value="">Position required</option>';
    viewerSelect.disabled = true;
    $('#runtime-token-viewer-mode').disabled = true;
    $('#runtime-token-save-viewer').disabled = true;
    list.innerHTML = '<p class="muted">No positioned token selected.</p>';
    return;
  }

  summary.textContent = `${position.displayName} · ${position.entityType} · (${position.x}, ${position.y})`;
  globalSelect.value = position.visibilityMode || 'default';
  const active = runtimeDetailState?.mapInstance?.status === 'active';
  globalSelect.disabled = !active;
  globalButton.disabled = !active;

  const viewers = runtimeDetailState?.playerViewers || [];
  if (!viewers.length) {
    viewerSelect.innerHTML = '<option value="">No positioned Player viewers</option>';
    viewerSelect.disabled = true;
    $('#runtime-token-viewer-mode').disabled = true;
    $('#runtime-token-save-viewer').disabled = true;
  } else {
    const priorViewer = viewerSelect.value || '';
    viewerSelect.innerHTML = viewers.map(viewer => `<option value="${escapeHtml(viewer.userId)}">${escapeHtml(viewer.displayName)}${position.ownerUserId === viewer.userId ? ' · owner' : ''}</option>`).join('');
    if (viewers.some(viewer => viewer.userId === priorViewer)) viewerSelect.value = priorViewer;
    viewerSelect.disabled = !active;
    syncViewerOverrideControl();
  }

  const overrides = (runtimeDetailState?.visibilityOverrides || []).filter(item => item.positionId === position.id);
  list.innerHTML = overrides.length
    ? overrides.map(item => `<div class="runtime-position-row"><span><strong>${escapeHtml(item.viewerDisplayName)}</strong><small>viewer override</small></span><span>${escapeHtml(item.visibilityMode)}</span></div>`).join('')
    : '<p class="muted">No per-viewer overrides; global fallback applies.</p>';
}

function renderDetail() {
  if (!runtimeDetailState?.mapInstance) return;
  const map = runtimeDetailState.mapInstance;
  $('#runtime-map-detail')?.classList.remove('hidden');
  $('#runtime-map-title').textContent = `${map.scenarioName} → ${map.sceneName}`;
  $('#runtime-map-meta').textContent = `${map.locationName} · ${map.mapName} snapshot v${map.sourceMapVersion} · ${map.width}×${map.height} · ${map.status}`;
  renderEntitySelect();
  renderSpawnSelect();
  renderPositions();
  renderRuntimeGrid();
  renderVisibilityControls();
  $('#runtime-map-close-run').disabled = map.status !== 'active';
  $('#runtime-map-unplace').disabled = map.status !== 'active';
  $('#runtime-map-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function openRuntimeMap(mapInstanceId) {
  runtimeDetailState = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
  renderDetail();
}

function selectedEntity() {
  if (!selectedEntityKey.includes(':')) return null;
  const [entityType, ...parts] = selectedEntityKey.split(':');
  return { entityType, entityId: parts.join(':') };
}

async function placeSelected(payload) {
  const entity = selectedEntity();
  if (!entity || !runtimeDetailState?.mapInstance) throw new Error('Select an Entity first.');
  const visibilityMode = $('#runtime-map-visibility')?.value || 'default';
  const allowOccupied = Boolean($('#runtime-map-allow-overlap')?.checked);
  await api(`/api/gm/world/runtime/maps/${encodeURIComponent(runtimeDetailState.mapInstance.id)}/entities/${encodeURIComponent(entity.entityType)}/${encodeURIComponent(entity.entityId)}/position`, {
    method: 'PUT',
    body: JSON.stringify({ ...payload, visibilityMode, allowOccupied })
  });
  await openRuntimeMap(runtimeDetailState.mapInstance.id);
  await loadRuntimeOverview({ quiet: true });
}

async function saveGlobalVisibility() {
  const entity = selectedEntity();
  const position = selectedPosition();
  if (!entity || !position || !runtimeDetailState?.mapInstance) return toast('Select a positioned Entity first.', 'error');
  const button = $('#runtime-token-save-global');
  button.disabled = true;
  try {
    await api(`/api/gm/world/runtime/maps/${encodeURIComponent(runtimeDetailState.mapInstance.id)}/entities/${encodeURIComponent(entity.entityType)}/${encodeURIComponent(entity.entityId)}/position`, {
      method: 'PUT',
      body: JSON.stringify({
        x: position.x,
        y: position.y,
        visibilityMode: $('#runtime-token-global')?.value || 'default',
        allowOccupied: false
      })
    });
    await openRuntimeMap(runtimeDetailState.mapInstance.id);
    toast('Global token visibility updated.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = runtimeDetailState?.mapInstance?.status !== 'active';
  }
}

async function saveViewerVisibility() {
  const entity = selectedEntity();
  const position = selectedPosition();
  const viewerUserId = $('#runtime-token-viewer')?.value || '';
  const mode = $('#runtime-token-viewer-mode')?.value || 'inherit';
  if (!entity || !position || !viewerUserId || !runtimeDetailState?.mapInstance) return toast('Select a positioned Entity and Player viewer first.', 'error');
  if (position.ownerUserId && viewerUserId === position.ownerUserId) return toast('Own Character token is always visible to its owner.', 'error');
  const button = $('#runtime-token-save-viewer');
  button.disabled = true;
  try {
    const path = `/api/gm/world/runtime/maps/${encodeURIComponent(runtimeDetailState.mapInstance.id)}/entities/${encodeURIComponent(entity.entityType)}/${encodeURIComponent(entity.entityId)}/visibility/${encodeURIComponent(viewerUserId)}`;
    if (mode === 'inherit') {
      await api(path, { method: 'DELETE' });
    } else {
      await api(path, { method: 'PUT', body: JSON.stringify({ visibilityMode: mode }) });
    }
    await openRuntimeMap(runtimeDetailState.mapInstance.id);
    toast(mode === 'inherit' ? 'Viewer override cleared; global visibility applies.' : `Viewer override set to ${mode}.`, 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    syncViewerOverrideControl();
  }
}

async function handleGridClick(event) {
  const cell = event.target.closest?.('[data-runtime-cell]');
  if (!cell || !runtimeDetailState || runtimeDetailState.mapInstance.status !== 'active') return;
  try {
    await placeSelected({ x: Number(cell.dataset.x), y: Number(cell.dataset.y) });
    toast('Entity position updated.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function placeAtSpawn() {
  const spawnPointId = $('#runtime-map-spawn')?.value || '';
  if (!spawnPointId) return toast('Select a Spawn Point first.', 'error');
  try {
    await placeSelected({ spawnPointId });
    toast('Entity placed at Spawn Point.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function unplaceSelected() {
  const entity = selectedEntity();
  if (!entity || !runtimeDetailState?.mapInstance) return toast('Select an Entity first.', 'error');
  try {
    await api(`/api/gm/world/runtime/maps/${encodeURIComponent(runtimeDetailState.mapInstance.id)}/entities/${encodeURIComponent(entity.entityType)}/${encodeURIComponent(entity.entityId)}/position`, {
      method: 'DELETE'
    });
    await openRuntimeMap(runtimeDetailState.mapInstance.id);
    await loadRuntimeOverview({ quiet: true });
    toast('Entity removed from Runtime Map.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function closeRuntimeMap() {
  if (!runtimeDetailState?.mapInstance) return;
  const button = $('#runtime-map-close-run');
  button.disabled = true;
  try {
    await api(`/api/gm/world/runtime/maps/${encodeURIComponent(runtimeDetailState.mapInstance.id)}/close`, {
      method: 'POST',
      body: JSON.stringify({ completeScenarioRun: false })
    });
    await openRuntimeMap(runtimeDetailState.mapInstance.id);
    await loadRuntimeOverview({ quiet: true });
    toast('Runtime Map closed; snapshot and positions preserved for audit.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = runtimeDetailState?.mapInstance?.status !== 'active';
  }
}

function closeDetail() {
  $('#runtime-map-detail')?.classList.add('hidden');
  runtimeDetailState = null;
  selectedEntityKey = '';
}

const observer = new MutationObserver(() => ensurePanel());
observer.observe(document.documentElement, { childList: true, subtree: true });
ensurePanel();
