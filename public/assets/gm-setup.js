const form = document.querySelector('#gm-provision-form');
const tokenInput = document.querySelector('#gm-provision-token');
const usernameInput = document.querySelector('#gm-admin-username');
const passwordInput = document.querySelector('#gm-admin-password');
const confirmInput = document.querySelector('#gm-admin-password-confirm');
const submitButton = document.querySelector('#gm-provision-submit');
const statusBox = document.querySelector('#gm-provision-status');

function setStatus(message = '', kind = '') {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  statusBox.hidden = !message;
}

async function provision(token, username, password) {
  const response = await fetch('/api/admin/setup', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, username, password })
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || '暫時無法完成 Admin setup。');
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const token = String(tokenInput?.value || '');
  const username = String(usernameInput?.value || '').trim();
  const password = String(passwordInput?.value || '');
  const confirm = String(confirmInput?.value || '');
  if (token.length < 24) return setStatus('Provisioning Token 至少需要 24 個字元。', 'error');
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) return setStatus('Admin Username 格式不正確。', 'error');
  if (password.length < 12) return setStatus('Admin 密碼至少需要 12 個字元。', 'error');
  if (password !== confirm) return setStatus('兩次輸入嘅 Admin 密碼唔一致。', 'error');

  submitButton.disabled = true;
  setStatus('正在建立獨立 Admin 帳戶…');
  try {
    const payload = await provision(token, username, password);
    if (tokenInput) tokenInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    setStatus(payload.migratedLegacyGM ? '舊 GM 已安全遷移成 Admin，正在開啟 GM 控制台…' : 'Admin 已建立，正在開啟 GM 控制台…', 'success');
    location.replace('/gm/');
  } catch (error) {
    let message = error.message || '暫時無法完成 Admin setup。';
    if (error.code === 'PROVISION_SECRET_NOT_CONFIGURED') message = 'Initial Admin provisioning secret 尚未配置。';
    if (error.code === 'INITIAL_ADMIN_ALREADY_PROVISIONED') message = 'Admin 已存在；請直接使用 Admin Login。';
    setStatus(message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});
