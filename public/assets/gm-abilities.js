import { $, escapeHtml, toast } from './common.js';

const ATTRIBUTES = ['PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD'];
const LABELS = { PHYSICAL:'物理', LIGHT:'光', DARK:'暗', FIRE:'火', WATER:'水', WIND:'風', EARTH:'土', LIGHTNING:'雷', WOOD:'木' };
let selectedCharacterId = '';
let definitions = [];
let editingId = '';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials:'same-origin', headers:{ Accept:'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}) }, ...options });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (response.status === 401) { location.replace('/gm/login/?next=%2Fgm%2F'); throw new Error('Admin session expired.'); }
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function ensurePanel() {
  if ($('#gm-ability-authority-panel')) return;
  const attack = $('#gm-attack-profile-panel');
  if (!attack) return;
  const panel = document.createElement('section');
  panel.id = 'gm-ability-authority-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading"><div><h3>Ability Definition / Grant Authority</h3><span class="muted">建立能力、編輯正式定義、授予角色。授予不等於可使用；使用資格按角色當前資料動態判定。</span></div></div>
    <div class="split-grid">
      <section>
        <h4 id="gm-ability-editor-title">建立 Ability Definition</h4>
        <div class="form-grid compact-grid">
          <label class="field"><span>繁體中文名稱</span><input id="gm-ability-name" class="input" maxlength="120"></label>
          <label class="field"><span>屬性</span><select id="gm-ability-attribute" class="input">${ATTRIBUTES.map(x => `<option value="${x}">${LABELS[x]}</option>`).join('')}</select></label>
          <label class="field"><span>階級</span><select id="gm-ability-rank" class="input">${[1,2,3,4,5,6,7,8,9].map(x => `<option value="${x}">${x}階</option>`).join('')}<option value="SPECIAL">SPECIAL</option></select></label>
          <label class="field"><span>能力類型</span><input id="gm-ability-type" class="input" value="ABILITY" maxlength="80"></label>
          <label class="field"><span>Target Pattern</span><select id="gm-ability-target" class="input"><option value="">未指定</option><option>SELF</option><option>SINGLE</option><option>MULTI_TARGET</option><option>AREA</option><option>LINE</option><option>CONE</option></select></label>
          <label class="field"><span>Physical Source Category</span><input id="gm-ability-physical-source" class="input" maxlength="80" placeholder="例如 SWORD；只適用物理"></label>
          <label class="field"><span>最低 Character Level</span><input id="gm-ability-min-level" class="input" type="number" min="1" max="100" placeholder="可留空"></label>
          <label class="field"><span>Library Visibility</span><select id="gm-ability-visibility" class="input"><option value="CAMPAIGN">Campaign</option><option value="PRIVATE">Private</option></select></label>
          <label class="field"><span>Status</span><select id="gm-ability-status-select" class="input"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        </div>
        <label class="field"><span>說明</span><textarea id="gm-ability-description" class="textarea" rows="4"></textarea></label>
        <div class="form-actions wrap"><button id="gm-save-ability" class="button" type="button">建立 Ability</button><button id="gm-cancel-ability-edit" class="button button-ghost hidden" type="button">取消編輯</button></div>
      </section>
      <section>
        <h4>授予目前 Character</h4>
        <label class="field"><span>Ability Definition</span><select id="gm-grant-ability-definition" class="input"><option value="">請先建立能力</option></select></label>
        <label class="field"><span>授予來源</span><select id="gm-grant-ability-source" class="input"><option>GM_DIRECT</option><option>MENTOR</option><option>ITEM</option><option>STORY</option><option>QUEST</option><option>CLASS</option><option>AWAKENING</option><option>OTHER</option></select></label>
        <label class="field"><span>來源名稱</span><input id="gm-grant-ability-source-name" class="input" maxlength="160"></label>
        <label class="field"><span>GM 備註</span><textarea id="gm-grant-ability-note" class="textarea" rows="3"></textarea></label>
        <div class="form-actions"><button id="gm-grant-ability" class="button" type="button" disabled>授予 Ability</button></div>
        <p class="muted">GM Grant 可以越過一般取得流程，但不會自動越過 Attribute Rank、Level 或其他使用條件。</p>
      </section>
    </div>
    <div class="split-grid">
      <section><div class="panel-heading"><h4>Ability Library</h4><span class="muted">Legacy entries會標示待分類。</span></div><div id="gm-ability-library" class="stack-list"></div></section>
      <section><div class="panel-heading"><h4>Character 已取得 Ability</h4><span class="muted">只讀取得關係；本slice不提供 ungrant。</span></div><div id="gm-character-ability-list" class="stack-list"><p class="muted">Open a Character to load Abilities.</p></div></section>
    </div>`;
  attack.parentNode.insertBefore(panel, attack);
}

function resetEditor() {
  editingId = '';
  $('#gm-ability-editor-title').textContent = '建立 Ability Definition';
  $('#gm-save-ability').textContent = '建立 Ability';
  $('#gm-cancel-ability-edit').classList.add('hidden');
  $('#gm-ability-name').value = '';
  $('#gm-ability-attribute').value = 'PHYSICAL';
  $('#gm-ability-rank').value = '1';
  $('#gm-ability-type').value = 'ABILITY';
  $('#gm-ability-target').value = '';
  $('#gm-ability-physical-source').value = '';
  $('#gm-ability-min-level').value = '';
  $('#gm-ability-visibility').value = 'CAMPAIGN';
  $('#gm-ability-status-select').value = 'active';
  $('#gm-ability-description').value = '';
}

function renderDefinitions() {
  const library = $('#gm-ability-library');
  const select = $('#gm-grant-ability-definition');
  if (!library || !select) return;
  library.innerHTML = definitions.length ? definitions.map(item => `<article class="stack-item">
    <div><div class="row-inline"><h4>${escapeHtml(item.canonicalNameZh)}</h4><span class="tag">${escapeHtml(item.attributeType || '待分類')}</span><span class="tag">${escapeHtml(item.rankCode || '—')}</span>${item.classificationStatus === 'NEEDS_CLASSIFICATION' ? '<span class="status-pill">needs classification</span>' : ''}${item.status !== 'active' ? '<span class="status-pill">inactive</span>' : ''}</div><p>${escapeHtml(item.descriptionZh || '暫無說明')}</p></div>
    <button class="button button-small button-ghost" type="button" data-edit-ability="${escapeHtml(item.id)}">Edit</button>
  </article>`).join('') : '<p class="muted">Ability Library is empty.</p>';
  const active = definitions.filter(item => item.status === 'active' && item.classificationStatus === 'CLASSIFIED');
  const previous = select.value;
  select.innerHTML = '<option value="">Select Ability</option>' + active.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.canonicalNameZh)} · ${escapeHtml(item.attributeType)} ${escapeHtml(item.rankCode)}</option>`).join('');
  if (active.some(item => item.id === previous)) select.value = previous;
  $('#gm-grant-ability').disabled = !selectedCharacterId || !select.value;
}

