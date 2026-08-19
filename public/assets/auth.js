const form = document.querySelector('[data-auth-form]');
const statusBox = document.querySelector('[data-auth-status]');
const submitButton = form?.querySelector('button[type="submit"]');
const mode = document.body.dataset.authPage;
const encoder = new TextEncoder();

function setStatus(message = '', kind = '') {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  statusBox.hidden = !message;
}

function safeNext() {
  const value = new URLSearchParams(location.search).get('next') || '/player/';
  return value.startsWith('/player/') && !value.startsWith('//') ? value : '/player/';
}

function normaliseUser(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleLowerCase();
}

async function internalUsername(user) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(normaliseUser(user)));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `u_${hex.slice(0, 24)}`;
}

function internalPassword(key) {
  return `dnd-key:${key}`;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    let message = payload?.error?.message || '暫時無法完成要求，請稍後再試。';
    if (payload?.error?.code === 'USERNAME_TAKEN') message = '呢個 User 已經存在。';
    if (payload?.error?.code === 'INVALID_CREDENTIALS') message = 'User 或 Key 不正確。';
    if (payload?.error?.code === 'ACCOUNT_TEMPORARILY_LOCKED') message = 'Key 輸入錯誤次數過多，請稍後再試。';
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  setStatus('');
  submitButton.disabled = true;

  try {
    const data = new FormData(form);
    const user = String(data.get('user') || '').trim().normalize('NFKC');
    const key = String(data.get('key') || '');

    if (!user || user.length > 32) throw new Error('User 必須為 1–32 個字元。');
    if (!/^\d{4}$/.test(key)) throw new Error('Key 必須係 4 位數字。');

    const username = await internalUsername(user);
    const password = internalPassword(key);

    if (mode === 'register') {
      const confirmKey = String(data.get('confirmKey') || '');
      if (key !== confirmKey) throw new Error('兩次輸入嘅 Key 並唔一致。');
      await postJson('/api/auth/register', { username, displayName: user, password });
    } else {
      await postJson('/api/auth/login', { username, password });
    }

    setStatus(mode === 'register' ? '玩家已建立，正在開啟角色頁面…' : 'Key 正確，正在開啟角色…', 'success');
    location.replace(safeNext());
  } catch (error) {
    setStatus(error.message || '暫時無法完成要求。', 'error');
  } finally {
    submitButton.disabled = false;
  }
});
