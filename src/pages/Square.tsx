import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAccount, useSignMessage } from 'wagmi';
import { witnessMessage } from '../../shared/pacts';
import { demoSession, post, useInvalidate, useSquare, type SquareEvent } from '../api';
import { ICON, ago, short, useMeta, useMyChogs } from '../hooks';
import { signed } from '../sign';
import { Img, Page, Skeleton, confetti, sfx, useToast } from '../ui';
import type { Chog } from '../chogs';

function usePresence(ids: number[]) {
  const key = ids.join(',');
  useEffect(() => {
    if (!ids.length) return;
    const ping = () => post('/presence', { ids }).catch(() => {});
    ping(); const t = setInterval(ping, 15000); return () => clearInterval(t);
  }, [key]); // eslint-disable-line
}
function Countdown({ t, windowMs, now }: { t: number; windowMs: number; now: number }) {
  const [, tick] = useState(0); useEffect(() => { const i = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(i); }, []);
  const skew = now - Date.now(); const left = Math.max(0, t + windowMs - (Date.now() + skew));
  const m = Math.floor(left / 6e4), s = Math.floor(left / 1000) % 60;
  return <span className={'mono wclock ' + (left < 6e4 ? 'hot' : '')}>{left ? `${m}:${String(s).padStart(2, '0')} to witness` : 'window closed'}</span>;
}
function Row({ e, meta, mine, now, windowMs, onWitness, busy }: { e: SquareEvent; meta: Map<number, Chog>; mine: number[]; now: number; windowMs: number; onWitness: (e: SquareEvent, w: number) => void; busy: boolean }) {
  const open = now - e.t < windowMs && /^(challenge|befriend|prank|gift|pact)$/.test(e.action); const can = mine.filter(m => m !== e.actor && m !== e.target && !e.witnesses.includes(m));
  const [w, setW] = useState<number>(0); const pickW = can.includes(w) ? w : can[0];
  const special = e.action === 'pact' || e.action === 'betrayal' || e.action === 'sworn';
  return <motion.div layout className={'sq ' + (e.witnesses.length ? 'seen ' : '') + (special ? 'special k-' + e.action : '')} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
    <Link to={`/chog/${e.actor}`}><Img c={meta.get(e.actor)} size={44} /></Link>
    <div className="evb"><div><span className={'act ' + e.action}>{ICON[e.action] ?? '📜'}</span> {e.text}</div>
      <div className="mono mu sqmeta">{ago(e.t)}
        {open && <> · <Countdown t={e.t} windowMs={windowMs} now={now} /></>}
        <AnimatePresence>{e.witnesses.map(id => <motion.span key={id} className="chip ok wchip" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
          <Img c={meta.get(id)} size={16} /> Witnessed by #{id}</motion.span>)}</AnimatePresence></div></div>
    <Link to={`/chog/${e.target}`}><Img c={meta.get(e.target)} size={44} /></Link>
    {open && can.length > 0 && <div className="wit">
      {can.length > 1 && <select value={pickW} onChange={x => setW(Number(x.target.value))} aria-label="Witness as">{can.map(id => <option key={id} value={id}>#{id}</option>)}</select>}
      <motion.button whileTap={{ scale: .92 }} className="btn sm" disabled={busy} onClick={() => onWitness(e, pickW)}>👁 Witness</motion.button></div>}
  </motion.div>;
}
export default function Square() {
  const { data } = useSquare(); const meta = useMeta(); const { ids: mine, address } = useMyChogs(); const { signMessageAsync } = useSignMessage(); useAccount();
  const toast = useToast(); const inval = useInvalidate(); const [busy, setBusy] = useState(false);
  usePresence(mine);
  const onWitness = async (e: SquareEvent, w: number) => {
    setBusy(true); sfx('click');
    try {
      const auth = address ? await signed(address, (nonce, issuedAt) => witnessMessage({ tokenId: w, eventId: e.id, nonce, issuedAt }), signMessageAsync) : { demo: true, demoSession };
      await post('/witness', { tokenId: w, eventId: e.id, ...auth });
      sfx('success'); confetti(false); toast(`#${w} witnessed it. +3 rep. This moment now counts double.`); inval();
    } catch (x) { sfx('lose'); toast((x as Error).message); } finally { setBusy(false); }
  };
  const online = data?.online ?? [];
  return <Page className="square"><section>
    <div className="kicker">THE SQUARE · LIVE</div><h2>Nothing is official until someone sees it.</h2>
    <p className="mu">Every moment between Chogs lands here first. Another owner has <b>10 minutes</b> to witness it. Witnessed moments carry the witness's name forever, earn the witness rep, and count <b>double</b> for achievements and Pact tiers.</p>
    <div className="card online"><div className="row sp"><h3><span className="dot" />Here now <span className="mono mu">{online.length}</span></h3><span className="mono mu">{data?.activePacts ?? 0} active Pacts</span></div>
      <div className="onrow">{online.length ? online.map(c => <motion.div key={c.tokenId} layout initial={{ scale: 0 }} animate={{ scale: 1 }} title={short(c.name)}><Link to={`/chog/${c.tokenId}`}><Img c={c} size={46} /></Link><small className="mono">#{c.tokenId}</small></motion.div>)
        : <span className="mu">Nobody else is here yet.</span>}</div></div>
    <div className="card">{data ? <AnimatePresence initial={false}>{data.events.map(e => <Row key={e.id} e={e} meta={meta} mine={mine} now={data.now} windowMs={data.windowMs} onWitness={onWitness} busy={busy} />)}</AnimatePresence>
      : Array.from({ length: 6 }, (_, i) => <div key={i} className="sq"><Skeleton h={44} w={44} /><div className="evb"><Skeleton h={14} w="80%" /></div></div>)}</div>
  </section></Page>;
}
