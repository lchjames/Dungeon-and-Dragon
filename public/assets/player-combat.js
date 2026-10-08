import { $, escapeHtml, toast, emptyState } from './common.js';

let combatState = null;
let refreshTimer = null;
let combatLoadVersion = 0;
let statusLoadVersion = 0;
let combatMutationPending = false;
let combatNeedsSync = false;

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

function ensureFocusButton() {
  if ($('#player-focus')) return $('#player-focus');
  const actionButton = $('#player-consume-action');
  const actions = actionButton?.parentElement;
  if (!actionButton || !actions) return null;
  const button = document.createElement('button');
  button.id = 'player-focus';
  button.className = 'button button-ghost';
  button.type = 'button';
  button.disabled = true;
  button.textContent = 'Focus / 集中 (+5% Max MP)';
  actions.insertBefore(button, actionButton);
  return button;
}

function renderNoCombat() {
  const panel = $('#player-combat-panel');
  if (!panel) return;
  panel.classList.add('hidden');
  $('#player-combat-initiative').innerHTML = '';
  $('#player-combat-current').textContent = 'No active Combat.';
  const statusList = $('#player-combat-status-list');
  if (statusList) statusList.innerHTML = '<p class="muted">No active Status conditions.</p>';
  $('#player-attack-controls')?.classList.add('hidden');
}

function hostileStatus(combatant) {
  if (combatant?.entityType === 'monster_instance') return String(combatant?.monsterStatus || 'active').toLowerCase();
  if (combatant?.entityType === 'boss_instance') return String(combatant?.status || combatant?.boss?.status || 'active').toLowerCase();
  return '';
}

function lifeLabel(combatant) {
  if (combatant?.entityType === 'monster_instance' || combatant?.entityType === 'boss_instance') {
    const status = hostileStatus(combatant);
    if (status === 'defeated') return 'DEFEATED';
    if (status === 'removed') return 'REMOVED';
    return 'ACTIVE';
  }
  const state = String(combatant?.lifeState || 'alive').toLowerCase();
  if (state === 'dying') return `DYING${combatant.dyingRoundsRemaining !== null ? ` · ${combatant.dyingRoundsRemaining} turns` : ''}`;
  if (state === 'dead') return 'DEAD';
  return 'ALIVE';
}

function isNormalAttackTarget(item, current) {
  if (!item || item.id === current?.id) return false;
  if (item.entityType === 'character') return String(item.lifeState || 'alive').toLowerCase() !== 'dead';
  if (item.entityType === 'monster_instance' || item.entityType === 'boss_instance') {
    return hostileStatus(item) === 'active' && Number(item.hp?.current ?? item.boss?.hp?.current ?? 0) > 0;
  }
  return false;
}

function monsterTargetMeta(target) {
  const defence = target?.defence?.effectiveD100Defence;
  const armor = target?.defence?.armor?.finalDefence;
  const bits = [];
  if (target?.hp) bits.push(`HP ${target.hp.current}/${target.hp.max}`);
  if (Number.isFinite(Number(defence))) bits.push(`Def ${defence}`);
  if (Number.isFinite(Number(armor))) bits.push(`Armor ${armor}`);
  return bits.length ? ` · ${bits.join(' · ')}` : '';
}

function bossTargetMeta(target) {
  const boss = target?.boss || {};
  const defence = boss?.defence?.d100?.effectiveDefence;
  const armor = boss?.defence?.armor?.finalDefence;
  const hp = target?.hp || boss?.hp;
  const bits = [];
  if (hp) bits.push(`HP ${hp.current}/${hp.max}`);
  if (Number.isFinite(Number(defence))) bits.push(`Def ${defence}`);
  if (Number.isFinite(Number(armor))) bits.push(`Armor ${armor}`);
  if (boss.currentPhaseNumber) bits.push(`Phase ${boss.currentPhaseNumber}`);
  return bits.length ? ` · ${bits.join(' · ')}` : '';
}

