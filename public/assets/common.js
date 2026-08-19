export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function formatDate(timestamp) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp));
}

export function toast(message, tone = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }

  const item = document.createElement('div');
  item.className = `toast toast-${tone}`;
  item.textContent = message;
  host.appendChild(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 180);
  }, 2600);
}

export function downloadText(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function setActiveNav(route) {
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.classList.toggle('active', link.dataset.nav === route);
  });
}

export function openDialog(dialog) {
  if (dialog?.showModal) dialog.showModal();
}

export function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

export function fileToDataUrl(file, maxBytes = 1_500_000) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    if (file.size > maxBytes) return reject(new Error('Image is too large. Keep it under 1.5 MB.'));
    if (!file.type.startsWith('image/')) return reject(new Error('Only image files are supported.'));

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

export function confirmAction(message) {
  return globalThis.confirm(message);
}

export function bindThemeToggle(button) {
  const key = 'dnd-ui-theme';
  const saved = localStorage.getItem(key);
  if (saved === 'light') document.documentElement.dataset.theme = 'light';

  const updateLabel = () => {
    if (!button) return;
    const light = document.documentElement.dataset.theme === 'light';
    button.textContent = light ? '🌙' : '☀️';
    button.setAttribute('aria-label', light ? 'Use dark theme' : 'Use light theme');
  };

  updateLabel();
  button?.addEventListener('click', () => {
    const light = document.documentElement.dataset.theme === 'light';
    if (light) {
      delete document.documentElement.dataset.theme;
      localStorage.setItem(key, 'dark');
    } else {
      document.documentElement.dataset.theme = 'light';
      localStorage.setItem(key, 'light');
    }
    updateLabel();
  });
}

export function emptyState(title, body, actionLabel = '', actionId = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">◇</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
      ${actionLabel ? `<button class="button" id="${escapeHtml(actionId)}">${escapeHtml(actionLabel)}</button>` : ''}
    </div>`;
}
