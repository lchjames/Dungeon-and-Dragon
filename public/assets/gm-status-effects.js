import { $, escapeHtml, toast } from './common.js';

let characterId = '';
let character = null;
let definitions = [];
let effects = [];
let audit = [];

const CATEGORY_LABELS = {
  DAMAGE_OVER_TIME: '持續傷害',
  ACTION_CONTROL: '行動控制',
  MENTAL_CONTROL: '精神控制',
  PERCEPTION_INTERFERENCE: '感知干擾',
  NUMERIC_MODIFIER: '行動／數值修正',
  RECOVERY_SUPPORT: '恢復／持續支援',
  OTHER: '其他'
};
const STACK_LABELS = {
  NO_STACK: '不可疊加',
  REFRESH_DURATION: '刷新時間',
  EXTEND_DURATION: '延長時間',
  ADD_STACKS: '增加層數',
  KEEP_STRONGER: '取較強者',
  TAKE_LATEST: '取最新者'
};
const LAYERS = [['BODY', '身體'], ['MIND', '精神'], ['PERCEPTION', '感知'], ['ENVIRONMENT', '環境']];
const TRIGGERS = [
  ['APPLY_IMMEDIATELY', '施加時立即'],
  ['TARGET_TURN_START', '目標回合開始'],
  ['TARGET_TURN_END', '目標回合結束'],
  ['SOURCE_TURN_START', '來源角色回合開始'],
  ['AFTER_SUCCESSFUL_ATTACK', '成功攻擊後'],
  ['AFTER_DAMAGE_TAKEN', '受到傷害後'],
  ['ON_ABILITY_TYPE', '使用指定能力類型時']
];

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
  if ($('#gm-status-effect-panel')) return true;
  const anchor = $('#gm-opposed-d100-panel') || $('#gm-basic-skill-check-panel');
  if (!anchor) return false;
  const panel = document.createElement('section');
  panel.id = 'gm-status-effect-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h3>Status Effect Runtime Foundation</h3>
        <span class="muted">建立已批准 Status Definition，並管理 Character Runtime Instance、疊加、回合倒數及不可變 audit。</span>
      </div>
      <span id="gm-status-character-name" class="muted">Open a Character</span>
    </div>
    <div id="gm-status-message" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="auth-status auth-status-warning">
      此 Foundation 只管理 Status lifecycle snapshot。現階段不會自動造成傷害、治療、控制、Action / Move、MP、命中或抗性結果；亦未自動接入 Ability 施放或 Combat round。
    </div>

    <details>
      <summary><strong>建立 Status Definition</strong> · GM 建立即視為已批准 Definition</summary>
      <div class="form-grid compact-grid" style="margin-top:1rem">
        <label class="field"><span>名稱（繁體中文）</span><input id="gm-status-name" class="input" maxlength="120" placeholder="例如：燃燒"></label>
        <label class="field"><span>類別</span><select id="gm-status-category" class="input">
          ${Object.entries(CATEGORY_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
        </select></label>
        <label class="field"><span>來源屬性</span><select id="gm-status-attribute" class="input">
          <option value="">未指定</option><option value="PHYSICAL">物理</option><option value="LIGHT">光</option><option value="DARK">暗</option><option value="FIRE">火</option><option value="WATER">水</option><option value="WIND">風</option><option value="EARTH">土</option><option value="LIGHTNING">雷</option><option value="WOOD">木</option><option value="NONE">無屬性</option>
        </select></label>
        <label class="field"><span>持續類型</span><select id="gm-status-duration-type" class="input"><option value="ROUNDS">回合制</option><option value="PERMANENT">永久</option></select></label>
        <label class="field" id="gm-status-rounds-field"><span>預設持續回合</span><input id="gm-status-rounds" class="input" type="number" min="1" step="1" value="2"></label>
        <label class="field"><span>疊加規則</span><select id="gm-status-stacking" class="input">
          ${Object.entries(STACK_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
        </select></label>
        <label class="field"><span>Stack Key（可留空，自動使用 Definition ID）</span><input id="gm-status-stack-key" class="input" maxlength="100" placeholder="例如 burning"></label>
        <label class="field hidden" id="gm-status-max-stacks-field"><span>最大層數</span><input id="gm-status-max-stacks" class="input" type="number" min="2" step="1" value="3"></label>
        <label class="field hidden" id="gm-status-strength-field"><span>強度值（只供取較強者比較）</span><input id="gm-status-strength" class="input" type="number" step="any" value="1"></label>
      </div>
      <fieldset class="field"><legend>作用層面（至少一項）</legend><div class="row-inline wrap">
        ${LAYERS.map(([value, label], index) => `<label><input type="checkbox" data-status-layer value="${value}"${index === 0 ? ' checked' : ''}> ${label}</label>`).join('')}
      </div></fieldset>
      <fieldset class="field"><legend>Trigger Timing metadata</legend><div class="row-inline wrap">
        ${TRIGGERS.map(([value, label]) => `<label><input type="checkbox" data-status-trigger value="${value}"> ${label}</label>`).join('')}
      </div></fieldset>
      <label class="field"><span>Effect Profile JSON</span><textarea id="gm-status-effect-profile" class="textarea" rows="4">{}</textarea><small>此 slice 只保存 snapshot，不執行 Profile 內數值效果。</small></label>
      <label class="field"><span>解除標籤（逗號分隔）</span><input id="gm-status-dispel-tags" class="input" placeholder="淨化, 解毒"></label>
      <label class="field"><span>Immunity Rules JSON array</span><textarea id="gm-status-immunity-rules" class="textarea" rows="2">[]</textarea></label>
      <label class="field"><span>描述</span><textarea id="gm-status-description" class="textarea" rows="2"></textarea></label>
      <label class="field"><span>Definition Change Reason</span><input id="gm-status-change-reason" class="input" maxlength="1000" placeholder="建立／修改原因（必填）"></label>
      <div class="form-actions wrap"><button id="gm-status-create-definition" class="button" type="button">建立並批准 Definition</button></div>
    </details>

    <div class="panel-heading" style="margin-top:1rem"><div><h4>Status Definitions</h4><span class="muted">ACTIVE 可套用；INACTIVE 只保留歷史。</span></div><button id="gm-status-reload-definitions" class="button button-small button-ghost" type="button">Reload</button></div>
    <div id="gm-status-definition-list" class="stack-list"><p class="muted">Loading Definitions…</p></div>

    <div class="panel-heading" style="margin-top:1rem"><div><h4>Character Runtime Status</h4><span class="muted">手動 Status Round 只遞減有限回合 counter，不會執行 DoT / HoT / 控制效果。</span></div></div>
    <div class="form-grid compact-grid">
      <label class="field"><span>ACTIVE Definition</span><select id="gm-status-apply-definition" class="input" disabled><option value="">Open a Character</option></select></label>
      <label class="field"><span>Runtime Reason</span><input id="gm-status-runtime-reason" class="input" maxlength="1000" placeholder="套用／倒數／移除原因（必填）"></label>
    </div>
    <div class="form-actions wrap">
      <button id="gm-status-apply" class="button" type="button" disabled>套用 Status</button>
      <button id="gm-status-tick" class="button button-ghost" type="button" disabled>Advance Status Round</button>
    </div>
    <div id="gm-status-runtime-list" class="stack-list"><p class="muted">Open a Character to load Runtime Status.</p></div>
    <div class="panel-heading"><h4>Recent Status Audit</h4><span class="muted">Latest 30 lifecycle events</span></div>
    <div id="gm-status-audit-list" class="stack-list"><p class="muted">Open a Character to load audit.</p></div>`;
  anchor.after(panel);
  bindPanel();
  return true;
}

function status(message = '', kind = '') {
  const box = $('#gm-status-message');
  if (!box) return;
  box.hidden = !message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.textContent = message;
}

function checkedValues(selector) {
  return [...document.querySelectorAll(selector)].filter(input => input.checked).map(input => input.value);
}

function parseJsonField(selector, label, expectedArray = false) {
  const raw = String($(selector)?.value || '').trim();
  let value;
  try { value = JSON.parse(raw || (expectedArray ? '[]' : '{}')); }
  catch { throw new Error(`${label} JSON 格式錯誤。`); }
  if (expectedArray && !Array.isArray(value)) throw new Error(`${label} 必須係 JSON array。`);
  if (!expectedArray && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error(`${label} 必須係 JSON object。`);
  return value;
}

function readDefinitionForm() {
  const durationType = $('#gm-status-duration-type').value;
  const stackingRule = $('#gm-status-stacking').value;
  const layers = checkedValues('[data-status-layer]');
  if (!layers.length) throw new Error('作用層面至少要揀一項。');
  const name = String($('#gm-status-name').value || '').trim();
  const reason = String($('#gm-status-change-reason').value || '').trim();
  if (!name) throw new Error('Status 名稱必填。');
  if (!reason) throw new Error('Definition Change Reason 必填。');
  const rounds = Number($('#gm-status-rounds').value);
  const maxStacks = Number($('#gm-status-max-stacks').value);
  const strength = Number($('#gm-status-strength').value);
  return {
    canonicalNameZh: name,
    category: $('#gm-status-category').value,
    layers,
    sourceAttribute: $('#gm-status-attribute').value || null,
    durationType,
    ...(durationType === 'ROUNDS' ? { defaultDurationRounds: rounds } : {}),
    effectProfile: parseJsonField('#gm-status-effect-profile', 'Effect Profile'),
    triggerTimings: checkedValues('[data-status-trigger]'),
    stackingRule,
    stackKey: String($('#gm-status-stack-key').value || '').trim() || undefined,
    ...(stackingRule === 'ADD_STACKS' ? { maxStacks } : {}),
    ...(stackingRule === 'KEEP_STRONGER' ? { strengthValue: strength } : {}),
    dispelTags: String($('#gm-status-dispel-tags').value || '').split(',').map(value => value.trim()).filter(Boolean),
    immunityRules: parseJsonField('#gm-status-immunity-rules', 'Immunity Rules', true),
    status: 'ACTIVE',
    descriptionZh: String($('#gm-status-description').value || '').trim(),
    metadata: {},
    changeReason: reason
  };
}

function syncDefinitionForm() {
  const duration = $('#gm-status-duration-type')?.value;
  const stacking = $('#gm-status-stacking')?.value;
  $('#gm-status-rounds-field')?.classList.toggle('hidden', duration !== 'ROUNDS');
  $('#gm-status-max-stacks-field')?.classList.toggle('hidden', stacking !== 'ADD_STACKS');
  $('#gm-status-strength-field')?.classList.toggle('hidden', stacking !== 'KEEP_STRONGER');
  for (const option of $('#gm-status-stacking')?.options || []) {
    option.disabled = duration === 'PERMANENT' && ['REFRESH_DURATION', 'EXTEND_DURATION'].includes(option.value);
  }
  if (duration === 'PERMANENT' && ['REFRESH_DURATION', 'EXTEND_DURATION'].includes(stacking)) $('#gm-status-stacking').value = 'NO_STACK';
}

function renderDefinitions() {
  const target = $('#gm-status-definition-list');
  const select = $('#gm-status-apply-definition');
  if (!target || !select) return;
  if (!definitions.length) target.innerHTML = '<p class="muted">No Status Definitions.</p>';
  else target.innerHTML = definitions.map(def => `<article class="stack-item">
    <div>
      <div class="row-inline wrap"><h4>${escapeHtml(def.canonicalNameZh)}</h4><span class="tag">${escapeHtml(def.status)}</span><span class="tag">v${escapeHtml(def.version)}</span></div>
      <p>${escapeHtml(CATEGORY_LABELS[def.category] || def.category)} · ${escapeHtml(def.layers.join(' / '))} · ${escapeHtml(def.durationType === 'PERMANENT' ? '永久' : `${def.defaultDurationRounds} 回合`)}</p>
      <p>Stack: ${escapeHtml(STACK_LABELS[def.stackingRule] || def.stackingRule)} · Key ${escapeHtml(def.stackKey)}${def.maxStacks ? ` · Max ${escapeHtml(def.maxStacks)}` : ''}${def.strengthValue !== null ? ` · Strength ${escapeHtml(def.strengthValue)}` : ''}</p>
      <p class="muted">${escapeHtml(def.descriptionZh || 'No description.')}</p>
    </div>
    <div class="row-inline"><button class="button button-small button-ghost" type="button" data-status-toggle="${escapeHtml(def.id)}" data-status-version="${escapeHtml(def.version)}" data-status-next="${def.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}">${def.status === 'ACTIVE' ? '停用' : '啟用'}</button></div>
  </article>`).join('');
  const active = definitions.filter(def => def.status === 'ACTIVE');
  const current = select.value;
  select.innerHTML = characterId
    ? '<option value="">Select Definition</option>' + active.map(def => `<option value="${escapeHtml(def.id)}">${escapeHtml(def.canonicalNameZh)} · ${escapeHtml(STACK_LABELS[def.stackingRule] || def.stackingRule)}</option>`).join('')
    : '<option value="">Open a Character</option>';
  if (active.some(def => def.id === current)) select.value = current;
  select.disabled = !characterId || !active.length;
  $('#gm-status-apply').disabled = select.disabled;
}

function durationText(effect) {
  return effect.durationType === 'PERMANENT' ? '永久' : `${effect.remainingRounds} 回合剩餘`;
}

function renderRuntime() {
  const target = $('#gm-status-runtime-list');
  if (!target) return;
  $('#gm-status-character-name').textContent = character ? `${character.name} · Runtime Status` : 'Open a Character';
  $('#gm-status-tick').disabled = !characterId;
  if (!characterId) {
    target.innerHTML = '<p class="muted">Open a Character to load Runtime Status.</p>';
    return;
  }
  if (!effects.length) {
    target.innerHTML = '<p class="muted">No Runtime Status history for this Character.</p>';
    return;
  }
  target.innerHTML = effects.map(effect => `<article class="stack-item">
    <div>
      <div class="row-inline wrap"><h4>${escapeHtml(effect.definitionNameZh || effect.definitionId)}</h4><span class="tag">${escapeHtml(effect.status)}</span><span class="tag">x${escapeHtml(effect.stackCount)}</span></div>
      <p>${escapeHtml(durationText(effect))} · Definition v${escapeHtml(effect.definitionVersion)} · Runtime v${escapeHtml(effect.version)}</p>
      <p>Stack Key ${escapeHtml(effect.stackKey)} · Last ${escapeHtml(effect.lastAction)}</p>
      <p class="muted">${escapeHtml(effect.lastReason || '')}</p>
    </div>
    ${effect.status === 'ACTIVE' ? `<button class="button button-small button-danger-soft" type="button" data-status-remove="${escapeHtml(effect.id)}">移除</button>` : ''}
  </article>`).join('');
}

function renderAudit() {
  const target = $('#gm-status-audit-list');
  if (!target) return;
  if (!characterId) {
    target.innerHTML = '<p class="muted">Open a Character to load audit.</p>';
    return;
  }
  if (!audit.length) {
    target.innerHTML = '<p class="muted">No Status lifecycle audit.</p>';
    return;
  }
  target.innerHTML = audit.slice(0, 30).map(event => `<article class="stack-item"><div>
    <div class="row-inline wrap"><strong>${escapeHtml(event.action)}</strong><span class="tag">${new Date(event.createdAt).toLocaleString()}</span></div>
    <p>${escapeHtml(event.reason || '')}</p><p class="muted">${escapeHtml(event.instanceId)}</p>
  </div></article>`).join('');
}

async function loadDefinitions() {
  const payload = await api('/api/gm/status-effects/definitions?status=ALL');
  definitions = payload.definitions || [];
  renderDefinitions();
}

async function loadRuntime() {
  if (!characterId) {
    effects = [];
    audit = [];
    renderRuntime();
    renderAudit();
    return;
  }
  const payload = await api(`/api/gm/characters/${encodeURIComponent(characterId)}/status-effects?includeHistory=1&auditLimit=30`);
  character = payload.character || character;
  effects = payload.effects || [];
  audit = payload.audit || [];
  renderRuntime();
  renderAudit();
}

async function openCharacter(id) {
  if (!ensurePanel()) return;
  characterId = id || '';
  character = null;
  effects = [];
  audit = [];
  renderRuntime();
  renderAudit();
  renderDefinitions();
  status(characterId ? 'Loading Status Effect Runtime…' : '');
  try {
    await Promise.all([loadDefinitions(), loadRuntime()]);
    status('');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  }
}

async function createDefinition() {
  let body;
  try { body = readDefinitionForm(); }
  catch (error) { return toast(error.message, 'error'); }
  status('Creating approved Status Definition…');
  try {
    const payload = await api('/api/gm/status-effects/definitions', { method: 'POST', body: JSON.stringify(body) });
    definitions = [...definitions.filter(def => def.id !== payload.definition.id), payload.definition].sort((a, b) => a.canonicalNameZh.localeCompare(b.canonicalNameZh, 'zh-Hant'));
    renderDefinitions();
    status(`Definition 已建立：${payload.definition.canonicalNameZh}`, 'success');
    toast('Status Definition created.', 'success');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  }
}

async function toggleDefinition(button) {
  const reason = String($('#gm-status-change-reason')?.value || '').trim();
  if (!reason) return toast('Definition Change Reason 必填。', 'error');
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/status-effects/definitions/${encodeURIComponent(button.dataset.statusToggle)}`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedVersion: Number(button.dataset.statusVersion), status: button.dataset.statusNext, changeReason: reason })
    });
    definitions = definitions.map(def => def.id === payload.definition.id ? payload.definition : def);
    renderDefinitions();
    toast(`Definition ${payload.definition.status}.`, 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadDefinitions().catch(() => {});
  } finally {
    button.disabled = false;
  }
}

