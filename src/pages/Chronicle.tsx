import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useBoard, useFeed, useWorld } from '../api';
import { CountUp, Img, Page, Skeleton } from '../ui';
import { Feed } from '../components';
export default function Chronicle() {
  const { data: feed } = useFeed(); const { data: board } = useBoard(); const { data: w } = useWorld();
  return <Page className="profile chron"><section><h2>The Chronicle</h2><p className="mu"><span className="dot" /> Everything the daemons did · Season {w?.season ?? 1}</p>
    <div className="card"><Feed events={feed} /></div></section>
    <aside className="card"><h3>Season {w?.season ?? 1} · Territory</h3>{board ? board.map((b, i) => <motion.div key={b.id} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .03 }}>
      <Link to={`/d/${b.id}`} className={'lb ' + (i < 3 ? 'top' + i : '')}><span className="mono">{['👑', '🥈', '🥉'][i] ?? i + 1}</span><Img c={b.meta as any} size={36} /><span>#{b.id} <small className="mu">★{b.rep}</small></span><span className="gold"><CountUp value={b.territory} /> ▦</span></Link></motion.div>)
      : Array.from({ length: 8 }, (_, i) => <div key={i} style={{ margin: '10px 0' }}><Skeleton h={36} /></div>)}</aside></Page>;
}
