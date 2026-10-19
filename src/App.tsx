import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect, useSignMessage, useReadContracts, useWriteContract, useConfig } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import { ACHIEVEMENTS, ACTIONS, DEMO_OWNED, ENERGY, actionMessage, ownedTokenIds, ownerOf, stats, CHOG_TOKEN, GIFT_AMOUNT, type Action, type Chog, type Event } from './chogs';
import { get, post, useBalance, useBoard, useFeed, useInvalidate, useKnown, useProfile, useSummaries, useWorld, demoSession, useDemoEnergy, type Summary } from './api';

function useMyChogs() {
  const { address } = useAccount();
  const [ids, setIds] = useState<number[]>(() => JSON.parse(localStorage.getItem('cc.mine') || 'null') ?? DEMO_OWNED);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!address) { setIds(JSON.parse(localStorage.getItem('cc.mine') || 'null') ?? DEMO_OWNED); return; }
    ownedTokenIds(address).then(r => {
      if (r === null) { setNote('Contract is not enumerable — add your tokenIds below (ownership is verified on-chain).'); return; }
      if (!r.length) { setNote('This wallet holds no Chog Genesis — switch to demo by disconnecting.'); setIds([]); return; }
      setIds(r); setNote(`Loaded ${r.length} Chog(s) from your wallet.`);
    }).catch(e => setNote('Could not read wallet: ' + e.message));
  }, [address]);
  const save = (n: number[]) => { setIds(n); localStorage.setItem('cc.mine', JSON.stringify(n)); };
  return { ids, setIds: save, note, setNote, address };
}
/** Real on-chain $CHOG in wallet mode, per-session mock balance in demo mode. */
function useChogBalance() {
  const { address } = useAccount(); const { data: mock } = useBalance('demo:' + demoSession);
  const { data } = useReadContracts({ contracts: address ? [{ address: CHOG_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: 143 }, { address: CHOG_TOKEN, abi: erc20Abi, functionName: 'decimals', chainId: 143 }] : [], query: { enabled: !!address, refetchInterval: 10000 } });
  if (!address) return { text: `${mock?.balance ?? '…'} $CHOG (demo)`, decimals: 18 };
  const bal = data?.[0]?.result as bigint | undefined, dec = (data?.[1]?.result as number | undefined) ?? 18;
  return { text: bal === undefined ? '… $CHOG' : `${Number(formatUnits(bal, dec)).toLocaleString(undefined, { maximumFractionDigits: 2 })} $CHOG`, decimals: dec, raw: bal };
}
function useMeta() { const { data } = useKnown(); const m = new Map<number, Chog>(); data?.forEach(c => m.set(c.tokenId, c)); return m; }

function Img({ c, size = 96 }: { c?: Chog; size?: number }) {
  return <img className="pfp" src={c?.image} width={size} height={size} alt={c?.name} loading="lazy" />;
}
const short = (n?: string) => n?.replace('CHOG ', 'Chog ');
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 6e4); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const ICON: Record<Action, string> = { challenge: '⚔️', befriend: '🤝', prank: '😈', gift: '🎁' };

function Wallet() {
  const { isConnected, address } = useAccount(); const { connect, connectors } = useConnect(); const { disconnect } = useDisconnect();
  if (isConnected) return <button className="btn ghost" onClick={() => disconnect()}>{address?.slice(0, 6)}…{address?.slice(-4)}</button>;
  return <button className="btn" onClick={() => connectors[0] && connect({ connector: connectors[0] })}>Connect wallet</button>;
}
function Nav() {
  return <header className="nav"><Link to="/" className="logo"><img src="/brand/chogbadge.png" alt="" />CHOG<span>CHRONICLE</span></Link>
    <nav><NavLink to="/my">My Chogs</NavLink><NavLink to="/chronicle">Chronicle</NavLink></nav><span className="chip ok live">● LIVE WORLD</span><Wallet /></header>;
}

