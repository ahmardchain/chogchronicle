# ChogChronicle — Design Doc (Chogathon 2026)

> "A persistent social world where every Chog NFT builds its own reputation, relationships, rivalries, achievements, and history through interactions with other Chogs." — Ahmard's pitch

## 1. Concept
Every Chog Genesis NFT is a *character with a past*. ChogChronicle is a living social ledger: Chogs duel, befriend, prank and gift each other once a day. Every interaction is written into an append-only **Chronicle** keyed by `tokenId`. Over time each Chog accumulates a **Reputation**, a **web of relationships** (friends, rivals, nemesis), **achievements** and a **timeline** that reads like a story. The world-wide feed is the "newspaper" of the Chog World Order.

## 2. Why the NFT is essential (qualifier check)
- **Identity = tokenId.** There is no account, no username. The actor in every action is a Chog tokenId; the history lives on `(contract, tokenId)`.
- **Stats come from on-chain traits.** Chaos / Charm / Grit are derived deterministically from the token's metadata attributes (Body, Eyes, Mouth, Tier, …). Different Chogs play differently.
- **Ownership gates action.** You can only act *as* a Chog that `ownerOf(tokenId)` returns for your wallet (demo mode bypasses this with sample Chogs).
- **Reputation travels with the token.** Sell/transfer the Chog and its story, friends, rivals and titles go with it — the history becomes part of the NFT's value. Remove the NFT and there is literally nothing to play as.

## 3. Core loop (daily)
1. Pick one of your Chogs → it has **3 Energy** per day (UTC reset).
2. Choose another Chog and an interaction:
   | Action | Effect |
   |---|---|
   | ⚔️ **Challenge** | Stat duel (Grit+Chaos vs. opponent + seeded roll). Winner +Rep, loser −Rep small. Repeated close duels turn two Chogs into **Rivals**; 5+ duels → **Nemesis**. |
   | 🤝 **Befriend** | +Bond (Charm-weighted). Bond ≥ 30 → **Friends**, ≥ 70 → **Sworn Allies**. |
   | 😈 **Prank** | Chaos check. Success = +Chaos rep, −Bond. Fail = embarrassing chronicle entry. |
   | 🎁 **Gift $CHOG** | Spend $CHOG (simulated in MVP) for big +Bond and +Rep for both. |
3. Every result writes a narrative line to both Chogs' timelines and the global feed.
4. Achievements unlock (First Blood, Social Butterfly, Nemesis Forged, Chaos Agent, Generous Soul, 3-Day Streak…).

## 4. Retention hooks
- Daily energy + **streaks** (per Chog) with a streak multiplier on Rep.
- **Chronicle feed** — you come back to see who challenged *your* Chog (inbound events).
- **Rivalries** create unfinished business (revenge duels).
- **Seasons** (2-week, matches hackathon): season leaderboard of Rep, titles frozen into the Chog's permanent history ("Season 1 Champion").
- World simulation: other Chogs act even when you don't, so the world feels alive.

## 5. $CHOG integration (bonus)
$CHOG token on Monad: `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777` (from chog.xyz).
- **Gift** action is a real `transfer` of $CHOG to the *owner of the target tokenId* (MVP: simulated balance; v2: on-chain transfer with tx hash recorded in the chronicle).
- **Revive energy**: burn/spend small $CHOG for an extra action.
- **Season prize pool** in $CHOG for top Rep Chogs. Using $CHOG to *strengthen bonds between NFTs* is meaningful, not decorative.

## 6. MVP scope (2 weeks)
Week 1: wallet + Monad chain, owned Chog discovery (ownerOf check), trait→stats, 4 interactions, local persistence, profile, feed. ✅ (prototype built)
Week 2: shared backend (Supabase/SQLite API so all players see one world), signed actions (wallet signs `{tokenId, action, target, nonce}`), real $CHOG gift transfer, seasons leaderboard, share-card OG images, demo video.
Stretch: on-chain chronicle hash anchoring (Merkle root per day on Monad), ERC-6551-style "memory" view.

## 7. Tech stack
- Vite + React 19 + TypeScript, react-router
- wagmi v3 + viem, Monad mainnet (chainId 143, RPC `https://rpc.monad.xyz`)
- Persistence: localStorage (MVP) → Supabase/Postgres (same as chogathon site uses)
- Styling: plain CSS with the chogathon design tokens (no Tailwind needed)

## 8. Screens
1. **Landing** — hero, pitch, connect wallet / enter demo.
2. **My Chogs** — owned (or demo) Chogs with Rep, energy, streak.
3. **Chog Profile** — art, traits, stats, Rep, title, relationships (friends/rivals), achievements, timeline.
4. **Interact** — choose target Chog + action, animated result.
5. **Chronicle** — global feed + leaderboard.

