import { $, $$, escapeHtml, toast, confirmAction, emptyState } from './common.js';

let combatState = null;

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
    location.replace(`/gm/login/?next=${encodeURIComponent('/gm/#combat')}`);
    throw new Error('Session expired.');
  }
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function setStatus(message = '', kind = '') {
  const box = $('#combat-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function showCombatView() {
  $$('.side-link').forEach(button => button.classList.toggle('active', button.id === 'combat-side-link'));
  $$('.admin-view').forEach(section => section.classList.add('hidden'));
  $('#view-combat')?.classList.remove('hidden');
  if ($('#view-title')) $('#view-title').textContent = 'Combat';
  history.replaceState(null, '', '#combat');
  loadCombat();
}

function selectedCandidateIds() {
  return $$('[data-combat-candidate]:checked').map(input => input.value);
}

function renderCandidates(candidates) {
  const target = $('#combat-candidate-list');
  if (!target) return;
  if (!candidates?.length) {
    target.innerHTML = emptyState('No active Characters', 'Finalize at least one Character before starting Combat.');
    $('#start-combat').disabled = true;
    return;
  }

  target.innerHTML = candidates.map(candidate => `<label class="stack-item">
    <div>
      <div class="row-inline"><h4>${escapeHtml(candidate.name)}</h4><span class="tag">DEX ${candidate.dex === null ? '—' : escapeHtml(candidate.dex)}</span></div>
      <p>${escapeHtml(candidate.ownerDisplayName)}${candidate.eligible ? '' : ' · Missing valid DEX'}</p>
    </div>
    <input type="checkbox" value="${escapeHtml(candidate.id)}" data-combat-candidate ${candidate.eligible ? '' : 'disabled'} aria-label="Select ${escapeHtml(candidate.name)}">
  </label>`).join('');

  const refreshButton = () => {
    $('#start-combat').disabled = selectedCandidateIds().length < 1;
  };
  $$('[data-combat-candidate]', target).forEach(input => input.addEventListener('change', refreshButton));
  refreshButton();
}

function renderCombat(combat) {
  const startPanel = $('#combat-start-panel');
  const activePanel = $('#combat-active-panel');
  if (!combat || combat.status !== 'active') {
    startPanel?.classList.remove('hidden');
    activePanel?.classList.add('hidden');
    return;
  }

  startPanel?.classList.add('hidden');
  activePanel?.classList.remove('hidden');
  $('#combat-round-summary').textContent = `Round ${combat.roundNumber}`;

  const current = combat.currentCombatant;
  $('#combat-current-summary').textContent = current
    ? `Current Turn: ${current.displayName} · DEX ${current.dex} · Action ${current.actionAvailable ? 'Ready' : 'Spent'} · Move ${current.moveAvailable ? 'Ready' : 'Spent'}`
    : 'Current Turn state is invalid.';

  const target = $('#combat-initiative-list');
  target.innerHTML = combat.combatants.map(combatant => {
    const isCurrent = current?.id === combatant.id;
    return `<article class="admin-row ${isCurrent ? 'selected' : ''}">
      <div class="admin-row-main">
        <div class="row-inline">
          <h3>${combatant.initiativeOrder + 1}. ${escapeHtml(combatant.displayName)}</h3>
          ${isCurrent ? '<span class="status-pill">Current Turn</span>' : ''}
          <span class="tag">DEX ${escapeHtml(combatant.dex)}</span>
        </div>
        <p>Action: ${combatant.actionAvailable ? 'Ready' : 'Spent'} · Move: ${combatant.moveAvailable ? 'Ready' : 'Spent'}${combatant.turnCompleted ? ' · Turn completed' : ''}</p>
      </div>
      <button class="button button-small button-ghost" type="button" data-force-turn="${escapeHtml(combatant.id)}" ${isCurrent ? 'disabled' : ''}>Force Turn</button>
    </article>`;
  }).join('');

  $$('[data-force-turn]', target).forEach(button => button.addEventListener('click', () => forceTurn(button.dataset.forceTurn)));
}

function renderState(payload) {
  combatState = payload;
  renderCandidates(payload?.candidates || []);
  renderCombat(payload?.combat || null);
}

async function loadCombat() {
  try {
    const payload = await api('/api/gm/combat');
    renderState(payload);
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function startCombat() {
  const characterIds = selectedCandidateIds();
  if (!characterIds.length) return toast('Select at least one Character.', 'error');
  const button = $('#start-combat');
  button.disabled = true;
  setStatus('正在建立 Combat Turn Order…');
  try {
    const payload = await api('/api/gm/combat/start', {
      method: 'POST',
      body: JSON.stringify({ characterIds })
    });
    renderCombat(payload.combat);
    await loadCombat();
    toast('Combat started. Initiative is fixed for this Combat.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function endCurrentTurn() {
  const combat = combatState?.combat;
  if (!combat) return;
  const button = $('#end-current-turn');
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/combat/${encodeURIComponent(combat.id)}/end-turn`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    combatState.combat = payload.combat;
    renderCombat(payload.combat);
    toast(payload.roundAdvanced ? `Round ${payload.combat.roundNumber} started.` : 'Turn advanced.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function forceTurn(combatantId) {
  const combat = combatState?.combat;
  if (!combat) return;
  try {
    const payload = await api(`/api/gm/combat/${encodeURIComponent(combat.id)}/force-turn`, {
      method: 'POST',
      body: JSON.stringify({ combatantId })
    });
    combatState.combat = payload.combat;
    renderCombat(payload.combat);
    toast('Current Turn overridden by GM. Action / Move allowances were not reset.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function endCombat() {
  const combat = combatState?.combat;
  if (!combat) return;
  if (!confirmAction(`End Combat at Round ${combat.roundNumber}?`)) return;
  const button = $('#end-combat');
  button.disabled = true;
  try {
    await api(`/api/gm/combat/${encodeURIComponent(combat.id)}/end`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    await loadCombat();
    toast('Combat ended.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

$('#combat-side-link')?.addEventListener('click', showCombatView);
$('#start-combat')?.addEventListener('click', startCombat);
$('#end-current-turn')?.addEventListener('click', endCurrentTurn);
$('#end-combat')?.addEventListener('click', endCombat);

loadCombat();
if (location.hash === '#combat') {
  queueMicrotask(showCombatView);
}