function Landing() {
  const { data: w } = useWorld(); const meta = useMeta(); const show = [...meta.values()].slice(0, 6);
  return <main>
    <section className="hero">
      <div><div className="kicker">CHOGATHON 2026 · MONAD</div>
        <h1>Every Chog<br />has a <em>story</em>.</h1>
        <p className="mu">A persistent social world where every Chog NFT builds its own reputation, relationships, rivalries, achievements and history — bound forever to its tokenId.</p>
        <div className="row"><Link className="btn" to="/my">Enter as your Chog</Link><Link className="btn ghost" to="/chronicle">Read the Chronicle</Link></div>
        <div className="statsbar"><div><b>{w?.events ?? '–'}</b><span>chronicle entries</span></div><div><b>{w?.relationships ?? '–'}</b><span>relationships</span></div><div><b>S{w?.season ?? 1}</b><span>season</span></div></div>
      </div>
      <div className="herogrid">{show.map(c => <Link key={c.tokenId} to={`/chog/${c.tokenId}`}><Img c={c} size={150} /></Link>)}</div>
    </section>
    <section className="cards3">
      {[['⚔️ Challenge', 'Duel other Chogs. Close fights forge rivals, repeated ones forge a nemesis.'], ['🤝 Befriend & Gift', 'Build bonds. Gift $CHOG to make sworn allies.'], ['📜 Chronicle', 'Every act is written into your Chog\'s permanent, transferable history.']].map(([h, p]) =>
        <div className="card" key={h}><h3>{h}</h3><p className="mu">{p}</p></div>)}
    </section>
  </main>;
}

function ChogCard({ s, energy }: { s: Summary; energy?: number }) {
  const c = s.meta; const en = energy ?? s.energy;
  return <Link to={`/chog/${c.tokenId}`} className="card chogcard"><Img c={c} size={180} />
    <div className="cn">{short(c.name)}</div><div className="mono mu">tokenId {c.tokenId}</div>
    <div className="row sp"><span className="chip">{s.title}</span><span className="gold">★ {s.rep}</span></div>
    <div className="energy">{Array.from({ length: ENERGY }, (_, i) => <i key={i} className={i < en ? 'on' : ''} />)}<span className="mono mu">🔥 {s.streak}d</span></div>
  </Link>;
}

function MyChogs() {
  const { ids, setIds, note, setNote, address } = useMyChogs(); const [add, setAdd] = useState('');
  const { data: chogs } = useSummaries(ids); const bal = useChogBalance(); const { data: de } = useDemoEnergy(ids, !address);
  const addId = async () => {
    const id = Number(add); if (!(id >= 1 && id <= 1969)) return setNote('tokenId must be 1–1969');
    try {
      if (address) { const o = await ownerOf(id); if (o.toLowerCase() !== address.toLowerCase()) return setNote(`Token ${id} is owned by ${o.slice(0, 8)}…, not you.`); }
      await get('/chogs/' + id); setIds([...new Set([...ids, id])]); setNote(address ? 'Ownership verified on Monad ✓' : 'Added (view only — demo mode can act only as demo Chogs).'); setAdd('');
    } catch (e) { setNote('Error: ' + (e as Error).message); }
  };
  return <main><div className="row sp"><h2>My Chogs</h2><span className="chip gold">{bal.text}</span></div>
    {!address && <p className="banner">Demo mode — acting as sample Chogs {DEMO_OWNED.join(', ')} in the shared world, with your own daily energy. Connect a wallet holding Chog Genesis to play as your own (actions are wallet-signed).</p>}
    {note && <p className="banner">{note}</p>}
    <div className="grid">{chogs?.map(s => <ChogCard key={s.tokenId} s={s} energy={address ? undefined : de?.[s.tokenId]} />)}</div>
    <div className="row" style={{ marginTop: 24 }}><input value={add} onChange={e => setAdd(e.target.value)} placeholder="Add tokenId (1–1969)" /><button className="btn ghost" onClick={addId}>Add Chog</button></div>
  </main>;
}

function EventLine({ e, meta }: { e: Event; meta: Map<number, Chog> }) {
  return <div className="ev"><Link to={`/chog/${e.actor}`}><Img c={meta.get(e.actor)} size={40} /></Link><div className="evb"><div>{ICON[e.action]} {e.text}</div>
    <div className="mono mu">{ago(e.t)} · <span className={e.repA >= 0 ? 'okc' : 'badc'}>{e.repA >= 0 ? '+' : ''}{e.repA}</span> / <span className={e.repB >= 0 ? 'okc' : 'badc'}>{e.repB >= 0 ? '+' : ''}{e.repB}</span> rep</div></div>
    <Link to={`/chog/${e.target}`}><Img c={meta.get(e.target)} size={40} /></Link></div>;
}

