import { $, escapeHtml, toast } from './common.js';

const ATTRIBUTES = ['PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD'];
const MAGIC_ATTRIBUTES = ['LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD'];
const LABELS = { PHYSICAL:'物理', LIGHT:'光', DARK:'暗', FIRE:'火', WATER:'水', WIND:'風', EARTH:'土', LIGHTNING:'雷', WOOD:'木' };
const DEFAULT_MP_COSTS = { '1':1, '2':5, '3':10, '4':20, '5':40, '6':80, '7':160, '8':320, '9':640 };
let selectedCharacterId = '';
let definitions = [];
let progression = [];
let progressionAudit = [];
let physicalMasteries = [];
let physicalMasteryAudit = [];
let abilityResource = { currentMp:null, maxMp:null };
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
    <div class="panel-heading"><div><h3>Ability Definition / Grant Authority</h3><span class="muted">建立能力、編輯正式定義、授予角色。授予不等於可使用；實際 MP 成本係批准後 Definition authority，Rank cost 只係 reference。</span></div></div>
    <div class="split-grid">
      <section>
        <h4 id="gm-ability-editor-title">建立 Ability Definition</h4>
        <div class="form-grid compact-grid">
          <label class="field"><span>繁體中文名稱</span><input id="gm-ability-name" class="input" maxlength="120"></label>
          <label class="field"><span>屬性／分類</span><select id="gm-ability-attribute" class="input">${ATTRIBUTES.map(x => `<option value="${x}">${LABELS[x]}</option>`).join('')}</select></label>
          <label class="field"><span>階級</span><select id="gm-ability-rank" class="input">${[1,2,3,4,5,6,7,8,9].map(x => `<option value="${x}">${x}階</option>`).join('')}<option value="SPECIAL">SPECIAL</option></select></label>
          <label class="field"><span>Approved MP Cost</span><input id="gm-ability-mp-cost" class="input" type="number" min="1" step="1" value="1"><small id="gm-ability-mp-reference">Rank 1 Reference：1 MP。可按批准後Power Package調整。</small></label>
          <label class="field"><span>能力類型</span><input id="gm-ability-type" class="input" value="ABILITY" maxlength="80"></label>
          <label class="field"><span>Target Pattern</span><select id="gm-ability-target" class="input"><option value="">未指定</option><option>SELF</option><option>SINGLE</option><option>MULTI_TARGET</option><option>AREA</option><option>LINE</option><option>CONE</option></select></label>
          <label class="field"><span>Required Physical Mastery</span><input id="gm-ability-physical-source" class="input" maxlength="80" placeholder="例如 SWORD；PHYSICAL Ability 必填"><small>PHYSICAL 只係 Ability 分類，唔係角色總階級。物理 Ability 由此專精階級控制使用資格。</small></label>
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
        <p class="muted">GM Grant 可以越過一般取得流程，但不會自動越過元素 Rank、Physical Mastery Rank、Level 或其他使用條件。今個slice只顯示MP affordability，唔會扣MP或消耗Action。</p>
      </section>
    </div>
    <div class="split-grid">
      <section><div class="panel-heading"><h4>Ability Library</h4><span class="muted">舊Definition若未有批准成本會標示 MP pending；唔會自動套用Rank reference。</span></div><div id="gm-ability-library" class="stack-list"></div></section>
      <section><div class="panel-heading"><div><h4>Character 已取得 Ability</h4><span class="muted">只讀取得關係；本slice不提供 ungrant。</span></div><span id="gm-character-ability-resource" class="muted">Open a Character to load MP.</span></div><div id="gm-character-ability-list" class="stack-list"><p class="muted">Open a Character to load Abilities.</p></div></section>
    </div>
    <section id="gm-element-progression-section">
      <div class="panel-heading"><div><h4>八元素 Rank / 修習進度</h4><span class="muted">光、暗、火、水、風、土、雷、木各自 Rank 0–9；PHYSICAL 已由專精取代。沒有自動升階或固定門檻。</span></div></div>
      <div class="form-grid compact-grid">
        <label class="field"><span>Change Source</span><select id="gm-progression-source-type" class="input"><option>GM_CORRECTION</option><option>GM_REWARD</option><option>TRAINING</option><option>COMBAT</option><option>MENTOR</option><option>RESEARCH</option><option>STORY</option><option>QUEST</option><option>ITEM</option><option>OTHER</option></select></label>
        <label class="field"><span>Source Name</span><input id="gm-progression-source-name" class="input" maxlength="160" placeholder="optional"></label>
        <label class="field"><span>Reason</span><input id="gm-progression-reason" class="input" maxlength="2000" placeholder="why this change is being made"></label>
      </div>
      <div id="gm-element-progression-list" class="stack-list"><p class="muted">Open a Character to load progression.</p></div>
      <div class="panel-heading"><h4>Recent Element Progression Audit</h4><span class="muted">Latest 12 changes</span></div>
      <div id="gm-element-progression-audit" class="stack-list"><p class="muted">No Character selected.</p></div>
    </section>
    <section id="gm-physical-mastery-section">
      <div class="panel-heading"><div><h4>Physical Mastery Rank / 修習進度</h4><span class="muted">專精類別由Campaign定義，例如 SWORD、SPEAR、HAMMER、BOW、UNARMED。沒有全局 PHYSICAL Rank。</span></div></div>
      <div class="form-grid compact-grid">
        <label class="field"><span>Mastery Type</span><input id="gm-physical-mastery-type" class="input" maxlength="80" placeholder="例如 SWORD"></label>
        <label class="field"><span>Rank 0–9</span><input id="gm-physical-mastery-rank" class="input" type="number" min="0" max="9" step="1" value="0"></label>
        <label class="field"><span>Set 修習 EXP</span><input id="gm-physical-mastery-exp" class="input" type="number" min="0" step="1" value="0"></label>
        <div class="field"><span>&nbsp;</span><button id="gm-physical-mastery-set" class="button button-small button-ghost" type="button">Set Mastery</button></div>
        <label class="field"><span>Award EXP</span><input id="gm-physical-mastery-award" class="input" type="number" min="1" step="1" placeholder="+ EXP"></label>
        <div class="field"><span>&nbsp;</span><button id="gm-physical-mastery-award-save" class="button button-small" type="button">Award EXP</button></div>
      </div>
      <div id="gm-physical-mastery-list" class="stack-list"><p class="muted">Open a Character to load physical masteries.</p></div>
      <div class="panel-heading"><h4>Recent Physical Mastery Audit</h4><span class="muted">Latest 12 changes</span></div>
      <div id="gm-physical-mastery-audit" class="stack-list"><p class="muted">No Character selected.</p></div>
    </section>`;
  attack.parentNode.insertBefore(panel, attack);
}

function syncMpReference({ applyDefault = false } = {}) {
  const rank = $('#gm-ability-rank')?.value || '1';
  const reference = DEFAULT_MP_COSTS[rank] ?? null;
  const hint = $('#gm-ability-mp-reference');
  const input = $('#gm-ability-mp-cost');
  if (hint) hint.textContent = reference == null
    ? 'SPECIAL 沒有固定Rank Reference；必須輸入已批准整數 MP Cost。'
    : `Rank ${rank} Reference：${reference} MP。Reference 唔係硬公式，可按批准後Power Package調整。`;
  if (applyDefault && input && reference != null) input.value = String(reference);
  if (applyDefault && input && reference == null) input.value = '';
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
  syncMpReference({ applyDefault: true });
}

function renderDefinitions() {
  const library = $('#gm-ability-library');
  const select = $('#gm-grant-ability-definition');
  if (!library || !select) return;
  library.innerHTML = definitions.length ? definitions.map(item => `<article class="stack-item">
    <div><div class="row-inline"><h4>${escapeHtml(item.canonicalNameZh)}</h4><span class="tag">${escapeHtml(item.attributeType || '待分類')}</span><span class="tag">${escapeHtml(item.rankCode || '—')}</span><span class="tag">${item.mpCost == null ? 'MP pending' : `MP ${escapeHtml(item.mpCost)}`}</span>${item.attributeType === 'PHYSICAL' && item.requiredMasteryType ? `<span class="tag">${escapeHtml(item.requiredMasteryType)} mastery</span>` : ''}${item.classificationStatus === 'NEEDS_CLASSIFICATION' ? '<span class="status-pill">needs classification</span>' : ''}${item.status !== 'active' ? '<span class="status-pill">inactive</span>' : ''}</div><p>${escapeHtml(item.descriptionZh || '暫無說明')}</p>${item.referenceMpCost != null && item.mpCost !== item.referenceMpCost ? `<small class="muted">Rank Reference ${escapeHtml(item.referenceMpCost)} MP · approved ${item.mpCost == null ? 'pending' : escapeHtml(item.mpCost)}</small>` : ''}</div>
    <button class="button button-small button-ghost" type="button" data-edit-ability="${escapeHtml(item.id)}">Edit</button>
  </article>`).join('') : '<p class="muted">Ability Library is empty.</p>';
  const active = definitions.filter(item => item.status === 'active' && item.classificationStatus === 'CLASSIFIED');
  const previous = select.value;
  select.innerHTML = '<option value="">Select Ability</option>' + active.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.canonicalNameZh)} · ${escapeHtml(item.attributeType)} ${escapeHtml(item.rankCode)} · ${item.mpCost == null ? 'MP pending' : `MP ${escapeHtml(item.mpCost)}`}</option>`).join('');
  if (active.some(item => item.id === previous)) select.value = previous;
  $('#gm-grant-ability').disabled = !selectedCharacterId || !select.value;
}

