import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useAccount, useConfig, useSignMessage, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { erc20Abi, parseUnits } from 'viem';
import { ACTIONS, CHOG_TOKEN, ENERGY, GIFT_AMOUNT, actionMessage, ownerOf, stats, type Action, type Event } from '../chogs';
import { demoSession, get, post, useDemoEnergy, useInvalidate, useProfile } from '../api';
import { ICON, short, useChogBalance, useMeta } from '../hooks';
import { Energy, Img, Page, confetti, sfx, useToast } from '../ui';
type Phase = 'idle' | 'clash' | 'reveal';
const VERB: Record<Action, string> = { challenge: 'DUEL', befriend: 'BOND', prank: 'PRANK', gift: 'GIFT' };
export default function Interact() {
  const id = Number(useParams().id); const [sp] = useSearchParams(); const nav = useNavigate(); const toast = useToast(); const reduced = useReducedMotion();
  const { address } = useAccount(); const { signMessageAsync } = useSignMessage(); const { writeContractAsync } = useWriteContract(); const cfg = useConfig(); const inval = useInvalidate();
  const [target, setTarget] = useState<number>(Number(sp.get('target')) || 0); const [res, setRes] = useState<Event | null>(null);
  const [phase, setPhase] = useState<Phase>('idle'); const [act, setAct] = useState<Action>('challenge'); const [status, setStatus] = useState('');
  const [dice, setDice] = useState<[number, number]>([1, 1]); const shake = useAnimationControls();
  const { data: meP } = useProfile(id); const meta = useMeta(); const bal = useChogBalance(); const { data: de } = useDemoEnergy([id], !address);
  const r = target ? meP?.rels.find(x => x.other === target) : undefined;
  const me = meta.get(id) ?? meP?.meta; const others = [...meta.values()].filter(c => c.tokenId !== id);
  const T = meta.get(target); const energy = address ? meP?.energy ?? 0 : de?.[id] ?? 0;
  const diceTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearInterval(diceTimer.current), []);
  if (!me) return <Page><div className="skel" style={{ height: 300, borderRadius: 18 }} /></Page>;
  const doAct = async (action: Action) => {
    if (phase === 'clash') return;
    sfx('click'); setAct(action); setRes(null); setPhase('clash');
    diceTimer.current = window.setInterval(() => { setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]); sfx('dice'); }, 90);
    const minWait = new Promise(r => setTimeout(r, reduced ? 200 : 1500));
    try {
      let body: Record<string, unknown> = { tokenId: id, target, action };
      if (address) {
        let txHash: `0x${string}` | undefined;
        if (action === 'gift') {
          setStatus('Looking up the owner of the target Chog…'); const to = await ownerOf(target);
          setStatus(`Confirm the ${GIFT_AMOUNT} $CHOG transfer to ${to.slice(0, 8)}… in your wallet`);
          txHash = await writeContractAsync({ address: CHOG_TOKEN, abi: erc20Abi, functionName: 'transfer', args: [to, parseUnits(String(GIFT_AMOUNT), bal.decimals)], chainId: 143 });
          setStatus('Waiting for Monad confirmation…'); await waitForTransactionReceipt(cfg, { hash: txHash, chainId: 143 });
        }
        setStatus('Sign the action message in your wallet…');
        const { nonce, issuedAt } = await get<{ nonce: string; issuedAt: number }>('/nonce?address=' + address);
        const signature = await signMessageAsync({ message: actionMessage({ tokenId: id, action, target, nonce, issuedAt, tx: txHash }) });
        body = { ...body, address, nonce, issuedAt, signature, txHash }; setStatus(txHash ? 'Verifying your gift on Monad…' : '');
      } else { body.demo = true; body.demoSession = demoSession; }
      const [out] = await Promise.all([post<{ event: Event }>('/action', body), minWait]);
      clearInterval(diceTimer.current); const e = out.event;
      setDice(e.success ? [6, 1 + Math.floor(Math.random() * 3)] : [1 + Math.floor(Math.random() * 3), 6]);
      sfx('hit'); setRes(e); setPhase('reveal');
      if (e.success) { sfx('success'); confetti(reduced); toast(`${ICON[action]} ${VERB[action]} success · +${e.repA} rep`, 'ok'); }
      else { sfx('lose'); if (!reduced) shake.start({ x: [0, -14, 12, -8, 6, 0], transition: { duration: .45 } }); toast(`${VERB[action]} failed · ${e.repA} rep`, 'bad'); }
    } catch (err) { clearInterval(diceTimer.current); setPhase('idle'); toast((err as Error).message, 'bad'); }
    setStatus(''); inval();
  };
  const sa = stats(me), sb = T ? stats(T) : null;
  return <Page><motion.div animate={shake}>
    <div className="row sp"><h2>Interact as {short(me.name)}</h2><span className="chip gold">{bal.text}</span></div>
    <div className="row sp sub"><Energy left={energy} max={ENERGY} streak={meP?.streak} /><span className="mono mu">{address ? 'wallet-signed · gifts are real $CHOG' : 'demo mode · your own energy'}</span></div>
    <AnimatePresence>{status && <motion.p className="banner" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>{status}</motion.p>}</AnimatePresence>
    <div className={'arena card ' + phase + (res ? (res.success ? ' win' : ' lose') : '')}>
      <motion.div className="fighter" animate={phase === 'clash' && !reduced ? { x: [0, 40, -6, 40, 0], rotate: [0, 6, -2, 6, 0] } : phase === 'reveal' && res ? (res.success ? { scale: 1.08, y: -6 } : { scale: .92, opacity: .7, rotate: -6 }) : { x: 0, scale: 1, opacity: 1, rotate: 0 }}
        transition={phase === 'clash' ? { duration: .75, repeat: Infinity } : { type: 'spring', stiffness: 260, damping: 14 }}>
        <Img c={me} size={170} /><b>{short(me.name)}</b><span className="mono mu">GRIT {sa.grit} · CHAOS {sa.chaos}</span></motion.div>
      <div className="center">
        <AnimatePresence mode="wait">
          {phase === 'idle' && <motion.div key="vs" className="vs" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>VS</motion.div>}
          {phase === 'clash' && <motion.div key="dice" className="dice" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
            <motion.span animate={reduced ? {} : { rotate: 360 }} transition={{ repeat: Infinity, duration: .5, ease: 'linear' }}>{'⚀⚁⚂⚃⚄⚅'[dice[0] - 1]}</motion.span>
            <motion.span animate={reduced ? {} : { rotate: -360 }} transition={{ repeat: Infinity, duration: .5, ease: 'linear' }}>{'⚀⚁⚂⚃⚄⚅'[dice[1] - 1]}</motion.span>
            <div className="mono">{VERB[act]}…</div></motion.div>}
          {phase === 'reveal' && res && <motion.div key="res" className="reveal" initial={{ scale: 2.4, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
            <div className="big">{res.success ? (act === 'challenge' ? 'VICTORY' : 'SUCCESS') : (act === 'challenge' ? 'DEFEAT' : 'FAILED')}</div>
            <motion.div className={'delta ' + (res.repA >= 0 ? 'okc' : 'badc')} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .25 }}>{res.repA >= 0 ? '+' : ''}{res.repA} REP</motion.div></motion.div>}
        </AnimatePresence>
        {phase === 'clash' && !reduced && <motion.div className="spark" animate={{ scale: [0, 1.6, 0], opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: .75 }} />}
      </div>
      <motion.div className="fighter" animate={phase === 'clash' && !reduced ? { x: [0, -40, 6, -40, 0], rotate: [0, -6, 2, -6, 0] } : phase === 'reveal' && res ? (!res.success ? { scale: 1.08, y: -6 } : { scale: .92, opacity: .7, rotate: 6 }) : { x: 0, scale: 1, opacity: 1, rotate: 0 }}
        transition={phase === 'clash' ? { duration: .75, repeat: Infinity } : { type: 'spring', stiffness: 260, damping: 14 }}>
        {T ? <><Img c={T} size={170} /><b>{short(T.name)}</b><span className="mono mu">GRIT {sb!.grit} · CHAOS {sb!.chaos}</span>{r && <span className={'chip ' + r.label.cls}>{r.label.label} · bond {r.r.bond}</span>}</> : <><div className="pfp empty">?</div><b className="mu">Pick an opponent ↓</b></>}</motion.div>
    </div>
    <AnimatePresence>{phase === 'reveal' && res && <motion.div className="card story" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <p>📜 {res.text}</p><div className="row"><button className="btn ln" onClick={() => nav(`/chog/${id}`)}>View chronicle</button><button className="btn ln" onClick={() => { setPhase('idle'); setRes(null); }}>Go again</button></div></motion.div>}</AnimatePresence>
    {T && <div className="actions">{ACTIONS.map(a => <motion.button key={a} whileTap={{ scale: .94 }} className={'btn act-' + a} disabled={phase === 'clash' || energy <= 0} onClick={() => doAct(a)}>
      <span className="ic">{ICON[a]}</span>{a}{a === 'gift' ? ` ${GIFT_AMOUNT} $CHOG` : ''}</motion.button>)}</div>}
    {T && energy <= 0 && <p className="banner">Out of energy for today — your Chog rests. Come back tomorrow to keep your 🔥 streak.</p>}
    <h3>Choose an opponent</h3><div className="picker">{others.map(c => <motion.button whileHover={{ y: -4 }} whileTap={{ scale: .95 }} key={c.tokenId} className={c.tokenId === target ? 'sel' : ''} onClick={() => { sfx(); setTarget(c.tokenId); setRes(null); setPhase('idle'); }}><Img c={c} size={64} /><small>{short(c.name)}</small></motion.button>)}</div>
  </motion.div></Page>;
}
