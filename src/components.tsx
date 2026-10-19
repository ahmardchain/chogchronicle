import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CARD_INFO, type Card, type DEvent } from '../shared/daemons';
import { Img, Skeleton, listItem } from './ui';
import { ago } from './hooks';
import type { MiniChog } from './api';
const icon = (a: string) => CARD_INFO[a as Card]?.icon ?? '📜';
const mini = (id: number): MiniChog => ({ tokenId: id, name: `#${id}`, image: `/chogs/${id}.webp` });
export function EventLine({ e, fresh, i }: { e: DEvent; fresh?: boolean; i: number }) {
  const d = e.data || {};
  return <motion.div layout className={'ev ' + (fresh ? 'fresh' : '')} variants={listItem} custom={i} initial="hidden" animate="show" exit={{ opacity: 0 }}>
    <Link to={`/d/${e.actor}`}><Img c={mini(e.actor) as any} size={40} /></Link>
    <div className="evb"><div><span className="act">{icon(e.action)}</span> {e.text}{d.aCard && d.bCard ? <span className="mono mu"> · {CARD_INFO[d.aCard].name} vs {CARD_INFO[d.bCard].name}</span> : null}{d.source === 'auto' ? <span className="chip tiny">daemon</span> : d.source ? <span className="chip tiny ok">order</span> : null}</div>
      <div className="mono mu">{ago(e.t)} · <span className={e.repA >= 0 ? 'okc' : 'badc'}>{e.repA >= 0 ? '+' : ''}{e.repA}</span> / <span className={e.repB >= 0 ? 'okc' : 'badc'}>{e.repB >= 0 ? '+' : ''}{e.repB}</span> rep{d.tiles ? ` · ${d.tiles} tile${d.tiles > 1 ? 's' : ''} moved` : ''}{d.bounty ? ` · 💰 ${d.bounty} $CHOG bounty` : ''}</div></div>
    {e.target !== e.actor ? <Link to={`/d/${e.target}`}><Img c={mini(e.target) as any} size={40} /></Link> : <span style={{ width: 40 }} />}</motion.div>;
}
export function Feed({ events, max = 50 }: { events?: DEvent[]; max?: number }) {
  const seen = useRef<Set<string> | null>(null);
  if (!events) return <>{Array.from({ length: 6 }, (_, i) => <div key={i} className="ev"><Skeleton h={40} w={40} /><div className="evb"><Skeleton h={14} w="80%" /><div style={{ height: 6 }} /><Skeleton h={10} w="30%" /></div></div>)}</>;
  if (!seen.current) seen.current = new Set(events.map(e => e.id));
  const s = seen.current;
  const out = events.slice(0, max).map((e, i) => { const fresh = !s.has(e.id); return <EventLine key={e.id} e={e} fresh={fresh} i={fresh ? 0 : i} />; });
  queueMicrotask(() => events.forEach(e => setTimeout(() => s.add(e.id), 3000)));
  if (!events.length) return <div className="empty"><img src="/brand/chogwow.jpg" alt="" /><p className="mu">The world is quiet… for now.</p></div>;
  return <AnimatePresence initial>{out}</AnimatePresence>;
}
