import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { DEMO, getChog, knownChogs, loadChog, ownedTokenIds, ownerOf, stats, type Chog } from './chogs';
import { ACHIEVEMENTS, ENERGY, act, energyLeft, getState, rel, relLabel, repOf, resetWorld, subscribe, title, type Action, type Event } from './game';

const useGame = () => useSyncExternalStore(subscribe, getState);
const DEMO_OWNED = [1, 69, 777];
function useMyChogs() {
  const { address } = useAccount();
  const [ids, setIds] = useState<number[]>(() => JSON.parse(localStorage.getItem('cc.mine') || 'null') ?? DEMO_OWNED);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!address) return;
    ownedTokenIds(address).then(async r => {
      if (r === null) { setNote('Contract is not enumerable — add your tokenIds manually below (ownership is verified on-chain).'); return; }
      if (!r.length) { setNote('This wallet holds no Chog Genesis — showing demo Chogs.'); return; }
      await Promise.all(r.map(loadChog)); setIds(r); setNote(`Loaded ${r.length} Chog(s) from your wallet.`);
    }).catch(e => setNote('Could not read wallet: ' + e.message));
  }, [address]);
  const save = (n: number[]) => { setIds(n); localStorage.setItem('cc.mine', JSON.stringify(n)); };
  return { ids, setIds: save, note, setNote, address };
}

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
    <nav><NavLink to="/my">My Chogs</NavLink><NavLink to="/chronicle">Chronicle</NavLink></nav><Wallet /></header>;
}

function Landing() {
  const s = useGame();
  return <main>
    <section className="hero">
      <div><div className="kicker">CHOGATHON 2026 · MONAD</div>
        <h1>Every Chog<br />has a <em>story</em>.</h1>
        <p className="mu">A persistent social world where every Chog NFT builds its own reputation, relationships, rivalries, achievements and history — bound forever to its tokenId.</p>
        <div className="row"><Link className="btn" to="/my">Enter as your Chog</Link><Link className="btn ghost" to="/chronicle">Read the Chronicle</Link></div>
        <div className="statsbar"><div><b>{s.events.length}</b><span>chronicle entries</span></div><div><b>{Object.keys(s.rels).length}</b><span>relationships</span></div><div><b>S{s.season}</b><span>season</span></div></div>
      </div>
      <div className="herogrid">{DEMO.slice(0, 6).map(c => <Link key={c.tokenId} to={`/chog/${c.tokenId}`}><Img c={c} size={150} /></Link>)}</div>
    </section>
    <section className="cards3">
      {[['⚔️ Challenge', 'Duel other Chogs. Close fights forge rivals, repeated ones forge a nemesis.'], ['🤝 Befriend & Gift', 'Build bonds. Gift $CHOG to make sworn allies.'], ['📜 Chronicle', 'Every act is written into your Chog\'s permanent, transferable history.']].map(([h, p]) =>
        <div className="card" key={h}><h3>{h}</h3><p className="mu">{p}</p></div>)}
    </section>
  </main>;
}

function ChogCard({ c }: { c: Chog }) {
  const s = useGame(); const rep = repOf(s, c.tokenId);
  return <Link to={`/chog/${c.tokenId}`} className="card chogcard"><Img c={c} size={180} />
    <div className="cn">{short(c.name)}</div><div className="mono mu">tokenId {c.tokenId}</div>
    <div className="row sp"><span className="chip">{title(rep)}</span><span className="gold">★ {rep}</span></div>
    <div className="energy">{Array.from({ length: ENERGY }, (_, i) => <i key={i} className={i < energyLeft(c.tokenId) ? 'on' : ''} />)}<span className="mono mu">🔥 {s.streak[c.tokenId]?.n ?? 0}d</span></div>
  </Link>;
}

