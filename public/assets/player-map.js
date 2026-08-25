import { $, escapeHtml, toast, emptyState } from './common.js';

let worldOverview = null;
let mapState = null;
let selectedCharacterId = '';
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
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Request failed.');
    error.code = payload?.error?.code || '';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setStatus(message = '', kind = '') {
  const box = $('#player-map-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function renderCharacterSelect() {
  const select = $('#player-map-character');
  if (!select) return;
  const characters = worldOverview?.characters || [];
  if (!characters.length) {
    select.innerHTML = '<option value="">No Characters</option>';
    selectedCharacterId = '';
    return;
  }
  const ids = new Set(characters.map(character => character.id));
  if (!ids.has(selectedCharacterId)) {
    selectedCharacterId = characters.find(character => character.hasCurrentMap)?.id || characters[0].id;
  }
  select.innerHTML = characters.map(character => {
    const suffix = character.locationConflict
      ? ' · LOCATION CONFLICT'
      : character.hasCurrentMap ? ' · on Map' : ' · not positioned';
    return `<option value="${escapeHtml(character.id)}" ${character.id === selectedCharacterId ? 'selected' : ''}>${escapeHtml(character.name)}${escapeHtml(suffix)}</option>`;
  }).join('');
}

function renderNoMap(reason = '') {
  mapState = null;
  $('#player-map-detail')?.classList.add('hidden');
  const empty = $('#player-map-empty');
  if (!empty) return;
  empty.classList.remove('hidden');
  empty.innerHTML = emptyState(
    reason === 'MULTIPLE_ACTIVE_MAP_POSITIONS' ? 'Location conflict' : 'No active Map position',
    reason === 'MULTIPLE_ACTIVE_MAP_POSITIONS'
      ? 'This Character is positioned on more than one active Runtime Map. Ask the GM to correct the placement.'
      : 'The GM needs to place this Character on an active Runtime Map before movement is available.'
  );
}

function canonicalEdgeSlot(x, y, direction) {
  const width = Number(mapState?.map?.width || 0);
  const height = Number(mapState?.map?.height || 0);
  if (direction === 'E' && x < width - 1) return { x: x + 1, y, direction: 'W' };
  if (direction === 'S' && y < height - 1) return { x, y: y + 1, direction: 'N' };
  return { x, y, direction };
}

function edgeAt(x, y, direction) {
  const slot = canonicalEdgeSlot(x, y, direction);
  return (mapState?.edges || []).find(edge => edge.x === slot.x && edge.y === slot.y && edge.direction === slot.direction) || null;
}

function cellOverride(x, y) {
  return (mapState?.cells || []).find(cell => cell.x === x && cell.y === y) || null;
}

function isWalkable(x, y) {
  return cellOverride(x, y)?.isWalkable !== false;
}

function tokensAt(x, y) {
  return (mapState?.tokens || []).filter(token => token.x === x && token.y === y);
}

function zonesAt(x, y) {
  return (mapState?.zones || []).filter(zone => zone.cells?.some(cell => cell.x === x && cell.y === y));
}

function legalKey(x, y) {
  return `${x},${y}`;
}

function cellClasses(x, y, legalSet) {
  const classes = ['player-map-cell'];
  if (!isWalkable(x, y)) classes.push('blocked');
  if (legalSet.has(legalKey(x, y))) classes.push('legal-move');
  if (tokensAt(x, y).length) classes.push('occupied');
  if (zonesAt(x, y).length) classes.push('in-zone');
  if (mapState?.position?.x === x && mapState?.position?.y === y) classes.push('own-position');
  for (const direction of ['N', 'E', 'S', 'W']) {
    const edge = edgeAt(x, y, direction);
    if (!edge) continue;
    classes.push(`edge-${direction.toLowerCase()}`);
    if (edge.edgeType === 'door') classes.push(`door-${direction.toLowerCase()}`);
    if (edge.edgeType === 'door' && !edge.blocksMovement) classes.push(`door-passable-${direction.toLowerCase()}`);
  }
  return classes.join(' ');
}

function initials(label) {
  const text = String(label || '?').trim();
  const words = text.split(/\s+/).filter(Boolean);
  return escapeHtml((words.length > 1 ? `${words[0][0]}${words[1][0]}` : text.slice(0, 2)).toUpperCase());
}

function tokenMarkup(token) {
  const typeClass = token.own ? 'own' : token.entityType === 'character' ? 'player' : 'hostile';
  return `<span class="player-map-token ${typeClass}" title="${escapeHtml(token.displayName)}">${initials(token.displayName)}</span>`;
}

function renderGrid() {
  const grid = $('#player-map-grid');
  if (!grid || !mapState?.map) return;
  const { width, height } = mapState.map;
  const legalSet = new Set((mapState.legalMoves || []).map(move => legalKey(move.x, move.y)));
  grid.style.gridTemplateColumns = `repeat(${width}, var(--player-map-cell-size))`;
  if (mapState.map.backgroundAssetRef) {
    grid.style.backgroundImage = `url("${String(mapState.map.backgroundAssetRef).replaceAll('"', '\\"')}")`;
  } else {
    grid.style.backgroundImage = '';
  }
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tokens = tokensAt(x, y);
      const zones = zonesAt(x, y);
      const legal = legalSet.has(legalKey(x, y));
      const labels = [`(${x}, ${y})`, isWalkable(x, y) ? 'walkable' : 'blocked'];
      if (legal) labels.push('legal Move');
      if (tokens.length) labels.push(tokens.map(token => token.displayName).join(', '));
      if (zones.length) labels.push(`Zone: ${zones.map(zone => zone.name).join(', ')}`);
      cells.push(`<button type="button" class="${cellClasses(x, y, legalSet)}" data-player-map-cell data-x="${x}" data-y="${y}" aria-label="${escapeHtml(labels.join(', '))}" title="${escapeHtml(labels.join(' · '))}" ${legal ? '' : 'disabled'}>${tokens.map(tokenMarkup).join('')}</button>`);
    }
  }
  grid.innerHTML = cells.join('');
}

