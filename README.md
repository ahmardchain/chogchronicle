# ChogChronicle
Persistent shared social world for Chog Genesis NFTs on Monad (Chogathon 2026). See DESIGN.md.
```
npm install
npm run dev          # API :8787 (tsx watch) + Vite :5173 with /api proxy; demo mode works without a wallet
npm run build && npm start   # production: one process serves dist/ + API on $PORT (default 8787)
npx tsx scripts/test-auth.ts # signature/nonce/ownerOf checks against running API
node scripts/shots.mjs       # headless click-through + screenshots -> shots/ (needs dev server)
curl -XPOST localhost:8787/api/admin/reset -H 'x-admin-token: dev'   # reseed world (demo mode)
```
Env: PORT, DB_PATH (default data/chronicle.db), DEMO_MODE (0 to disable), ADMIN_TOKEN, MONAD_RPC.
