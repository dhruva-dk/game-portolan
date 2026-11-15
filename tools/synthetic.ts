// Synthetic race results (Phase B section 15): a RaceResult made from a RaceCard without sailing it, for
// tools/season.ts and the career's tests. Seeded by the card: ships ordered by their handling and captain plus noise;
// about a third sunk, each by a ship that finished above her, the storm, or (a forfeit ship) at the start; the sea held
// by the top ten; a fault or two, some stops and hits. It never enters src and never runs in the game.

import type { Captain, RaceCard, RaceResult, RaceShip } from '../src/race.ts';
import { random } from '../src/world/random.ts';

/** Her captain's sailing (helm, gunnery, seamanship, 0..1); `player` for the player's own ship (captain null). */
function sailor(ship: RaceShip, player: number): number {
  const c: Captain['stats'] | null = ship.captain?.stats ?? null;
  return c ? (c.helm + c.gunnery + c.seamanship) / 60 : player;
}

/** Her parts as her handling shows them: top speed and hull. */
const build = (ship: RaceShip): number => ship.handling.top / 10 + ship.handling.hull / 400;

/** Each value as standard scores across the card (0 when all are equal). */
function scored(xs: readonly number[]): number[] {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return xs.map((x) => (sd > 1e-9 ? (x - mean) / sd : 0));
}

/** Weights of a ship's captain and parts, in standard scores across the card, and the race's luck (its sd). */
const CAPTAIN = 0.65, PARTS = 0.35, LUCK = 0.8;

/** A result for a card: ships ordered by their captain and parts across the card, plus luck about as large (a race is
 *  won by the stronger crew more often than not, never always). `player`: the sailing (0..1) of the player's ship. */
export function synthetic(card: RaceCard, player = 0.5): RaceResult {
  const rand = random((card.seed ^ 0x5eed) >>> 0);
  const sailors = scored(card.ships.map((s) => sailor(s, player))), builds = scored(card.ships.map(build));
  const luck = () => (rand() + rand() + rand() + rand() - 2) * Math.sqrt(3) * LUCK;
  const score = new Map(card.ships.map((s, i) => [s.id, s.forfeit ? -1e9 : CAPTAIN * sailors[i] + PARTS * builds[i] + luck()]));
  const order = [...card.ships].sort((a, b) => score.get(b.id)! - score.get(a.id)! || a.id - b.id).map((s) => s.id);
  const sinkings: RaceResult['sinkings'][number][] = [];
  order.forEach((id, place) => {
    const ship = card.ships[id];
    if (ship.forfeit) {
      sinkings.push({ id, by: null, cause: 'forfeit', second: 0 });
      return;
    }
    if (place < 10 || rand() > 0.4) return;
    const storm = rand() < 0.25;
    const by = storm ? null : order[Math.floor(rand() * place)];
    sinkings.push({ id, by: by === id ? null : by, cause: storm ? 'storm' : 'shot', second: Math.floor(60 + rand() * 600) });
  });
  const sea = order.slice(0, 10);
  const total = sea.reduce((a, _id, i) => a + (10 - i), 0);
  const seaHeld = sea.map((id, i) => ({ id, share: (10 - i) / total }));
  const faults = card.ships.flatMap((s) => (rand() < 0.15 && s.parts.length > 0 ? [{ id: s.id, type: s.parts[Math.floor(rand() * s.parts.length)].type, second: Math.floor(rand() * 600) }] : []));
  const stops = card.ships.flatMap((s) => (rand() < 0.3 ? [{ id: s.id, job: s.service.order[0], botched: rand() < s.service.botch[s.service.order[0]] }] : []));
  const hits = card.ships.map((s) => {
    const fired = Math.floor(rand() * 40);
    return { id: s.id, fired, landed: Math.floor(fired * rand() * 0.5), taken: Math.floor(rand() * 20) };
  });
  return { seed: card.seed, league: card.league, round: card.round, order, sinkings, seaHeld, faults, stops, hits, seconds: 600 + Math.floor(rand() * 300) };
}