function MyChogs() {
  const { ids, setIds, note, setNote, address } = useMyChogs(); const [add, setAdd] = useState(''); const s = useGame();
  const chogs = ids.map(getChog).filter(Boolean) as Chog[];
  const addId = async () => {
    const id = Number(add); if (!(id >= 1 && id <= 1969)) return setNote('tokenId must be 1–1969');
    try {
      if (address) { const o = await ownerOf(id); if (o.toLowerCase() !== address.toLowerCase()) return setNote(`Token ${id} is owned by ${o.slice(0, 8)}…, not you.`); }
      await loadChog(id); setIds([...new Set([...ids, id])]); setNote(address ? 'Ownership verified on Monad ✓' : 'Demo mode: added without ownership check.'); setAdd('');
    } catch (e) { setNote('Error: ' + (e as Error).message); }
  };
  return <main><div className="row sp"><h2>My Chogs</h2><span className="chip gold">{s.chogBalance} $CHOG {address ? '' : '(demo)'}</span></div>
    {!address && <p className="banner">Demo mode — playing with sample Chogs. Connect a wallet holding Chog Genesis to play as your own.</p>}
    {note && <p className="banner">{note}</p>}
    <div className="grid">{chogs.map(c => <ChogCard key={c.tokenId} c={c} />)}</div>
    <div className="row" style={{ marginTop: 24 }}><input value={add} onChange={e => setAdd(e.target.value)} placeholder="Add tokenId (1–1969)" /><button className="btn ghost" onClick={addId}>Add Chog</button>
      <button className="btn ghost" onClick={() => { if (confirm('Reset local world?')) resetWorld(); }}>Reset world</button></div>
  </main>;
}

function EventLine({ e }: { e: Event }) {
  const A = getChog(e.actor), B = getChog(e.target);
  return <div className="ev"><Link to={`/chog/${e.actor}`}><Img c={A} size={40} /></Link><div className="evb"><div>{ICON[e.action]} {e.text}</div>
    <div className="mono mu">{ago(e.t)} · <span className={e.repA >= 0 ? 'okc' : 'badc'}>{e.repA >= 0 ? '+' : ''}{e.repA}</span> / <span className={e.repB >= 0 ? 'okc' : 'badc'}>{e.repB >= 0 ? '+' : ''}{e.repB}</span> rep</div></div>
    <Link to={`/chog/${e.target}`}><Img c={B} size={40} /></Link></div>;
}

function Profile() {
  const id = Number(useParams().id); const s = useGame(); const [c, setC] = useState(getChog(id)); const mine = useMyChogs().ids;
  useEffect(() => { if (!c) loadChog(id).then(setC).catch(() => {}); }, [id]);
  if (!c) return <main><p className="mu">Loading Chog {id} from Monad…</p></main>;
  const st = stats(c); const rep = repOf(s, id);
  const rels = Object.entries(s.rels).map(([k, r]) => { const [a, b] = k.split('-').map(Number); return a === id || b === id ? { other: a === id ? b : a, r, l: relLabel(r) } : null; })
    .filter(Boolean).sort((x, y) => Math.abs(y!.r.bond) + y!.r.duels * 10 - Math.abs(x!.r.bond) - x!.r.duels * 10) as { other: number; r: ReturnType<typeof rel>; l: { label: string; cls: string } }[];
  const evs = s.events.filter(e => e.actor === id || e.target === id);
  const ach = s.achievements[id] || [];
  return <main className="profile">
    <aside className="card"><Img c={c} size={280} /><h2>{short(c.name)}</h2><div className="mono mu">tokenId {id} · <a href={`https://monadscan.com/nft/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/${id}`} target="_blank">MonadScan ↗</a></div>
      <div className="row sp"><span className="chip">{title(rep)}</span><span className="gold big">★ {rep}</span></div>
      {(['chaos', 'charm', 'grit'] as const).map(k => <div key={k} className="stat"><span className="mono">{k.toUpperCase()}</span><div className="bar"><i style={{ width: st[k] + '%' }} /></div><b>{st[k]}</b></div>)}
      <div className="traits">{c.attributes.map(a => <span key={a.trait_type} className="chip"><small>{a.trait_type}</small> {a.value}</span>)}</div>
      {mine.includes(id) ? <Link className="btn full" to={`/interact/${id}`}>Interact ({energyLeft(id)}/{ENERGY} energy)</Link>
        : mine[0] && <Link className="btn full ghost" to={`/interact/${mine[0]}?target=${id}`}>Interact with this Chog</Link>}
    </aside>
    <section>
      <div className="card"><h3>Relationships</h3>{rels.length ? <div className="rels">{rels.slice(0, 8).map(x =>
        <Link key={x.other} to={`/chog/${x.other}`} className="rel"><Img c={getChog(x.other)} size={48} /><div><div>{short(getChog(x.other)?.name)}</div>
          <span className={'chip ' + x.l.cls}>{x.l.label}</span> <span className="mono mu">bond {x.r.bond} · {x.r.duels} duels</span></div></Link>)}</div> : <p className="mu">No relationships yet.</p>}</div>
      <div className="card"><h3>Achievements</h3><div className="achs">{Object.entries(ACHIEVEMENTS).map(([n, d]) => <div key={n} className={'ach ' + (ach.includes(n) ? 'got' : '')} title={d}>🏅 {n}<small>{d}</small></div>)}</div></div>
      <div className="card"><h3>Chronicle</h3>{evs.slice(0, 25).map(e => <EventLine key={e.id} e={e} />)}{!evs.length && <p className="mu">This Chog's story hasn't started yet.</p>}</div>
    </section>
  </main>;
}