function renderCharacterAbilities(items = []) {
  const target = $('#gm-character-ability-list');
  const resourceTarget = $('#gm-character-ability-resource');
  if (resourceTarget) resourceTarget.textContent = !selectedCharacterId ? 'Open a Character to load MP.' : (abilityResource.currentMp == null ? 'MP resource unavailable.' : `Current MP ${abilityResource.currentMp} / ${abilityResource.maxMp}`);
  if (!target) return;
  if (!selectedCharacterId) { target.innerHTML = '<p class="muted">Open a Character to load Abilities.</p>'; return; }
  if (!items.length) { target.innerHTML = '<p class="muted">Character 尚未取得 Ability。</p>'; return; }
  target.innerHTML = items.map(item => {
    const reasons = [...(item.usability?.blockers || []), ...(item.usability?.unresolved || [])].map(x => x.message).join(' · ');
    const mastery = item.attributeType === 'PHYSICAL' && item.requiredMasteryType ? ` · ${item.requiredMasteryType} ${item.currentMasteryRank ?? 0}階` : '';
    const resource = item.activationResource || {};
    const resourceText = resource.status === 'PENDING_PROFILE' ? 'MP pending' : (resource.mpCost == null ? 'MP —' : `MP ${resource.mpCost} · ${resource.status}`);
    return `<article class="stack-item"><div><div class="row-inline"><h4>${escapeHtml(item.canonicalNameZh)}</h4><span class="tag">${escapeHtml(item.attributeType || '待分類')}</span><span class="tag">${escapeHtml(item.rankCode || '—')}</span><span class="tag">${escapeHtml(resourceText)}</span><span class="status-pill">${escapeHtml(item.usability?.status || 'UNRESOLVED')}</span></div><p>${escapeHtml(reasons || item.descriptionZh || '')}</p><small class="muted">${escapeHtml(item.acquisitionMode)}${item.grantSourceName ? ` · ${escapeHtml(item.grantSourceName)}` : ''}${escapeHtml(mastery)}</small></div></article>`;
  }).join('');
}

