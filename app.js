(function(){
  const DB_KEY='vault-v3.2.6'; let db=loadDB();
  function loadDB(){ try{return JSON.parse(localStorage.getItem(DB_KEY))||{characters:[]}}catch{return{characters:[]}} }
  function saveDB(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  const $=id=>document.getElementById(id);

  function render(){
    const grid=$('characters-grid'); if(!grid) return; grid.innerHTML='';
    const q=($('char-search')?.value||'').toLowerCase().trim();
    (db.characters||[])
      .filter(c=>!q || (c.name||'').toLowerCase().includes(q) || (c.job||'').toLowerCase().includes(q))
      .forEach(c=>{
        const node=document.getElementById('tpl-card').content.firstElementChild.cloneNode(true);
        node.querySelector('[data-name]').textContent=c.name||'';
        node.querySelector('[data-id]').textContent=c.id||'';
        node.querySelector('[data-job]').textContent=c.job||'';
        node.querySelector('[data-edit]').onclick=()=>openEditor(c.id);
        grid.appendChild(node);
      });
    if(!grid.children.length){ const p=document.createElement('p'); p.className='muted'; p.textContent='（沒有角色）'; grid.appendChild(p); }
    renderShareList();
  }

  function openEditor(id){
    const dlg=$('char-dialog'), f=$('char-form'); if(!dlg||!f) return;
    let c=(db.characters||[]).find(x=>x.id===id)||{id:'C_'+Math.random().toString(36).slice(2,8),name:'',job:''};
    f.id.value=c.id; f.name.value=c.name; f.job.value=c.job;
    $('delete-character').onclick=()=>{
      if(!confirm('確定刪除此角色？')) return;
      db.characters=db.characters.filter(x=>x.id!==c.id); saveDB(); dlg.close(); render();
    };
    f.onsubmit=(e)=>{
      e.preventDefault();
      c={id:f.id.value,name:f.name.value,job:f.job.value};
      const i=(db.characters||[]).findIndex(x=>x.id===c.id);
      if(i>=0) db.characters[i]=c; else db.characters.push(c);
      saveDB(); dlg.close(); render();
    };
    dlg.showModal();
  }

  // Navigation
  function show(hash){
    const key=(hash||'#welcome').replace('#','');
    document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
    (document.getElementById('page-'+key)||document.getElementById('page-welcome')).classList.remove('hidden');
  }
  document.addEventListener('click', (e)=>{
    const a=e.target.closest('[data-route]'); if(!a) return;
    e.preventDefault(); const h=a.getAttribute('href'); history.pushState({},'',h); show(h);
  });
  window.addEventListener('popstate', ()=>show(location.hash));

  // File utils
  function download(name, text){
    const blob=new Blob([text],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
  }

  // ==== Excel utils (merged-cell-safe) ====
  function getCell(ws, addr, {followMerged=true, scanRight=0}={}){
    if(!ws) return '';
    const val = ws[addr]?.v;
    if(val!==undefined && String(val).trim()!=='') return String(val).trim();
    if(followMerged && Array.isArray(ws['!merges'])){
      const A = XLSX.utils.decode_cell(addr);
      for(const m of ws['!merges']){
        if(A.r>=m.s.r && A.r<=m.e.r && A.c>=m.s.c && A.c<=m.e.c){
          const master = XLSX.utils.encode_cell(m.s);
          const mv = ws[master]?.v;
          if(mv!==undefined && String(mv).trim()!=='') return String(mv).trim();
        }
      }
    }
    if(scanRight>0){
      const A = XLSX.utils.decode_cell(addr);
      for(let k=1;k<=scanRight;k++){
        const right = XLSX.utils.encode_cell({r:A.r,c:A.c+k});
        const rv = ws[right]?.v;
        if(rv!==undefined && String(rv).trim()!=='') return String(rv).trim();
      }
    }
    return '';
  }
  function pickRightByLabel(ws, labels, scanRight=10){
    if(!ws) return '';
    const ref=ws['!ref']; if(!ref) return '';
    const range=XLSX.utils.decode_range(ref);
    const norm=s=>String(s||'').replace(/[\\s:：]/g,'').toUpperCase();
    const targets=new Set(labels.map(norm));
    for(let r=range.s.r;r<=Math.min(range.e.r,600);r++){
      for(let c=range.s.c;c<=Math.min(range.e.c,120);c++){
        const here=XLSX.utils.encode_cell({r,c});
        const v=ws[here]?.v; if(!v) continue;
        if(targets.has(norm(v))){
          for(let k=1;k<=scanRight;k++){
            const addr=XLSX.utils.encode_cell({r,c:c+k});
            const got=getCell(ws,addr,{followMerged:true,scanRight:0});
            if(got) return got;
          }
        }
      }
    }
    return '';
  }
  const norm=s=>String(s==null?'':s).trim();

  // ==== Crypto (AES-GCM with PBKDF2) ====
  const ITER=150000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const toB64 = u8 => btoa(String.fromCharCode(...u8));
  const fromB64 = b64 => new Uint8Array(atob(b64).split('').map(c=>c.charCodeAt(0)));
  async function deriveKey(password, salt){
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:ITER, hash:'SHA-256'}, keyMat, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  }
  async function aesEncrypt(text, password){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(text));
    return {v:1, alg:'AES-GCM', kdf:'PBKDF2', iter:ITER, iv:toB64(iv), salt:toB64(salt), data:toB64(new Uint8Array(ct))};
  }
  async function aesDecrypt(pkg, password){
    const iv=fromB64(pkg.iv), salt=fromB64(pkg.salt), data=fromB64(pkg.data);
    const key=await deriveKey(password, salt);
    const pt=await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, data);
    return dec.decode(pt);
  }

  // ==== Share package UI ====
  function renderShareList(){
    const box=$('share-characters'); if(!box) return;
    box.innerHTML='';
    (db.characters||[]).forEach(c=>{
      const el=document.createElement('label');
      el.className='item'; el.innerHTML=`<input type="checkbox" value="${c.id}"/><span>${c.name}</span><small class="muted">(${c.id})</small>`;
      box.appendChild(el);
    });
  }
  function selectedShareIds(){
    return Array.from(document.querySelectorAll('#share-characters input[type=checkbox]:checked')).map(x=>x.value);
  }

  $('share-select-all')?.addEventListener('click',()=>{
    document.querySelectorAll('#share-characters input[type=checkbox]').forEach(x=>x.checked=true);
  });
  $('share-unselect-all')?.addEventListener('click',()=>{
    document.querySelectorAll('#share-characters input[type=checkbox]').forEach(x=>x.checked=false);
  });
  $('share-make')?.addEventListener('click', async ()=>{
    const ids=selectedShareIds(); const pass=$('share-pass')?.value||'';
    if(!ids.length) return alert('請先選擇角色');
    if(pass.length<4) return alert('請設定至少 4 碼密碼');
    const subset=(db.characters||[]).filter(c=>ids.includes(c.id));
    const plain=JSON.stringify({characters:subset});
    const pkg=await aesEncrypt(plain, pass);
    const payload=JSON.stringify({meta:{ts:Date.now(),count:subset.length,ids}, pkg}, null, 2);
    const name=`share-${(subset[0]?.name||'player')}-${Date.now()}.json`;
    download(name, payload);
    alert('已下載。若要用連結分享，請把檔案放到 repo 的 /p 目錄，連結使用：#p='+name);
  });

  // Player import via file
  let filePkgObj=null;
  $('pkg-import')?.addEventListener('change', async e=>{ filePkgObj=null; const f=e.target.files?.[0]; if(!f) return; filePkgObj=JSON.parse(await f.text()); $('characters-grid').innerHTML=''; alert('已讀取分享包，請輸入密碼並按「解密匯入」。'); });
  $('pkg-import-2')?.addEventListener('change', async e=>{ filePkgObj=null; const f=e.target.files?.[0]; if(!f) return; filePkgObj=JSON.parse(await f.text()); alert('已讀取分享包，請輸入密碼並按「解密匯入」。'); });
  $('pkg-open')?.addEventListener('click', async ()=>{
    if(!filePkgObj) return alert('請先選擇分享包檔案');
    const pass=$('pkg-pass')?.value||''; if(!pass) return alert('請輸入密碼');
    try{
      const text=await aesDecrypt(filePkgObj.pkg, pass);
      const data=JSON.parse(text);
      db={characters:data.characters||[]}; saveDB(); render(); show('#characters');
      alert('已匯入分享包，現在只包含你自己的角色。');
    }catch(err){ alert('密碼錯誤或檔案毀損'); }
  });

  // Import from URL hash #p=filename.json
  async function tryOpenHashPackage(){
    const m=location.hash.match(/^#p=(.+)$/); if(!m) return;
    const name=decodeURIComponent(m[1]);
    try{
      const res=await fetch('p/'+name); if(!res.ok) throw new Error('找不到檔案');
      const obj=await res.json();
      const pass=prompt('輸入分享包密碼'); if(!pass) return;
      const text=await aesDecrypt(obj.pkg, pass);
      const data=JSON.parse(text);
      db={characters:data.characters||[]}; saveDB(); render(); show('#characters');
      alert('已從連結匯入分享包');
    }catch(err){ alert('無法開啟分享包：'+(err.message||err)); }
  }

  // Excel import (for owner to build DB)
  $('excel-import')?.addEventListener('change', async e=>{
    const f=e.target.files?.[0]; if(!f) return; const hud=$('excel-status');
    try{
      hud.textContent='載入中…';
      const buf=await f.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array'});
      const ws=wb.Sheets['人物表(自動計算)']||wb.Sheets['人物表']||wb.Sheets[wb.SheetNames[0]];
      const name=getCell(ws,'I2',{followMerged:true,scanRight:10})||pickRightByLabel(ws,['探索者姓名','姓名','角色名','名稱'],10);
      const job=getCell(ws,'I3',{followMerged:true,scanRight:10})||pickRightByLabel(ws,['職業','Job'],10);
      if(!name) throw new Error('找不到姓名');
      const id='C_'+Math.random().toString(36).slice(2,8);
      const c={id,name,job};
      db.characters.push(c); saveDB(); render(); show('#characters');
      hud.textContent='完成：'+name;
    }catch(err){ hud.textContent='錯誤：'+(err.message||err); }
    finally{ e.target.value=''; setTimeout(()=>{ $('excel-status').textContent=''; },3000); }
  });

  // Basic actions
  $('add-character')?.addEventListener('click', ()=>openEditor(null));
  $('char-search')?.addEventListener('input', render);

  // Export/import JSON (owner)
  $('export-json')?.addEventListener('click', ()=>download('vault-export.json', JSON.stringify(db,null,2)));
  $('import-json')?.addEventListener('change', async e=>{
    const f=e.target.files?.[0]; if(!f) return;
    try{ db=JSON.parse(await f.text()); saveDB(); render(); show('#characters'); alert('已匯入 JSON'); }
    catch{ alert('JSON 格式錯誤'); }
  });

  // Start
  document.addEventListener('DOMContentLoaded', ()=>{
    const y=document.getElementById('year'); if(y) y.textContent=new Date().getFullYear();
    render(); show(location.hash||'#welcome'); tryOpenHashPackage();
  });
})();