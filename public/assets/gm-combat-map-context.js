import { $, escapeHtml, emptyState } from './common.js';

let contextState = null;
let refreshTimer = null;
let loading = false;

function ensureStylesheet() {
  if (document.querySelector('link[href="/assets/gm-combat-map-context.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/gm-combat-map-context.css';
  document.head.append(link);
}

async function api(url) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
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
  return `<section id="gm-combat-map-context" class="panel hidden">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">COMBAT MAP CONTEXT</p>
        <h3 id="gm-combat-map-title">Current Combatant Position</h3>
        <p id="gm-combat-map-meta" class="muted">Waiting for an active Combat.</p>
      </div>
      <button id="gm-combat-map-refresh" class="button button-small button-ghost" type="button">Refresh Map</button>
    </div>
    <div id="gm-combat-map-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div id="gm-combat-map-body"></div>
  </section>`;
}

function ensurePanel() {
  ensureStylesheet();
  const active = $('#combat-active-panel');
  if (!active || $('#gm-combat-map-context')) return;
  const initiative = $('#combat-initiative-list');
  if (initiative) initiative.insertAdjacentHTML('beforebegin', panelMarkup());
  else active.insertAdjacentHTML('beforeend', panelMarkup());
  $('#gm-combat-map-refresh')?.addEventListener('click', () => loadContext());
}

function setStatus(message = '', kind = '') {
  const box = $('#gm-combat-map-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function edgeSlotForCell(x, y, direction, width, height) {
  if (direction === 'E' && x < width - 1) return { x: x + 1, y, direction: 'W' };
  if (direction === 'S' && y < height - 1) return { x, y: y + 1, direction: 'N' };
  return { x, y, direction };
}

function edgeAt(detail, x, y, direction) {
  const width = Number(detail?.mapInstance?.width || 0);
  const height = Number(detail?.mapInstance?.height || 0);
  const slot = edgeSlotForCell(x, y, direction, width, height);
  return (detail?.edges || []).find(edge => Number(edge.x) === slot.x && Number(edge.y) === slot.y && edge.direction === slot.direction) || null;
}

function cellOverride(detail, x, y) {
  return (detail?.cells || []).find(cell => Number(cell.x) === x && Number(cell.y) === y) || null;
}

function positionsAt(detail, x, y) {
  return (detail?.positions || []).filter(position => Number(position.x) === x && Number(position.y) === y);
}

function tokenInitials(label = '') {
  const text = String(label || '?').trim() || '?';
  const words = text.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : text.slice(0, 2)).toUpperCase();
}

function tokenTypeLabel(entityType) {
  if (entityType === 'monster_instance') return 'Monster';
  if (entityType === 'boss_instance') return 'Boss';
  return 'Character';
}

function cellClasses(detail, x, y, current) {
  const classes = ['gm-combat-map-cell'];
  if (cellOverride(detail, x, y)?.isWalkable === false) classes.push('blocked');
  const positions = positionsAt(detail, x, y);
  if (positions.length) classes.push('occupied');
  if (positions.some(position => position.entityType === current.entityType && position.entityId === current.entityId)) {
    classes.push('current');
  }
  for (const direction of ['N', 'E', 'S', 'W']) {
    const edge = edgeAt(detail, x, y, direction);
    if (!edge) continue;
    classes.push(`edge-${direction.toLowerCase()}`);
    if (edge.edgeType === 'door') classes.push(`door-${direction.toLowerCase()}`);
    if (edge.edgeType === 'door' && (edge.doorState === 'open' || edge.doorState === 'broken')) {
      classes.push(`door-passable-${direction.toLowerCase()}`);
    }
  }
  return classes.join(' ');
}

function renderGrid(match) {
  const { detail, current } = match;
  const width = Number(detail.mapInstance.width);
  const height = Number(detail.mapInstance.height);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const positions = positionsAt(detail, x, y);
      const labels = [`(${x}, ${y})`, cellOverride(detail, x, y)?.isWalkable === false ? 'blocked' : 'walkable'];
      if (positions.length) labels.push(positions.map(position => `${tokenTypeLabel(position.entityType)}: ${position.displayName}`).join(', '));
      const tokens = positions.map(position => {
        const isCurrent = position.entityType === current.entityType && position.entityId === current.entityId;
        return `<span class="gm-combat-map-token ${position.entityType} ${isCurrent ? 'current' : ''}" title="${escapeHtml(`${tokenTypeLabel(position.entityType)} · ${position.displayName}`)}">${escapeHtml(tokenInitials(position.displayName))}</span>`;
      }).join('');
      cells.push(`<div class="${cellClasses(detail, x, y, current)}" role="gridcell" title="${escapeHtml(labels.join(' · '))}" aria-label="${escapeHtml(labels.join(', '))}"><span class="gm-combat-map-coordinate">${x},${y}</span>${tokens}</div>`);
    }
  }
  return `<div class="gm-combat-map-scroll"><div class="gm-combat-map-grid" role="grid" aria-label="Current Combat Runtime Map" style="grid-template-columns:repeat(${width},var(--gm-combat-map-cell-size))">${cells.join('')}</div></div>`;
}

