import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { PACT_ACHIEVEMENTS } from '../shared/pacts';
import { usePacts } from './api';
/** Additive: warns on the Interact screen when the two Chogs share a sealed Pact. */
export function PactWarning({ a, b }: { a: number; b: number }) {
  const { data } = usePacts([a]); const p = data?.mine.find(p => p.status === 'active' && ((p.a === a && p.b === b) || (p.a === b && p.b === a)));
  if (!p) return null;
  return <motion.p className="banner pactwarn" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>🤞 Sealed {p.tier} Pact with #{b} · {p.pot} $CHOG pot. Duel or prank now and it is a <b>Betrayal</b>: the pot goes to #{b}. <Link to="/pacts">View Pact</Link></motion.p>;
}
/** Additive: Pact & Witness badges on a profile. */
export function PactBadges({ id, achievements }: { id: number; achievements: string[] }) {
  const { data } = usePacts([id]); const ps = (data?.mine ?? []).filter(p => p.status !== 'cancelled');
  const got = Object.keys(PACT_ACHIEVEMENTS).filter(n => achievements.includes(n));
  return <div className="card"><h3>Pacts & Witnesses <span className="mono mu">{got.length}/{Object.keys(PACT_ACHIEVEMENTS).length}</span></h3>
    <div className="achs">{Object.entries(PACT_ACHIEVEMENTS).map(([n, d]) => <div key={n} className={'ach ' + (got.includes(n) ? 'got' : '')} style={{ opacity: got.includes(n) ? 1 : .35 }} title={d}>🏅 {n}<small>{d}</small></div>)}</div>
    {ps.length > 0 && <p className="mono mu">{ps.map(p => `${p.tier} Pact with #${p.a === id ? p.b : p.a}: ${p.status}`).join(' · ')}</p>}
    <Link className="btn ln sm" to="/pacts">Open Pacts</Link></div>;
}