function renderTurn() {
  const turn = mapState?.turn;
  const target = $('#player-map-turn');
  if (!target || !turn) return;
  const mode = turn.mode === 'combat' ? 'COMBAT' : 'EXPLORATION';
  const ownTurnText = turn.mode === 'combat' ? (turn.isOwnTurn ? 'Your Turn' : 'Waiting') : (turn.turnCompleted ? 'Round Done' : 'Ready');
  target.innerHTML = `<div class="row-inline">
    <span class="tag">${escapeHtml(mode)}</span>
    <span class="tag">Round ${escapeHtml(turn.roundNumber)}</span>
    <span class="status-pill">${escapeHtml(ownTurnText)}</span>
    <span class="tag">Action ${turn.actionAvailable ? 'Ready' : 'Spent'}</span>
    <span class="tag">Move ${turn.moveAvailable ? 'Ready' : 'Spent'}</span>
  </div>`;

  const action = $('#player-map-spend-action');
  const end = $('#player-map-end-exploration');
  const exploration = turn.mode === 'exploration';
  action.classList.toggle('hidden', !exploration);
  end.classList.toggle('hidden', !exploration);
  action.disabled = !exploration || !turn.actionAvailable || turn.turnCompleted || mapState.character?.lifeState !== 'alive';
  end.disabled = !exploration || turn.turnCompleted || mapState.character?.lifeState !== 'alive';
}

function renderMapDetail() {
  if (!mapState?.map) return renderNoMap();
  $('#player-map-empty')?.classList.add('hidden');
  $('#player-map-detail')?.classList.remove('hidden');
  $('#player-map-location').textContent = mapState.map.locationName;
  $('#player-map-scene').textContent = `${mapState.map.scenarioName} → ${mapState.map.sceneName}`;
  $('#player-map-name').textContent = `${mapState.map.mapName} · ${mapState.map.width}×${mapState.map.height}`;
  $('#player-map-position').textContent = `Position (${mapState.position.x}, ${mapState.position.y})`;
  renderTurn();
  renderGrid();
}

