import { $, $$, escapeHtml, toast } from './common.js';

const DEFAULT_POOL = 200;
const CREATION_SKILL_CAP = 30;
let currentCharacterId = '';
let currentCharacter = null;
let loadSequence = 0;
let creationMutationPending = false;

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

function ensureCreationUI() {
  const nav = $('.tabbar');
  const overviewPanel = $('#tab-overview');
  if (!nav || !overviewPanel) return false;

  if (!$('#creation-skills-tab')) {
    const button = document.createElement('button');
    button.id = 'creation-skills-tab';
    button.className = 'tab hidden';
    button.type = 'button';
    button.dataset.tab = 'creation-skills';
    button.textContent = 'Creation Skills';
    const overviewButton = $('[data-tab="overview"]', nav);
    overviewButton?.insertAdjacentElement('afterend', button);
    button.addEventListener('click', showCreationTab);
  }

  if (!$('#tab-creation-skills')) {
    const panel = document.createElement('div');
    panel.id = 'tab-creation-skills';
    panel.className = 'tab-panel hidden';
    panel.innerHTML = `
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h3>Creation Skill Points</h3>
            <span id="creation-skill-summary" class="muted">Spent 0 / 200 · Remaining 200</span>
          </div>
          <div class="row-inline">
            <button id="save-creation-skills" class="button button-ghost" type="button">Save Allocation</button>
            <button id="finalize-character" class="button" type="button" disabled>Finalize Character</button>
          </div>
        </div>
        <p class="muted">Draft Character only. 每個基礎技能可分配 0–30 點；可以先保存部分配置，但必須完整使用 200 點先可以 Finalize。</p>
        <div id="creation-skill-status" class="auth-status" hidden role="status" aria-live="polite"></div>
        <div id="creation-skill-list" class="stack-list"></div>
      </section>`;
    overviewPanel.insertAdjacentElement('afterend', panel);
    $('#save-creation-skills')?.addEventListener('click', saveAllocation);
    $('#finalize-character')?.addEventListener('click', finalizeCharacter);
  }

  return true;
}

function showCreationTab() {
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.id === 'creation-skills-tab'));
  $$('.tab-panel').forEach(panel => panel.classList.add('hidden'));
  $('#tab-creation-skills')?.classList.remove('hidden');
}

function showOverviewTab() {
  const overview = $('[data-tab="overview"]');
  overview?.click();
}

function setStatus(message = '', kind = '') {
  const box = $('#creation-skill-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function selectedCharacterId() {
  return $('.character-card.selected')?.dataset.characterId || '';
}

function hideCreationUI() {
  const tab = $('#creation-skills-tab');
  const panel = $('#tab-creation-skills');
  if (tab?.classList.contains('active')) showOverviewTab();
  tab?.classList.add('hidden');
  panel?.classList.add('hidden');
  currentCharacter = null;
}

function allocationState() {
  const inputs = $$('[data-creation-skill]');
  const pool = Number(currentCharacter?.progression?.creationSkillPointsTotal || DEFAULT_POOL);
  let spent = 0;
  let valid = inputs.length === 23;
  const allocations = {};

  for (const input of inputs) {
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 0 || value > CREATION_SKILL_CAP) valid = false;
    allocations[input.dataset.creationSkill] = value;
    if (Number.isFinite(value)) spent += value;
  }

  const remaining = pool - spent;
  if (spent > pool) valid = false;
  return { allocations, spent, remaining, pool, valid };
}

function refreshAllocationSummary() {
  const state = allocationState();
  const summary = $('#creation-skill-summary');
  if (summary) {
    summary.textContent = `Spent ${state.spent} / ${state.pool} · Remaining ${state.remaining}`;
  }
  updateCreationControls(state);

  if (state.spent > state.pool) {
    setStatus(`超出 Creation Skill Point 上限 ${state.pool} 點。`, 'error');
  } else if (!state.valid) {
    setStatus(`每個技能必須係 0–${CREATION_SKILL_CAP} 嘅整數。`, 'error');
  } else if (state.spent < state.pool) {
    setStatus(`仲有 ${state.remaining} 點未分配；可以 Save，但未可以 Finalize。`);
  } else {
    setStatus('已分配完整 200 點，可以 Save 或 Finalize。', 'success');
  }
}

function updateCreationControls(state = allocationState()) {
  const editable = currentCharacter?.id === currentCharacterId
    && selectedCharacterId() === currentCharacterId
    && currentCharacter?.status === 'draft' && !currentCharacter?.progression?.creationComplete;
  const locked = creationMutationPending || !editable;
  const save = $('#save-creation-skills');
  const finalize = $('#finalize-character');
  if (save) save.disabled = locked || !state.valid;
  if (finalize) finalize.disabled = locked || !state.valid || state.spent !== state.pool;
  $$('[data-creation-skill]').forEach(input => { input.disabled = locked; });
}