async function loadCombatStatuses(combat) {
  const version = ++statusLoadVersion;
  const target = $('#player-combat-status-list');
  if (!target) return;
  if (!combat || combat.status !== 'active') {
    target.innerHTML = '<p class="muted">目前沒有進行中的戰鬥。</p>';
    return;
  }
  const characters = (combat?.combatants || []).filter(item =>
    item?.entityType === 'character' && item?.controlledByCurrentUser && item?.id
  );
  if (!characters.length) {
    target.innerHTML = '<p class="muted">你沒有角色參與這場戰鬥。</p>';
    return;
  }
  target.innerHTML = '<p class="muted">正在更新角色狀態…</p>';
  try {
    const results = await Promise.allSettled(characters.map(async character => {
      const payload = await api(`/api/player/characters/${encodeURIComponent(character.id)}/status-effects`);
      return { character, statuses: payload.statusEffects || [] };
    }));
    if (version !== statusLoadVersion) return;
    const rows = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    const failures = results.flatMap((result, index) => result.status === 'rejected'
      ? [`<p class="muted">${escapeHtml(characters[index].displayName || characters[index].id)}：狀態暫時無法載入，請重新整理。</p>`]
      : []).join('');
    const visible = rows.flatMap(({ character, statuses }) => statuses.map(status => ({ character, status })));
    if (!visible.length) {
      target.innerHTML = `${rows.length ? '<p class="muted">已載入的角色目前沒有生效中的狀態。</p>' : ''}${failures}`;
      return;
    }
    target.innerHTML = visible.map(({ character, status }) => {
      const duration = status.durationType === 'PERMANENT'
        ? '永久'
        : `剩餘 ${status.remainingRounds ?? '—'} 回合`;
      const stack = Number(status.stackCount || 1) > 1 ? ` · ${status.stackCount} 層` : '';
      return `<article class="stack-item compact-item">
        <div>
          <div class="row-inline"><h4>${escapeHtml(status.name)}</h4><span class="status-pill">${escapeHtml(character.displayName || character.id)}</span></div>
          <p>${escapeHtml(duration)}${escapeHtml(stack)}</p>
        </div>
      </article>`;
    }).join('') + failures;
  } catch (error) {
    if (version !== statusLoadVersion) return;
    target.innerHTML = '<p class="muted">狀態暫時無法載入，請重新整理。</p>';
  }
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
  const targets = (combat?.combatants || []).filter(item => isNormalAttackTarget(item, current));

  panel.classList.toggle('hidden', !ownTurn);
  const previousProfile = profileSelect.value;
  const previousTarget = targetSelect.value;
  profileSelect.innerHTML = profiles.length
    ? profiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} · Acc ${escapeHtml(profile.storedAccuracy)} · ${escapeHtml(profile.damageDiceCount)}D${escapeHtml(profile.damageDiceSides)}${profile.fixedDamageModifier ? ` ${profile.fixedDamageModifier > 0 ? '+' : ''}${escapeHtml(profile.fixedDamageModifier)}` : ''}</option>`).join('')
    : '<option value="">No approved Attack Profile</option>';
  targetSelect.innerHTML = '<option value="">Select target</option>' + targets.map(target => {
    if (target.entityType === 'monster_instance') {
      return `<option value="${escapeHtml(target.id)}">${escapeHtml(target.displayName)} · MONSTER · ${escapeHtml(lifeLabel(target))}${escapeHtml(monsterTargetMeta(target))}</option>`;
    }
    if (target.entityType === 'boss_instance') {
      return `<option value="${escapeHtml(target.id)}">${escapeHtml(target.displayName)} · BOSS · ${escapeHtml(lifeLabel(target))}${escapeHtml(bossTargetMeta(target))}</option>`;
    }
    return `<option value="${escapeHtml(target.id)}">${escapeHtml(target.displayName)} · ${escapeHtml(lifeLabel(target))}${target.hp ? ` · HP ${escapeHtml(target.hp.current)}/${escapeHtml(target.hp.max)}` : ''}</option>`;
  }).join('');

  if (profiles.some(profile => profile.id === previousProfile)) profileSelect.value = previousProfile;
  if (targets.some(target => target.id === previousTarget)) targetSelect.value = previousTarget;

  profileSelect.disabled = combatMutationPending || combatNeedsSync || !ownTurn || !alive || !current?.actionAvailable || !profiles.length;
  targetSelect.disabled = combatMutationPending || combatNeedsSync || !ownTurn || !alive || !current?.actionAvailable || !targets.length;
  attackButton.disabled = combatMutationPending || combatNeedsSync || !ownTurn || !alive || !current?.actionAvailable || !profileSelect.value || !targetSelect.value;
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
  const hpText = current?.hp ? ` · HP ${current.hp.current}/${current.hp.max}` : '';
  const mpText = current?.mp ? ` · MP ${current.mp.current}/${current.mp.max}` : '';
  $('#player-combat-current').textContent = current
    ? `${ownTurn ? 'Your Turn' : 'Current Turn'}: ${current.displayName} · ${lifeLabel(current)}${hpText}${mpText} · DEX ${current.dex} · Action ${current.actionAvailable ? 'Ready' : 'Spent'} · Move ${current.moveAvailable ? 'Ready' : 'Spent'}`
    : 'Current Turn state is invalid.';

  const focus = ensureFocusButton();
  const action = $('#player-consume-action');
  const move = $('#player-consume-move');
  const endTurn = $('#player-end-turn');
  const hasMissingMp = !current?.mp || !Number.isFinite(Number(current.mp.current)) || !Number.isFinite(Number(current.mp.max));
  const mpFull = !hasMissingMp && Number(current.mp.current) >= Number(current.mp.max);

  if (focus) focus.disabled = combatMutationPending || combatNeedsSync || !ownTurn || !alive || !current.actionAvailable || hasMissingMp || mpFull;
  if (action) action.disabled = combatMutationPending || combatNeedsSync || !ownTurn || !alive || !current.actionAvailable;
  if (move) move.disabled = combatMutationPending || combatNeedsSync || !ownTurn || !alive || !current.moveAvailable;
  if (endTurn) endTurn.disabled = combatMutationPending || combatNeedsSync || !ownTurn;

  const initiative = $('#player-combat-initiative');
  initiative.innerHTML = (combat.combatants || []).map(combatant => {
    const flags = [combatant.isCurrent ? 'Current Turn' : '', combatant.controlledByCurrentUser ? 'Yours' : '', lifeLabel(combatant)].filter(Boolean);
    const resourceBits = [];
    if (combatant.hp) resourceBits.push(`HP ${escapeHtml(combatant.hp.current)}/${escapeHtml(combatant.hp.max)}`);
    if (combatant.mp) resourceBits.push(`MP ${escapeHtml(combatant.mp.current)}/${escapeHtml(combatant.mp.max)}`);
    return `<article class="stack-item compact-item ${combatant.isCurrent ? 'selected' : ''}">
      <div>
        <div class="row-inline">
          <h4>${combatant.initiativeOrder + 1}. ${escapeHtml(combatant.displayName)}</h4>
          <span class="tag">DEX ${escapeHtml(combatant.dex)}</span>
          ${flags.map(flag => `<span class="status-pill">${escapeHtml(flag)}</span>`).join('')}
        </div>
        <p>${resourceBits.length ? `${resourceBits.join(' · ')} · ` : ''}Action ${combatant.actionAvailable ? 'Ready' : 'Spent'} · Move ${combatant.moveAvailable ? 'Ready' : 'Spent'}${combatant.turnCompleted ? ' · Turn completed' : ''}</p>
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
  const bossTarget = attack.target?.entityType === 'boss_instance' || attack.defenceSource === 'boss_stored_defence';
  const monsterTarget = !bossTarget && (attack.target?.entityType === 'monster_instance' || attack.defenceSource === 'monster_stored_defence');
  const hostileTarget = monsterTarget || bossTarget;
  const defenceName = bossTarget ? 'Boss Defence' : monsterTarget ? 'Monster Defence' : 'Dodge';
  const armorText = hostileTarget && attack.hit
    ? ` · Armor ${attack.armor?.finalDefence ?? attack.damage?.effectiveDefence ?? 0}`
    : '';
  const damageText = attack.hit
    ? ` · Raw Damage ${attack.damage?.rawDamage ?? '—'}${armorText} · Damage Result ${attack.damage?.damageResult ?? '—'} · HP Damage ${attack.damage?.hpDamage ?? 0}`
    : '';
  const targetState = hostileTarget
    ? (attack.target?.statusAfter ? ` · Target ${String(attack.target.statusAfter).toUpperCase()} · HP ${attack.target.hpBefore ?? '—'}→${attack.target.hpAfter ?? '—'}` : '')
    : (attack.target?.lifeStateAfter ? ` · Target ${String(attack.target.lifeStateAfter).toUpperCase()}${attack.target.dyingRoundsRemaining !== null ? ` (${attack.target.dyingRoundsRemaining})` : ''}` : '');
  target.textContent = `${hitText} · Attack D100 ${attackCheck.roll} → Result ${attackCheck.result}${greatAttack} · ${defenceName} D100 ${defenceCheck.roll} → Result ${defenceCheck.result}${greatDefence}${damageText}${targetState}`;
}

