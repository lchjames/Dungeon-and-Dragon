import { $, escapeHtml, toast, emptyState } from './common.js';

let objectState = null;
let refreshTimer = null;

function ensureStylesheet() {
  if (document.querySelector('link[href="/assets/player-map-objects.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/player-map-objects.css';
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
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/player/login/?next=${next}`);
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

function ensurePanel() {
  ensureStylesheet();
  const side = document.querySelector('.player-map-side');
  if (!side || $('#player-map-object-panel')) return;
  const section = document.createElement('section');
  section.id = 'player-map-object-panel';
  section.className = 'panel';
  section.innerHTML = `
    <div class="panel-heading">
      <div><h3>Objects</h3><span class="muted">Interaction uses one Action</span></div>
      <button id="player-map-object-refresh" class="button button-small button-ghost" type="button">Refresh</button>
    </div>
    <div id="player-map-object-list" class="stack-list"></div>`;
  const movePanel = [...side.children].find(node => node.querySelector?.('h3')?.textContent === 'Move');
  if (movePanel) side.insertBefore(section, movePanel);
  else side.append(section);
  $('#player-map-object-refresh')?.addEventListener('click', () => loadObjects());
  $('#player-map-object-list')?.addEventListener('click', handleObjectClick);
}

function selectedCharacterId() {
  return $('#player-map-character')?.value || '';
}

function clearMarkers() {
  document.querySelectorAll('.player-map-object-marker').forEach(marker => marker.remove());
  document.querySelectorAll('.player-map-cell.has-object').forEach(cell => cell.classList.remove('has-object'));
}

function renderMarkers() {
  clearMarkers();
  for (const object of objectState?.objects || []) {
    const cell = document.querySelector(`[data-player-map-cell][data-x="${object.x}"][data-y="${object.y}"]`);
    if (!cell) continue;
    cell.classList.add('has-object');
    const marker = document.createElement('span');
    marker.className = `player-map-object-marker${object.canInteract ? ' can-interact' : ''}`;
    marker.textContent = '◆';
    marker.title = `${object.name} · ${object.objectType} · ${object.stateKey}`;
    marker.setAttribute('aria-hidden', 'true');
    cell.append(marker);
  }
}

function blockedLabel(reason) {
  const labels = {
    OBJECT_HIDDEN: 'Hidden',
    OBJECT_NOT_INTERACTABLE: 'Unavailable',
    CHARACTER_RESTING: 'Resting',
    OBJECT_OUT_OF_REACH: 'Out of reach',
    CHARACTER_ACTION_LOCKED: 'Character locked',
    NOT_OWN_TURN: 'Wait for turn',
    ACTION_ALREADY_SPENT: 'Action spent'
  };
  return labels[reason] || 'Unavailable';
}

function renderObjects() {
  ensurePanel();
  const target = $('#player-map-object-list');
  if (!target) return;
  const objects = objectState?.objects || [];
  if (!selectedCharacterId()) {
    target.innerHTML = '<p class="muted">Select a Character.</p>';
    clearMarkers();
    return;
  }
  if (!objectState?.map) {
    target.innerHTML = '<p class="muted">No active Runtime Map.</p>';
    clearMarkers();
    return;
  }
  if (!objects.length) {
    target.innerHTML = emptyState('No visible Objects', 'No interactable Map Objects are currently visible to this Character.');
    clearMarkers();
    return;
  }
  target.innerHTML = objects.map(object => `<article class="stack-item player-object-row">
    <div>
      <div class="row-inline"><strong>${escapeHtml(object.name)}</strong><span class="tag">${escapeHtml(object.objectType)}</span><span class="status-pill">${escapeHtml(object.stateKey)}</span></div>
      <p class="muted">(${object.x}, ${object.y}) · range ${object.interactionRange}${object.singleUse ? ' · single use' : ''}</p>
    </div>
    <button class="button button-small ${object.canInteract ? '' : 'button-ghost'}" type="button" data-interact-object="${escapeHtml(object.id)}" ${object.canInteract ? '' : 'disabled'} title="${object.canInteract ? 'Use one Action to interact' : escapeHtml(blockedLabel(object.interactionBlockedReason))}">${object.canInteract ? 'Interact' : escapeHtml(blockedLabel(object.interactionBlockedReason))}</button>
  </article>`).join('');
  renderMarkers();
}

async function loadObjects({ quiet = false } = {}) {
  ensurePanel();
  const characterId = selectedCharacterId();
  if (!characterId) {
    objectState = null;
    return renderObjects();
  }
  try {
    objectState = await api(`/api/player/world/characters/${encodeURIComponent(characterId)}/objects`);
    renderObjects();
  } catch (error) {
    objectState = null;
    renderObjects();
    if (!quiet) toast(error.message, 'error');
  }
}

async function interact(objectId) {
  const characterId = selectedCharacterId();
  if (!characterId) return;
  const button = document.querySelector(`[data-interact-object="${CSS.escape(objectId)}"]`);
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/world/characters/${encodeURIComponent(characterId)}/objects/${encodeURIComponent(objectId)}/interact`, {
      method: 'POST', body: JSON.stringify({})
    });
    const applied = (payload.interactObjectStoryEvents || []).filter(event => event.status === 'applied').length;
    toast(applied ? `Interaction resolved. ${applied} Story Event${applied === 1 ? '' : 's'} applied.` : 'Interaction resolved. Action spent.', 'success');
    $('#player-map-refresh')?.click();
    await loadObjects({ quiet: true });
    window.dispatchEvent(new CustomEvent('dnd:object-interaction', {
      detail: { characterId, objectId, interactionId: payload.interaction?.id || null }
    }));
  } catch (error) {
    toast(error.message, 'error');
    await loadObjects({ quiet: true });
  }
}

function handleObjectClick(event) {
  const button = event.target.closest?.('[data-interact-object]');
  if (button && !button.disabled) interact(button.dataset.interactObject);
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadObjects({ quiet: true });
  }, 5000);
}

function initialise() {
  ensurePanel();
  $('#player-map-character')?.addEventListener('change', () => queueMicrotask(() => loadObjects({ quiet: true })));
  $('#player-map-refresh')?.addEventListener('click', () => queueMicrotask(() => loadObjects({ quiet: true })));
  window.addEventListener('dnd:combat-state-changed', () => loadObjects({ quiet: true }));
  window.addEventListener('dnd:map-state-changed', () => loadObjects({ quiet: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadObjects({ quiet: true });
  });
  loadObjects({ quiet: true });
  scheduleRefresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
else initialise();
