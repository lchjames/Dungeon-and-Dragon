import { $, $$, escapeHtml, toast, emptyState } from './common.js';

let storyState = null;
let storyLoaded = false;

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
    location.replace(`/player/login/?next=${encodeURIComponent('/gm/#story')}`);
    throw new Error('Session expired.');
  }
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function storyMarkup() {
  return `
    <div class="section-heading">
      <div><p class="eyebrow">STORY CONTEXT</p><h2>Scenario / Scene / Encounter</h2><p class="muted">Single-campaign MVP narrative structure. Combat remains the authoritative Round / Turn runtime.</p></div>
      <button id="story-refresh" class="button button-small button-ghost" type="button">Refresh</button>
    </div>
    <div id="story-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <section class="panel">
      <div class="panel-heading"><div><h3>Create Scenario</h3><span id="story-campaign-name" class="muted">D&D Campaign</span></div></div>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input id="story-new-scenario-name" class="input" maxlength="120" placeholder="e.g. The Night Zoo"></label>
        <label class="field"><span>Summary</span><input id="story-new-scenario-summary" class="input" maxlength="5000" placeholder="Short adventure summary"></label>
      </div>
      <div class="form-actions"><button id="story-create-scenario" class="button" type="button">Create Scenario</button></div>
    </section>
    <div id="story-list" class="stack-list"></div>
  `;
}

function ensureStoryUi() {
  if (!$('#story-side-link')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'story-side-link';
    button.className = 'side-link';
    button.dataset.view = 'story';
    button.textContent = 'Story';
    $('#combat-side-link')?.before(button);
    button.addEventListener('click', showStoryView);
  }

  if (!$('#view-story')) {
    const section = document.createElement('section');
    section.id = 'view-story';
    section.className = 'admin-view hidden';
    section.innerHTML = storyMarkup();
    $('#gm-content')?.append(section);
    $('#story-refresh')?.addEventListener('click', () => loadStory());
    $('#story-create-scenario')?.addEventListener('click', createScenario);
    $('#story-list')?.addEventListener('click', handleStoryClick);
  }
}

