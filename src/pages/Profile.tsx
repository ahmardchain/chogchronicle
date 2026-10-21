import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ACHIEVEMENTS, ENERGY, stats } from '../chogs';
import { useDemoEnergy, useProfile } from '../api';
import { short, useMeta, useMyChogs } from '../hooks';
import { CountUp, Energy, Img, Page, Skeleton, Tilt } from '../ui';
import { Feed } from '../components';
export default function Profile() {
  const id = Number(useParams().id); const { data: p, error } = useProfile(id); const { ids: mine, address } = useMyChogs(); const meta = useMeta(); const { data: de } = useDemoEnergy([id], !address);
  if (error) return <Page><div className="empty"><img src="/brand/chogwow.jpg" alt="" /><p className="banner">{(error as Error).message}</p></div></Page>;
  if (!p) return <Page className="profile"><aside className="card"><Skeleton h={280} r={14} /><div style={{ height: 14 }} /><Skeleton h={32} w="60%" /><div style={{ height: 14 }} />{[1, 2, 3].map(i => <div key={i} style={{ margin: '10px 0' }}><Skeleton h={10} /></div>)}</aside>
    <section>{[1, 2].map(i => <div key={i} className="card"><Skeleton h={24} w="30%" /><div style={{ height: 14 }} /><Skeleton h={90} /></div>)}</section></Page>;
  const c = p.meta; const st = stats(c); const en = address ? p.energy : de?.[id] ?? 0;
  return <Page className="profile">
    <aside className="card"><Tilt><Img c={c} size={300} className="full" /></Tilt><h2>{short(c.name)}</h2><div className="mono mu">tokenId {id} · <a href={`https://monadscan.com/nft/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/${id}`} target="_blank">MonadScan ↗</a></div>
      <div className="row sp"><span className="chip">{p.title}</span><span className="gold big">★ <CountUp value={p.rep} /></span></div>
      {(['chaos', 'charm', 'grit'] as const).map((k, i) => <div key={k} className="stat"><span className="mono">{k.toUpperCase()}</span><div className="bar"><motion.i initial={{ width: 0 }} animate={{ width: st[k] + '%' }} transition={{ delay: .2 + i * .1, duration: .8, ease: 'easeOut' }} /></div><b>{st[k]}</b></div>)}
      <div className="traits">{c.attributes.map(a => <span key={a.trait_type} className="chip"><small>{a.trait_type}</small> {a.value}</span>)}</div>
      {mine.includes(id) ? <><div style={{ marginTop: 14 }}><Energy left={en} max={ENERGY} streak={p.streak} /></div><Link className="btn full" to={`/interact/${id}`}>⚔️ Interact ({en}/{ENERGY} energy)</Link></>
        : mine[0] && <Link className="btn full ln" to={`/interact/${mine[0]}?target=${id}`}>Interact with this Chog</Link>}
    </aside>
    <section>
      <div className="card"><h3>Relationships</h3>{p.rels.length ? <div className="rels">{p.rels.slice(0, 8).map((x, i) =>
        <motion.div key={x.other} initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * .04 }}><Link to={`/chog/${x.other}`} className="rel"><Img c={x.meta} size={48} /><div><div>{short(x.meta?.name)}</div>
          <span className={'chip ' + x.label.cls}>{x.label.label}</span> <span className="mono mu">bond {x.r.bond} · {x.r.duels} duels</span></div></Link></motion.div>)}</div>
        : <div className="empty sm"><p className="mu">No relationships yet — go make a friend (or an enemy).</p></div>}</div>
      <div className="card"><h3>Achievements <span className="mono mu">{p.achievements.length}/{Object.keys(ACHIEVEMENTS).length}</span></h3><div className="achs">{Object.entries(ACHIEVEMENTS).map(([n, d], i) =>
        <motion.div key={n} className={'ach ' + (p.achievements.includes(n) ? 'got' : '')} title={d} initial={{ opacity: 0, y: 8 }} animate={{ opacity: p.achievements.includes(n) ? 1 : .35, y: 0 }} transition={{ delay: i * .04 }}>🏅 {n}<small>{d}</small></motion.div>)}</div></div>
      <div className="card"><h3>Chronicle</h3><Feed events={p.events} meta={meta} max={25} /></div>
    </section>
  </Page>;
}
