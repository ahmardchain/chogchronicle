import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Chog, Event, Rel } from '../shared/stats';
export type Summary = { tokenId: number; meta: Chog; rep: number; title: string; energy: number; streak: number; achievements: string[] };
export type Profile = Summary & { rels: { other: number; r: Rel; label: { label: string; cls: string }; meta?: Chog }[]; events: Event[] };
async function get<T>(p: string): Promise<T> { const r = await fetch('/api' + p); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }
export async function post<T>(p: string, body: unknown): Promise<T> {
  const r = await fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}
export { get };
const q = <T,>(key: string, opts = {}) => useQuery<T>({ queryKey: [key], queryFn: () => get<T>(key), refetchInterval: 5000, ...opts });
export const useWorld = () => q<{ events: number; relationships: number; season: number; demo: boolean; demoOwned: number[] }>('/world');
export const useKnown = () => q<Chog[]>('/known', { refetchInterval: false });
export const useSummaries = (ids: number[]) => q<Summary[]>('/chogs?ids=' + ids.join(','), { enabled: ids.length > 0 });
export const useProfile = (id: number) => q<Profile>('/chogs/' + id);
export const useFeed = () => q<Event[]>('/feed?limit=50');
export const useBoard = () => q<Summary[]>('/leaderboard');
export const useBalance = (owner: string) => q<{ balance: number }>('/balance/' + owner);
export const useInvalidate = () => { const qc = useQueryClient(); return () => qc.invalidateQueries(); };
