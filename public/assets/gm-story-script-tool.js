import { $, escapeHtml, toast, emptyState } from './common.js';

let selectedScriptEventId = '';
let scripts = [];
let attachedRuntimeSelect = null;

const SAMPLE = `# Safe declarative Story authoring\nNAME Vault alarm\nSTATUS active\nONCE yes\nTRIGGER MANUAL\nWHEN NOT_FIRED\nDO SAY Something changes in the room.\nDO SET_FLAG vault.alert true`;

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
    location.replace(`/gm/login/?next=${encodeURIComponent('/gm/#world-map')}`);
    throw new Error('Admin session expired.');
  }
  if (!response.ok) {
    const line = payload?.error?.line ? ` Line ${payload.error.line}.` : '';
    const failures = payload?.error?.failures?.length
      ? ` ${payload.error.failures.map(item => item.reason || item.type).join(', ')}`
      : '';
    const error = new Error(`${payload?.error?.message || 'Request failed.'}${line}${failures}`);
    error.code = payload?.error?.code || '';
    error.payload = payload;
    throw error;
  }
  return payload;
}

function panelMarkup() {
  return `<section id="gm-story-script-panel" class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">SAFE AUTHORING DSL</p>
        <h3>GM Script Tool · Alpha</h3>
        <p class="muted">Compile readable GM commands into the existing approved Story Event schema. No arbitrary JavaScript, SQL or direct Runtime writes.</p>
      </div>
      <button id="gm-story-script-new" class="button button-small button-ghost" type="button">New Script</button>
    </div>
    <div id="gm-story-script-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="split-grid">
      <section>
        <label class="field"><span>Script</span><textarea id="gm-story-script-source" class="textarea" rows="18" spellcheck="false"></textarea></label>
        <p class="muted"><code>NAME</code>, <code>STATUS</code>, <code>ONCE</code>, <code>TRIGGER</code>, <code>WHEN</code>, <code>DO</code>. Complex approved effects may use one-line <code>EFFECT {...}</code>. Lines beginning with <code>#</code> are comments.</p>
        <div class="form-actions wrap">
          <button id="gm-story-script-compile" class="button button-ghost" type="button">Compile</button>
          <button id="gm-story-script-publish" class="button" type="button">Publish</button>
          <button id="gm-story-script-apply" class="button" type="button">Publish + Apply Now</button>
        </div>
        <p class="muted">Apply Now requires <code>TRIGGER MANUAL</code>. Automatic triggers become active after Publish and are fired only by their Runtime trigger source.</p>
      </section>
      <section>
        <div class="panel-heading"><div><h4>Compiled Canonical Event</h4><span id="gm-story-script-edit-label" class="muted">New script</span></div></div>
        <pre id="gm-story-script-preview" class="tool-result" style="white-space:pre-wrap;overflow:auto;max-height:32rem">Compile to preview the canonical Story Event.</pre>
      </section>
    </div>
    <section class="panel">
      <div class="panel-heading"><div><h4>Saved Script Sources</h4><span class="muted">Only Events published through this Script Tool appear here.</span></div><button id="gm-story-script-refresh" class="button button-small button-ghost" type="button">Refresh</button></div>
      <div id="gm-story-script-list" class="stack-list"></div>
    </section>
    <details>
      <summary>Alpha command reference</summary>
      <div class="prose muted">
        <p><code>TRIGGER MANUAL</code>, <code>SCENE_START</code>, <code>ENTER_ZONE &lt;sourceZoneId&gt;</code>, <code>INTERACT_OBJECT &lt;sourceObjectId&gt;</code>, <code>FLAG_CHANGED &lt;key&gt;</code>, or Encounter/Combat lifecycle commands.</p>
        <p><code>WHEN NOT_FIRED</code>, <code>FLAG_EQ key true</code>, <code>FLAG_NE key "value"</code>, <code>DOOR id open</code>, <code>OBJECT id state</code>, <code>ENCOUNTER id active</code>.</p>
        <p><code>DO SAY text</code>, <code>SET_FLAG key value</code>, <code>SET_OBJECT id state</code>, <code>REVEAL_ZONE id</code>, <code>OPEN_DOOR id</code>, <code>CLOSE_DOOR id</code>, <code>ACTIVATE_ENCOUNTER id</code>, <code>START_COMBAT id</code>.</p>
      </div>
    </details>
  </section>`;
}

