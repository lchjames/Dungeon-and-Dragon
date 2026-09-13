import { $, escapeHtml, toast } from './common.js';

const LABEL = {
  coin_bronze: 'Bronze',
  coin_silver: 'Silver',
  coin_gold: 'Gold'
};
let activeCharacterId = '';
let state = null;
let selectedRate = null;

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
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/player/login/?next=${next}`);
    throw new Error('Session expired.');
  }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Request failed.');
    error.code = payload?.error?.code || '';
    throw error;
  }
  return payload;
}

function selectedCharacterId() {
  return document.querySelector('.character-card.selected')?.dataset.characterId || activeCharacterId || '';
}

function inventoryVisible() {
  return !$('#tab-inventory')?.classList.contains('hidden');
}

function ensurePanel() {
  if ($('#player-currency-panel')) return;
  const tab = $('#tab-inventory');
  const inventoryPanel = tab?.querySelector('.panel');
  if (!tab || !inventoryPanel) return;
  const panel = document.createElement('section');
  panel.id = 'player-currency-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading"><div><h3>Your Coins</h3><span class="muted">Currency is authoritative Inventory data. Exchange uses the current ACTIVE D1 quote only.</span></div><button id="player-refresh-currency" class="button button-small button-ghost" type="button">Refresh</button></div>
    <div id="player-currency-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div id="player-coin-balances" class="metric-grid"></div>
    <div class="panel-heading" style="margin-top:1rem"><div><h3>Today's Exchange Rate</h3><span id="player-rate-updated" class="muted">No ACTIVE rate set.</span></div></div>
    <div id="player-exchange-rates" class="stack-list"></div>`;
  tab.insertBefore(panel, inventoryPanel);
}

