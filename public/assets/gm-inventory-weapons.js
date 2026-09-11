import { $, escapeHtml, toast } from './common.js';

let selectedCharacterId = '';
let weaponDefinitions = [];
let inventory = [];
let profiles = [];
let refreshQueued = false;

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
    location.replace('/gm/login/?next=%2Fgm%2F');
    throw new Error('Admin session expired.');
  }
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function ensurePanel() {
  if ($('#gm-inventory-weapon-panel')) return;
  const attackPanel = $('#gm-attack-profile-panel');
  if (!attackPanel) return;
  const panel = document.createElement('section');
  panel.id = 'gm-inventory-weapon-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading">
      <div><h3>Inventory / Weapon Equipment</h3><span class="muted">D1 authoritative ownership. Weapon combat numbers still come from approved Attack Profiles in this Alpha slice.</span></div>
    </div>
    <div id="gm-inventory-weapon-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="split-grid">
      <section>
        <h4>Author Weapon Definition</h4>
        <div class="form-grid compact-grid">
          <label class="field"><span>Name</span><input id="gm-weapon-name" class="input" maxlength="120" placeholder="e.g. Longsword"></label>
          <label class="field"><span>Weapon Group</span><input id="gm-weapon-group" class="input" maxlength="80" placeholder="e.g. sword"></label>
          <label class="field"><span>Damage Formula</span><input id="gm-weapon-damage" class="input" maxlength="120" placeholder="metadata only, e.g. 1D8"></label>
          <label class="field"><span>Damage Type</span><input id="gm-weapon-damage-type" class="input" maxlength="80" placeholder="e.g. slashing"></label>
          <label class="field"><span>Hit Modifier</span><input id="gm-weapon-hit-mod" class="input" type="number" step="1" value="0"><small>Stored as Weapon metadata only; not applied to attack math yet.</small></label>
        </div>
        <div class="form-actions"><button id="gm-create-weapon-definition" class="button" type="button">Create Weapon Definition</button></div>
      </section>
      <section>
        <h4>Grant Weapon to Character</h4>
        <label class="field"><span>Weapon Definition</span><select id="gm-grant-weapon-definition" class="input"><option value="">No active Weapon Definitions</option></select></label>
        <div class="form-actions"><button id="gm-grant-weapon" class="button" type="button" disabled>Grant Weapon</button></div>
        <p class="muted">Each Weapon is a non-stackable Character Inventory entry with quantity 1. Multiple Weapons may be marked equipped in this foundation; hand-slot capacity is not defined yet.</p>
      </section>
    </div>
    <div class="split-grid">
      <section>
        <div class="panel-heading"><h4>Character Inventory</h4><span class="muted">Weapon equip state is authoritative.</span></div>
        <div id="gm-canonical-inventory-list" class="stack-list"><p class="muted">Open a Character to load Inventory.</p></div>
      </section>
      <section>
        <div class="panel-heading"><h4>Attack Profile → Weapon Source</h4><span class="muted">Linked Profiles are usable only while that Weapon remains owned, active and equipped.</span></div>
        <div id="gm-profile-weapon-bindings" class="stack-list"><p class="muted">Open a Character to load Profile bindings.</p></div>
      </section>
    </div>`;
  attackPanel.parentNode.insertBefore(panel, attackPanel);
}

function setStatus(message = '', kind = '') {
  const box = $('#gm-inventory-weapon-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function renderDefinitions() {
  const select = $('#gm-grant-weapon-definition');
  const grant = $('#gm-grant-weapon');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = weaponDefinitions.length
    ? '<option value="">Select Weapon</option>' + weaponDefinitions.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${item.weapon?.damageFormula ? ` · ${escapeHtml(item.weapon.damageFormula)}` : ''}</option>`).join('')
    : '<option value="">No active Weapon Definitions</option>';
  if (weaponDefinitions.some(item => item.id === previous)) select.value = previous;
  if (grant) grant.disabled = !selectedCharacterId || !select.value;
}

function weaponInventory() {
  return inventory.filter(item => item.itemType === 'WEAPON' && item.quantity === 1 && item.active);
}

function renderInventory() {
  const target = $('#gm-canonical-inventory-list');
  if (!target) return;
  if (!selectedCharacterId) {
    target.innerHTML = '<p class="muted">Open a Character to load Inventory.</p>';
    return;
  }
  if (!inventory.length) {
    target.innerHTML = '<p class="muted">Inventory is empty.</p>';
    return;
  }
  target.innerHTML = inventory.map(item => `<article class="stack-item">
    <div style="flex:1;min-width:0">
      <div class="row-inline"><h4>${escapeHtml(item.name)}</h4><span class="tag">${escapeHtml(item.itemType)}</span>${item.isEquipped ? '<span class="status-pill">equipped</span>' : ''}</div>
      <p>${escapeHtml(item.description || 'No description')}</p>
      ${item.weapon ? `<small>${escapeHtml(item.weapon.weaponGroup || 'weapon')} · ${escapeHtml(item.weapon.damageFormula || 'damage not authored')} · hit modifier ${escapeHtml(item.weapon.hitModifier)}</small>` : `<small>Qty ${escapeHtml(item.quantity)}</small>`}
      <small class="muted">Inventory ID: ${escapeHtml(item.id)} · Definition: ${escapeHtml(item.itemDefinitionId)} · Rev ${escapeHtml(item.revision)}</small>
    </div>
    <div class="quantity-editor">
      ${item.itemType === 'WEAPON' ? `<button class="button button-small ${item.isEquipped ? 'button-ghost' : ''}" type="button" data-gm-toggle-equip="${escapeHtml(item.id)}" data-revision="${escapeHtml(item.revision)}" data-next="${item.isEquipped ? 'false' : 'true'}">${item.isEquipped ? 'Unequip' : 'Equip'}</button>` : ''}
    </div>
  </article>`).join('');
}