function setStatus(message = '', kind = '') {
  const box = $('#gm-story-script-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function currentRuntimeId() {
  return $('#gm-story-event-runtime')?.value || '';
}

async function currentRuntimeDetail() {
  const id = currentRuntimeId();
  if (!id) throw new Error('Select an Active Runtime in Story Events first.');
  return api(`/api/gm/world/runtime/maps/${encodeURIComponent(id)}`);
}

function resetEditor() {
  selectedScriptEventId = '';
  $('#gm-story-script-source').value = SAMPLE;
  $('#gm-story-script-preview').textContent = 'Compile to preview the canonical Story Event.';
  $('#gm-story-script-edit-label').textContent = 'New script';
  renderScripts();
}

function renderScripts() {
  const target = $('#gm-story-script-list');
  if (!target) return;
  if (!currentRuntimeId()) {
    target.innerHTML = '<p class="muted">Select an Active Runtime first.</p>';
    return;
  }
  if (!scripts.length) {
    target.innerHTML = emptyState('No saved Script sources', 'Publish a Script to keep its editable source alongside the canonical Story Event.');
    return;
  }
  target.innerHTML = scripts.map(item => `<button type="button" class="runtime-position-row ${item.event?.id === selectedScriptEventId ? 'selected' : ''}" data-script-event-id="${escapeHtml(item.event?.id || '')}">
    <span><strong>${escapeHtml(item.event?.name || item.event?.id || 'Story Script')}</strong><small>${escapeHtml(item.event?.triggerType || '')} · ${escapeHtml(item.event?.status || '')}</small></span>
    <span>${item.updatedAt ? new Date(Number(item.updatedAt)).toLocaleString() : ''}</span>
  </button>`).join('');
}

async function loadScripts({ quiet = false } = {}) {
  const runtimeId = currentRuntimeId();
  if (!runtimeId) {
    scripts = [];
    selectedScriptEventId = '';
    renderScripts();
    return;
  }
  if (!quiet) setStatus('Loading saved Scripts…');
  try {
    const detail = await currentRuntimeDetail();
    const sceneId = detail?.mapInstance?.sceneId;
    if (!sceneId) throw new Error('Selected Runtime has no Scene.');
    const payload = await api(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-scripts`);
    scripts = payload.scripts || [];
    if (selectedScriptEventId && !scripts.some(item => item.event?.id === selectedScriptEventId)) selectedScriptEventId = '';
    renderScripts();
    if (!quiet) setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function compileScript({ quiet = false } = {}) {
  const source = $('#gm-story-script-source')?.value || '';
  if (!quiet) setStatus('Compiling…');
  const payload = await api('/api/gm/story-scripts/compile', {
    method: 'POST', body: JSON.stringify({ script: source })
  });
  $('#gm-story-script-preview').textContent = JSON.stringify(payload.compiled, null, 2);
  if (!quiet) setStatus('Compile successful.', 'success');
  return payload;
}

async function publishScript(applyNow = false) {
  const source = $('#gm-story-script-source')?.value || '';
  const runtimeId = currentRuntimeId();
  if (!runtimeId) return toast('Select an Active Runtime first.', 'error');
  const button = applyNow ? $('#gm-story-script-apply') : $('#gm-story-script-publish');
  button.disabled = true;
  setStatus(applyNow ? 'Publishing and applying…' : 'Publishing…');
  try {
    let payload;
    if (applyNow) {
      payload = await api(`/api/gm/world/runtime/maps/${encodeURIComponent(runtimeId)}/story-scripts/apply`, {
        method: 'POST', body: JSON.stringify({ script: source, ...(selectedScriptEventId ? { eventId: selectedScriptEventId } : {}) })
      });
    } else {
      const detail = await currentRuntimeDetail();
      const sceneId = detail?.mapInstance?.sceneId;
      if (!sceneId) throw new Error('Selected Runtime has no Scene.');
      payload = await api(`/api/gm/scenes/${encodeURIComponent(sceneId)}/story-scripts`, {
        method: 'POST', body: JSON.stringify({ script: source, ...(selectedScriptEventId ? { eventId: selectedScriptEventId } : {}) })
      });
    }
    selectedScriptEventId = payload.event?.id || selectedScriptEventId;
    $('#gm-story-script-preview').textContent = JSON.stringify(payload.compiled, null, 2);
    $('#gm-story-script-edit-label').textContent = payload.event?.name ? `Editing · ${payload.event.name}` : 'Saved script';
    await loadScripts({ quiet: true });
    $('#gm-story-event-refresh')?.click();
    setStatus(applyNow ? 'Published and applied through Runtime Story authority.' : 'Published as canonical Story Event.', 'success');
    toast(applyNow ? 'Story Script published and applied.' : 'Story Script published.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function handleScriptListClick(event) {
  const button = event.target.closest?.('[data-script-event-id]');
  if (!button) return;
  const found = scripts.find(item => item.event?.id === button.dataset.scriptEventId);
  if (!found) return;
  selectedScriptEventId = found.event.id;
  $('#gm-story-script-source').value = found.source || '';
  $('#gm-story-script-preview').textContent = JSON.stringify({
    name: found.event.name,
    status: found.event.status,
    oncePerSceneRun: found.event.oncePerSceneRun,
    triggerType: found.event.triggerType,
    trigger: found.event.trigger,
    conditions: found.event.conditions,
    effects: found.event.effects
  }, null, 2);
  $('#gm-story-script-edit-label').textContent = `Editing · ${found.event.name || found.event.id}`;
  renderScripts();
}

function attachRuntimeSelect() {
  const select = $('#gm-story-event-runtime');
  if (!select || select === attachedRuntimeSelect) return;
  attachedRuntimeSelect = select;
  select.addEventListener('change', () => {
    selectedScriptEventId = '';
    loadScripts({ quiet: true });
  });
  loadScripts({ quiet: true });
}

function ensurePanel() {
  const view = $('#view-world-map');
  if (!view) return;
  if (!$('#gm-story-script-panel')) {
    const storyPanel = $('#gm-story-events-panel');
    if (storyPanel) storyPanel.insertAdjacentHTML('afterend', panelMarkup());
    else view.insertAdjacentHTML('beforeend', panelMarkup());
    $('#gm-story-script-source').value = SAMPLE;
    $('#gm-story-script-new')?.addEventListener('click', resetEditor);
    $('#gm-story-script-compile')?.addEventListener('click', async () => {
      try { await compileScript(); } catch (error) { setStatus(error.message, 'error'); toast(error.message, 'error'); }
    });
    $('#gm-story-script-publish')?.addEventListener('click', () => publishScript(false));
    $('#gm-story-script-apply')?.addEventListener('click', () => publishScript(true));
    $('#gm-story-script-refresh')?.addEventListener('click', () => loadScripts());
    $('#gm-story-script-list')?.addEventListener('click', handleScriptListClick);
  }
  attachRuntimeSelect();
}

const observer = new MutationObserver(() => ensurePanel());
observer.observe(document.documentElement, { childList: true, subtree: true });
ensurePanel();
