(() => {
  'use strict';

  const DB_KEY = 'dnd-vault-v4';
  const LEGACY_KEY = 'vault-v3.2.7a';
  const THEME_KEY = 'dnd-vault-theme';
  const STAT_KEYS = ['str', 'dex', 'con', 'app', 'pow', 'int', 'siz', 'edu', 'san', 'idea', 'luck', 'know'];
  const STAT_LABELS = { str:'STR', dex:'DEX', con:'CON', app:'APP', pow:'POW', int:'INT', siz:'SIZ', edu:'EDU', san:'SAN', idea:'IDEA', luck:'LUCK', know:'KNOW' };

  const ELEMENT_KEYWORDS = {
    fire: ['blaze','burn','ember','explosion','fireball','flame','furnace','heat','ignite','inferno','lava','magma','pyro','roast','scorched','smoke','spark','wildfire','incendiary','hellfire','火','火焰','炎','燃燒','熔岩'],
    water: ['aqua','current','flood','geyser','hydro','ocean','rain','river','splash','stream','surge','wave','whirlpool','tidal','tsunami','liquid','mist','deluge','bubble','水','海','雨','河','浪','潮'],
    earth: ['boulders','canyon','cave','cliff','crust','dirt','ground','landslide','mineral','mountain','mud','rock','sand','stone','terrain','valley','crystal','pebbles','quake','terra','土','地','石','岩','山','沙'],
    air: ['atmosphere','breeze','cyclone','gust','hurricane','jetstream','tornado','storm','sky','wind','zephyr','aero','whirlwind','air','風','氣流','暴風','龍捲'],
    light: ['beacon','brilliance','flash','glow','illuminate','lamp','light','radiance','ray','shine','sparkle','star','sun','torch','twilight','lantern','luminescence','sunrise','sunset','光','聖光','太陽','照明'],
    dark: ['abyss','eclipse','obsidian','onyx','shadow','umbra','void','midnight','dusk','gloom','murk','shroud','nightfall','nocturnal','blackout','darkness','sinister','暗','黑暗','陰影','虛空','深淵'],
    electric: ['bolt','charge','current','electric','electro','energy','lightning','power','shock','spark','thunder','voltage','zap','magnet','generator','conductor','battery','circuit','coil','電','雷','閃電','雷霆','電擊'],
    ice: ['blizzard','cold','freeze','frost','glacier','hail','ice','icicle','snow','winter','arctic','chill','frostbite','frosty','glacial','shiver','slush','winterland','frozen','冰','雪','寒','霜','凍結'],
    poison: ['poison','toxin','venom','contamination','plague','disease','acid','corrosion','decay','miasma','rot','toxic','bacteria','biohazard','pollution','toxicity','hazard','envenom','antidote','毒','毒素','酸','腐蝕','瘟疫']
  };
  const ELEMENT_NAMES = { fire:'火', water:'水', earth:'地', air:'風', light:'光', dark:'暗', electric:'雷／電', ice:'冰', poison:'毒' };

  const $ = id => document.getElementById(id);
  const asNum = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const uid = prefix => `${prefix}_${crypto?.randomUUID?.().slice(0,8) || Math.random().toString(36).slice(2,10)}`;

  function blankStats() { return Object.fromEntries(STAT_KEYS.map(k => [k, 0])); }
  function deriveStats(stats) {
    const out = { ...blankStats(), ...(stats || {}) };
    out.san = asNum(out.pow) * 5;
    out.idea = asNum(out.int) * 5;
    out.luck = asNum(out.pow) * 5;
    out.know = asNum(out.edu) * 5;
    return out;
  }
  function normaliseCharacter(raw = {}) {
    const direct = {
      str: raw.str ?? raw.STR ?? raw.strength,
      dex: raw.dex ?? raw.DEX ?? raw.dexterous,
      con: raw.con ?? raw.CON ?? raw.constitution,
      app: raw.app ?? raw.APP ?? raw.appearance,
      pow: raw.pow ?? raw.POW ?? raw.power,
      int: raw.int ?? raw.INT ?? raw.intelligence,
      siz: raw.siz ?? raw.SIZ ?? raw.size,
      edu: raw.edu ?? raw.EDU ?? raw.education,
      san: raw.san ?? raw.SAN ?? raw.sanity,
      idea: raw.idea ?? raw.IDEA,
      luck: raw.luck ?? raw.LUCK,
      know: raw.know ?? raw.KNOW
    };
    const mergedStats = { ...blankStats(), ...(raw.stats || {}) };
    STAT_KEYS.forEach(k => { if (direct[k] !== undefined && direct[k] !== null && direct[k] !== '') mergedStats[k] = asNum(direct[k]); });
    const noDerived = ['san','idea','luck','know'].every(k => !asNum(mergedStats[k]));
    const stats = noDerived ? deriveStats(mergedStats) : Object.fromEntries(STAT_KEYS.map(k => [k, asNum(mergedStats[k])]));
    return {
      id: raw.id || uid('C'),
      name: String(raw.name ?? raw.playercharacter ?? raw.pc ?? '').trim(),
      player: String(raw.player ?? raw.playername ?? raw.pl ?? '').trim(),
      job: String(raw.job ?? '').trim(),
      align: String(raw.align ?? '').trim(),
      age: asNum(raw.age),
      gender: String(raw.gender ?? '').trim(),
      exp: asNum(raw.exp),
      stats,
      items: Array.isArray(raw.items) ? raw.items.map(it => ({ name:String(it?.name ?? ''), qty:asNum(it?.qty), weight:asNum(it?.weight), price:asNum(it?.price) })) : [],
      skills: Array.isArray(raw.skills) ? raw.skills.map(sk => ({ name:String(sk?.name ?? ''), proficient:Boolean(sk?.proficient), desc:String(sk?.desc ?? '') })) : []
    };
  }
  function normaliseDB(raw) {
    return {
      version: 4,
      characters: Array.isArray(raw?.characters) ? raw.characters.map(normaliseCharacter) : [],
      media: Array.isArray(raw?.media) ? raw.media.filter(x => x && x.dataUrl).map(x => ({ id:x.id || uid('M'), name:String(x.name || '未命名圖片'), dataUrl:String(x.dataUrl), type:String(x.type || ''), createdAt:asNum(x.createdAt) || Date.now() })) : []
    };
  }
  function loadDB() {
    try {
      const current = localStorage.getItem(DB_KEY);
      if (current) return normaliseDB(JSON.parse(current));
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const migrated = normaliseDB(JSON.parse(legacy));
        localStorage.setItem(DB_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (err) { console.warn('Database load failed', err); }
    return normaliseDB(null);
  }
  let db = loadDB();
  function saveDB() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); updateStorageStatus(); return true; }
    catch (err) { alert('瀏覽器儲存空間不足。請先匯出備份並刪除部分媒體。'); console.error(err); return false; }
  }

  function setTheme(theme) {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem(THEME_KEY, theme);
  }
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    setTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  }

  function filteredCharacters(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return db.characters;
    return db.characters.filter(c => [c.name,c.player,c.job,c.align,c.gender,c.id].some(v => String(v || '').toLowerCase().includes(q)));
  }
  function miniStatsHTML(c) {
    return ['str','dex','con','pow','san'].map(k => `<span class="stat-pill">${STAT_LABELS[k]} ${asNum(c.stats?.[k])}</span>`).join('');
  }
  function bindCharacterCard(node, c) {
    node.querySelector('[data-name]').textContent = c.name || '未命名角色';
    node.querySelector('[data-player]').textContent = c.player ? `PL：${c.player}` : '未設定玩家';
    node.querySelector('[data-id]').textContent = c.id;
    node.querySelector('[data-job]').textContent = c.job || '未設定職業';
    node.querySelector('[data-stats]').innerHTML = miniStatsHTML(c);
    const items = c.items.slice(0,3).map(x => `${x.name}${x.qty ? ` ×${x.qty}` : ''}`).join('、');
    const skills = c.skills.slice(0,3).map(x => `${x.proficient ? '★' : ''}${x.name}`).join('、');
    node.querySelector('[data-items]').textContent = items ? `道具：${items}${c.items.length > 3 ? '…' : ''}` : '道具：—';
    node.querySelector('[data-skills]').textContent = skills ? `技能：${skills}${c.skills.length > 3 ? '…' : ''}` : '技能：—';
    node.querySelector('[data-view]').onclick = () => goDetail(c.id);
    node.querySelector('[data-edit]').onclick = () => openEditor(c.id);
  }
  function characterCard(c) {
    const node = $('tpl-card').content.firstElementChild.cloneNode(true);
    bindCharacterCard(node, c);
    return node;
  }
  function renderCharacters() {
    const grid = $('characters-grid'); if (!grid) return;
    grid.innerHTML = '';
    const list = filteredCharacters($('char-search')?.value);
    list.forEach(c => grid.appendChild(characterCard(c)));
    if (!list.length) grid.innerHTML = '<div class="card muted">沒有符合條件的角色。</div>';
    renderShareList();
    renderHomeStats();
  }
  function renderLookup() {
    const grid = $('lookup-results'); if (!grid) return;
    const q = $('lookup-search')?.value || '';
    const list = q.trim() ? filteredCharacters(q) : [];
    grid.innerHTML = '';
    if (!q.trim()) { grid.innerHTML = '<div class="card muted">輸入玩家姓名或角色資料開始搜尋。</div>'; return; }
    list.forEach(c => grid.appendChild(characterCard(c)));
    if (!list.length) grid.innerHTML = '<div class="card muted">No record found。</div>';
  }
  function renderGM() {
    const tbody = $('gm-table')?.querySelector('tbody'); if (!tbody) return;
    const list = filteredCharacters($('gm-search')?.value);
    tbody.innerHTML = '';
    list.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${esc(c.name || '未命名')}</strong><br><span class="muted tiny">${esc(c.id)}</span></td><td>${esc(c.player || '—')}</td><td>${esc(c.job || '—')}</td><td>${asNum(c.stats.str)}</td><td>${asNum(c.stats.dex)}</td><td>${asNum(c.stats.con)}</td><td>${asNum(c.stats.pow)}</td><td>${asNum(c.stats.san)}</td><td><div class="table-actions"><button class="button small" data-gm-edit>編輯</button><button class="button small danger" data-gm-delete>刪除</button></div></td>`;
      tr.querySelector('[data-gm-edit]').onclick = () => openEditor(c.id);
      tr.querySelector('[data-gm-delete]').onclick = () => deleteCharacter(c.id);
      tbody.appendChild(tr);
    });
    if (!list.length) tbody.innerHTML = '<tr><td colspan="9" class="muted">（沒有角色）</td></tr>';
  }
  function renderHomeStats() {
    if ($('home-char-count')) $('home-char-count').textContent = db.characters.length;
    if ($('home-player-count')) $('home-player-count').textContent = new Set(db.characters.map(c => c.player.trim().toLowerCase()).filter(Boolean)).size;
    if ($('home-media-count')) $('home-media-count').textContent = db.media.length;
  }
  function renderAll() { renderCharacters(); renderLookup(); renderGM(); renderMedia(); renderHomeStats(); }

  function deleteCharacter(id) {
    const c = db.characters.find(x => x.id === id);
    if (!c || !confirm(`確定刪除「${c.name || c.id}」？`)) return;
    db.characters = db.characters.filter(x => x.id !== id);
    saveDB(); renderAll();
    if (location.hash.startsWith('#detail/')) show('#characters');
  }

  function formField(form, name) { return form.elements.namedItem(name); }
  function setFormValue(form, name, value) { const el = formField(form, name); if (el) el.value = value ?? ''; }
  function getFormValue(form, name) { return formField(form, name)?.value ?? ''; }
  function syncDerivedFields(form) {
    const pow = asNum(getFormValue(form,'stat-pow'));
    const int = asNum(getFormValue(form,'stat-int'));
    const edu = asNum(getFormValue(form,'stat-edu'));
    setFormValue(form,'stat-san',pow * 5);
    setFormValue(form,'stat-idea',int * 5);
    setFormValue(form,'stat-luck',pow * 5);
    setFormValue(form,'stat-know',edu * 5);
  }
  function openEditor(id) {
    const dlg = $('char-dialog'), form = $('char-form'); if (!dlg || !form) return;
    const existing = db.characters.find(x => x.id === id);
    const c = existing ? normaliseCharacter(existing) : normaliseCharacter({ id:uid('C') });
    $('char-title').textContent = existing ? `編輯：${c.name || c.id}` : '新增角色';
    ['id','name','player','job','align','age','gender','exp'].forEach(k => setFormValue(form,k,c[k]));
    STAT_KEYS.forEach(k => setFormValue(form,`stat-${k}`,c.stats[k]));
    $('delete-character').classList.toggle('hidden', !existing);
    $('delete-character').onclick = () => { if (existing) { dlg.close(); deleteCharacter(c.id); } };
    form.oninput = e => { if (['stat-pow','stat-int','stat-edu'].includes(e.target?.name)) syncDerivedFields(form); };
    $('random-stats').onclick = () => {
      ['str','dex','con','app','pow','int','siz','edu'].forEach(k => setFormValue(form,`stat-${k}`,Math.floor(Math.random()*13)+3));
      syncDerivedFields(form);
    };
    form.onsubmit = e => {
      e.preventDefault();
      if (e.submitter?.value === 'cancel') { dlg.close(); return; }
      const name = getFormValue(form,'name').trim();
      if (!name) { alert('請輸入探索者姓名。'); return; }
      const stats = Object.fromEntries(STAT_KEYS.map(k => [k,asNum(getFormValue(form,`stat-${k}`))]));
      const next = normaliseCharacter({
        ...c,
        id:getFormValue(form,'id'), name,
        player:getFormValue(form,'player'), job:getFormValue(form,'job'), align:getFormValue(form,'align'),
        age:getFormValue(form,'age'), gender:getFormValue(form,'gender'), exp:getFormValue(form,'exp'), stats
      });
      const idx = db.characters.findIndex(x => x.id === next.id);
      if (idx >= 0) db.characters[idx] = next; else db.characters.push(next);
      saveDB(); dlg.close(); renderAll();
      if (location.hash.startsWith('#detail/')) renderDetail(next.id);
    };
    dlg.showModal();
  }

  function goDetail(id) { history.pushState({}, '', `#detail/${encodeURIComponent(id)}`); show(location.hash); }
  function renderDetail(id) {
    const c = db.characters.find(x => x.id === decodeURIComponent(id));
    if (!c) { alert('找不到角色'); show('#characters'); return; }
    $('d-name').textContent = c.name || '角色詳情';
    $('d-sub').textContent = [c.job,c.align].filter(Boolean).join(' • ');
    ['player','job','align','age','gender','exp','id'].forEach(k => { const el = $(`d-${k}`); if (el) el.textContent = c[k] || (['age','exp'].includes(k) ? '0' : '—'); });
    $('d-stats').innerHTML = STAT_KEYS.map(k => `<div class="stat-box"><span>${STAT_LABELS[k]}</span><strong>${asNum(c.stats[k])}</strong></div>`).join('');
    const itemsBody = $('tbl-items').querySelector('tbody'); itemsBody.innerHTML = '';
    c.items.forEach(it => { const tr=document.createElement('tr'); tr.innerHTML=`<td>${esc(it.name)}</td><td>${asNum(it.qty)}</td><td>${asNum(it.weight)}</td><td>${asNum(it.price)}</td>`; itemsBody.appendChild(tr); });
    if (!c.items.length) itemsBody.innerHTML='<tr><td colspan="4" class="muted">（無）</td></tr>';
    const skillsBody = $('tbl-skills').querySelector('tbody'); skillsBody.innerHTML='';
    c.skills.forEach(sk => { const tr=document.createElement('tr'); tr.innerHTML=`<td>${sk.proficient?'★ ':''}${esc(sk.name)}</td><td>${sk.proficient?'是':'否'}</td><td>${esc(sk.desc)}</td>`; skillsBody.appendChild(tr); });
    if (!c.skills.length) skillsBody.innerHTML='<tr><td colspan="3" class="muted">（無）</td></tr>';
    $('d-edit').onclick = () => openEditor(c.id);
    $('d-export').onclick = () => download(`${safeFilename(c.name || c.id)}.json`, JSON.stringify(c,null,2), 'application/json');
    $('d-print').onclick = () => print();
    $('d-back').onclick = () => history.back();
  }

  function show(hash) {
    const raw = String(hash || '#home');
    if (raw.startsWith('#p=')) return;
    const match = raw.match(/^#([^/]+)(?:\/(.+))?/);
    const page = match?.[1] || 'home';
    const arg = match?.[2] || null;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const target = $(`page-${page}`) || $('page-home');
    target.classList.remove('hidden');
    if (page === 'detail' && arg) renderDetail(arg);
    if (page === 'gm') renderGM();
    if (page === 'lookup') renderLookup();
    if (page === 'media') renderMedia();
    scrollTo({top:0,behavior:'auto'});
  }

  function safeFilename(name) { return String(name || 'file').replace(/[\\/:*?"<>|]+/g,'_').slice(0,80); }
  function download(name, content, type='text/plain;charset=utf-8') {
    const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  function getCell(ws, addr, {followMerged=true,scanRight=0}={}) {
    if (!ws) return '';
    const direct = ws[addr]?.v;
    if (direct !== undefined && String(direct).trim() !== '') return String(direct).trim();
    if (followMerged && Array.isArray(ws['!merges'])) {
      const target = XLSX.utils.decode_cell(addr);
      for (const m of ws['!merges']) if (target.r>=m.s.r && target.r<=m.e.r && target.c>=m.s.c && target.c<=m.e.c) {
        const v=ws[XLSX.utils.encode_cell(m.s)]?.v; if (v!==undefined && String(v).trim()!=='') return String(v).trim();
      }
    }
    if (scanRight > 0) {
      const target=XLSX.utils.decode_cell(addr);
      for(let i=1;i<=scanRight;i++){const v=ws[XLSX.utils.encode_cell({r:target.r,c:target.c+i})]?.v;if(v!==undefined&&String(v).trim()!=='')return String(v).trim();}
    }
    return '';
  }
  function pickRightByLabel(ws, labels, scanRight=10) {
    if (!ws?.['!ref']) return '';
    const range=XLSX.utils.decode_range(ws['!ref']);
    const clean=s=>String(s||'').replace(/[\s:：/_-]/g,'').toUpperCase();
    const targets=new Set(labels.map(clean));
    for(let r=range.s.r;r<=Math.min(range.e.r,600);r++) for(let c=range.s.c;c<=Math.min(range.e.c,120);c++) {
      const v=ws[XLSX.utils.encode_cell({r,c})]?.v; if(!v||!targets.has(clean(v))) continue;
      for(let k=1;k<=scanRight;k++){const got=getCell(ws,XLSX.utils.encode_cell({r,c:c+k}),{followMerged:true});if(got)return got;}
    }
    return '';
  }
  function readTableSheet(wb, sheetNames, patterns) {
    const ws=sheetNames.map(n=>wb.Sheets[n]).find(Boolean); if(!ws?.['!ref']) return [];
    const R=XLSX.utils.decode_range(ws['!ref']); let headerRow=-1,headers=[];
    for(let r=R.s.r;r<=Math.min(R.s.r+5,R.e.r);r++){
      const row=[]; for(let c=R.s.c;c<=R.e.c;c++) row.push(String(getCell(ws,XLSX.utils.encode_cell({r,c}),{followMerged:true})||'').trim());
      if(row.some(x=>patterns.name.test(x))){headerRow=r;headers=row;break;}
    }
    if(headerRow<0)return[];
    const idx={}; Object.entries(patterns).forEach(([key,re])=>idx[key]=headers.findIndex(h=>re.test(h)));
    const out=[];
    for(let r=headerRow+1;r<=R.e.r;r++){
      const row={}; let has=false;
      Object.entries(idx).forEach(([key,i])=>{const val=i>=0?String(getCell(ws,XLSX.utils.encode_cell({r,c:R.s.c+i}),{followMerged:true})||'').trim():'';row[key]=val;if(val)has=true;});
      if(has)out.push(row);
    }
    return out;
  }
  async function importExcel(file) {
    const hud=$('excel-status');
    try {
      hud.textContent='載入中…'; hud.className='status';
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
      const ws=wb.Sheets['人物表(自動計算)']||wb.Sheets['人物表']||wb.Sheets[wb.SheetNames[0]];
      const name=getCell(ws,'I2',{followMerged:true,scanRight:10})||pickRightByLabel(ws,['探索者姓名','角色姓名','姓名','角色名','名稱','PC']);
      if(!name)throw new Error('找不到探索者姓名');
      const pick=(labels,addr='') => (addr?getCell(ws,addr,{followMerged:true,scanRight:10}):'') || pickRightByLabel(ws,labels);
      const stats={
        str:asNum(pick(['STR','力量','Strength'])), dex:asNum(pick(['DEX','敏捷','Dexterity'])), con:asNum(pick(['CON','體質','Constitution'])), app:asNum(pick(['APP','外表','Appearance'])),
        pow:asNum(pick(['POW','意志','Power'])), int:asNum(pick(['INT','智力','Intelligence'])), siz:asNum(pick(['SIZ','體型','Size'])), edu:asNum(pick(['EDU','教育','Education'])),
        san:asNum(pick(['SAN','SAN值','Sanity'])), idea:asNum(pick(['IDEA','靈感'])), luck:asNum(pick(['LUCK','幸運'])), know:asNum(pick(['KNOW','知識']))
      };
      const items=readTableSheet(wb,['持有道具','道具','物品'],{name:/名稱|物品|道具|Name/i,qty:/數量|Qty|数量/i,weight:/重量|Weight/i,price:/價格|價錢|金額|Price|GP/i}).map(x=>({name:x.name,qty:asNum(x.qty),weight:asNum(x.weight),price:asNum(x.price)}));
      const skills=readTableSheet(wb,['持有技能法術','技能','法術'],{name:/名稱|技能|法術|Name/i,proficient:/熟練|Proficien/i,desc:/描述|效果|說明|Desc/i}).map(x=>({name:x.name,proficient:/^y|^t|true|是|有|✓|✔/i.test(x.proficient),desc:x.desc}));
      const incoming=normaliseCharacter({
        name, player:pick(['玩家姓名','PL','Player']), job:pick(['職業','Job'],'I3'), align:pick(['陣營','Alignment'],'I4'), age:pick(['年齡','Age'],'I5'), gender:pick(['性別','Gender'],'I6'), exp:pick(['EXP','經驗'],'I7'), stats, items, skills
      });
      const idx=db.characters.findIndex(c=>c.name.trim().toLowerCase()===incoming.name.trim().toLowerCase());
      if(idx>=0){incoming.id=db.characters[idx].id;db.characters[idx]={...db.characters[idx],...incoming};hud.textContent=`更新完成：${incoming.name}`;}
      else{db.characters.push(incoming);hud.textContent=`新增完成：${incoming.name}`;}
      hud.classList.add('ok'); saveDB(); renderAll(); show('#characters');
    } catch(err){hud.textContent=`錯誤：${err.message||err}`;hud.classList.add('err');}
    finally{setTimeout(()=>{hud.textContent='';hud.className='status';},4000);}
  }

  const ITER=150000, encoder=new TextEncoder(), decoder=new TextDecoder();
  const toB64=u8=>btoa(String.fromCharCode(...u8));
  const fromB64=s=>new Uint8Array(atob(s).split('').map(c=>c.charCodeAt(0)));
  async function deriveKey(password,salt){const mat=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITER,hash:'SHA-256'},mat,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  async function encryptText(text,password){const iv=crypto.getRandomValues(new Uint8Array(12)),salt=crypto.getRandomValues(new Uint8Array(16)),key=await deriveKey(password,salt),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(text));return{v:1,alg:'AES-GCM',kdf:'PBKDF2',iter:ITER,iv:toB64(iv),salt:toB64(salt),data:toB64(new Uint8Array(ct))};}
  async function decryptPkg(pkg,password){const iv=fromB64(pkg.iv),salt=fromB64(pkg.salt),key=await deriveKey(password,salt),pt=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,fromB64(pkg.data));return decoder.decode(pt);}
  function renderShareList(){const box=$('share-characters');if(!box)return;box.innerHTML='';db.characters.forEach(c=>{const label=document.createElement('label');label.className='item';const input=document.createElement('input');input.type='checkbox';input.value=c.id;const span=document.createElement('span');span.textContent=`${c.name}${c.player?` — ${c.player}`:''}`;label.append(input,span);box.appendChild(label);});if(!db.characters.length)box.innerHTML='<span class="muted">沒有角色。</span>';}
  let pendingShare=null;
  async function makeShare(){const ids=[...document.querySelectorAll('#share-characters input:checked')].map(x=>x.value),pass=$('share-pass').value;if(!ids.length)return alert('請選擇角色。');if(pass.length<4)return alert('密碼至少 4 碼。');const characters=db.characters.filter(c=>ids.includes(c.id));const pkg=await encryptText(JSON.stringify({characters}),pass);download(`share-${safeFilename(characters[0]?.name||'player')}-${Date.now()}.json`,JSON.stringify({meta:{ts:Date.now(),count:characters.length,ids},pkg},null,2),'application/json');}
  async function openShareObject(obj,pass){const text=await decryptPkg(obj.pkg,pass),data=JSON.parse(text),incoming=(data.characters||[]).map(normaliseCharacter);db.characters=incoming;saveDB();renderAll();show('#characters');alert('分享包已匯入。現有角色清單已替換為分享包內容。');}
  async function tryOpenHashPackage(){const m=location.hash.match(/^#p=(.+)$/);if(!m)return;const name=decodeURIComponent(m[1]);if(name.includes('..')||/[\\/]/.test(name))return alert('分享包檔名無效。');try{const res=await fetch(`/p/${encodeURIComponent(name)}`);if(!res.ok)throw new Error('找不到分享包');const obj=await res.json();const pass=prompt('輸入分享包密碼');if(!pass)return;await openShareObject(obj,pass);}catch(err){alert(`無法開啟分享包：${err.message||err}`);}}

  function tokenise(text){return String(text||'').toLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]+/g)||[];}
  function classifyElements(text){const lower=String(text||'').toLowerCase(),tokens=tokenise(text);return Object.entries(ELEMENT_KEYWORDS).map(([type,keywords])=>{const matches=[...new Set(keywords.filter(k=>k.length===1?lower.includes(k):tokens.includes(k.toLowerCase())||lower.includes(k.toLowerCase())) )];return{type,matches,score:matches.length};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);}
  function renderElementResult(){const text=$('element-input').value.trim(),box=$('element-result');if(!text){box.className='result-box muted';box.textContent='請先輸入動作、技能或描述。';return;}const result=classifyElements(text);if(!result.length){box.className='result-box muted';box.textContent='未識別到已知元素。';return;}box.className='result-box';box.innerHTML=`<div class="result-chips">${result.map(x=>`<div class="result-chip"><strong>${ELEMENT_NAMES[x.type]} (${x.type})</strong><small>命中：${x.matches.map(esc).join('、')}</small></div>`).join('')}</div>`;}

  let mazeText='';
  function shuffledDirections(){return [[-1,0],[1,0],[0,-1],[0,1]].sort(()=>Math.random()-.5);}
  function generateMaze(width,height){
    width=Math.max(3,Math.min(40,asNum(width)));height=Math.max(3,Math.min(40,asNum(height)));
    const rows=height*2+1,cols=width*2+1,grid=Array.from({length:rows},()=>Array(cols).fill('█')),visited=Array.from({length:height},()=>Array(width).fill(false));
    const stack=[[0,0]];visited[0][0]=true;grid[1][1]=' ';
    while(stack.length){const [y,x]=stack[stack.length-1];const candidates=shuffledDirections().map(([dy,dx])=>[y+dy,x+dx,dy,dx]).filter(([ny,nx])=>ny>=0&&ny<height&&nx>=0&&nx<width&&!visited[ny][nx]);if(!candidates.length){stack.pop();continue;}const [ny,nx,dy,dx]=candidates[0];visited[ny][nx]=true;grid[1+y*2+dy][1+x*2+dx]=' ';grid[1+ny*2][1+nx*2]=' ';stack.push([ny,nx]);}
    grid[1][0]=' ';grid[rows-2][cols-1]=' ';
    return grid.map(r=>r.join('')).join('\n');
  }
  function doGenerateMaze(){mazeText=generateMaze($('maze-width').value,$('maze-height').value);$('maze-output').textContent=mazeText;}

  async function compressImage(file){
    if(!file?.type?.startsWith('image/'))throw new Error('請選擇圖片檔。');
    const source=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
    if(file.type==='image/gif')return source;
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=source;});
    const max=1200,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',.82);
  }
  function renderMedia(){const grid=$('media-grid');if(!grid)return;const q=String($('media-search')?.value||'').trim().toLowerCase(),list=db.media.filter(m=>!q||m.name.toLowerCase().includes(q));grid.innerHTML='';list.forEach(m=>{const article=document.createElement('article');article.className='card media-card';const img=document.createElement('img');img.src=m.dataUrl;img.alt=m.name;const body=document.createElement('div');body.className='media-card-body';const h=document.createElement('h3');h.textContent=m.name;const p=document.createElement('p');p.className='muted tiny';p.textContent=new Date(m.createdAt).toLocaleString();const buttons=document.createElement('div');buttons.className='controls-row';const dl=document.createElement('button');dl.className='button small ghost';dl.textContent='下載';dl.onclick=()=>{const a=document.createElement('a');a.href=m.dataUrl;a.download=`${safeFilename(m.name)}.${m.dataUrl.startsWith('data:image/png')?'png':m.dataUrl.startsWith('data:image/gif')?'gif':'jpg'}`;a.click();};const del=document.createElement('button');del.className='button small danger';del.textContent='刪除';del.onclick=()=>{if(confirm(`刪除圖片「${m.name}」？`)){db.media=db.media.filter(x=>x.id!==m.id);saveDB();renderMedia();renderHomeStats();}};buttons.append(dl,del);body.append(h,p,buttons);article.append(img,body);grid.appendChild(article);});if(!list.length)grid.innerHTML='<div class="card muted">（沒有符合條件的圖片）</div>';}
  async function addMedia(){const name=$('media-name').value.trim(),file=$('media-file').files?.[0];if(!name)return alert('請輸入圖片名稱。');if(!file)return alert('請選擇圖片。');if(db.media.some(m=>m.name.toLowerCase()===name.toLowerCase())&&!confirm('已有同名圖片，仍然新增？'))return;try{const dataUrl=await compressImage(file);db.media.unshift({id:uid('M'),name,dataUrl,type:file.type,createdAt:Date.now()});if(saveDB()){$('media-name').value='';$('media-file').value='';renderMedia();renderHomeStats();}}catch(err){alert(err.message||err);}}

  function updateStorageStatus(){const el=$('storage-status');if(!el)return;const bytes=new Blob([JSON.stringify(db)]).size;el.textContent=`目前瀏覽器資料約 ${(bytes/1024).toFixed(bytes>1024*1024?0:1)} KB${bytes>1024*1024?` (${(bytes/1024/1024).toFixed(2)} MB)`:''}。資料只存在此瀏覽器，除非你匯出或使用分享包。`;}

  function wireEvents(){
    document.addEventListener('click',e=>{const a=e.target.closest('[data-route]');if(!a)return;e.preventDefault();const href=a.getAttribute('href');history.pushState({},'',href);show(href);});
    window.addEventListener('popstate',()=>show(location.hash||'#home'));
    $('theme-toggle').onclick=()=>setTheme(document.documentElement.classList.contains('light')?'dark':'light');
    $('home-new').onclick=()=>openEditor(null); $('add-character').onclick=()=>openEditor(null); $('gm-add').onclick=()=>openEditor(null);
    $('char-search').addEventListener('input',renderCharacters); $('lookup-search').addEventListener('input',renderLookup); $('gm-search').addEventListener('input',renderGM);
    $('excel-import').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await importExcel(f);e.target.value='';});
    $('export-json').onclick=()=>download(`dnd-vault-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(db,null,2),'application/json');
    $('import-json').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{db=normaliseDB(JSON.parse(await f.text()));saveDB();renderAll();show('#home');alert('完整備份已匯入。');}catch(err){alert(`JSON 格式錯誤：${err.message||err}`);}finally{e.target.value='';}});
    $('share-select-all').onclick=()=>document.querySelectorAll('#share-characters input[type=checkbox]').forEach(x=>x.checked=true);
    $('share-unselect-all').onclick=()=>document.querySelectorAll('#share-characters input[type=checkbox]').forEach(x=>x.checked=false);
    $('share-make').onclick=makeShare;
    $('pkg-import').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{pendingShare=JSON.parse(await f.text());alert('分享包已讀取，請輸入密碼。');}catch{pendingShare=null;alert('分享包格式錯誤。');}finally{e.target.value='';}});
    $('pkg-open').onclick=async()=>{if(!pendingShare)return alert('請先選擇分享包。');const pass=$('pkg-pass').value;if(!pass)return alert('請輸入密碼。');try{await openShareObject(pendingShare,pass);pendingShare=null;$('pkg-pass').value='';}catch{alert('密碼錯誤或檔案毀損。');}};
    $('element-classify').onclick=renderElementResult; $('element-clear').onclick=()=>{$('element-input').value='';$('element-result').className='result-box muted';$('element-result').textContent='等待輸入。';};
    $('maze-generate').onclick=doGenerateMaze; $('maze-copy').onclick=async()=>{if(!mazeText)doGenerateMaze();try{await navigator.clipboard.writeText(mazeText);alert('迷宮已複製。');}catch{alert('瀏覽器無法使用剪貼簿，請手動複製。');}}; $('maze-download').onclick=()=>{if(!mazeText)doGenerateMaze();download(`maze-${$('maze-width').value}x${$('maze-height').value}.txt`,mazeText);};
    $('media-upload').onclick=addMedia; $('media-search').addEventListener('input',renderMedia);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    initTheme(); wireEvents(); $('year').textContent=new Date().getFullYear(); renderAll(); updateStorageStatus();
    if(location.hash.startsWith('#p=')) tryOpenHashPackage(); else show(location.hash||'#home');
  });
})();