function Profile() {
  const id = Number(useParams().id); const { data: p, error } = useProfile(id); const { ids: mine, address } = useMyChogs(); const meta = useMeta(); const { data: de } = useDemoEnergy([id], !address);
  if (error) return <main><p className="banner">{(error as Error).message}</p></main>;
  if (!p) return <main><p className="mu">Loading Chog {id}…</p></main>;
  const c = p.meta; const st = stats(c);
  return <main className="profile">
    <aside className="card"><Img c={c} size={280} /><h2>{short(c.name)}</h2><div className="mono mu">tokenId {id} · <a href={`https://monadscan.com/nft/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/${id}`} target="_blank">MonadScan ↗</a></div>
      <div className="row sp"><span className="chip">{p.title}</span><span className="gold big">★ {p.rep}</span></div>
      {(['chaos', 'charm', 'grit'] as const).map(k => <div key={k} className="stat"><span className="mono">{k.toUpperCase()}</span><div className="bar"><i style={{ width: st[k] + '%' }} /></div><b>{st[k]}</b></div>)}
      <div className="traits">{c.attributes.map(a => <span key={a.trait_type} className="chip"><small>{a.trait_type}</small> {a.value}</span>)}</div>
      {mine.includes(id) ? <Link className="btn full" to={`/interact/${id}`}>Interact ({address ? p.energy : de?.[id] ?? '…'}/{ENERGY} energy)</Link>
        : mine[0] && <Link className="btn full ghost" to={`/interact/${mine[0]}?target=${id}`}>Interact with this Chog</Link>}
    </aside>
    <section>
      <div className="card"><h3>Relationships</h3>{p.rels.length ? <div className="rels">{p.rels.slice(0, 8).map(x =>
        <Link key={x.other} to={`/chog/${x.other}`} className="rel"><Img c={x.meta} size={48} /><div><div>{short(x.meta?.name)}</div>
          <span className={'chip ' + x.label.cls}>{x.label.label}</span> <span className="mono mu">bond {x.r.bond} · {x.r.duels} duels</span></div></Link>)}</div> : <p className="mu">No relationships yet.</p>}</div>
      <div className="card"><h3>Achievements</h3><div className="achs">{Object.entries(ACHIEVEMENTS).map(([n, d]) => <div key={n} className={'ach ' + (p.achievements.includes(n) ? 'got' : '')} title={d}>🏅 {n}<small>{d}</small></div>)}</div></div>
      <div className="card"><h3>Chronicle</h3>{p.events.slice(0, 25).map(e => <EventLine key={e.id} e={e} meta={meta} />)}{!p.events.length && <p className="mu">This Chog's story hasn't started yet.</p>}</div>
    </section>
  </main>;
}

