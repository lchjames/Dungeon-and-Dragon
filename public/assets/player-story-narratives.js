import { escapeHtml } from './common.js';

let lastNarrativeSignature = '';
let refreshTimer = null;
let narrativeCharacterId = '';
let refreshSequence = 0;

function mountPanel() {
  const side = document.querySelector('#player-map-detail .player-map-side');
  if (!side || document.querySelector('#player-story-narratives')) return;
  const panel = document.createElement('section');
  panel.id = 'player-story-narratives';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading">
      <div><h3>Story</h3><span class="muted">GM-revealed narrative</span></div>
    </div>
    <div id="player-story-narrative-list" class="stack-list"><p class="muted">No revealed narrative yet.</p></div>`;
  side.append(panel);
  lastNarrativeSignature = '';
}

function selectedCharacterId() {
  return document.querySelector('#player-map-character')?.value || '';
}

function renderNarratives(items = []) {
  mountPanel();
  const target = document.querySelector('#player-story-narrative-list');
  if (!target) return false;
  if (!items.length) {
    target.innerHTML = '<p class="muted">No revealed narrative yet.</p>';
    return true;
  }
  target.innerHTML = items.map(item => `
    <article class="stack-item">
      <div>
        <p>${escapeHtml(item.text || '')}</p>
        <small class="muted">${item.createdAt ? new Date(Number(item.createdAt)).toLocaleString() : ''}</small>
      </div>
    </article>`).join('');
  return true;
}

function clearNarratives(message) {
  lastNarrativeSignature = '';
  mountPanel();
  const target = document.querySelector('#player-story-narrative-list');
  if (target) target.innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
}

async function refreshNarratives() {
  const characterId = selectedCharacterId();
  const sequence = ++refreshSequence;
  if (characterId !== narrativeCharacterId) {
    narrativeCharacterId = characterId;
    clearNarratives(characterId ? '正在載入故事…' : '請先選擇角色。');
  }
  if (!characterId || document.visibilityState !== 'visible') return;
  try {
    const response = await fetch(`/api/player/world/characters/${encodeURIComponent(characterId)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Narrative unavailable');
    const payload = await response.json();
    if (sequence !== refreshSequence || characterId !== selectedCharacterId() || document.visibilityState !== 'visible') return;
    const narratives = Array.isArray(payload?.storyNarratives) ? payload.storyNarratives : [];
    const signature = JSON.stringify(narratives.map(item => [item.id, item.createdAt, item.text]));
    mountPanel();
    if (signature === lastNarrativeSignature) return;
    if (renderNarratives(narratives)) lastNarrativeSignature = signature;
  } catch {
    if (sequence !== refreshSequence || characterId !== selectedCharacterId() || document.visibilityState !== 'visible') return;
    clearNarratives('故事暫時無法載入，系統會自動重試。');
    // The main Map UI owns connectivity/error presentation. Story polling stays quiet.
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshNarratives, 5000);
}

const observer = new MutationObserver(() => mountPanel());
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('change', event => {
  if (event.target?.id === 'player-map-character') refreshNarratives();
});
window.addEventListener('dnd:map-state-changed', refreshNarratives);
window.addEventListener('dnd:combat-state-changed', refreshNarratives);
document.addEventListener('visibilitychange', () => {
  refreshNarratives();
});

mountPanel();
refreshNarratives();
scheduleRefresh();
