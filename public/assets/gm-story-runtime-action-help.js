import { $, escapeHtml, emptyState } from './common.js';

let refreshTimer = null;
let currentRuntimeId = '';

async function api(url) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function panelMarkup() {
  return `<section id="gm-story-runtime-action-help" class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">STORY ACTION REFERENCES</p>
        <h4>Runtime Spawn & Combat</h4>
        <p class="muted">Use stable authoring IDs in approved <code>spawn_monster</code> / <code>start_combat</code> effects.</p>
      </div>
      <button id="gm-story-runtime-action-help-refresh" class="button button-small button-ghost" type="button">Refresh Refs</button>
    </div>
    <div id="gm-story-runtime-action-help-status" class="auth-status" hidden></div>
    <div class="split-grid">
      <div>
        <h4>Runtime Spawn Points</h4>
        <div id="gm-story-runtime-spawn-refs" class="stack-list"></div>
      </div>
      <div>
        <h4>Monster Templates</h4>
        <div id="gm-story-runtime-template-refs" class="stack-list"></div>
      </div>
    </div>
    <div class="panel" style="margin-top:12px">
      <h4>Approved effect shapes</h4>
      <pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code>{
  "type": "spawn_monster",
  "encounterId": "encounter_...",
  "templateId": "monster_template_...",
  "level": 1,
  "sourceSpawnPointId": "spawn_..."
}
{
  "type": "start_combat",
  "encounterId": "encounter_..."
}</code></pre>
      <p class="muted"><code>encounterId</code> comes from Runtime Encounter references. <code>sourceSpawnPointId</code> is the stable Map Template Spawn Point ID. Monster Level must be 1–100. Automatic Player-triggered Events execute server-side; no arbitrary JavaScript or SQL.</p>
    </div>
  </section>`;
}

function ensurePanel() {
  const storyPanel = $('#gm-story-events-panel');
  if (!storyPanel || $('#gm-story-runtime-action-help')) return false;
  storyPanel.insertAdjacentHTML('afterend', panelMarkup());
  $('#gm-story-runtime-action-help-refresh')?.addEventListener('click', () => refresh({ force: true }));
  return true;
}

function setStatus(message = '', kind = '') {
  const target = $('#gm-story-runtime-action-help-status');
  if (!target) return;
  target.textContent = message;
  target.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  target.hidden = !message;
}

function selectedRuntimeId() {
  return $('#gm-story-event-runtime')?.value || '';
}

function renderSpawnPoints(detail) {
  const target = $('#gm-story-runtime-spawn-refs');
  if (!target) return;
  const points = (detail?.spawnPoints || []).filter(item => item.sourceSpawnPointId);
  target.innerHTML = points.length
    ? points.map(item => `<div class="stack-item"><div><strong>${escapeHtml(item.sourceSpawnPointId)}</strong><p>${escapeHtml(item.name || 'Spawn Point')} · (${escapeHtml(item.x)}, ${escapeHtml(item.y)}) · ${escapeHtml(item.spawnType || 'any')} · ${item.enabled ? 'enabled' : 'disabled'}</p></div></div>`).join('')
    : emptyState('No Runtime Spawn Points', 'Add a stable Spawn Point to the Map Template first.');
}

function renderTemplates(monsters) {
  const target = $('#gm-story-runtime-template-refs');
  if (!target) return;
  const templates = (monsters?.templates || []).filter(item => item.isActive !== false);
  target.innerHTML = templates.length
    ? templates.map(item => `<div class="stack-item"><div><strong>${escapeHtml(item.id)}</strong><p>${escapeHtml(item.name || item.id)} · ${item.isActive === false ? 'inactive' : 'active'}</p></div></div>`).join('')
    : emptyState('No active Monster Templates', 'Create and activate a Monster Template in the Monsters workspace.');
}

async function refresh({ force = false } = {}) {
  if (!ensurePanel()) return;
  const runtimeId = selectedRuntimeId();
  if (!runtimeId) {
    currentRuntimeId = '';
    renderSpawnPoints(null);
    renderTemplates(null);
    setStatus('Select an active Runtime Map to load Story action references.');
    return;
  }
  if (!force && runtimeId === currentRuntimeId) return;
  currentRuntimeId = runtimeId;
  setStatus('Loading Story action references…');
  try {
    const [detail, monsters] = await Promise.all([
      api(`/api/gm/world/runtime/maps/${encodeURIComponent(runtimeId)}`),
      api('/api/gm/monsters')
    ]);
    renderSpawnPoints(detail);
    renderTemplates(monsters);
    setStatus('');
  } catch (error) {
    currentRuntimeId = '';
    setStatus(error.message, 'error');
  }
}

function bindEvents() {
  document.addEventListener('change', event => {
    if (event.target?.id === 'gm-story-event-runtime') {
      currentRuntimeId = '';
      queueMicrotask(() => refresh({ force: true }));
    }
  });
  document.addEventListener('click', event => {
    if (event.target?.closest?.('#gm-story-event-refresh, #gm-story-event-save, #gm-story-event-activate')) {
      currentRuntimeId = '';
      setTimeout(() => refresh({ force: true }), 300);
    }
  });
}

const observer = new MutationObserver(() => {
  if (ensurePanel()) refresh({ force: true });
});
observer.observe(document.documentElement, { childList: true, subtree: true });

bindEvents();
ensurePanel();
refreshTimer = setInterval(() => {
  if (document.visibilityState === 'visible') refresh();
}, 5000);
