import { $, escapeHtml, toast } from './common.js';

let sourceCharacterId = '';
let sourceCharacter = null;
let sourceSkills = [];
let resistanceCharacter = null;
let resistanceSkills = [];
let characters = [];
let opposedChecks = [];

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

function ensurePanel() {
  if ($('#gm-opposed-d100-panel')) return;
  const basic = $('#gm-basic-skill-check-panel');
  if (!basic) return;
  const panel = document.createElement('section');
  panel.id = 'gm-opposed-d100-panel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h3>Shared Opposed D100</h3>
        <span class="muted">Two canonical Character Basic Skill checks resolve together. Higher Result wins; an exact tie gives resistance priority for negative-effect breakthrough.</span>
      </div>
      <span id="gm-opposed-source-name" class="muted">Open a source Character</span>
    </div>
    <div id="gm-opposed-status" class="auth-status" hidden role="status" aria-live="polite"></div>
    <div class="split-grid">
      <section>
        <h4>Source</h4>
        <div class="form-grid compact-grid">
          <label class="field"><span>Basic Skill</span><select id="gm-opposed-source-skill" class="input" disabled><option value="">Open a Character</option></select></label>
          <label class="field"><span>Total Modifier</span><input id="gm-opposed-source-modifier" class="input" type="number" step="1" value="0"></label>
          <label class="field"><span>Raw D100</span><input id="gm-opposed-source-roll" class="input" type="number" min="1" max="100" step="1" placeholder="blank = server roll"></label>
        </div>
      </section>
      <section>
        <h4>Resistance</h4>
        <div class="form-grid compact-grid">
          <label class="field"><span>Character</span><select id="gm-opposed-resistance-character" class="input" disabled><option value="">Open a source Character</option></select></label>
          <label class="field"><span>Basic Skill</span><select id="gm-opposed-resistance-skill" class="input" disabled><option value="">Select resistance Character</option></select></label>
          <label class="field"><span>Total Modifier</span><input id="gm-opposed-resistance-modifier" class="input" type="number" step="1" value="0"></label>
          <label class="field"><span>Raw D100</span><input id="gm-opposed-resistance-roll" class="input" type="number" min="1" max="100" step="1" placeholder="blank = server roll"></label>
        </div>
      </section>
    </div>
    <label class="field"><span>Meaningful Reason</span><input id="gm-opposed-reason" class="input" maxlength="1000" placeholder="Why this opposed check matters"></label>
    <label class="field"><span>Context JSON (optional)</span><textarea id="gm-opposed-context" class="textarea" rows="2" placeholder='{"sceneRunId":"...","note":"..."}'></textarea></label>
    <div class="form-actions wrap">
      <button id="gm-opposed-resolve" class="button" type="button" disabled>Resolve Both Sides</button>
      <span class="muted">This only resolves D100 comparison. It does not apply damage, control, status, movement or other gameplay effects.</span>
    </div>
    <div id="gm-opposed-result" class="tool-result muted">No opposed check resolved yet.</div>
    <div class="panel-heading"><h4>Recent Opposed Audit</h4><span class="muted">Latest 20 involving source Character · immutable</span></div>
    <div id="gm-opposed-history" class="stack-list"><p class="muted">Open a Character to load history.</p></div>`;
  basic.after(panel);
  $('#gm-opposed-resistance-character')?.addEventListener('change', loadResistance);
  $('#gm-opposed-resolve')?.addEventListener('click', resolveOpposed);
}

function status(message = '', kind = '') {
  const box = $('#gm-opposed-status');
  if (!box) return;
  box.hidden = !message;
  box.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  box.textContent = message;
}

function skillOptions(skills, selected = '') {
  if (!skills.length) return '<option value="">No canonical Basic Skills</option>';
  return skills.map(skill => `<option value="${escapeHtml(skill.key)}"${skill.key === selected ? ' selected' : ''}>${escapeHtml(skill.label)} · Natural ${escapeHtml(skill.naturalValue)}</option>`).join('');
}

function renderSource() {
  const select = $('#gm-opposed-source-skill');
  const resistance = $('#gm-opposed-resistance-character');
  const button = $('#gm-opposed-resolve');
  if (!select || !resistance || !button) return;
  $('#gm-opposed-source-name').textContent = sourceCharacter ? `${sourceCharacter.name} · Source` : 'Open a source Character';
  select.innerHTML = sourceCharacterId ? skillOptions(sourceSkills, select.value) : '<option value="">Open a Character</option>';
  select.disabled = !sourceCharacterId || !sourceSkills.length;
  const current = resistance.value;
  resistance.innerHTML = sourceCharacterId
    ? '<option value="">Select resistance Character</option>' + characters.map(character => `<option value="${escapeHtml(character.id)}">${escapeHtml(character.name)} · ${escapeHtml(character.status || '')}</option>`).join('')
    : '<option value="">Open a source Character</option>';
  if (characters.some(character => character.id === current)) resistance.value = current;
  resistance.disabled = !sourceCharacterId || !characters.length;
  button.disabled = !ready();
}

function renderResistance() {
  const select = $('#gm-opposed-resistance-skill');
  const button = $('#gm-opposed-resolve');
  if (!select || !button) return;
  const current = select.value;
  select.innerHTML = resistanceCharacter ? skillOptions(resistanceSkills, current) : '<option value="">Select resistance Character</option>';
  select.disabled = !resistanceCharacter || !resistanceSkills.length;
  button.disabled = !ready();
}

function ready() {
  return Boolean(sourceCharacterId && sourceSkills.length && resistanceCharacter?.id && resistanceSkills.length);
}

function extremeTag(check) {
  if (check.extremeResult === 'GREAT_SUCCESS') return ' · GREAT SUCCESS';
  if (check.extremeResult === 'GREAT_FAILURE') return ' · GREAT FAILURE';
  return '';
}

function comparisonText(check) {
  if (check.comparison === 'SOURCE_HIGHER') return 'SOURCE HIGHER · strict breakthrough = YES';
  if (check.comparison === 'RESISTANCE_HIGHER') return 'RESISTANCE HIGHER · strict breakthrough = NO';
  return 'TIE · resistance priority · strict breakthrough = NO';
}

function renderResult(check) {
  const target = $('#gm-opposed-result');
  if (!target) return;
  if (!check) {
    target.textContent = 'No opposed check resolved yet.';
    return;
  }
  target.innerHTML = `<strong>${escapeHtml(comparisonText(check))}</strong><br>
    Source: ${escapeHtml(check.source.skillLabel)} · Roll ${escapeHtml(check.source.rawRoll)} · Result ${escapeHtml(check.source.resultValue)}${escapeHtml(extremeTag(check.source))}<br>
    Resistance: ${escapeHtml(check.resistance.skillLabel)} · Roll ${escapeHtml(check.resistance.rawRoll)} · Result ${escapeHtml(check.resistance.resultValue)}${escapeHtml(extremeTag(check.resistance))}<br>
    <span class="muted">Mechanical comparison only; no damage/control/status effect has been applied.</span>`;
}

function renderHistory() {
  const target = $('#gm-opposed-history');
  if (!target) return;
  if (!sourceCharacterId) {
    target.innerHTML = '<p class="muted">Open a Character to load history.</p>';
    return;
  }
  if (!opposedChecks.length) {
    target.innerHTML = '<p class="muted">No opposed D100 audits involving this Character.</p>';
    return;
  }
  target.innerHTML = opposedChecks.map(check => `<article class="stack-item">
    <div>
      <div class="row-inline"><h4>${escapeHtml(check.comparison)}</h4><span class="tag">${check.sourceStrictlyBreaksResistance ? 'Breakthrough' : 'No breakthrough'}</span>${check.resistancePriorityOnTie ? '<span class="tag">Resistance tie priority</span>' : ''}</div>
      <p>Source ${escapeHtml(check.source.skillLabel)}: ${escapeHtml(check.source.rawRoll)} → Result ${escapeHtml(check.source.resultValue)}${escapeHtml(extremeTag(check.source))}</p>
      <p>Resistance ${escapeHtml(check.resistance.skillLabel)}: ${escapeHtml(check.resistance.rawRoll)} → Result ${escapeHtml(check.resistance.resultValue)}${escapeHtml(extremeTag(check.resistance))}</p>
      <p>${escapeHtml(check.meaningfulReason || '')}</p>
    </div>
  </article>`).join('');
}

async function loadBootstrap() {
  const payload = await api('/api/gm/bootstrap');
  characters = payload.characters || [];
}

async function loadCharacterSkills(characterId) {
  const payload = await api(`/api/gm/characters/${encodeURIComponent(characterId)}/basic-skill-checks?limit=1`);
  return { character: payload.character, skills: payload.skills || [] };
}

async function loadHistory() {
  if (!sourceCharacterId) {
    opposedChecks = [];
    renderHistory();
    return;
  }
  const payload = await api(`/api/gm/basic-skill-opposed-checks?characterId=${encodeURIComponent(sourceCharacterId)}&limit=20`);
  opposedChecks = payload.checks || [];
  renderHistory();
}

async function openSource(characterId) {
  ensurePanel();
  sourceCharacterId = characterId || '';
  sourceCharacter = null;
  sourceSkills = [];
  resistanceCharacter = null;
  resistanceSkills = [];
  opposedChecks = [];
  renderSource();
  renderResistance();
  renderHistory();
  renderResult(null);
  if (!sourceCharacterId) return;
  status('Loading opposed D100 authority…');
  try {
    const [bootstrapResult, sourceResult] = await Promise.all([
      loadBootstrap(),
      loadCharacterSkills(sourceCharacterId)
    ]);
    void bootstrapResult;
    sourceCharacter = sourceResult.character;
    sourceSkills = sourceResult.skills;
    renderSource();
    await loadHistory();
    status('');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  }
}

async function loadResistance() {
  const id = $('#gm-opposed-resistance-character')?.value || '';
  resistanceCharacter = null;
  resistanceSkills = [];
  renderResistance();
  if (!id) return;
  status('Loading resistance Character skills…');
  try {
    const result = await loadCharacterSkills(id);
    resistanceCharacter = result.character;
    resistanceSkills = result.skills;
    renderResistance();
    status('');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  }
}

function parseInteger(selector, label, min, max, optional = false) {
  const raw = String($(selector)?.value || '').trim();
  if (optional && !raw) return undefined;
  const value = Number(raw || 0);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} 必須係 ${min}–${max} 整數。`);
  return value;
}

