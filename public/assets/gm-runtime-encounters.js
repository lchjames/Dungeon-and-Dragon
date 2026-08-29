import { $, escapeHtml, toast, emptyState } from './common.js';

let maps = [];
let detail = null;
let monsters = null;
let selectedMapId = '';
let selectedEncounterId = '';

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
    error.payload = payload;
    throw error;
  }
  return payload;
}

function markup() {
  return `<section id="runtime-encounter-panel" class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">RUNTIME ENCOUNTER AUTHORITY</p>
        <h3>Encounter Spawn & Combat</h3>
        <p class="muted">Per-Scene-Run roster. Spawn creates a fresh Monster Instance, adds it to this Runtime Encounter, and places it on this Runtime Map.</p>
      </div>
      <button id="runtime-encounter-refresh" class="button button-small button-ghost" type="button">Refresh</button>
    </div>
    <div id="runtime-encounter-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Active Runtime Map</span><select id="runtime-encounter-map" class="input"></select></label>
      <label class="field"><span>Runtime Encounter</span><select id="runtime-encounter-select" class="input"></select></label>
    </div>

    <div class="split-grid">
      <section class="panel">
        <div class="panel-heading"><div><h4>Spawn Monster</h4><span class="muted">Fresh instance · same Runtime Map</span></div></div>
        <div class="form-grid compact-grid">
          <label class="field"><span>Monster Template</span><select id="runtime-encounter-template" class="input"></select></label>
          <label class="field"><span>Monster Spawn Point</span><select id="runtime-encounter-spawn" class="input"></select></label>
          <label class="field"><span>Level</span><input id="runtime-encounter-level" class="input" type="number" min="1" max="100" step="1" value="1"></label>
          <label class="field"><span>Display Name (optional)</span><input id="runtime-encounter-monster-name" class="input" maxlength="120" placeholder="Use Template name"></label>
        </div>
        <div class="form-actions wrap">
          <button id="runtime-encounter-spawn-monster" class="button" type="button">Spawn Monster</button>
        </div>
        <p class="muted">Spawn Point must be enabled and typed <code>monster</code> or <code>any</code>. Occupied / blocked Cells are rejected by the server.</p>
      </section>

      <section class="panel">
        <div class="panel-heading"><div><h4>Start Combat</h4><span class="muted">Uses Runtime participants + existing positions</span></div></div>
        <div id="runtime-encounter-summary" class="stack-list"></div>
        <div class="form-actions wrap">
          <button id="runtime-encounter-start-combat" class="button" type="button">Start Combat on This Map</button>
        </div>
        <p class="muted">Every participant must already have a position on this Runtime Map. This route does not write legacy Definition-level Encounter Combat state.</p>
      </section>
    </div>

    <section class="panel">
      <div class="panel-heading"><div><h4>Runtime Participants</h4><span class="muted">Frozen Character roster + fresh runtime spawns</span></div></div>
      <div id="runtime-encounter-participants" class="stack-list"></div>
    </section>
  </section>`;
}

function ensurePanel() {
  const view = $('#view-world-map');
  if (!view || $('#runtime-encounter-panel')) return;
  const doors = $('#runtime-door-panel');
  if (doors) doors.insertAdjacentHTML('afterend', markup());
  else view.insertAdjacentHTML('beforeend', markup());

  $('#runtime-encounter-refresh')?.addEventListener('click', () => loadAll());
  $('#runtime-encounter-map')?.addEventListener('change', async event => {
    selectedMapId = event.target.value || '';
    selectedEncounterId = '';
    await loadDetail();
  });
  $('#runtime-encounter-select')?.addEventListener('change', event => {
    selectedEncounterId = event.target.value || '';
    renderEncounter();
  });
  $('#runtime-encounter-spawn-monster')?.addEventListener('click', spawnMonster);
  $('#runtime-encounter-start-combat')?.addEventListener('click', startCombat);
  queueMicrotask(() => loadAll({ quiet: true }));
}

