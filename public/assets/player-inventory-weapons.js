import './player-abilities.js';
import { $, escapeHtml, toast, emptyState } from './common.js';

let activeCharacterId = '';
let renderToken = 0;
let inventoryPending = false;
let loadedCharacterId = '';

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

function selectedCharacterId() {
  return document.querySelector('.character-card.selected')?.dataset.characterId || '';
}

function clearInventory(message) {
  loadedCharacterId = '';
  const target = $('#inventory-list');
  if (target) target.innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
}

function isInventoryTabVisible() {
  return !$('#tab-inventory')?.classList.contains('hidden');
}

function renderInventory(items = []) {
  const target = $('#inventory-list');
  if (!target) return;
  const visibleItems = items.filter(item => String(item.itemSubtype || '').toUpperCase() !== 'CURRENCY');
  if (!visibleItems.length) {
    target.innerHTML = emptyState('Inventory is empty', 'No non-Currency canonical Items have been added yet. Coins are managed in the Currency panel above.');
    return;
  }
  target.innerHTML = visibleItems.map(item => `<article class="stack-item" data-canonical-inventory-row="${escapeHtml(item.id)}" data-inventory-character="${escapeHtml(loadedCharacterId)}">
    <div style="flex:1;min-width:0">
      <div class="row-inline">
        <h4>${escapeHtml(item.name)}</h4>
        <span class="tag">${escapeHtml(item.itemType)}</span>
        ${item.isEquipped ? '<span class="status-pill">equipped</span>' : ''}
        ${!item.active ? '<span class="status-pill">inactive definition</span>' : ''}
      </div>
      <p>${escapeHtml(item.description || 'No description')}</p>
      ${item.weapon ? `<small>${escapeHtml(item.weapon.weaponGroup || 'weapon')} · ${escapeHtml(item.weapon.damageFormula || 'damage metadata not authored')} · ${escapeHtml(item.weapon.damageType || 'type not authored')}</small>` : ''}
      <small class="muted">Definition ${escapeHtml(item.itemDefinitionId)} · Rev ${escapeHtml(item.revision)}</small>
    </div>
    <div class="quantity-editor">
      ${item.itemType === 'WEAPON'
        ? `<span class="muted">Qty 1</span><button class="button button-small ${item.isEquipped ? 'button-ghost' : ''}" type="button" data-player-toggle-equip="${escapeHtml(item.id)}" data-revision="${escapeHtml(item.revision)}" data-next="${item.isEquipped ? 'false' : 'true'}" ${!item.active ? 'disabled' : ''}>${item.isEquipped ? 'Unequip' : 'Equip'}</button>`
        : `<span class="muted">Qty</span><input class="input input-compact" type="number" min="0" value="${escapeHtml(item.quantity)}" data-player-item-qty="${escapeHtml(item.id)}"><button class="button button-small button-ghost" type="button" data-player-item-save="${escapeHtml(item.id)}" data-revision="${escapeHtml(item.revision)}">Save</button>`}
    </div>
  </article>`).join('');
}

async function loadInventory({ force = false } = {}) {
  const id = selectedCharacterId();
  if (id !== activeCharacterId) {
    activeCharacterId = id;
    ++renderToken;
    clearInventory(id ? '正在載入背包…' : '請先選擇角色。');
  }
  if (!id || inventoryPending || (!force && !isInventoryTabVisible())) return;
  const token = ++renderToken;
  clearInventory('正在載入背包…');
  try {
    const payload = await api(`/api/player/characters/${encodeURIComponent(id)}/inventory`);
    if (token !== renderToken || id !== selectedCharacterId()) return;
    loadedCharacterId = id;
    renderInventory(payload.inventory || []);
  } catch (error) {
    if (token !== renderToken || id !== selectedCharacterId()) return;
    clearInventory('背包載入失敗，請重新點選 Inventory 頁籤再試。');
    toast(error.message, 'error');
  }
}

async function patchItem(button, body) {
  const id = selectedCharacterId();
  const ownerId = button.closest('[data-inventory-character]')?.dataset.inventoryCharacter;
  if (inventoryPending || !id || id !== loadedCharacterId || id !== ownerId || button.disabled) return;
  const itemId = button.dataset.playerToggleEquip || button.dataset.playerItemSave;
  const revision = Number(button.dataset.revision);
  inventoryPending = true;
  ++renderToken;
  button.disabled = true;
  clearInventory('正在更新背包…');
  try {
    await api(`/api/player/characters/${encodeURIComponent(id)}/inventory/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...body, revision })
    });
    toast('Inventory updated.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    inventoryPending = false;
    await loadInventory({ force: true });
  }
}

document.addEventListener('click', event => {
  const inventoryTab = event.target.closest?.('[data-tab="inventory"]');
  if (inventoryTab) {
    queueMicrotask(() => loadInventory({ force: true }).catch(error => toast(error.message, 'error')));
    return;
  }

  if (event.target.closest?.('#close-character')) {
    activeCharacterId = '';
    renderToken += 1;
    clearInventory('請先選擇角色。');
    return;
  }

  const equip = event.target.closest?.('[data-player-toggle-equip]');
  if (equip) {
    patchItem(equip, { isEquipped: equip.dataset.next === 'true' });
    return;
  }

  const save = event.target.closest?.('[data-player-item-save]');
  if (save) {
    const input = document.querySelector(`[data-player-item-qty="${CSS.escape(save.dataset.playerItemSave)}"]`);
    const quantity = Number(input?.value);
    if (!Number.isInteger(quantity) || quantity < 0) return toast('Quantity must be a non-negative integer.', 'error');
    patchItem(save, { quantity });
  }
});

const characterList = $('#character-list');
if (characterList) {
  new MutationObserver(() => { void loadInventory(); }).observe(characterList, { childList: true, subtree: true });
}
