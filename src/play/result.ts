import type { Race } from './player.ts';
import type { RaceCard, RaceResult } from '../sim/race.ts';
import type { Crew, Shot, Strike } from '../sim/battle.ts';
import type { Mode } from '../sim/captain.ts';
import { over, teamsOf } from '../sim/carded.ts';
import type { Vessel } from '../sim/contact.ts';
import { sunk } from '../sim/health.ts';
import type { Sunk } from '../sim/match.ts';
import { createStandings } from './standings.ts';

export function finishing(
  alive: readonly number[],
  sunk: readonly Pick<Sunk, 'id' | 'by'>[],
  share: (id: number) => number,
  forfeit: readonly number[] = []
): number[] {
  const credit = (id: number) => sunk.filter((s) => s.by === id).length;
  const top = [...alive].sort(
    (a, b) => credit(b) - credit(a) || share(b) - share(a) || a - b
  );
  return [
    ...top,
    ...sunk.map((s) => s.id).reverse(),
    ...[...forfeit].sort((a, b) => a - b),
  ];
}

function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

interface Standing {
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

export function createTally(card: RaceCard, closes: number) {
  const count = card.ships.length,
    teams = teamsOf(card),
    zeros = () => new Array<number>(count).fill(0);
  const fired = zeros(),
    landed = zeros(),
    taken = zeros(),
    dealt = zeros(),
    held = zeros();
  const forfeit = card.ships.filter((s) => s.forfeit).map((s) => s.id);
  const standings = createStandings(card);
  let made: RaceResult | null = null;

  const fought = (shots: readonly Shot[], strikes: readonly Strike[]) => {
    for (const s of shots) fired[s.shooter]++;
    for (const s of strikes) {
      if (s.shooter === s.struck) continue;
      dealt[s.shooter] += s.damage;
      if (s.ram) continue;
      landed[s.shooter]++;
      taken[s.struck]++;
    }
  };

  const result = (s: Standing): RaceResult => {
    const afloat = new Set(s.alive),
      ids = card.ships.map((k) => k.id);
    const share = (id: number) => (afloat.has(id) ? s.share(id) : held[id]);
    const out: RaceResult['sinkings'] = forfeit.map((id) => ({
      id,
      by: null,
      cause: 'forfeit',
      gun: null,
      second: 0,
    }));
    return {
      seed: card.seed,
      tier: card.tier,
      round: card.round,
      order: finishing(s.alive, s.sunk, s.share, forfeit),
      sinkings: [
        ...out,
        ...s.sunk.map(({ id, by, cause, gun, time: second }) => ({
          id,
          by,
          cause,
          gun,
          second,
        })),
      ],
      seaHeld: ids.map((id) => ({ id, share: share(id) })),
      hits: ids.map((id) => ({
        id,
        fired: fired[id],
        landed: landed[id],
        taken: taken[id],
        dealt: dealt[id],
      })),
      seconds: s.seconds,
      hash: fingerprint(numbers(s)),
    };
  };

  return {
    teams,
    forfeit,
    holds(id: number, share: number) {
      held[id] = share;
    },
    view: (
      id: number,
      s: Standing,
      sea: { mode(id: number): Mode | undefined }
    ): Race =>
      standings(id, s, {
        order: () => finishing(s.alive, s.sunk, s.share, forfeit),
        mode: sea.mode,
      }),
    settle(
      shots: readonly Shot[],
      strikes: readonly Strike[],
      standing: () => Standing
    ) {
      if (made) return;
      fought(shots, strikes);
      const s = standing();
      if (over(teams, s.alive, s.seconds - closes)) made = result(s);
    },
    result: (): RaceResult | null => made,
  };
}

export type Tally = ReturnType<typeof createTally>;
