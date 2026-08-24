import { $, $$, escapeHtml, toast } from './common.js';

const DEFAULT_POOL = 200;
const CREATION_SKILL_CAP = 30;
let currentCharacterId = '';
let currentCharacter = null;
let loadSequence = 0;

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
          <button id="save-creation-skills" class="button" type="button">Save Allocation</button>
        </div>
        <p class="muted">Draft Character only. 每個基礎技能可分配 0–30 點；目前可保存未用盡嘅配置，Finalize 規則會喺下一個 blocker 再處理。</p>
        <div id="creation-skill-status" class="auth-status" hidden role="status" aria-live="polite"></div>
        <div id="creation-skill-list" class="stack-list"></div>
      </section>`;
    overviewPanel.insertAdjacentElement('afterend', panel);
    $('#save-creation-skills')?.addEventListener('click', saveAllocation);
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
  const save = $('#save-creation-skills');
  if (summary) {
    summary.textContent = `Spent ${state.spent} / ${state.pool} · Remaining ${state.remaining}`;
  }
  if (save) save.disabled = !state.valid;

  if (state.spent > state.pool) {
    setStatus(`超出 Creation Skill Point 上限 ${state.pool} 點。`, 'error');
  } else if (!state.valid) {
    setStatus(`每個技能必須係 0–${CREATION_SKILL_CAP} 嘅整數。`, 'error');
  } else {
    setStatus('');
  }
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
    currentCharacterId = '';
    hideCreationUI();
    return;
  }
  if (!force && id === currentCharacterId && currentCharacter) return;

  currentCharacterId = id;
  const sequence = ++loadSequence;
  try {
    const payload = await api(`/api/player/characters/${encodeURIComponent(id)}`);
    if (sequence !== loadSequence || currentCharacterId !== id) return;
    renderCreationSkills(payload.character);
  } catch (error) {
    if (sequence !== loadSequence) return;
    hideCreationUI();
    toast(error.message, 'error');
  }
}

async function saveAllocation() {
  if (!currentCharacterId || !currentCharacter) return;
  const state = allocationState();
  if (!state.valid) {
    refreshAllocationSummary();
    return;
  }

  const button = $('#save-creation-skills');
  button.disabled = true;
  setStatus('正在保存 Creation Skill Points…');
  try {
    const payload = await api(`/api/player/characters/${encodeURIComponent(currentCharacterId)}/creation-skills`, {
      method: 'PATCH',
      body: JSON.stringify({ allocations: state.allocations })
    });
    setStatus(
      `已保存：Spent ${payload.progression.creationSkillPointsSpent} · Remaining ${payload.progression.creationSkillPointsRemaining}`,
      'success'
    );
    await loadSelectedCharacter(true);
    showCreationTab();
    toast('Creation Skill allocation saved.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    refreshAllocationSummary();
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
