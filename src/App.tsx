import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { SfxToggle, ToastProvider, sfx } from './ui';
const Landing = lazy(() => import('./pages/Landing')), MyChogs = lazy(() => import('./pages/MyChogs')), Profile = lazy(() => import('./pages/Profile')),
  Interact = lazy(() => import('./pages/Interact')), Chronicle = lazy(() => import('./pages/Chronicle')),
  Square = lazy(() => import('./pages/Square')), Pacts = lazy(() => import('./pages/Pacts'));
function Wallet() {
  const { isConnected, address } = useAccount(); const { connect, connectors } = useConnect(); const { disconnect } = useDisconnect();
  if (isConnected) return <button className="btn ln sm" onClick={() => disconnect()}>{address?.slice(0, 6)}…{address?.slice(-4)}</button>;
  return <button className="btn sm" onClick={() => { sfx(); connectors[0] && connect({ connector: connectors[0] }); }}>Connect</button>;
}
function Nav() {
  return <header className="nav"><Link to="/" className="logo"><img src="/brand/chogbadge.png" alt="" />CHOG<span>CHRONICLE</span></Link>
    <nav><NavLink to="/my">My Chogs</NavLink><NavLink to="/chronicle">Chronicle</NavLink><NavLink to="/square">Square</NavLink><NavLink to="/pacts">Pacts</NavLink></nav><span className="chip ok live"><span className="dot" />LIVE</span><Wallet /></header>;
}
const Loading = () => <main><div className="loader"><img src="/brand/chogbadge.png" alt="" /><span className="mono mu">Loading the Chronicle…</span></div></main>;
export default function App() {
  const loc = useLocation();
  return <MotionConfig reducedMotion="user"><ToastProvider><Nav />
    <Suspense fallback={<Loading />}><AnimatePresence mode="wait"><Routes location={loc} key={loc.pathname}>
      <Route path="/" element={<Landing />} /><Route path="/my" element={<MyChogs />} /><Route path="/chog/:id" element={<Profile />} /><Route path="/interact/:id" element={<Interact />} /><Route path="/chronicle" element={<Chronicle />} /><Route path="/square" element={<Square />} /><Route path="/pacts" element={<Pacts />} />
    </Routes></AnimatePresence></Suspense>
    <footer className="mono mu">ChogChronicle · Chogathon 2026 · Chog Genesis on Monad · not affiliated with Chog</footer><SfxToggle /></ToastProvider></MotionConfig>;
}
