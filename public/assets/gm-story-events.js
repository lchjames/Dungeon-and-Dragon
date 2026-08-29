import { $, escapeHtml, toast, emptyState } from './common.js';

let overview = null;
let detail = null;
let selectedRuntimeId = '';
let selectedEventId = '';

const TRIGGERS = [
  'manual', 'scene_run_start', 'enter_zone', 'interact_object',
  'encounter_activated', 'encounter_resolved', 'combat_started', 'combat_ended', 'flag_changed'
];

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

function panelMarkup() {
  return `<section id="gm-story-events-panel" class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">STORY RUNTIME</p>
        <h3>Story Events</h3>
        <p class="muted">Structured Trigger + Conditions + Approved Effects. Manual GM and automatic enter_zone execution are live; no arbitrary JavaScript or SQL.</p>
      </div>
      <button id="gm-story-event-refresh" class="button button-small button-ghost" type="button">Refresh</button>
    </div>
    <div id="gm-story-event-status" class="auth-status" hidden role="status" aria-live="polite"></div>

    <div class="form-grid compact-grid">
      <label class="field"><span>Active Runtime</span><select id="gm-story-event-runtime" class="input"><option value="">Loading…</option></select></label>
    </div>

    <div id="gm-story-event-workspace" class="hidden">
      <div class="split-grid">
        <section class="panel">
          <div class="panel-heading">
            <div><h4>Event Definition</h4><span id="gm-story-event-edit-label" class="muted">New Event</span></div>
            <button id="gm-story-event-new" class="button button-small button-ghost" type="button">New</button>
          </div>
          <div class="form-grid compact-grid">
            <label class="field"><span>Name</span><input id="gm-story-event-name" class="input" maxlength="120" placeholder="Emergency Room Ambush"></label>
            <label class="field"><span>Status</span><select id="gm-story-event-definition-status" class="input"><option value="active">active</option><option value="archived">archived</option></select></label>
            <label class="field"><span>Trigger Type</span><select id="gm-story-event-trigger" class="input">${TRIGGERS.map(type => `<option value="${type}">${type}</option>`).join('')}</select></label>
            <label class="check-field"><input id="gm-story-event-once" type="checkbox" checked> Once per Scene Run</label>
            <label class="field"><span>Trigger JSON</span><textarea id="gm-story-event-trigger-json" class="textarea" rows="3">{}</textarea></label>
            <label class="field"><span>Conditions JSON</span><textarea id="gm-story-event-conditions" class="textarea" rows="7">[\n  {"type":"event_not_fired"}\n]</textarea></label>
            <label class="field"><span>Approved Effects JSON</span><textarea id="gm-story-event-effects" class="textarea" rows="10">[\n  {"type":"show_narrative","text":"Something changes in the room."}\n]</textarea></label>
          </div>
          <p class="muted">Map targets use stable Template <code>sourceEdgeId</code> / <code>sourceZoneId</code>. Encounter effects use the Encounter Definition <code>encounterId</code>; Runtime state stays isolated per Scene Run.</p>
          <div class="form-actions wrap">
            <button id="gm-story-event-save" class="button" type="button">Create Event</button>
            <button id="gm-story-event-activate" class="button button-ghost" type="button" disabled>Activate Selected</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-heading"><div><h4>Runtime References</h4><span class="muted">Stable authoring IDs and current per-run state</span></div></div>
          <div id="gm-story-event-references" class="stack-list"></div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-heading"><div><h4>Scene Events</h4><span class="muted">Select to edit; only manual Events can use Activate Selected</span></div></div>
        <div id="gm-story-event-list" class="stack-list"></div>
      </section>

      <div class="runtime-map-columns">
        <section class="panel"><div class="panel-heading"><h4>Runtime Flags</h4></div><div id="gm-story-flag-list" class="stack-list"></div></section>
        <section class="panel"><div class="panel-heading"><h4>Revealed Narrative</h4></div><div id="gm-story-narrative-list" class="stack-list"></div></section>
      </div>
      <section class="panel"><div class="panel-heading"><h4>Execution Audit</h4></div><div id="gm-story-execution-list" class="stack-list"></div></section>
    </div>
  </section>`;
}