function renderCharacterAbilities(items = []) {
  const target = $('#gm-character-ability-list');
  if (!target) return;
  if (!selectedCharacterId) { target.innerHTML = '<p class="muted">Open a Character to load Abilities.</p>'; return; }
  if (!items.length) { target.innerHTML = '<p class="muted">Character 尚未取得 Ability。</p>'; return; }
  target.innerHTML = items.map(item => {
    const reasons = [...(item.usability?.blockers || []), ...(item.usability?.unresolved || [])].map(x => x.message).join(' · ');
    return `<article class="stack-item"><div><div class="row-inline"><h4>${escapeHtml(item.canonicalNameZh)}</h4><span class="tag">${escapeHtml(item.attributeType || '待分類')}</span><span class="tag">${escapeHtml(item.rankCode || '—')}</span><span class="status-pill">${escapeHtml(item.usability?.status || 'UNRESOLVED')}</span></div><p>${escapeHtml(reasons || item.descriptionZh || '')}</p><small class="muted">${escapeHtml(item.acquisitionMode)}${item.grantSourceName ? ` · ${escapeHtml(item.grantSourceName)}` : ''}</small></div></article>`;
  }).join('');
}

async function loadDefinitions() {
  const payload = await api('/api/gm/abilities');
  definitions = payload.abilities || [];
  renderDefinitions();
}
async function loadCharacterAbilities() {
  if (!selectedCharacterId) return renderCharacterAbilities([]);
  const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/abilities`);
  renderCharacterAbilities(payload.abilities || []);
}

async function saveAbility() {
  const button = $('#gm-save-ability');
  button.disabled = true;
  try {
    const minLevelRaw = $('#gm-ability-min-level').value;
    const wasEditing = Boolean(editingId);
    const endpoint = wasEditing ? `/api/gm/abilities/${encodeURIComponent(editingId)}` : '/api/gm/abilities';
    const method = wasEditing ? 'PATCH' : 'POST';
    const body = {
      canonicalNameZh: $('#gm-ability-name').value,
      attributeType: $('#gm-ability-attribute').value,
      rankCode: $('#gm-ability-rank').value,
      abilityType: $('#gm-ability-type').value,
      targetPattern: $('#gm-ability-target').value || null,
      physicalSourceCategory: $('#gm-ability-physical-source').value || null,
      descriptionZh: $('#gm-ability-description').value,
      libraryVisibility: $('#gm-ability-visibility').value,
      status: $('#gm-ability-status-select').value,
      prerequisites: minLevelRaw ? { minimumCharacterLevel: Number(minLevelRaw) } : {}
    };
    await api(endpoint, { method, body: JSON.stringify(body) });
    resetEditor();
    await Promise.all([loadDefinitions(), loadCharacterAbilities()]);
    toast(wasEditing ? 'Ability updated.' : 'Ability created.', 'success');
  } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = false; }
}

function editAbility(id) {
  const item = definitions.find(row => row.id === id);
  if (!item) return;
  editingId = id;
  $('#gm-ability-editor-title').textContent = '編輯 Ability Definition';
  $('#gm-save-ability').textContent = '儲存 Ability';
  $('#gm-cancel-ability-edit').classList.remove('hidden');
  $('#gm-ability-name').value = item.canonicalNameZh || '';
  $('#gm-ability-attribute').value = item.attributeType || 'PHYSICAL';
  $('#gm-ability-rank').value = item.rankCode || '1';
  $('#gm-ability-type').value = item.abilityType || 'ABILITY';
  $('#gm-ability-target').value = item.targetPattern || '';
  $('#gm-ability-physical-source').value = item.physicalSourceCategory || '';
  $('#gm-ability-min-level').value = item.prerequisites?.minimumCharacterLevel || '';
  $('#gm-ability-visibility').value = item.libraryVisibility || 'CAMPAIGN';
  $('#gm-ability-status-select').value = item.status || 'active';
  $('#gm-ability-description').value = item.descriptionZh || '';
}

async function grantAbility() {
  const abilityDefinitionId = $('#gm-grant-ability-definition').value;
  if (!selectedCharacterId || !abilityDefinitionId) return;
  const button = $('#gm-grant-ability');
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/abilities/grants`, { method:'POST', body:JSON.stringify({
      abilityDefinitionId,
      grantSourceType: $('#gm-grant-ability-source').value,
      grantSourceName: $('#gm-grant-ability-source-name').value,
      grantNote: $('#gm-grant-ability-note').value
    }) });
    renderCharacterAbilities(payload.abilities || []);
    toast(payload.idempotent ? 'Character 已經擁有呢個 Ability。' : 'Ability 已授予 Character。', 'success');
  } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = !selectedCharacterId || !$('#gm-grant-ability-definition').value; }
}

ensurePanel();
Promise.all([loadDefinitions(), loadCharacterAbilities()]).catch(error => toast(error.message, 'error'));
$('#gm-save-ability')?.addEventListener('click', saveAbility);
$('#gm-cancel-ability-edit')?.addEventListener('click', resetEditor);
$('#gm-grant-ability-definition')?.addEventListener('change', renderDefinitions);
$('#gm-grant-ability')?.addEventListener('click', grantAbility);
document.addEventListener('click', event => {
  const edit = event.target.closest?.('[data-edit-ability]');
  if (edit) { editAbility(edit.dataset.editAbility); return; }
  const open = event.target.closest?.('[data-open-character]');
  if (open) {
    selectedCharacterId = open.dataset.openCharacter || '';
    queueMicrotask(() => loadCharacterAbilities().catch(error => toast(error.message, 'error')));
    renderDefinitions();
    return;
  }
  if (event.target.closest?.('#close-gm-character')) {
    selectedCharacterId = '';
    renderCharacterAbilities([]);
    renderDefinitions();
  }
});
