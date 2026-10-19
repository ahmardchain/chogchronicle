// Vercel Node.js function (Web Request/Response handlers). vercel.json rewrites /api/* → /api?path=*.
import app from '../server/app.js';
export const config = { maxDuration: 30 };
async function h(req: Request) {
  // Restore the original /api/<path> if the platform hands us the rewritten URL.
  const u = new URL(req.url);
  if ((u.pathname === '/api' || u.pathname === '/api/index') && u.searchParams.has('path')) {
    u.pathname = '/api/' + u.searchParams.get('path'); u.searchParams.delete('path');
    req = new Request(u, req);
  }
  return app.fetch(req);
}
export const GET = h, POST = h, OPTIONS = h;
