import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { SfxToggle, ToastProvider, sfx } from './ui';
import { useKeeper } from './hooks';
import Recap from './Recap';
const Landing = lazy(() => import('./pages/Landing')), MapPage = lazy(() => import('./pages/MapPage')), DaemonPage = lazy(() => import('./pages/DaemonPage')), Chronicle = lazy(() => import('./pages/Chronicle'));
function Wallet() {
  const { isConnected, address } = useAccount(); const { connect, connectors } = useConnect(); const { disconnect } = useDisconnect();
  if (isConnected) return <button className="btn ln sm" onClick={() => disconnect()}>{address?.slice(0, 6)}…{address?.slice(-4)}</button>;
  return <button className="btn sm" onClick={() => { sfx(); connectors[0] && connect({ connector: connectors[0] }); }}>Connect</button>;
}
function Nav() {
  const k = useKeeper();
  return <header className="nav"><Link to="/" className="logo"><img src="/brand/chogbadge.png" alt="" />CHOG<span>DAEMONS</span></Link>
    <nav><NavLink to="/map">Map</NavLink>{k.ids[0] ? <NavLink to={`/d/${k.ids[0]}`}>My daemon</NavLink> : null}<NavLink to="/chronicle">Chronicle</NavLink></nav><span className="chip ok live"><span className="dot" />{k.mode === 'demo' ? 'GUEST' : 'WALLET'}</span><Wallet /></header>;
}
const Loading = () => <main><div className="loader"><img src="/brand/chogbadge.png" alt="" /><span className="mono mu">Waking the daemons…</span></div></main>;
export default function App() {
  const loc = useLocation();
  return <MotionConfig reducedMotion="user"><ToastProvider><Nav />
    <Suspense fallback={<Loading />}><AnimatePresence mode="wait"><Routes location={loc} key={loc.pathname}>
      <Route path="/" element={<Landing />} /><Route path="/map" element={<MapPage />} /><Route path="/d/:id" element={<DaemonPage />} /><Route path="/chog/:id" element={<DaemonPage />} /><Route path="/chronicle" element={<Chronicle />} />
    </Routes></AnimatePresence></Suspense>
    <Recap />
    <footer className="mono mu">Chog Daemons · Chogathon 2026 · Chog Genesis on Monad · not affiliated with Chog</footer><SfxToggle /></ToastProvider></MotionConfig>;
}
