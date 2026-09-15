import { $, escapeHtml, toast } from './common.js';

let selectedCharacterId = '';
let skills = [];
let checks = [];

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
  if ($('#gm-basic-skill-check-panel')) return;
  const skillPanel = $('#gm-skill-list')?.closest('.panel');
  if (!skillPanel) return;
  const panel = document.createElement('section');
  panel.id = 'gm-basic-skill-check-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h3>Basic Skill D100 Check</h3>
        <span class="muted">GM-recognized meaningful check. Result = roll - [100 - (natural skill + total modifier)]. Raw 100/1 are Great Success/Great Failure markers.</span>
      </div>
      <span id="gm-basic-skill-check-character" class="muted">Open a Character</span>
    </div>
    <div id="gm-basic-skill-check-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Basic Skill</span><select id="gm-basic-skill-check-skill" class="input" disabled><option value="">Open a Character</option></select></label>
      <label class="field"><span>Total Modifier</span><input id="gm-basic-skill-check-modifier" class="input" type="number" step="1" value="0"><small>Buff / Debuff / Equipment / Ability / GM / Environment combined.</small></label>
      <label class="field"><span>Raw D100 Roll</span><input id="gm-basic-skill-check-roll" class="input" type="number" min="1" max="100" step="1" placeholder="blank = server roll"><small>Leave blank for server RNG; enter 1–100 for an external / physical GM roll.</small></label>
      <label class="field"><span>Meaningful Reason</span><input id="gm-basic-skill-check-reason" class="input" maxlength="1000" placeholder="Why this check matters in the current scene / task"></label>
    </div>
    <label class="field"><span>Context JSON (optional)</span><textarea id="gm-basic-skill-check-context" class="textarea" rows="2" placeholder='{"sceneRunId":"...","note":"..."}'></textarea></label>
    <div class="form-actions wrap">
      <button id="gm-basic-skill-check-roll-button" class="button" type="button" disabled>Resolve D100 Check</button>
      <span class="muted">Great Success creates a pending growth-eligibility audit only. It does not add progress or Skill value yet.</span>
    </div>
    <div class="panel-heading"><h4>Recent Check Audit</h4><span class="muted">Latest 30 · immutable</span></div>
    <div id="gm-basic-skill-check-history" class="stack-list"><p class="muted">Open a Character to load check history.</p></div>`;
  skillPanel.after(panel);
}

function status(message = '', kind = '') {
  const box = $('#gm-basic-skill-check-status');
  if (!box) return;
  box.hidden = !message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.textContent = message;
}

function renderSkills() {
  const select = $('#gm-basic-skill-check-skill');
  const button = $('#gm-basic-skill-check-roll-button');
  if (!select || !button) return;
  const current = select.value;
  select.innerHTML = skills.length
    ? skills.map(skill => `<option value="${escapeHtml(skill.key)}">${escapeHtml(skill.label)} · Natural ${escapeHtml(skill.naturalValue)}</option>`).join('')
    : '<option value="">No canonical Basic Skills</option>';
  if (skills.some(skill => skill.key === current)) select.value = current;
  select.disabled = !selectedCharacterId || !skills.length;
  button.disabled = !selectedCharacterId || !skills.length;
}

function resultLabel(check) {
  const base = check.passed ? 'SUCCESS' : 'FAILURE';
  if (check.extremeResult === 'GREAT_SUCCESS') return `${base} · GREAT SUCCESS`;
  if (check.extremeResult === 'GREAT_FAILURE') return `${base} · GREAT FAILURE`;
  return base;
}

function renderHistory() {
  const target = $('#gm-basic-skill-check-history');
  if (!target) return;
  if (!selectedCharacterId) {
    target.innerHTML = '<p class="muted">Open a Character to load check history.</p>';
    return;
  }
  if (!checks.length) {
    target.innerHTML = '<p class="muted">No formal Basic Skill checks recorded for this Character.</p>';
    return;
  }
  target.innerHTML = checks.map(check => {
    const growth = check.growthEligibility
      ? `<span class="tag">Growth: ${escapeHtml(check.growthEligibility.status)}</span>`
      : '';
    return `<article class="stack-item">
      <div>
        <div class="row-inline">
          <h4>${escapeHtml(check.skillLabel)}</h4>
          <span class="status-pill">${escapeHtml(resultLabel(check))}</span>
          <span class="tag">${escapeHtml(check.rollSource)}</span>
          ${growth}
        </div>
        <p>Roll ${escapeHtml(check.rawRoll)} · Natural ${escapeHtml(check.naturalSkillValue)} · Modifier ${escapeHtml(check.totalModifier)} · Effective ${escapeHtml(check.effectiveSkillValue)} · Result ${escapeHtml(check.resultValue)}</p>
        <p>${escapeHtml(check.meaningfulReason)}</p>
      </div>
    </article>`;
  }).join('');
}

async function loadChecks() {
  ensurePanel();
  if (!selectedCharacterId) {
    skills = [];
    checks = [];
    $('#gm-basic-skill-check-character').textContent = 'Open a Character';
    renderSkills();
    renderHistory();
    return;
  }
  status('Loading Basic Skill check authority…');
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/basic-skill-checks?limit=30`);
    skills = payload.skills || [];
    checks = payload.checks || [];
    $('#gm-basic-skill-check-character').textContent = `${payload.character?.name || 'Character'} · ${skills.length} skills`;
    renderSkills();
    renderHistory();
    status('');
  } catch (error) {
    status(error.message, 'error');
    throw error;
  }
}