function runtimeReason() {
  const reason = String($('#gm-status-runtime-reason')?.value || '').trim();
  if (!reason) throw new Error('Runtime Reason 必填。');
  return reason;
}

async function applyStatus() {
  if (!characterId) return;
  const definitionId = $('#gm-status-apply-definition')?.value || '';
  if (!definitionId) return toast('請選擇 ACTIVE Definition。', 'error');
  let reason;
  try { reason = runtimeReason(); } catch (error) { return toast(error.message, 'error'); }
  status('Applying Runtime Status…');
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(characterId)}/status-effects`, {
      method: 'POST',
      body: JSON.stringify({ definitionId, meaningfulReason: reason, sourceType: 'GM', sourceContext: { surface: 'gm_status_effects' } })
    });
    await loadRuntime();
    status(payload.operation === 'BLOCK' ? `Application blocked by stacking policy: ${payload.blockReason}.` : `Runtime Status operation: ${payload.operation}.`, payload.operation === 'BLOCK' ? 'warning' : 'success');
    toast(payload.operation === 'BLOCK' ? 'Stacking policy kept the existing Status.' : 'Runtime Status updated.', payload.operation === 'BLOCK' ? 'warning' : 'success');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  }
}

async function tickRound() {
  if (!characterId) return;
  let reason;
  try { reason = runtimeReason(); } catch (error) { return toast(error.message, 'error'); }
  status('Advancing one explicit Status Round…');
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(characterId)}/status-effects/tick-round`, {
      method: 'POST', body: JSON.stringify({ meaningfulReason: reason })
    });
    await loadRuntime();
    status(`Status Round完成：${payload.changed} changed · ${payload.expired} expired。沒有執行任何 Status 數值效果。`, 'success');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  }
}

