import { $, $$, escapeHtml, formatDate, toast, bindThemeToggle, emptyState } from './common.js';

let bootstrap = null;
let selectedCharacter = null;
let currentView = 'dashboard';

const viewTitles = {
  dashboard: 'Dashboard',
  players: 'Players',
  characters: 'Characters',
  combat: 'Combat'
};

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
    location.replace(`/player/login/?next=${encodeURIComponent('/gm/')}`);
    throw new Error('Session expired.');
  }
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function navigate(view) {
  if (!viewTitles[view]) return;
  currentView = view;
  $$('.side-link').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $$('.admin-view').forEach(section => section.classList.add('hidden'));
  $(`#view-${view}`)?.classList.remove('hidden');
  $('#view-title').textContent = viewTitles[view];
  history.replaceState(null, '', `#${view}`);
  if (view === 'dashboard') renderDashboard();
  if (view === 'players') renderPlayers();
  if (view === 'characters') renderCharacters();
}

function renderDashboard() {
  const metrics = bootstrap?.metrics || {};
  $('#metric-players').textContent = metrics.playerUsers ?? 0;
  $('#metric-characters').textContent = metrics.characters ?? 0;
  $('#metric-active').textContent = metrics.activeCharacters ?? 0;
  $('#metric-drafts').textContent = metrics.draftCharacters ?? 0;
  const campaignName = $('#campaign-name');
  if (campaignName) campaignName.textContent = bootstrap?.campaign?.name || 'D&D Campaign';
  $('#dashboard-gm-name').textContent = bootstrap?.user?.displayName || 'GM';
  $('#dashboard-gm-role').textContent = bootstrap?.user?.role || 'gm';

  const recent = [...(bootstrap?.characters || [])]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 6);
  $('#recent-characters').innerHTML = recent.length
    ? recent.map(character => `<article class="stack-item compact-item">
        <div>
          <div class="row-inline"><h4>${escapeHtml(character.name)}</h4><span class="status-pill">${escapeHtml(character.status)}</span></div>
          <p>${escapeHtml(character.ownerDisplayName)} · Lv ${escapeHtml(character.level)} · EXP ${escapeHtml(character.exp)}</p>
        </div>
        <button class="button button-small button-ghost" type="button" data-open-character="${escapeHtml(character.id)}">Open</button>
      </article>`).join('')
    : emptyState('No characters', 'Player Characters will appear here after they are stored in D1.');
  bindCharacterOpenButtons($('#recent-characters'));
}

function renderPlayers() {
  const target = $('#player-admin-list');
  const users = bootstrap?.users || [];
  if (!users.length) {
    target.innerHTML = emptyState('No users', 'No D1 Users found.');
    return;
  }

  target.innerHTML = users.map(user => {
    const count = (bootstrap?.characters || []).filter(character => character.ownerUserId === user.id).length;
    return `<article class="admin-row">
      <div class="admin-row-main">
        <div class="row-inline">
          <h3>${escapeHtml(user.displayName)}</h3>
          <span class="status-pill">${escapeHtml(user.status)}</span>
          <span class="tag">${escapeHtml(user.role)}</span>
        </div>
        <p>${count} Character${count === 1 ? '' : 's'} · Created ${escapeHtml(formatDate(user.createdAt))}</p>
      </div>
    </article>`;
  }).join('');
}

function ownerOptions() {
  const current = $('#character-owner-filter')?.value || '';
  const owners = (bootstrap?.users || []).filter(user =>
    (bootstrap?.characters || []).some(character => character.ownerUserId === user.id)
  );
  const select = $('#character-owner-filter');
  select.innerHTML = '<option value="">All owners</option>' + owners.map(user =>
    `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName)}</option>`
  ).join('');
  if (owners.some(user => user.id === current)) select.value = current;
}

