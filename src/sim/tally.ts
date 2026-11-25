import type { Crew, Hit, Shot } from './battle.ts';
import type { Vessel } from './contact.ts';
import { sunk } from './health.ts';
import type { Sunk } from './match.ts';
import { sealed, type MatchResult, type ShipResult } from './result.ts';
import { over } from './teams.ts';
import { MATCH_END } from './tuning.ts';

export function finishing(
  alive: readonly number[],
  sunk: readonly Pick<Sunk, 'id' | 'by'>[],
  share: (id: number) => number
): number[] {
  const credit = (id: number) => sunk.filter((s) => s.by === id).length;
  const top = [...alive].sort(
    (a, b) => credit(b) - credit(a) || share(b) - share(a) || a - b
  );
  return [...top, ...sunk.map((s) => s.id).reverse()];
}

export interface Standing {
  seconds: number;
  alive: readonly number[];
  fleet: readonly Vessel[];
  crews: readonly Crew[];
  sunk: readonly (Sunk & { time: number })[];
  loot: number;
  share: (id: number) => number;
  teamShare: (id: number) => number;
  shares: () => readonly number[];
}

function numbers(s: Standing): number[] {
  const n: number[] = [s.seconds, s.loot];
  for (const v of [...s.fleet].sort((a, b) => a.id - b.id))
    n.push(v.id, ...v.ship.at, ...v.ship.heading, v.ship.speed);
  for (const c of [...s.crews].sort((a, b) => a.id - b.id))
    n.push(
      c.id,
      c.health.hull,
      c.health.shield,
      s.share(c.id),
      sunk(c.health) ? 0 : 1
    );
  for (const k of s.sunk) n.push(k.id, k.by ?? -1, k.time);
  return n;
}

export function createTally(
  teams: readonly number[],
  closed: readonly number[]
) {
  const count = teams.length,
    sides = Math.max(-1, ...teams) + 1,
    closes = closed.at(-1) ?? Infinity,
    zeros = () => new Array<number>(count).fill(0);
  const fired = zeros(),
    taken = zeros(),
    dealt = zeros(),
    landed = teams.map(() => new Set<number>());
  const sea: number[][] = Array.from({ length: sides }, () => []);
  let got = 0,
    fourth: ReadonlySet<number> | null = null,
    made: MatchResult | null = null;

  const fought = (shots: readonly Shot[], hits: readonly Hit[]) => {
    for (const s of shots) fired[s.shooter]++;
    for (const h of hits) {
      if (h.shooter === h.struck) continue;
      dealt[h.shooter] += h.damage;
      taken[h.struck] += h.damage;
      if (h.round !== null) landed[h.shooter].add(h.round);
    }
  };

  const sample = (s: Standing) => {
    const shares = s.shares();
    sea.forEach((samples, t) => samples.push(shares[t] ?? 0));
    got++;
    if (got === MATCH_END.afloatAt) fourth = new Set(s.alive);
  };

  const samples = (s: Standing): number[][] => {
    const missing = closed.length - got;
    if (missing === 0) return sea.map((t) => [...t]);
    const now = s.shares(),
      afloat = new Set(s.alive.map((id) => teams[id]));
    return sea.map((t, side) => [
      ...t,
      ...new Array<number>(missing).fill(
        afloat.has(side) ? (now[side] ?? 0) : 0
      ),
    ]);
  };

  const result = (s: Standing): MatchResult => {
    const place = zeros();
    finishing(s.alive, s.sunk, s.teamShare).forEach((id, i) => {
      place[id] = i + 1;
    });
    const ship = (id: number): ShipResult => {
      const sank = s.sunk.find((k) => k.id === id);
      return {
        place: place[id] || count,
        sunkAt: sank ? sank.time : null,
        sunkBy: sank ? sank.by : null,
        sinkings: s.sunk.filter((k) => k.by === id).length,
        shotsFired: fired[id],
        shotsLanded: landed[id].size,
        damageDealt: dealt[id],
        damageTaken: taken[id],
        afloatAtPhaseFour: (fourth ?? new Set(s.alive)).has(id),
      };
    };
    return sealed(
      {
        seconds: s.seconds,
        ships: teams.map((_, id) => ship(id)),
        sea: samples(s),
      },
      numbers(s)
    );
  };

  return {
    teams,
    settle(
      shots: readonly Shot[],
      hits: readonly Hit[],
      standing: () => Standing,
      decides = true
    ) {
      if (made) return;
      fought(shots, hits);
      const s = standing();
      while (got < closed.length && s.seconds >= closed[got]) sample(s);
      if (decides && over(teams, s.alive, s.seconds - closes)) made = result(s);
    },
    made: (): MatchResult | null => made,
    result: (s: Standing): MatchResult => made ?? result(s),
  };
}

export type Tally = ReturnType<typeof createTally>;
