import baseWorker from './gm-d1.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function superseded() {
  return json({
    ok: false,
    error: {
      code: 'GM_PROVISIONING_SUPERSEDED',
      message: 'Player → GM promotion 已停用；GM = Admin，請使用 /gm/setup/ 建立獨立 Admin。'
    }
  }, 410);
}

// Historical gateway filename retained only to avoid rewriting the already-stable
// runtime import chain. Admin creation/authentication now lives exclusively in
// the outer src/admin-auth.js gateway. No Player role escalation exists here.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/provision-initial-gm') return superseded();
    return baseWorker.fetch(request, env);
  }
};
