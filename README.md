# ChogChronicle
Persistent social world for Chog Genesis NFTs on Monad (Chogathon 2026). See DESIGN.md.
```
npm install
npm run dev        # http://localhost:5173  (demo mode works without a wallet)
npm run build
node scripts/fetch-chogs.mjs   # refresh cached demo Chog metadata/images from Monad + IPFS
node scripts/shots.mjs         # headless screenshots -> shots/ (needs dev server)
```
