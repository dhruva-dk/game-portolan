// Synthetic race results (Phase B section 15): a RaceResult made from a RaceCard without sailing it, for
// tools/season.ts and the career's tests. Seeded by the card: ships ordered by their handling and captain plus noise;
// about a third sunk, each by a ship that finished above her, the storm, or (a forfeit ship) at the start; the sea held
// by the top ten; a fault or two, some stops and hits. It never enters src and never runs in the game.

import type { Captain, RaceCard, RaceResult, RaceShip } from '../src/race.ts';
import { random } from '../src/world/random.ts';

/** How strong a ship looks on paper: her handling's top speed and hull, her captain's helm, gunnery and seamanship. */
function strength(ship: RaceShip, player: number): number {
  const h = ship.handling;
  const c: Captain['stats'] | null = ship.captain?.stats ?? null;
  const sailor = c ? (c.helm + c.gunnery + c.seamanship) / 60 : player;
  return h.top / 10 + h.hull / 400 + sailor * 2;
}

/** A result for a card. `player`: the strength (0..1) the player's own ship (captain null) sails with. */
export function synthetic(card: RaceCard, player = 0.5): RaceResult {
  const rand = random((card.seed ^ 0x5eed) >>> 0);
  const score = new Map(card.ships.map((s) => [s.id, s.forfeit ? -1e9 : strength(s, player) + rand() * 3]));
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
