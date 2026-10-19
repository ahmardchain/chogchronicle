import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { demoSession, post, useMap, useWorld, useInvalidate } from '../api';
import { useCountdown, useKeeper } from '../hooks';
import { CountUp, Page, sfx, useToast } from '../ui';
import MapCanvas from '../MapCanvas';
export default function Landing() {
  const { data: w } = useWorld(); const { data: map } = useMap(); const k = useKeeper(); const nav = useNavigate(); const toast = useToast(); const inval = useInvalidate();
  const cd = useCountdown(w?.nextTick);
  const adopt = async () => { sfx(); try { const r = await post<{ tokenId: number }>('/demo/adopt', { session: demoSession }); await inval(); nav(`/d/${r.tokenId}?welcome=1`); } catch (e) { toast((e as Error).message, 'bad'); } };
  const mine = k.ids[0];
  return <Page>
    <section className="hero">
      <div>
        <motion.div className="kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>CHOGATHON 2026 · MONAD · 1,969 CHOGS</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>Chog <em>Daemons</em></motion.h1>
        <motion.p className="lead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1 }}>The Chogs that play while you sleep. Every Chog is an autonomous daemon on a shared map — its traits are its personality, its history is its memory. Give it <b>one secret order a day</b>. Read its diary when you wake up.</motion.p>
        <ol className="onboard">
          {[['01', mine ? 'Your daemon is awake' : 'Adopt a daemon', mine ? `Chog #${mine} is holding territory right now` : 'connect a wallet, or adopt a guest daemon'], ['02', 'Seal one secret order', 'Raid · Fortify · Ally · Betray · Prank · Scout'], ['03', 'Wake up to its diary', 'the world ticks every 30 min, even offline']].map(([n, h, d], i) =>
            <motion.li key={n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 + i * .1 }}><b className="mono">{n}</b><div><strong>{h}</strong><span>{d}</span></div></motion.li>)}
        </ol>
        <div className="row">{mine ? <Link className="btn" to={`/d/${mine}`} onClick={() => sfx()}>Command #{mine} →</Link> : <button className="btn" onClick={adopt}>Adopt a guest daemon →</button>}<Link className="btn ln" to="/map" onClick={() => sfx()}>Explore the map</Link></div>
        <div className="statsbar"><div>{w ? <CountUp value={w.daemons} /> : <b>–</b>}<span>daemons awake</span></div><div>{w ? <CountUp value={w.events} /> : <b>–</b>}<span>chronicle entries</span></div><div><b className="mono tick">{cd}</b><span>next world tick</span></div></div>
      </div>
      <motion.div className="card heromap" initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .15 }}>
        <MapCanvas owners={map?.owners} daemons={map?.daemons} interactive={false} height={430} mine={k.ids} />
        <div className="heromap-cap mono"><span className="dot" />LIVE · territory flips while everyone sleeps</div>
      </motion.div>
    </section>
    <section className="cards3">
      {[['🃏 Secret order cards', 'Six cards, rock-paper-scissors counters. Your card is hidden until the tick reveals both sides.'], ['🧬 Traits are personality', 'Aggression, Loyalty, Mischief, Greed come from the NFT\'s traits. The same order plays differently per Chog.'], ['🧠 Inherited memory', 'Land, rivals and curses live on the tokenId. Buy a Chog, inherit its grudges.']].map(([h, p], i) =>
        <motion.div className="card" key={h} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .1 }}><h3>{h}</h3><p className="mu">{p}</p></motion.div>)}
    </section>
  </Page>;
}
