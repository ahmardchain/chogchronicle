import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { Chog, Event } from './chogs';
import { Img, Skeleton, listItem } from './ui';
import { ago, ICON } from './hooks';
export function EventLine({ e, meta, fresh, i }: { e: Event; meta: Map<number, Chog>; fresh?: boolean; i: number }) {
  return <motion.div layout className={'ev ' + (fresh ? 'fresh' : '')} variants={listItem} custom={i} initial="hidden" animate="show" exit={{ opacity: 0 }}>
    <Link to={`/chog/${e.actor}`}><Img c={meta.get(e.actor)} size={40} /></Link>
    <div className="evb"><div><span className={'act ' + e.action}>{ICON[e.action]}</span> {e.text}</div>
      <div className="mono mu">{ago(e.t)} · <span className={e.repA >= 0 ? 'okc' : 'badc'}>{e.repA >= 0 ? '+' : ''}{e.repA}</span> / <span className={e.repB >= 0 ? 'okc' : 'badc'}>{e.repB >= 0 ? '+' : ''}{e.repB}</span> rep</div></div>
    <Link to={`/chog/${e.target}`}><Img c={meta.get(e.target)} size={40} /></Link></motion.div>;
}
/** Feed that highlights entries that arrived after first render. */
export function Feed({ events, meta, max = 50 }: { events?: Event[]; meta: Map<number, Chog>; max?: number }) {
  const seen = useRef<Set<string> | null>(null);
  if (!events) return <>{Array.from({ length: 6 }, (_, i) => <div key={i} className="ev"><Skeleton h={40} w={40} /><div className="evb"><Skeleton h={14} w="80%" /><div style={{ height: 6 }} /><Skeleton h={10} w="30%" /></div></div>)}</>;
  if (!seen.current) seen.current = new Set(events.map(e => e.id));
  const s = seen.current;
  const out = events.slice(0, max).map((e, i) => { const fresh = !s.has(e.id); return <EventLine key={e.id} e={e} meta={meta} fresh={fresh} i={fresh ? 0 : i} />; });
  queueMicrotask(() => events.forEach(e => setTimeout(() => s.add(e.id), 3000)));
  if (!events.length) return <div className="empty"><img src="/brand/chogwow.jpg" alt="" /><p className="mu">No chronicle entries yet. Be the first legend.</p></div>;
  return <AnimatePresence initial={true}>{out}</AnimatePresence>;
}
