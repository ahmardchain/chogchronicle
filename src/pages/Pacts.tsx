import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useConfig, useSignMessage, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { erc20Abi, parseUnits } from 'viem';
import { CHOG_TOKEN } from '../chogs';
import { PACT_ACHIEVEMENTS, pactMessage, type Pact } from '../../shared/pacts';
import { demoSession, post, useInvalidate, usePactConfig, usePactPreview, usePacts, useProfile } from '../api';
import { short, useChogBalance, useMeta, useMyChogs } from '../hooks';
import { signed } from '../sign';
import { Img, Page, confetti, sfx, useToast } from '../ui';
import type { Chog } from '../chogs';

const left = (ends: number | null) => { const ms = Math.max(0, (ends ?? 0) - Date.now()); const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`; };
const STATUS: Record<string, string> = { pending: 'Awaiting co-sign', active: 'Sealed', sworn: 'Sworn', betrayed: 'Betrayed', cancelled: 'Cancelled' };
function PactCard({ p, meta, mine, onAccept, onCancel, busy }: { p: Pact; meta: Map<number, Chog>; mine: number[]; onAccept?: (p: Pact) => void; onCancel?: (p: Pact) => void; busy: boolean }) {
  const [, tick] = useState(0); useEffect(() => { if (p.status !== 'active') return; const i = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(i); }, [p.status]);
  return <motion.div layout className={'pact ' + p.status + ' t-' + p.tier} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }}>
    <div className="pair"><Link to={`/chog/${p.a}`}><Img c={meta.get(p.a)} size={56} /></Link><motion.span className="seal" animate={p.status === 'active' ? { scale: [1, 1.12, 1] } : {}} transition={{ repeat: Infinity, duration: 2 }}>{p.status === 'betrayed' ? '💔' : p.status === 'sworn' ? '🛡️' : '🤞'}</motion.span><Link to={`/chog/${p.b}`}><Img c={meta.get(p.b)} size={56} /></Link></div>
    <div className="pinfo"><div><b>{short(meta.get(p.a)?.name) ?? '#' + p.a}</b> <span className="mu">&</span> <b>{short(meta.get(p.b)?.name) ?? '#' + p.b}</b></div>
      <div className="row"><span className={'chip tier ' + p.tier}>{p.tier}</span><span className={'chip ' + (p.status === 'betrayed' ? 'bad' : p.status === 'sworn' || p.status === 'active' ? 'ok' : 'warn')}>{STATUS[p.status]}</span>
        <span className="gold mono">{p.status === 'pending' ? `${p.stake} staked · ${p.stake * 2} pot` : `${p.pot} $CHOG pot`}</span></div>
      <div className="mono mu">{p.status === 'active' && <>Ends in {left(p.ends)} · </>}{p.status === 'betrayed' && <>#{p.betrayer} broke it · pot {p.mode === 'demo' ? 'paid' : 'owed'} to {p.betrayer === p.a ? '#' + p.b : '#' + p.a}'s owner · </>}
        history score {p.score} · {p.mode === 'demo' ? 'demo stakes' : p.mode === 'escrow' ? 'on-chain escrow' : 'signed pledge'}</div></div>
    <div className="pact-act">{p.status === 'pending' && onAccept && <motion.button whileTap={{ scale: .94 }} className="btn sm" disabled={busy} onClick={() => onAccept(p)}>Co-sign as #{p.b}</motion.button>}
      {p.status === 'pending' && onCancel && <button className="btn ln sm" disabled={busy} onClick={() => onCancel(p)}>Cancel</button>}
      {p.status === 'active' && mine.includes(p.a) && <Link className="btn ln sm" to={`/interact/${p.a}?target=${p.b}`}>Visit #{p.b}</Link>}</div>
  </motion.div>;
}
export default function Pacts() {
  const { ids: mine, address } = useMyChogs(); const meta = useMeta(); const toast = useToast(); const inval = useInvalidate(); const bal = useChogBalance();
  const { signMessageAsync } = useSignMessage(); const { writeContractAsync } = useWriteContract(); const cfg = useConfig();
  const [me, setMe] = useState(0); const my = mine.includes(me) ? me : mine[0] ?? 0;
  const { data: prof } = useProfile(my); const friends = (prof?.rels ?? []).filter(r => r.label.label === 'Friend' || r.label.label === 'Sworn Ally');
  const [pt, setPt] = useState(0); const partner = friends.some(f => f.other === pt) ? pt : friends[0]?.other ?? 0;
  const { data: pv } = usePactPreview(my, partner); const { data: pc } = usePactConfig(); const { data } = usePacts(mine);
  const [stake, setStake] = useState(25); const [busy, setBusy] = useState(false);
  const maxStake = pv?.tier.maxStake ?? 25; const st = Math.min(stake, maxStake);
  const stakeTx = async (amount: number) => {
    if (pc?.mode !== 'escrow' || !pc.escrow) return undefined;
    const h = await writeContractAsync({ address: CHOG_TOKEN, abi: erc20Abi, functionName: 'transfer', args: [pc.escrow as `0x${string}`, parseUnits(String(amount), bal.decimals)], chainId: 143 });
    await waitForTransactionReceipt(cfg, { hash: h, chainId: 143 }); return h;
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); sfx('click'); try { await fn(); inval(); } catch (e) { sfx('lose'); toast((e as Error).message, 'bad'); } finally { setBusy(false); } };
  const propose = () => run(async () => {
    let body: Record<string, unknown> = { tokenId: my, partner, stake: st };
    if (address) { const txHash = await stakeTx(st); body = { ...body, txHash, ...(await signed(address, (nonce, issuedAt) => pactMessage({ op: 'propose', tokenId: my, partner, stake: st, nonce, issuedAt, tx: txHash }), signMessageAsync)) }; }
    else body = { ...body, demo: true, demoSession };
    await post('/pact/propose', body); sfx('success'); toast(`Pact proposed. #${partner}'s owner has to co-sign.`, 'ok');
  });
  const accept = (p: Pact) => run(async () => {
    let body: Record<string, unknown> = { pactId: p.id };
    if (address) { const txHash = await stakeTx(p.stake); body = { ...body, txHash, ...(await signed(address, (nonce, issuedAt) => pactMessage({ op: 'accept', tokenId: p.b, partner: p.a, stake: p.stake, pactId: p.id, nonce, issuedAt, tx: txHash }), signMessageAsync)) }; }
    else body = { ...body, demo: true, demoSession };
    await post('/pact/accept', body); sfx('success'); confetti(false); toast(`Pact sealed. ${p.stake * 2} $CHOG on the line.`, 'ok');
  });
  const cancel = (p: Pact) => run(async () => { await post('/pact/cancel', { pactId: p.id, demo: true, demoSession }); toast('Pact cancelled, stake returned.'); });
  const canAccept = (p: Pact) => p.status === 'pending' && (p.demo ? !address : mine.includes(p.b));
  const seen = new Set<string>(); const list = [...(data?.mine ?? []), ...(data?.open ?? [])].filter(p => !seen.has(p.id) && (seen.add(p.id), p.status !== 'cancelled'));
  const live = list.filter(p => p.status === 'pending' || p.status === 'active'); const done = [...list.filter(p => p.status === 'sworn' || p.status === 'betrayed'), ...(data?.recent ?? []).filter(p => !seen.has(p.id))];
  return <Page className="pacts"><section>
    <div className="kicker">PACTS · CO-SIGNED · $CHOG STAKED</div><h2>Your history decides the deal.</h2>
    <p className="mu">Two friends co-sign a Pact and each stakes $CHOG. The more history they share (witnessed moments count double), the bigger the Pact they can seal. Keep it to the end and both become <b>Sworn</b>. Duel or prank your partner while it is sealed and that is a <b className="badc">Betrayal</b>: written into both chronicles, and the whole pot goes to the Chog you betrayed.</p>
    <div className="card forge"><h3>Propose a Pact</h3>
      {!mine.length ? <p className="mu">Add a Chog in <Link to="/my">My Chogs</Link> first.</p> : <>
        <div className="mono mu">YOUR CHOG</div><div className="picker">{mine.map(id => <motion.button key={id} whileTap={{ scale: .95 }} className={id === my ? 'sel' : ''} onClick={() => { sfx(); setMe(id); }}><Img c={meta.get(id)} size={56} /><small>#{id}</small></motion.button>)}</div>
        <div className="mono mu">PARTNER (FRIENDS ONLY)</div>
        {friends.length ? <div className="picker">{friends.map(f => <motion.button key={f.other} whileTap={{ scale: .95 }} className={f.other === partner ? 'sel' : ''} onClick={() => { sfx(); setPt(f.other); }}><Img c={f.meta} size={56} /><small>#{f.other} · {f.label.label}</small></motion.button>)}</div>
          : <p className="banner">#{my} has no friends yet. <Link to={`/interact/${my}`}>Befriend a Chog</Link> until you are Friends (bond 30+), then come back.</p>}
        {pv && partner > 0 && <motion.div key={my + '-' + partner} className="tierbox" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="tiers">{(pc?.tiers ?? []).map(t => <div key={t.name} className={'tr ' + t.name + (t.name === pv.tier.name ? ' on' : pv.score >= t.min ? ' got' : '')}><b>{t.name}</b><small className="mono">{t.min}+ score · ≤{t.maxStake} $CHOG · {t.days}d</small></div>)}</div>
          <p className="mono">Shared history: {pv.events} moments, {pv.witnessed} witnessed → score <b className="gold">{pv.score}</b> → <b>{pv.tier.name}</b> · term {pv.tier.days}d{!address && pc ? ` (demo: ${pv.tier.days * pc.demoMinutesPerDay} min)` : ''}</p>
          {pv.open ? <p className="banner">These two already have an open Pact.</p> : <>
            <div className="row">{(pc?.stakes ?? [25, 50, 100]).map(s => <button key={s} className={'btn sm ' + (s === st ? '' : 'ln')} disabled={s > maxStake} onClick={() => setStake(s)}>{s} $CHOG</button>)}</div>
            <motion.button whileTap={{ scale: .95 }} className="btn full" disabled={busy} onClick={propose}>🤞 Propose {pv.tier.name} Pact · stake {st} $CHOG</motion.button>
            <p className="mono mu">{address ? (pc?.mode === 'escrow' ? 'Your stake is sent on-chain to the Pact escrow and verified by receipt.' : 'Wallet mode: your stake is a signed pledge, recorded as owed if you betray.') : `Demo mode: stakes come from your demo balance (${bal.text}).`}</p></>}
        </motion.div>}</>}
    </div>
    <div className="card"><h3>Open Pacts <span className="mono mu">{live.length}</span></h3>
      {live.length ? <AnimatePresence>{live.map(p => <PactCard key={p.id} p={p} meta={meta} mine={mine} busy={busy} onAccept={canAccept(p) ? accept : undefined} onCancel={p.demo && !address && p.status === 'pending' && mine.includes(p.a) ? cancel : undefined} />)}</AnimatePresence>
        : <p className="mu">No open Pacts. Be the first to put your history on the line.</p>}
      {!address && <p className="mono mu">Demo: any demo visitor can co-sign a pending demo Pact as the partner. With a wallet, only the partner Chog's owner can.</p>}</div>
    {done.length > 0 && <div className="card"><h3>Kept & broken</h3><AnimatePresence>{done.slice(0, 12).map(p => <PactCard key={p.id} p={p} meta={meta} mine={mine} busy={busy} />)}</AnimatePresence></div>}
    <div className="card"><h3>Pact & Witness badges</h3><div className="achs">{Object.entries(PACT_ACHIEVEMENTS).map(([n, d]) => <div key={n} className="ach got" title={d}>🏅 {n}<small>{d}</small></div>)}</div></div>
  </section></Page>;
}
