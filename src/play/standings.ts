import type { Mate, Race } from './player.ts';
import type { RaceCard } from '../sim/race.ts';
import type { Crew } from '../sim/battle.ts';
import { HEALTH } from '../sim/handling.ts';
import { hullCap } from '../sim/health.ts';

interface Sea {
  seconds: number;
  crews: readonly Crew[];
}

interface Seat {
  order(): readonly number[];
}

export function createStandings(card: RaceCard) {
  const places = card.ships.map(() => 0),
    mates: Mate[] = [];
  const race: Race = { team: 0, place: 0, of: card.ships.length, mates };
  let made = -1,
    seat = -1;

  return (id: number, sea: Sea, at: Seat): Race => {
    if (sea.seconds === made && id === seat) return race;
    [made, seat] = [sea.seconds, id];
    const crews = new Map(sea.crews.map((c) => [c.id, c]));
    at.order().forEach((k, i) => {
      places[k] = i + 1;
    });
    race.team = card.ships[id].team;
    race.place = places[id];
    let n = 0;
    for (const s of card.ships) {
      if (s.team !== race.team || s.id === id) continue;
      const c = crews.get(s.id),
        m = (mates[n++] ??= {
          id: 0,
          hull: 0,
          hullMax: 0,
          shield: 0,
          shieldMax: HEALTH.shield,
          place: 0,
        });
      m.id = s.id;
      m.hull = c?.health.hull ?? 0;
      m.hullMax = c ? hullCap(c.health) : HEALTH.hull;
      m.shield = c?.health.shield ?? 0;
      m.place = places[s.id];
    }
    mates.length = n;
    return race;
  };
}
