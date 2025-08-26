(function () {
  const DB_KEY = 'vault-v3.2.5'; let db = loadDB();
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
        const itemsSummary = (c.items || []).slice(0, 3).map(x => `${x.name}${x.qty ? ` x${x.qty}` : ''}`).join('、');
        const skillsSummary = (c.skills || []).slice(0, 3).map(x => `${x.proficient ? '★' : ''}${x.name}`).join('、');
        node.querySelector('[data-items]').textContent = itemsSummary ? `道具：${itemsSummary}${(c.items || []).length > 3 ? '…' : ''}` : '';
        node.querySelector('[data-skills]').textContent = skillsSummary ? `技能：${skillsSummary}${(c.skills || []).length > 3 ? '…' : ''}` : '';
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
      c = { id: f.id.value, name: f.name.value, job: f.job.value, items: c.items || [], skills: c.skills || [] };
      const i = (db.characters || []).findIndex(x => x.id === c.id);
      if (i >= 0) db.characters[i] = c; else db.characters.push(c);
      saveDB(); dlg.close(); render();
    };
    dlg.showModal();
  }

  function bindAlways() {
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

    // === Util: merged-cell-safe getters ===
    function getCell(ws, addr, { followMerged = true, scanRight = 0 } = {}) {
      if (!ws) return '';
      const val = ws[addr]?.v;
      if (val !== undefined && String(val).trim() !== '') return String(val).trim();
      if (followMerged && Array.isArray(ws['!merges'])) {
        const A = XLSX.utils.decode_cell(addr);
        for (const m of ws['!merges']) {
          if (A.r >= m.s.r && A.r <= m.e.r && A.c >= m.s.c && A.c <= m.e.c) {
            const master = XLSX.utils.encode_cell(m.s);
            const mv = ws[master]?.v;
            if (mv !== undefined && String(mv).trim() !== '') return String(mv).trim();
          }
        }
      }
      if (scanRight > 0) {
        const A = XLSX.utils.decode_cell(addr);
        for (let k = 1; k <= scanRight; k++) {
          const right = XLSX.utils.encode_cell({ r: A.r, c: A.c + k });
          const rv = ws[right]?.v;
          if (rv !== undefined && String(rv).trim() !== '') return String(rv).trim();
        }
      }
      return '';
    }
    function pickRightByLabel(ws, labels, scanRight = 10) {
      if (!ws) return '';
      const ref = ws['!ref']; if (!ref) return '';
      const range = XLSX.utils.decode_range(ref);
      const norm = s => String(s || '').replace(/[\\s:：]/g, '').toUpperCase();
      const targets = new Set(labels.map(norm));
      for (let r = range.s.r; r <= Math.min(range.e.r, 600); r++) {
        for (let c = range.s.c; c <= Math.min(range.e.c, 120); c++) {
          const here = XLSX.utils.encode_cell({ r, c });
          const v = ws[here]?.v; if (!v) continue;
          if (targets.has(norm(v))) {
            for (let k = 1; k <= scanRight; k++) {
              const addr = XLSX.utils.encode_cell({ r, c: c + k });
              const got = getCell(ws, addr, { followMerged: true, scanRight: 0 });
              if (got) return got;
            }
          }
        }
      }
      return '';
    }
    function norm(s) { return String(s == null ? '' : s).trim(); }

    // === Excel import handler: full import ===
    byId('excel-import')?.addEventListener('change', async e => {
      const file = e.target.files?.[0]; if (!file) return;
      const hud = byId('excel-status');
      try {
        hud.textContent = '載入中…';
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });

        // 人物主表
        const wsChar = wb.Sheets['人物表(自動計算)'] || wb.Sheets['人物表'] || wb.Sheets[wb.SheetNames[0]];
        const name = getCell(wsChar, 'I2', { followMerged: true, scanRight: 10 }) || pickRightByLabel(wsChar, ['探索者姓名', '姓名', '角色名', '名稱'], 10);
        const job = getCell(wsChar, 'I3', { followMerged: true, scanRight: 10 }) || pickRightByLabel(wsChar, ['職業', 'Job'], 10);
        const align = getCell(wsChar, 'I4', { followMerged: true, scanRight: 10 });
        const age = getCell(wsChar, 'I5', { followMerged: true, scanRight: 10 });
        const gender = getCell(wsChar, 'I6', { followMerged: true, scanRight: 10 });
        const exp = getCell(wsChar, 'I7', { followMerged: true, scanRight: 10 });
        if (!name) throw new Error('找不到姓名（I2 或 標籤右側皆為空）');

        // 道具表
        const wsItems = wb.Sheets['持有道具'] || wb.Sheets['道具'] || null;
        let items = [];
        if (wsItems) {
          const range = XLSX.utils.decode_range(wsItems['!ref']);
          // 讀第一列作為表頭
          const headers = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
            headers.push(norm(getCell(wsItems, addr, { followMerged: true })));
          }
          const nameIdx = headers.findIndex(h => /名稱|物品|道具|Name/i.test(h));
          const qtyIdx = headers.findIndex(h => /數量|Qty|数量/i.test(h));
          const wIdx = headers.findIndex(h => /重量|重|Weight/i.test(h));
          const pIdx = headers.findIndex(h => /價格|價錢|Price|GP/i.test(h));
          // 從第二列開始讀
          for (let r = range.s.r + 1; r <= range.e.r; r++) {
            const get = (idx) => idx >= 0 ? norm(getCell(wsItems, XLSX.utils.encode_cell({ r, c: range.s.c + idx }), { followMerged: true })) : '';
            const n = get(nameIdx);
            const q = get(qtyIdx);
            const w = get(wIdx);
            const p = get(pIdx);
            if (!n && !q && !w && !p):
              pass
          }
        }

      } catch (err) {
        hud.textContent = '錯誤：' + (err?.message || err);
      } finally {
        e.target.value = '';
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