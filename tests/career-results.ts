// A seeded stand-in for a race's result, for the career's tests only (never in
// src, never in a tool that plays careers: those sail play/race.ts's races). A
// RaceResult made from a RaceCard without sailing it, of the shape a race gives:
// ships placed by their driver and parts across the card plus luck about as
// large; forfeit ships sunk at the start; about half of the rest sunk, the
// weaker more often, each by a ship afloat, the storm, or a ram; the order the
// afloat first, then the sunk, the last sunk first; the sea held by the first
// ten; faults by zone, pit stops by the card's own pit crews, and hits.

import { sumOf } from '../src/career/canon.ts';
import { ZONES } from '../src/kinds.ts';
import {
  PARTS,
  STATS,
  type RaceCard,
  type RaceResult,
  type RaceShip,
} from '../src/race.ts';
import { random } from '../src/world/random.ts';

/** Her driver's sailing (the mean of her stats, 0..1); `player` for the player's own ship (driver null). */
const sailor = (ship: RaceShip, player: number): number =>
  ship.driver
    ? STATS.reduce((a, k) => a + (ship.driver?.stats[k] ?? 0), 0) /
      STATS.length /
      20
    : player;

/** Her parts as fitted: their mean performance. */
const build = (ship: RaceShip): number =>
  PARTS.reduce((a, t) => a + ship.parts[t].performance, 0) / PARTS.length;

/** Each value as standard scores across the card (0 when all are equal). */
function scored(xs: readonly number[]): number[] {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return xs.map((x) => (sd > 1e-9 ? (x - mean) / sd : 0));
}

/** The weights of a ship's driver and parts, in standard scores across the card, and the race's luck (its sd). */
const DRIVER = 0.65,
  BUILD = 0.35,
  LUCK = 0.8;

/** A stand-in result for a card. `player`: the sailing (0..1) of the player's ship. */
export function standIn(card: RaceCard, player = 0.5): RaceResult {
  const rand = random((card.seed ^ 0x5eed) >>> 0);
  const sailors = scored(card.ships.map((s) => sailor(s, player))),
    builds = scored(card.ships.map(build));
  const luck = () =>
    (rand() + rand() + rand() + rand() - 2) * Math.sqrt(3) * LUCK;
  const score = new Map(
    card.ships.map((s, i) => [
      s.id,
      DRIVER * (sailors[i] ?? 0) + BUILD * (builds[i] ?? 0) + luck(),
    ])
  );
  const of = (id: number) => score.get(id) ?? 0;
  const ranked = card.ships
    .filter((s) => !s.forfeit)
    .map((s) => s.id)
    .sort((a, b) => of(b) - of(a) || a - b);
  const sinkings: RaceResult['sinkings'][number][] = card.ships
    .filter((s) => s.forfeit)
    .map((s) => ({
      id: s.id,
      by: null,
      cause: 'forfeit',
      gun: null,
      second: 0,
    }));
  // the weaker sink more often: none of the first ten, then a chance rising down the order
  const afloat: number[] = [];
  ranked.forEach((id, place) => {
    const chance = place < 10 ? 0 : 0.25 + (0.6 * place) / ranked.length;
    if (rand() > chance || afloat.length === 0) {
      afloat.push(id);
      return;
    }
    const how = rand();
    const by =
      how < 0.2 ? null : (afloat[Math.floor(rand() * afloat.length)] ?? null);
    sinkings.push({
      id,
      by,
      cause: by === null ? 'storm' : how < 0.3 ? 'ram' : 'shot',
      gun: null,
      second: Math.floor(60 + rand() * 600),
    });
  });
  const kills = new Map<number, number>();
  for (const k of sinkings)
    if (k.by !== null) kills.set(k.by, (kills.get(k.by) ?? 0) + 1);
  const sea = afloat.slice(0, 10);
  const total = sea.reduce((a, _id, i) => a + (10 - i), 0);
  const seaHeld = sea.map((id, i) => ({ id, share: (10 - i) / total }));
  const share = new Map(seaHeld.map((h) => [h.id, h.share]));
  const order = [
    ...[...afloat].sort(
      (a, b) =>
        (kills.get(b) ?? 0) - (kills.get(a) ?? 0) ||
        (share.get(b) ?? 0) - (share.get(a) ?? 0) ||
        a - b
    ),
    ...[...sinkings]
      .sort((a, b) => b.second - a.second || a.id - b.id)
      .map((k) => k.id),
  ];
  const sailed = card.ships.filter((s) => !s.forfeit);
  const faults = sailed.flatMap((s) =>
    rand() < 0.3 * (1.5 - s.parts.hull.reliability)
      ? [
          {
            id: s.id,
            zone: Math.floor(rand() * ZONES.length),
            level: rand() < 0.3 ? 2 : 1,
            second: Math.floor(rand() * 600),
          },
        ]
      : []
  );
  const pits = sailed.flatMap((s) => {
    if (rand() > 0.35) return [];
    const jobs = 1 + Math.floor(rand() * 3);
    let slips = 0;
    for (let j = 0; j < jobs; j++) if (rand() < s.pit.slip) slips++;
    return [
      {
        id: s.id,
        second: Math.floor(120 + rand() * 400),
        seconds: Math.round((8 * jobs * s.pit.pace + 4 * slips) * 10) / 10,
        jobs,
        slips,
      },
    ];
  });
  const hits = card.ships.map((s) => {
    const fired = s.forfeit ? 0 : Math.floor(rand() * 40);
    const landed = Math.floor(fired * rand() * 0.5);
    return {
      id: s.id,
      fired,
      landed,
      taken: s.forfeit ? 0 : Math.floor(rand() * 20),
      dealt: landed * 12,
    };
  });
  const result = {
    seed: card.seed,
    tier: card.tier,
    round: card.round,
    order,
    sinkings,
    seaHeld,
    faults,
    pits,
    hits,
    seconds: 600 + Math.floor(rand() * 300),
  };
  return { ...result, hash: sumOf(JSON.stringify(result)) };
}
