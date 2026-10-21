import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useBoard, useFeed, useWorld } from '../api';
import { short, useMeta } from '../hooks';
import { CountUp, Img, Page, Skeleton } from '../ui';
import { Feed } from '../components';
export default function Chronicle() {
  const { data: feed } = useFeed(); const { data: board } = useBoard(); const { data: w } = useWorld(); const meta = useMeta();
  return <Page className="profile chron"><section><h2>The Chronicle</h2><p className="mu"><span className="dot" /> Live feed of the Chog World Order · Season {w?.season ?? 1}</p>
    <div className="card"><Feed events={feed} meta={meta} /></div></section>
    <aside className="card"><h3>Season {w?.season ?? 1} Leaderboard</h3>{board ? board.map((b, i) => <motion.div key={b.tokenId} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .04 }}>
      <Link to={`/chog/${b.tokenId}`} className={'lb ' + (i < 3 ? 'top' + i : '')}><span className="mono">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span><Img c={b.meta} size={36} /><span>{short(b.meta?.name)}</span><span className="gold">★ <CountUp value={b.rep} /></span></Link></motion.div>)
      : Array.from({ length: 8 }, (_, i) => <div key={i} style={{ margin: '10px 0' }}><Skeleton h={36} /></div>)}</aside></Page>;
}