function renderCharacters() {
  ownerOptions();
  const query = ($('#character-search')?.value || '').trim().toLocaleLowerCase();
  const owner = $('#character-owner-filter')?.value || '';
  const status = $('#character-status-filter')?.value || '';
  const rows = (bootstrap?.characters || []).filter(character => {
    const matchQuery = !query || [character.name, character.role, character.ownerDisplayName]
      .some(value => String(value || '').toLocaleLowerCase().includes(query));
    return matchQuery && (!owner || character.ownerUserId === owner) && (!status || character.status === status);
  });

  const target = $('#character-admin-list');
  if (!rows.length) {
    target.innerHTML = emptyState('No matching characters', 'Change the search or filters.');
    return;
  }

  target.innerHTML = rows.map(character => `<article class="admin-row ${selectedCharacter?.id === character.id ? 'selected' : ''}">
    <div class="admin-row-main">
      <div class="row-inline">
        <h3>${escapeHtml(character.name)}</h3>
        <span class="status-pill">${escapeHtml(character.status)}</span>
        <span class="tag">Lv ${escapeHtml(character.level)}</span>
      </div>
      <p>${escapeHtml(character.ownerDisplayName)} · EXP ${escapeHtml(character.exp)} · ${escapeHtml(character.role || 'Unassigned role')}</p>
    </div>
    <button class="button button-small" type="button" data-open-character="${escapeHtml(character.id)}">Manage</button>
  </article>`).join('');
  bindCharacterOpenButtons(target);
}

function bindCharacterOpenButtons(root) {
  $$('[data-open-character]', root).forEach(button => button.addEventListener('click', () => openCharacter(button.dataset.openCharacter)));
}

function renderCharacterDetail(character) {
  selectedCharacter = character;
  const panel = $('#gm-character-detail');
  if (!character) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  $('#gm-character-name').textContent = character.name;
  $('#gm-character-owner').textContent = character.ownerDisplayName || 'Unassigned';
  $('#gm-character-role').textContent = character.role || 'Unassigned';
  $('#gm-character-status').textContent = character.status;
  $('#gm-character-level').textContent = `Level ${character.level}`;
  $('#gm-character-exp').textContent = `EXP ${character.exp}`;
  $('#gm-character-updated').textContent = formatDate(character.updatedAt);
  $('#gm-character-summary').textContent = character.summary || 'No summary.';
  $('#gm-exp-value').value = '';

  const progression = character.progression;
  $('#gm-character-progression').textContent = progression
    ? `Creation ${progression.creationSkillPointsSpent}/${progression.creationSkillPointsTotal} · ${progression.creationComplete ? 'Complete' : 'Draft'}`
    : 'Legacy / not initialized';

  const flags = character.migrationFlags || [];
  const flagBox = $('#gm-character-flags');
  flagBox.hidden = !flags.length;
  flagBox.textContent = flags.length ? `Migration flags: ${flags.join(', ')}` : '';

  $('#gm-attribute-grid').innerHTML = character.attributes?.length
    ? character.attributes.map(attribute => `<div class="stat-card"><span>${escapeHtml(attribute.label || attribute.key)}</span><strong>${escapeHtml(attribute.value)}</strong></div>`).join('')
    : '<p class="muted">No Attributes stored.</p>';

  $('#gm-resource-list').innerHTML = character.resources?.length
    ? character.resources.map(resource => {
        const key = String(resource.key || '').toUpperCase();
        const editable = key === 'HP' || key === 'MP';
        return `<article class="stack-item">
          <div>
            <div class="row-inline"><h4>${escapeHtml(resource.label)}</h4><span class="tag">${escapeHtml(key)}</span></div>
            <p>Current ${escapeHtml(resource.current)} / Max ${escapeHtml(resource.max)}</p>
          </div>
          ${editable ? `<div class="quantity-editor">
            <input class="input input-compact" type="number" min="0" max="${escapeHtml(resource.max)}" step="1" value="${escapeHtml(resource.current)}" data-gm-resource-current="${escapeHtml(key)}">
            <button class="button button-small button-ghost" type="button" data-gm-resource-save="${escapeHtml(key)}">Correct</button>
          </div>` : ''}
        </article>`;
      }).join('')
    : '<p class="muted">No resources stored.</p>';

  $$('[data-gm-resource-save]', $('#gm-resource-list')).forEach(button => button.addEventListener('click', () => correctResource(button.dataset.gmResourceSave)));

  $('#gm-skill-list').innerHTML = character.skills?.length
    ? character.skills.map(skill => `<article class="stack-item compact-item">
        <div>
          <div class="row-inline"><h4>${escapeHtml(skill.label)}</h4><span class="tag">${escapeHtml(skill.category)}</span></div>
          <p>Natural ${escapeHtml(skill.value)}${skill.creationValue !== undefined ? ` · Creation ${escapeHtml(skill.creationValue)}` : ''}</p>
        </div>
      </article>`).join('')
    : '<p class="muted">No Canonical Skills initialized.</p>';

  if (currentView === 'characters') renderCharacters();
}

