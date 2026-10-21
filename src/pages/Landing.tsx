import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useWorld } from '../api';
import { useMeta } from '../hooks';
import { CountUp, Img, Page, Skeleton, sfx } from '../ui';
export default function Landing() {
  const { data: w } = useWorld(); const meta = useMeta(); const show = [...meta.values()].slice(0, 6);
  return <Page>
    <section className="hero">
      <div>
        <motion.div className="kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>CHOGATHON 2026 · MONAD</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}>Every Chog<br />has a <em>story</em>.</motion.h1>
        <motion.p className="mu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .15 }}>A persistent social world where every Chog NFT builds its own reputation, relationships, rivalries, achievements and history — bound forever to its tokenId.</motion.p>
        <ol className="onboard">
          {[['01', 'Pick a Chog', 'yours, or a demo Chog'], ['02', 'Spend 3 energy', 'duel · befriend · prank · gift'], ['03', 'Build its legend', 'rep, rivals & history stay with the NFT']].map(([n, h, d], i) =>
            <motion.li key={n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25 + i * .1 }}><b className="mono">{n}</b><div><strong>{h}</strong><span>{d}</span></div></motion.li>)}
        </ol>
        <div className="row"><Link className="btn" to="/my" onClick={() => sfx()}>Enter as your Chog →</Link><Link className="btn ln" to="/chronicle" onClick={() => sfx()}>Read the Chronicle</Link></div>
        <div className="statsbar"><div>{w ? <CountUp value={w.events} /> : <b>–</b>}<span>chronicle entries</span></div><div>{w ? <CountUp value={w.relationships} /> : <b>–</b>}<span>relationships</span></div><div><b>S{w?.season ?? 1}</b><span>season</span></div></div>
      </div>
      <div className="herogrid">{show.length ? show.map((c, i) => <motion.div key={c.tokenId} initial={{ opacity: 0, scale: .8, rotate: i % 2 ? 4 : -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: .1 + i * .07, type: 'spring' }}>
        <Link to={`/chog/${c.tokenId}`} className="floaty" style={{ animationDelay: `${i * .6}s` }}><Img c={c} size={150} /></Link></motion.div>)
        : Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={150} r={14} />)}</div>
    </section>
    <section className="cards3">
      {[['⚔️ Challenge', 'Duel other Chogs. Close fights forge rivals, repeated ones forge a nemesis.'], ['🤝 Befriend & Gift', 'Build bonds. Gift real $CHOG to make sworn allies.'], ['📜 Chronicle', 'Every act is written into your Chog\'s permanent, transferable history.']].map(([h, p], i) =>
        <motion.div className="card" key={h} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .1 }}><h3>{h}</h3><p className="mu">{p}</p></motion.div>)}
    </section>
  </Page>;
}
