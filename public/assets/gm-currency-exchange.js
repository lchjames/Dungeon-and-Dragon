import { $, escapeHtml, toast } from './common.js';

const COINS = [
  ['coin_bronze', 'Bronze'],
  ['coin_silver', 'Silver'],
  ['coin_gold', 'Gold']
];
const LABEL = Object.fromEntries(COINS);
let state = null;
let selectedCharacterId = '';
let characterCurrency = null;

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

function rateLabel(rate) {
  return `${rate.fromQuantity} ${LABEL[rate.fromItemDefinitionId] || rate.fromItemDefinitionId} → ${rate.toQuantity} ${LABEL[rate.toItemDefinitionId] || rate.toItemDefinitionId}`;
}

function ensureGlobalPanel() {
  if ($('#gm-currency-exchange-panel')) return;
  const dashboard = $('#view-dashboard');
  if (!dashboard) return;
  const panel = document.createElement('section');
  panel.id = 'gm-currency-exchange-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading">
      <div><p class="eyebrow">CAMPAIGN ECONOMY</p><h2>Current Exchange Rate</h2><span class="muted">Directional D1 rates. Randomise creates a DRAFT only; activation is explicit and archives the previous ACTIVE set.</span></div>
      <button id="gm-refresh-currency" class="button button-small button-ghost" type="button">Refresh</button>
    </div>
    <div id="gm-currency-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="split-grid">
      <section>
        <h3>ACTIVE</h3>
        <div id="gm-active-rates" class="stack-list"><p class="muted">No active exchange-rate set.</p></div>
      </section>
      <section>
        <h3>DRAFT / Preview</h3>
        <label class="field"><span>Draft label</span><input id="gm-fx-label" class="input" maxlength="120" placeholder="e.g. Session 12"></label>
        <div id="gm-draft-rates" class="stack-list"><p class="muted">No draft yet.</p></div>
        <div class="form-actions wrap">
          <button id="gm-randomise-rates" class="button button-ghost" type="button">Randomise Today's Rates</button>
          <button id="gm-save-manual-rates" class="button button-ghost" type="button">Save Manual Draft</button>
          <button id="gm-activate-rates" class="button" type="button" disabled>Save as Current Rates</button>
        </div>
      </section>
    </div>
    <details>
      <summary>Random generator settings</summary>
      <div class="form-grid compact-grid" style="margin-top:1rem">
        <label class="field"><span>Bronze per Silver reference</span><input id="gm-fx-ref-bs" class="input" type="number" min="1" step="1"></label>
        <label class="field"><span>Silver per Gold reference</span><input id="gm-fx-ref-sg" class="input" type="number" min="1" step="1"></label>
        <label class="field"><span>Low→High premium min %</span><input id="gm-fx-premium-min" class="input" type="number" min="0" max="100" step="0.1"></label>
        <label class="field"><span>Low→High premium max %</span><input id="gm-fx-premium-max" class="input" type="number" min="0" max="100" step="0.1"></label>
        <label class="field"><span>High→Low haircut min %</span><input id="gm-fx-haircut-min" class="input" type="number" min="0" max="99.99" step="0.1"></label>
        <label class="field"><span>High→Low haircut max %</span><input id="gm-fx-haircut-max" class="input" type="number" min="0" max="99.99" step="0.1"></label>
      </div>
      <div class="form-actions"><button id="gm-save-fx-settings" class="button button-small button-ghost" type="button">Save Generator Settings</button></div>
    </details>
    <div class="panel-heading" style="margin-top:1rem"><h3>Recent Rate Sets</h3></div>
    <div id="gm-fx-history" class="stack-list"></div>`;
  dashboard.appendChild(panel);
}

function ensureCharacterPanel() {
  if ($('#gm-character-currency-panel')) return;
  const anchor = $('#gm-inventory-weapon-panel') || $('#gm-attack-profile-panel');
  if (!anchor) return;
  const panel = document.createElement('section');
  panel.id = 'gm-character-currency-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading"><div><h3>Character Currency</h3><span class="muted">GM correction only. Player changes Currency only through ACTIVE exchange rates.</span></div></div>
    <div id="gm-character-currency-status" class="auth-status" hidden></div>
    <div id="gm-character-currency-list" class="form-grid compact-grid"><p class="muted">Open a Character to load Currency.</p></div>`;
  anchor.parentNode.insertBefore(panel, anchor);
}