function renderProgression() {
  const target = $('#gm-element-progression-list');
  if (!target) return;
  if (!selectedCharacterId) { target.innerHTML = '<p class="muted">Open a Character to load progression.</p>'; return; }
  const map = new Map(progression.map(row => [row.attributeType, row]));
  target.innerHTML = MAGIC_ATTRIBUTES.map(attributeType => {
    const row = map.get(attributeType) || { rank: 0, progressionExp: 0 };
    return `<article class="stack-item">
      <div style="min-width:8rem"><div class="row-inline"><h4>${LABELS[attributeType]}</h4><span class="tag">${escapeHtml(attributeType)}</span></div><p>目前 ${escapeHtml(row.rank)}階 · 修習 ${escapeHtml(row.progressionExp)} / ?</p></div>
      <div class="form-grid compact-grid" style="flex:1">
        <label class="field"><span>Rank 0–9</span><input class="input input-compact" type="number" min="0" max="9" step="1" value="${escapeHtml(row.rank)}" data-progression-rank="${attributeType}"></label>
        <label class="field"><span>Set 修習 EXP</span><input class="input input-compact" type="number" min="0" step="1" value="${escapeHtml(row.progressionExp)}" data-progression-exp="${attributeType}"></label>
        <div class="field"><span>&nbsp;</span><button class="button button-small button-ghost" type="button" data-progression-set="${attributeType}">Set Rank + EXP</button></div>
        <label class="field"><span>Award EXP</span><input class="input input-compact" type="number" min="1" step="1" placeholder="+ EXP" data-progression-award="${attributeType}"></label>
        <div class="field"><span>&nbsp;</span><button class="button button-small" type="button" data-progression-award-save="${attributeType}">Award EXP</button></div>
      </div>
    </article>`;
  }).join('');
}

