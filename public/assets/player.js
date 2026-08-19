import { Store } from './store.js';
import { $, $$, escapeHtml, downloadText, toast, bindThemeToggle, emptyState } from './common.js';

let currentUser = null;
let selectedCharacterId = '';

function getState() { return Store.snapshot(); }
function selectedPlayer(state) { return currentUser ? state.players.find(player => player.id === currentUser.id) || null : null; }
function selectedCharacter(state) { return state.characters.find(character => character.id === selectedCharacterId) || null; }

function characterPortrait(character, state) {
  if (!character?.portraitAssetId) return '';
  const asset = state.assets.find(item => item.id === character.portraitAssetId);
  return asset?.dataUrl || asset?.url || '';
}

function ensureLocalPlayer(user) {
  const existing = Store.findPlayer(user.id);
  if (!existing) {
    Store.createPlayer({ id: user.id, displayName: user.displayName, status: 'active', notes: '' });
    return;
  }
  if (existing.displayName !== user.displayName || existing.status !== 'active') {
    Store.updatePlayer(user.id, { displayName: user.displayName, status: 'active' });
  }
}

function renderCharacterCards(state, player) {
  const list = $('#character-list');
  const characters = state.characters
    .filter(character => character.ownerPlayerId === player.id && character.status !== 'retired')
    .sort((a, b) => a.name.localeCompare(b.name));

  $('#player-heading').textContent = `${player.displayName}'s Characters`;
  if (!characters.length) {
    list.innerHTML = emptyState('未有角色分配', '你嘅帳戶已經建立並受到密碼保護，但目前未有角色分配到呢個 User ID。之後 GM 後端整合會直接由伺服器處理角色分配。');
    $('#character-detail').classList.add('hidden');
    return;
  }

  list.innerHTML = characters.map(character => {
    const portrait = characterPortrait(character, state);
    return `<button class="character-card ${selectedCharacterId === character.id ? 'selected' : ''}" type="button" data-character-id="${escapeHtml(character.id)}">
      <div class="card-portrait" ${portrait ? `style="background-image:url('${escapeHtml(portrait)}')"` : ''}>${portrait ? '' : '<span>D20</span>'}</div>
      <div class="character-card-body"><div class="row-inline"><span class="status-pill">${escapeHtml(character.status)}</span><span class="muted">Lv ${escapeHtml(character.level)}</span></div><h3>${escapeHtml(character.name)}</h3><p>${escapeHtml(character.role || 'No role')}</p></div>
    </button>`;
  }).join('');

  $$('[data-character-id]', list).forEach(button => button.addEventListener('click', () => {
    selectedCharacterId = button.dataset.characterId;
    render();
    $('#character-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  if (selectedCharacterId && !characters.some(character => character.id === selectedCharacterId)) {
    selectedCharacterId = '';
    $('#character-detail').classList.add('hidden');
  }
}

function renderAttributes(character) {
  const target = $('#attribute-grid');
  target.innerHTML = character.attributes.length
    ? character.attributes.map(attribute => `<div class="stat-card" title="${escapeHtml(attribute.description)}"><span>${escapeHtml(attribute.label)}</span><strong>${escapeHtml(attribute.value)}</strong></div>`).join('')
    : '<p class="muted">No attributes configured by the GM.</p>';
}

function renderResources(character) {
  const target = $('#resource-list');
  if (!character.resources.length) { target.innerHTML = '<p class="muted">No resources configured by the GM.</p>'; return; }
  target.innerHTML = character.resources.map(resource => {
    const max = Number(resource.max) || 0;
    const current = Number(resource.current) || 0;
    const ratio = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    return `<div class="resource-row"><div class="resource-meta"><div><strong>${escapeHtml(resource.label)}</strong>${resource.description ? `<small>${escapeHtml(resource.description)}</small>` : ''}</div><span>${current}${max ? ` / ${max}` : ''}</span></div>${max ? `<div class="meter"><span style="width:${ratio}%"></span></div>` : ''}<div class="row-inline"><input class="input input-compact" type="number" value="${current}" data-resource-current="${escapeHtml(resource.id)}"><button class="button button-small button-ghost" type="button" data-resource-save="${escapeHtml(resource.id)}">Update</button></div></div>`;
  }).join('');
  $$('[data-resource-save]', target).forEach(button => button.addEventListener('click', () => {
    const input = $(`[data-resource-current="${CSS.escape(button.dataset.resourceSave)}"]`, target);
    const next = Number(input.value);
    if (!Number.isFinite(next)) return toast('Enter a valid number.', 'error');
    const currentCharacter = getState().characters.find(item => item.id === character.id);
    Store.updateCharacter(character.id, { resources: currentCharacter.resources.map(resource => resource.id === button.dataset.resourceSave ? { ...resource, current: next } : resource) });
    toast('Resource updated.', 'success');
  }));
}

function renderInventory(character) {
  const target = $('#inventory-list');
  if (!character.inventory.length) { target.innerHTML = emptyState('Inventory is empty', 'The GM has not added any items.'); return; }
  target.innerHTML = character.inventory.map(item => `<article class="stack-item"><div><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.notes || 'No notes')}</p></div><div class="quantity-editor"><span class="muted">Qty</span><input class="input input-compact" type="number" min="0" value="${escapeHtml(item.qty)}" data-item-qty="${escapeHtml(item.id)}"><button class="button button-small button-ghost" type="button" data-item-save="${escapeHtml(item.id)}">Save</button></div></article>`).join('');
  $$('[data-item-save]', target).forEach(button => button.addEventListener('click', () => {
    const input = $(`[data-item-qty="${CSS.escape(button.dataset.itemSave)}"]`, target);
    const next = Math.max(0, Number(input.value) || 0);
    const currentCharacter = getState().characters.find(item => item.id === character.id);
    Store.updateCharacter(character.id, { inventory: currentCharacter.inventory.map(item => item.id === button.dataset.itemSave ? { ...item, qty: next } : item) });
    toast('Inventory updated.', 'success');
  }));
}

function renderAbilities(character) {
  const target = $('#ability-list');
  if (!character.abilities.length) { target.innerHTML = emptyState('No abilities', 'The GM has not added any abilities.'); return; }
  target.innerHTML = character.abilities.map(ability => `<article class="stack-item"><div><div class="row-inline"><h4>${escapeHtml(ability.name)}</h4><span class="tag">${escapeHtml(ability.type)}</span>${ability.proficient ? '<span class="tag tag-accent">Proficient</span>' : ''}</div><p>${escapeHtml(ability.description || 'No description')}</p></div></article>`).join('');
}

function renderCharacterDetail(state) {
  const character = selectedCharacter(state);
  const detail = $('#character-detail');
  if (!character) { detail.classList.add('hidden'); return; }
  detail.classList.remove('hidden');
  $('#character-name').textContent = character.name;
  $('#character-role').textContent = character.role || 'No role';
  $('#character-level').textContent = `Level ${character.level}`;
  $('#character-status').textContent = character.status;
  $('#character-summary').textContent = character.summary || 'No summary.';
  $('#character-notes').value = character.notes || '';
  const portrait = characterPortrait(character, state);
  const avatar = $('#character-avatar');
  if (portrait) { avatar.style.backgroundImage = `url("${portrait.replaceAll('"', '\\"')}")`; avatar.textContent = ''; }
  else { avatar.style.backgroundImage = ''; avatar.textContent = 'D20'; }
  renderAttributes(character);
  renderResources(character);
  renderInventory(character);
  renderAbilities(character);
}

function render() {
  if (!currentUser) return;
  const state = getState();
  $('#campaign-name').textContent = state.settings.campaignName || 'D&D Campaign';
  const player = selectedPlayer(state);
  if (!player) return;
  renderCharacterCards(state, player);
  renderCharacterDetail(state);
}

function switchTab(name) {
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  $$('.tab-panel').forEach(panel => panel.classList.add('hidden'));
  $(`#tab-${name}`)?.classList.remove('hidden');
}

async function loadCurrentUser() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (response.status === 401) { location.replace('/player/login/?next=/player/'); return; }
  if (!response.ok) throw new Error('暫時無法驗證玩家帳戶。');
  const payload = await response.json();
  currentUser = payload.user;
  ensureLocalPlayer(currentUser);
  $('#player-user-name').textContent = currentUser.displayName;
  $('#player-username').textContent = `@${currentUser.username}`;
  $('#auth-loading').classList.add('hidden');
  $('#player-content').classList.remove('hidden');
  render();
}

$('#logout-button')?.addEventListener('click', async () => {
  const button = $('#logout-button');
  button.disabled = true;
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } }); }
  finally { location.replace('/player/login/'); }
});

$('#close-character')?.addEventListener('click', () => { selectedCharacterId = ''; render(); });
$('#export-character')?.addEventListener('click', () => {
  const character = selectedCharacter(getState());
  if (!character) return;
  const safeName = character.name.replace(/[^\w\u3400-\u9fff-]+/g, '_');
  downloadText(`${safeName || 'character'}.json`, JSON.stringify(character, null, 2));
});
$('#save-notes')?.addEventListener('click', () => {
  const character = selectedCharacter(getState());
  if (!character) return;
  Store.updateCharacter(character.id, { notes: $('#character-notes').value });
  toast('Notes saved.', 'success');
});
$$('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
bindThemeToggle($('#theme-toggle'));
window.addEventListener('dnd:datachange', render);

loadCurrentUser().catch(error => {
  console.error(error);
  $('#auth-loading').innerHTML = emptyState('帳戶驗證失敗', error.message || 'Authentication unavailable.');
});