function ensurePanel() {
  const view = $('#view-world-map');
  if (!view || $('#gm-story-events-panel')) return;
  view.insertAdjacentHTML('beforeend', panelMarkup());
  $('#gm-story-event-refresh')?.addEventListener('click', () => loadOverview());
  $('#gm-story-event-runtime')?.addEventListener('change', event => {
    selectedRuntimeId = event.target.value || '';
    selectedEventId = '';
    if (selectedRuntimeId) loadRuntime(selectedRuntimeId);
    else clearRuntime();
  });
  $('#gm-story-event-new')?.addEventListener('click', resetEditor);
  $('#gm-story-event-save')?.addEventListener('click', saveEvent);
  $('#gm-story-event-activate')?.addEventListener('click', activateEvent);
  $('#gm-story-event-list')?.addEventListener('click', handleEventListClick);
  queueMicrotask(() => loadOverview({ quiet: true }));
}

function setStatus(message = '', kind = '') {
  const box = $('#gm-story-event-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function activeRuntimes() {
  return (overview?.mapInstances || []).filter(map => map.status === 'active');
}

function renderRuntimeSelect() {
  const select = $('#gm-story-event-runtime');
  if (!select) return;
  const runtimes = activeRuntimes();
  if (!runtimes.length) {
    select.innerHTML = '<option value="">No active Runtime Maps</option>';
    selectedRuntimeId = '';
    clearRuntime();
    return;
  }
  if (!runtimes.some(map => map.id === selectedRuntimeId)) selectedRuntimeId = runtimes[0].id;
  select.innerHTML = runtimes.map(map => `<option value="${escapeHtml(map.id)}" ${map.id === selectedRuntimeId ? 'selected' : ''}>${escapeHtml(map.scenarioName)} → ${escapeHtml(map.sceneName)} · ${escapeHtml(map.mapName)}</option>`).join('');
}

async function loadOverview({ quiet = false } = {}) {
  if (!quiet) setStatus('Loading Story Runtime…');
  try {
    overview = await api('/api/gm/world/runtime');
    renderRuntimeSelect();
    if (selectedRuntimeId) await loadRuntime(selectedRuntimeId, { quiet: true });
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function loadRuntime(mapInstanceId, { quiet = false } = {}) {
  if (!quiet) setStatus('Loading Story Events…');
  try {
    detail = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(mapInstanceId)}`);
    selectedRuntimeId = detail?.mapInstance?.id || mapInstanceId;
    $('#gm-story-event-workspace')?.classList.remove('hidden');
    if (selectedEventId && !(detail.storyEvents || []).some(event => event.id === selectedEventId)) selectedEventId = '';
    renderAll();
    if (!quiet) setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function clearRuntime() {
  detail = null;
  selectedEventId = '';
  $('#gm-story-event-workspace')?.classList.add('hidden');
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function parseEditorJson(id, fallback) {
  const raw = $(id)?.value?.trim() || '';
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch {
    throw new Error(`${id.replace('#gm-story-event-', '')} contains invalid JSON.`);
  }
}

function selectedEvent() {
  return (detail?.storyEvents || []).find(event => event.id === selectedEventId) || null;
}

function resetEditor() {
  selectedEventId = '';
  $('#gm-story-event-edit-label').textContent = 'New Event';
  $('#gm-story-event-name').value = '';
  $('#gm-story-event-definition-status').value = 'active';
  $('#gm-story-event-trigger').value = 'manual';
  $('#gm-story-event-once').checked = true;
  $('#gm-story-event-trigger-json').value = '{}';
  $('#gm-story-event-conditions').value = '[\n  {"type":"event_not_fired"}\n]';
  $('#gm-story-event-effects').value = '[\n  {"type":"show_narrative","text":"Something changes in the room."}\n]';
  $('#gm-story-event-save').textContent = 'Create Event';
  renderEvents();
  syncActivateButton();
}

function editEvent(event) {
  selectedEventId = event.id;
  $('#gm-story-event-edit-label').textContent = `Editing · ${event.name}`;
  $('#gm-story-event-name').value = event.name || '';
  $('#gm-story-event-definition-status').value = event.status || 'active';
  $('#gm-story-event-trigger').value = event.triggerType || 'manual';
  $('#gm-story-event-once').checked = event.oncePerSceneRun !== false;
  $('#gm-story-event-trigger-json').value = pretty(event.trigger || {});
  $('#gm-story-event-conditions').value = pretty(event.conditions || []);
  $('#gm-story-event-effects').value = pretty(event.effects || []);
  $('#gm-story-event-save').textContent = 'Save Event';
  renderEvents();
  syncActivateButton();
}

function eventBody() {
  const conditions = parseEditorJson('#gm-story-event-conditions', []);
  const effects = parseEditorJson('#gm-story-event-effects', []);
  const trigger = parseEditorJson('#gm-story-event-trigger-json', {});
  if (!Array.isArray(conditions)) throw new Error('Conditions JSON must be an array.');
  if (!Array.isArray(effects)) throw new Error('Effects JSON must be an array.');
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) throw new Error('Trigger JSON must be an object.');
  return {
    name: $('#gm-story-event-name')?.value?.trim() || '',
    status: $('#gm-story-event-definition-status')?.value || 'active',
    triggerType: $('#gm-story-event-trigger')?.value || 'manual',
    trigger,
    conditions,
    effects,
    oncePerSceneRun: Boolean($('#gm-story-event-once')?.checked)
  };
}

async function saveEvent() {
  if (!detail?.mapInstance?.sceneId) return toast('Select an active Runtime first.', 'error');
  const button = $('#gm-story-event-save');
  button.disabled = true;
  try {
    const body = eventBody();
    let payload;
    if (selectedEventId) {
      payload = await api(`/api/gm/story-events/${encodeURIComponent(selectedEventId)}`, {
        method: 'PATCH', body: JSON.stringify(body)
      });
    } else {
      payload = await api(`/api/gm/scenes/${encodeURIComponent(detail.mapInstance.sceneId)}/story-events`, {
        method: 'POST', body: JSON.stringify(body)
      });
      selectedEventId = payload?.event?.id || '';
    }
    await loadRuntime(selectedRuntimeId, { quiet: true });
    const current = selectedEvent();
    if (current) editEvent(current);
    toast(selectedEventId ? 'Story Event saved.' : 'Story Event created.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function activateEvent() {
  const event = selectedEvent();
  if (!event || !selectedRuntimeId) return;
  const button = $('#gm-story-event-activate');
  button.disabled = true;
  try {
    await api(`/api/gm/world/runtime/maps/${encodeURIComponent(selectedRuntimeId)}/story-events/${encodeURIComponent(event.id)}/activate`, {
      method: 'POST', body: JSON.stringify({})
    });
    await loadRuntime(selectedRuntimeId, { quiet: true });
    if ((detail.storyEvents || []).some(item => item.id === event.id)) editEvent((detail.storyEvents || []).find(item => item.id === event.id));
    toast('Story Event applied to Runtime.', 'success');
  } catch (error) {
    const failures = error?.payload?.error?.failures;
    toast(failures?.length ? `${error.message} ${failures.map(item => item.reason).join(', ')}` : error.message, 'error');
  } finally {
    syncActivateButton();
  }
}

function handleEventListClick(event) {
  const button = event.target.closest?.('[data-story-event-id]');
  if (!button) return;
  const found = (detail?.storyEvents || []).find(item => item.id === button.dataset.storyEventId);
  if (found) editEvent(found);
}

function renderReferences() {
  const target = $('#gm-story-event-references');
  if (!target || !detail) return;
  const doors = (detail.edges || []).filter(edge => edge.edgeType === 'door' && edge.sourceEdgeId);
  const zones = (detail.zones || []).filter(zone => zone.sourceZoneId);
  const encounters = detail.runtimeEncounters || [];
  const rows = [
    ...doors.map(edge => `<div class="stack-item"><div><strong>Door · ${escapeHtml(edge.sourceEdgeId)}</strong><p>Runtime ${escapeHtml(edge.id)} · (${edge.x}, ${edge.y}) ${escapeHtml(edge.direction)} · ${escapeHtml(edge.doorState || 'closed')}</p></div></div>`),
    ...zones.map(zone => `<div class="stack-item"><div><strong>Zone · ${escapeHtml(zone.sourceZoneId)}</strong><p>${escapeHtml(zone.name)} · ${escapeHtml(zone.zoneType)} · player visible ${zone.playerVisible ? 'yes' : 'no'}</p></div></div>`),
    ...encounters.map(encounter => `<div class="stack-item"><div><strong>Encounter · ${escapeHtml(encounter.encounterId)}</strong><p>${escapeHtml(encounter.name || encounter.encounterId)} · runtime ${escapeHtml(encounter.status || 'planned')} · definition snapshot ${escapeHtml(encounter.definitionStatusSnapshot || '')}</p></div></div>`)
  ];
  target.innerHTML = rows.length
    ? rows.join('')
    : emptyState('No Story Runtime references', 'Add Map targets or an Encounter Definition to this Scene first.');
}

function syncActivateButton() {
  const button = $('#gm-story-event-activate');
  const event = selectedEvent();
  if (!button) return;
  button.disabled = !event || event.status !== 'active' || event.triggerType !== 'manual' || detail?.mapInstance?.status !== 'active';
  button.title = event && event.triggerType !== 'manual'
    ? 'Automatic triggers are resolved by the server and cannot be invoked with the manual activation button.'
    : '';
}

function renderEvents() {
  const target = $('#gm-story-event-list');
  if (!target || !detail) return;
  const events = detail.storyEvents || [];
  if (!events.length) {
    target.innerHTML = emptyState('No Story Events', 'Create a structured Event for this Scene.');
    syncActivateButton();
    return;
  }
  target.innerHTML = events.map(event => `<button type="button" class="runtime-position-row ${event.id === selectedEventId ? 'selected' : ''}" data-story-event-id="${escapeHtml(event.id)}">
    <span><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.triggerType)} · ${escapeHtml(event.status)}${event.oncePerSceneRun ? ' · once/run' : ''}</small></span>
    <span>${event.effects?.length || 0} effects</span>
  </button>`).join('');
  syncActivateButton();
}

function renderFlags() {
  const target = $('#gm-story-flag-list');
  if (!target) return;
  const flags = detail?.storyFlags || [];
  target.innerHTML = flags.length
    ? flags.map(flag => `<div class="stack-item"><div><strong>${escapeHtml(flag.key)}</strong><p><code>${escapeHtml(JSON.stringify(flag.value))}</code></p></div></div>`).join('')
    : '<p class="muted">No runtime Story flags.</p>';
}

function renderNarratives() {
  const target = $('#gm-story-narrative-list');
  if (!target) return;
  const items = detail?.storyNarratives || [];
  target.innerHTML = items.length
    ? items.map(item => `<div class="stack-item"><div><p>${escapeHtml(item.text)}</p><small class="muted">${item.createdAt ? new Date(Number(item.createdAt)).toLocaleString() : ''}</small></div></div>`).join('')
    : '<p class="muted">No narrative revealed in this Scene Run.</p>';
}

function renderExecutions() {
  const target = $('#gm-story-execution-list');
  if (!target) return;
  const items = detail?.storyExecutions || [];
  target.innerHTML = items.length
    ? items.map(item => `<div class="stack-item"><div><strong>${escapeHtml(item.status)} · ${escapeHtml(item.triggerType)}</strong><p>${item.effectsApplied?.length || 0} effects applied${item.errorCode ? ` · ${escapeHtml(item.errorCode)}` : ''}</p>${item.errorMessage ? `<small>${escapeHtml(item.errorMessage)}</small>` : ''}</div></div>`).join('')
    : '<p class="muted">No Story Event executions in this Runtime.</p>';
}

function renderAll() {
  renderReferences();
  renderEvents();
  renderFlags();
  renderNarratives();
  renderExecutions();
  if (!selectedEventId) resetEditor();
}

const observer = new MutationObserver(() => ensurePanel());
observer.observe(document.documentElement, { childList: true, subtree: true });
ensurePanel();
