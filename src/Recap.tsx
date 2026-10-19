import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { demoSession, post, useMe, useInvalidate } from './api';
import { confetti, sfx } from './ui';
/** "While you were asleep…" — overnight recap for the guest daemon. Auto-opens after 10+ min away, or on demand. */
export default function Recap() {
  const { data: me } = useMe(); const [open, setOpen] = useState(false); const inval = useInvalidate();
  useEffect(() => { const f = () => setOpen(true); window.addEventListener('cc:recap', f); return () => window.removeEventListener('cc:recap', f); }, []);
  useEffect(() => { if (me?.recap?.length && me.lastSeen && Date.now() - me.lastSeen > 10 * 60e3) setOpen(true); }, [me?.lastSeen, me?.recap?.length]);
  const items = me?.recap ?? [];
  const id = me?.tokenId;
  const net = items.reduce((a, e) => a + (e.actor === id ? e.repA : e.repB), 0);
  const tiles = items.reduce((a, e) => { const t = e.data?.tiles ?? 0; const gain = (e.action === 'raid' || e.action === 'betray') && ((e.actor === id && e.success) || (e.target === id && !e.success && e.actor !== id)); return a + (gain ? t : e.actor === id || e.target === id ? -t : 0); }, 0);
  useEffect(() => { if (open && items.length) { sfx(net >= 0 ? 'success' : 'lose'); if (net > 0) confetti(false); } }, [open]);
  const close = async () => { setOpen(false); await post('/me/seen', { session: demoSession, at: Date.now() }); inval(); };
  return <AnimatePresence>{open && id && <motion.div className="modalbg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
    <motion.div className="modal card" initial={{ scale: .9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .95, opacity: 0 }} onClick={e => e.stopPropagation()}>
      <div className="kicker">DAEMON #{id} · RECAP</div><h2>While you were asleep…</h2>
      {items.length ? <>
        <div className="kpis"><div><b className={net >= 0 ? 'okc' : 'badc'}>{net >= 0 ? '+' : ''}{net}</b><span>rep</span></div><div><b className={tiles >= 0 ? 'okc' : 'badc'}>{tiles >= 0 ? '+' : ''}{tiles}</b><span>tiles</span></div><div><b>{items.length}</b><span>events</span></div></div>
        <div className="recaplist">{items.map((e, i) => <motion.p key={e.id} className="diary" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .25 + i * .18 }}>“{e.line}”</motion.p>)}</div>
      </> : <p className="mu">Quiet night. Nobody dared to touch your daemon.</p>}
      <div className="row"><button className="btn" onClick={close}>Back to the world</button><Link className="btn ln" to={`/d/${id}`} onClick={close}>Read full diary</Link></div>
    </motion.div></motion.div>}</AnimatePresence>;
}