function readContext() {
  const raw = String($('#gm-basic-skill-check-context')?.value || '').trim();
  if (!raw) return {};
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Context JSON 格式錯誤。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Context JSON 必須係 object。');
  return value;
}

async function resolveCheck() {
  if (!selectedCharacterId) return;
  const skillKey = $('#gm-basic-skill-check-skill')?.value || '';
  const totalModifier = Number($('#gm-basic-skill-check-modifier')?.value || 0);
  const reason = String($('#gm-basic-skill-check-reason')?.value || '').trim();
  const rawText = String($('#gm-basic-skill-check-roll')?.value || '').trim();
  if (!skillKey) return toast('請選擇 Basic Skill。', 'error');
  if (!Number.isSafeInteger(totalModifier)) return toast('Total Modifier 必須係整數。', 'error');
  if (!reason) return toast('Meaningful Reason 必填，避免無意義刷骰。', 'error');
  let context;
  try { context = readContext(); }
  catch (error) { return toast(error.message, 'error'); }
  const body = { skillKey, totalModifier, meaningfulReason: reason, context };
  if (rawText) {
    const rawRoll = Number(rawText);
    if (!Number.isSafeInteger(rawRoll) || rawRoll < 1 || rawRoll > 100) return toast('Raw D100 Roll 必須係 1–100 整數。', 'error');
    body.rawRoll = rawRoll;
  }
  const button = $('#gm-basic-skill-check-roll-button');
  button.disabled = true;
  status('Resolving and writing immutable D1 audit…');
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/basic-skill-checks`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    $('#gm-basic-skill-check-roll').value = '';
    checks = [payload.check, ...checks].slice(0, 30);
    renderHistory();
    const suffix = payload.check?.growthEligibility ? '；Great Success growth eligibility 已記錄為 PENDING_BALANCE。' : '。';
    status(`已記錄 ${payload.check?.skillLabel || 'Basic Skill'}：Roll ${payload.check?.rawRoll} / Result ${payload.check?.resultValue}${suffix}`, 'success');
    toast('Basic Skill D100 check recorded.', 'success');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  } finally {
    button.disabled = !selectedCharacterId || !skills.length;
  }
}

ensurePanel();
$('#gm-basic-skill-check-roll-button')?.addEventListener('click', resolveCheck);
document.addEventListener('click', event => {
  const open = event.target.closest?.('[data-open-character]');
  if (open) {
    selectedCharacterId = open.dataset.openCharacter || '';
    queueMicrotask(() => loadChecks().catch(error => toast(error.message, 'error')));
    return;
  }
  if (event.target.closest?.('#close-gm-character')) {
    selectedCharacterId = '';
    skills = [];
    checks = [];
    status('');
    loadChecks().catch(() => {});
  }
});
