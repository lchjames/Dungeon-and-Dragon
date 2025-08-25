(function(){
  const THEME_KEY='vault-theme'; const DB_KEY='vault-excel-db-v1';
  let db = loadDB();
  function loadDB(){ try{ return JSON.parse(localStorage.getItem(DB_KEY)) || def(); }catch{ return def(); } }
  function saveDB(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function def(){ return { character:{ name:'', job:'', align:'', age:null, gender:'', exp:0, skills:[] }, money:{cp:0,sp:0,gp:0}, items:[], spellskills:[] }; }
  const uid = ()=>Math.random().toString(36).slice(2,10);

  // Router
  const pages = { character:byId('page-character'), items:byId('page-items'), skills:byId('page-skills'), backup:byId('page-backup') };
  document.querySelectorAll('[data-route]').forEach(a=>a.addEventListener('click',e=>{ e.preventDefault(); const h=a.getAttribute('href'); history.pushState({},'',h); show(h); }));
  window.addEventListener('popstate',()=>show(location.hash||'#character')); show(location.hash||'#character');
  function show(hash){ Object.values(pages).forEach(p=>p.classList.add('hidden')); (pages[(hash||'#character').replace('#','')]||pages.character).classList.remove('hidden'); }
  // Theme
  const theme = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'); document.documentElement.setAttribute('data-theme',theme);
  byId('theme-toggle').addEventListener('click', ()=>{ const c=document.documentElement.getAttribute('data-theme'); const n=c==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme',n); localStorage.setItem(THEME_KEY,n); });
  byId('year').textContent=new Date().getFullYear();

  // Character form binding
  bindValue('f-name', v=>db.character.name=v, ()=>db.character.name);
  bindValue('f-job', v=>db.character.job=v, ()=>db.character.job);
  bindValue('f-align', v=>db.character.align=v, ()=>db.character.align);
  bindValue('f-age', v=>db.character.age=toNum(v), ()=>db.character.age??'');
  bindValue('f-gender', v=>db.character.gender=v, ()=>db.character.gender);
  bindValue('f-exp', v=>db.character.exp=toNum(v), ()=>db.character.exp??0);

  // Skill table (type/name/base/prof/total)
  const skillTBody = byId('skill-table').querySelector('tbody');
  function renderSkills(){
    skillTBody.innerHTML='';
    db.character.skills.forEach((s,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><input value="${s.type||''}"></td>
        <td><input value="${s.name||''}"></td>
        <td><input type="number" value="${s.base??0}"></td>
        <td><input type="number" value="${s.prof??0}"></td>
        <td class="muted">${(Number(s.base||0)+Number(s.prof||0))}</td>
        <td><button class="button small">刪</button></td>`;
      const inputs=tr.querySelectorAll('input');
      inputs[0].addEventListener('input',e=>{ s.type=e.target.value; saveDB(); });
      inputs[1].addEventListener('input',e=>{ s.name=e.target.value; saveDB(); });
      inputs[2].addEventListener('input',e=>{ s.base=toNum(e.target.value); tr.children[4].textContent=(Number(s.base||0)+Number(s.prof||0)); saveDB(); });
      inputs[3].addEventListener('input',e=>{ s.prof=toNum(e.target.value); tr.children[4].textContent=(Number(s.base||0)+Number(s.prof||0)); saveDB(); });
      tr.querySelector('button').addEventListener('click',()=>{ db.character.skills.splice(i,1); saveDB(); renderSkills(); });
      skillTBody.appendChild(tr);
    });
  }
  byId('skill-add').addEventListener('click', ()=>{
    db.character.skills.push({type:val('skill-type'), name:val('skill-name'), base:toNum(val('skill-base')), prof:toNum(val('skill-prof'))});
    ['skill-type','skill-name','skill-base','skill-prof'].forEach(id=>byId(id).value='');
    saveDB(); renderSkills();
  });

  // Money & items
  bindValue('money-cp', v=>db.money.cp=toNum(v), ()=>db.money.cp??0);
  bindValue('money-sp', v=>db.money.sp=toNum(v), ()=>db.money.sp??0);
  bindValue('money-gp', v=>db.money.gp=toNum(v), ()=>db.money.gp??0);

  const itemsTBody = byId('item-table').querySelector('tbody');
  function renderItems(){
    itemsTBody.innerHTML='';
    db.items.forEach((it,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><input value="${it.name||''}"></td>
        <td><input value="${it.desc||''}"></td>
        <td><input type="number" min="1" value="${it.qty||1}"></td>
        <td><input type="number" value="${it.atk||0}"></td>
        <td><input type="number" value="${it.def||0}"></td>
        <td><button class="button small">刪</button></td>`;
      const ins=tr.querySelectorAll('input');
      ins[0].addEventListener('input',e=>{ it.name=e.target.value; saveDB(); });
      ins[1].addEventListener('input',e=>{ it.desc=e.target.value; saveDB(); });
      ins[2].addEventListener('input',e=>{ it.qty=toNum(e.target.value)||1; saveDB(); });
      ins[3].addEventListener('input',e=>{ it.atk=toNum(e.target.value)||0; saveDB(); });
      ins[4].addEventListener('input',e=>{ it.def=toNum(e.target.value)||0; saveDB(); });
      tr.querySelector('button').addEventListener('click',()=>{ db.items.splice(i,1); saveDB(); renderItems(); });
      itemsTBody.appendChild(tr);
    });
  }
  byId('item-add').addEventListener('click', ()=>{
    db.items.push({name:val('item-name'), desc:val('item-desc'), qty:toNum(val('item-qty'))||1, atk:toNum(val('item-atk'))||0, def:toNum(val('item-def'))||0});
    ['item-name','item-desc','item-qty','item-atk','item-def'].forEach(id=>byId(id).value=id==='item-qty'?'1':''); saveDB(); renderItems();
  });

  // Spell/skills grid
  const sfTBody = byId('sf-table').querySelector('tbody');
  function renderSF(){
    sfTBody.innerHTML='';
    db.spellskills.forEach((s,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML = ['name','desc','target','area','range','b1','b2','b3','mp'].map(k=>`<td><input value="${s[k]??''}"></td>`).join('') + `<td><button class="button small">刪</button></td>`;
      const ks=['name','desc','target','area','range','b1','b2','b3','mp'];
      tr.querySelectorAll('input').forEach((inp,idx)=>inp.addEventListener('input',e=>{ s[ks[idx]]=e.target.value; saveDB(); }));
      tr.querySelector('button').addEventListener('click',()=>{ db.spellskills.splice(i,1); saveDB(); renderSF(); });
      sfTBody.appendChild(tr);
    });
  }
  byId('sf-add').addEventListener('click', ()=>{
    db.spellskills.push({ name:val('sf-name'), desc:val('sf-desc'), target:val('sf-target'), area:val('sf-area'), range:val('sf-range'), b1:val('sf-b1'), b2:val('sf-b2'), b3:val('sf-b3'), mp:val('sf-mp') });
    ['sf-name','sf-desc','sf-target','sf-area','sf-range','sf-b1','sf-b2','sf-b3','sf-mp'].forEach(id=>byId(id).value='');
    saveDB(); renderSF();
  });

  // Backup
  byId('export-json').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(db,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='vault-excel.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  byId('import-file').addEventListener('change', async e=>{
    const f=e.target.files?.[0]; if(!f) return;
    try{ const text=await f.text(); const data=JSON.parse(text); if(!data.character) throw new Error('格式不正確'); db=data; saveDB(); hydrate(); alert('匯入完成'); }
    catch(err){ alert('匯入失敗：'+err.message); }
    finally{ e.target.value=''; }
  });

  // Excel import (basic mapping for your sheets)
 // Excel import（使用 SheetJS 解析三個工作表）
byId('import-excel').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    // 讀檔與解析 workbook
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    // 小工具：把工作表變成 2D 陣列（每列都是一個陣列）
    const toRows = (sheetName) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return [];
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    };

    // --- 1) 人物表(自動計算) -> 角色基本資料 ---
    // 會掃描整張表，找出「探索者姓名 / 職業 / 陣營 / 年齡 / 性別 / EXP」的值（在同一列的下一格）
    const charRows = toRows('人物表(自動計算)');
    const pickValue = (labels) => {
      // 到處找第一欄/任意欄出現 label 的列
      for (const row of charRows) {
        for (let c = 0; c < row.length; c++) {
          const cell = String(row[c]).trim();
          if (labels.includes(cell)) {
            // 取右邊一格（如果沒有就取下一列第一格）
            return row[c + 1] ?? '';
          }
        }
      }
      return '';
    };
    const char = {
      name: String(pickValue(['探索者姓名', '姓名'])).trim(),
      job: String(pickValue(['職業'])).trim(),
      align: String(pickValue(['陣營'])).trim(),
      age: Number(pickValue(['年齡'])) || 0,
      gender: String(pickValue(['性別'])).trim(),
      exp: Number(pickValue(['EXP', '經驗'])) || 0,
      // Excel 內若沒有技能列表，就保持空陣列；你之後亦可擴充掃描
      skills: []
    };

    // --- 2) 持有道具 -> 金錢 + 物品 ---
    const itemsRows = toRows('持有道具');

    // 2a: 金錢：尋找列首為「銅幣/銀幣/金幣」的行，右邊一格數值
    const money = { cp: 0, sp: 0, gp: 0 };
    for (const r of itemsRows) {
      const k = String(r[0]).trim();
      if (!k) continue;
      if (k.includes('銅幣')) money.cp = Number(r[1]) || 0;
      if (k.includes('銀幣')) money.sp = Number(r[1]) || 0;
      if (k.includes('金幣')) money.gp = Number(r[1]) || 0;
    }

    // 2b: 物品清單：找到表頭列（含「物品名稱」「說明」「數量」「攻擊力」「防禦力」這些字）
    const headerIdx = itemsRows.findIndex((row) => {
      const line = row.map((x) => String(x)).join('|');
      return (
        /物品/.test(line) &&
        (/名稱|名/.test(line)) &&
        /說明/.test(line) &&
        /數量/.test(line)
      );
    });
    const items = [];
    if (headerIdx >= 0) {
      const header = itemsRows[headerIdx].map((s) => String(s).trim());
      const col = (nameList) => {
        // 回傳符合其中任一欄名的 index；找不到就 -1
        for (const name of nameList) {
          const i = header.findIndex((h) => h.includes(name));
          if (i !== -1) return i;
        }
        return -1;
      };
      const cName = col(['物品名稱', '名稱', '名']);
      const cDesc = col(['說明', '描述']);
      const cQty  = col(['數量']);
      const cAtk  = col(['攻擊力', '攻擊']);
      const cDef  = col(['防禦力', '防禦']);

      for (let r = headerIdx + 1; r < itemsRows.length; r++) {
        const row = itemsRows[r];
        const name = String(row[cName] ?? '').trim();
        if (!name) continue; // 空行/結束

        const it = {
          name,
          desc: String(row[cDesc] ?? '').trim(),
          qty: Number(row[cQty] ?? 1) || 1,
          atk: Number(row[cAtk] ?? 0) || 0,
          def: Number(row[cDef] ?? 0) || 0
        };
        items.push(it);
      }
    }

    // --- 3) 持有技能法術 -> spellskills ---
    // 欄位：技能名稱 / 說明 / 目標 / 效應範圍 / 效應距離 / 加成1~3 / 消耗法力
    const sfRows = toRows('持有技能法術');
    let sfHeaderIdx = sfRows.findIndex((row) => {
      const l = row.map((x) => String(x)).join('|');
      return /技能名稱|名稱/.test(l) && /說明/.test(l);
    });
    const spellskills = [];
    if (sfHeaderIdx === -1) sfHeaderIdx = 0; // 若沒有表頭，視第 0 列為資料起點

    const headerSF = (sfRows[sfHeaderIdx] || []).map((s) => String(s).trim());
    const colSF = (names) => {
      for (const n of names) {
        const i = headerSF.findIndex((h) => h.includes(n));
        if (i !== -1) return i;
      }
      return -1;
    };
    const cN = colSF(['技能名稱', '名稱']);
    const cD = colSF(['說明', '描述']);
    const cT = colSF(['目標']);
    const cA = colSF(['效應範圍', '範圍']);
    const cR = colSF(['效應距離', '距離']);
    const cB1 = colSF(['加成1', '加成一']);
    const cB2 = colSF(['加成2', '加成二']);
    const cB3 = colSF(['加成3', '加成三']);
    const cMP = colSF(['消耗法力', 'MP', '法力']);

    for (let r = sfHeaderIdx + 1; r < sfRows.length; r++) {
      const row = sfRows[r];
      const name = String(row[cN] ?? '').trim();
      const desc = String(row[cD] ?? '').trim();
      // 沒有名稱又沒有說明就略過
      if (!name && !desc) continue;
      spellskills.push({
        name,
        desc,
        target: String(row[cT] ?? '').trim(),
        area: String(row[cA] ?? '').trim(),
        range: String(row[cR] ?? '').trim(),
        b1: String(row[cB1] ?? '').trim(),
        b2: String(row[cB2] ?? '').trim(),
        b3: String(row[cB3] ?? '').trim(),
        mp: String(row[cMP] ?? '').trim()
      });
    }

    // --- 寫回本地資料庫並刷新畫面 ---
    db.character = char;
    db.money = money;
    db.items = items;
    db.spellskills = spellskills;

    saveDB();
    hydrate();
    alert('Excel 匯入完成！');
  } catch (err) {
    console.error(err);
    alert('匯入失敗：' + (err?.message || err));
  } finally {
    e.target.value = '';
  }
});


  // Save button (manual)
  byId('save').addEventListener('click', ()=>{ saveDB(); alert('已儲存'); });

  // Demo
  byId('demo-load').addEventListener('click', ()=>{
    db = def();
    db.character = { name:'銀狼', job:'戰士', align:'CN', age:20, gender:'M', exp:1234, skills:[
      {type:'溝通', name:'說服', base:15, prof:20},
      {type:'心理', name:'心理學', base:5, prof:15}
    ]};
    db.money = {cp:10, sp:5, gp:2};
    db.items = [{name:'長劍', desc:'+1 weapon', qty:1, atk:3, def:0}];
    db.spellskills = [{name:'治療術', desc:'回復 1d8', target:'單體', area:'—', range:'觸碰', b1:'+2', b2:'', b3:'', mp:'5'}];
    saveDB(); hydrate();
  });

  function hydrate(){
    setVal('f-name', db.character.name||''); setVal('f-job', db.character.job||''); setVal('f-align', db.character.align||'');
    setVal('f-age', db.character.age??''); setVal('f-gender', db.character.gender||''); setVal('f-exp', db.character.exp??0);
    renderSkills(); setVal('money-cp', db.money.cp??0); setVal('money-sp', db.money.sp??0); setVal('money-gp', db.money.gp??0);
    renderItems(); renderSF();
  }
  hydrate();

  // helpers
  function byId(id){ return document.getElementById(id); }
  function val(id){ return byId(id).value||''; }
  function setVal(id,v){ byId(id).value=v; }
  function bindValue(id, set, get){ const el=byId(id); el.value=get(); el.addEventListener('input',e=>{ set(e.target.value); saveDB(); }); }
  function toNum(v){ const n=Number(v); return isNaN(n)?0:n; }
})();