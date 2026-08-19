const SESSION_COOKIE = '__Host-dnd_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 600000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;
const encoder = new TextEncoder();
let schemaPromise = null;

const SCHEMA = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    status TEXT NOT NULL DEFAULT 'active',
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    level INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    template TEXT NOT NULL DEFAULT 'generic',
    portrait_url TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS character_attributes (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    key TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS character_resources (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    key TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL,
    current_value REAL NOT NULL DEFAULT 0,
    max_value REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS character_inventory (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS character_abilities (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Ability',
    description TEXT NOT NULL DEFAULT '',
    proficient INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_characters_owner ON characters(owner_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attributes_character ON character_attributes(character_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_resources_character ON character_resources(character_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_character ON character_inventory(character_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_abilities_character ON character_abilities(character_id, sort_order)`,
  `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('campaign_name', 'D&D Campaign', 0)`
];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}
function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, error: { code, message } }, status);
}
function nowMs() { return Date.now(); }
function randomBytes(length) { const b = new Uint8Array(length); crypto.getRandomValues(b); return b; }
function bytesToBase64(bytes) { let s=''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function base64ToBytes(value) { const s=atob(value); return Uint8Array.from(s, c=>c.charCodeAt(0)); }
function bytesToBase64Url(bytes) { return bytesToBase64(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,''); }
function bytesToHex(bytes) { return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''); }
async function sha256Hex(value) { const d=await crypto.subtle.digest('SHA-256',encoder.encode(value)); return bytesToHex(new Uint8Array(d)); }
async function derivePasswordHash(password,saltBytes,iterations=PBKDF2_ITERATIONS) {
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBytes,iterations},material,256);
  return new Uint8Array(bits);
}
function constantTimeEqual(a,b) { if(a.length!==b.length)return false; let r=0; for(let i=0;i<a.length;i++)r|=a[i]^b[i]; return r===0; }
async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) schemaPromise = env.DB.batch(SCHEMA.map(sql=>env.DB.prepare(sql))).catch(err=>{schemaPromise=null;throw err;});
  await schemaPromise;
}
function cookieValue(request,name) { const h=request.headers.get('Cookie')||''; for(const p of h.split(';')){const [k,...r]=p.trim().split('=');if(k===name)return r.join('=');} return ''; }
function sessionCookie(token) { return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`; }
function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }
function validateOrigin(request) { const origin=request.headers.get('Origin'); return !origin || origin===new URL(request.url).origin; }
async function readJsonBody(request,maxBytes=MAX_BODY_BYTES) {
  const type=request.headers.get('Content-Type')||'';
  if(!type.toLowerCase().includes('application/json')) throw Object.assign(new Error('請使用 JSON 格式提交。'),{status:415,code:'UNSUPPORTED_MEDIA_TYPE'});
  const length=Number(request.headers.get('Content-Length')||0); if(length>maxBytes)throw Object.assign(new Error('提交內容過大。'),{status:413,code:'PAYLOAD_TOO_LARGE'});
  const text=await request.text(); if(encoder.encode(text).byteLength>maxBytes)throw Object.assign(new Error('提交內容過大。'),{status:413,code:'PAYLOAD_TOO_LARGE'});
  try{return JSON.parse(text||'{}')}catch{throw Object.assign(new Error('JSON 格式錯誤。'),{status:400,code:'INVALID_JSON'});}
}
function normaliseUsername(v){return String(v??'').trim().toLowerCase();}
function validateRegistration(input){
  const username=normaliseUsername(input.username),displayName=String(input.displayName??'').trim(),password=String(input.password??'');
  if(!/^[a-z0-9._-]{3,32}$/.test(username))return{error:'使用者名稱需為 3–32 字元，只可使用英文字母、數字、句點、底線或連字號。'};
  if(displayName.length<1||displayName.length>50)return{error:'顯示名稱需為 1–50 字元。'};
  if(password.length<12||password.length>128)return{error:'密碼需為 12–128 字元。'};
  return{username,displayName,password};
}
function publicUser(row){return{id:row.id,username:row.username,displayName:row.display_name,role:row.role,status:row.status,createdAt:row.created_at};}
async function createSession(env,userId){
  const token=bytesToBase64Url(randomBytes(32)),hash=await sha256Hex(token),now=nowMs(),expires=now+SESSION_TTL_SECONDS*1000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (id,user_id,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?)').bind(hash,userId,expires,now,now)
  ]);
  return token;
}
async function sessionUser(request,env){
  await ensureSchema(env); const token=cookieValue(request,SESSION_COOKIE); if(!token)return null; const hash=await sha256Hex(token),now=nowMs();
  const row=await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.status,u.created_at,s.last_seen_at,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? LIMIT 1`).bind(hash,now).first();
  if(!row||row.status!=='active')return null;
  if(now-Number(row.last_seen_at||0)>3600000)await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').bind(now,hash).run();
  return publicUser(row);
}
async function requireUser(request,env){const user=await sessionUser(request,env);if(!user)throw Object.assign(new Error('未登入。'),{status:401,code:'UNAUTHENTICATED'});return user;}

async function register(request,env){
  if(request.method!=='POST')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED'); if(!validateOrigin(request))return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  await ensureSchema(env); const body=await readJsonBody(request,16*1024),v=validateRegistration(body); if(v.error)return apiError(v.error,400,'VALIDATION_ERROR');
  const existing=await env.DB.prepare('SELECT id FROM users WHERE username=? LIMIT 1').bind(v.username).first(); if(existing)return apiError('呢個使用者名稱已經有人使用。',409,'USERNAME_TAKEN');
  const salt=randomBytes(16),hash=await derivePasswordHash(v.password,salt),id=`user_${crypto.randomUUID()}`,now=nowMs();
  try{await env.DB.prepare(`INSERT INTO users(id,username,display_name,password_hash,password_salt,password_iterations,role,status,failed_attempts,locked_until,created_at,updated_at) VALUES(?,?,?,?,?,?,'player','active',0,NULL,?,?)`).bind(id,v.username,v.displayName,bytesToBase64(hash),bytesToBase64(salt),PBKDF2_ITERATIONS,now,now).run();}
  catch(e){if(String(e?.message||e).toLowerCase().includes('unique'))return apiError('呢個使用者名稱已經有人使用。',409,'USERNAME_TAKEN');throw e;}
  const token=await createSession(env,id); return json({ok:true,user:{id,username:v.username,displayName:v.displayName,role:'player',status:'active',createdAt:now}},201,{'Set-Cookie':sessionCookie(token)});
}
const FAKE_SALT=Uint8Array.from([149,17,236,89,44,173,3,219,196,58,217,99,77,132,225,14]);
async function login(request,env){
  if(request.method!=='POST')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED'); if(!validateOrigin(request))return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  await ensureSchema(env); const body=await readJsonBody(request,16*1024),username=normaliseUsername(body.username),password=String(body.password??'');
  if(!username||!password||password.length>128)return apiError('使用者名稱或密碼不正確。',401,'INVALID_CREDENTIALS');
  const u=await env.DB.prepare(`SELECT id,username,display_name,password_hash,password_salt,password_iterations,role,status,failed_attempts,locked_until,created_at FROM users WHERE username=? LIMIT 1`).bind(username).first();
  if(!u){await derivePasswordHash(password,FAKE_SALT,PBKDF2_ITERATIONS);return apiError('使用者名稱或密碼不正確。',401,'INVALID_CREDENTIALS');}
  const now=nowMs(); if(u.status!=='active')return apiError('此帳戶目前無法登入。',403,'ACCOUNT_DISABLED'); if(Number(u.locked_until||0)>now)return apiError('登入嘗試次數過多，請稍後再試。',429,'ACCOUNT_TEMPORARILY_LOCKED');
  const got=await derivePasswordHash(password,base64ToBytes(u.password_salt),Number(u.password_iterations||PBKDF2_ITERATIONS)),expected=base64ToBytes(u.password_hash);
  if(!constantTimeEqual(got,expected)){
    const attempts=Number(u.failed_attempts||0)+1,lock=attempts>=MAX_FAILED_ATTEMPTS;
    await env.DB.prepare('UPDATE users SET failed_attempts=?,locked_until=?,updated_at=? WHERE id=?').bind(lock?0:attempts,lock?now+LOCK_SECONDS*1000:null,now,u.id).run();
    return apiError(lock?'登入嘗試次數過多，帳戶已暫時鎖定。':'使用者名稱或密碼不正確。',lock?429:401,lock?'ACCOUNT_TEMPORARILY_LOCKED':'INVALID_CREDENTIALS');
  }
  await env.DB.prepare('UPDATE users SET failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?').bind(now,u.id).run(); const token=await createSession(env,u.id);
  return json({ok:true,user:publicUser(u)},200,{'Set-Cookie':sessionCookie(token)});
}
async function logout(request,env){
  if(request.method!=='POST')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED'); if(!validateOrigin(request))return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  await ensureSchema(env); const token=cookieValue(request,SESSION_COOKIE); if(token)await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(await sha256Hex(token)).run();
  return json({ok:true},200,{'Set-Cookie':clearSessionCookie()});
}
async function me(request,env){if(request.method!=='GET')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED');const user=await sessionUser(request,env);return user?json({ok:true,user}):apiError('未登入。',401,'UNAUTHENTICATED');}

async function ownedCharacter(env,userId,characterId){
  return env.DB.prepare(`SELECT id,owner_user_id,name,role,level,status,template,portrait_url,summary,notes,created_at,updated_at FROM characters WHERE id=? AND owner_user_id=? LIMIT 1`).bind(characterId,userId).first();
}
function mapCharacterRow(row){return{id:row.id,name:row.name,role:row.role,level:Number(row.level||1),status:row.status,template:row.template,portraitUrl:row.portrait_url,summary:row.summary,notes:row.notes,createdAt:row.created_at,updatedAt:row.updated_at};}
async function loadCharacterDetail(env,userId,characterId){
  const row=await ownedCharacter(env,userId,characterId); if(!row)return null;
  const [attrs,res,items,abilities]=await env.DB.batch([
    env.DB.prepare('SELECT id,key,label,value,description FROM character_attributes WHERE character_id=? ORDER BY sort_order,id').bind(characterId),
    env.DB.prepare('SELECT id,key,label,current_value,max_value,description FROM character_resources WHERE character_id=? ORDER BY sort_order,id').bind(characterId),
    env.DB.prepare('SELECT id,name,qty,notes FROM character_inventory WHERE character_id=? ORDER BY sort_order,id').bind(characterId),
    env.DB.prepare('SELECT id,name,type,description,proficient FROM character_abilities WHERE character_id=? ORDER BY sort_order,id').bind(characterId)
  ]);
  return {...mapCharacterRow(row),attributes:(attrs.results||[]).map(x=>({id:x.id,key:x.key,label:x.label,value:x.value,description:x.description})),resources:(res.results||[]).map(x=>({id:x.id,key:x.key,label:x.label,current:Number(x.current_value||0),max:Number(x.max_value||0),description:x.description})),inventory:(items.results||[]).map(x=>({id:x.id,name:x.name,qty:Number(x.qty||0),notes:x.notes})),abilities:(abilities.results||[]).map(x=>({id:x.id,name:x.name,type:x.type,description:x.description,proficient:Boolean(x.proficient)}))};
}
async function playerBootstrap(request,env){
  if(request.method!=='GET')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED'); const user=await requireUser(request,env); await ensureSchema(env);
  const [campaign,chars]=await env.DB.batch([
    env.DB.prepare("SELECT value FROM settings WHERE key='campaign_name' LIMIT 1"),
    env.DB.prepare(`SELECT id,name,role,level,status,template,portrait_url,summary,updated_at FROM characters WHERE owner_user_id=? AND status<>'retired' ORDER BY name COLLATE NOCASE`).bind(user.id)
  ]);
  const summaries=(chars.results||[]).map(row=>({id:row.id,name:row.name,role:row.role,level:Number(row.level||1),status:row.status,template:row.template,portraitUrl:row.portrait_url,summary:row.summary,updatedAt:row.updated_at}));
  return json({ok:true,user,campaign:{name:campaign.results?.[0]?.value||'D&D Campaign'},characters:summaries});
}
async function playerCharacter(request,env,characterId){
  const user=await requireUser(request,env); if(request.method!=='GET')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED'); const character=await loadCharacterDetail(env,user.id,characterId); return character?json({ok:true,character}):apiError('找不到角色。',404,'CHARACTER_NOT_FOUND');
}
async function updateNotes(request,env,characterId){
  const user=await requireUser(request,env); if(request.method!=='PATCH')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED'); if(!validateOrigin(request))return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  const body=await readJsonBody(request),notes=String(body.notes??''); if(notes.length>20000)return apiError('筆記內容過長。',400,'VALIDATION_ERROR');
  const exists=await ownedCharacter(env,user.id,characterId); if(!exists)return apiError('找不到角色。',404,'CHARACTER_NOT_FOUND');
  await env.DB.prepare('UPDATE characters SET notes=?,updated_at=? WHERE id=? AND owner_user_id=?').bind(notes,nowMs(),characterId,user.id).run(); return json({ok:true,notes});
}
async function updateResource(request,env,characterId,resourceId){
  const user=await requireUser(request,env); if(request.method!=='PATCH')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED'); if(!validateOrigin(request))return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  const body=await readJsonBody(request),current=Number(body.current); if(!Number.isFinite(current))return apiError('請輸入有效數字。',400,'VALIDATION_ERROR');
  const row=await env.DB.prepare(`SELECT r.id FROM character_resources r JOIN characters c ON c.id=r.character_id WHERE r.id=? AND r.character_id=? AND c.owner_user_id=? LIMIT 1`).bind(resourceId,characterId,user.id).first();
  if(!row)return apiError('找不到資源。',404,'RESOURCE_NOT_FOUND'); await env.DB.prepare('UPDATE character_resources SET current_value=? WHERE id=? AND character_id=?').bind(current,resourceId,characterId).run(); await env.DB.prepare('UPDATE characters SET updated_at=? WHERE id=?').bind(nowMs(),characterId).run(); return json({ok:true,current});
}
async function updateInventory(request,env,characterId,itemId){
  const user=await requireUser(request,env); if(request.method!=='PATCH')return apiError('Method not allowed.',405,'METHOD_NOT_ALLOWED'); if(!validateOrigin(request))return apiError('來源驗證失敗。',403,'ORIGIN_REJECTED');
  const body=await readJsonBody(request),qty=Number(body.qty); if(!Number.isFinite(qty)||qty<0)return apiError('數量必須係 0 或以上。',400,'VALIDATION_ERROR');
  const row=await env.DB.prepare(`SELECT i.id FROM character_inventory i JOIN characters c ON c.id=i.character_id WHERE i.id=? AND i.character_id=? AND c.owner_user_id=? LIMIT 1`).bind(itemId,characterId,user.id).first();
  if(!row)return apiError('找不到物品。',404,'ITEM_NOT_FOUND'); await env.DB.prepare('UPDATE character_inventory SET qty=? WHERE id=? AND character_id=?').bind(qty,itemId,characterId).run(); await env.DB.prepare('UPDATE characters SET updated_at=? WHERE id=?').bind(nowMs(),characterId).run(); return json({ok:true,qty});
}

async function handleApi(request,env,pathname){
  try{
    await ensureSchema(env);
    if(pathname==='/api/auth/register')return register(request,env);
    if(pathname==='/api/auth/login')return login(request,env);
    if(pathname==='/api/auth/logout')return logout(request,env);
    if(pathname==='/api/auth/me')return me(request,env);
    if(pathname==='/api/player/bootstrap')return playerBootstrap(request,env);
    const charMatch=pathname.match(/^\/api\/player\/characters\/([^/]+)$/); if(charMatch)return playerCharacter(request,env,decodeURIComponent(charMatch[1]));
    const notesMatch=pathname.match(/^\/api\/player\/characters\/([^/]+)\/notes$/); if(notesMatch)return updateNotes(request,env,decodeURIComponent(notesMatch[1]));
    const resMatch=pathname.match(/^\/api\/player\/characters\/([^/]+)\/resources\/([^/]+)$/); if(resMatch)return updateResource(request,env,decodeURIComponent(resMatch[1]),decodeURIComponent(resMatch[2]));
    const itemMatch=pathname.match(/^\/api\/player\/characters\/([^/]+)\/inventory\/([^/]+)$/); if(itemMatch)return updateInventory(request,env,decodeURIComponent(itemMatch[1]),decodeURIComponent(itemMatch[2]));
    return apiError('Not found.',404,'NOT_FOUND');
  }catch(err){
    console.error('API error',err); if(err?.status)return apiError(err.message,err.status,err.code||'API_ERROR');
    if(String(err?.message||err).includes('D1 binding DB is unavailable'))return apiError('資料庫尚未完成配置。',503,'DATABASE_UNAVAILABLE');
    return apiError('Service unavailable.',500,'SERVICE_ERROR');
  }
}
function isAuthPage(pathname){return /^\/player\/(login|register)(?:\/|\/index\.html)?$/.test(pathname);}
function isPlayerPath(pathname){return pathname==='/player'||pathname.startsWith('/player/');}
function internalPlayerNext(url){const v=`${url.pathname}${url.search}`;return v.startsWith('/player/')&&!v.startsWith('//')?v:'/player/';}

export default {
  async fetch(request,env){
    const url=new URL(request.url),pathname=url.pathname;
    if(pathname.startsWith('/api/'))return handleApi(request,env,pathname);
    if(isAuthPage(pathname)){
      try{if(await sessionUser(request,env))return Response.redirect(new URL('/player/',url).toString(),302);}catch(e){console.error('Session check error',e);}
      return env.ASSETS.fetch(request);
    }
    if(isPlayerPath(pathname)){
      try{if(!await sessionUser(request,env)){const login=new URL('/player/login/',url);login.searchParams.set('next',internalPlayerNext(url));return Response.redirect(login.toString(),302);}return env.ASSETS.fetch(request);}
      catch(e){console.error('Player protection error',e);return new Response('Player service is temporarily unavailable.',{status:503,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});}
    }
    return env.ASSETS.fetch(request);
  }
};
