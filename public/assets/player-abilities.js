import { $, escapeHtml, toast } from './common.js';

const ATTRIBUTE_ORDER = ['PHYSICAL','LIGHT','DARK','FIRE','WATER','WIND','EARTH','LIGHTNING','WOOD'];
const LABELS = { PHYSICAL: '物理', LIGHT: '光', DARK: '暗', FIRE: '火', WATER: '水', WIND: '風', EARTH: '土', LIGHTNING: '雷', WOOD: '木' };
let characterId = '';
let activeFilter = 'ALL';
let rendering = false;
let scheduled = false;

async function api(url) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(payload?.error?.message || 'Unable to load Abilities.');
  return payload;
}

function statusLabel(ability) {
  if (ability.usability?.status === 'USABLE') return '<span class="tag tag-accent">可使用</span>';
  if (ability.usability?.status === 'UNRESOLVED') return '<span class="tag">待判定</span>';
  return '<span class="tag">不可使用</span>';
}

function reasonText(ability) {
  const reasons = [...(ability.usability?.blockers || []), ...(ability.usability?.unresolved || [])];
  return reasons.map(reason => reason.message).filter(Boolean).join(' · ');
}

function renderProgression(progression = []) {
  const map = new Map(progression.map(row => [row.attributeType, row]));
  return `<div class="row-inline" style="flex-wrap:wrap;margin-bottom:1rem">${ATTRIBUTE_ORDER.map(type => {
    const row = map.get(type) || { rank: 0, progressionExp: 0 };
    return `<span class="tag">${LABELS[type]} ${escapeHtml(row.rank)}階 · 修習 ${escapeHtml(row.progressionExp)} / ?</span>`;
  }).join('')}</div>`;
}

function abilityCard(ability) {
  const rank = ability.rankCode ? (ability.rankCode === 'SPECIAL' ? 'SPECIAL' : `${ability.rankCode}階`) : '未分類';
  const source = ability.grantSourceName || ability.grantSourceType || ability.acquisitionMode || '';
  const reason = reasonText(ability);
  return `<article class="stack-item">
    <div>
      <div class="row-inline"><h4>${escapeHtml(ability.canonicalNameZh || ability.name)}</h4><span class="tag">${escapeHtml(rank)}</span><span class="tag">${escapeHtml(ability.abilityType || 'ABILITY')}</span>${statusLabel(ability)}</div>
      <p>${escapeHtml(ability.descriptionZh || ability.description || '暫無說明')}</p>
      ${reason ? `<p class="muted">${escapeHtml(reason)}</p>` : ''}
      ${source ? `<small class="muted">取得來源：${escapeHtml(source)}</small>` : ''}
    </div>
  </article>`;
}

function render(payload) {
  const target = $('#ability-list');
  if (!target) return;
  const abilities = payload?.abilities || [];
  const filters = `<div class="row-inline" style="flex-wrap:wrap;margin-bottom:1rem">
    ${['ALL', ...ATTRIBUTE_ORDER].map(type => `<button class="button button-small ${activeFilter === type ? '' : 'button-ghost'}" type="button" data-ability-filter="${type}">${type === 'ALL' ? '全部' : LABELS[type]}</button>`).join('')}
  </div>`;
  const visible = activeFilter === 'ALL' ? abilities : abilities.filter(item => item.attributeType === activeFilter);
  const grouped = [];
  for (const type of ATTRIBUTE_ORDER) {
    const rows = visible.filter(item => item.attributeType === type);
    if (rows.length) grouped.push(`<section><div class="panel-heading"><h4>${LABELS[type]}</h4></div><div class="stack-list">${rows.map(abilityCard).join('')}</div></section>`);
  }
  const legacy = visible.filter(item => !item.attributeType || item.classificationStatus === 'NEEDS_CLASSIFICATION');
  if (legacy.length) grouped.push(`<section><div class="panel-heading"><h4>待 GM 分類（Legacy）</h4></div><div class="stack-list">${legacy.map(abilityCard).join('')}</div></section>`);
  target.innerHTML = `${renderProgression(payload?.abilityProgression)}${filters}${grouped.join('') || '<p class="muted">目前沒有已取得的能力。</p>'}`;
  target.querySelectorAll('[data-ability-filter]').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.abilityFilter;
    render(payload);
  }));
}

async function refresh() {
  if (!characterId || rendering) return;
  rendering = true;
  try {
    const payload = await api(`/api/player/characters/${encodeURIComponent(characterId)}/abilities`);
    if (payload) render(payload);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setTimeout(() => { rendering = false; }, 0);
  }
}

function scheduleRefresh() {
  if (scheduled || rendering || !characterId) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await refresh();
  });
}

document.addEventListener('click', event => {
  const card = event.target.closest?.('[data-character-id]');
  if (card?.dataset.characterId) {
    characterId = card.dataset.characterId;
    activeFilter = 'ALL';
  }
  const tab = event.target.closest?.('[data-tab="abilities"]');
  if (tab) scheduleRefresh();
}, true);

const target = $('#ability-list');
if (target) new MutationObserver(() => scheduleRefresh()).observe(target, { childList: true });
