import './gm-combat-map-context.js';
import { $, escapeHtml, toast, emptyState } from './common.js';

let movementState = null;
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
    location.replace(`/gm/login/?next=${encodeURIComponent('/gm/#combat')}`);
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
  return `<section id="hostile-movement-panel" class="panel hidden">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">CURRENT HOSTILE MOVE</p>
        <h3 id="hostile-movement-title">Monster / Boss Movement</h3>
        <p id="hostile-movement-meta" class="muted">Waiting for a hostile Initiative Turn.</p>
      </div>
      <button id="hostile-movement-refresh" class="button button-small button-ghost" type="button">Refresh Move</button>
    </div>
    <div id="hostile-movement-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div id="hostile-movement-grid" style="display:grid;grid-template-columns:repeat(3,minmax(72px,1fr));gap:8px;max-width:360px"></div>
    <p class="muted">Normal hostile movement consumes the current Combatant's existing Move allowance. Use Runtime Map Place Entity only for GM correction/override.</p>
  </section>`;
}

function ensurePanel() {
  const active = $('#combat-active-panel');
  if (!active || $('#hostile-movement-panel')) return;
  const current = $('#combat-current-summary');
  if (current) current.insertAdjacentHTML('afterend', panelMarkup());
  else active.insertAdjacentHTML('beforeend', panelMarkup());
  $('#hostile-movement-refresh')?.addEventListener('click', () => loadMovement());
  $('#hostile-movement-grid')?.addEventListener('click', handleMoveClick);
  document.addEventListener('click', event => {
    if (event.target.closest?.('#end-current-turn, [data-force-turn], #combat-side-link, #end-combat')) {
      setTimeout(() => loadMovement({ quiet: true }), 250);
    }
  });
}

function setStatus(message = '', kind = '') {
  const box = $('#hostile-movement-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function deltaLabel(dx, dy) {
  if (dx === -1 && dy === -1) return 'NW';
  if (dx === 0 && dy === -1) return 'N';
  if (dx === 1 && dy === -1) return 'NE';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 1) return 'SW';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 1 && dy === 1) return 'SE';
  return '';
}

function renderMovement() {
  const panel = $('#hostile-movement-panel');
  const grid = $('#hostile-movement-grid');
  if (!panel || !grid) return;
  const hostile = movementState?.hostile;
  if (!hostile) {
    panel.classList.add('hidden');
    grid.innerHTML = '';
    return;
  }
  panel.classList.remove('hidden');
  const type = hostile.entityType === 'boss_instance' ? 'Boss' : 'Monster';
  $('#hostile-movement-title').textContent = `${type}: ${hostile.displayName}`;
  $('#hostile-movement-meta').textContent = `Round ${hostile.roundNumber} · ${hostile.locationName || hostile.map?.locationName || ''}${hostile.map?.mapName ? ` · ${hostile.map.mapName}` : ''} · Position (${hostile.position.x}, ${hostile.position.y}) · Move ${hostile.moveAvailable ? 'Ready' : 'Spent'}`;

  const legal = new Map((movementState?.legalMoves || []).map(move => [`${move.dx},${move.dy}`, move]));
  const cells = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        cells.push(`<button class="button button-ghost" type="button" disabled title="Current position">C<br><small>(${escapeHtml(hostile.position.x)}, ${escapeHtml(hostile.position.y)})</small></button>`);
        continue;
      }
      const move = legal.get(`${dx},${dy}`);
      const x = hostile.position.x + dx;
      const y = hostile.position.y + dy;
      cells.push(`<button class="button ${move ? '' : 'button-ghost'}" type="button" ${move && hostile.moveAvailable ? `data-hostile-move-x="${x}" data-hostile-move-y="${y}"` : 'disabled'}>${deltaLabel(dx, dy)}<br><small>(${x}, ${y})</small></button>`);
    }
  }
  grid.innerHTML = cells.join('');
}

async function loadMovement({ quiet = false } = {}) {
  ensurePanel();
  if (!quiet) setStatus('Loading hostile Move…');
  try {
    movementState = await api('/api/gm/combat/hostile-movement');
    renderMovement();
    setStatus('');
  } catch (error) {
    movementState = null;
    renderMovement();
    if (!quiet) setStatus(error.message, 'error');
  }
}

async function handleMoveClick(event) {
  const button = event.target.closest?.('[data-hostile-move-x][data-hostile-move-y]');
  if (!button) return;
  button.disabled = true;
  try {
    const payload = await api('/api/gm/combat/hostile-movement/move', {
      method: 'POST',
      body: JSON.stringify({ x: Number(button.dataset.hostileMoveX), y: Number(button.dataset.hostileMoveY) })
    });
    toast(`${payload.movement?.displayName || 'Hostile'} moved to (${payload.movement?.to?.x}, ${payload.movement?.to?.y}).`, 'success');
    await loadMovement({ quiet: true });
    $('#combat-side-link')?.click();
  } catch (error) {
    toast(error.message, 'error');
    await loadMovement({ quiet: true });
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && location.hash === '#combat') loadMovement({ quiet: true });
  }, 4000);
}

ensurePanel();
loadMovement({ quiet: true });
scheduleRefresh();
