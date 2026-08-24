import { $, escapeHtml, toast, emptyState } from './common.js';

let combatState = null;
let refreshTimer = null;

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
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function setStatus(message = '', kind = '') {
  const box = $('#player-combat-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function renderNoCombat() {
  const panel = $('#player-combat-panel');
  if (!panel) return;
  panel.classList.add('hidden');
  $('#player-combat-initiative').innerHTML = '';
  $('#player-combat-current').textContent = 'No active Combat.';
}

function renderCombat(combat) {
  const panel = $('#player-combat-panel');
  if (!panel) return;

  if (!combat || combat.status !== 'active') {
    renderNoCombat();
    return;
  }

  panel.classList.remove('hidden');
  $('#player-combat-round').textContent = `Round ${combat.roundNumber}`;

  const current = combat.currentCombatant;
  const ownTurn = Boolean(combat.isOwnTurn && current);
  $('#player-combat-current').textContent = current
    ? `${ownTurn ? 'Your Turn' : 'Current Turn'}: ${current.displayName} · DEX ${current.dex} · Action ${current.actionAvailable ? 'Ready' : 'Spent'} · Move ${current.moveAvailable ? 'Ready' : 'Spent'}`
    : 'Current Turn state is invalid.';

  const action = $('#player-consume-action');
  const move = $('#player-consume-move');
  const endTurn = $('#player-end-turn');

  if (action) action.disabled = !ownTurn || !current.actionAvailable;
  if (move) move.disabled = !ownTurn || !current.moveAvailable;
  if (endTurn) endTurn.disabled = !ownTurn;

  const initiative = $('#player-combat-initiative');
  initiative.innerHTML = (combat.combatants || []).map(combatant => {
    const flags = [
      combatant.isCurrent ? 'Current Turn' : '',
      combatant.controlledByCurrentUser ? 'Yours' : ''
    ].filter(Boolean);
    return `<article class="stack-item compact-item ${combatant.isCurrent ? 'selected' : ''}">
      <div>
        <div class="row-inline">
          <h4>${combatant.initiativeOrder + 1}. ${escapeHtml(combatant.displayName)}</h4>
          <span class="tag">DEX ${escapeHtml(combatant.dex)}</span>
          ${flags.map(flag => `<span class="status-pill">${escapeHtml(flag)}</span>`).join('')}
        </div>
        <p>Action ${combatant.actionAvailable ? 'Ready' : 'Spent'} · Move ${combatant.moveAvailable ? 'Ready' : 'Spent'}${combatant.turnCompleted ? ' · Turn completed' : ''}</p>
      </div>
    </article>`;
  }).join('');
}

function renderState(payload) {
  combatState = payload || { combat: null };
  renderCombat(combatState.combat || null);
}

async function loadCombat({ quiet = false } = {}) {
  try {
    const payload = await api('/api/player/combat');
    renderState(payload);
    if (!quiet) setStatus('');
  } catch (error) {
    if (!quiet) setStatus(error.message, 'error');
  }
}

async function consumeAllowance(kind) {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn) return;

  const button = kind === 'action' ? $('#player-consume-action') : $('#player-consume-move');
  if (button) button.disabled = true;

  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/consume-${kind}`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    renderState(payload);
    toast(`${kind === 'action' ? 'Action' : 'Move'} marked as spent.`, 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadCombat({ quiet: true });
  }
}

async function endOwnTurn() {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn) return;

  const button = $('#player-end-turn');
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/end-turn`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    renderState(payload);
    toast(payload.roundAdvanced ? `Round ${payload.combat?.roundNumber || ''} started.` : 'Turn ended.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadCombat({ quiet: true });
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadCombat({ quiet: true });
  }, 5000);
}

$('#player-refresh-combat')?.addEventListener('click', () => loadCombat());
$('#player-consume-action')?.addEventListener('click', () => consumeAllowance('action'));
$('#player-consume-move')?.addEventListener('click', () => consumeAllowance('move'));
$('#player-end-turn')?.addEventListener('click', endOwnTurn);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadCombat({ quiet: true });
});

if ($('#player-combat-panel')) {
  $('#player-combat-initiative').innerHTML = emptyState('No active Combat', 'When the GM starts a Combat containing one of your Characters, it will appear here.');
}
loadCombat();
scheduleRefresh();
