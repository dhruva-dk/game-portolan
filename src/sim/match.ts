import type { GunKind } from '../kinds.ts';

type Phase = 'fighting' | 'spectating' | 'won';

export const PLAYER = 0;

export const SHIPS = 80;

export type Cause = 'shot' | 'ram' | 'storm';

export interface Sunk {
  id: number;
  by: number | null;
  cause: Cause;
  gun: GunKind | null;
}

export const CREDIT = 8;

export const credited = (
  cause: Cause,
  last: { by: number; ago: number } | null
): number | null =>
  last && (cause !== 'storm' || last.ago < CREDIT) ? last.by : null;

export interface MatchState {
  phase: Phase;
  place: number | null;
  sunk: Sunk | null;
  watch: number;
  since: number;
  over: boolean;
  read: number;
  share: number;
}

export interface Report {
  sinkings: readonly Sunk[];
  alive: readonly number[];
  share?: number;
  race?: { teams: readonly number[]; over: boolean; place: number };
}

export const startMatch = (): MatchState => ({
  phase: 'fighting',
  place: null,
  sunk: null,
  watch: PLAYER,
  since: 0,
  over: false,
  read: 0,
  share: 0,
});

function next(gone: number, by: number | null, r: Report): number {
  const teams = r.race?.teams,
    mate = teams && r.alive.find((id) => teams[id] === teams[gone]);
  if (mate !== undefined) return mate;
  if (by !== null && r.alive.includes(by)) return by;
  let best = -1,
    most = -1;
  for (const id of r.alive) {
    const n = r.sinkings.filter((s) => s.by === id).length;
    if (n > most) [best, most] = [id, n];
  }
  return best;
}

export function stepMatch(m: MatchState, r: Report, dt: number): MatchState {
  let s: MatchState = { ...m, read: r.sinkings.length };
  const fresh = r.sinkings.slice(m.read);
  const mine = fresh.find((k) => k.id === PLAYER);
  if (s.phase === 'fighting' && !mine) s.share = r.share ?? s.share;
  if (s.phase !== 'fighting') s.since += dt;
  if (mine && s.phase === 'fighting') {
    const place = r.alive.length + r.sinkings.length - r.sinkings.indexOf(mine);
    const watch = next(PLAYER, mine.by, r);
    s =
      place === 1 && r.alive.length === 0
        ? { ...s, phase: 'won', place, sunk: mine }
        : {
            ...s,
            phase: 'spectating',
            place,
            sunk: mine,
            watch: watch < 0 ? PLAYER : watch,
          };
  } else if (s.phase === 'spectating') {
    const gone = fresh.find((k) => k.id === s.watch);
    if (gone) {
      const watch = next(gone.id, gone.by, r);
      if (watch >= 0) s = { ...s, watch };
    }
  } else if (s.phase === 'fighting' && r.race) {
    if (r.race.over) s = { ...s, phase: 'won', place: r.race.place };
  } else if (
    s.phase === 'fighting' &&
    fresh.length > 0 &&
    r.alive.length === 1 &&
    r.alive[0] === PLAYER
  ) {
    s = { ...s, phase: 'won', place: 1 };
  }
  s.over = r.race
    ? r.race.over
    : s.phase === 'won' || (s.phase === 'spectating' && r.alive.length <= 1);
  return s;
}

export function switched(
  m: MatchState,
  alive: readonly number[],
  by: number
): MatchState {
  const others = alive.filter((id) => id !== PLAYER);
  if (m.phase !== 'spectating' || others.length === 0) return m;
  const at = others.findIndex((id) => id >= m.watch),
    from = at < 0 ? others.length : at;
  const step = others[from] === m.watch || by < 0 ? by : by - 1,
    n = others.length;
  return { ...m, watch: others[(((from + step) % n) + n) % n] };
}