## 9. Sources / assets
- Chog Genesis ERC-721 (Monad): `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`, 1,969 supply (MonadScan, OpenSea "chog-genesis").
- Metadata: `tokenURI` → `ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/<n>.json`, images `ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/<n>.webp`. Note tokenId ≠ name number (token 1 = "CHOG #1462"). Fetched via gateway.pinata.cloud (ipfs.io/dweb.link no longer serve directly). Cached 12 demo tokens in `public/chogs/` via `scripts/fetch-chogs.mjs`.
- $CHOG token: chog.xyz.
- Visual style: chogathon.chog.xyz CSS variables (bg `#0e0b1a`, card `#161228`, purple `#836ef9`/`#a99bfc`, gold `#f59e0b`, ok `#5ce68a`), fonts Koulen (display), Inter (body), JetBrains Mono (labels). Images `banner.jpg, og.jpg, chog1/5/6.jpg, chognice.jpg, chogwow.jpg, chogbadge.png` copied to `public/brand/` from chogathon.chog.xyz — brand assets of the hackathon host, used for a hackathon entry; confirm usage terms with organizers before public launch.

## 10. Shared backend (implemented)
- `server/` — Hono on Node + SQLite (better-sqlite3 v11, WAL). Tables: `chogs` (rep, energy, streak, achievements), `rels`, `events`, `balances` (mock $CHOG), `nonces`, `metadata` cache, `meta` (season).
- **All game logic is server-side** (`server/engine.ts`): energy/day, rolls, relationships, achievements, streaks, feed, leaderboard. Clients only send intent `{tokenId, action, target}`. Each action runs in a SQLite transaction.
- **Auth:** `GET /api/nonce?address=` → client signs EIP-191 message (`shared/stats.ts#actionMessage`: Chog, Action, Target, Nonce, Issued) → `POST /api/action` verified with viem `verifyMessage`, nonce single-use & ≤10 min, then on-chain `ownerOf(tokenId)` on Monad must equal signer.
- **Demo mode** (`DEMO_MODE` env, default on): `{demo:true}` allowed only for tokens 1, 69, 777, unsigned, balance key `demo`. Set `DEMO_MODE=0` for production.
- Seed: deterministic 60 historical events among 12 cached Chogs on first boot; `POST /api/admin/reset` (header `x-admin-token`, env `ADMIN_TOKEN`, demo mode only).
- API: `/api/world, /known, /chogs?ids=, /chogs/:id, /rel/:a/:b, /feed, /leaderboard, /balance/:owner, /nonce, /action`.
- Dev: Vite proxies `/api` → `:8787`. Prod: `npm run build && npm start` serves `dist/` + API from one process on `$PORT`.

### Deploy options
- **Railway / Fly.io / Render** (recommended): single Node service, mount a persistent volume at `/data`, set `DB_PATH=/data/chronicle.db`, `PORT`, `ADMIN_TOKEN`, `DEMO_MODE`, optionally `MONAD_RPC`. Fly: `fly launch` + `fly volumes create data`.
- **Supabase**: swap `server/db.ts` for Postgres (same schema; `act` becomes a SQL transaction / RPC function). Frontend can stay on Vercel/Netlify with `/api` pointed at the backend.
- Note: SQLite = one instance only (no horizontal scaling) — fine for a hackathon.

## 11. Real $CHOG gifts + demo energy (implemented)
- Wallet mode Gift: client `ownerOf(target)` → ERC-20 `transfer(owner, 25 * 10^decimals)` ($CHOG, 18 decimals) via wagmi → waits for receipt → signs action message that includes `Tx: <hash>` → server re-reads `ownerOf(target)`, fetches the receipt on Monad, requires status success + a $CHOG `Transfer(signer → targetOwner, ≥25)` log, rejects reused hashes (`used_tx` table), then records the gift. Wallet balance shown is the real on-chain `balanceOf`.
- Demo mode: per-visitor session id (localStorage UUID) → own daily energy (`demo_energy` table) and own mock $CHOG balance (`demo:<session>`). Rep/relationships/feed remain one shared world. Chosen over unlimited energy to keep the core loop intact while never blocking judges (a fresh tab/incognito = fresh energy).

## 12. UI polish (implemented)
motion (framer-motion) + canvas-confetti (lazy chunk). Page transitions, 3D tilt+glare cards, duel arena (clash loop, spinning dice, spring result reveal, confetti on win / screen shake on loss, SFX), energy pip + streak flame animations, count-up reputation with up/down flash, staggered timeline, live-feed "fresh" highlight, skeleton loaders, toasts, onboarding steps on landing, chogathon-style buttons (JetBrains Mono uppercase, offset shadow, shine sweep) and SFX toggle (same WebAudio approach as chogathon.chog.xyz). `MotionConfig reducedMotion="user"` + CSS `prefers-reduced-motion` override. Lazy routes + vendor chunks (react / motion / web3); no chunk > 350 KB.