function Interact() {
  const id = Number(useParams().id); const [sp] = useSearchParams(); const nav = useNavigate();
  const { address } = useAccount(); const { signMessageAsync } = useSignMessage(); const { writeContractAsync } = useWriteContract(); const cfg = useConfig(); const inval = useInvalidate(); const [status, setStatus] = useState('');
  const [target, setTarget] = useState<number>(Number(sp.get('target')) || 0); const [res, setRes] = useState<Event | string | null>(null); const [busy, setBusy] = useState(false);
  const { data: meP } = useProfile(id); const meta = useMeta(); const bal = useChogBalance(); const { data: de } = useDemoEnergy([id], !address);
  const r = target ? meP?.rels.find(x => x.other === target) : undefined;
  const me = meta.get(id) ?? meP?.meta; const others = [...meta.values()].filter(c => c.tokenId !== id);
  if (!me) return <main><p className="mu">Loading…</p></main>;
  const T = meta.get(target);
  const doAct = async (action: Action) => {
    setBusy(true); setRes(null);
    try {
      let body: Record<string, unknown> = { tokenId: id, target, action };
      if (address) {
        let txHash: `0x${string}` | undefined;
        if (action === 'gift') {
          setStatus('Looking up the owner of the target Chog…');
          const to = await ownerOf(target);
          setStatus(`Confirm the ${GIFT_AMOUNT} $CHOG transfer to ${to.slice(0, 8)}… in your wallet`);
          txHash = await writeContractAsync({ address: CHOG_TOKEN, abi: erc20Abi, functionName: 'transfer', args: [to, parseUnits(String(GIFT_AMOUNT), bal.decimals)], chainId: 143 });
          setStatus('Waiting for Monad confirmation…'); await waitForTransactionReceipt(cfg, { hash: txHash, chainId: 143 });
        }
        setStatus('Sign the action message…');
        const { nonce, issuedAt } = await get<{ nonce: string; issuedAt: number }>('/nonce?address=' + address);
        const signature = await signMessageAsync({ message: actionMessage({ tokenId: id, action, target, nonce, issuedAt, tx: txHash }) });
        body = { ...body, address, nonce, issuedAt, signature, txHash };
        setStatus(txHash ? 'Server is verifying your gift on Monad…' : '');
      } else { body.demo = true; body.demoSession = demoSession; }
      const out = await post<{ event: Event }>('/action', body); setRes(out.event);
    } catch (e) { setRes((e as Error).message); }
    setBusy(false); setStatus(''); inval();
  };
  const energy = address ? meP?.energy ?? 0 : de?.[id] ?? 0;
  return <main><h2>Interact as {short(me.name)}</h2><p className="mu">{energy}/{ENERGY} energy left today · {bal.text} · {address ? 'actions are signed with your wallet; gifts are real $CHOG transfers' : 'demo mode (your own energy)'}</p>{status && <p className="banner">{status}</p>}
    <div className="versus card"><div><Img c={me} size={160} /><b>{short(me.name)}</b></div><div className="vs">VS</div>
      <div>{T ? <><Img c={T} size={160} /><b>{short(T.name)}</b>{r && <span className={'chip ' + r.label.cls}>{r.label.label} · bond {r.r.bond}</span>}</> : <div className="pfp empty">?</div>}</div></div>
    <h3>Choose a Chog</h3><div className="picker">{others.map(c => <button key={c.tokenId} className={c.tokenId === target ? 'sel' : ''} onClick={() => { setTarget(c.tokenId); setRes(null); }}><Img c={c} size={64} /><small>{short(c.name)}</small></button>)}</div>
    {T && <div className="actions">{ACTIONS.map(a => <button key={a} className="btn" disabled={busy || energy <= 0} onClick={() => doAct(a)}>{ICON[a]} {a[0].toUpperCase() + a.slice(1)}{a === 'gift' ? ` ${GIFT_AMOUNT} $CHOG` : ''}</button>)}</div>}
    {res && (typeof res === 'string' ? <p className="banner">{res}</p> : <div className={'result card ' + (res.success ? 'win' : 'lose')}><div className="big">{res.success ? 'SUCCESS' : 'FAILED'}</div><p>{res.text}</p>
      <div className="row"><button className="btn ghost" onClick={() => nav(`/chog/${id}`)}>View chronicle</button></div></div>)}
  </main>;
}

function Chronicle() {
  const { data: feed } = useFeed(); const { data: board } = useBoard(); const { data: w } = useWorld(); const meta = useMeta();
  return <main className="profile"><section><h2>The Chronicle</h2><p className="mu">Global feed of the Chog World Order · Season {w?.season ?? 1} · updates live</p>
    <div className="card">{feed?.map(e => <EventLine key={e.id} e={e} meta={meta} />)}</div></section>
    <aside className="card"><h3>Season {w?.season ?? 1} Leaderboard</h3>{board?.map((b, i) => <Link key={b.tokenId} to={`/chog/${b.tokenId}`} className="lb"><span className="mono">{i + 1}</span><Img c={b.meta} size={36} /><span>{short(b.meta?.name)}</span><span className="gold">★ {b.rep}</span></Link>)}</aside></main>;
}

export default function App() {
  return <><Nav /><Routes><Route path="/" element={<Landing />} /><Route path="/my" element={<MyChogs />} /><Route path="/chog/:id" element={<Profile />} /><Route path="/interact/:id" element={<Interact />} /><Route path="/chronicle" element={<Chronicle />} /></Routes>
    <footer className="mono mu">ChogChronicle · Chogathon 2026 · Chog Genesis on Monad · not affiliated with Chog</footer></>;
}
