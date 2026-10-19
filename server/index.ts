// Local / single-server runtime (dev + `npm start`). On Vercel, api/index.ts is used instead.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import api from './app.js';
const PORT = Number(process.env.PORT || 8787);
const app = new Hono();
app.route('/', api);
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));
serve({ fetch: app.fetch, port: PORT }, i => console.log(`Chog Daemons API on :${i.port} (db=${process.env.TURSO_DATABASE_URL ? 'turso' : 'local file'}, demo=${process.env.DEMO_MODE !== '0'})`));
