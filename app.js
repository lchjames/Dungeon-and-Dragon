(function () {
  const DB_KEY = 'vault-v3.2'; let db = loadDB();
  function loadDB() { try { return JSON.parse(localStorage.getItem(DB_KEY)) || { characters: [] } } catch { return { characters: [] } } }
  function saveDB() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function byId(id) { return document.getElementById(id); }

  function render() {
    const grid = byId('characters-grid'); if (!grid) return;
    grid.innerHTML = '';
    const q = (byId('char-search')?.value || '').toLowerCase().trim();
    db.characters
      .filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.job || '').toLowerCase().includes(q))
      .forEach(c => {
        const node = byId('tpl-card').content.firstElementChild.cloneNode(true);
        node.querySelector('[data-name]').textContent = c.name || '';
        node.querySelector('[data-id]').textContent = c.id || '';
        node.querySelector('[data-job]').textContent = c.job || '';
        node.querySelector('[data-edit]').onclick = () => openEditor(c.id);
        grid.appendChild(node);
      });
    if (!grid.children.length) {
      const p = document.createElement('p'); p.className = 'muted'; p.textContent = '（沒有角色）'; grid.appendChild(p);
    }
  }

  function openEditor(id) {
    const dlg = byId('char-dialog'), f = byId('char-form'); if (!dlg || !f) return;
    let c = db.characters.find(x => x.id === id) || { id: 'C_' + Math.random().toString(36).slice(2, 8), name: '', job: '' };
    f.id.value = c.id; f.name.value = c.name; f.job.value = c.job;
    byId('delete-character').onclick = () => {
      if (!confirm('確定刪除此角色？')) return;
      db.characters = db.characters.filter(x => x.id !== c.id); saveDB(); dlg.close(); render();
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      c = { id: f.id.value, name: f.name.value, job: f.job.value };
      const i = db.characters.findIndex(x => x.id === c.id);
      if (i >= 0) db.characters[i] = c; else db.characters.push(c);
      saveDB(); dlg.close(); render();
    };
    dlg.showModal();
  }

  function bindAlways() {
    // Login area
    const btnLogin = byId('btn-login'), inputUser = byId('login-user'), inputPass = byId('login-pass');
    async function doLogin() {
      try {
        const u = (inputUser?.value || '').trim(), p = inputPass?.value || '';
        if (!u || !p) { alert('請輸入用戶名與密碼'); return; }
        await Auth.login(u, p);
        boot();        // 成功後進入 app
      } catch (err) { alert(err?.message || err); }
    }
    btnLogin?.addEventListener('click', doLogin);
    [inputUser, inputPass].forEach(el => el?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } }));
  }

  function boot() {
    // 顯示登入者
    const s = Auth.current();
    if (!s) { show('#login'); return; }
    byId('whoami').textContent = `${s.username}（${s.role === 'admin' ? '管理員' : '玩家'}）`;

    // 綁定基本導航
    document.querySelectorAll('[data-route]').forEach(a => a.onclick = (e) => { e.preventDefault(); const h = a.getAttribute('href'); history.pushState({}, '', h); show(h); });

    // 綁定功能
    byId('logout').onclick = () => Auth.logout();
    byId('add-character')?.addEventListener('click', () => openEditor(null));
    byId('char-search')?.addEventListener('input', render);

    // Excel 匯入（同名 upsert）
    byId('excel-import')?.addEventListener('change', async e => {
      const file = e.target.files?.[0]; if (!file) return;
      const hud = byId('excel-status'); try {
        hud.textContent = '載入中…';
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const name = String((rows[1] || [])[1] || '').trim();
        const job = String((rows[2] || [])[1] || '').trim();
        if (!name) throw new Error('找不到姓名（預期第2行第2列）');
        const idx = db.characters.findIndex(c => (c.name || '').toLowerCase() === name.toLowerCase());
        if (idx >= 0) {
          const id = db.characters[idx].id;
          db.characters[idx] = { ...db.characters[idx], id, name, job };
          hud.textContent = '更新完成：' + name;
        } else {
          db.characters.push({ id: 'C_' + Math.random().toString(36).slice(2, 8), name, job });
          hud.textContent = '新增完成：' + name;
        }
        saveDB(); render();
      } catch (err) { hud.textContent = '錯誤：' + (err?.message || err); }
      finally { e.target.value = ''; setTimeout(() => { if (hud.textContent.startsWith('新增') || hud.textContent.startsWith('更新')) hud.textContent = ''; }, 3000); }
    });

    // 初始渲染
    if (db.characters.length === 0) { db.characters.push({ id: 'C_demo', name: '銀狼', job: '戰士' }); saveDB(); }
    show(location.hash || '#characters');
    render();
  }

  function show(hash) {
    const key = (hash || '#login').replace('#', '');
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    (document.getElementById('page-' + key) || document.getElementById('page-login')).classList.remove('hidden');
  }

  // 重要：確保登入事件一定會綁定
  document.addEventListener('DOMContentLoaded', () => {
    bindAlways();
    const s = Auth.current();
    if (s) boot(); else show('#login');
    byId('year').textContent = new Date().getFullYear();
  });
})();