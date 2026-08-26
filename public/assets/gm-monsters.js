import { $, $$, escapeHtml, toast, emptyState } from './common.js';

const ATTRIBUTE_KEYS = ['STR', 'DEX', 'CON', 'POW', 'INT', 'SIZ'];
let monsterState = null;
let monsterLoaded = false;
let monsterCombatTimer = null;

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
    location.replace(`/gm/login/?next=${encodeURIComponent('/gm/#monsters')}`);
    throw new Error('Session expired.');
  }
  if (!response.ok) throw new Error(payload?.error?.message || 'Request failed.');
  return payload;
}

function setStatus(message = '', kind = '') {
  const box = $('#monster-status');
  if (!box) return;
  box.textContent = message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.hidden = !message;
}

function attributeCreateFields() {
  return ATTRIBUTE_KEYS.map(key => `
    <fieldset class="panel" style="padding:12px">
      <legend><strong>${key}</strong></legend>
      <div class="form-grid compact-grid">
        <label class="field"><span>Min</span><input class="input" data-new-template-${key.toLowerCase()}-min type="number" min="0" step="1" value="8"></label>
        <label class="field"><span>Max</span><input class="input" data-new-template-${key.toLowerCase()}-max type="number" min="0" step="1" value="12"></label>
        <label class="field"><span>Growth Weight</span><input class="input" data-new-template-${key.toLowerCase()}-weight type="number" min="0" step="0.1" value="1"></label>
      </div>
    </fieldset>`).join('');
}

function monsterMarkup() {
  return `
    <div class="section-heading">
      <div><p class="eyebrow">MONSTER RUNTIME</p><h2>Simplified Monsters</h2><p class="muted">D1-authoritative Templates, Common Skills and spawned Instances. Player → Monster defence is intentionally not enabled until its Canonical source is confirmed.</p></div>
      <button id="monster-refresh" class="button button-small button-ghost" type="button">Refresh</button>
    </div>
    <div id="monster-status" class="auth-status" hidden role="status" aria-live="polite"></div>

    <section class="panel">
      <div class="panel-heading"><div><h3>Common Monster Skill Library</h3><span class="muted">Reusable Skill Profiles; Stored Accuracy does not Level-scale.</span></div></div>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input id="monster-new-skill-name" class="input" maxlength="120" placeholder="e.g. Bite"></label>
        <label class="field"><span>Stored Accuracy</span><input id="monster-new-skill-accuracy" class="input" type="number" min="0" step="1" value="60"></label>
        <label class="field"><span>Template Base Damage</span><input id="monster-new-skill-damage" class="input" type="number" min="0" step="1" value="5"></label>
        <label class="field"><span>Damage Growth Weight</span><input id="monster-new-skill-growth" class="input" type="number" min="0" step="0.1" value="1"></label>
        <label class="field"><span>Damage Type</span><input id="monster-new-skill-type" class="input" value="physical" maxlength="80"></label>
        <label class="field"><span>Range / Reach</span><input id="monster-new-skill-range" class="input" maxlength="300" placeholder="e.g. adjacent"></label>
        <label class="field"><span>Targeting</span><input id="monster-new-skill-targeting" class="input" maxlength="300" value="single target"></label>
        <label class="field"><span>MP Cost</span><input id="monster-new-skill-mp" class="input" type="number" min="0" step="1" value="0"></label>
      </div>
      <div class="field"><span>Damage Attribute Links</span><div class="row-inline wrap">${ATTRIBUTE_KEYS.map(key => `<label><input type="checkbox" data-new-skill-link value="${key}"> ${key}</label>`).join('')}</div></div>
      <div class="form-actions"><button id="monster-create-skill" class="button" type="button">Create Common Skill</button></div>
      <div id="monster-skill-list" class="stack-list"></div>
    </section>

    <section class="panel">
      <div class="panel-heading"><div><h3>Monster Templates</h3><span class="muted">Six mandatory Attribute ranges + independent Growth Weights.</span></div></div>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input id="monster-new-template-name" class="input" maxlength="120" placeholder="e.g. Cave Wolf"></label>
        <label class="field"><span>Summary</span><input id="monster-new-template-summary" class="input" maxlength="5000"></label>
      </div>
      <div class="split-grid">${attributeCreateFields()}</div>
      <div class="form-actions"><button id="monster-create-template" class="button" type="button">Create Template</button></div>
      <div id="monster-template-list" class="stack-list"></div>
    </section>

    <section class="panel">
      <div class="panel-heading"><div><h3>Spawn Monster Instance</h3><span class="muted">Spawn snapshots Template + Skill values into an open Encounter.</span></div></div>
      <div class="form-grid compact-grid">
        <label class="field"><span>Template</span><select id="monster-spawn-template" class="input"></select></label>
        <label class="field"><span>Encounter</span><select id="monster-spawn-encounter" class="input"></select></label>
        <label class="field"><span>Level</span><input id="monster-spawn-level" class="input" type="number" min="1" max="100" step="1" value="1"></label>
        <label class="field"><span>Display Name (optional)</span><input id="monster-spawn-name" class="input" maxlength="120"></label>
      </div>
      <div class="form-actions"><button id="monster-spawn" class="button" type="button">Spawn Instance</button></div>
      <div id="monster-instance-list" class="stack-list"></div>
    </section>
  `;
}

