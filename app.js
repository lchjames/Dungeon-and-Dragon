(function () {
  const DB_KEY = 'vault-v3.2.2'; let db = loadDB();
  function loadDB() { try { return JSON.parse(localStorage.getItem(DB_KEY)) || { characters: [] } } catch { return { characters: [] } } }
  function saveDB() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function byId(id) { return document.getElementById(id); }

  function render() {
    const grid = byId('characters-grid'); if (!grid) return; grid.innerHTML = '';
    const q = (byId('char-search')?.value || '').toLowerCase().trim();
    (db.characters || [])
      .filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.job || '').toLowerCase().includes(q))
      .forEach(c => {
        const node = byId('tpl-card').content.firstElementChild.cloneNode(true);
        node.querySelector('[data-name]').textContent = c.name || '';
        node.querySelector('[data-id]').textContent = c.id || '';
        node.querySelector('[data-job]').textContent = c.job || '';
        node.querySelector('[data-edit]').onclick = () => openEditor(c.id);
        grid.appendChild(node);
      });
    if (!grid.children.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '（沒有角色）'; grid.appendChild(p); }
  }

  function openEditor(id) {
    const dlg = byId('char-dialog'), f = byId('char-form'); if (!dlg || !f) return;
    let c = (db.characters || []).find(x => x.id === id) || { id: 'C_' + Math.random().toString(36).slice(2, 8), name: '', job: '' };
    f.id.value = c.id; f.name.value = c.name; f.job.value = c.job;
    byId('delete-character').onclick = () => {
      if (!confirm('確定刪除此角色？')) return;
      db.characters = db.characters.filter(x => x.id !== c.id); saveDB(); dlg.close(); render();
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      c = { id: f.id.value, name: f.name.value, job: f.job.value };
      const i = (db.characters || []).findIndex(x => x.id === c.id);
      if (i >= 0) db.characters[i] = c; else db.characters.push(c);
      saveDB(); dlg.close(); render();
    };
    dlg.showModal();
  }

  function bindAlways() {
    // Login
    const btnLogin = byId('btn-login'), inputUser = byId('login-user'), inputPass = byId('login-pass');
    async function doLogin() {
      try {
        const u = (inputUser?.value || '').trim(), p = inputPass?.value || '';
        if (!u || !p) { alert('請輸入用戶名與密碼'); return; }
        await Auth.login(u, p); boot();
      } catch (err) { alert(err?.message || err); }
    }
    btnLogin?.addEventListener('click', doLogin);
    [inputUser, inputPass].forEach(el => el?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } }));
  }

  function boot() {
    const s = Auth.current(); if (!s) { show('#login'); return; }
    byId('whoami').textContent = `${s.username}（${s.role === 'admin' ? '管理員' : '玩家'}）`;
    document.querySelectorAll('[data-route]').forEach(a => a.onclick = (e) => { e.preventDefault(); const h = a.getAttribute('href'); history.pushState({}, '', h); show(h); });
    byId('logout').onclick = () => Auth.logout();
    byId('add-character')?.addEventListener('click', () => openEditor(null));
    byId('char-search')?.addEventListener('input', render);

    // Excel import: label-based + upsert
    byId('excel-import')?.addEventListener('change', async e => {
      const file = e.target.files?.[0]; if (!file) return;
      const hud = byId('excel-status');
      try {
        hud.textContent = '載入中…';
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const getSheet = (name) => wb.Sheets[name] || wb.Sheets[Object.keys(wb.Sheets).find(k => k.includes(name)) || ''];
        function pickRight(ws, labels) {
          if (!ws) return '';
          const ref = ws['!ref']; if (!ref) return '';
          const range = XLSX.utils.decode_range(ref);
          for (let r = range.s.r; r <= Math.min(range.e.r, 400); r++) {
            for (let c = range.s.c; c <= Math.min(range.e.c, 80); c++) {
              const addr = XLSX.utils.encode_cell({ r, c });
              const v = String((ws[addr]?.v ?? '')).trim();
              if (!v) continue;
              if (labels.includes(v)) {
                const right = XLSX.utils.encode_cell({ r, c: c + 1 });
                const val = String((ws[right]?.v ?? '')).trim();
                if (val) return val;
              }
            }
          }
          return '';
        }
        const wsChar = getSheet('人物表') || getSheet('人物表(自動計算)') || wb.Sheets[wb.SheetNames[0]];
        const name = pickRight(wsChar, ['探索者姓名', '姓名', '角色名', '名稱']);
        const job = pickRight(wsChar, ['職業', 'Job']);
        if (!name) throw new Error('找不到姓名（請確認表內「探索者姓名」右側有資料）');

        const idx = (db.characters || []).findIndex(c => (c.name || '').trim().toLowerCase() === name.toLowerCase());
        if (idx >= 0) {
          const id = db.characters[idx].id;
          db.characters[idx] = { ...db.characters[idx], id, name, job };
          hud.textContent = '更新完成：' + name;
        } else {
          db.characters.push({ id: 'C_' + Math.random().toString(36).slice(2, 8), name, job });
          hud.textContent = '新增完成：' + name;
        }
        saveDB(); render();
      } catch (err) {
        hud.textContent = '錯誤：' + (err?.message || err);
      } finally {
        e.target.value = '';
        setTimeout(() => { if (hud.textContent.startsWith('新增') || hud.textContent.startsWith('更新')) hud.textContent = ''; }, 3000);
      }
    });

    if ((db.characters || []).length === 0) { db.characters.push({ id: 'C_demo', name: '銀狼', job: '戰士' }); saveDB(); }
    show(location.hash || '#characters'); render();
  }

  function show(hash) {
    const key = (hash || '#login').replace('#', '');
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    (document.getElementById('page-' + key) || document.getElementById('page-login')).classList.remove('hidden');
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindAlways();
    const s = Auth.current(); if (s) boot(); else show('#login');
    const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  });
})();