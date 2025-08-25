(function(){
  const USERS_KEY='vault-users-v1', SESSION_KEY='vault-session-v1';
  const hex = (buf)=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  async function hash(s){ return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
  function load(){ try{return JSON.parse(localStorage.getItem(USERS_KEY))||[]}catch{return[]} }
  function save(u){ localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  (function ensureAdmin(){
    const u=load(); if(!u.find(x=>x.role==='admin')){ u.push({id:'u_admin',username:'admin',pass:null,role:'admin',allowed:[]}); save(u); }
  })();
  async function login(username,password){
    const u=load(); const me=u.find(x=>x.username===username); if(!me) throw new Error('用戶不存在');
    if(!me.pass){ if(me.role!=='admin') throw new Error('帳號未設定密碼，請聯絡管理員'); if(!password) throw new Error('請輸入新管理員密碼'); me.pass=await hash(password); save(u); }
    else{ const h=await hash(password); if(h!==me.pass) throw new Error('密碼錯誤'); }
    localStorage.setItem(SESSION_KEY, JSON.stringify({username:me.username,role:me.role})); return me;
  }
  function logout(){ localStorage.removeItem(SESSION_KEY); location.hash='#login'; location.reload(); }
  function current(){ try{return JSON.parse(localStorage.getItem(SESSION_KEY))}catch{return null} }
  window.Auth={loadUsers:load, saveUsers:save, login, logout, current};
})();