function renderState(payload) {
  // A mutation response also invalidates older in-flight polling reads.
  combatLoadVersion++;
  combatState = payload || { combat: null, attackProfiles: [] };
  renderCombat(combatState.combat || null);
  loadCombatStatuses(combatState.combat || null).catch(() => {});
  if (payload?.attack) renderAttackResult(payload.attack);
}

async function loadCombat({ quiet = false } = {}) {
  if (combatMutationPending) return;
  const version = ++combatLoadVersion;
  try {
    const payload = await api('/api/player/combat');
    if (version !== combatLoadVersion) return;
    if (combatNeedsSync) setStatus('');
    combatNeedsSync = false;
    renderState(payload);
    if (!quiet) setStatus('');
  } catch (error) {
    if (version !== combatLoadVersion) return;
    if (!quiet) setStatus(error.message, 'error');
  }
}


function beginCombatMutation() {
  if (combatMutationPending || combatNeedsSync) return false;
  combatMutationPending = true;
  // Reads started before this write must not restore stale controls.
  combatLoadVersion++;
  statusLoadVersion++;
  for (const id of ['player-focus', 'player-consume-action', 'player-consume-move',
    'player-attack', 'player-end-turn', 'player-attack-profile', 'player-attack-target']) {
    const control = $('#' + id);
    if (control) control.disabled = true;
  }
  setStatus('正在處理戰鬥操作，請稍候…');
  return true;
}