function renderProgressionAudit() {
  const target = $('#gm-element-progression-audit');
  if (!target) return;
  if (!selectedCharacterId) { target.innerHTML = '<p class="muted">No Character selected.</p>'; return; }
  if (!progressionAudit.length) { target.innerHTML = '<p class="muted">No element progression changes recorded yet.</p>'; return; }
  target.innerHTML = progressionAudit.map(row => `<article class="stack-item compact-item"><div><div class="row-inline"><h4>${LABELS[row.attributeType] || escapeHtml(row.attributeType)}</h4><span class="tag">${escapeHtml(row.operation)}</span><span class="tag">${escapeHtml(row.sourceType)}</span></div><p>Rank ${escapeHtml(row.fromRank)} → ${escapeHtml(row.toRank)} · 修習 ${escapeHtml(row.fromProgressionExp)} → ${escapeHtml(row.toProgressionExp)}${row.deltaProgressionExp ? ` (+${escapeHtml(row.deltaProgressionExp)})` : ''}</p><small class="muted">${escapeHtml(row.sourceName || '')}${row.reason ? ` · ${escapeHtml(row.reason)}` : ''}</small></div></article>`).join('');
}

function renderPhysicalMasteries() {
  const target = $('#gm-physical-mastery-list');
  if (!target) return;
  if (!selectedCharacterId) { target.innerHTML = '<p class="muted">Open a Character to load physical masteries.</p>'; return; }
  if (!physicalMasteries.length) { target.innerHTML = '<p class="muted">No physical masteries recorded yet.</p>'; return; }
  target.innerHTML = physicalMasteries.map(row => `<article class="stack-item compact-item"><div><div class="row-inline"><h4>${escapeHtml(row.masteryType)}</h4><span class="tag">${escapeHtml(row.rank)}階</span></div><p>修習 ${escapeHtml(row.progressionExp)} / ?</p></div><button class="button button-small button-ghost" type="button" data-load-physical-mastery="${escapeHtml(row.masteryType)}">Edit</button></article>`).join('');
}

function renderPhysicalMasteryAudit() {
  const target = $('#gm-physical-mastery-audit');
  if (!target) return;
  if (!selectedCharacterId) { target.innerHTML = '<p class="muted">No Character selected.</p>'; return; }
  if (!physicalMasteryAudit.length) { target.innerHTML = '<p class="muted">No physical mastery changes recorded yet.</p>'; return; }
  target.innerHTML = physicalMasteryAudit.map(row => `<article class="stack-item compact-item"><div><div class="row-inline"><h4>${escapeHtml(row.masteryType)}</h4><span class="tag">${escapeHtml(row.operation)}</span><span class="tag">${escapeHtml(row.sourceType)}</span></div><p>Rank ${escapeHtml(row.fromRank)} → ${escapeHtml(row.toRank)} · 修習 ${escapeHtml(row.fromProgressionExp)} → ${escapeHtml(row.toProgressionExp)}${row.deltaProgressionExp ? ` (+${escapeHtml(row.deltaProgressionExp)})` : ''}</p><small class="muted">${escapeHtml(row.sourceName || '')}${row.reason ? ` · ${escapeHtml(row.reason)}` : ''}</small></div></article>`).join('');
}

