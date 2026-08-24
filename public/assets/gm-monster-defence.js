import { $, escapeHtml, toast, emptyState } from './common.js';

let defenceState = null;
let panelReady = false;

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
    location.replace(`/player/login/?next=${encodeURIComponent('/gm/#monsters')}`);
    throw new Error('Session expired.');
  }
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function ensurePanel() {
  if (panelReady && $('#monster-defence-armor-panel')) return true;
  const view = $('#view-monsters');
  if (!view) return false;
  if (!$('#monster-defence-armor-panel')) {
    const panel = document.createElement('section');
    panel.id = 'monster-defence-armor-panel';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-heading">
        <div>
          <h3>Monster Defence / Armor</h3>
          <span class="muted">Stored Defence resolves the opposed D100 check. Armor Defence is applied only after a hit in the Damage Result pipeline.</span>
        </div>
        <button id="monster-defence-refresh" class="button button-small button-ghost" type="button">Refresh Defence / Armor</button>
      </div>
      <div id="monster-defence-status" class="auth-status" hidden role="status" aria-live="polite"></div>
      <h4>Template Defence / Armor Sources</h4>
      <div id="monster-template-defence-list" class="stack-list"></div>
      <h4 style="margin-top:18px">Spawned Instance Runtime Defence</h4>
      <div id="monster-instance-defence-list" class="stack-list"></div>`;
    view.append(panel);
    $('#monster-defence-refresh')?.addEventListener('click', () => loadDefenceArmor());
    panel.addEventListener('click', handlePanelClick);
  }
  panelReady = true;
  return true;
}

function setStatus(message = '', kind = '') {
  const box = $('#monster-defence-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function templateHtml(template) {
  const defence = template.defence || { storedDefence: 0, armor: { name: '', defence: 0, notes: '' } };
  const effective = Math.min(100, Number(defence.storedDefence || 0));
  return `<article class="stack-item" style="display:block" data-monster-defence-template="${escapeHtml(template.id)}">
    <div class="panel-heading">
      <div><div class="row-inline"><h4>${escapeHtml(template.name)}</h4><span class="tag">D100 Defence ${escapeHtml(effective)}</span><span class="tag">Armor ${escapeHtml(defence.armor?.defence ?? 0)}</span></div><p class="muted">Template values snapshot when a new Monster Instance is spawned.</p></div>
    </div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Stored Defence</span><input class="input" data-template-stored-defence type="number" min="0" step="1" value="${escapeHtml(defence.storedDefence ?? 0)}"></label>
      <label class="field"><span>Armor Name</span><input class="input" data-template-armor-name maxlength="160" value="${escapeHtml(defence.armor?.name || '')}" placeholder="e.g. Thick Hide"></label>
      <label class="field"><span>Armor Defence</span><input class="input" data-template-armor-defence type="number" min="0" step="1" value="${escapeHtml(defence.armor?.defence ?? 0)}"></label>
      <label class="field"><span>Armor Notes</span><input class="input" data-template-armor-notes maxlength="5000" value="${escapeHtml(defence.armor?.notes || '')}"></label>
    </div>
    <p class="muted">Stored Defence may exceed 100 and does not Level-scale. With no modifier, Effective D100 Defence is capped at 100. Armor Defence is not added to the D100 check.</p>
    <div class="form-actions"><button class="button button-small" type="button" data-defence-action="save-template" data-template-id="${escapeHtml(template.id)}">Save Defence / Armor</button></div>
  </article>`;
}

function instanceHtml(instance) {
  const defence = instance.defence || {
    storedDefence: 0,
    modifier: 0,
    modifiedDefence: 0,
    effectiveD100Defence: 0,
    armor: { name: '', baseDefence: 0, adjustment: 0, finalDefence: 0, notes: '' }
  };
  return `<article class="stack-item" style="display:block" data-monster-defence-instance="${escapeHtml(instance.id)}">
    <div class="panel-heading">
      <div><div class="row-inline"><h4>${escapeHtml(instance.displayName)}</h4><span class="tag">Lv ${escapeHtml(instance.level)}</span><span class="tag">D100 ${escapeHtml(defence.effectiveD100Defence)}</span><span class="tag">Armor ${escapeHtml(defence.armor?.finalDefence ?? 0)}</span></div><p>${escapeHtml(instance.templateName || '')} · ${escapeHtml(instance.encounterName || instance.encounterId || '')}</p></div>
    </div>
    <div class="form-grid compact-grid">
      <label class="field"><span>Stored Defence Snapshot</span><input class="input" value="${escapeHtml(defence.storedDefence)}" disabled></label>
      <label class="field"><span>Defence Modifier</span><input class="input" data-instance-defence-modifier type="number" step="1" value="${escapeHtml(defence.modifier)}"></label>
      <label class="field"><span>Effective D100 Defence</span><input class="input" value="${escapeHtml(defence.effectiveD100Defence)}" disabled></label>
      <label class="field"><span>Armor Name Snapshot</span><input class="input" value="${escapeHtml(defence.armor?.name || 'None')}" disabled></label>
      <label class="field"><span>Armor Base Defence</span><input class="input" value="${escapeHtml(defence.armor?.baseDefence ?? 0)}" disabled></label>
      <label class="field"><span>Armor Defence Adjustment</span><input class="input" data-instance-armor-adjustment type="number" step="1" value="${escapeHtml(defence.armor?.adjustment ?? 0)}"></label>
      <label class="field"><span>Final Armor Defence</span><input class="input" value="${escapeHtml(defence.armor?.finalDefence ?? 0)}" disabled></label>
      <label class="field"><span>Armor Notes Snapshot</span><input class="input" value="${escapeHtml(defence.armor?.notes || '')}" disabled></label>
    </div>
    <div class="form-actions"><button class="button button-small" type="button" data-defence-action="save-instance" data-instance-id="${escapeHtml(instance.id)}">Save Runtime Adjustments</button></div>
  </article>`;
}

function render() {
  if (!ensurePanel()) return;
  const templates = defenceState?.templates || [];
  const instances = defenceState?.instances || [];
  $('#monster-template-defence-list').innerHTML = templates.length
    ? templates.map(templateHtml).join('')
    : emptyState('No Monster Templates', 'Create a Monster Template first.');
  $('#monster-instance-defence-list').innerHTML = instances.length
    ? instances.map(instanceHtml).join('')
    : emptyState('No Monster Instances', 'Spawn a Monster Instance to snapshot Defence / Armor data.');
}

async function loadDefenceArmor({ quiet = false } = {}) {
  if (!ensurePanel()) return;
  if (!quiet) setStatus('Loading Monster Defence / Armor…');
  try {
    defenceState = await api('/api/gm/monsters');
    render();
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function handlePanelClick(event) {
  const button = event.target.closest?.('[data-defence-action]');
  if (!button) return;
  button.disabled = true;
  try {
    if (button.dataset.defenceAction === 'save-template') {
      const id = button.dataset.templateId;
      const row = document.querySelector(`[data-monster-defence-template="${CSS.escape(id)}"]`);
      await api(`/api/gm/monster-templates/${encodeURIComponent(id)}/defence-armor`, {
        method: 'PATCH',
        body: JSON.stringify({
          storedDefence: Number(row.querySelector('[data-template-stored-defence]')?.value),
          armorName: row.querySelector('[data-template-armor-name]')?.value || '',
          armorDefence: Number(row.querySelector('[data-template-armor-defence]')?.value),
          armorNotes: row.querySelector('[data-template-armor-notes]')?.value || ''
        })
      });
      toast('Monster Template Defence / Armor updated.', 'success');
    } else if (button.dataset.defenceAction === 'save-instance') {
      const id = button.dataset.instanceId;
      const row = document.querySelector(`[data-monster-defence-instance="${CSS.escape(id)}"]`);
      await api(`/api/gm/monster-instances/${encodeURIComponent(id)}/defence-armor`, {
        method: 'PATCH',
        body: JSON.stringify({
          defenceModifier: Number(row.querySelector('[data-instance-defence-modifier]')?.value),
          armorDefenceAdjustment: Number(row.querySelector('[data-instance-armor-adjustment]')?.value)
        })
      });
      toast('Monster Instance Defence / Armor adjusted.', 'success');
    }
    await loadDefenceArmor({ quiet: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function boot() {
  if (!ensurePanel()) {
    setTimeout(boot, 100);
    return;
  }
  document.addEventListener('click', event => {
    if (event.target.closest?.('#monster-side-link')) queueMicrotask(() => loadDefenceArmor({ quiet: true }));
  });
  if (location.hash === '#monsters') queueMicrotask(() => loadDefenceArmor());
}

boot();