function setStatus(message = '', kind = '') {
  const box = $('#runtime-encounter-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function activeMaps() {
  return maps.filter(map => map.status === 'active');
}

function renderMapSelect() {
  const select = $('#runtime-encounter-map');
  if (!select) return;
  const active = activeMaps();
  if (!active.some(map => map.id === selectedMapId)) selectedMapId = active[0]?.id || '';
  select.innerHTML = active.length
    ? active.map(map => `<option value="${escapeHtml(map.id)}" ${map.id === selectedMapId ? 'selected' : ''}>${escapeHtml(map.scenarioName)} → ${escapeHtml(map.sceneName)} · ${escapeHtml(map.mapName)}</option>`).join('')
    : '<option value="">No active Runtime Map</option>';
  select.disabled = !active.length;
}

function currentEncounter() {
  return (detail?.runtimeEncounters || []).find(item => item.encounterId === selectedEncounterId) || null;
}

function renderEncounterSelect() {
  const select = $('#runtime-encounter-select');
  if (!select) return;
  const encounters = detail?.runtimeEncounters || [];
  if (!encounters.some(item => item.encounterId === selectedEncounterId)) {
    selectedEncounterId = encounters.find(item => item.status === 'active')?.encounterId || encounters[0]?.encounterId || '';
  }
  select.innerHTML = encounters.length
    ? encounters.map(item => `<option value="${escapeHtml(item.encounterId)}" ${item.encounterId === selectedEncounterId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.status)}</option>`).join('')
    : '<option value="">No Runtime Encounters</option>';
  select.disabled = !encounters.length;
}

function renderMonsterInputs() {
  const templateSelect = $('#runtime-encounter-template');
  const spawnSelect = $('#runtime-encounter-spawn');
  if (templateSelect) {
    const templates = (monsters?.templates || []).filter(item => item.isActive !== false);
    templateSelect.innerHTML = templates.length
      ? templates.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')
      : '<option value="">No active Monster Templates</option>';
    templateSelect.disabled = !templates.length;
  }
  if (spawnSelect) {
    const spawns = (detail?.spawnPoints || []).filter(item => item.enabled && (item.spawnType === 'any' || item.spawnType === 'monster'));
    spawnSelect.innerHTML = spawns.length
      ? spawns.map(item => `<option value="${escapeHtml(item.sourceSpawnPointId || '')}">${escapeHtml(item.name)} · (${item.x},${item.y}) · ${escapeHtml(item.spawnType)}</option>`).join('')
      : '<option value="">No enabled Monster Spawn Points</option>';
    spawnSelect.disabled = !spawns.length;
  }
}

function renderEncounter() {
  renderMonsterInputs();
  const encounter = currentEncounter();
  const summary = $('#runtime-encounter-summary');
  const participants = $('#runtime-encounter-participants');
  const spawnButton = $('#runtime-encounter-spawn-monster');
  const combatButton = $('#runtime-encounter-start-combat');

  if (!encounter) {
    if (summary) summary.innerHTML = emptyState('No Runtime Encounter', 'Create an Encounter in this Scene before starting the Runtime.');
    if (participants) participants.innerHTML = '<p class="muted">No Runtime participants.</p>';
    if (spawnButton) spawnButton.disabled = true;
    if (combatButton) combatButton.disabled = true;
    return;
  }

  const roster = encounter.participants || [];
  const positioned = new Set((detail?.positions || []).map(item => `${item.entityType}:${item.entityId}`));
  const missing = roster.filter(item => !positioned.has(`${item.entityType}:${item.entityId}`));
  if (summary) {
    summary.innerHTML = `<div class="stack-item"><div><strong>${escapeHtml(encounter.name)}</strong><p>Runtime ${escapeHtml(encounter.status)} · definition snapshot ${escapeHtml(encounter.definitionStatusSnapshot || '')}</p></div></div>
      <div class="stack-item"><div><strong>${roster.length} participants</strong><p>${missing.length ? `${missing.length} missing Map position` : 'All participants positioned on this Map'}</p></div></div>
      ${encounter.combat ? `<div class="stack-item"><div><strong>Combat linked</strong><p>${escapeHtml(encounter.combat.combatId)} · ${escapeHtml(encounter.combat.status || '')}</p></div></div>` : ''}`;
  }
  if (participants) {
    participants.innerHTML = roster.length
      ? roster.map(item => `<div class="stack-item"><div><strong>${escapeHtml(item.displayName || item.entityId)}</strong><p>${escapeHtml(item.entityType)} · ${escapeHtml(item.sourceKind || '')} · ${positioned.has(`${item.entityType}:${item.entityId}`) ? 'positioned' : 'NOT ON MAP'}</p><small class="muted">${escapeHtml(item.entityId)}</small></div></div>`).join('')
      : '<p class="muted">No Runtime participants.</p>';
  }

  const validTemplate = Boolean($('#runtime-encounter-template')?.value);
  const validSpawn = Boolean($('#runtime-encounter-spawn')?.value);
  if (spawnButton) spawnButton.disabled = encounter.status !== 'active' || Boolean(encounter.combat) || !validTemplate || !validSpawn;
  if (combatButton) combatButton.disabled = encounter.status !== 'active' || Boolean(encounter.combat) || !roster.some(item => item.entityType === 'character');
}

async function loadDetail({ quiet = false } = {}) {
  detail = null;
  if (!selectedMapId) {
    renderEncounterSelect();
    renderEncounter();
    return;
  }
  if (!quiet) setStatus('Loading Runtime Encounter…');
  try {
    detail = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(selectedMapId)}`);
    renderEncounterSelect();
    renderEncounter();
    if (!quiet) setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
    renderEncounter();
  }
}

async function loadAll({ quiet = false } = {}) {
  if (!quiet) setStatus('Loading Runtime Encounter workspace…');
  try {
    const [runtime, monsterOverview] = await Promise.all([
      api('/api/gm/world/runtime'),
      api('/api/gm/monsters')
    ]);
    maps = runtime.mapInstances || [];
    monsters = monsterOverview;
    renderMapSelect();
    await loadDetail({ quiet: true });
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function spawnMonster() {
  const encounter = currentEncounter();
  if (!encounter || !selectedMapId) return;
  const templateId = $('#runtime-encounter-template')?.value || '';
  const sourceSpawnPointId = $('#runtime-encounter-spawn')?.value || '';
  const level = Number($('#runtime-encounter-level')?.value || 1);
  const displayName = $('#runtime-encounter-monster-name')?.value?.trim() || '';
  const button = $('#runtime-encounter-spawn-monster');
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(selectedMapId)}/encounters/${encodeURIComponent(encounter.encounterId)}/monsters`, {
      method: 'POST',
      body: JSON.stringify({ templateId, sourceSpawnPointId, level, displayName })
    });
    await loadDetail({ quiet: true });
    $('#runtime-encounter-monster-name').value = '';
    toast(`${payload.monster?.displayName || 'Monster'} spawned on Runtime Map.`, 'success');
    $('#runtime-map-detail-reload')?.click();
  } catch (error) {
    toast(error.message, 'error');
    await loadDetail({ quiet: true });
  } finally {
    renderEncounter();
  }
}

async function startCombat() {
  const encounter = currentEncounter();
  if (!encounter || !selectedMapId) return;
  const button = $('#runtime-encounter-start-combat');
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(selectedMapId)}/encounters/${encodeURIComponent(encounter.encounterId)}/start-combat`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    await loadDetail({ quiet: true });
    toast(`Combat ${payload.combat?.id || ''} started on this Runtime Map.`, 'success');
    document.querySelector('[data-view="combat"]')?.click();
  } catch (error) {
    const missing = error?.payload?.error?.missingPositions;
    toast(missing?.length ? `${error.message} Missing: ${missing.map(item => item.displayName || item.entityId).join(', ')}` : error.message, 'error');
    await loadDetail({ quiet: true });
  } finally {
    renderEncounter();
  }
}

function watchRuntimeChanges() {
  document.addEventListener('click', event => {
    const changed = event.target.closest?.('[data-runtime-action="start"], [data-runtime-action="open"], #runtime-map-close-run, [data-runtime-position-save]');
    if (!changed) return;
    setTimeout(() => loadAll({ quiet: true }), 350);
  });
}

ensurePanel();
watchRuntimeChanges();