async function loadDefinitions() {
  const payload = await api('/api/gm/abilities');
  definitions = payload.abilities || [];
  renderDefinitions();
}
async function loadCharacterAbilityData() {
  if (!selectedCharacterId) {
    progression = [];
    progressionAudit = [];
    physicalMasteries = [];
    physicalMasteryAudit = [];
    abilityResource = { currentMp:null, maxMp:null };
    renderCharacterAbilities([]);
    renderProgression();
    renderProgressionAudit();
    renderPhysicalMasteries();
    renderPhysicalMasteryAudit();
    return;
  }
  const [payload, auditPayload, masteryAuditPayload] = await Promise.all([
    api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/abilities`),
    api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/ability-progression/audit?limit=12`),
    api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/physical-masteries/audit?limit=12`)
  ]);
  progression = payload.abilityProgression || [];
  physicalMasteries = payload.physicalMasteries || [];
  abilityResource = payload.abilityResource || { currentMp:null, maxMp:null };
  progressionAudit = auditPayload.audit || [];
  physicalMasteryAudit = masteryAuditPayload.audit || [];
  renderCharacterAbilities(payload.abilities || []);
  renderProgression();
  renderProgressionAudit();
  renderPhysicalMasteries();
  renderPhysicalMasteryAudit();
}

async function saveAbility() {
  const button = $('#gm-save-ability');
  button.disabled = true;
  try {
    const minLevelRaw = $('#gm-ability-min-level').value;
    const mpCostRaw = $('#gm-ability-mp-cost').value;
    const mpCost = Number(mpCostRaw);
    if (!Number.isSafeInteger(mpCost) || mpCost < 1) throw new Error('Approved MP Cost 必須係至少 1 嘅整數。');
    const wasEditing = Boolean(editingId);
    const endpoint = wasEditing ? `/api/gm/abilities/${encodeURIComponent(editingId)}` : '/api/gm/abilities';
    const method = wasEditing ? 'PATCH' : 'POST';
    const body = {
      canonicalNameZh: $('#gm-ability-name').value,
      attributeType: $('#gm-ability-attribute').value,
      rankCode: $('#gm-ability-rank').value,
      mpCost,
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
    await Promise.all([loadDefinitions(), loadCharacterAbilityData()]);
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
  $('#gm-ability-mp-cost').value = item.mpCost ?? '';
  $('#gm-ability-type').value = item.abilityType || 'ABILITY';
  $('#gm-ability-target').value = item.targetPattern || '';
  $('#gm-ability-physical-source').value = item.physicalSourceCategory || '';
  $('#gm-ability-min-level').value = item.prerequisites?.minimumCharacterLevel || '';
  $('#gm-ability-visibility').value = item.libraryVisibility || 'CAMPAIGN';
  $('#gm-ability-status-select').value = item.status || 'active';
  $('#gm-ability-description').value = item.descriptionZh || '';
  syncMpReference();
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
    progression = payload.abilityProgression || progression;
    physicalMasteries = payload.physicalMasteries || physicalMasteries;
    abilityResource = payload.abilityResource || abilityResource;
    renderCharacterAbilities(payload.abilities || []);
    renderProgression();
    renderPhysicalMasteries();
    toast(payload.idempotent ? 'Character 已經擁有呢個 Ability。' : 'Ability 已授予 Character。', 'success');
  } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = !selectedCharacterId || !$('#gm-grant-ability-definition').value; }
}

function progressionSourceFields() {
  return {
    sourceType: $('#gm-progression-source-type')?.value || 'GM_CORRECTION',
    sourceName: $('#gm-progression-source-name')?.value || '',
    reason: $('#gm-progression-reason')?.value || ''
  };
}

async function mutateProgression(attributeType, mode, button) {
  if (!selectedCharacterId) return;
  const body = progressionSourceFields();
  if (mode === 'set') {
    const rank = Number(document.querySelector(`[data-progression-rank="${CSS.escape(attributeType)}"]`)?.value);
    const progressionExp = Number(document.querySelector(`[data-progression-exp="${CSS.escape(attributeType)}"]`)?.value);
    if (!Number.isInteger(rank) || rank < 0 || rank > 9) return toast('Rank 必須係 0–9 整數。', 'error');
    if (!Number.isSafeInteger(progressionExp) || progressionExp < 0) return toast('修習 EXP 必須係非負整數。', 'error');
    Object.assign(body, { rank, progressionExp });
  } else {
    const input = document.querySelector(`[data-progression-award="${CSS.escape(attributeType)}"]`);
    const progressionDelta = Number(input?.value);
    if (!Number.isSafeInteger(progressionDelta) || progressionDelta < 1) return toast('Award EXP 必須係至少 1 嘅整數。', 'error');
    body.progressionDelta = progressionDelta;
  }
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/ability-progression/${encodeURIComponent(attributeType)}`, { method:'PATCH', body:JSON.stringify(body) });
    progression = payload.progression || progression;
    await loadCharacterAbilityData();
    toast(payload.unchanged ? 'Rank / 修習進度沒有變更。' : (mode === 'set' ? 'Rank / 修習進度已校正。' : '修習 EXP 已獎勵；Rank 不會自動提升。'), 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadCharacterAbilityData().catch(() => {});
  } finally {
    button.disabled = false;
  }
}