function renderLegend(detail, current) {
  const positions = detail.positions || [];
  return `<div class="gm-combat-map-legend">
    <span class="tag">Current: ${escapeHtml(current.displayName)}</span>
    <span class="tag">Characters ${positions.filter(item => item.entityType === 'character').length}</span>
    <span class="tag">Monsters ${positions.filter(item => item.entityType === 'monster_instance').length}</span>
    <span class="tag">Bosses ${positions.filter(item => item.entityType === 'boss_instance').length}</span>
    <span class="tag">Door states shown as GM-authoritative</span>
  </div>`;
}

function renderContext() {
  ensurePanel();
  const panel = $('#gm-combat-map-context');
  const body = $('#gm-combat-map-body');
  if (!panel || !body) return;

  if (!contextState?.combat) {
    panel.classList.add('hidden');
    body.innerHTML = '';
    return;
  }

  panel.classList.remove('hidden');
  const current = contextState.combat.currentCombatant;
  if (!current) {
    $('#gm-combat-map-title').textContent = 'Current Combatant Position';
    $('#gm-combat-map-meta').textContent = `Round ${contextState.combat.roundNumber} · Current Turn invalid`;
    body.innerHTML = emptyState('No current Combatant', 'Combat turn state is incomplete.');
    return;
  }

  $('#gm-combat-map-title').textContent = `${current.displayName} · Map Context`;
  $('#gm-combat-map-meta').textContent = `Round ${contextState.combat.roundNumber} · Initiative ${Number(current.initiativeOrder) + 1} · Action ${current.actionAvailable ? 'Ready' : 'Spent'} · Move ${current.moveAvailable ? 'Ready' : 'Spent'}`;

  if (contextState.multipleMatches) {
    body.innerHTML = emptyState('Multiple active Runtime positions', `${current.displayName} is present on more than one active Runtime Map. Use World Map runtime tools to correct the duplicate position before relying on spatial Combat context.`);
    return;
  }

  if (!contextState.match) {
    body.innerHTML = emptyState('Current Combatant is not positioned', 'Combat remains usable, but spatial context cannot be shown until the current Character / Monster / Boss is placed on an active Runtime Map.');
    return;
  }

  const { detail, position } = contextState.match;
  const map = detail.mapInstance;
  $('#gm-combat-map-meta').textContent += ` · ${map.locationName} · ${map.mapName} · (${position.x}, ${position.y})`;
  body.innerHTML = `${renderLegend(detail, current)}${renderGrid(contextState.match)}`;
}

async function findCurrentPosition(current) {
  const overview = await api('/api/gm/world/runtime');
  const activeMaps = (overview.mapInstances || []).filter(map => map.status === 'active');
  const matches = [];
  for (const map of activeMaps) {
    const detail = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(map.id)}`);
    const positions = (detail.positions || []).filter(position => position.entityType === current.entityType && position.entityId === current.entityId);
    for (const position of positions) matches.push({ detail, position, current });
  }
  return matches;
}

async function loadContext({ quiet = false } = {}) {
  ensurePanel();
  if (loading) return;
  loading = true;
  if (!quiet) setStatus('Loading Combat Map context…');
  try {
    const payload = await api('/api/gm/combat');
    const combat = payload.combat && payload.combat.status === 'active' ? payload.combat : null;
    if (!combat) {
      contextState = { combat: null, match: null, multipleMatches: false };
      renderContext();
      setStatus('');
      return;
    }
    const current = combat.currentCombatant;
    const matches = current ? await findCurrentPosition(current) : [];
    contextState = {
      combat,
      match: matches.length === 1 ? matches[0] : null,
      multipleMatches: matches.length > 1
    };
    renderContext();
    setStatus('');
  } catch (error) {
    contextState = null;
    renderContext();
    if (!quiet) setStatus(error.message, 'error');
  } finally {
    loading = false;
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && location.hash === '#combat') loadContext({ quiet: true });
  }, 5000);
}

function watchCombatChanges() {
  document.addEventListener('click', event => {
    if (event.target.closest?.('#combat-side-link, #start-combat, #end-current-turn, #end-combat, [data-force-turn], [data-hostile-move-x], #runtime-map-detail-reload')) {
      setTimeout(() => loadContext({ quiet: true }), 650);
    }
  });
}

ensurePanel();
loadContext({ quiet: true });
scheduleRefresh();
watchCombatChanges();
