# ChogChronicle
Persistent shared social world for Chog Genesis NFTs on Monad (Chogathon 2026). See DESIGN.md.

## Local dev
```
npm install
npm run dev          # API :8787 (tsx watch) + Vite :5173 with /api proxy. Uses local file DB data/chronicle.db
npm run build && npm start   # single process: dist/ + API on $PORT (default 8787)
npx tsx scripts/test-auth.ts # signature / nonce / ownerOf checks (API must be running)
npx tsx scripts/test-gift.ts # $CHOG gift verification + demo energy checks
node scripts/shots.mjs       # headless click-through + screenshots -> shots/
curl -XPOST localhost:8787/api/admin/reset -H 'x-admin-token: dev'   # reseed world (demo mode)
```
To develop against Turso instead of the local file, put `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in your shell env.

## Deploy to Vercel
Architecture: static Vite build (`dist/`) + one Node.js function `api/index.ts` (Hono) that serves every `/api/*` route (see `vercel.json`). State lives in **Turso (libSQL)** — tables are created and the world is seeded automatically on the first request.

1. **Create a Turso database** (free tier):
   ```
   curl -sSfL https://get.tur.so/install.sh | bash   # or: brew install tursodatabase/tap/turso
   turso auth signup            # or: turso auth login
   turso db create chogchronicle
   turso db show chogchronicle --url        # -> TURSO_DATABASE_URL (libsql://…)
   turso db tokens create chogchronicle     # -> TURSO_AUTH_TOKEN
   ```
   (Alternatively: Vercel dashboard → Storage / Marketplace → Turso, which injects the env vars for you.)
2. **Import the repo in Vercel** (vercel.com/new → `ahmardchain/chogchronicle`) or via CLI: `npx vercel login && npx vercel link`.
   Framework preset: Vite (auto from `vercel.json`). Node.js version: 24.x (Vercel default).
3. **Set environment variables** (Project → Settings → Environment Variables, or `npx vercel env add NAME production`):
   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://chogchronicle-<org>.turso.io` (required) |
   | `TURSO_AUTH_TOKEN` | token from step 1 (required) |
   | `ADMIN_TOKEN` | long random string (protects `/api/admin/reset`) |
   | `DEMO_MODE` | `1` for judging (demo Chogs playable without a wallet), `0` = wallet-only |
   | `MONAD_RPC` | optional, defaults to `https://rpc.monad.xyz` |
4. **Deploy**: push to `master` (Git integration) or `npx vercel --prod`.
5. Smoke test: `curl https://<app>.vercel.app/api/world` → `{"events":60,...}`.

Local check of the Vercel output: `npx vercel build` (needs `vercel link` or a `.vercel/project.json`).
