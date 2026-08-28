import './gm-story.js';
import './gm-world-map.js';
import './gm-map-editor.js';
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

function selectedId() {
  return selectedCharacterId || $('#character-select')?.value || '';
}

function setLocked(locked) {
  characterLocked = Boolean(locked);
  const form = $('#attack-profile-form');
  const button = $('#save-attack-profile');
  if (form) {
    form.querySelectorAll('input, select, textarea').forEach(element => {
      element.disabled = characterLocked;
    });
  }
  if (button) button.disabled = characterLocked;
}

function numberValue(formData, key, fallback = 0) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function renderProfiles(payload) {
  const container = $('#attack-profile-list');
  if (!container) return;
  const profiles = payload?.attackProfiles || [];
  if (!profiles.length) {
    container.innerHTML = '<p class="muted">No Attack Profiles configured.</p>';
    return;
  }
  container.innerHTML = profiles.map(profile => `<article class="stack-item">
    <div>
      <strong>${escapeHtml(profile.name)}</strong>
      <p>${escapeHtml(profile.damageDice)} · Accuracy ${escapeHtml(profile.accuracyModifier)} · Damage ${escapeHtml(profile.damageModifier)}</p>
    </div>
    <div class="row-inline">
      <span class="status-pill">${profile.active ? 'active' : 'inactive'}</span>
      <button class="button button-small button-ghost" type="button" data-edit-attack-profile="${escapeHtml(profile.id)}">Edit</button>
    </div>
  </article>`).join('');
}

async function loadProfiles(characterId = selectedId()) {
  if (!characterId) return;
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(characterId)}/attack-profiles`);
    renderProfiles(payload);
    setLocked(Boolean(payload?.characterLocked));
  } catch (error) {
    toast(error.message, 'error');
  }
}

function fillForm(profile) {
  const form = $('#attack-profile-form');
  if (!form || !profile) return;
  form.elements.profileId.value = profile.id || '';
  form.elements.name.value = profile.name || '';
  form.elements.damageDice.value = profile.damageDice || '1d4';
  form.elements.accuracyModifier.value = Number(profile.accuracyModifier || 0);
  form.elements.damageModifier.value = Number(profile.damageModifier || 0);
  form.elements.active.checked = Boolean(profile.active);
}

async function editProfile(profileId) {
  const characterId = selectedId();
  if (!characterId || !profileId) return;
  try {
    const payload = await api(`/api/gm/characters/${encodeURIComponent(characterId)}/attack-profiles`);
    const profile = (payload?.attackProfiles || []).find(item => item.id === profileId);
    if (profile) fillForm(profile);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function saveProfile(event) {
  event.preventDefault();
  if (characterLocked) return toast('Character is locked by life state.', 'error');
  const characterId = selectedId();
  if (!characterId) return toast('Select a Character first.', 'error');
  const form = event.currentTarget;
  const data = new FormData(form);
  const profileId = String(data.get('profileId') || '').trim();
  const body = {
    name: String(data.get('name') || '').trim(),
    damageDice: String(data.get('damageDice') || '').trim(),
    accuracyModifier: numberValue(data, 'accuracyModifier'),
    damageModifier: numberValue(data, 'damageModifier'),
    active: form.elements.active.checked
  };
  try {
    if (profileId) {
      await api(`/api/gm/characters/${encodeURIComponent(characterId)}/attack-profiles/${encodeURIComponent(profileId)}`, {
        method: 'PATCH', body: JSON.stringify(body)
      });
    } else {
      await api(`/api/gm/characters/${encodeURIComponent(characterId)}/attack-profiles`, {
        method: 'POST', body: JSON.stringify(body)
      });
    }
    form.reset();
    form.elements.profileId.value = '';
    form.elements.damageDice.value = '1d4';
    form.elements.accuracyModifier.value = '0';
    form.elements.damageModifier.value = '0';
    form.elements.active.checked = true;
    await loadProfiles(characterId);
    toast('Attack Profile saved.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function bind() {
  $('#attack-profile-form')?.addEventListener('submit', saveProfile);
  $('#attack-profile-list')?.addEventListener('click', event => {
    const button = event.target.closest?.('[data-edit-attack-profile]');
    if (button) editProfile(button.dataset.editAttackProfile);
  });
  window.addEventListener('dnd:gm-character-selected', event => {
    selectedCharacterId = event.detail?.characterId || '';
    loadProfiles(selectedCharacterId);
  });
  const select = $('#character-select');
  select?.addEventListener('change', event => {
    selectedCharacterId = event.target.value || '';
    loadProfiles(selectedCharacterId);
  });
  selectedCharacterId = select?.value || '';
  if (selectedCharacterId) loadProfiles(selectedCharacterId);
}

bind();