function renderCreationSkills(character) {
  if (!ensureCreationUI()) return;
  currentCharacter = character;

  const progression = character?.progression;
  const editable = character?.status === 'draft' && progression && !progression.creationComplete;
  const tab = $('#creation-skills-tab');
  const list = $('#creation-skill-list');

  if (!editable) {
    hideCreationUI();
    return;
  }

  tab?.classList.remove('hidden');
  const skills = Array.isArray(character.skills) ? character.skills : [];
  if (skills.length !== 23) {
    list.innerHTML = '<p class="muted">23 個基礎技能未完整初始化，暫時無法分配 Creation Skill Points。</p>';
    $('#save-creation-skills').disabled = true;
    $('#finalize-character').disabled = true;
    setStatus('Character Skill initialization is incomplete.', 'error');
    return;
  }

  list.innerHTML = skills.map(skill => `<article class="stack-item">
    <div>
      <div class="row-inline"><h4>${escapeHtml(skill.label)}</h4><span class="tag">${escapeHtml(skill.category)}</span></div>
      <p class="muted">${escapeHtml(skill.key)}</p>
    </div>
    <div class="quantity-editor">
      <span class="muted">0–${CREATION_SKILL_CAP}</span>
      <input
        class="input input-compact"
        type="number"
        min="0"
        max="${CREATION_SKILL_CAP}"
        step="1"
        value="${escapeHtml(Number(skill.creationValue ?? skill.value ?? 0))}"
        data-creation-skill="${escapeHtml(skill.key)}"
        aria-label="${escapeHtml(skill.label)} Creation Skill Points">
    </div>
  </article>`).join('');

  $$('[data-creation-skill]', list).forEach(input => input.addEventListener('input', refreshAllocationSummary));
  refreshAllocationSummary();
}

async function loadSelectedCharacter(force = false) {
  if (!ensureCreationUI()) return;
  const id = selectedCharacterId();
  if (!id) {
    ++loadSequence;
    currentCharacterId = '';
    hideCreationUI();
    updateCreationControls();
    return false;
  }
  if (!force && id === currentCharacterId && currentCharacter) return;

  if (id !== currentCharacterId) hideCreationUI();
  currentCharacterId = id;
  updateCreationControls();
  const sequence = ++loadSequence;
  try {
    const payload = await api(`/api/player/characters/${encodeURIComponent(id)}`);
    if (sequence !== loadSequence || currentCharacterId !== id || selectedCharacterId() !== id) return false;
    renderCreationSkills(payload.character);
    return true;
  } catch (error) {
    if (sequence !== loadSequence || selectedCharacterId() !== id) return false;
    hideCreationUI();
    updateCreationControls();
    toast(error.message, 'error');
    return false;
  }
}

async function persistAllocation(id, state) {
  return api(`/api/player/characters/${encodeURIComponent(id)}/creation-skills`, {
    method: 'PATCH',
    body: JSON.stringify({ allocations: state.allocations })
  });
}

function mutationCharacter() {
  if (creationMutationPending || !currentCharacterId || currentCharacter?.id !== currentCharacterId
      || selectedCharacterId() !== currentCharacterId || currentCharacter.status !== 'draft'
      || currentCharacter.progression?.creationComplete) return null;
  return currentCharacter;
}

function isCurrentView(id, sequence) {
  return id === currentCharacterId && id === selectedCharacterId() && sequence === loadSequence;
}

async function saveAllocation() {
  const character = mutationCharacter();
  if (!character) return;
  const sequence = loadSequence;
  const state = allocationState();
  if (!state.valid) {
    refreshAllocationSummary();
    return;
  }

  creationMutationPending = true;
  updateCreationControls(state);
  setStatus('正在保存 Creation Skill Points…');
  try {
    await persistAllocation(character.id, state);
    if (isCurrentView(character.id, sequence)) await loadSelectedCharacter(true);
    toast(`${character.name}：Creation Skill 配置已保存。`, 'success');
  } catch (error) {
    if (isCurrentView(character.id, sequence)) setStatus(error.message, 'error');
    else toast(`${character.name}：${error.message}`, 'error');
  } finally {
    creationMutationPending = false;
    updateCreationControls();
  }
}

async function finalizeCharacter() {
  const character = mutationCharacter();
  if (!character) return;
  const sequence = loadSequence;
  const state = allocationState();
  if (!state.valid || state.spent !== state.pool) {
    refreshAllocationSummary();
    setStatus(`必須完整分配 ${state.pool} 點先可以 Finalize。`, 'error');
    return;
  }

  if (!globalThis.confirm('Finalize 後 Creation Skill Points 將鎖定，不能再用建角介面修改。確定完成角色建立？')) return;

  creationMutationPending = true;
  updateCreationControls(state);
  setStatus('正在保存並完成角色建立…');

  try {
    const saved = await persistAllocation(character.id, state);
    if (Number(saved?.progression?.creationSkillPointsRemaining) !== 0) {
      throw new Error('Server 顯示仍有 Creation Skill Points 未分配。');
    }

    await api(`/api/player/characters/${encodeURIComponent(character.id)}/finalize-creation`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    character.status = 'active';
    character.progression.creationComplete = true;
    toast(`${character.name}：角色建立已完成。`, 'success');
    if (isCurrentView(character.id, sequence)) location.reload();
    else if (selectedCharacterId() === character.id) await loadSelectedCharacter(true);
  } catch (error) {
    if (isCurrentView(character.id, sequence)) setStatus(error.message, 'error');
    else toast(`${character.name}：${error.message}`, 'error');
  } finally {
    creationMutationPending = false;
    updateCreationControls();
  }
}

ensureCreationUI();
const characterList = $('#character-list');
if (characterList) {
  const observer = new MutationObserver(() => {
    queueMicrotask(() => { loadSelectedCharacter(); });
  });
  observer.observe(characterList, { childList: true, subtree: true });
}
loadSelectedCharacter();
