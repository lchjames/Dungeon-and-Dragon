const form = document.querySelector('#admin-login-form');
const usernameInput = document.querySelector('#admin-username');
const passwordInput = document.querySelector('#admin-password');
const submitButton = document.querySelector('#admin-login-submit');
const statusBox = document.querySelector('#admin-auth-status');

function setStatus(message = '', kind = '') {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  statusBox.hidden = !message;
}

function safeNext() {
  const value = new URLSearchParams(location.search).get('next') || '/gm/';
  return (value === '/gm' || value.startsWith('/gm/')) && !value.startsWith('//') ? value : '/gm/';
}

async function login(username, password) {
  const response = await fetch('/api/admin/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Admin 登入失敗。');
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const username = String(usernameInput?.value || '').trim();
  const password = String(passwordInput?.value || '');
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) return setStatus('Admin Username 格式不正確。', 'error');
  if (password.length < 12) return setStatus('Admin 密碼至少需要 12 個字元。', 'error');
  submitButton.disabled = true;
  setStatus('正在驗證 Admin…');
  try {
    await login(username, password);
    if (passwordInput) passwordInput.value = '';
    setStatus('Admin 驗證成功，正在進入 GM 控制台…', 'success');
    location.replace(safeNext());
  } catch (error) {
    if (error.code === 'ADMIN_CREDENTIAL_RESET_REQUIRED') {
      setStatus('呢個係舊 GM 帳戶，需要到 Initial Admin Setup 設定強密碼。', 'error');
    } else {
      setStatus(error.message || 'Admin 登入失敗。', 'error');
    }
  } finally {
    submitButton.disabled = false;
  }
});
