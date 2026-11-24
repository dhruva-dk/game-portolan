import type { Doing, Mate, Placed, Race } from './player.ts';
import type { RaceCard } from '../sim/race.ts';
import type { Crew } from '../sim/battle.ts';
import type { Mode } from '../sim/captain.ts';
import { HEALTH } from '../sim/handling.ts';
import { hullCap, sunk } from '../sim/health.ts';

interface Sea {
  seconds: number;
  crews: readonly Crew[];
  sunk: readonly { id: number; by: number | null }[];
}

interface Seat {
  order(): readonly number[];
  mode(id: number): Mode | undefined;
}

const DOING: Record<Mode, Doing> = {
  roam: 'sailing',
  claim: 'sailing',
  loot: 'sailing',
  heal: 'sailing',
  fight: 'fighting',
  hunt: 'fighting',
  flee: 'fleeing',
  storm: 'storm',
};

export function createStandings(card: RaceCard) {
  const rows: Placed[] = card.ships.map(({ id, team }) => ({
    id,
    team,
    place: 0,
    afloat: false,
    sinkings: 0,
  }));
  const tower: Placed[] = [],
    mates: Mate[] = [];
  const race: Race = { team: 0, place: 0, of: card.ships.length, mates, tower };
  let made = -1,
    seat = -1;

  return (id: number, sea: Sea, at: Seat): Race => {
    if (sea.seconds === made && id === seat) return race;
    [made, seat] = [sea.seconds, id];
    const crews = new Map(sea.crews.map((c) => [c.id, c]));
    const floats = (k: number) => {
      const c = crews.get(k);
      return !!c && !sunk(c.health);
    };
    for (const r of rows) [r.afloat, r.sinkings] = [floats(r.id), 0];
    for (const s of sea.sunk) if (s.by !== null) rows[s.by].sinkings++;
    tower.length = 0;
    at.order().forEach((k, i) => {
      rows[k].place = i + 1;
      tower.push(rows[k]);
    });
    race.team = card.ships[id].team;
    race.place = rows[id].place;
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
          doing: 'sunk',
          place: 0,
        });
      m.id = s.id;
      m.hull = c?.health.hull ?? 0;
      m.hullMax = c ? hullCap(c.health) : HEALTH.hull;
      m.shield = c?.health.shield ?? 0;
      m.doing = !rows[s.id].afloat ? 'sunk' : DOING[at.mode(s.id) ?? 'roam'];
      m.place = rows[s.id].place;
    }
    mates.length = n;
    return race;
  };
}
