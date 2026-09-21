const $ = selector => document.querySelector(selector);

let settlements = [];
let profiles = [];
let applications = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Request failed (${response.status}).`);
  return payload;
}

function toast(message, tone = 'info') {
  window.dispatchEvent(new CustomEvent('dnd:toast', { detail: { message, tone } }));
}

function ensurePanel() {
  if ($('#gm-nd-status-application-panel')) return true;
  const dashboard = $('#view-dashboard');
  if (!dashboard) return false;
  const section = document.createElement('section');
  section.id = 'gm-nd-status-application-panel';
  section.className = 'panel';
  section.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">SETTLEMENT → RUNTIME STATUS</p>
        <h2>Non-damage Status Application Adapter</h2>
        <p class="muted">只消費已提交Settlement同READY Profile；Blocked/GM Decision唔會套Status。實際套用仍走同一Status Runtime authority。</p>
      </div>
      <button id="gm-nd-status-application-reload" class="button button-ghost button-small" type="button">Reload</button>
    </div>
    <div id="gm-nd-status-application-status" class="auth-status" hidden></div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Settlement</span><select id="gm-nd-status-application-settlement" class="input"></select></label>
      <label class="field"><span>READY Profile</span><select id="gm-nd-status-application-profile" class="input"></select></label>
      <label class="field"><span>Meaningful Reason</span><input id="gm-nd-status-application-reason" class="input" maxlength="1000" placeholder="Required"></label>
    </div>
    <div class="form-actions"><button id="gm-nd-status-application-apply" class="button" type="button">Apply Settlement Status</button></div>
    <div id="gm-nd-status-application-list" class="stack-list"><p class="muted">No application history loaded.</p></div>
  `;
  dashboard.appendChild(section);
  return true;
}

function setStatus(message = '', tone = 'info') {
  const box = $('#gm-nd-status-application-status');
  if (!box) return;
  box.hidden = !message;
  box.className = `auth-status auth-status-${tone}`;
  box.textContent = message;
}

function renderInputs() {
  const settlementSelect = $('#gm-nd-status-application-settlement');
  const profileSelect = $('#gm-nd-status-application-profile');
  if (settlementSelect) {
    settlementSelect.innerHTML = settlements.length
      ? settlements.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.sourceCharacterName || s.sourceCharacterId)} → ${escapeHtml(s.resistanceCharacterName || s.resistanceCharacterId)} · ${escapeHtml(s.outcome)} · ×${s.primaryEffectMultiplier}</option>`).join('')
      : '<option value="">No Settlement records</option>';
  }
  if (profileSelect) {
    const ready = profiles.filter(p => p.readiness?.ready);
    profileSelect.innerHTML = ready.length
      ? ready.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(p.statusDefinition?.canonicalNameZh || p.statusDefinitionId)} · ${escapeHtml(p.primaryEffectField)}</option>`).join('')
      : '<option value="">No READY Profiles</option>';
  }
}

function renderApplications() {
  const list = $('#gm-nd-status-application-list');
  if (!list) return;
  if (!applications.length) {
    list.innerHTML = '<p class="muted">No application history yet.</p>';
    return;
  }
  list.innerHTML = applications.map(app => `
    <article class="list-card">
      <div class="panel-heading">
        <div>
          <strong>${escapeHtml(app.applicationStatus)}</strong>
          <div class="muted">Settlement ${escapeHtml(app.settlementId)} · Profile ${escapeHtml(app.profileId)}</div>
          <div class="muted">${escapeHtml(app.primaryEffectField)}: ${escapeHtml(app.primaryEffectBaseValue)} × ${app.primaryEffectMultiplier} = ${escapeHtml(app.primaryEffectAppliedValue)}</div>
        </div>
        <span class="status-pill">${escapeHtml(app.runtimeOperation || 'NO_RUNTIME_WRITE')}</span>
      </div>
    </article>`).join('');
}

async function loadAll() {
  if (!ensurePanel()) return;
  setStatus('Loading Settlement/Profile/Application authority…');
  try {
    const [settlementPayload, profilePayload, appPayload] = await Promise.all([
      api('/api/gm/non-damage-effect-settlements?limit=100'),
      api('/api/gm/non-damage-status-profiles'),
      api('/api/gm/non-damage-status-applications?limit=100')
    ]);
    settlements = settlementPayload.settlements || [];
    profiles = profilePayload.profiles || [];
    applications = appPayload.applications || [];
    renderInputs();
    renderApplications();
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function applySelected() {
  const settlementId = $('#gm-nd-status-application-settlement')?.value || '';
  const profileId = $('#gm-nd-status-application-profile')?.value || '';
  const meaningfulReason = String($('#gm-nd-status-application-reason')?.value || '').trim();
  if (!settlementId || !profileId || !meaningfulReason) return toast('Settlement、READY Profile同Meaningful Reason必填。', 'error');
  setStatus('Applying through canonical Status Runtime authority…');
  try {
    const payload = await api('/api/gm/non-damage-status-applications', {
      method: 'POST',
      body: JSON.stringify({ settlementId, profileId, meaningfulReason })
    });
    await loadAll();
    const app = payload.application || {};
    setStatus(`Application ${app.applicationStatus || 'completed'} · ${app.runtimeOperation || 'no Runtime write'}`, app.applicationStatus === 'BLOCKED' ? 'warning' : 'success');
    toast(payload.idempotent ? 'Existing application returned idempotently.' : 'Settlement Status application recorded.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    toast(error.message, 'error');
  }
}

function bind() {
  if (!ensurePanel()) return;
  $('#gm-nd-status-application-reload')?.addEventListener('click', loadAll);
  $('#gm-nd-status-application-apply')?.addEventListener('click', applySelected);
  loadAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
