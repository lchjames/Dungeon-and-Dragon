import { $, escapeHtml, toast, emptyState } from './common.js';

let combatState = null;
let refreshTimer = null;

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
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function setStatus(message = '', kind = '') {
  const box = $('#player-combat-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function renderNoCombat() {
  const panel = $('#player-combat-panel');
  if (!panel) return;
  panel.classList.add('hidden');
  $('#player-combat-initiative').innerHTML = '';
  $('#player-combat-current').textContent = 'No active Combat.';
  $('#player-attack-controls')?.classList.add('hidden');
}

function lifeLabel(combatant) {
  const state = String(combatant?.lifeState || 'alive').toLowerCase();
  if (state === 'dying') return `DYING${combatant.dyingRoundsRemaining !== null ? ` · ${combatant.dyingRoundsRemaining} turns` : ''}`;
  if (state === 'dead') return 'DEAD';
  return 'ALIVE';
}

function renderAttackControls(combat) {
  const panel = $('#player-attack-controls');
  const profileSelect = $('#player-attack-profile');
  const targetSelect = $('#player-attack-target');
  const attackButton = $('#player-attack');
  if (!panel || !profileSelect || !targetSelect || !attackButton) return;

  const current = combat?.currentCombatant;
  const ownTurn = Boolean(combat?.isOwnTurn && current);
  const alive = String(current?.lifeState || 'alive').toLowerCase() === 'alive';
  const profiles = combatState?.attackProfiles || [];
  const targets = (combat?.combatants || []).filter(item =>
    item.id !== current?.id && item.entityType === 'character' && String(item.lifeState || 'alive').toLowerCase() !== 'dead'
  );

  panel.classList.toggle('hidden', !ownTurn);
  const previousProfile = profileSelect.value;
  const previousTarget = targetSelect.value;
  profileSelect.innerHTML = profiles.length
    ? profiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} · Acc ${escapeHtml(profile.storedAccuracy)} · ${escapeHtml(profile.damageDiceCount)}D${escapeHtml(profile.damageDiceSides)}${profile.fixedDamageModifier ? ` ${profile.fixedDamageModifier > 0 ? '+' : ''}${escapeHtml(profile.fixedDamageModifier)}` : ''}</option>`).join('')
    : '<option value="">No approved Attack Profile</option>';
  targetSelect.innerHTML = '<option value="">Select target</option>' + targets.map(target =>
    `<option value="${escapeHtml(target.id)}">${escapeHtml(target.displayName)} · ${escapeHtml(lifeLabel(target))}${target.hp ? ` · HP ${escapeHtml(target.hp.current)}/${escapeHtml(target.hp.max)}` : ''}</option>`
  ).join('');

  if (profiles.some(profile => profile.id === previousProfile)) profileSelect.value = previousProfile;
  if (targets.some(target => target.id === previousTarget)) targetSelect.value = previousTarget;

  profileSelect.disabled = !ownTurn || !alive || !current?.actionAvailable || !profiles.length;
  targetSelect.disabled = !ownTurn || !alive || !current?.actionAvailable || !targets.length;
  attackButton.disabled = !ownTurn || !alive || !current?.actionAvailable || !profileSelect.value || !targetSelect.value;
}

function renderCombat(combat) {
  const panel = $('#player-combat-panel');
  if (!panel) return;

  if (!combat || combat.status !== 'active') {
    renderNoCombat();
    return;
  }

  panel.classList.remove('hidden');
  $('#player-combat-round').textContent = `Round ${combat.roundNumber}`;

  const current = combat.currentCombatant;
  const ownTurn = Boolean(combat.isOwnTurn && current);
  const alive = String(current?.lifeState || 'alive').toLowerCase() === 'alive';
  $('#player-combat-current').textContent = current
    ? `${ownTurn ? 'Your Turn' : 'Current Turn'}: ${current.displayName} · ${lifeLabel(current)}${current.hp ? ` · HP ${current.hp.current}/${current.hp.max}` : ''} · DEX ${current.dex} · Action ${current.actionAvailable ? 'Ready' : 'Spent'} · Move ${current.moveAvailable ? 'Ready' : 'Spent'}`
    : 'Current Turn state is invalid.';

  const action = $('#player-consume-action');
  const move = $('#player-consume-move');
  const endTurn = $('#player-end-turn');

  if (action) action.disabled = !ownTurn || !alive || !current.actionAvailable;
  if (move) move.disabled = !ownTurn || !alive || !current.moveAvailable;
  if (endTurn) endTurn.disabled = !ownTurn;

  const initiative = $('#player-combat-initiative');
  initiative.innerHTML = (combat.combatants || []).map(combatant => {
    const flags = [
      combatant.isCurrent ? 'Current Turn' : '',
      combatant.controlledByCurrentUser ? 'Yours' : '',
      lifeLabel(combatant)
    ].filter(Boolean);
    return `<article class="stack-item compact-item ${combatant.isCurrent ? 'selected' : ''}">
      <div>
        <div class="row-inline">
          <h4>${combatant.initiativeOrder + 1}. ${escapeHtml(combatant.displayName)}</h4>
          <span class="tag">DEX ${escapeHtml(combatant.dex)}</span>
          ${flags.map(flag => `<span class="status-pill">${escapeHtml(flag)}</span>`).join('')}
        </div>
        <p>${combatant.hp ? `HP ${escapeHtml(combatant.hp.current)}/${escapeHtml(combatant.hp.max)} · ` : ''}Action ${combatant.actionAvailable ? 'Ready' : 'Spent'} · Move ${combatant.moveAvailable ? 'Ready' : 'Spent'}${combatant.turnCompleted ? ' · Turn completed' : ''}</p>
      </div>
    </article>`;
  }).join('');

  renderAttackControls(combat);
}

function renderAttackResult(attack) {
  const target = $('#player-attack-result');
  if (!target || !attack) return;
  const attackCheck = attack.attackCheck;
  const defenceCheck = attack.defenceCheck;
  const greatAttack = attackCheck.greatSuccess ? ' · Great Success' : attackCheck.greatFailure ? ' · Great Failure' : '';
  const greatDefence = defenceCheck.greatSuccess ? ' · Great Success' : defenceCheck.greatFailure ? ' · Great Failure' : '';
  const hitText = attack.hit ? 'HIT' : 'MISS / DEFENDED';
  const damageText = attack.hit
    ? ` · Raw Damage ${attack.damage?.rawDamage ?? '—'} · Defence ${attack.damage?.effectiveDefence ?? 0} · Damage Result ${attack.damage?.damageResult ?? '—'} · HP Damage ${attack.damage?.hpDamage ?? 0}`
    : '';
  const lifeText = attack.target?.lifeStateAfter ? ` · Target ${String(attack.target.lifeStateAfter).toUpperCase()}${attack.target.dyingRoundsRemaining !== null ? ` (${attack.target.dyingRoundsRemaining})` : ''}` : '';
  target.textContent = `${hitText} · Attack D100 ${attackCheck.roll} → Result ${attackCheck.result}${greatAttack} · Dodge D100 ${defenceCheck.roll} → Result ${defenceCheck.result}${greatDefence}${damageText}${lifeText}`;
}

function renderState(payload) {
  combatState = payload || { combat: null, attackProfiles: [] };
  renderCombat(combatState.combat || null);
  if (payload?.attack) renderAttackResult(payload.attack);
}

async function loadCombat({ quiet = false } = {}) {
  try {
    const payload = await api('/api/player/combat');
    renderState(payload);
    if (!quiet) setStatus('');
  } catch (error) {
    if (!quiet) setStatus(error.message, 'error');
  }
}

async function consumeAllowance(kind) {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn) return;
  const button = kind === 'action' ? $('#player-consume-action') : $('#player-consume-move');
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/consume-${kind}`, {
      method: 'POST', body: JSON.stringify({})
    });
    renderState(payload);
    toast(`${kind === 'action' ? 'Action' : 'Move'} marked as spent.`, 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadCombat({ quiet: true });
  }
}