function ensureMonsterUi() {
  if (!$('#monster-side-link')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'monster-side-link';
    button.className = 'side-link';
    button.dataset.view = 'monsters';
    button.textContent = 'Monsters';
    $('#combat-side-link')?.before(button);
    button.addEventListener('click', showMonsterView);
  }
  if (!$('#view-monsters')) {
    const section = document.createElement('section');
    section.id = 'view-monsters';
    section.className = 'admin-view hidden';
    section.innerHTML = monsterMarkup();
    $('#gm-content')?.append(section);
    $('#monster-refresh')?.addEventListener('click', () => loadMonsters());
    $('#monster-create-skill')?.addEventListener('click', createSkill);
    $('#monster-create-template')?.addEventListener('click', createTemplate);
    $('#monster-spawn')?.addEventListener('click', spawnMonster);
    $('#view-monsters')?.addEventListener('click', handleMonsterClick);
  }
  ensureMonsterCombatUi();
}

function ensureMonsterCombatUi() {
  if ($('#gm-monster-turn-panel')) return;
  const panel = document.createElement('section');
  panel.id = 'gm-monster-turn-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <div class="panel-heading"><div><h3>Monster Turn</h3><span class="muted">GM chooses the snapshotted Skill and Character target. No AI selection.</span></div><button id="gm-refresh-monster-turn" class="button button-small button-ghost" type="button">Refresh</button></div>
    <div id="gm-monster-turn-summary" class="tool-result muted">No Monster Turn.</div>
    <div id="gm-monster-turn-controls" class="form-grid compact-grid hidden">
      <label class="field"><span>Monster Skill</span><select id="gm-monster-turn-skill" class="input"></select></label>
      <label class="field"><span>Character Target</span><select id="gm-monster-turn-target" class="input"></select></label>
    </div>
    <div class="form-actions"><button id="gm-monster-attack" class="button" type="button" disabled>Resolve Monster Attack</button></div>
    <div id="gm-monster-attack-result" class="tool-result muted">No Monster attack resolved yet.</div>`;
  $('#view-combat')?.append(panel);
  $('#gm-refresh-monster-turn')?.addEventListener('click', () => loadMonsterCombat());
  $('#gm-monster-turn-skill')?.addEventListener('change', refreshMonsterAttackButton);
  $('#gm-monster-turn-target')?.addEventListener('change', refreshMonsterAttackButton);
  $('#gm-monster-attack')?.addEventListener('click', resolveMonsterAttack);
}

function showMonsterView() {
  ensureMonsterUi();
  $$('.side-link').forEach(button => button.classList.toggle('active', button.id === 'monster-side-link'));
  $$('.admin-view').forEach(section => section.classList.add('hidden'));
  $('#view-monsters')?.classList.remove('hidden');
  if ($('#view-title')) $('#view-title').textContent = 'Monsters';
  history.replaceState(null, '', '#monsters');
  loadMonsters({ quiet: monsterLoaded });
}

function skillLinks(container) {
  return $$('[data-skill-link]:checked', container).map(input => input.value);
}

function renderSkill(skill) {
  return `<article class="stack-item" style="display:block" data-monster-skill-row="${escapeHtml(skill.id)}">
    <div class="panel-heading"><div><div class="row-inline"><h4>${escapeHtml(skill.name)}</h4><span class="status-pill">${skill.isActive ? 'active' : 'inactive'}</span><span class="tag">Acc ${escapeHtml(skill.storedAccuracy)}</span></div><p>Base ${escapeHtml(skill.templateBaseDamage)} · Growth ${escapeHtml(skill.damageGrowthWeight)} · Links ${escapeHtml((skill.damageAttributeLinks || []).join(', ') || 'none')}</p></div></div>
    <details><summary>Edit Common Skill</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-skill-name value="${escapeHtml(skill.name)}"></label>
        <label class="field"><span>Stored Accuracy</span><input class="input" data-skill-accuracy type="number" min="0" step="1" value="${escapeHtml(skill.storedAccuracy)}"></label>
        <label class="field"><span>Template Base Damage</span><input class="input" data-skill-damage type="number" min="0" step="1" value="${escapeHtml(skill.templateBaseDamage)}"></label>
        <label class="field"><span>Damage Growth Weight</span><input class="input" data-skill-growth type="number" min="0" step="0.1" value="${escapeHtml(skill.damageGrowthWeight)}"></label>
        <label class="field"><span>Damage Type</span><input class="input" data-skill-type value="${escapeHtml(skill.damageType)}"></label>
        <label class="field"><span>Range / Reach</span><input class="input" data-skill-range value="${escapeHtml(skill.rangeText || '')}"></label>
        <label class="field"><span>Targeting</span><input class="input" data-skill-targeting value="${escapeHtml(skill.targetingText || '')}"></label>
        <label class="field"><span>MP Cost</span><input class="input" data-skill-mp type="number" min="0" step="1" value="${escapeHtml(skill.mpCost)}"></label>
      </div>
      <div class="row-inline wrap">${ATTRIBUTE_KEYS.map(key => `<label><input type="checkbox" data-skill-link value="${key}" ${(skill.damageAttributeLinks || []).includes(key) ? 'checked' : ''}> ${key}</label>`).join('')}</div>
      <label class="row-inline"><input data-skill-active type="checkbox" ${skill.isActive ? 'checked' : ''}> Active</label>
      <div class="form-actions"><button class="button button-small" type="button" data-monster-action="save-skill" data-skill-id="${escapeHtml(skill.id)}">Save Skill</button></div>
    </details>
  </article>`;
}

function templateAttributesHtml(template) {
  return ATTRIBUTE_KEYS.map(key => {
    const value = template.attributes[key];
    return `<fieldset class="panel" style="padding:12px"><legend><strong>${key}</strong></legend><div class="form-grid compact-grid">
      <label class="field"><span>Min</span><input class="input" data-template-${key.toLowerCase()}-min type="number" min="0" step="1" value="${escapeHtml(value.min)}"></label>
      <label class="field"><span>Max</span><input class="input" data-template-${key.toLowerCase()}-max type="number" min="0" step="1" value="${escapeHtml(value.max)}"></label>
      <label class="field"><span>Weight</span><input class="input" data-template-${key.toLowerCase()}-weight type="number" min="0" step="0.1" value="${escapeHtml(value.growthWeight)}"></label>
    </div></fieldset>`;
  }).join('');
}

function renderTemplate(template) {
  const skills = monsterState?.skills || [];
  return `<article class="stack-item" style="display:block" data-monster-template-row="${escapeHtml(template.id)}">
    <div class="panel-heading"><div><div class="row-inline"><h4>${escapeHtml(template.name)}</h4><span class="status-pill">${template.isActive ? 'active' : 'inactive'}</span><span class="tag">${template.skillIds.length} Skills</span></div><p>${escapeHtml(template.summary || 'No summary')}</p></div></div>
    <details><summary>Edit Template / Skill Loadout</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>Name</span><input class="input" data-template-name value="${escapeHtml(template.name)}"></label>
        <label class="field"><span>Summary</span><input class="input" data-template-summary value="${escapeHtml(template.summary || '')}"></label>
      </div>
      <div class="split-grid">${templateAttributesHtml(template)}</div>
      <label class="row-inline"><input data-template-active type="checkbox" ${template.isActive ? 'checked' : ''}> Active</label>
      <div class="form-actions"><button class="button button-small" type="button" data-monster-action="save-template" data-template-id="${escapeHtml(template.id)}">Save Template</button></div>
      <div class="field"><span>Common Skill Loadout</span><div class="stack-list">${skills.length ? skills.map(skill => `<label class="row-inline"><input type="checkbox" data-template-skill value="${escapeHtml(skill.id)}" ${template.skillIds.includes(skill.id) ? 'checked' : ''} ${skill.isActive ? '' : 'disabled'}><span>${escapeHtml(skill.name)} · Acc ${escapeHtml(skill.storedAccuracy)}${skill.isActive ? '' : ' · inactive'}</span></label>`).join('') : '<p class="muted">Create Common Skills first.</p>'}</div></div>
      <div class="form-actions"><button class="button button-small button-ghost" type="button" data-monster-action="save-template-skills" data-template-id="${escapeHtml(template.id)}">Save Skill Loadout</button></div>
    </details>
  </article>`;
}

function attrAudit(label, values) {
  return `${label}: ${ATTRIBUTE_KEYS.map(key => `${key} ${values?.[key] ?? '—'}`).join(' · ')}`;
}

function renderInstance(instance) {
  return `<article class="stack-item" style="display:block" data-monster-instance-row="${escapeHtml(instance.id)}">
    <div class="panel-heading"><div><div class="row-inline"><h4>${escapeHtml(instance.displayName)}</h4><span class="status-pill">${escapeHtml(instance.status)}</span><span class="tag">Lv ${escapeHtml(instance.level)}</span>${instance.isElite ? `<span class="tag">Elite +${escapeHtml(instance.eliteBonus)}</span>` : ''}</div><p>${escapeHtml(instance.templateName)} · Encounter ${escapeHtml(instance.encounterName || instance.encounterId)}</p></div></div>
    <p class="muted">Elite Roll ${escapeHtml(instance.eliteRoll)} · ${escapeHtml(attrAudit('Base', instance.baseAttributes))}</p>
    <p class="muted">${escapeHtml(attrAudit('Natural', instance.naturalAttributes))}</p>
    <p class="muted">${escapeHtml(attrAudit('Effective', instance.effectiveAttributes))}</p>
    <details><summary>Resources / Skill Snapshot</summary>
      <div class="form-grid compact-grid">
        <label class="field"><span>HP Max Adjustment</span><input class="input" data-instance-hp-adjust type="number" step="1" value="${escapeHtml(instance.resources.hp.maxAdjustment)}"></label>
        <label class="field"><span>Current HP</span><input class="input" data-instance-hp-current type="number" min="0" max="${escapeHtml(instance.resources.hp.max)}" step="1" value="${escapeHtml(instance.resources.hp.current)}"></label>
        <label class="field"><span>MP Max Adjustment</span><input class="input" data-instance-mp-adjust type="number" step="1" value="${escapeHtml(instance.resources.mp.maxAdjustment)}"></label>
        <label class="field"><span>Current MP</span><input class="input" data-instance-mp-current type="number" min="0" max="${escapeHtml(instance.resources.mp.max)}" step="1" value="${escapeHtml(instance.resources.mp.current)}"></label>
      </div>
      <p class="muted">Calculated HP ${escapeHtml(instance.resources.hp.calculatedMax)} → Final ${escapeHtml(instance.resources.hp.max)} · Calculated MP ${escapeHtml(instance.resources.mp.calculatedMax)} → Final ${escapeHtml(instance.resources.mp.max)}</p>
      <div class="form-actions"><button class="button button-small" type="button" data-monster-action="save-instance-resources" data-instance-id="${escapeHtml(instance.id)}">Correct Resources</button></div>
      <div class="stack-list">${instance.skills.length ? instance.skills.map(skill => `<article class="stack-item compact-item" data-instance-skill-row="${escapeHtml(skill.id)}">
        <div><div class="row-inline"><h4>${escapeHtml(skill.name)}</h4><span class="tag">Acc ${escapeHtml(skill.storedAccuracy)}</span></div><p>Base ${escapeHtml(skill.calculatedBaseDamage)} + Attr ${escapeHtml(skill.damageAttributeBasis)} = Center ${escapeHtml(skill.calculatedDamageCenter)} · Suggested [${escapeHtml(skill.suggestedSpreadMin)}, ${escapeHtml(skill.suggestedSpreadMax)}]</p></div>
        <div class="quantity-editor"><input class="input input-compact" data-instance-spread-min type="number" step="1" value="${escapeHtml(skill.finalSpreadMin)}"><span>to</span><input class="input input-compact" data-instance-spread-max type="number" step="1" value="${escapeHtml(skill.finalSpreadMax)}"><button class="button button-small button-ghost" type="button" data-monster-action="save-spread" data-instance-id="${escapeHtml(instance.id)}" data-skill-id="${escapeHtml(skill.id)}">Save Spread</button></div>
      </article>`).join('') : '<p class="muted">No snapshotted Skills.</p>'}</div>
    </details>
  </article>`;
}

function renderMonsters() {
  const skills = monsterState?.skills || [];
  const templates = monsterState?.templates || [];
  const encounters = monsterState?.encounterCandidates || [];
  const instances = monsterState?.instances || [];
  $('#monster-skill-list').innerHTML = skills.length ? skills.map(renderSkill).join('') : emptyState('No Common Skills', 'Create a reusable Monster Skill.');
  $('#monster-template-list').innerHTML = templates.length ? templates.map(renderTemplate).join('') : emptyState('No Templates', 'Create the first Monster Template.');
  $('#monster-instance-list').innerHTML = instances.length ? instances.map(renderInstance).join('') : emptyState('No Monster Instances', 'Spawn a Template into an open Encounter.');
  $('#monster-spawn-template').innerHTML = '<option value="">Select Template</option>' + templates.filter(item => item.isActive).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  $('#monster-spawn-encounter').innerHTML = '<option value="">Select Encounter</option>' + encounters.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.scenarioName)} → ${escapeHtml(item.sceneName)} → ${escapeHtml(item.name)}</option>`).join('');
}

