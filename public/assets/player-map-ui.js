function ensureStylesheet() {
  if (document.querySelector('link[href="/assets/player-map.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/player-map.css';
  document.head.append(link);
}

function mountPlayerMap() {
  ensureStylesheet();
  const content = document.querySelector('#player-content');
  if (!content || document.querySelector('#player-map-panel')) return;
  const section = document.createElement('section');
  section.id = 'player-map-panel';
  section.className = 'panel';
  section.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">CURRENT WORLD</p>
        <h2>Location & Map</h2>
        <span class="muted">Server-authoritative 9-grid movement</span>
      </div>
      <div class="player-map-toolbar">
        <label class="field"><span>Character</span><select id="player-map-character" class="input"><option value="">Loading…</option></select></label>
        <button id="player-map-refresh" class="button button-small button-ghost" type="button">Refresh Map</button>
      </div>
    </div>
    <div id="player-map-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div id="player-map-empty" class="hidden"></div>
    <div id="player-map-detail" class="hidden">
      <div class="player-map-context-grid">
        <div class="player-map-context-card"><span>Scenario / Scene</span><strong id="player-map-scene">—</strong></div>
        <div class="player-map-context-card"><span>Location</span><strong id="player-map-location">—</strong></div>
        <div class="player-map-context-card"><span>Map</span><strong id="player-map-name">—</strong></div>
        <div class="player-map-context-card"><span>Character</span><strong id="player-map-position">—</strong></div>
      </div>
      <div class="player-map-layout">
        <div class="player-map-scroll">
          <div id="player-map-grid" class="player-map-grid" role="grid" aria-label="Current Runtime Map"></div>
        </div>
        <aside class="player-map-side">
          <section class="panel">
            <h3>Round State</h3>
            <div id="player-map-turn"></div>
            <div class="form-actions wrap">
              <button id="player-map-spend-action" class="button button-small button-ghost hidden" type="button">Mark Action Spent</button>
              <button id="player-map-end-exploration" class="button button-small button-ghost hidden" type="button">End Exploration Turn</button>
            </div>
          </section>
          <section class="panel">
            <h3>Move</h3>
            <p class="player-map-help">Highlighted cells are the legal destinations for the Character's one ordinary Move. Orthogonal and diagonal movement both cost one Move. Walls, blocking doors, occupied cells and fully blocked corners are rejected by the server.</p>
          </section>
          <section class="panel">
            <h3>Visibility</h3>
            <p class="player-map-help">Your token is always shown. Other Player tokens are visible by default unless the GM hides them. Monsters / Bosses are only sent to this view when explicitly visible.</p>
          </section>
        </aside>
      </div>
    </div>`;
  const combatPanel = document.querySelector('#player-combat-panel');
  if (combatPanel) content.insertBefore(section, combatPanel);
  else content.prepend(section);
}

mountPlayerMap();
await import('./player-map.js');
await import('./player-map-objects.js');
await import('./player-rest.js');
await import('./player-story-narratives.js');
