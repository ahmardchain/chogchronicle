import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Chog, Rel } from '../shared/stats';
import type { Card, DEvent, Temperament } from '../shared/daemons';
export async function get<T>(p: string): Promise<T> { const r = await fetch('/api' + p); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }
export async function post<T>(p: string, body: unknown): Promise<T> {
  const r = await fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}
const q = <T,>(key: string, opts = {}) => useQuery<T>({ queryKey: [key], queryFn: () => get<T>(key), refetchInterval: 8000, ...opts });
export type MiniChog = { tokenId: number; name: string; image: string };
export type MapDaemon = MiniChog & { id: number; rep: number; fort: number; territory: number; cursed: boolean };
export type World = { events: number; daemons: number; lastTick: number; nextTick: number; tickMs: number; season: number; demo: boolean; now: number; treasury: string | null };
export type Order = { token: number; day: string; card: Card; target: number; source: string; issuer: string; created: number; resolvedAt: number | null; eventId: string | null } | { sealed: true; source: string } | null;
export type Daemon = {
  tokenId: number; meta: Chog; awake: boolean; rep: number; fort: number; territory: number; home: string;
  curses: { name: string; until: number }[]; intel: { target: number; until: number }[]; temperament: Temperament; stance: Card; perks: Record<Card, string>;
  rels: { other: number; r: Rel; label: { label: string; cls: string }; meta?: MiniChog }[]; inherited: { from: string; at: number; rivals: number; tiles: number; curses: string[]; rep: number } | null; lastOwner: string | null;
  order: Order; diary: { day: string; entries: { t: number; line: string; e: DEvent }[] }[]; bounty: number; nextTick: number;
};
export type Me = { tokenId: number | null; adoptedAt?: number; lastSeen?: number; recap?: (DEvent & { line: string })[]; balance?: number };
export const demoSession = (() => { let s = localStorage.getItem('cc.session'); if (!s) { s = crypto.randomUUID(); localStorage.setItem('cc.session', s); } return s; })();
export const useWorld = () => q<World>('/world');
export const useMap = () => q<{ owners: number[]; daemons: MapDaemon[] }>('/map');
export const useDaemon = (id: number, viewer: string) => q<Daemon>(`/daemon/${id}?viewer=${encodeURIComponent(viewer)}`, { enabled: id > 0 });
export const useFeed = () => q<DEvent[]>('/feed?limit=60');
export const useBoard = () => q<{ id: number; meta: MiniChog; territory: number; rep: number }[]>('/leaderboard');
export const useMe = () => q<Me>('/me?session=' + demoSession);
export const useInvalidate = () => { const qc = useQueryClient(); return () => qc.invalidateQueries(); };
