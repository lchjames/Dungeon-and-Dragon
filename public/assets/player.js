import { $, $$, escapeHtml, downloadText, toast, bindThemeToggle, emptyState } from './common.js';

let bootstrap = null;
let selectedCharacterId = '';
let selectedCharacter = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
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

function characterPortrait(character) { return character?.portraitUrl || ''; }

function renderCharacterCards() {
  const list = $('#character-list');
  const characters = bootstrap?.characters || [];
  $('#player-heading').textContent = `${bootstrap.user.displayName}'s Characters`;
  if (!characters.length) {
    list.innerHTML = emptyState('未有角色分配', '你的帳戶已經建立。角色需要由 GM 分配到你的 User ID 後先會喺呢度出現。');
    $('#character-detail').classList.add('hidden');
    return;
  }
  list.innerHTML = characters.map(character => {
    const portrait = characterPortrait(character);
    return `<button class="character-card ${selectedCharacterId === character.id ? 'selected' : ''}" type="button" data-character-id="${escapeHtml(character.id)}">
      <div class="card-portrait" ${portrait ? `style="background-image:url('${escapeHtml(portrait)}')"` : ''}>${portrait ? '' : '<span>D20</span>'}</div>
      <div class="character-card-body"><div class="row-inline"><span class="status-pill">${escapeHtml(character.status)}</span><span class="muted">Lv ${escapeHtml(character.level)}</span></div><h3>${escapeHtml(character.name)}</h3><p>${escapeHtml(character.role || 'No role')}</p></div>
    </button>`;
  }).join('');
  $$('[data-character-id]', list).forEach(button => button.addEventListener('click', async () => {
    await openCharacter(button.dataset.characterId);
    $('#character-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderAttributes(character) {
  $('#attribute-grid').innerHTML = character.attributes.length
    ? character.attributes.map(attribute => `<div class="stat-card" title="${escapeHtml(attribute.description)}"><span>${escapeHtml(attribute.label)}</span><strong>${escapeHtml(attribute.value)}</strong></div>`).join('')
    : '<p class="muted">No attributes configured by the GM.</p>';
}

function renderResources(character) {
  const target = $('#resource-list');
  if (!character.resources.length) { target.innerHTML = '<p class="muted">No resources configured by the GM.</p>'; return; }
  target.innerHTML = character.resources.map(resource => {
    const max = Number(resource.max) || 0, current = Number(resource.current) || 0, ratio = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    return `<div class="resource-row"><div class="resource-meta"><div><strong>${escapeHtml(resource.label)}</strong>${resource.description ? `<small>${escapeHtml(resource.description)}</small>` : ''}</div><span>${current}${max ? ` / ${max}` : ''}</span></div>${max ? `<div class="meter"><span style="width:${ratio}%"></span></div>` : ''}<div class="row-inline"><input class="input input-compact" type="number" value="${current}" data-resource-current="${escapeHtml(resource.id)}"><button class="button button-small button-ghost" type="button" data-resource-save="${escapeHtml(resource.id)}">Update</button></div></div>`;
  }).join('');
  $$('[data-resource-save]', target).forEach(button => button.addEventListener('click', async () => {
    const resourceId = button.dataset.resourceSave;
    const input = $(`[data-resource-current="${CSS.escape(resourceId)}"]`, target);
    const current = Number(input.value);
    if (!Number.isFinite(current)) return toast('Enter a valid number.', 'error');
    button.disabled = true;
    try {
      await api(`/api/player/characters/${encodeURIComponent(character.id)}/resources/${encodeURIComponent(resourceId)}`, { method: 'PATCH', body: JSON.stringify({ current }) });
      await openCharacter(character.id, false);
      toast('Resource updated in database.', 'success');
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  }));
}

function renderInventory(character) {
  const target = $('#inventory-list');
  if (!character.inventory.length) { target.innerHTML = emptyState('Inventory is empty', 'The GM has not added any items.'); return; }
  target.innerHTML = character.inventory.map(item => `<article class="stack-item"><div><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.notes || 'No notes')}</p></div><div class="quantity-editor"><span class="muted">Qty</span><input class="input input-compact" type="number" min="0" value="${escapeHtml(item.qty)}" data-item-qty="${escapeHtml(item.id)}"><button class="button button-small button-ghost" type="button" data-item-save="${escapeHtml(item.id)}">Save</button></div></article>`).join('');
  $$('[data-item-save]', target).forEach(button => button.addEventListener('click', async () => {
    const itemId = button.dataset.itemSave;
    const input = $(`[data-item-qty="${CSS.escape(itemId)}"]`, target);
    const qty = Number(input.value);
    if (!Number.isFinite(qty) || qty < 0) return toast('Quantity must be 0 or above.', 'error');
    button.disabled = true;
    try {
      await api(`/api/player/characters/${encodeURIComponent(character.id)}/inventory/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify({ qty }) });
      await openCharacter(character.id, false);
      toast('Inventory updated in database.', 'success');
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  }));
}

function renderAbilities(character) {
  const target = $('#ability-list');
  if (!character.abilities.length) { target.innerHTML = emptyState('No abilities', 'The GM has not added any abilities.'); return; }
  target.innerHTML = character.abilities.map(ability => `<article class="stack-item"><div><div class="row-inline"><h4>${escapeHtml(ability.name)}</h4><span class="tag">${escapeHtml(ability.type)}</span>${ability.proficient ? '<span class="tag tag-accent">Proficient</span>' : ''}</div><p>${escapeHtml(ability.description || 'No description')}</p></div></article>`).join('');
}

function renderCharacterDetail(character) {
  const detail = $('#character-detail');
  if (!character) { detail.classList.add('hidden'); return; }
  detail.classList.remove('hidden');
  $('#character-name').textContent = character.name;
  $('#character-role').textContent = character.role || 'No role';
  $('#character-level').textContent = `Level ${character.level}`;
  $('#character-status').textContent = character.status;
  $('#character-summary').textContent = character.summary || 'No summary.';
  $('#character-notes').value = character.notes || '';
  const avatar = $('#character-avatar');
  if (character.portraitUrl) { avatar.style.backgroundImage = `url("${character.portraitUrl.replaceAll('"', '\\"')}")`; avatar.textContent = ''; }
  else { avatar.style.backgroundImage = ''; avatar.textContent = 'D20'; }
  renderAttributes(character); renderResources(character); renderInventory(character); renderAbilities(character);
}

async function openCharacter(id, refreshCards = true) {
  const payload = await api(`/api/player/characters/${encodeURIComponent(id)}`);
  selectedCharacterId = id;
  selectedCharacter = payload.character;
  if (refreshCards) renderCharacterCards();
  renderCharacterDetail(selectedCharacter);
}

function switchTab(name) {
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  $$('.tab-panel').forEach(panel => panel.classList.add('hidden'));
  $(`#tab-${name}`)?.classList.remove('hidden');
}

async function boot() {
  try {
    bootstrap = await api('/api/player/bootstrap');
    $('#player-user-name').textContent = bootstrap.user.displayName;
    $('#player-username').textContent = `@${bootstrap.user.username}`;
    $('#campaign-name').textContent = bootstrap.campaign?.name || 'D&D Campaign';
    $('#auth-loading').classList.add('hidden');
    $('#player-content').classList.remove('hidden');
    renderCharacterCards();
  } catch (error) {
    if ($('#auth-loading')) $('#auth-loading').innerHTML = emptyState('Unable to load player data', error.message);
  }
}

$('#close-character')?.addEventListener('click', () => { selectedCharacterId = ''; selectedCharacter = null; renderCharacterCards(); renderCharacterDetail(null); });
$('#export-character')?.addEventListener('click', () => {
  if (!selectedCharacter) return;
  const safeName = selectedCharacter.name.replace(/[^\w\u3400-\u9fff-]+/g, '_');
  downloadText(`${safeName || 'character'}.json`, JSON.stringify(selectedCharacter, null, 2));
});
$('#save-notes')?.addEventListener('click', async () => {
  if (!selectedCharacter) return;
  const button = $('#save-notes'); button.disabled = true;
  try {
    const notes = $('#character-notes').value;
    await api(`/api/player/characters/${encodeURIComponent(selectedCharacter.id)}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) });
    selectedCharacter.notes = notes;
    toast('Notes saved to database.', 'success');
  } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = false; }
});
$('#logout-button')?.addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }); }
  finally { location.replace('/player/login/'); }
});
$$('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
bindThemeToggle($('#theme-toggle'));
boot();
