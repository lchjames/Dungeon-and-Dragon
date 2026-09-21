const $ = selector => document.querySelector(selector);

let profiles = [];
let definitions = [];

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
  if ($('#gm-non-damage-status-profile-panel')) return true;
  const dashboard = $('#view-dashboard');
  if (!dashboard) return false;
  const section = document.createElement('section');
  section.id = 'gm-non-damage-status-profile-panel';
  section.className = 'panel';
  section.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">APPROVED EFFECT PROFILE</p>
        <h2>Non-damage Status Application Profiles</h2>
        <p class="muted">Profile只建立 Settlement → Status Definition 嘅可驗證審批邊界；今個slice唔會套用 Runtime Status。</p>
      </div>
      <button id="gm-nd-status-profile-reload" class="button button-ghost button-small" type="button">Reload</button>
    </div>
    <div id="gm-nd-status-profile-status" class="auth-status" hidden></div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Profile Name</span><input id="gm-nd-status-profile-name" class="input" maxlength="120" placeholder="e.g. Stunning Strike Status"></label>
      <label class="field"><span>Status Definition</span><select id="gm-nd-status-profile-definition" class="input"></select></label>
      <label class="field"><span>Primary Effect Field</span>
        <select id="gm-nd-status-profile-primary" class="input">
          <option value="DURATION_ROUNDS">Duration rounds</option>
          <option value="STRENGTH_VALUE">Strength value</option>
          <option value="EFFECT_PROFILE_NUMERIC">Effect Profile numeric key</option>
        </select>
      </label>
      <label class="field"><span>Primary Effect Key</span><input id="gm-nd-status-profile-key" class="input" maxlength="80" placeholder="e.g. modifierValue"></label>
      <label class="field"><span>Change Reason</span><input id="gm-nd-status-profile-reason" class="input" maxlength="1000" placeholder="Required"></label>
    </div>
    <div class="form-actions"><button id="gm-nd-status-profile-create" class="button" type="button">Approve Profile</button></div>
    <div id="gm-nd-status-profile-list" class="stack-list"><p class="muted">No profiles loaded.</p></div>
  `;
  dashboard.appendChild(section);
  return true;
}

function setStatus(message = '', tone = 'info') {
  const box = $('#gm-nd-status-profile-status');
  if (!box) return;
  box.hidden = !message;
  box.className = `auth-status auth-status-${tone}`;
  box.textContent = message;
}

function syncKeyInput() {
  const input = $('#gm-nd-status-profile-key');
  if (!input) return;
  input.disabled = $('#gm-nd-status-profile-primary')?.value !== 'EFFECT_PROFILE_NUMERIC';
  if (input.disabled) input.value = '';
}

function renderDefinitions() {
  const select = $('#gm-nd-status-profile-definition');
  if (!select) return;
  const active = definitions.filter(def => def.status === 'ACTIVE');
  select.innerHTML = active.length
    ? active.map(def => `<option value="${escapeHtml(def.id)}">${escapeHtml(def.canonicalNameZh)} · v${Number(def.version)}</option>`).join('')
    : '<option value="">No ACTIVE Status Definitions</option>';
}

function renderProfiles() {
  const list = $('#gm-nd-status-profile-list');
  if (!list) return;
  if (!profiles.length) {
    list.innerHTML = '<p class="muted">No approved profiles yet.</p>';
    return;
  }
  list.innerHTML = profiles.map(profile => {
    const ready = profile.readiness?.ready;
    const reason = profile.readiness?.reason || 'READY';
    return `
      <article class="list-card">
        <div class="panel-heading">
          <div>
            <strong>${escapeHtml(profile.name)}</strong>
            <div class="muted">${escapeHtml(profile.statusDefinition?.canonicalNameZh || profile.statusDefinitionId)}
              · approved v${profile.statusDefinitionVersion}
              · current v${profile.statusDefinition?.version ?? '?'}
              · ${escapeHtml(profile.primaryEffectField)}
              ${profile.primaryEffectKey ? ' / ' + escapeHtml(profile.primaryEffectKey) : ''}
              = ${escapeHtml(profile.primaryEffectValue)}
            </div>
          </div>
          <span class="status-pill">${ready ? 'READY' : escapeHtml(reason)}</span>
        </div>
        <div class="row-inline wrap">
          <span class="muted">Profile ${escapeHtml(profile.status)} · v${profile.version}</span>
          <button class="button button-small" type="button"
            data-profile-reapprove="${escapeHtml(profile.id)}"
            data-profile-version="${profile.version}">Re-approve Current Definition</button>
          <button class="button button-ghost button-small" type="button"
            data-profile-toggle="${escapeHtml(profile.id)}"
            data-profile-version="${profile.version}"
            data-profile-next="${profile.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}">
            Set ${profile.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}
          </button>
        </div>
      </article>`;
  }).join('');
}

async function loadAll() {
  if (!ensurePanel()) return;
  setStatus('Loading profiles…');
  try {
    const [profilePayload, definitionPayload] = await Promise.all([
      api('/api/gm/non-damage-status-profiles'),
      api('/api/gm/status-effects/definitions?status=ALL')
    ]);
    profiles = profilePayload.profiles || [];
    definitions = definitionPayload.definitions || [];
    renderDefinitions();
    renderProfiles();
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function formBody() {
  const primaryEffectField = $('#gm-nd-status-profile-primary')?.value || '';
  const primaryEffectKey = String($('#gm-nd-status-profile-key')?.value || '').trim();
  const body = {
    name: String($('#gm-nd-status-profile-name')?.value || '').trim(),
    statusDefinitionId: $('#gm-nd-status-profile-definition')?.value || '',
    primaryEffectField,
    changeReason: String($('#gm-nd-status-profile-reason')?.value || '').trim(),
    metadata: { surface: 'gm_non_damage_status_profiles' }
  };
  if (primaryEffectField === 'EFFECT_PROFILE_NUMERIC') body.primaryEffectKey = primaryEffectKey;
  return body;
}

async function createProfile() {
  const body = formBody();
  if (!body.name || !body.statusDefinitionId || !body.changeReason) return toast('Name、Status Definition同Change Reason必填。', 'error');
  if (body.primaryEffectField === 'EFFECT_PROFILE_NUMERIC' && !body.primaryEffectKey) return toast('Primary Effect Key必填。', 'error');
  setStatus('Approving profile…');
  try {
    await api('/api/gm/non-damage-status-profiles', { method: 'POST', body: JSON.stringify(body) });
    await loadAll();
    toast('Non-damage Status Profile approved.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    toast(error.message, 'error');
  }
}

async function patchProfile(button, mode) {
  const profile = profiles.find(item => item.id === (button.dataset.profileReapprove || button.dataset.profileToggle));
  if (!profile) return;
  const reason = String($('#gm-nd-status-profile-reason')?.value || '').trim();
  if (!reason) return toast('Change Reason必填。', 'error');
  const body = {
    expectedVersion: Number(button.dataset.profileVersion),
    name: profile.name,
    statusDefinitionId: profile.statusDefinitionId,
    primaryEffectField: profile.primaryEffectField,
    primaryEffectKey: profile.primaryEffectKey,
    status: mode === 'toggle' ? button.dataset.profileNext : profile.status,
    metadata: profile.metadata || {},
    changeReason: reason
  };
  button.disabled = true;
  try {
    await api(`/api/gm/non-damage-status-profiles/${encodeURIComponent(profile.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
    await loadAll();
    toast(mode === 'toggle' ? 'Profile status updated.' : 'Profile re-approved against current Status Definition.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadAll().catch(() => {});
  } finally {
    button.disabled = false;
  }
}

function bind() {
  if (!ensurePanel()) return;
  $('#gm-nd-status-profile-primary')?.addEventListener('change', syncKeyInput);
  $('#gm-nd-status-profile-create')?.addEventListener('click', createProfile);
  $('#gm-nd-status-profile-reload')?.addEventListener('click', loadAll);
  $('#gm-nd-status-profile-list')?.addEventListener('click', event => {
    const reapprove = event.target.closest?.('[data-profile-reapprove]');
    if (reapprove) return patchProfile(reapprove, 'reapprove');
    const toggle = event.target.closest?.('[data-profile-toggle]');
    if (toggle) return patchProfile(toggle, 'toggle');
  });
  syncKeyInput();
  loadAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
