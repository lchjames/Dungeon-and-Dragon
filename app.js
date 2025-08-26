(function () {
  const DB_KEY = 'vault-v3.2.7a'; let db = loadDB();
  function loadDB() { try { return JSON.parse(localStorage.getItem(DB_KEY)) || { characters: [] } } catch { return { characters: [] } } }
  function saveDB() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  const $ = id => document.getElementById(id);

  // Theme toggle
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
    });
  });

  function render() {
    const grid = $('characters-grid'); if (!grid) return; grid.innerHTML = '';
    const q = ($('char-search')?.value || '').toLowerCase().trim();
    (db.characters || [])
      .filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.job || '').toLowerCase().includes(q))
      .forEach(c => {
        const node = document.getElementById('tpl-card').content.firstElementChild.cloneNode(true);
        node.querySelector('[data-name]').textContent = c.name || '';
        node.querySelector('[data-id]').textContent = c.id || '';
        node.querySelector('[data-job]').textContent = c.job || '';
        const itemsSummary = (c.items || []).slice(0, 3).map(x => `${x.name}${x.qty ? ` x${x.qty}` : ''}`).join('、');
        const skillsSummary = (c.skills || []).slice(0, 3).map(x => `${x.proficient ? '★' : ''}${x.name}`).join('、');
        node.querySelector('[data-items]').textContent = itemsSummary ? `道具：${itemsSummary}${(c.items || []).length > 3 ? '…' : ''}` : '';
        node.querySelector('[data-skills]').textContent = skillsSummary ? `技能：${skillsSummary}${(c.skills || []).length > 3 ? '…' : ''}` : '';
        node.querySelector('[data-edit]').onclick = () => openEditor(c.id);
        node.querySelector('[data-view]').onclick = () => goDetail(c.id);
        grid.appendChild(node);
      });
    if (!grid.children.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '（沒有角色）'; grid.appendChild(p); }
    renderShareList();
  }

  function openEditor(id) {
    const dlg = $('char-dialog'), f = $('char-form'); if (!dlg || !f) return;
    let c = (db.characters || []).find(x => x.id === id) || { id: 'C_' + Math.random().toString(36).slice(2, 8), name: '', job: '' };
    f.id.value = c.id; f.name.value = c.name; f.job.value = c.job;
    $('delete-character').onclick = () => {
      if (!confirm('確定刪除此角色？')) return;
      db.characters = db.characters.filter(x => x.id !== c.id); saveDB(); dlg.close(); render();
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      // 若是按「取消」或右上角✖，直接關閉，不做驗證
      if (e.submitter && e.submitter.value === 'cancel') { dlg.close(); return; }
      // 儲存時才檢查名字
      if (!f.name.value.trim()) { alert('請輸入角色姓名'); return; }
      c = { id: f.id.value, name: f.name.value, job: f.job.value, items: c.items || [], skills: c.skills || [] };
      const i = (db.characters || []).findIndex(x => x.id === c.id);
      if (i >= 0) db.characters[i] = c; else db.characters.push(c);
      saveDB(); dlg.close(); render();
    };
    dlg.showModal();
  }

  // Detail page
  function goDetail(id) { history.pushState({}, '', `#detail/${id}`); show(location.hash); }
  function renderDetail(id) {
    const c = (db.characters || []).find(x => x.id === id); if (!c) { alert('找不到角色'); show('#characters'); return; }
    $('d-name').textContent = c.name || '';
    $('d-sub').textContent = (c.job || '') + (c.align ? ` • ${c.align}` : '');
    $('d-job').textContent = c.job || '';
    $('d-align').textContent = c.align || '';
    $('d-age').textContent = (c.age ?? '') + '';
    $('d-gender').textContent = c.gender || '';
    $('d-exp').textContent = (c.exp ?? '') + '';
    $('d-id').textContent = c.id || '';

    const tbodyI = $('tbl-items').querySelector('tbody'); tbodyI.innerHTML = '';
    (c.items || []).forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(it.name)}</td><td>${it.qty || ''}</td><td>${it.weight || ''}</td><td>${it.price || ''}</td>`;
      tbodyI.appendChild(tr);
    });
    if (!(c.items || []).length) { const tr = document.createElement('tr'); tr.innerHTML = '<td colspan="4" class="muted">（無）</td>'; tbodyI.appendChild(tr); }

    const tbodyS = $('tbl-skills').querySelector('tbody'); tbodyS.innerHTML = '';
    (c.skills || []).forEach(sk => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${sk.proficient ? '★ ' : ''}${esc(sk.name)}</td><td>${sk.proficient ? '是' : '否'}</td><td>${esc(sk.desc || '')}</td>`;
      tbodyS.appendChild(tr);
    });
    if (!(c.skills || []).length) { const tr = document.createElement('tr'); tr.innerHTML = '<td colspan="3" class="muted">（無）</td>'; tbodyS.appendChild(tr); }

    $('d-edit').onclick = () => openEditor(c.id);
    $('d-export').onclick = () => download(`${c.name || 'character'}.json`, JSON.stringify(c, null, 2));
    $('d-print').onclick = () => window.print();
    $('d-back').onclick = () => history.back();
  }
  const esc = s => String(s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  // Routing
  function show(hash) {
    const m = String(hash || '#characters').match(/^#([^/]+)(?:\/(.+))?/);
    const page = m ? m[1] : 'characters';
    const arg = m ? m[2] : null;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    (document.getElementById('page-' + page) || document.getElementById('page-characters')).classList.remove('hidden');
    if (page === 'detail' && arg) renderDetail(arg);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-route]'); if (!a) return;
    e.preventDefault(); const h = a.getAttribute('href'); history.pushState({}, '', h); show(h);
  });
  window.addEventListener('popstate', () => show(location.hash));

  // File utils
  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }

  // ==== Excel utils (merged-cell-safe) ====
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
  const norm = s => String(s == null ? '' : s).trim();

  // ==== Crypto (AES-GCM with PBKDF2) ====
  const ITER = 150000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const toB64 = u8 => btoa(String.fromCharCode(...u8));
  const fromB64 = b64 => new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
  async function deriveKey(password, salt) {
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function aesEncrypt(text, password) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
    return { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2', iter: ITER, iv: toB64(iv), salt: toB64(salt), data: toB64(new Uint8Array(ct)) };
  }
  async function aesDecrypt(pkg, password) {
    const iv = fromB64(pkg.iv), salt = fromB64(pkg.salt), data = fromB64(pkg.data);
    const key = await deriveKey(password, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return dec.decode(pt);
  }

  // ==== Share package UI ====
  function renderShareList() {
    const box = $('share-characters'); if (!box) return;
    box.innerHTML = '';
    (db.characters || []).forEach(c => {
      const el = document.createElement('label');
      el.className = 'item'; el.innerHTML = `<input type="checkbox" value="${c.id}"/><span>${c.name}</span><small class="muted">(${c.id})</small>`;
      box.appendChild(el);
    });
  }
  function selectedShareIds() {
    return Array.from(document.querySelectorAll('#share-characters input[type=checkbox]:checked')).map(x => x.value);
  }
  $('share-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('#share-characters input[type=checkbox]').forEach(x => x.checked = true);
  });
  $('share-unselect-all')?.addEventListener('click', () => {
    document.querySelectorAll('#share-characters input[type=checkbox]').forEach(x => x.checked = false);
  });
  $('share-make')?.addEventListener('click', async () => {
    const ids = selectedShareIds(); const pass = $('share-pass')?.value || '';
    if (!ids.length) return alert('請先選擇角色');
    if (pass.length < 4) return alert('請設定至少 4 碼密碼');
    const subset = (db.characters || []).filter(c => ids.includes(c.id));
    const plain = JSON.stringify({ characters: subset });
    const pkg = await aesEncrypt(plain, pass);
    const payload = JSON.stringify({ meta: { ts: Date.now(), count: subset.length, ids }, pkg }, null, 2);
    const name = `share-${(subset[0]?.name || 'player')}-${Date.now()}.json`;
    download(name, payload);
    alert('已下載。若要用連結分享，請把檔案放到 repo 的 /p 目錄，連結使用：#p=' + name);
  });

  // Player import via file
  let filePkgObj = null;
  $('pkg-import')?.addEventListener('change', async e => { filePkgObj = null; const f = e.target.files?.[0]; if (!f) return; filePkgObj = JSON.parse(await f.text()); alert('已讀取分享包，請到「分享包」頁輸入密碼並按「解密匯入」。'); });
  $('pkg-import-2')?.addEventListener('change', async e => { filePkgObj = null; const f = e.target.files?.[0]; if (!f) return; filePkgObj = JSON.parse(await f.text()); alert('已讀取分享包，請輸入密碼並按「解密匯入」。'); });
  $('pkg-open')?.addEventListener('click', async () => {
    if (!filePkgObj) return alert('請先選擇分享包檔案');
    const pass = $('pkg-pass')?.value || ''; if (!pass) return alert('請輸入密碼');
    try {
      const text = await aesDecrypt(filePkgObj.pkg, pass);
      const data = JSON.parse(text);
      db = { characters: data.characters || [] }; saveDB(); render(); show('#characters');
      alert('已匯入分享包，現在只包含你自己的角色。');
    } catch (err) { alert('密碼錯誤或檔案毀損'); }
  });

  // Import from URL hash #p=filename.json (with base path)
  async function tryOpenHashPackage() {
    const m = location.hash.match(/^#p=(.+)$/); if (!m) return;
    const name = decodeURIComponent(m[1]);
    try {
      const basePath = (document.querySelector('base')?.getAttribute('href') || location.pathname.replace(/[^/]*$/, ''));
      const url = basePath + 'p/' + name;
      const res = await fetch(url); if (!res.ok) throw new Error('找不到檔案：' + url);
      const obj = await res.json();
      const pass = prompt('輸入分享包密碼'); if (!pass) return;
      const text = await aesDecrypt(obj.pkg, pass);
      const data = JSON.parse(text);
      db = { characters: data.characters || [] }; saveDB(); render(); show('#characters');
      alert('已從連結匯入分享包');
    } catch (err) { alert('無法開啟分享包：' + (err.message || err)); }
  }

  // ==== Excel import (owner): full import with upsert ====
  $('excel-import')?.addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (!f) return; const hud = $('excel-status');
    try {
      hud.textContent = '載入中…';
      const buf = await f.arrayBuffer();
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
      function readItemsSheet() {
        const ws = wb.Sheets['持有道具'] || wb.Sheets['道具'] || wb.Sheets['物品'] || null;
        if (!ws || !ws['!ref']) return [];
        const R = XLSX.utils.decode_range(ws['!ref']);
        let headerRow = -1, headers = [];
        for (let r = R.s.r; r <= Math.min(R.s.r + 4, R.e.r); r++) {
          const row = [];
          for (let c = R.s.c; c <= R.e.c; c++) {
            row.push(norm(getCell(ws, XLSX.utils.encode_cell({ r, c }), { followMerged: true })));
          }
          if (row.some(x => /名稱|物品|道具|Name/i.test(x))) {
            headerRow = r; headers = row; break;
          }
        }
        if (headerRow < 0) return [];
        const nameIdx = headers.findIndex(h => /名稱|物品|道具|Name/i.test(h));
        const qtyIdx = headers.findIndex(h => /數量|Qty|数量/i.test(h));
        const wIdx = headers.findIndex(h => /重量|重|Weight/i.test(h));
        const pIdx = headers.findIndex(h => /價格|價錢|金額|Price|GP/i.test(h));
        const out = [];
        for (let r = headerRow + 1; r <= R.e.r; r++) {
          const get = (idx) => idx >= 0 ? norm(getCell(ws, XLSX.utils.encode_cell({ r, c: R.s.c + idx }), { followMerged: true })) : '';
          const n = get(nameIdx), q = get(qtyIdx), w = get(wIdx), p = get(pIdx);
          if (!n && !q && !w && !p) continue;
          out.push({ name: n, qty: q ? Number(q) : 0, weight: w ? Number(w) : 0, price: p ? Number(p) : 0 });
        }
        return out;
      }

      // 技能法術表
      function readSkillsSheet() {
        const ws = wb.Sheets['持有技能法術'] || wb.Sheets['技能'] || wb.Sheets['法術'] || null;
        if (!ws || !ws['!ref']) return [];
        const R = XLSX.utils.decode_range(ws['!ref']);
        let headerRow = -1, headers = [];
        for (let r = R.s.r; r <= Math.min(R.s.r + 4, R.e.r); r++) {
          const row = [];
          for (let c = R.s.c; c <= R.e.c; c++) {
            row.push(norm(getCell(ws, XLSX.utils.encode_cell({ r, c }), { followMerged: true })));
          }
          if (row.some(x => /名稱|技能|法術|Name/i.test(x))) {
            headerRow = r; headers = row; break;
          }
        }
        if (headerRow < 0) return [];
        const nameIdx = headers.findIndex(h => /名稱|技能|法術|Name/i.test(h));
        const profIdx = headers.findIndex(h => /熟練|Proficien/i.test(h));
        const descIdx = headers.findIndex(h => /描述|效果|說明|Desc/i.test(h));
        const out = [];
        for (let r = headerRow + 1; r <= R.e.r; r++) {
          const get = (idx) => idx >= 0 ? norm(getCell(ws, XLSX.utils.encode_cell({ r, c: R.s.c + idx }), { followMerged: true })) : '';
          const n = get(nameIdx), pf = get(profIdx), d = get(descIdx);
          if (!n && !pf && !d) continue;
          const prof = /^y|^t|true|是|有|✓|✔/i.test(pf || '');
          out.push({ name: n, proficient: prof, desc: d });
        }
        return out;
      }

      const items = readItemsSheet();
      const skills = readSkillsSheet();

      // Upsert by name
      const idx = (db.characters || []).findIndex(c => (c.name || '').trim().toLowerCase() === String(name).toLowerCase());
      const base = {
        name: String(name), job: String(job || ''), align: String(align || ''),
        age: Number(age || 0) || 0, gender: String(gender || ''), exp: Number(exp || 0) || 0,
        items: items, skills: skills
      };
      if (idx >= 0) {
        const id = db.characters[idx].id;
        db.characters[idx] = { ...db.characters[idx], id, ...base };
        hud.textContent = '更新完成：' + base.name;
      } else {
        db.characters.push({ id: 'C_' + Math.random().toString(36).slice(2, 8), ...base });
        hud.textContent = '新增完成：' + base.name;
      }

      saveDB(); render(); show('#characters');
    } catch (err) {
      $('excel-status').classList.remove('ok', 'err');
      $('excel-status').classList.add('err');
      $('excel-status').textContent = '錯誤：' + (err.message || err);
    } finally {
      e.target.value = '';
      setTimeout(() => { $('excel-status')?.classList.remove('ok', 'err'); $('excel-status').textContent = ''; }, 3000);
    }
  });

  // Basic actions
  $('add-character')?.addEventListener('click', () => openEditor(null));
  $('char-search')?.addEventListener('input', render);

  // Export/import JSON
  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  $('export-json')?.addEventListener('click', () => download('vault-export.json', JSON.stringify(db, null, 2)));
  $('import-json')?.addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try { db = JSON.parse(await f.text()); saveDB(); render(); show('#characters'); alert('已匯入 JSON'); }
    catch { alert('JSON 格式錯誤'); }
  });

  // Start
  document.addEventListener('DOMContentLoaded', () => {
    const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
    render(); show(location.hash || '#characters'); tryOpenHashPackage();
  });
})();