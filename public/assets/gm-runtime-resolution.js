import { $, escapeHtml, toast, emptyState } from './common.js';

let refreshTimer = null;
let detail = null;

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
  return `<section id="runtime-encounter-resolution-panel" class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">RUNTIME ENCOUNTER RESOLUTION</p>
        <h3>Resolve & Continue Scene</h3>
        <p class="muted">Combat ending and Encounter resolution are separate states. Cleared Runtime hostiles resolve automatically after Combat ends; GM may resolve non-lethal outcomes manually after Combat is no longer active.</p>
      </div>
      <button id="runtime-resolution-refresh" class="button button-small button-ghost" type="button">Refresh Resolution</button>
    </div>
    <div id="runtime-resolution-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div id="runtime-resolution-summary" class="stack-list"></div>
    <div id="runtime-resolution-hostiles" class="stack-list"></div>
    <div class="form-actions wrap">
      <button id="runtime-resolution-manual" class="button" type="button">Resolve Encounter</button>
    </div>
    <p class="muted"><strong>Auto:</strong> linked Combat ended + every Runtime Monster/Boss is <code>defeated</code> or <code>removed</code>. <strong>Manual:</strong> surrender, negotiation, escape, scripted outcome or other GM-approved resolution. Manual resolution never ends an active Combat for you.</p>
  </section>`;
}

function ensurePanel() {
  const host = $('#runtime-encounter-panel');
  if (!host || $('#runtime-encounter-resolution-panel')) return false;
  host.insertAdjacentHTML('afterend', markup());
  $('#runtime-resolution-refresh')?.addEventListener('click', () => load({ force: true }));
  $('#runtime-resolution-manual')?.addEventListener('click', resolveEncounter);
  return true;
}

function selectedMapId() {
  return $('#runtime-encounter-map')?.value || '';
}

function selectedEncounterId() {
  return $('#runtime-encounter-select')?.value || '';
}

function currentEncounter() {
  const encounterId = selectedEncounterId();
  return (detail?.runtimeEncounters || []).find(item => item.encounterId === encounterId) || null;
}

