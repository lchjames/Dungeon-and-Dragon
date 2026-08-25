import authCore from './admin-auth-core.js';

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

function isGmSetupPath(pathname) {
  return pathname === '/gm/setup' || pathname.startsWith('/gm/setup/');
}

function isGmLoginPath(pathname) {
  return pathname === '/gm/login' || pathname.startsWith('/gm/login/');
}

function adminProvisioningDisabled() {
  return json({
    ok: false,
    error: {
      code: 'ADMIN_PROVISIONING_DISABLED',
      message: 'GM/Admin 帳戶不可由網站建立或提升；只可由受信任嘅 deployment / database 管理層直接設定。'
    }
  }, 410);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Canonical security boundary: the public application never creates,
    // promotes, migrates or resets a GM/Admin identity.
    if (pathname === '/api/admin/setup' || pathname === '/api/admin/provision-initial-gm') {
      return adminProvisioningDisabled();
    }

    if (isGmSetupPath(pathname)) {
      return Response.redirect(new URL('/gm/login/', request.url).toString(), 302);
    }

    // Serve the login page directly so a stale legacy Admin session cannot
    // bounce between the historical setup redirect and the login page.
    if (isGmLoginPath(pathname)) {
      return env.ASSETS.fetch(request);
    }

    return authCore.fetch(request, env);
  }
};