async function openCharacter(id) {
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(id)}`);
    renderCharacterDetail(payload.character);
    $('#gm-character-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function updateExp(mode) {
  if (!selectedCharacter) return;
  const input = $('#gm-exp-value');
  const value = Number(input.value);
  if (!Number.isInteger(value)) return toast('Enter an integer EXP value.', 'error');
  if (mode === 'set' && value < 1) return toast('EXP cannot be below 1.', 'error');

  const buttons = $$('[data-exp-mode]');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacter.id)}/exp`, {
      method: 'PATCH',
      body: JSON.stringify({ mode, value })
    });
    renderCharacterDetail(payload.character);
    await refreshBootstrap(false);
    toast(payload.resourcesRecalculated ? 'EXP updated; Level and HP/MP recalculated.' : 'EXP updated; resource recalculation skipped because required Attributes are missing.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

async function correctResource(key) {
  if (!selectedCharacter) return;
  const input = $(`[data-gm-resource-current="${CSS.escape(key)}"]`);
  const current = Number(input?.value);
  if (!Number.isInteger(current) || current < 0) return toast('Current HP / MP must be a non-negative integer.', 'error');

  try {
    await api(`/api/gm/characters/${encodeURIComponent(selectedCharacter.id)}/resources/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify({ current })
    });
    await openCharacter(selectedCharacter.id);
    toast(`${key} corrected.`, 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function refreshBootstrap(render = true) {
  bootstrap = await api('/api/gm/bootstrap');
  $('#gm-user-name').textContent = bootstrap.user.displayName;
  $('#gm-user-role').textContent = bootstrap.user.role;
  const campaignName = $('#campaign-name');
  if (campaignName) campaignName.textContent = bootstrap.campaign.name;
  if (render) navigate(currentView);
  else {
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'players') renderPlayers();
    if (currentView === 'characters') renderCharacters();
  }
}

async function boot() {
  try {
    await refreshBootstrap(false);
    $('#gm-loading').classList.add('hidden');
    $('#gm-content').classList.remove('hidden');
    const initial = location.hash.slice(1);
    navigate(viewTitles[initial] ? initial : 'dashboard');
  } catch (error) {
    $('#gm-loading').innerHTML = emptyState('Unable to load GM data', error.message);
  }
}

$$('.side-link').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
$$('[data-jump]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.jump)));
$('#character-search')?.addEventListener('input', renderCharacters);
$('#character-owner-filter')?.addEventListener('change', renderCharacters);
$('#character-status-filter')?.addEventListener('change', renderCharacters);
$$('[data-exp-mode]').forEach(button => button.addEventListener('click', () => updateExp(button.dataset.expMode)));
$('#close-gm-character')?.addEventListener('click', () => renderCharacterDetail(null));
$('#gm-logout')?.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  } finally {
    location.replace('/player/login/?next=%2Fgm%2F');
  }
});
bindThemeToggle($('#theme-toggle'));
boot();