function loadMasteryIntoEditor(masteryType) {
  const row = physicalMasteries.find(item => item.masteryType === masteryType);
  $('#gm-physical-mastery-type').value = masteryType || '';
  $('#gm-physical-mastery-rank').value = row?.rank ?? 0;
  $('#gm-physical-mastery-exp').value = row?.progressionExp ?? 0;
}

async function mutatePhysicalMastery(mode, button) {
  if (!selectedCharacterId) return;
  const masteryType = String($('#gm-physical-mastery-type')?.value || '').trim();
  if (!masteryType) return toast('請輸入 Physical Mastery Type。', 'error');
  const body = progressionSourceFields();
  if (mode === 'set') {
    const rank = Number($('#gm-physical-mastery-rank')?.value);
    const progressionExp = Number($('#gm-physical-mastery-exp')?.value);
    if (!Number.isInteger(rank) || rank < 0 || rank > 9) return toast('Mastery Rank 必須係 0–9 整數。', 'error');
    if (!Number.isSafeInteger(progressionExp) || progressionExp < 0) return toast('Mastery 修習 EXP 必須係非負整數。', 'error');
    Object.assign(body, { rank, progressionExp });
  } else {
    const progressionDelta = Number($('#gm-physical-mastery-award')?.value);
    if (!Number.isSafeInteger(progressionDelta) || progressionDelta < 1) return toast('Award EXP 必須係至少 1 嘅整數。', 'error');
    body.progressionDelta = progressionDelta;
  }
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/physical-masteries/${encodeURIComponent(masteryType)}`, { method:'PATCH', body:JSON.stringify(body) });
    physicalMasteries = payload.masteries || physicalMasteries;
    await loadCharacterAbilityData();
    const row = physicalMasteries.find(item => item.masteryType === masteryType);
    if (row) loadMasteryIntoEditor(row.masteryType);
    toast(payload.unchanged ? 'Physical Mastery 沒有變更。' : (mode === 'set' ? 'Physical Mastery 已校正。' : 'Physical Mastery 修習 EXP 已獎勵；Rank 不會自動提升。'), 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadCharacterAbilityData().catch(() => {});
  } finally {
    button.disabled = false;
  }
}

ensurePanel();
resetEditor();
Promise.all([loadDefinitions(), loadCharacterAbilityData()]).catch(error => toast(error.message, 'error'));
$('#gm-save-ability')?.addEventListener('click', saveAbility);
$('#gm-cancel-ability-edit')?.addEventListener('click', resetEditor);
$('#gm-ability-rank')?.addEventListener('change', () => syncMpReference({ applyDefault: !editingId }));
$('#gm-grant-ability-definition')?.addEventListener('change', renderDefinitions);
$('#gm-grant-ability')?.addEventListener('click', grantAbility);
$('#gm-physical-mastery-set')?.addEventListener('click', event => mutatePhysicalMastery('set', event.currentTarget));
$('#gm-physical-mastery-award-save')?.addEventListener('click', event => mutatePhysicalMastery('award', event.currentTarget));
document.addEventListener('click', event => {
  const edit = event.target.closest?.('[data-edit-ability]');
  if (edit) { editAbility(edit.dataset.editAbility); return; }
  const mastery = event.target.closest?.('[data-load-physical-mastery]');
  if (mastery) { loadMasteryIntoEditor(mastery.dataset.loadPhysicalMastery); return; }
  const open = event.target.closest?.('[data-open-character]');
  if (open) {
    selectedCharacterId = open.dataset.openCharacter || '';
    queueMicrotask(() => loadCharacterAbilityData().catch(error => toast(error.message, 'error')));
    renderDefinitions();
    return;
  }
  if (event.target.closest?.('#close-gm-character')) {
    selectedCharacterId = '';
    progression = [];
    progressionAudit = [];
    physicalMasteries = [];
    physicalMasteryAudit = [];
    abilityResource = { currentMp:null, maxMp:null };
    renderCharacterAbilities([]);
    renderProgression();
    renderProgressionAudit();
    renderPhysicalMasteries();
    renderPhysicalMasteryAudit();
    renderDefinitions();
    return;
  }
  const set = event.target.closest?.('[data-progression-set]');
  if (set) { mutateProgression(set.dataset.progressionSet, 'set', set); return; }
  const award = event.target.closest?.('[data-progression-award-save]');
  if (award) mutateProgression(award.dataset.progressionAwardSave, 'award', award);
});