async function removeStatus(instanceId) {
  let reason;
  try { reason = runtimeReason(); } catch (error) { return toast(error.message, 'error'); }
  status('Removing Runtime Status…');
  try {
    await api(`/api/gm/status-effects/instances/${encodeURIComponent(instanceId)}/remove`, {
      method: 'POST', body: JSON.stringify({ meaningfulReason: reason })
    });
    await loadRuntime();
    status('Runtime Status removed and audited.', 'success');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  }
}

function bindPanel() {
  $('#gm-status-duration-type')?.addEventListener('change', syncDefinitionForm);
  $('#gm-status-stacking')?.addEventListener('change', syncDefinitionForm);
  $('#gm-status-create-definition')?.addEventListener('click', createDefinition);
  $('#gm-status-reload-definitions')?.addEventListener('click', () => loadDefinitions().catch(error => toast(error.message, 'error')));
  $('#gm-status-apply')?.addEventListener('click', applyStatus);
  $('#gm-status-tick')?.addEventListener('click', tickRound);
  $('#gm-status-definition-list')?.addEventListener('click', event => {
    const button = event.target.closest?.('[data-status-toggle]');
    if (button) toggleDefinition(button);
  });
  $('#gm-status-runtime-list')?.addEventListener('click', event => {
    const button = event.target.closest?.('[data-status-remove]');
    if (button) removeStatus(button.dataset.statusRemove);
  });
  syncDefinitionForm();
}

function bindLifecycle() {
  ensurePanel();
  document.addEventListener('click', event => {
    const open = event.target.closest?.('[data-open-character]');
    if (open) {
      queueMicrotask(() => openCharacter(open.dataset.openCharacter || ''));
      return;
    }
    if (event.target.closest?.('#close-gm-character')) openCharacter('').catch(() => {});
  });
}

bindLifecycle();