function setStatus(message = '', kind = '') {
  const box = $('#story-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function selected(value, expected) {
  return value === expected ? 'selected' : '';
}

function checkedParticipant(encounter, characterId) {
  return (encounter.participants || []).some(participant => participant.entityType === 'character' && participant.entityId === characterId);
}

function scenarioHtml(scenario) {
  return `<article class="panel" data-scenario-row="${escapeHtml(scenario.id)}">
    <div class="panel-heading">
      <div><div class="row-inline"><h3>${escapeHtml(scenario.name)}</h3><span class="status-pill">${escapeHtml(scenario.status)}</span></div><span class="muted">${escapeHtml(scenario.summary || 'No summary')}</span></div>
    </div>
    <details>
      <summary>Edit Scenario</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-scenario-name value="${escapeHtml(scenario.name)}" maxlength="120"></label>
        <label class="field"><span>Status</span><select class="input" data-scenario-status><option value="active" ${selected(scenario.status, 'active')}>active</option><option value="completed" ${selected(scenario.status, 'completed')}>completed</option><option value="archived" ${selected(scenario.status, 'archived')}>archived</option></select></label>
        <label class="field"><span>Summary</span><textarea class="textarea" data-scenario-summary rows="2">${escapeHtml(scenario.summary || '')}</textarea></label>
        <label class="field"><span>GM Notes</span><textarea class="textarea" data-scenario-notes rows="2">${escapeHtml(scenario.gmNotes || '')}</textarea></label>
      </div>
      <div class="form-actions"><button class="button button-small" type="button" data-story-action="save-scenario" data-scenario-id="${escapeHtml(scenario.id)}">Save Scenario</button></div>
    </details>
    <div class="stack-list">${(scenario.scenes || []).map(scene => sceneHtml(scene)).join('')}</div>
    <div class="row-inline">
      <input class="input" data-new-scene-name="${escapeHtml(scenario.id)}" maxlength="120" placeholder="New Scene name" ${scenario.status === 'archived' ? 'disabled' : ''}>
      <button class="button button-small button-ghost" type="button" data-story-action="add-scene" data-scenario-id="${escapeHtml(scenario.id)}" ${scenario.status === 'archived' ? 'disabled' : ''}>+ Scene</button>
    </div>
  </article>`;
}

function sceneHtml(scene) {
  const mapSummary = [scene.map?.name, scene.map?.assetRef].filter(Boolean).join(' · ');
  return `<article class="stack-item" style="display:block" data-scene-row="${escapeHtml(scene.id)}">
    <div class="panel-heading">
      <div><div class="row-inline"><h4>${escapeHtml(scene.name)}</h4><span class="tag">Scene</span><span class="status-pill">${escapeHtml(scene.status)}</span></div><p>${escapeHtml(scene.description || 'No description')}${mapSummary ? ` · Map: ${escapeHtml(mapSummary)}` : ''}</p></div>
    </div>
    <details>
      <summary>Edit Scene / Map reference</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-scene-name value="${escapeHtml(scene.name)}" maxlength="120"></label>
        <label class="field"><span>Status</span><select class="input" data-scene-status><option value="locked" ${selected(scene.status, 'locked')}>locked</option><option value="active" ${selected(scene.status, 'active')}>active</option><option value="completed" ${selected(scene.status, 'completed')}>completed</option></select></label>
        <label class="field"><span>Description</span><textarea class="textarea" data-scene-description rows="2">${escapeHtml(scene.description || '')}</textarea></label>
        <label class="field"><span>GM Notes</span><textarea class="textarea" data-scene-notes rows="2">${escapeHtml(scene.gmNotes || '')}</textarea></label>
        <label class="field"><span>Map Name</span><input class="input" data-scene-map-name value="${escapeHtml(scene.map?.name || '')}" maxlength="200"></label>
        <label class="field"><span>Map Asset Reference</span><input class="input" data-scene-map-ref value="${escapeHtml(scene.map?.assetRef || '')}" maxlength="2000" placeholder="Asset URL / reference"></label>
        <label class="field"><span>Map GM Notes</span><textarea class="textarea" data-scene-map-notes rows="2">${escapeHtml(scene.map?.gmNotes || '')}</textarea></label>
      </div>
      <div class="form-actions"><button class="button button-small" type="button" data-story-action="save-scene" data-scene-id="${escapeHtml(scene.id)}">Save Scene</button></div>
    </details>
    <div class="stack-list">${(scene.encounters || []).map(encounter => encounterHtml(encounter)).join('')}</div>
    <div class="row-inline">
      <input class="input" data-new-encounter-name="${escapeHtml(scene.id)}" maxlength="120" placeholder="New Encounter name" ${scene.status === 'completed' ? 'disabled' : ''}>
      <button class="button button-small button-ghost" type="button" data-story-action="add-encounter" data-scene-id="${escapeHtml(scene.id)}" ${scene.status === 'completed' ? 'disabled' : ''}>+ Encounter</button>
    </div>
  </article>`;
}

function encounterHtml(encounter) {
  const closed = encounter.status === 'resolved' || encounter.status === 'skipped';
  const combat = encounter.combat;
  const candidates = storyState?.characterCandidates || [];
  const participantChecks = candidates.length
    ? candidates.map(character => `<label class="row-inline"><input type="checkbox" data-encounter-participant="${escapeHtml(encounter.id)}" value="${escapeHtml(character.id)}" ${checkedParticipant(encounter, character.id) ? 'checked' : ''} ${combat || closed ? 'disabled' : ''}><span>${escapeHtml(character.name)} · ${escapeHtml(character.ownerDisplayName)}</span></label>`).join('')
    : '<p class="muted">No active Characters available.</p>';

  return `<article class="stack-item" style="display:block" data-encounter-row="${escapeHtml(encounter.id)}">
    <div class="panel-heading">
      <div><div class="row-inline"><h4>${escapeHtml(encounter.name)}</h4><span class="tag">Encounter</span><span class="status-pill">${escapeHtml(encounter.status)}</span>${combat ? `<span class="tag">Combat ${escapeHtml(combat.status)}</span>` : ''}</div><p>${escapeHtml(encounter.triggerNotes || 'No trigger notes')}</p></div>
      <button class="button button-small" type="button" data-story-action="start-combat" data-encounter-id="${escapeHtml(encounter.id)}" ${(combat || closed || !(encounter.participants || []).some(p => p.entityType === 'character')) ? 'disabled' : ''}>Start Combat</button>
    </div>
    <details>
      <summary>Edit Encounter</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-encounter-name value="${escapeHtml(encounter.name)}" maxlength="120"></label>
        <label class="field"><span>Status</span><select class="input" data-encounter-status><option value="planned" ${selected(encounter.status, 'planned')}>planned</option><option value="active" ${selected(encounter.status, 'active')}>active</option><option value="resolved" ${selected(encounter.status, 'resolved')}>resolved</option><option value="skipped" ${selected(encounter.status, 'skipped')}>skipped</option></select></label>
        <label class="field"><span>Trigger / Start Notes</span><textarea class="textarea" data-encounter-trigger rows="2">${escapeHtml(encounter.triggerNotes || '')}</textarea></label>
        <label class="field"><span>GM Notes</span><textarea class="textarea" data-encounter-notes rows="2">${escapeHtml(encounter.gmNotes || '')}</textarea></label>
        <label class="field"><span>Resolution Notes</span><textarea class="textarea" data-encounter-resolution rows="2">${escapeHtml(encounter.resolutionNotes || '')}</textarea></label>
      </div>
      <div class="form-actions"><button class="button button-small" type="button" data-story-action="save-encounter" data-encounter-id="${escapeHtml(encounter.id)}">Save Encounter</button></div>
    </details>
    <details>
      <summary>Character Participants (${(encounter.participants || []).filter(p => p.entityType === 'character').length})</summary>
      <div class="stack-list">${participantChecks}</div>
      <div class="form-actions"><button class="button button-small button-ghost" type="button" data-story-action="save-participants" data-encounter-id="${escapeHtml(encounter.id)}" ${combat || closed ? 'disabled' : ''}>Save Participants</button></div>
    </details>
    ${combat ? `<p class="muted">Linked Combat: ${escapeHtml(combat.combatId)} · ${escapeHtml(combat.status)}${combat.roundNumber ? ` · Round ${escapeHtml(combat.roundNumber)}` : ''}</p>` : ''}
  </article>`;
}

function renderStory() {
  $('#story-campaign-name').textContent = storyState?.campaign?.name || 'D&D Campaign';
  const list = $('#story-list');
  const scenarios = storyState?.scenarios || [];
  if (!scenarios.length) {
    list.innerHTML = emptyState('No Scenarios', 'Create the first Scenario for this Campaign.');
    return;
  }
  list.innerHTML = scenarios.map(scenario => scenarioHtml(scenario)).join('');
}

async function loadStory({ quiet = false } = {}) {
  if (!quiet) setStatus('Loading Scenario structure…');
  try {
    storyState = await api('/api/gm/story');
    storyLoaded = true;
    renderStory();
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function showStoryView() {
  ensureStoryUi();
  $$('.side-link').forEach(button => button.classList.toggle('active', button.id === 'story-side-link'));
  $$('.admin-view').forEach(section => section.classList.add('hidden'));
  $('#view-story')?.classList.remove('hidden');
  if ($('#view-title')) $('#view-title').textContent = 'Story';
  history.replaceState(null, '', '#story');
  loadStory({ quiet: storyLoaded });
}

async function createScenario() {
  const name = $('#story-new-scenario-name')?.value || '';
  if (!name.trim()) return toast('Scenario Name is required.', 'error');
  try {
    await api('/api/gm/scenarios', {
      method: 'POST',
      body: JSON.stringify({ name, summary: $('#story-new-scenario-summary')?.value || '' })
    });
    $('#story-new-scenario-name').value = '';
    $('#story-new-scenario-summary').value = '';
    await loadStory({ quiet: true });
    toast('Scenario created.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function row(selector, id) {
  return document.querySelector(`${selector}[data-${selector.includes('scenario') ? 'scenario' : selector.includes('scene') ? 'scene' : 'encounter'}-row="${CSS.escape(id)}"]`);
}

async function handleStoryClick(event) {
  const button = event.target.closest?.('[data-story-action]');
  if (!button) return;
  const action = button.dataset.storyAction;
  button.disabled = true;
  try {
    if (action === 'save-scenario') {
      const id = button.dataset.scenarioId;
      const container = document.querySelector(`[data-scenario-row="${CSS.escape(id)}"]`);
      await api(`/api/gm/scenarios/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: $('[data-scenario-name]', container)?.value,
          status: $('[data-scenario-status]', container)?.value,
          summary: $('[data-scenario-summary]', container)?.value,
          gmNotes: $('[data-scenario-notes]', container)?.value
        })
      });
      toast('Scenario updated.', 'success');
    } else if (action === 'add-scene') {
      const scenarioId = button.dataset.scenarioId;
      const input = document.querySelector(`[data-new-scene-name="${CSS.escape(scenarioId)}"]`);
      if (!input?.value.trim()) throw new Error('Scene Name is required.');
      await api(`/api/gm/scenarios/${encodeURIComponent(scenarioId)}/scenes`, { method: 'POST', body: JSON.stringify({ name: input.value }) });
      toast('Scene created.', 'success');
    } else if (action === 'save-scene') {
      const id = button.dataset.sceneId;
      const container = document.querySelector(`[data-scene-row="${CSS.escape(id)}"]`);
      await api(`/api/gm/scenes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: $('[data-scene-name]', container)?.value,
          status: $('[data-scene-status]', container)?.value,
          description: $('[data-scene-description]', container)?.value,
          gmNotes: $('[data-scene-notes]', container)?.value,
          mapName: $('[data-scene-map-name]', container)?.value,
          mapAssetRef: $('[data-scene-map-ref]', container)?.value,
          mapGmNotes: $('[data-scene-map-notes]', container)?.value
        })
      });
      toast('Scene updated.', 'success');
    } else if (action === 'add-encounter') {
      const sceneId = button.dataset.sceneId;
      const input = document.querySelector(`[data-new-encounter-name="${CSS.escape(sceneId)}"]`);
      if (!input?.value.trim()) throw new Error('Encounter Name is required.');
      await api(`/api/gm/scenes/${encodeURIComponent(sceneId)}/encounters`, { method: 'POST', body: JSON.stringify({ name: input.value }) });
      toast('Encounter created.', 'success');
    } else if (action === 'save-encounter') {
      const id = button.dataset.encounterId;
      const container = document.querySelector(`[data-encounter-row="${CSS.escape(id)}"]`);
      await api(`/api/gm/encounters/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: $('[data-encounter-name]', container)?.value,
          status: $('[data-encounter-status]', container)?.value,
          triggerNotes: $('[data-encounter-trigger]', container)?.value,
          gmNotes: $('[data-encounter-notes]', container)?.value,
          resolutionNotes: $('[data-encounter-resolution]', container)?.value
        })
      });
      toast('Encounter updated.', 'success');
    } else if (action === 'save-participants') {
      const encounterId = button.dataset.encounterId;
      const characterIds = $$(`[data-encounter-participant="${CSS.escape(encounterId)}"]:checked`).map(input => input.value);
      await api(`/api/gm/encounters/${encodeURIComponent(encounterId)}/participants`, {
        method: 'PUT',
        body: JSON.stringify({ characterIds })
      });
      toast('Encounter participants updated.', 'success');
    } else if (action === 'start-combat') {
      const encounterId = button.dataset.encounterId;
      await api(`/api/gm/encounters/${encodeURIComponent(encounterId)}/start-combat`, { method: 'POST', body: JSON.stringify({}) });
      toast('Encounter Combat started.', 'success');
      await loadStory({ quiet: true });
      $('#combat-side-link')?.click();
      return;
    }
    await loadStory({ quiet: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

ensureStoryUi();

const content = $('#gm-content');
if (location.hash === '#story') {
  if (content && !content.classList.contains('hidden')) showStoryView();
  else if (content) {
    const observer = new MutationObserver(() => {
      if (!content.classList.contains('hidden')) {
        observer.disconnect();
        showStoryView();
      }
    });
    observer.observe(content, { attributes: true, attributeFilter: ['class'] });
  }
}
