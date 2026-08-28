import { escapeHtml } from './common.js';

let lastNarrativeSignature = '';
let refreshTimer = null;

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
}

function selectedCharacterId() {
  return document.querySelector('#player-map-character')?.value || '';
}

function renderNarratives(items = []) {
  mountPanel();
  const target = document.querySelector('#player-story-narrative-list');
  if (!target) return;
  if (!items.length) {
    target.innerHTML = '<p class="muted">No revealed narrative yet.</p>';
    return;
  }
  target.innerHTML = items.map(item => `
    <article class="stack-item">
      <div>
        <p>${escapeHtml(item.text || '')}</p>
        <small class="muted">${item.createdAt ? new Date(Number(item.createdAt)).toLocaleString() : ''}</small>
      </div>
    </article>`).join('');
}

async function refreshNarratives() {
  const characterId = selectedCharacterId();
  if (!characterId || document.visibilityState !== 'visible') return;
  try {
    const response = await fetch(`/api/player/world/characters/${encodeURIComponent(characterId)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return;
    const payload = await response.json();
    const narratives = Array.isArray(payload?.storyNarratives) ? payload.storyNarratives : [];
    const signature = JSON.stringify(narratives.map(item => [item.id, item.createdAt, item.text]));
    if (signature === lastNarrativeSignature) return;
    lastNarrativeSignature = signature;
    renderNarratives(narratives);
  } catch {
    // The main Map UI owns connectivity/error presentation. Story polling stays quiet.
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshNarratives, 5000);
}

const observer = new MutationObserver(() => mountPanel());
observer.observe(document.documentElement, { childList: true, subtree: true });

document.querySelector('#player-map-character')?.addEventListener('change', () => {
  lastNarrativeSignature = '';
  refreshNarratives();
});
window.addEventListener('dnd:map-state-changed', refreshNarratives);
window.addEventListener('dnd:combat-state-changed', refreshNarratives);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshNarratives();
});

mountPanel();
refreshNarratives();
scheduleRefresh();