async function loadSelectedMap({ quiet = false } = {}) {
  if (!selectedCharacterId) return renderNoMap();
  try {
    if (!quiet) setStatus('Loading current Map…');
    mapState = await api(`/api/player/world/characters/${encodeURIComponent(selectedCharacterId)}`);
    if (!mapState.map) renderNoMap(mapState.reason || '');
    else renderMapDetail();
    if (!quiet) setStatus('');
  } catch (error) {
    if (error.code === 'MULTIPLE_ACTIVE_MAP_POSITIONS') renderNoMap(error.code);
    else if (!quiet) setStatus(error.message, 'error');
  }
}

async function loadWorld({ quiet = false } = {}) {
  try {
    if (!quiet) setStatus('Loading world context…');
    worldOverview = await api('/api/player/world');
    renderCharacterSelect();
    await loadSelectedMap({ quiet: true });
    if (!quiet) setStatus('');
  } catch (error) {
    if (!quiet) setStatus(error.message, 'error');
  }
}

async function moveTo(x, y) {
  if (!selectedCharacterId) return;
  setStatus('Resolving Move…');
  try {
    const payload = await api(`/api/player/world/characters/${encodeURIComponent(selectedCharacterId)}/move`, {
      method: 'POST',
      body: JSON.stringify({ x, y })
    });
    mapState = payload;
    renderMapDetail();
    setStatus('');
    toast(`Moved to (${x}, ${y}). Move spent.`, 'success');
    window.dispatchEvent(new CustomEvent('dnd:map-state-changed', { detail: { characterId: selectedCharacterId } }));
  } catch (error) {
    setStatus(error.message, 'error');
    await loadSelectedMap({ quiet: true });
  }
}

async function spendExplorationAction() {
  if (!selectedCharacterId) return;
  const button = $('#player-map-spend-action');
  button.disabled = true;
  try {
    mapState = await api(`/api/player/world/characters/${encodeURIComponent(selectedCharacterId)}/consume-action`, {
      method: 'POST', body: JSON.stringify({})
    });
    renderMapDetail();
    toast('Exploration Action marked as spent.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadSelectedMap({ quiet: true });
  }
}

async function endExplorationTurn() {
  if (!selectedCharacterId) return;
  const button = $('#player-map-end-exploration');
  button.disabled = true;
  try {
    const payload = await api(`/api/player/world/characters/${encodeURIComponent(selectedCharacterId)}/end-exploration-turn`, {
      method: 'POST', body: JSON.stringify({})
    });
    mapState = payload;
    renderMapDetail();
    toast(payload.roundAdvanced ? `Exploration Round ${payload.turn?.roundNumber || ''} started.` : 'Exploration Turn completed.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadSelectedMap({ quiet: true });
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadWorld({ quiet: true });
  }, 5000);
}

$('#player-map-character')?.addEventListener('change', event => {
  selectedCharacterId = event.target.value || '';
  loadSelectedMap();
});
$('#player-map-refresh')?.addEventListener('click', () => loadWorld());
$('#player-map-grid')?.addEventListener('click', event => {
  const cell = event.target.closest?.('[data-player-map-cell]');
  if (!cell || cell.disabled) return;
  moveTo(Number(cell.dataset.x), Number(cell.dataset.y));
});
$('#player-map-spend-action')?.addEventListener('click', spendExplorationAction);
$('#player-map-end-exploration')?.addEventListener('click', endExplorationTurn);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadWorld({ quiet: true });
});
window.addEventListener('dnd:combat-state-changed', () => loadSelectedMap({ quiet: true }));

loadWorld();
scheduleRefresh();
