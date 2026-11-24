import type { Crew, Shot, Strike } from './battle.ts';
import type { Vessel } from './contact.ts';
import { sunk } from './health.ts';
import type { Sunk } from './match.ts';
import type { MatchResult, ShipResult } from './result.ts';
import { over } from './teams.ts';

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

function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export interface Standing {
  seconds: number;
  alive: readonly number[];
  fleet: readonly Vessel[];
  crews: readonly Crew[];
  sunk: readonly (Sunk & { time: number })[];
  loot: number;
  share: (id: number) => number;
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

export function createTally(teams: readonly number[], closes: number) {
  const count = teams.length,
    sides = Math.max(-1, ...teams) + 1,
    zeros = () => new Array<number>(count).fill(0);
  const fired = zeros(),
    landed = zeros(),
    taken = zeros(),
    dealt = zeros();
  let made: MatchResult | null = null;

  const fought = (shots: readonly Shot[], strikes: readonly Strike[]) => {
    for (const s of shots) fired[s.shooter]++;
    for (const s of strikes) {
      if (s.shooter === s.struck) continue;
      dealt[s.shooter] += s.damage;
      taken[s.struck] += s.damage;
      if (s.ram) continue;
      landed[s.shooter]++;
    }
  };

  const result = (s: Standing): MatchResult => {
    const place = zeros();
    finishing(s.alive, s.sunk, s.share).forEach((id, i) => {
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
        shotsLanded: landed[id],
        damageDealt: dealt[id],
        damageTaken: taken[id],
        afloatAtPhaseFour: !sank,
      };
    };
    return {
      seconds: s.seconds,
      hash: fingerprint(numbers(s)),
      ships: teams.map((_, id) => ship(id)),
      sea: Array.from({ length: sides }, () => []),
    };
  };

  return {
    teams,
    settle(
      shots: readonly Shot[],
      strikes: readonly Strike[],
      standing: () => Standing,
      decides = true
    ) {
      if (made) return;
      fought(shots, strikes);
      if (!decides) return;
      const s = standing();
      if (over(teams, s.alive, s.seconds - closes)) made = result(s);
    },
    made: (): MatchResult | null => made,
    result: (s: Standing): MatchResult => made ?? result(s),
  };
}

export type Tally = ReturnType<typeof createTally>;