function readContext() {
  const raw = String($('#gm-opposed-context')?.value || '').trim();
  if (!raw) return {};
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Context JSON 格式錯誤。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Context JSON 必須係 object。');
  return value;
}

async function resolveOpposed() {
  if (!ready()) return;
  const reason = String($('#gm-opposed-reason')?.value || '').trim();
  if (!reason) return toast('Meaningful Reason 必填。', 'error');
  let context;
  let sourceModifier;
  let resistanceModifier;
  let sourceRoll;
  let resistanceRoll;
  try {
    context = readContext();
    sourceModifier = parseInteger('#gm-opposed-source-modifier', 'Source modifier', -10000, 10000);
    resistanceModifier = parseInteger('#gm-opposed-resistance-modifier', 'Resistance modifier', -10000, 10000);
    sourceRoll = parseInteger('#gm-opposed-source-roll', 'Source raw D100', 1, 100, true);
    resistanceRoll = parseInteger('#gm-opposed-resistance-roll', 'Resistance raw D100', 1, 100, true);
  } catch (error) {
    return toast(error.message, 'error');
  }
  const body = {
    source: {
      characterId: sourceCharacterId,
      skillKey: $('#gm-opposed-source-skill')?.value || '',
      totalModifier: sourceModifier,
      ...(sourceRoll === undefined ? {} : { rawRoll: sourceRoll })
    },
    resistance: {
      characterId: resistanceCharacter.id,
      skillKey: $('#gm-opposed-resistance-skill')?.value || '',
      totalModifier: resistanceModifier,
      ...(resistanceRoll === undefined ? {} : { rawRoll: resistanceRoll })
    },
    meaningfulReason: reason,
    context
  };
  const button = $('#gm-opposed-resolve');
  button.disabled = true;
  status('Resolving both sides in one D1 transaction…');
  try {
    const payload = await api('/api/gm/basic-skill-opposed-checks', { method: 'POST', body: JSON.stringify(body) });
    $('#gm-opposed-source-roll').value = '';
    $('#gm-opposed-resistance-roll').value = '';
    renderResult(payload.opposedCheck);
    opposedChecks = [payload.opposedCheck, ...opposedChecks].slice(0, 20);
    renderHistory();
    status(`Opposed D100 recorded: ${comparisonText(payload.opposedCheck)}.`, 'success');
    toast('Opposed D100 resolved and audited.', 'success');
  } catch (error) {
    status(error.message, 'error');
    toast(error.message, 'error');
  } finally {
    button.disabled = !ready();
  }
}

function bindLifecycle() {
  ensurePanel();
  document.addEventListener('click', event => {
    const open = event.target.closest?.('[data-open-character]');
    if (open) {
      queueMicrotask(() => openSource(open.dataset.openCharacter || ''));
      return;
    }
    if (event.target.closest?.('#close-gm-character')) {
      openSource('').catch(() => {});
    }
  });
}

bindLifecycle();