async function attack() {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn) return;
  const profileId = $('#player-attack-profile')?.value || '';
  const targetCombatantId = $('#player-attack-target')?.value || '';
  if (!profileId || !targetCombatantId) return toast('Select an Attack Profile and Target.', 'error');
  const button = $('#player-attack');
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/attack`, {
      method: 'POST',
      body: JSON.stringify({ profileId, targetCombatantId })
    });
    renderState(payload);
    toast(payload.attack?.hit ? 'Attack resolved: hit.' : 'Attack resolved: defended.', payload.attack?.hit ? 'success' : 'info');
  } catch (error) {
    toast(error.message, 'error');
    await loadCombat({ quiet: true });
  }
}

async function endOwnTurn() {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn) return;
  const button = $('#player-end-turn');
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/end-turn`, {
      method: 'POST', body: JSON.stringify({})
    });
    renderState(payload);
    toast(payload.roundAdvanced ? `Round ${payload.combat?.roundNumber || ''} started.` : 'Turn ended.', 'success');
  } catch (error) {
    toast(error.message, 'error');
    await loadCombat({ quiet: true });
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadCombat({ quiet: true });
  }, 5000);
}

$('#player-refresh-combat')?.addEventListener('click', () => loadCombat());
$('#player-consume-action')?.addEventListener('click', () => consumeAllowance('action'));
$('#player-consume-move')?.addEventListener('click', () => consumeAllowance('move'));
$('#player-attack')?.addEventListener('click', attack);
$('#player-attack-profile')?.addEventListener('change', () => renderAttackControls(combatState?.combat));
$('#player-attack-target')?.addEventListener('change', () => renderAttackControls(combatState?.combat));
$('#player-end-turn')?.addEventListener('click', endOwnTurn);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadCombat({ quiet: true });
});

if ($('#player-combat-panel')) {
  $('#player-combat-initiative').innerHTML = emptyState('No active Combat', 'When the GM starts a Combat containing one of your Characters, it will appear here.');
}
loadCombat();
scheduleRefresh();
