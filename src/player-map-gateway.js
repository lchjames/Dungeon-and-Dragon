import baseWorker from './player-map.js';
import { ensurePlayerMapDependencies } from './player-map-dependencies.js';

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

async function authenticated(request, env) {
  const authRequest = new Request(new URL('/api/auth/me', request.url), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Cookie: request.headers.get('Cookie') || ''
    }
  });
  const response = await baseWorker.fetch(authRequest, env);
  return response.ok;
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const isPlayerWorldRequest = pathname === '/api/player/world' || pathname.startsWith('/api/player/world/');

    try {
      if (isPlayerWorldRequest && await authenticated(request, env)) {
        await ensurePlayerMapDependencies(env);
      }
      return baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Player Map dependency gateway error', {
        path: pathname,
        name: error?.name || 'Error',
        message: String(error?.message || error)
      });
      if (String(error?.message || error).includes('D1 binding DB is unavailable')) {
        return json({ ok: false, error: { code: 'DATABASE_UNAVAILABLE', message: '資料庫尚未完成配置。' } }, 503);
      }
      return json({ ok: false, error: { code: 'PLAYER_MAP_DEPENDENCY_ERROR', message: 'Player Map runtime dependency 初始化失敗。' } }, 500);
    }
  }
};