function Interact() {
  const id = Number(useParams().id); const [sp] = useSearchParams(); const nav = useNavigate(); useGame();
  const [target, setTarget] = useState<number>(Number(sp.get('target')) || 0); const [res, setRes] = useState<Event | string | null>(null);
  const me = getChog(id); const others = knownChogs().filter(c => c.tokenId !== id);
  if (!me) return <main><p>Unknown Chog.</p></main>;
  const T = getChog(target); const r = T && rel(getState(), id, target);
  const doAct = (a: Action) => setRes(act(id, target, a));
  return <main><h2>Interact as {short(me.name)}</h2><p className="mu">{energyLeft(id)}/{ENERGY} energy left today · {getState().chogBalance} $CHOG</p>
    <div className="versus card"><div><Img c={me} size={160} /><b>{short(me.name)}</b></div><div className="vs">VS</div>
      <div>{T ? <><Img c={T} size={160} /><b>{short(T.name)}</b>{r && <span className={'chip ' + relLabel(r).cls}>{relLabel(r).label} · bond {r.bond}</span>}</> : <div className="pfp empty">?</div>}</div></div>
    <h3>Choose a Chog</h3><div className="picker">{others.map(c => <button key={c.tokenId} className={c.tokenId === target ? 'sel' : ''} onClick={() => { setTarget(c.tokenId); setRes(null); }}><Img c={c} size={64} /><small>{short(c.name)}</small></button>)}</div>
    {T && <div className="actions">{(['challenge', 'befriend', 'prank', 'gift'] as Action[]).map(a => <button key={a} className="btn" disabled={energyLeft(id) <= 0} onClick={() => doAct(a)}>{ICON[a]} {a[0].toUpperCase() + a.slice(1)}{a === 'gift' ? ' 25 $CHOG' : ''}</button>)}</div>}
    {res && (typeof res === 'string' ? <p className="banner">{res}</p> : <div className={'result card ' + (res.success ? 'win' : 'lose')}><div className="big">{res.success ? 'SUCCESS' : 'FAILED'}</div><p>{res.text}</p>
      <div className="row"><button className="btn ghost" onClick={() => nav(`/chog/${id}`)}>View chronicle</button></div></div>)}
  </main>;
}

function Chronicle() {
  const s = useGame(); const board = knownChogs().map(c => ({ c, rep: repOf(s, c.tokenId) })).sort((a, b) => b.rep - a.rep).slice(0, 10);
  return <main className="profile"><section><h2>The Chronicle</h2><p className="mu">Global feed of the Chog World Order · Season {s.season}</p>
    <div className="card">{s.events.slice(0, 50).map(e => <EventLine key={e.id} e={e} />)}</div></section>
    <aside className="card"><h3>Season {s.season} Leaderboard</h3>{board.map((b, i) => <Link key={b.c.tokenId} to={`/chog/${b.c.tokenId}`} className="lb"><span className="mono">{i + 1}</span><Img c={b.c} size={36} /><span>{short(b.c.name)}</span><span className="gold">★ {b.rep}</span></Link>)}</aside></main>;
}

export default function App() {
  return <><Nav /><Routes><Route path="/" element={<Landing />} /><Route path="/my" element={<MyChogs />} /><Route path="/chog/:id" element={<Profile />} /><Route path="/interact/:id" element={<Interact />} /><Route path="/chronicle" element={<Chronicle />} /></Routes>
    <footer className="mono mu">ChogChronicle · Chogathon 2026 · Chog Genesis on Monad · not affiliated with Chog</footer></>;
}
