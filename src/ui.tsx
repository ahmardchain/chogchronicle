import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import type { Chog } from '../shared/stats';

/* ---------- SFX (same WebAudio approach as chogathon.chog.xyz) ---------- */
let sfxOn = localStorage.getItem('cc.sfx') !== '0'; let actx: AudioContext | undefined;
export function sfx(type: 'click' | 'success' | 'hit' | 'lose' | 'dice' = 'click') {
  if (!sfxOn) return;
  try {
    actx ||= new AudioContext(); const t = actx.currentTime;
    const tone = (f0: number, f1: number, dur: number, wave: OscillatorType = 'sine', vol = 0.08, at = 0) => {
      const o = actx!.createOscillator(), g = actx!.createGain(); o.type = wave;
      o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g); g.connect(actx!.destination); o.start(t + at); o.stop(t + at + dur);
    };
    if (type === 'click') tone(560, 300, 0.05);
    if (type === 'dice') tone(900, 600, 0.03, 'square', 0.03);
    if (type === 'hit') { tone(160, 50, 0.2, 'sawtooth', 0.12); tone(1200, 200, 0.08, 'square', 0.04); }
    if (type === 'success') [523, 659, 784, 1046].forEach((f, i) => tone(f, f * 1.01, 0.12, 'triangle', 0.07, i * 0.08));
    if (type === 'lose') [392, 330, 262].forEach((f, i) => tone(f, f * 0.95, 0.16, 'triangle', 0.07, i * 0.1));
  } catch { /* ignore */ }
}
export function SfxToggle() {
  const [on, setOn] = useState(sfxOn);
  return <button className={'audio-toggle ' + (on ? 'active' : '')} onClick={() => { sfxOn = !on; setOn(!on); localStorage.setItem('cc.sfx', sfxOn ? '1' : '0'); if (sfxOn) sfx('success'); }} title="Toggle audio feedback">
    <span className="sound-bars"><span /><span /><span /></span><span className="mono">{on ? 'SFX ON' : 'SFX MUTED'}</span></button>;
}

/* ---------- confetti (lazy chunk) ---------- */
export async function confetti(reduced: boolean | null) {
  if (reduced) return;
  const c = (await import('canvas-confetti')).default;
  const colors = ['#836ef9', '#a99bfc', '#f59e0b', '#5ce68a', '#ffffff'];
  c({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors });
  setTimeout(() => c({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors }), 180);
  setTimeout(() => c({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors }), 180);
}

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; kind: 'ok' | 'bad' | 'info' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random(); setList(l => [...l, { id, text, kind }].slice(-4));
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 4000);
  }, []);
  return <ToastCtx.Provider value={push}>{children}
    <div className="toasts"><AnimatePresence>{list.map(t => <motion.div key={t.id} layout className={'toast ' + t.kind}
      initial={{ opacity: 0, x: 60, scale: .9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60 }}>{t.text}</motion.div>)}</AnimatePresence></div>
  </ToastCtx.Provider>;
}

/* ---------- image with skeleton fade ---------- */
export function Img({ c, size = 96, className = '' }: { c?: Chog; size?: number; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return <span className={'imgwrap ' + (loaded ? '' : 'skel ') + className} style={{ width: size, height: size }}>
    {c && <img className="pfp" src={c.image} alt={c.name} loading="lazy" onLoad={() => setLoaded(true)} style={{ opacity: loaded ? 1 : 0 }} />}
  </span>;
}
export const Skeleton = ({ h = 20, w = '100%', r = 12 }: { h?: number; w?: number | string; r?: number }) => <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;

/* ---------- animated number ---------- */
export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null); const prev = useRef(value); const reduced = useReducedMotion();
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    const from = prev.current; prev.current = value;
    if (from !== value) { setFlash(value > from ? 'up' : 'down'); setTimeout(() => setFlash(''), 900); }
    if (reduced || !ref.current) { if (ref.current) ref.current.textContent = String(value); return; }
    const ctl = animate(from === value ? Math.max(0, value - Math.min(40, value)) : from, value, { duration: 0.9, ease: 'easeOut', onUpdate: v => { if (ref.current) ref.current.textContent = String(Math.round(v)); } });
    return () => ctl.stop();
  }, [value]);
  return <span ref={ref} className={className + ' count ' + flash}>{value}</span>;
}

/* ---------- 3D tilt card ---------- */
export function Tilt({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion(); const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [8, -8]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(x, [0, 1], [-10, 10]), { stiffness: 200, damping: 18 });
  const glare = useTransform([x, y] as never, ([a, b]: number[]) => `radial-gradient(circle at ${a * 100}% ${b * 100}%, rgba(169,155,252,.25), transparent 55%)`);
  return <motion.div className={'tilt ' + className} style={reduced ? {} : { rotateX: rx, rotateY: ry, transformPerspective: 800 }}
    onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height); }}
    onMouseLeave={() => { x.set(0.5); y.set(0.5); }} whileHover={reduced ? {} : { scale: 1.03 }}>
    {children}<motion.div className="glare" style={{ background: glare }} /></motion.div>;
}

/* ---------- energy pips & streak flame ---------- */
export function Energy({ left, max, streak }: { left: number; max: number; streak?: number }) {
  return <div className="energy">{Array.from({ length: max }, (_, i) =>
    <motion.i key={i} className={i < left ? 'on' : ''} initial={false} animate={i < left ? { scaleX: 1, opacity: 1 } : { scaleX: [1.3, 1], opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} />)}
    {streak !== undefined && <span className={'mono mu flame ' + (streak > 0 ? 'lit' : '')}>🔥 {streak}d</span>}</div>;
}

export const Page = ({ children, className = '' }: { children: ReactNode; className?: string }) =>
  <motion.main className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3, ease: [.16, 1, .3, 1] }}>{children}</motion.main>;
export const listItem = { hidden: { opacity: 0, x: -14 }, show: (i: number) => ({ opacity: 1, x: 0, transition: { delay: Math.min(i, 12) * 0.04 } }) };
