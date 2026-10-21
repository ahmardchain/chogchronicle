import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { DEMO_OWNED, ENERGY, ownerOf } from '../chogs';
import { get, useDemoEnergy, useSummaries, type Summary } from '../api';
import { short, useChogBalance, useMyChogs } from '../hooks';
import { CountUp, Energy, Img, Page, Skeleton, Tilt, sfx, useToast } from '../ui';
function ChogCard({ s, energy, i }: { s: Summary; energy?: number; i: number }) {
  const c = s.meta; const en = energy ?? s.energy;
  return <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .06 }}>
    <Tilt><Link to={`/chog/${c.tokenId}`} className="card chogcard" onClick={() => sfx()}><Img c={c} size={220} className="full" />
      <div className="cn">{short(c.name)}</div><div className="mono mu">tokenId {c.tokenId}</div>
      <div className="row sp"><span className="chip">{s.title}</span><span className="gold">★ <CountUp value={s.rep} /></span></div>
      <Energy left={en} max={ENERGY} streak={s.streak} />
      {en > 0 ? <span className="cta mono">Ready to act →</span> : <span className="cta mono mu">Rested until tomorrow</span>}
    </Link></Tilt></motion.div>;
}
export default function MyChogs() {
  const { ids, setIds, note, setNote, address } = useMyChogs(); const [add, setAdd] = useState(''); const toast = useToast();
  const { data: chogs } = useSummaries(ids); const bal = useChogBalance(); const { data: de } = useDemoEnergy(ids, !address);
  const addId = async () => {
    const id = Number(add); if (!(id >= 1 && id <= 1969)) return toast('tokenId must be 1–1969', 'bad');
    try {
      if (address) { const o = await ownerOf(id); if (o.toLowerCase() !== address.toLowerCase()) return toast(`Token ${id} is owned by ${o.slice(0, 8)}…, not you.`, 'bad'); }
      await get('/chogs/' + id); setIds([...new Set([...ids, id])]); toast(address ? 'Ownership verified on Monad ✓' : `Chog ${id} added (view only in demo)`, 'ok'); setAdd(''); setNote('');
    } catch (e) { toast('Error: ' + (e as Error).message, 'bad'); }
  };
  return <Page><div className="row sp"><h2>My Chogs</h2><span className="chip gold">{bal.text}</span></div>
    {!address && <div className="banner hint"><img src="/brand/chognice.jpg" alt="" /><div><b>Demo mode</b> — you're playing Chogs {DEMO_OWNED.join(', ')} in the shared live world with your own 3 daily energy. Connect a wallet holding Chog Genesis to play as your own (actions are wallet-signed).</div></div>}
    {note && <p className="banner">{note}</p>}
    <div className="grid">{chogs ? chogs.map((s, i) => <ChogCard key={s.tokenId} s={s} i={i} energy={address ? undefined : de?.[s.tokenId]} />)
      : ids.map(i => <div key={i} className="card"><Skeleton h={220} r={14} /><div style={{ height: 12 }} /><Skeleton h={22} w="60%" /><div style={{ height: 8 }} /><Skeleton h={12} w="40%" /></div>)}</div>
    {chogs && !chogs.length && <div className="empty"><img src="/brand/chogwow.jpg" alt="" /><p className="mu">No Chogs here yet. Add a tokenId below or disconnect to try demo mode.</p></div>}
    <div className="row addrow"><input value={add} onChange={e => setAdd(e.target.value)} onKeyDown={e => e.key === 'Enter' && addId()} placeholder="Add tokenId (1–1969)" /><button className="btn ln" onClick={addId}>Add Chog</button></div>
  </Page>;
}