function ensureDialog() {
  if ($('#player-currency-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'player-currency-dialog';
  dialog.className = 'dialog';
  dialog.innerHTML = `
    <form method="dialog" id="player-currency-exchange-form">
      <div class="dialog-heading"><div><p class="eyebrow">CURRENCY EXCHANGE</p><h2 id="player-exchange-title">Exchange</h2></div><button id="player-close-exchange" class="icon-button" value="cancel" type="submit">×</button></div>
      <div id="player-exchange-quote" class="tool-result muted"></div>
      <label class="field"><span>Source Coins to convert</span><input id="player-exchange-amount" class="input" type="number" min="1" step="1"></label>
      <div class="form-actions wrap"><button id="player-exchange-minus" class="button button-small button-ghost" type="button">-1 Bundle</button><button id="player-exchange-plus" class="button button-small button-ghost" type="button">+1 Bundle</button><button id="player-exchange-plus5" class="button button-small button-ghost" type="button">+5 Bundles</button><button id="player-exchange-max" class="button button-small button-ghost" type="button">Max</button></div>
      <div id="player-exchange-preview" class="tool-result muted"></div>
      <div id="player-exchange-error" class="auth-status auth-status-error" hidden></div>
      <div class="form-actions dialog-actions"><button class="button button-ghost" value="cancel" type="submit">Cancel</button><button id="player-confirm-exchange" class="button" type="button">Confirm Exchange</button></div>
    </form>`;
  document.body.appendChild(dialog);
}

function setStatus(message = '', kind = '') {
  const box = $('#player-currency-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function balance(id) {
  return Number(state?.balances?.[id]?.quantity || 0);
}

function renderState() {
  ensurePanel();
  const balances = $('#player-coin-balances');
  if (balances) balances.innerHTML = Object.entries(LABEL).map(([id, label]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(balance(id))}</strong><small>Coin</small></article>`).join('');
  const rateSet = state?.activeRateSet;
  $('#player-rate-updated').textContent = rateSet ? `${rateSet.label} · updated ${new Date(rateSet.updatedAt).toLocaleString()}` : 'No ACTIVE rate set.';
  const rates = (rateSet?.rates || []).filter(rate => rate.enabled);
  $('#player-exchange-rates').innerHTML = rates.length ? rates.map(rate => `<article class="stack-item">
    <div><h4>${escapeHtml(rate.fromQuantity)} ${escapeHtml(LABEL[rate.fromItemDefinitionId] || rate.fromItemDefinitionId)} → ${escapeHtml(rate.toQuantity)} ${escapeHtml(LABEL[rate.toItemDefinitionId] || rate.toItemDefinitionId)}</h4><p>You have ${escapeHtml(balance(rate.fromItemDefinitionId))} ${escapeHtml(LABEL[rate.fromItemDefinitionId] || '')}.</p></div>
    <button class="button button-small" type="button" data-player-exchange-rate="${escapeHtml(rate.id)}">Exchange</button>
  </article>`).join('') : '<p class="muted">No enabled ACTIVE exchange rates.</p>';
}

async function loadCurrency({ force = false } = {}) {
  const id = selectedCharacterId();
  if (!id || (!force && !inventoryVisible())) return;
  activeCharacterId = id;
  setStatus('Loading Currency…');
  try {
    state = await api(`/api/player/characters/${encodeURIComponent(id)}/currency`);
    if (id !== selectedCharacterId()) return;
    renderState();
    setStatus('');
  } catch (error) { setStatus(error.message, 'error'); }
}

function findRate(rateId) {
  return (state?.activeRateSet?.rates || []).find(rate => rate.id === rateId && rate.enabled) || null;
}

function openExchange(rateId) {
  ensureDialog();
  selectedRate = findRate(rateId);
  if (!selectedRate) return toast('This exchange rate is no longer available. Refresh first.', 'error');
  const fromLabel = LABEL[selectedRate.fromItemDefinitionId] || selectedRate.fromItemDefinitionId;
  const toLabel = LABEL[selectedRate.toItemDefinitionId] || selectedRate.toItemDefinitionId;
  $('#player-exchange-title').textContent = `Exchange ${fromLabel} → ${toLabel}`;
  $('#player-exchange-quote').textContent = `Current Rate: ${selectedRate.fromQuantity} ${fromLabel} → ${selectedRate.toQuantity} ${toLabel} · You have ${balance(selectedRate.fromItemDefinitionId)} ${fromLabel}.`;
  const input = $('#player-exchange-amount');
  input.min = String(selectedRate.fromQuantity);
  input.step = String(selectedRate.fromQuantity);
  input.value = String(selectedRate.fromQuantity);
  $('#player-exchange-error').hidden = true;
  updatePreview();
  $('#player-currency-dialog').showModal();
}

function exchangeAmount() {
  return Number($('#player-exchange-amount')?.value || 0);
}

function updatePreview() {
  if (!selectedRate) return;
  const amount = exchangeAmount();
  const sourceBalance = balance(selectedRate.fromItemDefinitionId);
  const valid = Number.isInteger(amount) && amount > 0 && amount % selectedRate.fromQuantity === 0 && amount <= sourceBalance;
  const units = valid ? amount / selectedRate.fromQuantity : 0;
  const receive = units * selectedRate.toQuantity;
  const fromLabel = LABEL[selectedRate.fromItemDefinitionId] || selectedRate.fromItemDefinitionId;
  const toLabel = LABEL[selectedRate.toItemDefinitionId] || selectedRate.toItemDefinitionId;
  $('#player-exchange-preview').textContent = valid
    ? `You Pay ${amount} ${fromLabel} · You Receive ${receive} ${toLabel} · After: ${sourceBalance - amount} ${fromLabel}, ${balance(selectedRate.toItemDefinitionId) + receive} ${toLabel}.`
    : `Amount must be a whole multiple of ${selectedRate.fromQuantity} and cannot exceed your ${sourceBalance} ${fromLabel}.`;
  $('#player-confirm-exchange').disabled = !valid;
}

function shiftBundles(delta) {
  if (!selectedRate) return;
  const input = $('#player-exchange-amount');
  const current = Number(input.value || 0);
  input.value = String(Math.max(selectedRate.fromQuantity, current + selectedRate.fromQuantity * delta));
  updatePreview();
}

function maxBundles() {
  if (!selectedRate) return;
  const owned = balance(selectedRate.fromItemDefinitionId);
  const max = Math.floor(owned / selectedRate.fromQuantity) * selectedRate.fromQuantity;
  $('#player-exchange-amount').value = String(max || selectedRate.fromQuantity);
  updatePreview();
}

async function confirmExchange() {
  const id = selectedCharacterId();
  if (!id || !selectedRate || !state?.activeRateSet?.id) return;
  const button = $('#player-confirm-exchange');
  button.disabled = true;
  try {
    const payload = await api(`/api/player/characters/${encodeURIComponent(id)}/currency/exchange`, {
      method: 'POST',
      body: JSON.stringify({
        rateId: selectedRate.id,
        expectedRateSetId: state.activeRateSet.id,
        quotedFromQuantity: selectedRate.fromQuantity,
        quotedToQuantity: selectedRate.toQuantity,
        sourceQuantity: exchangeAmount()
      })
    });
    state = payload;
    $('#player-currency-dialog').close();
    selectedRate = null;
    renderState();
    document.dispatchEvent(new CustomEvent('dnd:currency-changed', { detail: { characterId: id } }));
    toast(`Exchange complete: ${payload.transaction.fromQuantityTotal} → ${payload.transaction.toQuantityTotal}.`, 'success');
  } catch (error) {
    const box = $('#player-exchange-error');
    box.textContent = error.message;
    box.hidden = false;
    if (error.code === 'CURRENCY_RATE_STALE') await loadCurrency({ force: true }).catch(() => {});
    updatePreview();
  } finally { button.disabled = false; }
}

ensurePanel();
ensureDialog();

document.addEventListener('click', event => {
  if (event.target.closest?.('#player-refresh-currency')) return void loadCurrency({ force: true });
  const exchange = event.target.closest?.('[data-player-exchange-rate]');
  if (exchange) return void openExchange(exchange.dataset.playerExchangeRate);
  if (event.target.closest?.('#player-exchange-minus')) return void shiftBundles(-1);
  if (event.target.closest?.('#player-exchange-plus')) return void shiftBundles(1);
  if (event.target.closest?.('#player-exchange-plus5')) return void shiftBundles(5);
  if (event.target.closest?.('#player-exchange-max')) return void maxBundles();
  if (event.target.closest?.('#player-confirm-exchange')) return void confirmExchange();
  const tab = event.target.closest?.('[data-tab="inventory"]');
  if (tab) return void queueMicrotask(() => loadCurrency({ force: true }));
  const character = event.target.closest?.('[data-character-id]');
  if (character) {
    activeCharacterId = character.dataset.characterId || '';
    if (inventoryVisible()) setTimeout(() => loadCurrency({ force: true }), 0);
    return;
  }
  if (event.target.closest?.('#close-character')) {
    activeCharacterId = '';
    state = null;
  }
});

$('#player-exchange-amount')?.addEventListener('input', updatePreview);
document.addEventListener('dnd:currency-changed', () => loadCurrency({ force: true }).catch(() => {}));
