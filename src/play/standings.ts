import type { Mate, Race } from './player.ts';
import type { Crew } from '../sim/battle.ts';
import { SHIELD } from '../sim/tuning.ts';

interface Sea {
  seconds: number;
  crews: readonly Crew[];
}

interface Seat {
  order(): readonly number[];
}

export function createStandings(teams: readonly number[]) {
  const places = teams.map(() => 0),
    mates: Mate[] = [];
  const race: Race = { team: 0, place: 0, of: teams.length, mates };
  let made = -1,
    seat = -1;

  return (id: number, sea: Sea, at: Seat): Race => {
    if (sea.seconds === made && id === seat) return race;
    [made, seat] = [sea.seconds, id];
    const crews = new Map(sea.crews.map((c) => [c.id, c]));
    at.order().forEach((k, i) => {
      places[k] = i + 1;
    });
    race.team = teams[id];
    race.place = places[id];
    let n = 0;
    for (let k = 0; k < teams.length; k++) {
      if (teams[k] !== race.team || k === id) continue;
      const c = crews.get(k),
        m = (mates[n++] ??= {
          id: 0,
          hull: 0,
          hullMax: 0,
          shield: 0,
          shieldMax: SHIELD.most,
          place: 0,
        });
      m.id = k;
      m.hull = c?.health.hull ?? 0;
      m.hullMax = c?.health.most ?? 0;
      m.shield = c?.health.shield ?? 0;
      m.place = places[k];
    }
    mates.length = n;
    return race;
  };
}
