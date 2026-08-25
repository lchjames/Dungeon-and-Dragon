import { $, escapeHtml, toast } from './common.js';

let editorState = null;
let selectedCell = null;
let editorMode = 'select';
let activeZoneId = '';

function ensureStylesheet() {
  if (document.querySelector('link[href="/assets/gm-map-editor.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/gm-map-editor.css';
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

function editorMarkup() {
  return `<section id="map-grid-editor-panel" class="panel hidden">
    <div class="map-editor-shell">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">STRUCTURED MAP EDITOR</p>
          <h3 id="map-editor-title">Map Grid</h3>
          <p id="map-editor-meta" class="muted">Select a Map Template.</p>
        </div>
        <div class="row-inline">
          <button id="map-editor-reload" class="button button-small button-ghost" type="button">Reload Grid</button>
          <button id="map-editor-save" class="button button-small" type="button">Save Grid</button>
          <button id="map-editor-close" class="icon-button" type="button" aria-label="Close Map editor">×</button>
        </div>
      </div>
      <div id="map-editor-status" class="auth-status" hidden role="status" aria-live="polite"></div>

      <div class="map-editor-toolbar" aria-label="Map editing tools">
        <button class="button button-small button-ghost active" type="button" data-map-tool="select">Select</button>
        <button class="button button-small button-ghost" type="button" data-map-tool="blocked">Paint Blocked</button>
        <button class="button button-small button-ghost" type="button" data-map-tool="walkable">Paint Walkable</button>
        <button class="button button-small button-ghost" type="button" data-map-tool="zone">Paint Zone</button>
        <button class="button button-small button-ghost" type="button" data-map-tool="spawn">Place Spawn</button>
      </div>

      <div class="map-editor-legend">
        <span><i></i> Walkable</span>
        <span><i style="background-image:repeating-linear-gradient(45deg,transparent,transparent 3px,currentColor 3px,currentColor 4px)"></i> Blocked</span>
        <span>● Spawn</span>
        <span>D Door edge</span>
      </div>

      <div class="map-editor-layout">
        <div class="map-editor-scroll">
          <div id="map-editor-grid" class="map-editor-grid" role="grid" aria-label="Map Template grid"></div>
        </div>

        <aside class="map-editor-inspector">
          <section class="panel">
            <h4>Selected Cell</h4>
            <div id="map-cell-inspector" class="stack-list"><p class="muted">Select a Cell.</p></div>
          </section>

          <section class="panel">
            <div class="panel-heading"><div><h4>Zones</h4><span class="muted">Zone Paint toggles membership.</span></div></div>
            <div class="form-grid compact-grid">
              <label class="field"><span>Active Zone</span><select id="map-editor-zone-select" class="input"></select></label>
              <label class="field"><span>Zone Name</span><input id="map-editor-zone-name" class="input" maxlength="120"></label>
              <label class="field"><span>Zone Type</span><select id="map-editor-zone-type" class="input"><option value="area">area</option><option value="room">room</option><option value="trigger">trigger</option><option value="custom">custom</option></select></label>
              <label class="check-field"><input id="map-editor-zone-visible" type="checkbox" checked> Player visible by default</label>
            </div>
            <div class="form-actions wrap">
              <button id="map-editor-zone-new" class="button button-small button-ghost" type="button">+ New Zone</button>
              <button id="map-editor-zone-update" class="button button-small button-ghost" type="button">Update Zone</button>
              <button id="map-editor-zone-remove" class="button button-small button-danger-soft" type="button">Remove Zone</button>
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading"><div><h4>Spawn Tool</h4><span class="muted">Click a walkable Cell to place/update by name.</span></div></div>
            <div class="form-grid compact-grid">
              <label class="field"><span>Spawn Name</span><input id="map-editor-spawn-name" class="input" maxlength="120" placeholder="e.g. Player Start A"></label>
              <label class="field"><span>Spawn Type</span><select id="map-editor-spawn-type" class="input"><option value="any">any</option><option value="character">character</option><option value="monster">monster</option><option value="boss">boss</option></select></label>
            </div>
            <div id="map-editor-spawn-list" class="stack-list" style="margin-top:10px"></div>
          </section>
        </aside>
      </div>
    </div>
  </section>`;
}

function ensurePanel() {
  ensureStylesheet();
  const view = $('#view-world-map');
  if (!view || $('#map-grid-editor-panel')) return;
  view.insertAdjacentHTML('beforeend', editorMarkup());
  $('#map-editor-close')?.addEventListener('click', closeEditor);
  $('#map-editor-reload')?.addEventListener('click', () => editorState && openEditor(editorState.mapTemplate.id));
  $('#map-editor-save')?.addEventListener('click', saveEditor);
  $('#map-editor-zone-new')?.addEventListener('click', createZoneLocal);
  $('#map-editor-zone-update')?.addEventListener('click', updateZoneLocal);
  $('#map-editor-zone-remove')?.addEventListener('click', removeZoneLocal);
  $('#map-editor-zone-select')?.addEventListener('change', event => {
    activeZoneId = event.target.value || '';
    syncZoneFields();
    renderGrid();
  });
  document.querySelectorAll('[data-map-tool]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mapTool)));
  $('#map-editor-grid')?.addEventListener('click', handleGridClick);
  $('#map-cell-inspector')?.addEventListener('change', handleInspectorChange);
  $('#map-cell-inspector')?.addEventListener('click', handleInspectorClick);
  $('#map-editor-spawn-list')?.addEventListener('click', handleSpawnListClick);
}

function augmentMapCards() {
  ensurePanel();
  document.querySelectorAll('[data-map-row]').forEach(row => {
    if (row.querySelector('[data-open-map-grid]')) return;
    const mapId = row.dataset.mapRow;
    const heading = row.querySelector('.panel-heading');
    if (!heading) return;
    const actions = document.createElement('div');
    actions.className = 'row-inline';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-small button-ghost';
    button.dataset.openMapGrid = mapId;
    button.textContent = 'Edit Grid';
    actions.append(button);
    heading.append(actions);
  });
}

function setEditorStatus(message = '', kind = '') {
  const box = $('#map-editor-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function edgeKey(x, y, direction) {
  return `${x},${y},${direction}`;
}

function canonicalEdgeSlot(x, y, direction) {
  const width = editorState?.mapTemplate?.width || 0;
  const height = editorState?.mapTemplate?.height || 0;
  if (direction === 'E' && x < width - 1) return { x: x + 1, y, direction: 'W' };
  if (direction === 'S' && y < height - 1) return { x, y: y + 1, direction: 'N' };
  return { x, y, direction };
}

function cellOverride(x, y) {
  return editorState?.cells?.find(cell => cell.x === x && cell.y === y) || null;
}

function isWalkable(x, y) {
  return cellOverride(x, y)?.isWalkable !== false;
}

function setCellWalkable(x, y, walkable) {
  const key = cellKey(x, y);
  const index = editorState.cells.findIndex(cell => cellKey(cell.x, cell.y) === key);
  if (walkable) {
    if (index >= 0) {
      const current = editorState.cells[index];
      current.isWalkable = true;
      if ((current.terrainKey || 'floor') === 'floor' && !current.gmNotes) editorState.cells.splice(index, 1);
    }
  } else if (index >= 0) {
    editorState.cells[index].isWalkable = false;
  } else {
    editorState.cells.push({ x, y, isWalkable: false, terrainKey: 'floor', gmNotes: '' });
  }
  // A blocked Cell cannot keep a spawn point.
  if (!walkable) editorState.spawnPoints = editorState.spawnPoints.filter(spawn => spawn.x !== x || spawn.y !== y);
}

function edgeAt(x, y, direction) {
  const slot = canonicalEdgeSlot(x, y, direction);
  const key = edgeKey(slot.x, slot.y, slot.direction);
  return editorState?.edges?.find(edge => edgeKey(edge.x, edge.y, edge.direction) === key) || null;
}

function setEdge(x, y, direction, type, doorState = 'closed') {
  const slot = canonicalEdgeSlot(x, y, direction);
  const key = edgeKey(slot.x, slot.y, slot.direction);
  const index = editorState.edges.findIndex(edge => edgeKey(edge.x, edge.y, edge.direction) === key);
  if (!type || type === 'none') {
    if (index >= 0) editorState.edges.splice(index, 1);
    return;
  }
  const existing = index >= 0 ? editorState.edges[index] : null;
  const next = {
    id: existing?.id || `edge_${crypto.randomUUID()}`,
    x: slot.x,
    y: slot.y,
    direction: slot.direction,
    edgeType: type,
    blocksMovement: type === 'wall' || doorState === 'closed' || doorState === 'locked',
    doorDefaultState: type === 'door' ? doorState : null,
    gmNotes: existing?.gmNotes || ''
  };
  if (index >= 0) editorState.edges[index] = next;
  else editorState.edges.push(next);
}

function zoneById(id) {
  return editorState?.zones?.find(zone => zone.id === id) || null;
}

function zoneHasCell(zone, x, y) {
  return Boolean(zone?.cells?.some(cell => cell.x === x && cell.y === y));
}

function toggleZoneCell(zone, x, y) {
  if (!zone) return;
  const index = zone.cells.findIndex(cell => cell.x === x && cell.y === y);
  if (index >= 0) zone.cells.splice(index, 1);
  else zone.cells.push({ x, y });
}

function spawnsAt(x, y) {
  return (editorState?.spawnPoints || []).filter(spawn => spawn.x === x && spawn.y === y);
}

function cellClasses(x, y) {
  const classes = ['map-editor-cell'];
  if (!isWalkable(x, y)) classes.push('blocked');
  if (selectedCell?.x === x && selectedCell?.y === y) classes.push('selected');
  const zone = zoneById(activeZoneId);
  if (zoneHasCell(zone, x, y)) classes.push('in-zone');
  if (spawnsAt(x, y).length) classes.push('has-spawn');
  for (const direction of ['N', 'E', 'S', 'W']) {
    const edge = edgeAt(x, y, direction);
    if (!edge) continue;
    classes.push(`edge-${direction.toLowerCase()}`);
    if (edge.edgeType === 'door') classes.push(`door-${direction.toLowerCase()}`);
  }
  return classes.join(' ');
}

function renderGrid() {
  const grid = $('#map-editor-grid');
  if (!grid || !editorState) return;
  const { width, height } = editorState.mapTemplate;
  grid.style.gridTemplateColumns = `repeat(${width}, var(--map-cell-size))`;
  const activeZone = zoneById(activeZoneId);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const labels = [`(${x}, ${y})`, isWalkable(x, y) ? 'walkable' : 'blocked'];
      if (activeZone && zoneHasCell(activeZone, x, y)) labels.push(`Zone: ${activeZone.name}`);
      const spawns = spawnsAt(x, y);
      if (spawns.length) labels.push(`Spawn: ${spawns.map(spawn => spawn.name).join(', ')}`);
      cells.push(`<button type="button" class="${cellClasses(x, y)}" role="gridcell" data-map-cell data-x="${x}" data-y="${y}" title="${escapeHtml(labels.join(' · '))}" aria-label="${escapeHtml(labels.join(', '))}"></button>`);
    }
  }
  grid.innerHTML = cells.join('');
  renderInspector();
  renderSpawnList();
}

function renderInspector() {
  const target = $('#map-cell-inspector');
  if (!target) return;
  if (!editorState || !selectedCell) {
    target.innerHTML = '<p class="muted">Select a Cell.</p>';
    return;
  }
  const { x, y } = selectedCell;
  const override = cellOverride(x, y);
  const edgeRows = ['N', 'E', 'S', 'W'].map(direction => {
    const edge = edgeAt(x, y, direction);
    const type = edge?.edgeType || 'none';
    const state = edge?.doorDefaultState || 'closed';
    return `<div class="map-edge-row" data-edge-row="${direction}">
      <strong>${direction}</strong>
      <select class="input" data-edge-type="${direction}">
        <option value="none" ${type === 'none' ? 'selected' : ''}>none</option>
        <option value="wall" ${type === 'wall' ? 'selected' : ''}>wall</option>
        <option value="door" ${type === 'door' ? 'selected' : ''}>door</option>
      </select>
      <select class="input" data-edge-door-state="${direction}" ${type === 'door' ? '' : 'disabled'}>
        <option value="open" ${state === 'open' ? 'selected' : ''}>open</option>
        <option value="closed" ${state === 'closed' ? 'selected' : ''}>closed</option>
        <option value="locked" ${state === 'locked' ? 'selected' : ''}>locked</option>
        <option value="broken" ${state === 'broken' ? 'selected' : ''}>broken</option>
      </select>
    </div>`;
  }).join('');

  const localSpawns = spawnsAt(x, y);
  target.innerHTML = `
    <div class="row-inline"><strong>(${x}, ${y})</strong><span class="tag">${isWalkable(x, y) ? 'walkable' : 'blocked'}</span></div>
    <label class="check-field"><input data-cell-walkable type="checkbox" ${isWalkable(x, y) ? 'checked' : ''}> Walkable</label>
    <label class="field"><span>Terrain Key</span><input class="input" data-cell-terrain value="${escapeHtml(override?.terrainKey || 'floor')}" maxlength="80"></label>
    <label class="field"><span>GM Notes</span><textarea class="textarea" data-cell-notes rows="2" maxlength="1000">${escapeHtml(override?.gmNotes || '')}</textarea></label>
    <button class="button button-small button-ghost" type="button" data-apply-cell>Apply Cell Detail</button>
    <div><h4>Edges</h4>${edgeRows}</div>
    <div><h4>Spawns on Cell</h4>${localSpawns.length ? localSpawns.map(spawn => `<div class="row-inline"><span class="tag">${escapeHtml(spawn.spawnType)}</span><span>${escapeHtml(spawn.name)}</span></div>`).join('') : '<p class="muted">None.</p>'}</div>
  `;
}

function renderZoneControls() {
  const select = $('#map-editor-zone-select');
  if (!select || !editorState) return;
  const zones = editorState.zones || [];
  if (activeZoneId && !zoneById(activeZoneId)) activeZoneId = '';
  if (!activeZoneId && zones.length) activeZoneId = zones[0].id;
  select.innerHTML = zones.length
    ? zones.map(zone => `<option value="${escapeHtml(zone.id)}" ${zone.id === activeZoneId ? 'selected' : ''}>${escapeHtml(zone.name)} · ${escapeHtml(zone.zoneType)}</option>`).join('')
    : '<option value="">No Zones</option>';
  syncZoneFields();
}

function syncZoneFields() {
  const zone = zoneById(activeZoneId);
  const name = $('#map-editor-zone-name');
  const type = $('#map-editor-zone-type');
  const visible = $('#map-editor-zone-visible');
  if (name) name.value = zone?.name || '';
  if (type) type.value = zone?.zoneType || 'area';
  if (visible) visible.checked = zone?.playerVisibleDefault ?? true;
  if ($('#map-editor-zone-update')) $('#map-editor-zone-update').disabled = !zone;
  if ($('#map-editor-zone-remove')) $('#map-editor-zone-remove').disabled = !zone;
}

function renderSpawnList() {
  const target = $('#map-editor-spawn-list');
  if (!target || !editorState) return;
  const spawns = editorState.spawnPoints || [];
  target.innerHTML = spawns.length ? spawns.map(spawn => `<div class="map-spawn-row" data-spawn-row="${escapeHtml(spawn.id)}">
    <span class="tag">${escapeHtml(spawn.spawnType)}</span>
    <span>${escapeHtml(spawn.name)} (${spawn.x},${spawn.y})</span>
    <button class="button button-small button-danger-soft" type="button" data-remove-spawn="${escapeHtml(spawn.id)}">Remove</button>
  </div>`).join('') : '<p class="muted">No Spawn Points.</p>';
}

function setMode(mode) {
  editorMode = mode || 'select';
  document.querySelectorAll('[data-map-tool]').forEach(button => button.classList.toggle('active', button.dataset.mapTool === editorMode));
  if (editorMode === 'zone' && !activeZoneId) toast('Create a Zone first, then use Zone Paint.', 'error');
}

function handleGridClick(event) {
  const cell = event.target.closest?.('[data-map-cell]');
  if (!cell || !editorState) return;
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  selectedCell = { x, y };

  if (editorMode === 'blocked') {
    setCellWalkable(x, y, false);
  } else if (editorMode === 'walkable') {
    setCellWalkable(x, y, true);
  } else if (editorMode === 'zone') {
    const zone = zoneById(activeZoneId);
    if (!zone) return toast('Create or select a Zone first.', 'error');
    toggleZoneCell(zone, x, y);
  } else if (editorMode === 'spawn') {
    if (!isWalkable(x, y)) return toast('Spawn Point cannot be placed on a blocked Cell.', 'error');
    const name = ($('#map-editor-spawn-name')?.value || '').trim();
    if (!name) return toast('Enter Spawn Name first.', 'error');
    const spawnType = $('#map-editor-spawn-type')?.value || 'any';
    const existing = editorState.spawnPoints.find(spawn => spawn.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.spawnType = spawnType;
    } else {
      editorState.spawnPoints.push({
        id: `spawn_${crypto.randomUUID()}`,
        name,
        x,
        y,
        spawnType,
        gmNotes: ''
      });
    }
  }
  renderGrid();
}

function applyCellDetail() {
  if (!selectedCell || !editorState) return;
  const { x, y } = selectedCell;
  const walkable = Boolean($('[data-cell-walkable]')?.checked);
  const terrainKey = ($('[data-cell-terrain]')?.value || 'floor').trim() || 'floor';
  const gmNotes = ($('[data-cell-notes]')?.value || '').trim();
  const key = cellKey(x, y);
  const index = editorState.cells.findIndex(cell => cellKey(cell.x, cell.y) === key);
  if (walkable && terrainKey === 'floor' && !gmNotes) {
    if (index >= 0) editorState.cells.splice(index, 1);
  } else {
    const next = { x, y, isWalkable: walkable, terrainKey, gmNotes };
    if (index >= 0) editorState.cells[index] = next;
    else editorState.cells.push(next);
  }
  if (!walkable) editorState.spawnPoints = editorState.spawnPoints.filter(spawn => spawn.x !== x || spawn.y !== y);
  renderGrid();
}

function handleInspectorChange(event) {
  if (!selectedCell || !editorState) return;
  const typeSelect = event.target.closest?.('[data-edge-type]');
  if (typeSelect) {
    const direction = typeSelect.dataset.edgeType;
    const row = typeSelect.closest('[data-edge-row]');
    const stateSelect = row?.querySelector(`[data-edge-door-state="${direction}"]`);
    const state = stateSelect?.value || 'closed';
    setEdge(selectedCell.x, selectedCell.y, direction, typeSelect.value, state);
    renderGrid();
    return;
  }
  const doorState = event.target.closest?.('[data-edge-door-state]');
  if (doorState) {
    const direction = doorState.dataset.edgeDoorState;
    const edge = edgeAt(selectedCell.x, selectedCell.y, direction);
    if (edge?.edgeType === 'door') setEdge(selectedCell.x, selectedCell.y, direction, 'door', doorState.value);
    renderGrid();
  }
}

function handleInspectorClick(event) {
  if (event.target.closest?.('[data-apply-cell]')) applyCellDetail();
}

function createZoneLocal() {
  if (!editorState) return;
  const proposed = ($('#map-editor-zone-name')?.value || '').trim();
  const name = proposed || `Zone ${editorState.zones.length + 1}`;
  if (editorState.zones.some(zone => zone.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return toast('Zone Name must be unique.', 'error');
  }
  const zone = {
    id: `zone_${crypto.randomUUID()}`,
    name,
    zoneType: $('#map-editor-zone-type')?.value || 'area',
    playerVisibleDefault: Boolean($('#map-editor-zone-visible')?.checked),
    gmNotes: '',
    cells: []
  };
  editorState.zones.push(zone);
  activeZoneId = zone.id;
  renderZoneControls();
  renderGrid();
  setMode('zone');
}

function updateZoneLocal() {
  const zone = zoneById(activeZoneId);
  if (!zone) return;
  const name = ($('#map-editor-zone-name')?.value || '').trim();
  if (!name) return toast('Zone Name is required.', 'error');
  if (editorState.zones.some(other => other.id !== zone.id && other.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return toast('Zone Name must be unique.', 'error');
  }
  zone.name = name;
  zone.zoneType = $('#map-editor-zone-type')?.value || 'area';
  zone.playerVisibleDefault = Boolean($('#map-editor-zone-visible')?.checked);
  renderZoneControls();
  renderGrid();
}

function removeZoneLocal() {
  if (!activeZoneId || !editorState) return;
  editorState.zones = editorState.zones.filter(zone => zone.id !== activeZoneId);
  activeZoneId = editorState.zones[0]?.id || '';
  renderZoneControls();
  renderGrid();
}

function handleSpawnListClick(event) {
  const button = event.target.closest?.('[data-remove-spawn]');
  if (!button || !editorState) return;
  editorState.spawnPoints = editorState.spawnPoints.filter(spawn => spawn.id !== button.dataset.removeSpawn);
  renderGrid();
}

async function openEditor(mapId) {
  ensurePanel();
  const panel = $('#map-grid-editor-panel');
  panel?.classList.remove('hidden');
  setEditorStatus('Loading structured Map…');
  try {
    editorState = await api(`/api/gm/world/maps/${encodeURIComponent(mapId)}/editor`);
    selectedCell = null;
    activeZoneId = editorState.zones?.[0]?.id || '';
    editorMode = 'select';
    $('#map-editor-title').textContent = editorState.mapTemplate.name;
    $('#map-editor-meta').textContent = `${editorState.mapTemplate.locationName} · ${editorState.mapTemplate.width}×${editorState.mapTemplate.height} · Template v${editorState.mapTemplate.version}`;
    renderZoneControls();
    setMode('select');
    renderGrid();
    setEditorStatus('');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    editorState = null;
    setEditorStatus(error.message, 'error');
  }
}

function closeEditor() {
  editorState = null;
  selectedCell = null;
  activeZoneId = '';
  $('#map-grid-editor-panel')?.classList.add('hidden');
}

async function saveEditor() {
  if (!editorState) return;
  const button = $('#map-editor-save');
  button.disabled = true;
  setEditorStatus('Saving structured Map…');
  try {
    const payload = await api(`/api/gm/world/maps/${encodeURIComponent(editorState.mapTemplate.id)}/editor`, {
      method: 'PUT',
      body: JSON.stringify({
        expectedVersion: editorState.mapTemplate.version,
        cells: editorState.cells,
        edges: editorState.edges,
        zones: editorState.zones,
        spawnPoints: editorState.spawnPoints
      })
    });
    editorState.mapTemplate.version = payload.mapTemplate.version;
    editorState.mapTemplate.updatedAt = payload.mapTemplate.updatedAt;
    $('#map-editor-meta').textContent = `${editorState.mapTemplate.locationName} · ${editorState.mapTemplate.width}×${editorState.mapTemplate.height} · Template v${editorState.mapTemplate.version}`;
    setEditorStatus('Saved.', 'success');
    toast('Structured Map saved.', 'success');
    // Refresh the definition counters without coupling this editor to the parent module's private state.
    $('#world-map-refresh')?.click();
  } catch (error) {
    setEditorStatus(error.message, 'error');
    if (error.code === 'MAP_TEMPLATE_CHANGED') toast('Map changed elsewhere. Reload Grid before saving again.', 'error');
    else toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function onDocumentClick(event) {
  const open = event.target.closest?.('[data-open-map-grid]');
  if (open) {
    openEditor(open.dataset.openMapGrid);
  }
}

function initialise() {
  ensurePanel();
  augmentMapCards();
  document.addEventListener('click', onDocumentClick);
  const observer = new MutationObserver(() => augmentMapCards());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
else initialise();
