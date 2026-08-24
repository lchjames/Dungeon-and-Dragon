const form = document.querySelector('#gm-provision-form');
const tokenInput = document.querySelector('#gm-provision-token');
const submitButton = document.querySelector('#gm-provision-submit');
const statusBox = document.querySelector('#gm-provision-status');

function setStatus(message = '', kind = '') {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.className = `auth-status${kind ? ` auth-status-${kind}` : ''}`;
  statusBox.hidden = !message;
}

async function provision(token) {
  const response = await fetch('/api/admin/provision-initial-gm', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token })
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  if (!response.ok) {
    const error = new Error(payload?.error?.message || '暫時無法完成 GM provisioning。');
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const token = String(tokenInput?.value || '');
  if (token.length < 24) {
    setStatus('Provisioning Token 至少需要 24 個字元。', 'error');
    return;
  }

  submitButton.disabled = true;
  setStatus('正在驗證並建立第一個 GM…');

  try {
    const payload = await provision(token);
    if (tokenInput) tokenInput.value = '';
    setStatus(
      payload.alreadyGM
        ? '目前 User 已經有 GM 權限，正在開啟 GM Workspace…'
        : '第一個 GM 已建立，正在開啟 GM Workspace…',
      'success'
    );
    location.replace('/gm/');
  } catch (error) {
    let message = error.message || '暫時無法完成 GM provisioning。';
    if (error.code === 'PROVISION_SECRET_NOT_CONFIGURED') {
      message = 'Worker Secret INITIAL_GM_PROVISION_TOKEN 尚未配置。';
    }
    if (error.code === 'INITIAL_GM_ALREADY_PROVISIONED') {
      message = '系統已經存在 GM / admin；初始 bootstrap 已關閉。';
    }
    setStatus(message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});
