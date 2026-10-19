import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useMap, useWorld } from '../api';
import { useCountdown, useKeeper } from '../hooks';
import { Img, Page } from '../ui';
import MapCanvas from '../MapCanvas';
import { tileName } from '../../shared/daemons';
export default function MapPage() {
  const { data: map } = useMap(); const { data: w } = useWorld(); const k = useKeeper(); const cd = useCountdown(w?.nextTick);
  const [sel, setSel] = useState<{ tile: number; owner: number } | null>(null);
  const d = sel && map?.daemons.find(x => x.id === sel.owner);
  return <Page className="wide">
    <div className="row sp"><h2>The Map</h2><span className="mono mu"><span className="dot" />1,969 tiles · {map?.daemons.length ?? '…'} daemons · next tick in <b className="tick">{cd}</b></span></div>
    <div className="mapgrid">
      <div className="card nopad"><MapCanvas owners={map?.owners} daemons={map?.daemons} mine={k.ids} focus={k.ids[0]} onSelect={(tile, owner) => setSel({ tile, owner })} height="min(72vh, 680px)" /></div>
      <aside className="card side">
        <AnimatePresence mode="wait">{sel ? <motion.div key={sel.tile} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
          <div className="kicker">TILE #{sel.tile}</div><h3>{tileName(sel.tile)}</h3>
          <p className="mu">{sel.tile === sel.owner ? 'Home tile (sanctuary) of ' : 'Held by '}<b>Chog #{sel.owner}</b></p>
          {d ? <Link to={`/d/${d.id}`} className="rel"><Img c={d as any} size={56} /><div><div>{d.name.replace('CHOG ', 'Chog ')}</div><span className="mono mu">{d.territory} tiles · ★ {d.rep}{d.fort ? ` · 🛡${d.fort}` : ''}{d.cursed ? ' · 💀 cursed' : ''}</span></div></Link>
            : <p className="mu">This Chog's daemon is still asleep. Its holder can wake it by connecting a wallet.</p>}
          {d && <Link className="btn full" to={`/d/${d.id}`}>Open daemon →</Link>}
        </motion.div> : <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><h3>Every tile is a Chog</h3><p className="mu">Tile #N is the home of Chog #N. Colours are territories. Gold outline = yours. Tiles flash when they change hands.</p><p className="mono mu">Drag to pan · scroll / pinch to zoom · click a tile</p></motion.div>}</AnimatePresence>
        <h3 style={{ marginTop: 24 }}>Top warlords</h3>
        {map?.daemons.slice().sort((a, b) => b.territory - a.territory).slice(0, 8).map((x, i) => <Link key={x.id} to={`/d/${x.id}`} className="lb"><span className="mono">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span><Img c={x as any} size={32} /><span>#{x.id}</span><span className="gold">{x.territory} ▦</span></Link>)}
      </aside>
    </div>
  </Page>;
}