function setStatus(message = '', kind = '') {
  const box = $('#runtime-resolution-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function readinessLabel(readiness) {
  if (!readiness) return 'Readiness unavailable';
  if (!readiness.hostileCount) return 'No Runtime hostile participants · auto-resolution disabled';
  if (readiness.cleared) return `${readiness.terminalHostileCount}/${readiness.hostileCount} hostiles terminal · auto-resolution ready`;
  return `${readiness.blockerCount} active/non-terminal hostile blocker${readiness.blockerCount === 1 ? '' : 's'}`;
}

function render() {
  if (!ensurePanel()) return;
  const summary = $('#runtime-resolution-summary');
  const hostiles = $('#runtime-resolution-hostiles');
  const button = $('#runtime-resolution-manual');
  const encounter = currentEncounter();

  if (!encounter) {
    if (summary) summary.innerHTML = emptyState('No Runtime Encounter selected', 'Select an active Runtime Map and Runtime Encounter above.');
    if (hostiles) hostiles.innerHTML = '';
    if (button) button.disabled = true;
    return;
  }

  const readiness = encounter.resolution?.readiness || null;
  const latest = encounter.resolution?.latest || null;
  const combat = encounter.combat || null;
  const combatStatus = combat?.status || 'none';
  if (summary) {
    summary.innerHTML = [
      `<div class="stack-item"><div><strong>${escapeHtml(encounter.name || encounter.encounterId)}</strong><p>Runtime Encounter: ${escapeHtml(encounter.status)} · Combat: ${escapeHtml(combatStatus)}</p></div></div>`,
      `<div class="stack-item"><div><strong>${escapeHtml(readinessLabel(readiness))}</strong><p>${readiness?.cleared ? 'Ending the linked active Combat should transition this Encounter to resolved automatically.' : 'Ending Combat alone does not resolve this Encounter while blockers remain.'}</p></div></div>`,
      latest
        ? `<div class="stack-item"><div><strong>Latest resolution: ${escapeHtml(latest.source || '')}</strong><p>${escapeHtml(latest.fromStatus || '')} → ${escapeHtml(latest.toStatus || '')}${latest.combatId ? ` · ${escapeHtml(latest.combatId)}` : ''}</p><small class="muted">${escapeHtml(latest.id || '')}</small></div></div>`
        : `<div class="stack-item"><div><strong>No resolution audit yet</strong><p>Runtime state has not transitioned to resolved in this Scene Run.</p></div></div>`
    ].join('');
  }

  const hostileRows = readiness?.hostiles || [];
  if (hostiles) {
    hostiles.innerHTML = hostileRows.length
      ? hostileRows.map(item => `<div class="stack-item"><div><strong>${escapeHtml(item.displayName || item.entityId)}</strong><p>${escapeHtml(item.entityType)} · ${escapeHtml(item.status || 'unknown')} · HP ${item.currentHp === null ? 'n/a' : escapeHtml(item.currentHp)} · ${item.terminal ? 'terminal' : `BLOCKER: ${escapeHtml(item.blocker || 'not_terminal')}`}</p><small class="muted">${escapeHtml(item.entityId)}</small></div></div>`).join('')
      : '<p class="muted">No Runtime Monster / Boss participants in this Encounter.</p>';
  }

  if (button) {
    button.disabled = encounter.status !== 'active' || combatStatus === 'active';
    button.title = combatStatus === 'active'
      ? 'End the active Combat before resolving the Encounter.'
      : encounter.status !== 'active'
        ? `Encounter is already ${encounter.status}.`
        : 'Resolve this active Runtime Encounter as a GM-approved non-lethal/scripted outcome.';
  }
}

async function load({ force = false } = {}) {
  if (!ensurePanel()) return;
  const mapId = selectedMapId();
  if (!mapId) {
    detail = null;
    render();
    setStatus('Select an active Runtime Map above.');
    return;
  }
  if (force) setStatus('Loading Runtime resolution state…');
  try {
    detail = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}`);
    render();
    setStatus('');
  } catch (error) {
    detail = null;
    render();
    setStatus(error.message, 'error');
  }
}

async function resolveEncounter() {
  const mapId = selectedMapId();
  const encounter = currentEncounter();
  if (!mapId || !encounter) return;
  const button = $('#runtime-resolution-manual');
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(mapId)}/encounters/${encodeURIComponent(encounter.encounterId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const triggered = (payload.storyEventsTriggered || []).filter(item => item.status === 'applied').length;
    toast(`Runtime Encounter resolved${triggered ? ` · ${triggered} post-resolution Story Event${triggered === 1 ? '' : 's'} applied` : ''}.`, 'success');
    $('#runtime-encounter-refresh')?.click();
    await load({ force: true });
  } catch (error) {
    toast(error.message, 'error');
    await load({ force: true });
  } finally {
    render();
  }
}

function bind() {
  document.addEventListener('change', event => {
    if (event.target?.id === 'runtime-encounter-map' || event.target?.id === 'runtime-encounter-select') {
      queueMicrotask(() => load({ force: true }));
    }
  });
  document.addEventListener('click', event => {
    if (event.target?.closest?.('#runtime-encounter-refresh, #runtime-encounter-start-combat, #runtime-encounter-spawn-monster, #runtime-encounter-spawn-boss, #end-combat')) {
      setTimeout(() => load({ force: true }), 350);
    }
  });
}

const observer = new MutationObserver(() => {
  if (ensurePanel()) load({ force: true });
});
observer.observe(document.documentElement, { childList: true, subtree: true });

bind();
ensurePanel();
load({ force: true });
refreshTimer = setInterval(() => {
  if (document.visibilityState === 'visible' && location.hash === '#world-map') load();
}, 5000);