async function loadMonsters({ quiet = false } = {}) {
  ensureMonsterUi();
  if (!quiet) setStatus('Loading Monster Runtime…');
  try {
    monsterState = await api('/api/gm/monsters');
    monsterLoaded = true;
    renderMonsters();
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function newSkillPayload() {
  return {
    name: $('#monster-new-skill-name')?.value || '',
    storedAccuracy: Number($('#monster-new-skill-accuracy')?.value),
    templateBaseDamage: Number($('#monster-new-skill-damage')?.value),
    damageGrowthWeight: Number($('#monster-new-skill-growth')?.value),
    damageType: $('#monster-new-skill-type')?.value || 'physical',
    rangeText: $('#monster-new-skill-range')?.value || '',
    targetingText: $('#monster-new-skill-targeting')?.value || 'single target',
    mpCost: Number($('#monster-new-skill-mp')?.value || 0),
    damageAttributeLinks: $$('[data-new-skill-link]:checked').map(input => input.value)
  };
}

async function createSkill() {
  try {
    await api('/api/gm/monster-skills', { method: 'POST', body: JSON.stringify(newSkillPayload()) });
    $('#monster-new-skill-name').value = '';
    await loadMonsters({ quiet: true });
    toast('Common Monster Skill created.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

function newTemplatePayload() {
  const attributes = {};
  for (const key of ATTRIBUTE_KEYS) {
    const lower = key.toLowerCase();
    attributes[key] = {
      min: Number(document.querySelector(`[data-new-template-${lower}-min]`)?.value),
      max: Number(document.querySelector(`[data-new-template-${lower}-max]`)?.value),
      growthWeight: Number(document.querySelector(`[data-new-template-${lower}-weight]`)?.value)
    };
  }
  return { name: $('#monster-new-template-name')?.value || '', summary: $('#monster-new-template-summary')?.value || '', attributes };
}

async function createTemplate() {
  try {
    await api('/api/gm/monster-templates', { method: 'POST', body: JSON.stringify(newTemplatePayload()) });
    $('#monster-new-template-name').value = '';
    await loadMonsters({ quiet: true });
    toast('Monster Template created.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function spawnMonster() {
  const templateId = $('#monster-spawn-template')?.value || '';
  const encounterId = $('#monster-spawn-encounter')?.value || '';
  if (!templateId || !encounterId) return toast('Select a Template and Encounter.', 'error');
  try {
    const payload = await api('/api/gm/monster-instances', {
      method: 'POST',
      body: JSON.stringify({ templateId, encounterId, level: Number($('#monster-spawn-level')?.value), displayName: $('#monster-spawn-name')?.value || '' })
    });
    await loadMonsters({ quiet: true });
    toast(`Monster spawned${payload.generated?.isElite ? ` as Elite +${payload.generated.eliteBonus}` : ''}.`, 'success');
  } catch (error) { toast(error.message, 'error'); }
}

function templateEditPayload(container) {
  const attributes = {};
  for (const key of ATTRIBUTE_KEYS) {
    const lower = key.toLowerCase();
    attributes[key] = {
      min: Number(container.querySelector(`[data-template-${lower}-min]`)?.value),
      max: Number(container.querySelector(`[data-template-${lower}-max]`)?.value),
      growthWeight: Number(container.querySelector(`[data-template-${lower}-weight]`)?.value)
    };
  }
  return {
    name: container.querySelector('[data-template-name]')?.value || '',
    summary: container.querySelector('[data-template-summary]')?.value || '',
    isActive: Boolean(container.querySelector('[data-template-active]')?.checked),
    attributes
  };
}

async function handleMonsterClick(event) {
  const button = event.target.closest?.('[data-monster-action]');
  if (!button) return;
  button.disabled = true;
  try {
    const action = button.dataset.monsterAction;
    if (action === 'save-skill') {
      const id = button.dataset.skillId;
      const row = document.querySelector(`[data-monster-skill-row="${CSS.escape(id)}"]`);
      await api(`/api/gm/monster-skills/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: row.querySelector('[data-skill-name]')?.value,
          storedAccuracy: Number(row.querySelector('[data-skill-accuracy]')?.value),
          templateBaseDamage: Number(row.querySelector('[data-skill-damage]')?.value),
          damageGrowthWeight: Number(row.querySelector('[data-skill-growth]')?.value),
          damageType: row.querySelector('[data-skill-type]')?.value,
          rangeText: row.querySelector('[data-skill-range]')?.value,
          targetingText: row.querySelector('[data-skill-targeting]')?.value,
          mpCost: Number(row.querySelector('[data-skill-mp]')?.value || 0),
          damageAttributeLinks: skillLinks(row),
          isActive: Boolean(row.querySelector('[data-skill-active]')?.checked)
        })
      });
      toast('Common Monster Skill updated.', 'success');
    } else if (action === 'save-template') {
      const id = button.dataset.templateId;
      const row = document.querySelector(`[data-monster-template-row="${CSS.escape(id)}"]`);
      await api(`/api/gm/monster-templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(templateEditPayload(row)) });
      toast('Monster Template updated.', 'success');
    } else if (action === 'save-template-skills') {
      const id = button.dataset.templateId;
      const row = document.querySelector(`[data-monster-template-row="${CSS.escape(id)}"]`);
      const skillIds = $$('[data-template-skill]:checked', row).map(input => input.value);
      await api(`/api/gm/monster-templates/${encodeURIComponent(id)}/skills`, { method: 'PUT', body: JSON.stringify({ skillIds }) });
      toast('Template Skill loadout updated.', 'success');
    } else if (action === 'save-instance-resources') {
      const id = button.dataset.instanceId;
      const row = document.querySelector(`[data-monster-instance-row="${CSS.escape(id)}"]`);
      await api(`/api/gm/monster-instances/${encodeURIComponent(id)}/resources`, {
        method: 'PATCH',
        body: JSON.stringify({
          hpMaxAdjustment: Number(row.querySelector('[data-instance-hp-adjust]')?.value || 0),
          currentHp: Number(row.querySelector('[data-instance-hp-current]')?.value || 0),
          mpMaxAdjustment: Number(row.querySelector('[data-instance-mp-adjust]')?.value || 0),
          currentMp: Number(row.querySelector('[data-instance-mp-current]')?.value || 0)
        })
      });
      toast('Monster resources corrected.', 'success');
    } else if (action === 'save-spread') {
      const instanceId = button.dataset.instanceId;
      const skillId = button.dataset.skillId;
      const row = document.querySelector(`[data-instance-skill-row="${CSS.escape(skillId)}"]`);
      await api(`/api/gm/monster-instances/${encodeURIComponent(instanceId)}/skills/${encodeURIComponent(skillId)}/spread`, {
        method: 'PATCH',
        body: JSON.stringify({ min: Number(row.querySelector('[data-instance-spread-min]')?.value), max: Number(row.querySelector('[data-instance-spread-max]')?.value) })
      });
      toast('Instance Skill Spread updated.', 'success');
    }
    await loadMonsters({ quiet: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function refreshMonsterAttackButton() {
  const button = $('#gm-monster-attack');
  if (button) button.disabled = !$('#gm-monster-turn-skill')?.value || !$('#gm-monster-turn-target')?.value;
}

function renderMonsterTurn(payload) {
  const panel = $('#gm-monster-turn-panel');
  const controls = $('#gm-monster-turn-controls');
  const turn = payload?.monsterTurn;
  if (!panel) return;
  panel.classList.toggle('hidden', !turn || turn.unavailable);
  if (!turn || turn.unavailable) {
    controls?.classList.add('hidden');
    if ($('#gm-monster-turn-summary')) $('#gm-monster-turn-summary').textContent = turn?.reason || 'Current Turn is not a Monster Instance.';
    return;
  }
  const instance = turn.instance;
  $('#gm-monster-turn-summary').textContent = `${instance.displayName} · Lv ${instance.level}${instance.isElite ? ` · Elite` : ''} · HP ${instance.hp.current}/${instance.hp.max} · MP ${instance.mp.current}/${instance.mp.max} · Action ${instance.actionAvailable ? 'Ready' : 'Spent'}`;
  controls?.classList.remove('hidden');
  $('#gm-monster-turn-skill').innerHTML = '<option value="">Select Skill</option>' + (turn.skills || []).map(skill => `<option value="${escapeHtml(skill.id)}">${escapeHtml(skill.name)} · Acc ${escapeHtml(skill.storedAccuracy)} · Center ${escapeHtml(skill.calculatedDamageCenter)} · Spread [${escapeHtml(skill.finalSpreadMin)}, ${escapeHtml(skill.finalSpreadMax)}]</option>`).join('');
  $('#gm-monster-turn-target').innerHTML = '<option value="">Select Target</option>' + (turn.targets || []).map(target => `<option value="${escapeHtml(target.combatantId)}">${escapeHtml(target.displayName)} · ${escapeHtml(String(target.lifeState).toUpperCase())}${target.hp ? ` · HP ${escapeHtml(target.hp.current)}/${escapeHtml(target.hp.max)}` : ''}</option>`).join('');
  $('#gm-monster-turn-skill').disabled = !instance.actionAvailable;
  $('#gm-monster-turn-target').disabled = !instance.actionAvailable;
  refreshMonsterAttackButton();
  if (!instance.actionAvailable) $('#gm-monster-attack').disabled = true;
}

async function loadMonsterCombat() {
  ensureMonsterCombatUi();
  try {
    const payload = await api('/api/gm/combat');
    renderMonsterTurn(payload);
  } catch (error) {
    $('#gm-monster-turn-panel')?.classList.add('hidden');
  }
}

function renderMonsterAttackResult(attack) {
  const target = $('#gm-monster-attack-result');
  if (!target || !attack) return;
  const great = attack.attackCheck?.greatSuccess ? ' · Great Success' : attack.attackCheck?.greatFailure ? ' · Great Failure' : '';
  target.textContent = `${attack.hit ? 'HIT' : 'MISS / DEFENDED'} · Attack D100 ${attack.attackCheck?.roll} → Result ${attack.attackCheck?.result}${great} · Dodge D100 ${attack.defenceCheck?.roll} → Result ${attack.defenceCheck?.result}${attack.hit ? ` · Spread ${attack.spreadRoll ?? '—'} · Raw ${attack.damage?.rawDamage ?? '—'} · HP Damage ${attack.damage?.hpDamage ?? 0}` : ''} · Target ${String(attack.target?.lifeStateAfter || '').toUpperCase()}`;
}

async function resolveMonsterAttack() {
  const skillId = $('#gm-monster-turn-skill')?.value || '';
  const targetCombatantId = $('#gm-monster-turn-target')?.value || '';
  if (!skillId || !targetCombatantId) return;
  const combatPayload = await api('/api/gm/combat');
  const combatId = combatPayload?.combat?.id;
  if (!combatId) return toast('No active Combat.', 'error');
  const button = $('#gm-monster-attack');
  button.disabled = true;
  try {
    const payload = await api(`/api/gm/combat/${encodeURIComponent(combatId)}/monster-attack`, {
      method: 'POST', body: JSON.stringify({ skillId, targetCombatantId })
    });
    renderMonsterTurn(payload);
    renderMonsterAttackResult(payload.monsterAttack);
    toast(payload.monsterAttack?.hit ? 'Monster attack hit.' : 'Monster attack defended.', payload.monsterAttack?.hit ? 'success' : 'info');
  } catch (error) {
    toast(error.message, 'error');
    await loadMonsterCombat();
  }
}

function scheduleMonsterCombatRefresh() {
  clearInterval(monsterCombatTimer);
  monsterCombatTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && location.hash === '#combat') loadMonsterCombat();
  }, 5000);
}

ensureMonsterUi();
$('#combat-side-link')?.addEventListener('click', () => queueMicrotask(loadMonsterCombat));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && location.hash === '#combat') loadMonsterCombat();
});
if (location.hash === '#monsters') queueMicrotask(showMonsterView);
if (location.hash === '#combat') queueMicrotask(loadMonsterCombat);
scheduleMonsterCombatRefresh();
