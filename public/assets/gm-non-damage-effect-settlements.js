import { $, escapeHtml, toast } from './common.js';

let characterId = '';
let opposedChecks = [];
let settlements = [];

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
  if ($('#gm-non-damage-settlement-panel')) return;
  const anchor = $('#gm-opposed-d100-panel') || $('#gm-basic-skill-check-panel');
  if (!anchor) return;
  const panel = document.createElement('section');
  panel.id = 'gm-non-damage-settlement-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h3>Non-damage Effect Settlement</h3>
        <span class="muted">Turn one immutable Opposed D100 audit into one canonical settlement decision. This still does not apply a Status or other gameplay effect.</span>
      </div>
      <span id="gm-settlement-character" class="muted">Open a Character</span>
    </div>
    <div id="gm-settlement-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Opposed D100 Audit</span><select id="gm-settlement-opposed" class="input" disabled><option value="">Open a Character</option></select></label>
      <label class="field"><span>Meaningful Settlement Reason</span><input id="gm-settlement-reason" class="input" maxlength="1000" placeholder="Why this non-damage effect is being formally settled"></label>
    </div>
    <label class="field"><span>Context JSON (optional)</span><textarea id="gm-settlement-context" class="textarea" rows="2" placeholder='{"effect":"stun","note":"GM adjudication context"}'></textarea></label>
    <div class="form-actions wrap">
      <button id="gm-settlement-record" class="button" type="button" disabled>Record Settlement Decision</button>
      <span class="muted">No Status, damage, healing, movement, Action / Move, MP or Ability execution is applied here.</span>
    </div>
    <div id="gm-settlement-result" class="tool-result muted">No settlement recorded yet.</div>
    <div class="panel-heading"><h4>Recent Settlement Audit</h4><span class="muted">Immutable · latest 30 involving this Character</span></div>
    <div id="gm-settlement-history" class="stack-list"><p class="muted">Open a Character to load settlement history.</p></div>`;
  anchor.after(panel);
  $('#gm-settlement-record')?.addEventListener('click', recordSettlement);
  $('#gm-settlement-opposed')?.addEventListener('change', refreshButton);
}

function status(message = '', kind = '') {
  const box = $('#gm-settlement-status');
  if (!box) return;
  box.hidden = !message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.textContent = message;
}

function settledMap() {
  return new Map(settlements.map(row => [row.opposedCheckId, row]));
}

function opposedLabel(check, settled) {
  const source = `${check.source?.skillLabel || 'Source'} ${check.source?.rawRoll ?? '?'}→${check.source?.resultValue ?? '?'}`;
  const resistance = `${check.resistance?.skillLabel || 'Resistance'} ${check.resistance?.rawRoll ?? '?'}→${check.resistance?.resultValue ?? '?'}`;
  return `${source} vs ${resistance} · ${check.comparison}${settled ? ' · SETTLED' : ''}`;
}

function renderOpposedOptions() {
  const select = $('#gm-settlement-opposed');
  if (!select) return;
  if (!characterId) {
    select.innerHTML = '<option value="">Open a Character</option>';
    select.disabled = true;
    refreshButton();
    return;
  }
  if (!opposedChecks.length) {
    select.innerHTML = '<option value="">No Opposed D100 audits</option>';
    select.disabled = true;
    refreshButton();
    return;
  }
  const current = select.value;
  const byOpposed = settledMap();
  select.innerHTML = '<option value="">Select Opposed audit</option>' + opposedChecks.map(check =>
    `<option value="${escapeHtml(check.id)}">${escapeHtml(opposedLabel(check, byOpposed.has(check.id)))}</option>`
  ).join('');
  if (opposedChecks.some(check => check.id === current)) select.value = current;
  select.disabled = false;
  refreshButton();
}

function flags(row) {
  const output = [];
  if (row.sourceGreatSuccessApplied) output.push('Source Great Success applied');
  if (row.sourceGreatFailure) output.push('Source Great Failure');
  if (row.defenseGreatSuccess) output.push('Defense Great Success');
  if (row.defenseGreatFailure) output.push('Defense Great Failure');
  if (row.doubleFailureOverride) output.push('1 vs 1 accidental success');
  if (row.gmResolutionRequired) output.push('GM deviation decision required');
  return output;
}

function renderResult(row, idempotent = false) {
  const target = $('#gm-settlement-result');
  if (!target) return;
  if (!row) {
    target.textContent = 'No settlement recorded yet.';
    return;
  }
  target.innerHTML = `<strong>${escapeHtml(row.outcome)}</strong>${idempotent ? ' · existing immutable settlement' : ''}<br>
    Original target: ${escapeHtml(row.originalTargetResolution)} · Primary effect multiplier ×${escapeHtml(row.primaryEffectMultiplier)}<br>
    Result gap ${escapeHtml(row.resultGap)} · Narrative gap ${escapeHtml(row.narrativeGap)}<br>
    <span class="muted">${escapeHtml(flags(row).join(' · ') || 'No Great modifier')}</span><br>
    <span class="muted">Decision audit only — no Status/effect has been applied.</span>`;
}

function renderHistory() {
  const target = $('#gm-settlement-history');
  if (!target) return;
  if (!characterId) {
    target.innerHTML = '<p class="muted">Open a Character to load settlement history.</p>';
    return;
  }
  if (!settlements.length) {
    target.innerHTML = '<p class="muted">No settlement audits involving this Character.</p>';
    return;
  }
  target.innerHTML = settlements.map(row => `<article class="stack-item">
    <div>
      <div class="row-inline"><h4>${escapeHtml(row.outcome)}</h4><span class="tag">×${escapeHtml(row.primaryEffectMultiplier)}</span>${row.gmResolutionRequired ? '<span class="tag">GM decision required</span>' : ''}</div>
      <p>${escapeHtml(row.sourceCharacterName || row.sourceCharacterId)} vs ${escapeHtml(row.resistanceCharacterName || row.resistanceCharacterId)} · ${escapeHtml(row.comparison)}</p>
      <p>Original target: ${escapeHtml(row.originalTargetResolution)} · Gap ${escapeHtml(row.resultGap)} · Narrative ${escapeHtml(row.narrativeGap)}</p>
      <p class="muted">${escapeHtml(flags(row).join(' · ') || 'No Great modifier')}</p>
      <p>${escapeHtml(row.meaningfulReason || '')}</p>
    </div>
  </article>`).join('');
}

function refreshButton() {
  const button = $('#gm-settlement-record');
  if (!button) return;
  button.disabled = !characterId || !$('#gm-settlement-opposed')?.value;
}

function readContext() {
  const raw = String($('#gm-settlement-context')?.value || '').trim();
  if (!raw) return {};
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Context JSON 格式錯誤。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Context JSON 必須係 object。');
  return value;
}

async function loadData() {
  if (!characterId) {
    opposedChecks = [];
    settlements = [];
    renderOpposedOptions();
    renderHistory();
    return;
  }
  status('Loading settlement authority…');
  try {
    const [opposed, settled] = await Promise.all([
      api(`/api/gm/basic-skill-opposed-checks?characterId=${encodeURIComponent(characterId)}&limit=30`),
      api(`/api/gm/non-damage-effect-settlements?characterId=${encodeURIComponent(characterId)}&limit=30`)
    ]);
    opposedChecks = opposed.checks || [];
    settlements = settled.settlements || [];
    renderOpposedOptions();
    renderHistory();
    status('');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  }
}

async function openCharacter(id) {
  ensurePanel();
  characterId = id || '';
  $('#gm-settlement-character').textContent = characterId ? 'Current Character settlement audit' : 'Open a Character';
  renderResult(null);
  await loadData();
}

async function recordSettlement() {
  const opposedCheckId = $('#gm-settlement-opposed')?.value || '';
  const meaningfulReason = String($('#gm-settlement-reason')?.value || '').trim();
  if (!opposedCheckId) return toast('請先揀 Opposed D100 audit。', 'error');
  if (!meaningfulReason) return toast('Meaningful Settlement Reason 必填。', 'error');
  let context;
  try { context = readContext(); }
  catch (error) { return toast(error.message, 'error'); }

  const button = $('#gm-settlement-record');
  button.disabled = true;
  status('Recording canonical settlement decision…');
  try {
    const payload = await api('/api/gm/non-damage-effect-settlements', {
      method: 'POST',
      body: JSON.stringify({ opposedCheckId, meaningfulReason, context })
    });
    renderResult(payload.settlement, Boolean(payload.idempotent));
    const index = settlements.findIndex(row => row.opposedCheckId === payload.settlement.opposedCheckId);
    if (index >= 0) settlements[index] = payload.settlement;
    else settlements.unshift(payload.settlement);
    settlements = settlements.slice(0, 30);
    renderOpposedOptions();
    renderHistory();
    status(payload.idempotent ? 'Existing immutable settlement returned.' : 'Settlement decision recorded.', 'success');
    toast(payload.idempotent ? 'Settlement already existed.' : 'Settlement decision recorded.', 'success');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  } finally {
    refreshButton();
  }
}

function bindLifecycle() {
  ensurePanel();
  document.addEventListener('click', event => {
    const open = event.target.closest?.('[data-open-character]');
    if (open) {
      queueMicrotask(() => openCharacter(open.dataset.openCharacter || ''));
      return;
    }
    if (event.target.closest?.('#close-gm-character')) {
      openCharacter('').catch(() => {});
    }
  });
}

bindLifecycle();
