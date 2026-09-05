import './gm-story.js';
import './gm-world-map.js';
import './gm-map-editor.js';
import './gm-map-objects.js';
import './gm-runtime-map.js';
import './gm-runtime-doors.js';
import './gm-story-events.js';
import './gm-monsters.js';
import './gm-monster-defence.js';
import './gm-bosses.js';
import { $, escapeHtml, toast } from './common.js';

let selectedCharacterId = '';
let characterLocked = false;

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

function setStatus(message = '', kind = '') {
  const box = $('#gm-attack-profile-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function renderProfiles(profiles = []) {
  const target = $('#gm-attack-profile-list');
  if (!target) return;
  if (!selectedCharacterId) {
    target.innerHTML = '<p class="muted">Open a Character to load Attack Profiles.</p>';
    return;
  }
  if (!profiles.length) {
    target.innerHTML = '<p class="muted">No Attack Profiles yet.</p>';
    return;
  }

  target.innerHTML = profiles.map(profile => `<article class="stack-item" data-profile-row="${escapeHtml(profile.id)}">
    <div style="flex:1; min-width:0">
      <div class="row-inline"><h4>${escapeHtml(profile.name)}</h4><span class="status-pill">${profile.isActive ? 'active' : 'inactive'}</span><span class="tag">Dodge defence</span></div>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-profile-name value="${escapeHtml(profile.name)}" maxlength="80"></label>
        <label class="field"><span>Accuracy</span><input class="input" data-profile-accuracy type="number" min="0" max="98" step="1" value="${escapeHtml(profile.storedAccuracy)}"></label>
        <label class="field"><span>Dice Count</span><input class="input" data-profile-count type="number" min="1" max="20" step="1" value="${escapeHtml(profile.damageDiceCount)}"></label>
        <label class="field"><span>Dice Sides</span><input class="input" data-profile-sides type="number" min="2" max="100" step="1" value="${escapeHtml(profile.damageDiceSides)}"></label>
        <label class="field"><span>Fixed</span><input class="input" data-profile-fixed type="number" step="1" value="${escapeHtml(profile.fixedDamageModifier)}"></label>
        <label class="field"><span><input data-profile-db type="checkbox" ${profile.appliesCharacterDamageBonus ? 'checked' : ''}> Apply Damage Bonus</span></label>
      </div>
    </div>
    <div class="quantity-editor">
      <button class="button button-small" type="button" data-profile-save="${escapeHtml(profile.id)}" ${characterLocked ? 'disabled' : ''}>Save</button>
      <button class="button button-small button-ghost" type="button" data-profile-toggle="${escapeHtml(profile.id)}" data-next-active="${profile.isActive ? 'false' : 'true'}" ${characterLocked ? 'disabled' : ''}>${profile.isActive ? 'Deactivate' : 'Activate'}</button>
    </div>
  </article>`).join('');
}

async function loadProfiles() {
  if (!selectedCharacterId) return renderProfiles([]);
  setStatus('Loading Attack Profiles…');
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/attack-profiles`);
    characterLocked = Boolean(payload.life?.characterLocked);
    renderProfiles(payload.profiles || []);
    const create = $('#gm-create-attack-profile');
    if (create) create.disabled = characterLocked;
    setStatus(characterLocked ? 'Character is DEAD and locked. Profiles are read-only.' : '', characterLocked ? 'error' : '');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function newProfilePayload() {
  return {
    name: $('#gm-attack-name')?.value || '',
    storedAccuracy: Number($('#gm-attack-accuracy')?.value),
    damageDiceCount: Number($('#gm-attack-dice-count')?.value),
    damageDiceSides: Number($('#gm-attack-dice-sides')?.value),
    fixedDamageModifier: Number($('#gm-attack-fixed')?.value || 0),
    appliesCharacterDamageBonus: Boolean($('#gm-attack-db')?.checked)
  };
}

async function createProfile() {
  if (!selectedCharacterId || characterLocked) return;
  const button = $('#gm-create-attack-profile');
  if (button) button.disabled = true;
  try {
    await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/attack-profiles`, {
      method: 'POST',
      body: JSON.stringify(newProfilePayload())
    });
    $('#gm-attack-name').value = '';
    await loadProfiles();
    toast('Attack Profile created.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    if (button) button.disabled = characterLocked;
  }
}

function rowPayload(row) {
  return {
    name: $('[data-profile-name]', row)?.value || '',
    storedAccuracy: Number($('[data-profile-accuracy]', row)?.value),
    damageDiceCount: Number($('[data-profile-count]', row)?.value),
    damageDiceSides: Number($('[data-profile-sides]', row)?.value),
    fixedDamageModifier: Number($('[data-profile-fixed]', row)?.value || 0),
    appliesCharacterDamageBonus: Boolean($('[data-profile-db]', row)?.checked)
  };
}

async function saveProfile(profileId, extra = {}) {
  if (!selectedCharacterId || characterLocked) return;
  const row = document.querySelector(`[data-profile-row="${CSS.escape(profileId)}"]`);
  if (!row) return;
  try {
    await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/attack-profiles/${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...rowPayload(row), ...extra })
    });
    await loadProfiles();
    toast('Attack Profile updated.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

document.addEventListener('click', event => {
  const openButton = event.target.closest?.('[data-open-character]');
  if (openButton) {
    selectedCharacterId = openButton.dataset.openCharacter || '';
    characterLocked = false;
    queueMicrotask(loadProfiles);
    return;
  }

  if (event.target.closest?.('#close-gm-character')) {
    selectedCharacterId = '';
    characterLocked = false;
    renderProfiles([]);
    setStatus('');
    return;
  }

  const save = event.target.closest?.('[data-profile-save]');
  if (save) {
    saveProfile(save.dataset.profileSave);
    return;
  }

  const toggle = event.target.closest?.('[data-profile-toggle]');
  if (toggle) saveProfile(toggle.dataset.profileToggle, { isActive: toggle.dataset.nextActive === 'true' });
});

$('#gm-create-attack-profile')?.addEventListener('click', createProfile);