function setStatus(message = '', kind = '') {
  const box = $('#gm-currency-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function renderRateRows(rates = [], editable = false) {
  if (!rates.length) return '<p class="muted">No rates.</p>';
  return rates.map(rate => `<article class="stack-item" data-fx-direction="${escapeHtml(rate.fromItemDefinitionId)}:${escapeHtml(rate.toItemDefinitionId)}">
    <div style="flex:1">
      <div class="row-inline"><strong>${escapeHtml(LABEL[rate.fromItemDefinitionId] || rate.fromItemDefinitionId)} → ${escapeHtml(LABEL[rate.toItemDefinitionId] || rate.toItemDefinitionId)}</strong>${rate.enabled ? '<span class="status-pill">enabled</span>' : '<span class="status-pill">disabled</span>'}</div>
      ${editable ? `<div class="row-inline"><input class="input input-compact" data-fx-from type="number" min="1" step="1" value="${escapeHtml(rate.fromQuantity)}"><span>→</span><input class="input input-compact" data-fx-to type="number" min="1" step="1" value="${escapeHtml(rate.toQuantity)}"><label><input data-fx-enabled type="checkbox" ${rate.enabled ? 'checked' : ''}> enabled</label></div>` : `<p>${escapeHtml(rateLabel(rate))}</p>`}
    </div>
  </article>`).join('');
}

function renderState() {
  ensureGlobalPanel();
  const active = state?.active;
  const draft = state?.draft;
  $('#gm-active-rates').innerHTML = active ? `<p class="muted">${escapeHtml(active.label)} · updated ${new Date(active.updatedAt).toLocaleString()}</p>${renderRateRows(active.rates)}` : '<p class="muted">No active exchange-rate set.</p>';
  $('#gm-draft-rates').innerHTML = draft ? renderRateRows(draft.rates, true) : renderRateRows([
    { fromItemDefinitionId:'coin_bronze', toItemDefinitionId:'coin_silver', fromQuantity:100, toQuantity:1, enabled:true },
    { fromItemDefinitionId:'coin_silver', toItemDefinitionId:'coin_bronze', fromQuantity:1, toQuantity:100, enabled:true },
    { fromItemDefinitionId:'coin_silver', toItemDefinitionId:'coin_gold', fromQuantity:100, toQuantity:1, enabled:true },
    { fromItemDefinitionId:'coin_gold', toItemDefinitionId:'coin_silver', fromQuantity:1, toQuantity:100, enabled:true }
  ], true);
  $('#gm-fx-label').value = draft?.label || '';
  $('#gm-activate-rates').disabled = !draft?.id;
  const s = state?.settings || {};
  $('#gm-fx-ref-bs').value = s.bronzePerSilverReference ?? 100;
  $('#gm-fx-ref-sg').value = s.silverPerGoldReference ?? 100;
  $('#gm-fx-premium-min').value = s.lowToHighPremiumMinPct ?? 2;
  $('#gm-fx-premium-max').value = s.lowToHighPremiumMaxPct ?? 10;
  $('#gm-fx-haircut-min').value = s.highToLowSpreadMinPct ?? 0;
  $('#gm-fx-haircut-max').value = s.highToLowSpreadMaxPct ?? 3;
  $('#gm-fx-history').innerHTML = (state?.history || []).map(item => `<article class="stack-item"><div><div class="row-inline"><strong>${escapeHtml(item.label)}</strong><span class="status-pill">${escapeHtml(item.status)}</span><span class="tag">${escapeHtml(item.generationMode)}</span></div><small>${new Date(item.updatedAt).toLocaleString()}</small></div></article>`).join('') || '<p class="muted">No history yet.</p>';
}

function settingsPayload() {
  return {
    bronzePerSilverReference: Number($('#gm-fx-ref-bs').value),
    silverPerGoldReference: Number($('#gm-fx-ref-sg').value),
    lowToHighPremiumMinPct: Number($('#gm-fx-premium-min').value),
    lowToHighPremiumMaxPct: Number($('#gm-fx-premium-max').value),
    highToLowSpreadMinPct: Number($('#gm-fx-haircut-min').value),
    highToLowSpreadMaxPct: Number($('#gm-fx-haircut-max').value)
  };
}

function draftRatesPayload() {
  return [...document.querySelectorAll('[data-fx-direction]')].filter(row => row.closest('#gm-draft-rates')).map((row, index) => {
    const [fromItemDefinitionId, toItemDefinitionId] = row.dataset.fxDirection.split(':');
    return {
      fromItemDefinitionId,
      toItemDefinitionId,
      fromQuantity: Number($('[data-fx-from]', row).value),
      toQuantity: Number($('[data-fx-to]', row).value),
      enabled: Boolean($('[data-fx-enabled]', row).checked),
      sortOrder: (index + 1) * 10
    };
  });
}

async function loadState() {
  setStatus('Loading Currency Exchange authority…');
  try {
    state = await api('/api/gm/currency-exchange');
    renderState();
    setStatus('');
  } catch (error) { setStatus(error.message, 'error'); }
}

async function loadCharacterCurrency() {
  ensureCharacterPanel();
  const target = $('#gm-character-currency-list');
  if (!selectedCharacterId) {
    characterCurrency = null;
    target.innerHTML = '<p class="muted">Open a Character to load Currency.</p>';
    return;
  }
  const payload = await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/currency`);
  characterCurrency = payload;
  target.innerHTML = COINS.map(([id, label]) => {
    const balance = payload.balances?.[id];
    return `<label class="field"><span>${escapeHtml(label)}</span><div class="row-inline"><input class="input" data-gm-coin="${escapeHtml(id)}" type="number" min="0" step="1" value="${escapeHtml(balance?.quantity ?? 0)}"><button class="button button-small button-ghost" data-gm-save-coin="${escapeHtml(id)}" type="button">Save</button></div></label>`;
  }).join('');
}

async function saveSettings() {
  try {
    const payload = await api('/api/gm/currency-exchange/settings', { method:'PATCH', body:JSON.stringify(settingsPayload()) });
    state.settings = payload.settings;
    renderState();
    toast('Exchange generator settings saved.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function randomise() {
  try {
    const payload = await api('/api/gm/currency-exchange/randomise', { method:'POST', body:JSON.stringify({ settings: settingsPayload() }) });
    state.draft = payload.draft;
    state.settings = settingsPayload();
    renderState();
    toast('Random DRAFT generated. It is not active yet.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function saveManual() {
  try {
    const payload = await api('/api/gm/currency-exchange/draft', { method:'PUT', body:JSON.stringify({ label:$('#gm-fx-label').value, rates:draftRatesPayload() }) });
    state.draft = payload.draft;
    renderState();
    toast('Manual Exchange Rate DRAFT saved.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function activate() {
  if (!state?.draft?.id) return;
  try {
    await api(`/api/gm/currency-exchange/draft/${encodeURIComponent(state.draft.id)}/activate`, { method:'POST', body:JSON.stringify({}) });
    await loadState();
    toast('Exchange rates activated. Previous ACTIVE set archived.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function saveCoin(button) {
  if (!selectedCharacterId) return;
  const coinId = button.dataset.gmSaveCoin;
  const input = document.querySelector(`[data-gm-coin="${CSS.escape(coinId)}"]`);
  const quantity = Number(input?.value);
  if (!Number.isInteger(quantity) || quantity < 0) return toast('Currency quantity must be a non-negative integer.', 'error');
  button.disabled = true;
  try {
    await api(`/api/gm/characters/${encodeURIComponent(selectedCharacterId)}/currency/${encodeURIComponent(coinId)}`, { method:'PATCH', body:JSON.stringify({ quantity }) });
    await loadCharacterCurrency();
    toast(`${LABEL[coinId] || coinId} corrected.`, 'success');
  } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = false; }
}

ensureGlobalPanel();
ensureCharacterPanel();
loadState();

document.addEventListener('click', event => {
  if (event.target.closest?.('#gm-refresh-currency')) return void loadState();
  if (event.target.closest?.('#gm-save-fx-settings')) return void saveSettings();
  if (event.target.closest?.('#gm-randomise-rates')) return void randomise();
  if (event.target.closest?.('#gm-save-manual-rates')) return void saveManual();
  if (event.target.closest?.('#gm-activate-rates')) return void activate();
  const saveCoinButton = event.target.closest?.('[data-gm-save-coin]');
  if (saveCoinButton) return void saveCoin(saveCoinButton);
  const open = event.target.closest?.('[data-open-character]');
  if (open) {
    selectedCharacterId = open.dataset.openCharacter || '';
    queueMicrotask(() => loadCharacterCurrency().catch(error => toast(error.message, 'error')));
    return;
  }
  if (event.target.closest?.('#close-gm-character')) {
    selectedCharacterId = '';
    loadCharacterCurrency().catch(() => {});
  }
});
