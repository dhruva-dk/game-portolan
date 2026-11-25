import { GUNS } from '../../src/sim/handling.ts';
import type { Rarity } from '../../src/sim/kinds.ts';
import type { MatchResult } from '../../src/sim/result.ts';
import type { ShipSpec } from '../../src/sim/setup.ts';

export const BANDS = ['close', 'mid', 'far'] as const;
export type Band = (typeof BANDS)[number];

export const bandOf = (meters: number): Band =>
  meters < GUNS.scatter.range
    ? 'close'
    : meters < GUNS.repeater.range
      ? 'mid'
      : 'far';

export const STANDINGS_APART = 10;

export type Fired = { ship: number; range: number; landed: boolean };

export type Log = {
  ships: readonly Pick<ShipSpec, 'team' | 'standing'>[];
  result: MatchResult;
  shots: readonly Fired[];
  fights: readonly number[];
  heals: readonly Rarity[];
};

export type Aim = { shots: number; landed: number; rate: number | null };

export type MatchFigures = {
  length: number;
  timeToSink: number | null;
  sinkings: number;
  hitRate: Aim;
  byRange: Record<Band, Aim>;
  heals: { used: number; by: Record<Rarity, number> };
  sea: { claimed: number; top: number }[];
  places: {
    standings: [number, number];
    ships: number;
    mean: number;
    best: number;
  }[];
};

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b),
    mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const aimOf = (shots: readonly Fired[]): Aim => {
  const landed = shots.filter((s) => s.landed).length;
  return {
    shots: shots.length,
    landed,
    rate: shots.length ? landed / shots.length : null,
  };
};

function seaOf(sea: MatchResult['sea']): MatchFigures['sea'] {
  const samples = Math.max(0, ...sea.map((t) => t.length));
  return Array.from({ length: samples }, (_, k) => {
    const shares = sea.map((t) => t[k] ?? 0);
    return {
      claimed: shares.reduce((a, b) => a + b, 0),
      top: Math.max(0, ...shares),
    };
  });
}

function placesOf(log: Log): MatchFigures['places'] {
  const groups = new Map<number, number[]>();
  log.ships.forEach((s, id) => {
    const g = Math.floor((s.standing - 1) / STANDINGS_APART);
    groups.set(g, [...(groups.get(g) ?? []), log.result.ships[id].place]);
  });
  return [...groups]
    .sort((a, b) => a[0] - b[0])
    .map(([g, places]) => ({
      standings: [g * STANDINGS_APART + 1, (g + 1) * STANDINGS_APART],
      ships: places.length,
      mean: places.reduce((a, b) => a + b, 0) / places.length,
      best: Math.min(...places),
    }));
}

export function matchFigures(log: Log): MatchFigures {
  const used = (r: Rarity) => log.heals.filter((h) => h === r).length;
  const by = {
    common: used('common'),
    rare: used('rare'),
    epic: used('epic'),
    legendary: used('legendary'),
  };
  return {
    length: log.result.seconds,
    timeToSink: median(log.fights),
    sinkings: log.fights.length,
    hitRate: aimOf(log.shots),
    byRange: {
      close: aimOf(log.shots.filter((s) => bandOf(s.range) === 'close')),
      mid: aimOf(log.shots.filter((s) => bandOf(s.range) === 'mid')),
      far: aimOf(log.shots.filter((s) => bandOf(s.range) === 'far')),
    },
    heals: { used: log.heals.length, by },
    sea: seaOf(log.result.sea),
    places: placesOf(log),
  };
}

export type Sunk = { ship: number; cause: string; fight: number | null };

export type DuelFigures = {
  seconds: number;
  winner: number | null;
  sunk: Sunk | null;
  timeToSink: number | null;
  ships: Aim[];
  unfired: boolean;
};

export function duelFigures(
  result: MatchResult,
  shots: readonly Fired[],
  sunk: readonly Sunk[]
): DuelFigures {
  const winner = result.ships.findIndex((s) => s.place === 1),
    lost = sunk.at(-1) ?? null;
  return {
    seconds: result.seconds,
    winner: winner < 0 ? null : winner,
    sunk: lost,
    timeToSink: lost?.fight ?? null,
    ships: result.ships.map((_, id) =>
      aimOf(shots.filter((s) => s.ship === id))
    ),
    unfired: shots.length === 0,
  };
}

export type DuelTally = {
  duels: number;
  wins: number[];
  none: number;
  timeToSink: number | null;
  storm: number;
  stormUnfired: number;
};

export function duelTally(
  duels: readonly { figures: DuelFigures; sides: readonly number[] }[],
  sides: number
): DuelTally {
  const wins = new Array<number>(sides).fill(0);
  let none = 0,
    storm = 0,
    stormUnfired = 0;
  for (const { figures: f, sides: of } of duels) {
    if (f.winner === null) none++;
    else wins[of[f.winner]]++;
    if (f.sunk?.cause === 'storm') {
      storm++;
      if (f.unfired) stormUnfired++;
    }
  }
  return {
    duels: duels.length,
    wins,
    none,
    timeToSink: median(
      duels.flatMap((d) =>
        d.figures.timeToSink === null ? [] : [d.figures.timeToSink]
      )
    ),
    storm,
    stormUnfired,
  };
}

export function joinedHash(hashes: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of hashes.join(' '))
    h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
