(function () {
  const THEME_KEY = 'vault-theme', DB_KEY = 'vault-auth-excel-v1';
  const ALIGN_LABEL = { LG: '守序善良', NG: '中立善良', CG: '混沌善良', LN: '守序中立', N: '絕對中立', CN: '混沌中立', LE: '守序邪惡', NE: '中立邪惡', CE: '混沌邪惡' };
  const ALIGN_ALIAS = { '守序善良': 'LG', '中立善良': 'NG', '混沌善良': 'CG', '守序中立': 'LN', '絕對中立': 'N', '中立': 'N', '混沌中立': 'CN', '守序邪惡': 'LE', '中立邪惡': 'NE', '混沌邪惡': 'CE' };
  const uid = () => Math.random().toString(36).slice(2, 10);

  let db = loadDB();
  function def() { return { characters: [] }; }
  function loadDB() { try { return JSON.parse(localStorage.getItem(DB_KEY)) || def(); } catch { return def(); } }
  function saveDB() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

  // theme
  const theme = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  byId('theme-toggle').addEventListener('click', () => { const c = document.documentElement.getAttribute('data-theme'); const n = c === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); localStorage.setItem(THEME_KEY, n); });
  byId('year').textContent = new Date().getFullYear();

  // router
  const pages = { login: byId('page-login'), users: byId('page-users'), characters: byId('page-characters'), backup: byId('page-backup') };
  document.querySelectorAll('[data-route]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const h = a.getAttribute('href'); history.pushState({}, '', h); show(h); }));
  window.addEventListener('popstate', () => show(location.hash || '#login'));

  // session
  const who = Auth.current();
  if (!who) { location.hash = '#login'; show('#login'); } else { boot(); }

  // login handlers
  const btnLogin = byId('btn-login');
  const inputUser = byId('login-user');
  const inputPass = byId('login-pass');
  async function doLogin() {
    try {
      const u = (inputUser?.value || '').trim(); const p = inputPass?.value || '';
      if (!u || !p) { alert('請輸入用戶名與密碼'); return; }
      await Auth.login(u, p);
      boot();
    } catch (err) { alert(err?.message || err); }
  }
  btnLogin?.addEventListener('click', doLogin);
  [inputUser, inputPass].forEach(el => el?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } }));
  byId('logout').addEventListener('click', () => Auth.logout());

  function boot() {
    const s = Auth.current();
    byId('whoami').textContent = `${s.username}（${s.role === 'admin' ? '管理員' : '玩家'}）`;
    document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = s.role === 'admin' ? '' : 'none');
    byId('player-hint').hidden = s.role === 'admin';
    mountUsersPage(s);
    mountCharactersPage(s);
    mountBackupPage();
    location.hash = location.hash && location.hash !== '#login' ? location.hash : '#characters';
    show(location.hash);
  }

  function show(hash) {
    const key = (hash || '#login').replace('#', '');
    Object.values(pages).forEach(p => p.classList.add('hidden'));
    (pages[key] || pages.login).classList.remove('hidden');
    if (key === 'characters') renderCharacters();
  }

  // Users page
  function mountUsersPage(s) {
    if (s.role !== 'admin') return;
    const tBody = byId('users-table').querySelector('tbody');
    function render() {
      const users = Auth.loadUsers();
      tBody.innerHTML = '';
      users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${u.username}</td><td>${u.role}</td>
          <td><input class="input" value="${(u.allowed || []).join(',')}"></td>
          <td><button class="button small" data-del="${u.username}" type="button">刪</button></td>`;
        const input = tr.querySelector('input');
        input.addEventListener('change', () => { const all = Auth.loadUsers(); const me = all.find(x => x.username === u.username); if (me) { me.allowed = input.value.split(',').map(s => s.trim()).filter(Boolean); Auth.saveUsers(all); } });
        tr.querySelector('button').addEventListener('click', () => { const all = Auth.loadUsers().filter(x => x.username !== u.username); Auth.saveUsers(all); render(); });
        tBody.appendChild(tr);
      });
      window.__applyMobileTables?.();
    }
    byId('u-add').addEventListener('click', async () => {
      const username = byId('u-name').value.trim(); const pass = byId('u-pass').value; const role = byId('u-role').value;
      if (!username || !pass) { alert('請輸入用戶名與密碼'); return; }
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass)).then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''));
      const all = Auth.loadUsers(); const exist = all.find(u => u.username === username);
      if (exist) { exist.pass = h; exist.role = role; } else { all.push({ id: 'u_' + uid(), username, pass: h, role, allowed: [] }); }
      Auth.saveUsers(all); byId('u-pass').value = ''; render();
    });
    render();
  }

  // Characters page
  const dlg = byId('char-dialog'), form = byId('char-form');
  let editingId = null; let readOnly = false;

  function mountCharactersPage(s) {
    const btnAdd = byId('add-character');
    const btnDel = byId('delete-character');
    const skillBody = byId('skill-table').querySelector('tbody');
    const itemBody = byId('item-table').querySelector('tbody');
    const sfBody = byId('sf-table').querySelector('tbody');

    btnAdd?.addEventListener('click', () => openEditor(null, false));

    byId('excel-import')?.addEventListener('change', async e => {
      const f = e.target.files?.[0]; if (!f) return;
      const hud = byId('excel-status');
      try {
        hud.className = 'status'; hud.innerHTML = `<span class="spinner" aria-hidden="true"></span> 檔案已選：${f.name}，開始載入…`;
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });

        // ---- tolerant sheet + pick helpers ----
        const SHEET_CANDIDATES = ['人物表(自動計算)', '人物表', '角色', '角色卡', '角色紀錄', '角色表', '人物'];
        function toRows(name) { const ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) : []; }
        function rowsFromAny(cands) { for (const n of cands) { const r = toRows(n); if (r && r.length) { return r; } } return []; }
        const charRows = rowsFromAny(SHEET_CANDIDATES);

        const pick = (labels) => {
          const norm = (s) => String(s ?? '').replace(/[\\s　]/g, '').replace(/[：:]/g, '').trim();
          const labset = new Set(labels.map(norm));
          for (let r = 0; r < charRows.length; r++) {
            const row = charRows[r];
            for (let c = 0; c < row.length; c++) {
              const cell = norm(row[c]);
              if (!cell) continue;
              if (labset.has(cell)) {
                if (row[c + 1] !== undefined && String(row[c + 1]).trim() !== '') return row[c + 1];
                if (charRows[r + 1] && charRows[r + 1][c] !== undefined && String(charRows[r + 1][c]).trim() !== '') return charRows[r + 1][c];
              }
              for (const L of labset) {
                if (cell.startsWith(L)) {
                  const rest = norm(cell.slice(L.length));
                  if (rest) return rest;
                }
              }
            }
          }
          return '';
        };

        hud.innerHTML = `<span class="spinner" aria-hidden="true"></span> 解析中：人物表…`;
        let name = String(pick(['探索者姓名', '冒險者姓名', '角色姓名', '角色名', '姓名', '名稱', '名字'])).trim();
        if (!charRows.length) { throw new Error('找不到「人物表」工作表'); }
        if (!name) { name = prompt('找不到角色姓名，請輸入角色姓名：', '') || ''; }
        if (!name) { throw new Error('Excel 未找到 角色姓名'); }

        const id = 'C_' + uid();
        const alignRaw = String(pick(['陣營'])).trim();
        const align = ALIGN_LABEL[alignRaw.toUpperCase()] ? alignRaw.toUpperCase() : (ALIGN_ALIAS[alignRaw] || '');
        const ch = { id, name, job: String(pick(['職業', '角色職業', '職業類型'])).trim(), align, age: Number(pick(['年齡'])) || 0, gender: String(pick(['性別'])).trim(), exp: Number(pick(['EXP', '經驗'])).valueOf() || 0, level: 1, skills: [], money: { cp: 0, sp: 0, gp: 0 }, items: [], spellskills: [] };

        hud.innerHTML = `<span class="spinner" aria-hidden="true"></span> 解析中：道具與金錢…`;
        const itemsRows = (function () { const cands = ['持有道具', '道具', '背包', '裝備']; for (const n of cands) { const r = toRows(n); if (r && r.length) return r; } return []; })();
        for (const r of itemsRows) { const k = String(r[0]).trim(); if (k.includes('銅幣')) ch.money.cp = Number(r[1]) || 0; if (k.includes('銀幣')) ch.money.sp = Number(r[1]) || 0; if (k.includes('金幣')) ch.money.gp = Number(r[1]) || 0; }
        const headerIdx = itemsRows.findIndex(row => /物品/.test(row.join('|')) && /名稱|名/.test(row.join('|')) && /說明/.test(row.join('|')) && /數量/.test(row.join('|')));
        if (headerIdx >= 0) {
          const header = itemsRows[headerIdx].map(s => String(s).trim());
          const col = (names) => { for (const n of names) { const i = header.findIndex(h => h.includes(n)); if (i !== -1) return i; } return -1; };
          const cN = col(['物品名稱', '名稱', '名']), cD = col(['說明', '描述']), cQ = col(['數量']), cA = col(['攻擊力', '攻擊']), cDf = col(['防禦力', '防禦']);
          for (let r = headerIdx + 1; r < itemsRows.length; r++) { const row = itemsRows[r]; const n = String(row[cN] ?? '').trim(); if (!n) continue; ch.items.push({ name: n, desc: String(row[cD] ?? '').trim(), qty: Number(row[cQ] ?? 1) || 1, atk: Number(row[cA] ?? 0) || 0, def: Number(row[cDf] ?? 0) || 0 }); }
        }

        hud.innerHTML = `<span class="spinner" aria-hidden="true"></span> 解析中：技能/法術…`;
        const sfRows = (function () { const cands = ['持有技能法術', '技能法術', '技能/法術', '技能', '法術']; for (const n of cands) { const r = toRows(n); if (r && r.length) return r; } return []; })();
        let sfHeaderIdx = sfRows.findIndex(row => /技能名稱|名稱/.test(row.join('|')) && /說明/.test(row.join('|')));
        if (sfHeaderIdx < 0) sfHeaderIdx = 0;
        const headerSF = (sfRows[sfHeaderIdx] || []).map(s => String(s).trim());
        const colSF = (names) => { for (const n of names) { const i = headerSF.findIndex(h => h.includes(n)); if (i !== -1) return i; } return -1; };
        const cSN = colSF(['技能名稱', '名稱']), cSD = colSF(['說明', '描述']), cST = colSF(['目標']), cSA = colSF(['效應範圍', '範圍']), cSR = colSF(['效應距離', '距離']);
        const cB1 = colSF(['加成1', '加成一']), cB2 = colSF(['加成2', '加成二']), cB3 = colSF(['加成3', '加成三']), cMP = colSF(['消耗法力', 'MP', '法力']);
        for (let r = sfHeaderIdx + 1; r < sfRows.length; r++) { const row = sfRows[r]; const n = String(row[cSN] ?? '').trim(); const d = String(row[cSD] ?? '').trim(); if (!n && !d) continue; ch.spellskills.push({ name: n, desc: d, target: String(row[cST] ?? '').trim(), area: String(row[cSA] ?? '').trim(), range: String(row[cSR] ?? '').trim(), b1: String(row[cB1] ?? '').trim(), b2: String(row[cB2] ?? '').trim(), b3: String(row[cB3] ?? '').trim(), mp: String(row[cMP] ?? '').trim() }); }

        db.characters.push(ch); saveDB(); renderCharacters();
        hud.className = 'status ok'; hud.textContent = `已載入：${ch.name}（道具 ${ch.items.length}、技能/法術 ${ch.spellskills.length}）`; setTimeout(() => { hud.textContent = ''; }, 5000);
      } catch (err) {
        const hud2 = byId('excel-status');
        hud2.className = 'status err';
        hud2.textContent = '匯入失敗：' + (err?.message || err);
      } finally { e.target.value = ''; }
    });

    // dynamic row helpers
    function addSkillRow(s = { type: '', name: '', base: 0, prof: 0 }) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="input" value="${s.type || ''}"></td>
      <td><input class="input" value="${s.name || ''}"></td>
      <td><input class="input" type="number" value="${s.base ?? 0}"></td>
      <td><input class="input" type="number" value="${s.prof ?? 0}"></td>
      <td class="muted">${Number(s.base || 0) + Number(s.prof || 0)}</td>
      <td><button class="button small" type="button">刪</button></td>`;
      if (readOnly) { tr.querySelectorAll('input').forEach(i => i.disabled = true); tr.querySelector('button').style.display = 'none'; }
      else {
        const ins = tr.querySelectorAll('input');
        ins[0].addEventListener('input', e => { s.type = e.target.value; });
        ins[1].addEventListener('input', e => { s.name = e.target.value; });
        ins[2].addEventListener('input', e => { s.base = Number(e.target.value || 0); tr.children[4].textContent = Number(s.base || 0) + Number(s.prof || 0); });
        ins[3].addEventListener('input', e => { s.prof = Number(e.target.value || 0); tr.children[4].textContent = Number(s.base || 0) + Number(s.prof || 0); });
        tr.querySelector('button').addEventListener('click', () => tr.remove());
      }
      byId('skill-table').querySelector('tbody').appendChild(tr);
      window.__applyMobileTables?.();
    }
    byId('skill-add').addEventListener('click', e => { e.preventDefault(); if (readOnly) return; addSkillRow({ type: val('skill-type'), name: val('skill-name'), base: Number(val('skill-base') || 0), prof: Number(val('skill-prof') || 0) });['skill-type', 'skill-name', 'skill-base', 'skill-prof'].forEach(id => setVal(id, '')); });

    function addItemRow(it = { name: '', desc: '', qty: 1, atk: 0, def: 0 }) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="input" value="${it.name || ''}"></td>
      <td><input class="input" value="${it.desc || ''}"></td>
      <td><input class="input" type="number" min="1" value="${it.qty || 1}"></td>
      <td><input class="input" type="number" value="${it.atk || 0}"></td>
      <td><input class="input" type="number" value="${it.def || 0}"></td>
      <td><button class="button small" type="button">刪</button></td>`;
      if (readOnly) { tr.querySelectorAll('input').forEach(i => i.disabled = true); tr.querySelector('button').style.display = 'none'; }
      else {
        const ins = tr.querySelectorAll('input');
        ins[0].addEventListener('input', e => { it.name = e.target.value; });
        ins[1].addEventListener('input', e => { it.desc = e.target.value; });
        ins[2].addEventListener('input', e => { it.qty = Number(e.target.value || 1); });
        ins[3].addEventListener('input', e => { it.atk = Number(e.target.value || 0); });
        ins[4].addEventListener('input', e => { it.def = Number(e.target.value || 0); });
        tr.querySelector('button').addEventListener('click', () => tr.remove());
      }
      byId('item-table').querySelector('tbody').appendChild(tr);
      window.__applyMobileTables?.();
    }
    byId('item-add').addEventListener('click', e => { e.preventDefault(); if (readOnly) return; addItemRow({ name: val('item-name'), desc: val('item-desc'), qty: Number(val('item-qty') || 1), atk: Number(val('item-atk') || 0), def: Number(val('item-def') || 0) });['item-name', 'item-desc', 'item-qty', 'item-atk', 'item-def'].forEach(id => setVal(id, id == 'item-qty' ? '1' : '')); });

    function addSFRow(s = { name: '', desc: '', target: '', area: '', range: '', b1: '', b2: '', b3: '', mp: '' }) {
      const tr = document.createElement('tr');
      tr.innerHTML = ['name', 'desc', 'target', 'area', 'range', 'b1', 'b2', 'b3', 'mp'].map(k => `<td><input class="input" value="${s[k] ?? ''}"></td>`).join('') + `<td><button class="button small" type="button">刪</button></td>`;
      if (readOnly) { tr.querySelectorAll('input').forEach(i => i.disabled = true); tr.querySelector('button').style.display = 'none'; }
      else {
        const ks = ['name', 'desc', 'target', 'area', 'range', 'b1', 'b2', 'b3', 'mp'];
        tr.querySelectorAll('input').forEach((inp, idx) => inp.addEventListener('input', e => { s[ks[idx]] = e.target.value; }));
        tr.querySelector('button').addEventListener('click', () => tr.remove());
      }
      byId('sf-table').querySelector('tbody').appendChild(tr);
      window.__applyMobileTables?.();
    }
    byId('sf-add').addEventListener('click', e => { e.preventDefault(); if (readOnly) return; addSFRow({ name: val('sf-name'), desc: val('sf-desc'), target: val('sf-target'), area: val('sf-area'), range: val('sf-range'), b1: val('sf-b1'), b2: val('sf-b2'), b3: val('sf-b3'), mp: val('sf-mp') });['sf-name', 'sf-desc', 'sf-target', 'sf-area', 'sf-range', 'sf-b1', 'sf-b2', 'sf-b3', 'sf-mp'].forEach(id => setVal(id, '')); });
  }

  function renderCharacters() {
    const s = Auth.current();
    const grid = byId('characters-grid'); grid.innerHTML = '';
    const q = (byId('char-search').value || '').toLowerCase().trim();
    let list = db.characters || [];
    if (s.role !== 'admin') {
      const me = Auth.loadUsers().find(u => u.username === s.username);
      const allow = new Set(me?.allowed || []);
      list = list.filter(c => allow.has(c.id));
    }
    list = list.filter(c => !q || [c.name, c.job].join(' ').toLowerCase().includes(q));
    const tpl = byId('tpl-card');
    list.forEach(c => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('[data-name]').textContent = c.name || '';
      node.querySelector('[data-id]').textContent = c.id || '';
      node.querySelector('[data-job]').textContent = c.job || '';
      node.querySelector('[data-level]').textContent = c.level || 1;
      node.querySelector('[data-gender]').textContent = c.gender || '';
      node.querySelector('[data-align]').textContent = (c.align && (ALIGN_LABEL[c.align] || c.align)) || '';
      node.querySelector('[data-edit]').addEventListener('click', () => openEditor(c.id, s.role !== 'admin'));
      grid.appendChild(node);
    });
    if (list.length === 0) {
      const p = document.createElement('p'); p.className = 'muted'; p.textContent = s.role === 'admin' ? '（尚未有角色，請新增或由 Excel 匯入）' : '（你未被指派任何角色）'; grid.appendChild(p);
    }
    window.__applyMobileTables?.();
  }
  byId('char-search').addEventListener('input', renderCharacters);

  function openEditor(id, ro) {
    readOnly = !!ro;
    const skillBody = byId('skill-table').querySelector('tbody');
    const itemBody = byId('item-table').querySelector('tbody');
    const sfBody = byId('sf-table').querySelector('tbody');

    form.reset(); skillBody.innerHTML = ''; itemBody.innerHTML = ''; sfBody.innerHTML = '';
    const title = byId('char-title'); const btnDel = byId('delete-character'); btnDel.style.display = id && !readOnly ? '' : 'none';
    let c = id ? db.characters.find(x => x.id === id) : { id: 'C_' + uid(), name: '', job: '', align: '', age: 0, gender: '', exp: 0, level: 1, skills: [], money: { cp: 0, sp: 0, gp: 0 }, items: [], spellskills: [] };
    editingId = c.id;
    form.id.value = c.id; form.name.value = c.name || ''; form.job.value = c.job || ''; form.align.value = c.align || ''; form.age.value = c.age ?? 0; form.gender.value = c.gender || ''; form.exp.value = c.exp ?? 0;
    form.cp.value = c.money?.cp ?? 0; form.sp.value = c.money?.sp ?? 0; form.gp.value = c.money?.gp ?? 0;
    (c.skills || []).forEach(s => addSkillRowRO(skillBody, s, readOnly));
    (c.items || []).forEach(it => addItemRowRO(itemBody, it, readOnly));
    (c.spellskills || []).forEach(s => addSFRowRO(sfBody, s, readOnly));
    Array.from(form.elements).forEach(el => { if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') { el.disabled = readOnly; } });
    form.querySelectorAll('.button.small').forEach(b => b.style.display = readOnly ? 'none' : '');
    title.textContent = (readOnly ? '查看' : '編輯') + '：' + (c.name || c.id);
    dlg.showModal();
    window.__applyMobileTables?.();

    function addSkillRowRO(tbody, s) { const tr = document.createElement('tr'); tr.innerHTML = `<td><input class="input" value="${s.type || ''}"></td><td><input class="input" value="${s.name || ''}"></td><td><input class="input" type="number" value="${s.base ?? 0}"></td><td><input class="input" type="number" value="${s.prof ?? 0}"></td><td class="muted">${Number(s.base || 0) + Number(s.prof || 0)}</td><td><button class="button small" type="button">刪</button></td>`; if (readOnly) { tr.querySelectorAll('input').forEach(i => i.disabled = true); tr.querySelector('button').style.display = 'none'; } tbody.appendChild(tr); }
    function addItemRowRO(tbody, it) { const tr = document.createElement('tr'); tr.innerHTML = `<td><input class="input" value="${it.name || ''}"></td><td><input class="input" value="${it.desc || ''}"></td><td><input class="input" type="number" value="${it.qty || 1}"></td><td><input class="input" type="number" value="${it.atk || 0}"></td><td><input class="input" type="number" value="${it.def || 0}"></td><td><button class="button small" type="button">刪</button></td>`; if (readOnly) { tr.querySelectorAll('input').forEach(i => i.disabled = true); tr.querySelector('button').style.display = 'none'; } tbody.appendChild(tr); }
    function addSFRowRO(tbody, s) { const tr = document.createElement('tr'); tr.innerHTML = ['name', 'desc', 'target', 'area', 'range', 'b1', 'b2', 'b3', 'mp'].map(k => `<td><input class="input" value="${s[k] ?? ''}"></td>`).join('') + `<td><button class="button small" type="button">刪</button></td>`; if (readOnly) { tr.querySelectorAll('input').forEach(i => i.disabled = true); tr.querySelector('button').style.display = 'none'; } tbody.appendChild(tr); }
  }

  function collectForm(skillBody, itemBody, sfBody) {
    const c = { id: form.id.value.trim(), name: form.name.value.trim(), job: form.job.value.trim(), align: form.align.value, age: Number(form.age.value || 0), gender: form.gender.value.trim(), exp: Number(form.exp.value || 0), level: 1, skills: [], money: { cp: Number(form.cp.value || 0), sp: Number(form.sp.value || 0), gp: Number(form.gp.value || 0) }, items: [], spellskills: [] };
    skillBody.querySelectorAll('tr').forEach(tr => { const ins = tr.querySelectorAll('input'); if (!ins.length) return; const s = { type: ins[0].value.trim(), name: ins[1].value.trim(), base: Number(ins[2].value || 0), prof: Number(ins[3].value || 0) }; if (s.type || s.name) c.skills.push(s); });
    itemBody.querySelectorAll('tr').forEach(tr => { const ins = tr.querySelectorAll('input'); if (!ins.length) return; const it = { name: ins[0].value.trim(), desc: ins[1].value.trim(), qty: Number(ins[2].value || 1), atk: Number(ins[3].value || 0), def: Number(ins[4].value || 0) }; if (it.name) c.items.push(it); });
    sfBody.querySelectorAll('tr').forEach(tr => { const ins = tr.querySelectorAll('input'); if (!ins.length) return; const s = { name: ins[0].value.trim(), desc: ins[1].value.trim(), target: ins[2].value.trim(), area: ins[3].value.trim(), range: ins[4].value.trim(), b1: ins[5].value.trim(), b2: ins[6].value.trim(), b3: ins[7].value.trim(), mp: ins[8].value.trim() }; if (s.name || s.desc) c.spellskills.push(s); });
    return c;
  }

  // Backup page
  function mountBackupPage() {
    byId('export-json').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vault-auth-data.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    byId('import-json').addEventListener('change', async e => {
      const f = e.target.files?.[0]; if (!f) return;
      try { const text = await f.text(); const data = JSON.parse(text); if (!Array.isArray(data.characters)) throw new Error('格式不正確'); db = data; saveDB(); alert('匯入完成'); renderCharacters(); }
      catch (err) { alert('匯入失敗：' + (err?.message || err)); }
      finally { e.target.value = ''; }
    });
  }

  // helpers
  function byId(id) { return document.getElementById(id); }
  function val(id) { return byId(id).value || ''; }
  function setVal(id, v) { byId(id).value = v; }

  // Mobile table helper
  (function () {
    function labelize(selector, labels) {
      const tb = document.querySelector(selector);
      if (!tb) return;
      tb.classList.add('responsive');
      const head = tb.querySelectorAll('thead th');
      const cols = head.length ? Array.from(head).map(th => th.textContent.trim()) : labels || [];
      tb.querySelectorAll('tbody tr').forEach(tr => {
        tr.querySelectorAll('td').forEach((td, i) => td.setAttribute('data-label', cols[i] || (labels?.[i] ?? '')));
      });
    }
    function applyMobileTables() {
      labelize('#users-table', ['用戶名', '角色', '角色ID清單', '操作']);
      labelize('#skill-table', ['類型', '名稱', '初始％', '職業＋', '合計％', '操作']);
      labelize('#item-table', ['名稱', '說明', '數量', '攻擊', '防禦', '操作']);
      labelize('#sf-table', ['名稱', '說明', '目標', '範圍', '距離', '加成1', '加成2', '加成3', 'MP', '操作']);
    }
    window.__applyMobileTables = applyMobileTables;
    document.addEventListener('DOMContentLoaded', applyMobileTables);
  })();
})();