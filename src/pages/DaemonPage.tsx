import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useSignMessage } from 'wagmi';
import { CARDS, CARD_INFO, BEATS, orderMessage, tileName, type Card } from '../../shared/daemons';
import { demoSession, get, post, useDaemon, useInvalidate, useMap, type Daemon } from '../api';
import { short, useCountdown, useKeeper, useChogBalance } from '../hooks';
import { CountUp, Img, Page, Skeleton, Tilt, sfx, useToast } from '../ui';
import MapCanvas from '../MapCanvas';
const TEMP: [keyof Daemon['temperament'], string, string][] = [['aggression', 'AGGRESSION', '⚔️'], ['loyalty', 'LOYALTY', '🛡️'], ['mischief', 'MISCHIEF', '😈'], ['greed', 'GREED', '💰']];
export const openRecap = () => window.dispatchEvent(new Event('cc:recap'));

function OrderPanel({ d, mode, address }: { d: Daemon; mode: 'wallet' | 'demo'; address?: string }) {
  const [card, setCard] = useState<Card | null>(null); const [target, setTarget] = useState<number>(d.rels[0]?.other ?? 0); const [busy, setBusy] = useState(false);
  const { signMessageAsync } = useSignMessage(); const toast = useToast(); const inval = useInvalidate(); const cd = useCountdown(d.nextTick); const { data: map } = useMap();
  const o = d.order && !('sealed' in d.order) ? d.order : null;
  const sealed = o && o.source !== 'auto' && o.resolvedAt == null; const done = o && o.source !== 'auto' && o.resolvedAt != null;
  const targets = map?.daemons.filter(x => x.id !== d.tokenId).sort((a, b) => { const ra = d.rels.find(r => r.other === a.id), rb = d.rels.find(r => r.other === b.id); return (rb ? 1 : 0) - (ra ? 1 : 0) || b.territory - a.territory; }) ?? [];
  const seal = async () => {
    if (!card) return; setBusy(true); sfx('click');
    try {
      const tgt = CARD_INFO[card].target ? target : 0;
      if (mode === 'demo') await post('/order', { tokenId: d.tokenId, card, target: tgt, demo: true, demoSession });
      else {
        const n = await get<{ nonce: string; issuedAt: number; day: string }>('/nonce?address=' + address);
        const signature = await signMessageAsync({ message: orderMessage({ tokenId: d.tokenId, card, target: tgt, day: n.day, nonce: n.nonce, issuedAt: n.issuedAt }) });
        await post('/order', { tokenId: d.tokenId, card, target: tgt, address, nonce: n.nonce, issuedAt: n.issuedAt, signature });
      }
      sfx('success'); toast(`${CARD_INFO[card].icon} Order sealed. Resolves at the next tick.`, 'ok'); inval();
    } catch (e) { sfx('lose'); toast((e as Error).message, 'bad'); }
    setBusy(false);
  };
  const ff = async () => { setBusy(true); sfx('dice'); try { await post('/demo/fastforward', { session: demoSession }); sfx('hit'); await inval(); setTimeout(openRecap, 300); } catch (e) { toast((e as Error).message, 'bad'); } setBusy(false); };
  if (sealed) return <div className="card orderpanel sealedbox">
    <motion.div className="bigcard back" initial={{ rotateY: 180 }} animate={{ rotateY: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}><span>🂠</span><b>SEALED</b><small className="mono">{CARD_INFO[o!.card].icon} {CARD_INFO[o!.card].name}{o!.target ? ` → #${o!.target}` : ''}</small></motion.div>
    <div><h3>Order sealed</h3><p className="mu">Nobody can see your card. Your daemon carries it out at the next world tick, against whatever its target secretly plays.</p>
      <div className="tickbig mono">⏳ {cd}</div>
      {mode === 'demo' && <button className="btn" disabled={busy} onClick={ff}>⏩ Fast-forward the night</button>}</div></div>;
  if (done) return <div className="card orderpanel"><h3>Today's order is done</h3><p className="mu">Your daemon acted. Read the diary below — a new order card arrives at 00:00 UTC. Meanwhile it keeps defending itself on personality.</p>{mode === 'demo' && <div className="row"><button className="btn ln" onClick={openRecap}>Show recap</button><button className="btn ln" onClick={async () => { await post('/demo/adopt', { session: demoSession, reroll: true }).then((r: any) => location.assign(`/d/${r.tokenId}?welcome=1`)); }}>Adopt another daemon</button></div>}</div>;
  return <div className="card orderpanel">
    <div className="row sp"><h3>Today's secret order</h3><span className="mono mu">resolves in {cd}</span></div>
    <div className="cards6">{CARDS.map((c, i) => <motion.button key={c} className={'ocard ' + (card === c ? 'sel' : '') + (d.stance === c ? ' stance' : '')} onClick={() => { sfx(); setCard(c); }}
      initial={{ opacity: 0, y: 16, rotate: -3 + i }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * .05 }} whileHover={{ y: -6 }} whileTap={{ scale: .96 }}>
      <span className="ic">{CARD_INFO[c].icon}</span><b>{CARD_INFO[c].name}</b><small>{CARD_INFO[c].blurb}</small><em>{d.perks[c]}</em>
      <span className="mono beats">beats {BEATS[c].map(x => CARD_INFO[x].icon).join(' ')}</span>{d.stance === c && <span className="chip tiny">instinct</span>}</motion.button>)}</div>
    <AnimatePresence>{card && CARD_INFO[card].target && <motion.div className="row targetrow" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
      <span className="mono mu">TARGET</span>
      <select value={target} onChange={e => setTarget(Number(e.target.value))}>{targets.map(t => { const r = d.rels.find(x => x.other === t.id); return <option key={t.id} value={t.id}>#{t.id} · {t.territory} tiles{r ? ` · ${r.label.label} (bond ${r.r.bond})` : ''}</option>; })}</select>
      {target ? <Link to={`/d/${target}`}><Img c={{ tokenId: target, name: '', image: `/chogs/${target}.webp`, attributes: [] }} size={36} /></Link> : null}</motion.div>}</AnimatePresence>
    <button className="btn full" disabled={!card || busy || (CARD_INFO[card].target && !target)} onClick={seal}>{busy ? 'Sealing…' : card ? `Seal ${CARD_INFO[card].icon} ${CARD_INFO[card].name}${mode === 'wallet' ? ' (sign)' : ''}` : 'Pick a card'}</button>
  </div>;
}

export default function DaemonPage() {
  const id = Number(useParams().id); const [sp] = useSearchParams(); const k = useKeeper(); const { data: d, error } = useDaemon(id, k.viewer); const { data: map } = useMap();
  const toast = useToast(); const inval = useInvalidate(); const bal = useChogBalance();
  const mine = k.ids.includes(id);
  if (error) return <Page><div className="empty"><img src="/brand/chogwow.jpg" alt="" /><p className="banner">{(error as Error).message}</p></div></Page>;
  if (!d) return <Page className="profile"><aside className="card"><Skeleton h={280} r={14} /><div style={{ height: 14 }} /><Skeleton h={32} w="60%" /></aside><section><div className="card"><Skeleton h={200} /></div></section></Page>;
  const bounty = async () => { try { if (k.mode !== 'demo') return toast('On-chain bounties need TREASURY_ADDRESS on the server (coming next).', 'info'); await post('/bounty', { target: id, demo: true, session: demoSession }); sfx('success'); toast(`💰 25 $CHOG bounty posted on #${id}. Whoever beats them claims it.`, 'ok'); inval(); } catch (e) { toast((e as Error).message, 'bad'); } };
  return <Page className="profile">
    <aside className="card">
      <Tilt><Img c={d.meta} size={300} className="full" /></Tilt>
      <div className="row sp"><h2>{short(d.meta.name)}</h2>{mine && <span className="chip warn">{k.mode === 'demo' ? 'YOUR GUEST DAEMON' : 'YOURS'}</span>}</div>
      <div className="mono mu">tokenId {id} · home: {d.home} · <a href={`https://monadscan.com/nft/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/${id}`} target="_blank">MonadScan ↗</a></div>
      <div className="kpis"><div><CountUp value={d.territory} /><span>tiles</span></div><div><CountUp value={d.rep} /><span>rep</span></div><div><b>{'🛡'.repeat(Math.min(d.fort, 6)) || '–'}</b><span>walls</span></div></div>
      {TEMP.map(([kk, label, ic], i) => <div key={kk} className="stat"><span className="mono">{ic} {label}</span><div className="bar"><motion.i initial={{ width: 0 }} animate={{ width: d.temperament[kk] + '%' }} transition={{ delay: .2 + i * .1, duration: .8 }} /></div><b>{d.temperament[kk]}</b></div>)}
      <p className="mono mu">Instinct when idle: {CARD_INFO[d.stance].icon} {CARD_INFO[d.stance].name}</p>
      {d.curses.length > 0 && <div className="traits">{d.curses.map(c => <span key={c.name} className="chip bad">💀 {c.name}</span>)}</div>}
      {d.bounty > 0 && <p className="chip gold">💰 {d.bounty} $CHOG bounty on this Chog</p>}
      <div className="traits">{d.meta.attributes.map(a => <span key={a.trait_type} className="chip"><small>{a.trait_type}</small> {a.value}</span>)}</div>
      {!mine && <button className="btn full ln" onClick={bounty}>💰 Post 25 $CHOG bounty</button>}
      <p className="mono mu" style={{ marginTop: 8 }}>{bal.text}</p>
    </aside>
    <section>
      {(sp.get('welcome') || mine) && d.inherited && <motion.div className="card inherit" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="kicker">INHERITED MEMORY</div><h3>{mine ? 'You inherited' : 'This daemon carries'}: {d.inherited.tiles} tiles · {d.inherited.rivals} rival{d.inherited.rivals === 1 ? '' : 's'} · {d.inherited.curses.length} curse{d.inherited.curses.length === 1 ? '' : 's'}</h3>
        <p className="mu">History lives on the tokenId, not the wallet. Previous keeper: {d.inherited.from.startsWith('0x') ? d.inherited.from.slice(0, 8) + '…' : d.inherited.from}. Rep carried over: ★{d.inherited.rep}.</p></motion.div>}
      {mine ? <OrderPanel d={d} mode={k.mode} address={k.address} /> : k.ids[0] ? <div className="card"><p className="mu">Want to hit this Chog? Open <Link className="okc" to={`/d/${k.ids[0]}`}>your daemon #{k.ids[0]}</Link> and target #{id}.</p></div>
        : <div className="card"><p className="mu">Not yours. <Link className="okc" to="/">Adopt a guest daemon</Link> or connect the wallet that holds this Chog to command it.</p></div>}
      <div className="card nopad"><MapCanvas owners={map?.owners} daemons={map?.daemons} focus={id} mine={[id]} interactive height={300} /></div>
      <div className="card"><h3>Diary</h3>{d.diary.length ? d.diary.map((n, ni) => <div key={n.day} className="night"><div className="kicker">{ni === 0 ? 'TODAY' : new Date(n.day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
        {n.entries.map((e, i) => <motion.p key={e.e.id} className={'diary ' + (e.e.actor === id ? (e.e.success ? 'w' : 'l') : e.e.success ? 'l' : 'w')} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(ni * 3 + i, 15) * .04 }}>
          <span className="mono mu">{new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> {e.line}</motion.p>)}</div>) : <p className="mu">No entries yet.</p>}</div>
      <div className="card"><h3>Relationships</h3>{d.rels.length ? <div className="rels">{d.rels.map(x => <Link key={x.other} to={`/d/${x.other}`} className="rel"><Img c={x.meta as any ?? { image: `/chogs/${x.other}.webp` }} size={44} /><div><div>#{x.other}</div><span className={'chip ' + x.label.cls}>{x.label.label}</span> <span className="mono mu">bond {x.r.bond}</span></div></Link>)}</div> : <p className="mu">A lone wolf, for now.</p>}</div>
      <p className="mono mu">Home tile: {tileName(id)} (#{id}) — a sanctuary that can never be taken from an awake daemon.</p>
    </section>
  </Page>;
}