function sourceOptions(selected = '') {
  const weapons = weaponInventory();
  return '<option value="">Legacy bridge / no Weapon source</option>' + weapons.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.name)}${item.isEquipped ? ' · equipped' : ' · not equipped'}</option>`).join('');
}

function renderBindings() {
  const target = $('#gm-profile-weapon-bindings');
  if (!target) return;
  if (!selectedCharacterId) {
    target.innerHTML = '<p class="muted">Open a Character to load Profile bindings.</p>';
    return;
  }
  if (!profiles.length) {
    target.innerHTML = '<p class="muted">No Attack Profiles yet.</p>';
    return;
  }
  target.innerHTML = profiles.map(profile => `<article class="stack-item">
    <div style="flex:1;min-width:0">
      <div class="row-inline"><h4>${escapeHtml(profile.name)}</h4><span class="tag">${escapeHtml(profile.sourceType || 'legacy_bridge')}</span>${profile.sourceInventoryId && !profile.sourceAvailable ? '<span class="status-pill">source unavailable</span>' : ''}</div>
      <label class="field"><span>Weapon source</span><select class="input" data-profile-source="${escapeHtml(profile.id)}">${sourceOptions(profile.sourceInventoryId || '')}</select></label>
    </div>
  </article>`).join('');
}

async function loadDefinitions() {
  const payload = await api('/api/gm/items');
  weaponDefinitions = payload.items || [];
  renderDefinitions();
}

async function loadCharacterData() {
  if (!selectedCharacterId) {
    inventory = [];
    profiles = [];
    renderInventory();
    renderBindings();
    renderDefinitions();
    return;
  }
  const [inventoryPayload, profilePayload] = await Promise.all([
    api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/inventory`),
    api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/attack-profiles`)
  ]);
  inventory = inventoryPayload.inventory || [];
  profiles = profilePayload.profiles || [];
  renderInventory();
  renderBindings();
  renderDefinitions();
}

async function refreshAll() {
  ensurePanel();
  setStatus('Loading Inventory / Weapon authority…');
  try {
    await loadDefinitions();
    await loadCharacterData();
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(async () => {
    refreshQueued = false;
    await loadCharacterData().catch(error => setStatus(error.message, 'error'));
  });
}

async function createWeapon() {
  const button = $('#gm-create-weapon-definition');
  if (button) button.disabled = true;
  try {
    await api('/api/gm/items', {
      method: 'POST',
      body: JSON.stringify({
        itemType: 'WEAPON',
        name: $('#gm-weapon-name')?.value || '',
        weapon: {
          weaponGroup: $('#gm-weapon-group')?.value || '',
          damageFormula: $('#gm-weapon-damage')?.value || '',
          damageType: $('#gm-weapon-damage-type')?.value || '',
          hitModifier: Number($('#gm-weapon-hit-mod')?.value || 0)
        }
      })
    });
    $('#gm-weapon-name').value = '';
    await loadDefinitions();
    toast('Weapon Definition created.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function grantWeapon() {
  const definitionId = $('#gm-grant-weapon-definition')?.value || '';
  if (!selectedCharacterId || !definitionId) return;
  const button = $('#gm-grant-weapon');
  if (button) button.disabled = true;
  try {
    await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/inventory`, {
      method: 'POST', body: JSON.stringify({ itemDefinitionId: definitionId })
    });
    await loadCharacterData();
    toast('Weapon granted to Character.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    if (button) button.disabled = !selectedCharacterId || !definitionId;
  }
}

async function toggleEquip(button) {
  if (!selectedCharacterId) return;
  button.disabled = true;
  try {
    await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/inventory/${encodeURIComponent(button.dataset.gmToggleEquip)}`, {
      method: 'PATCH',
      body: JSON.stringify({ isEquipped: button.dataset.next === 'true', revision: Number(button.dataset.revision) })
    });
    await loadCharacterData();
    toast('Weapon equipment state updated.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadCharacterData().catch(() => {});
  }
}

async function bindProfile(select) {
  if (!selectedCharacterId) return;
  select.disabled = true;
  try {
    await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/attack-profiles/${encodeURIComponent(select.dataset.profileSource)}`, {
      method: 'PATCH', body: JSON.stringify({ sourceInventoryId: select.value || null })
    });
    await loadCharacterData();
    toast('Attack Profile Weapon source updated.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadCharacterData().catch(() => {});
  }
}

ensurePanel();
refreshAll();

$('#gm-create-weapon-definition')?.addEventListener('click', createWeapon);
$('#gm-grant-weapon-definition')?.addEventListener('change', renderDefinitions);
$('#gm-grant-weapon')?.addEventListener('click', grantWeapon);

document.addEventListener('click', event => {
  const open = event.target.closest?.('[data-open-character]');
  if (open) {
    selectedCharacterId = open.dataset.openCharacter || '';
    queueRefresh();
    return;
  }
  if (event.target.closest?.('#close-gm-character')) {
    selectedCharacterId = '';
    inventory = [];
    profiles = [];
    renderInventory();
    renderBindings();
    renderDefinitions();
    return;
  }
  const equip = event.target.closest?.('[data-gm-toggle-equip]');
  if (equip) toggleEquip(equip);
});

document.addEventListener('change', event => {
  const source = event.target.closest?.('[data-profile-source]');
  if (source) bindProfile(source);
});

const profileList = $('#gm-attack-profile-list');
if (profileList) {
  new MutationObserver(() => {
    if (selectedCharacterId) queueRefresh();
  }).observe(profileList, { childList: true, subtree: false });
}
