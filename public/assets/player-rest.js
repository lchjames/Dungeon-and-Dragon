import { $, escapeHtml, toast } from './common.js';

let restContext = null;
let restRefreshTimer = null;

function mountRestPanel() {
  if ($('#player-rest-panel')) return;
  const side = document.querySelector('.player-map-side');
  if (!side) return;
  const panel = document.createElement('section');
  panel.id = 'player-rest-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <h3>Rest / 休息</h3>
    <p class="player-map-help">Rest uses Exploration Rounds, not a real-time timer. Each Rest chooses HP or MP only.</p>
    <div id="player-rest-state" class="tool-result muted">Select a positioned Character.</div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Rest Type</span><select id="player-rest-type" class="input">
        <option value="short">Short Rest · 2 Rounds</option>
        <option value="long">Long Rest · 5 Rounds</option>
      </select></label>
      <label class="field"><span>Resource</span><select id="player-rest-resource" class="input">
        <option value="HP">HP</option>
        <option value="MP">MP</option>
      </select></label>
    </div>
    <p id="player-rest-preview" class="player-map-help"></p>
    <div class="form-actions wrap">
      <button id="player-rest-start" class="button button-small" type="button" disabled>Start Rest</button>
      <button id="player-rest-cancel" class="button button-small button-ghost" type="button" disabled>Cancel Rest</button>
    </div>`;
  side.prepend(panel);
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

function selectedCharacterId() {
  return $('#player-map-character')?.value || '';
}

function recoveryPreview() {
  const type = $('#player-rest-type')?.value || 'short';
  const resource = $('#player-rest-resource')?.value || 'HP';
  if (type === 'short' && resource === 'HP') return '2 Rounds · recover ceil(Final Max HP × 10%)';
  if (type === 'short' && resource === 'MP') return '2 Rounds · recover ceil(Final Max MP × 25%)';
  if (type === 'long' && resource === 'HP') return '5 Rounds · recover ceil(Final Max HP × 50%)';
  return '5 Rounds · recover MP to Final Max MP';
}

function renderPreview() {
  const target = $('#player-rest-preview');
  if (target) target.textContent = recoveryPreview();
}

function restLabel(rest) {
  const type = rest.restType === 'long' ? 'Long Rest' : 'Short Rest';
  return `${type} · ${rest.resource}`;
}

function renderRest() {
  const target = $('#player-rest-state');
  const start = $('#player-rest-start');
  const cancel = $('#player-rest-cancel');
  if (!target || !start || !cancel) return;

  const context = restContext;
  const rest = context?.rest || null;
  if (!context?.map) {
    target.textContent = 'Rest requires the Character to be on an active Runtime Map.';
    target.className = 'tool-result muted';
    start.disabled = true;
    cancel.disabled = true;
    return;
  }

  if (rest?.active) {
    target.innerHTML = `<strong>${escapeHtml(restLabel(rest))}</strong> · Round progress ${escapeHtml(rest.progressRounds)}/${escapeHtml(rest.requiredRounds)} · ACTIVE`;
  } else if (rest?.status === 'completed') {
    target.innerHTML = `<strong>${escapeHtml(restLabel(rest))}</strong> · COMPLETED${rest.completedRound ? ` in Round ${escapeHtml(rest.completedRound)}` : ''} · recovered ${escapeHtml(rest.recoveryApplied)} ${escapeHtml(rest.resource)}`;
  } else if (rest?.status === 'combat_interrupted') {
    target.innerHTML = `<strong>${escapeHtml(restLabel(rest))}</strong> · INTERRUPTED BY COMBAT · no Rest recovery`;
  } else if (rest?.status === 'cancelled') {
    target.innerHTML = `<strong>${escapeHtml(restLabel(rest))}</strong> · CANCELLED · no Rest recovery`;
  } else {
    target.textContent = 'No active Rest.';
  }
  target.className = `tool-result${rest?.active ? '' : ' muted'}`;

  const turn = context?.turn;
  const canStart = Boolean(
    turn?.mode === 'exploration'
    && turn.participant
    && !turn.turnCompleted
    && turn.actionAvailable
    && turn.moveAvailable
    && context?.character?.status === 'active'
    && context?.character?.lifeState === 'alive'
    && !context?.character?.characterLocked
    && !rest?.active
  );
  start.disabled = !canStart;
  cancel.disabled = !rest?.active;
  $('#player-rest-type').disabled = Boolean(rest?.active);
  $('#player-rest-resource').disabled = Boolean(rest?.active);
}

async function loadRest({ quiet = false } = {}) {
  const characterId = selectedCharacterId();
  if (!characterId) {
    restContext = null;
    renderRest();
    return;
  }
  try {
    restContext = await api(`/api/player/world/characters/${encodeURIComponent(characterId)}`);
    renderRest();
  } catch (error) {
    if (!quiet) toast(error.message, 'error');
  }
}

function refreshMapUi() {
  $('#player-map-refresh')?.click();
  window.dispatchEvent(new CustomEvent('dnd:rest-state-changed', {
    detail: { characterId: selectedCharacterId() }
  }));
}

async function startRest() {
  const characterId = selectedCharacterId();
  if (!characterId) return;
  const button = $('#player-rest-start');
  button.disabled = true;
  try {
    restContext = await api(`/api/player/world/characters/${encodeURIComponent(characterId)}/rest/start`, {
      method: 'POST',
      body: JSON.stringify({
        restType: $('#player-rest-type')?.value || 'short',
        resource: $('#player-rest-resource')?.value || 'HP'
      })
    });
    renderRest();
    const rest = restContext?.rest;
    if (rest?.status === 'completed') {
      toast(`${restLabel(rest)} completed. +${rest.recoveryApplied} ${rest.resource}.`, 'success');
    } else {
      toast(`${restLabel(rest)} started.`, 'success');
    }
    refreshMapUi();
  } catch (error) {
    toast(error.message, 'error');
    await loadRest({ quiet: true });
  }
}

async function cancelRest() {
  const characterId = selectedCharacterId();
  if (!characterId) return;
  const button = $('#player-rest-cancel');
  button.disabled = true;
  try {
    restContext = await api(`/api/player/world/characters/${encodeURIComponent(characterId)}/rest/cancel`, {
      method: 'POST', body: JSON.stringify({})
    });
    renderRest();
    toast('Rest cancelled. No Rest recovery applied.', 'info');
    refreshMapUi();
  } catch (error) {
    toast(error.message, 'error');
    await loadRest({ quiet: true });
  }
}

function scheduleRestRefresh() {
  clearInterval(restRefreshTimer);
  restRefreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadRest({ quiet: true });
  }, 5000);
}

mountRestPanel();
renderPreview();
$('#player-rest-type')?.addEventListener('change', renderPreview);
$('#player-rest-resource')?.addEventListener('change', renderPreview);
$('#player-rest-start')?.addEventListener('click', startRest);
$('#player-rest-cancel')?.addEventListener('click', cancelRest);
$('#player-map-character')?.addEventListener('change', () => loadRest());
$('#player-map-refresh')?.addEventListener('click', () => loadRest({ quiet: true }));
window.addEventListener('dnd:map-state-changed', () => loadRest({ quiet: true }));
window.addEventListener('dnd:combat-state-changed', () => loadRest({ quiet: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadRest({ quiet: true });
});
loadRest();
scheduleRestRefresh();