async function recoverCombatMutation(error) {
  // A failed response does not prove the server rejected the write. Do not
  // retry POST; require a successful authoritative read before another action.
  combatNeedsSync = true;
  combatMutationPending = false;
  toast(error.message, 'error');
  setStatus('操作結果尚未確認，正在同步戰鬥狀態；若未恢復，請按重新整理。', 'error');
  await loadCombat({ quiet: true });
}

function finishCombatMutation() {
  combatMutationPending = false;
  renderCombat(combatState?.combat || null);
  if (!combatNeedsSync) setStatus('');
}

async function consumeAllowance(kind) {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn || combatMutationPending || combatNeedsSync) return;
  const button = kind === 'action' ? $('#player-consume-action') : $('#player-consume-move');
  if (!beginCombatMutation()) return;
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/consume-${kind}`, { method: 'POST', body: JSON.stringify({}) });
    renderState(payload);
    toast(`${kind === 'action' ? 'Action' : 'Move'} marked as spent.`, 'success');
  } catch (error) {
    await recoverCombatMutation(error);
  } finally {
    finishCombatMutation();
  }
}

async function focus() {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn || combatMutationPending || combatNeedsSync) return;
  const button = $('#player-focus');
  if (!beginCombatMutation()) return;
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/focus`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    renderState(payload);
    const result = payload.focus;
    toast(`集中完成：MP ${result?.mpBefore ?? '—'} → ${result?.mpAfter ?? '—'}（+${result?.recoveryApplied ?? 0}）`, 'success');
  } catch (error) {
    await recoverCombatMutation(error);
  } finally {
    finishCombatMutation();
  }
}

async function attack() {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn || combatMutationPending || combatNeedsSync) return;
  const profileId = $('#player-attack-profile')?.value || '';
  const targetCombatantId = $('#player-attack-target')?.value || '';
  if (!profileId || !targetCombatantId) return toast('Select an Attack Profile and Target.', 'error');
  const button = $('#player-attack');
  if (!beginCombatMutation()) return;
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/attack`, {
      method: 'POST',
      body: JSON.stringify({ profileId, targetCombatantId })
    });
    renderState(payload);
    toast(payload.attack?.hit ? 'Attack resolved: hit.' : 'Attack resolved: defended.', payload.attack?.hit ? 'success' : 'info');
  } catch (error) {
    await recoverCombatMutation(error);
  } finally {
    finishCombatMutation();
  }
}

async function endOwnTurn() {
  const combat = combatState?.combat;
  if (!combat?.isOwnTurn || combatMutationPending || combatNeedsSync) return;
  const button = $('#player-end-turn');
  if (!beginCombatMutation()) return;
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/player/combat/${encodeURIComponent(combat.id)}/end-turn`, { method: 'POST', body: JSON.stringify({}) });
    renderState(payload);
    toast(payload.roundAdvanced ? `Round ${payload.combat?.roundNumber || ''} started.` : 'Turn ended.', 'success');
  } catch (error) {
    await recoverCombatMutation(error);
  } finally {
    finishCombatMutation();
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadCombat({ quiet: true });
  }, 5000);
}

ensureFocusButton();
$('#player-refresh-combat')?.addEventListener('click', () => loadCombat());
$('#player-focus')?.addEventListener('click', focus);
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
