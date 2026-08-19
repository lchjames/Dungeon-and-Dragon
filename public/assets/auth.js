const form = document.querySelector('[data-auth-form]');
const statusBox = document.querySelector('[data-auth-status]');
const submitButton = form?.querySelector('button[type="submit"]');
const mode = document.body.dataset.authPage;

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

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const message = payload?.error?.message || '暫時無法完成要求，請稍後再試。';
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
    if (mode === 'register') {
      const password = String(data.get('password') || '');
      const confirmPassword = String(data.get('confirmPassword') || '');
      if (password !== confirmPassword) throw new Error('兩次輸入嘅密碼並唔一致。');
      if (password.length < 12) throw new Error('密碼最少需要 12 個字元。');

      await postJson('/api/auth/register', {
        username: data.get('username'),
        displayName: data.get('displayName'),
        password
      });
    } else {
      await postJson('/api/auth/login', {
        username: data.get('username'),
        password: data.get('password')
      });
    }

    setStatus(mode === 'register' ? '帳戶已建立，正在進入玩家頁面…' : '登入成功，正在進入玩家頁面…', 'success');
    location.replace(safeNext());
  } catch (error) {
    setStatus(error.message || '暫時無法完成要求。', 'error');
  } finally {
    submitButton.disabled = false;
  }
});
