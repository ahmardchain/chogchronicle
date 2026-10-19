import { useEffect, useRef, useState } from 'react';
import { COLS, ROWS, TILES, ownerColor, tileName, tileXY } from '../shared/daemons';
import type { MapDaemon } from './api';
type Props = { owners?: number[]; daemons?: MapDaemon[]; focus?: number; mine?: number[]; onSelect?: (tile: number, owner: number) => void; interactive?: boolean; height?: number | string };
const CELL = 18;
const imgCache = new Map<string, HTMLImageElement>();
const img = (src: string) => { let i = imgCache.get(src); if (!i) { i = new Image(); i.src = src; imgCache.set(src, i); } return i; };
/** Canvas world map: 1,969 tiles, zoom/pan (wheel, drag, pinch, buttons), avatars on home tiles, flashes tiles that change hands. */
export default function MapCanvas({ owners, daemons, focus, mine = [], onSelect, interactive = true, height = 560 }: Props) {
  const wrap = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const view = useRef({ s: 1, x: 0, y: 0 }); const prev = useRef<number[] | null>(null); const flashes = useRef(new Map<number, number>());
  const [hover, setHover] = useState<{ t: number; x: number; y: number } | null>(null); const [, force] = useState(0);
  const byId = useRef(new Map<number, MapDaemon>());
  byId.current = new Map((daemons ?? []).map(d => [d.id, d]));
  // detect changed tiles → flash
  useEffect(() => {
    if (!owners) return; const p = prev.current; const now = performance.now();
    if (p) owners.forEach((o, i) => { if (p[i] !== o) flashes.current.set(i + 1, now); });
    prev.current = owners; draw();
  }, [owners]);
  const fit = () => { const el = wrap.current; if (!el) return; const s = Math.min(el.clientWidth / (COLS * CELL), el.clientHeight / (ROWS * CELL)); view.current = { s, x: (el.clientWidth - COLS * CELL * s) / 2, y: (el.clientHeight - ROWS * CELL * s) / 2 }; };
  const center = (t: number, s = 2.4) => { const el = wrap.current; if (!el) return; const { x, y } = tileXY(t); view.current = { s, x: el.clientWidth / 2 - (x + .5) * CELL * s, y: el.clientHeight / 2 - (y + .5) * CELL * s }; draw(); };
  useEffect(() => { fit(); if (focus) center(focus, interactive ? 2.2 : 1.6); else draw(); const ro = new ResizeObserver(() => { const c = cv.current, el = wrap.current; if (c && el) { c.width = el.clientWidth * devicePixelRatio; c.height = el.clientHeight * devicePixelRatio; } draw(); }); if (wrap.current) ro.observe(wrap.current); return () => ro.disconnect(); }, [focus]);
  function draw() {
    const c = cv.current; if (!c || !owners) return; const ctx = c.getContext('2d')!; const dpr = devicePixelRatio;
    const { s, x: ox, y: oy } = view.current; const sz = CELL * s; const now = performance.now(); const mineSet = new Set(mine);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#0b0916'; ctx.fillRect(ox - 6, oy - 6, COLS * sz + 12, ROWS * sz + 12);
    let anim = false;
    for (let t = 1; t <= TILES; t++) {
      const { x, y } = tileXY(t); const px = ox + x * sz, py = oy + y * sz;
      if (px > c.width / dpr || py > c.height / dpr || px + sz < 0 || py + sz < 0) continue;
      const o = owners[t - 1]; ctx.fillStyle = ownerColor(o); ctx.globalAlpha = mineSet.has(o) ? 1 : focus && o === focus ? 1 : .78;
      ctx.fillRect(px + .5, py + .5, sz - 1, sz - 1); ctx.globalAlpha = 1;
      // borders between territories
      ctx.fillStyle = 'rgba(8,6,18,.85)';
      if (x < COLS - 1 && owners[t] !== o && t < TILES) ctx.fillRect(px + sz - 1.5, py, 2, sz);
      if (y < ROWS - 1 && t + COLS <= TILES && owners[t + COLS - 1] !== o) ctx.fillRect(px, py + sz - 1.5, sz, 2);
      const f = flashes.current.get(t); if (f) { const a = 1 - (now - f) / 2500; if (a > 0) { ctx.fillStyle = `rgba(255,255,255,${a * .8})`; ctx.fillRect(px, py, sz, sz); anim = true; } else flashes.current.delete(t); }
    }
    // home tiles: avatars / dots
    for (const d of byId.current.values()) {
      const { x, y } = tileXY(d.id); const px = ox + x * sz, py = oy + y * sz;
      if (px > c.width / dpr || py > c.height / dpr || px + sz < 0 || py + sz < 0) continue;
      const hl = mineSet.has(d.id) || d.id === focus;
      if (sz >= 20) { const im = img(d.image); if (im.complete && im.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.roundRect(px + 1, py + 1, sz - 2, sz - 2, sz * .2); ctx.clip(); ctx.drawImage(im, px + 1, py + 1, sz - 2, sz - 2); ctx.restore(); } else { im.onload = () => draw(); } }
      else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + sz / 2, py + sz / 2, Math.max(1.5, sz * .22), 0, 7); ctx.fill(); }
      if (hl) { ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5; ctx.strokeRect(px - 1, py - 1, sz + 2, sz + 2); }
      if (d.fort > 0 && sz >= 20) { ctx.font = `${Math.max(9, sz * .32)}px sans-serif`; ctx.fillText('🛡', px + sz * .62, py + sz * .98); }
      if (d.cursed && sz >= 20) { ctx.font = `${Math.max(9, sz * .32)}px sans-serif`; ctx.fillText('💀', px, py + sz * .32); }
    }
    // outline my territory
    if (mineSet.size) { ctx.strokeStyle = 'rgba(245,158,11,.95)'; ctx.lineWidth = 2; for (let t = 1; t <= TILES; t++) { if (!mineSet.has(owners[t - 1])) continue; const { x, y } = tileXY(t); const px = ox + x * sz, py = oy + y * sz; const own = (tt: number) => tt >= 1 && tt <= TILES && mineSet.has(owners[tt - 1]);
      ctx.beginPath(); if (!(y > 0 && own(t - COLS))) { ctx.moveTo(px, py); ctx.lineTo(px + sz, py); } if (!(y < ROWS - 1 && own(t + COLS))) { ctx.moveTo(px, py + sz); ctx.lineTo(px + sz, py + sz); } if (!(x > 0 && own(t - 1))) { ctx.moveTo(px, py); ctx.lineTo(px, py + sz); } if (!(x < COLS - 1 && own(t + 1))) { ctx.moveTo(px + sz, py); ctx.lineTo(px + sz, py + sz); } ctx.stroke(); } }
    if (anim) requestAnimationFrame(draw);
  }
  // interaction
  const ptrs = useRef(new Map<number, { x: number; y: number }>()); const moved = useRef(0); const pinch = useRef(0);
  const tileFromEvent = (cx: number, cy: number) => { const r = cv.current!.getBoundingClientRect(); const { s, x, y } = view.current; const gx = Math.floor((cx - r.left - x) / (CELL * s)), gy = Math.floor((cy - r.top - y) / (CELL * s)); if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return 0; const t = gy * COLS + gx + 1; return t <= TILES ? t : 0; };
  const zoomAt = (f: number, cx: number, cy: number) => { const r = cv.current!.getBoundingClientRect(); const v = view.current; const ns = Math.max(.4, Math.min(6, v.s * f)); const mx = cx - r.left, my = cy - r.top; v.x = mx - (mx - v.x) * (ns / v.s); v.y = my - (my - v.y) * (ns / v.s); v.s = ns; draw(); force(n => n + 1); };
  return <div ref={wrap} className={'mapwrap ' + (interactive ? 'interactive' : '')} style={{ height }}
    onWheel={interactive ? e => { zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); } : undefined}
    onPointerDown={interactive ? e => { (e.target as Element).setPointerCapture(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved.current = 0; } : undefined}
    onPointerMove={e => {
      if (!owners) return;
      const p = ptrs.current.get(e.pointerId);
      if (interactive && p) {
        if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [c2, d2] = [...ptrs.current.values()]; const d1 = Math.hypot(c2.x - d2.x, c2.y - d2.y); if (pinch.current) zoomAt(d1 / d0, (c2.x + d2.x) / 2, (c2.y + d2.y) / 2); pinch.current = 1; moved.current += 10; return; }
        view.current.x += e.clientX - p.x; view.current.y += e.clientY - p.y; moved.current += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); draw();
      }
      const t = tileFromEvent(e.clientX, e.clientY); const r = wrap.current!.getBoundingClientRect(); setHover(t ? { t, x: e.clientX - r.left, y: e.clientY - r.top } : null);
    }}
    onPointerUp={e => { ptrs.current.delete(e.pointerId); pinch.current = 0; if (moved.current < 6) { const t = tileFromEvent(e.clientX, e.clientY); if (t && owners && onSelect) onSelect(t, owners[t - 1]); } }}
    onPointerLeave={() => setHover(null)}>
    <canvas ref={cv} />
    {!owners && <div className="skel mapskel" />}
    {interactive && <div className="mapctl"><button onClick={() => { const r = wrap.current!.getBoundingClientRect(); zoomAt(1.3, r.left + r.width / 2, r.top + r.height / 2); }}>＋</button><button onClick={() => { const r = wrap.current!.getBoundingClientRect(); zoomAt(1 / 1.3, r.left + r.width / 2, r.top + r.height / 2); }}>－</button><button onClick={() => { fit(); draw(); }} title="Fit">⤢</button>{focus ? <button onClick={() => center(focus)} title="My daemon">◎</button> : null}</div>}
    {hover && owners && <div className="maptip" style={{ left: hover.x + 14, top: hover.y + 14 }}><b>{tileName(hover.t)}</b><span className="mono mu">tile #{hover.t} · held by #{owners[hover.t - 1]}{byId.current.get(owners[hover.t - 1]) ? ` (${byId.current.get(owners[hover.t - 1])!.territory} tiles)` : ''}</span></div>}
  </div>;
}
