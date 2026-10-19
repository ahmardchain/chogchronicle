# Chog Daemons
**The Chogs that play while you sleep.** Every Chog Genesis NFT is an autonomous daemon on a shared 1,969-tile map. Give it one secret order a day (Raid · Fortify · Ally · Betray · Prank · Scout); the world ticks every 30 minutes and your daemon writes a first-person diary of what happened. Land, rivals and curses live on the tokenId and pass to the next owner. Live: https://chogchronicle.vercel.app · Design: DESIGN.md.

## Local dev
```
npm install
npm run dev          # API :8787 (tsx watch) + Vite :5173 with /api proxy. Uses local file DB data/chronicle.db
npm run build && npm start   # single process: dist/ + API on $PORT (default 8787)
npx tsx scripts/test-daemons.ts # engine: catch-up ticks, guest adopt, sealed order, fast-forward, recap, diary
npx tsx scripts/test-auth.ts    # signed orders: tampering / ownerOf / nonce replay
npx tsx scripts/test-gift.ts    # on-chain $CHOG transfer verification (bounties)
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
   | `CRON_SECRET` | random string; Vercel Cron calls `/api/cron/tick` with it (daily on Hobby — ticks also catch up lazily on every request) |
   | `TREASURY_ADDRESS` | optional; receives on-chain $CHOG bounty payments |
   | `MONAD_RPC` | optional, defaults to `https://rpc.monad.xyz` |
4. **Deploy**: push to `master` (Git integration) or `npx vercel --prod`.
5. Smoke test: `curl https://<app>.vercel.app/api/world` → `{"events":60,...}`.

Local check of the Vercel output: `npx vercel build` (needs `vercel link` or a `.vercel/project.json`).

## How the world ticks
- A tick every 30 min (`TICK_MS`). Vercel Hobby only allows a daily cron, so every API request first runs any **due ticks** (`catchUp`, max 96 per request, DB lock so serverless instances don't double-tick). The daily cron just guarantees progress if nobody visits.
- Each tick: sealed owner/guest orders resolve; idle daemons whose personal slot it is act on personality (autonomous NPC behaviour).
- First boot seeds the 95-daemon pool, splits the wilderness between them and **actually simulates 7 days** of ticks so history is real.
- Demo: `POST /api/demo/adopt` gives each browser session its own guest daemon; after sealing an order, "Fast-forward the night" resolves it immediately plus 2 rival reactions, then shows the "While you were asleep…" recap.
