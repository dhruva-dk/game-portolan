// A race sailed by a card as its HUD reads it (player.ts Race, MANAGER.md 3
// point 10): for one ship of it, her team's call, her teammates, the standings
// of every ship, and her pit. Plain data made of the sea as a step left it
// (result.ts Standing), once a step however often it is asked for: one object,
// refilled, its rows too.
//
// The standings are the finishing order as it would be were the race called
// now (result.ts finishing), so a ship's place on the HUD is the place the
// result gives her if nothing more happens.

import { JOBS } from '../kinds.ts';
import type { Doing, Mate, Placed, Race } from '../player.ts';
import type { Call, RaceCard } from '../race.ts';
import type { Crew } from '../sim/battle.ts';
import type { Mode } from '../sim/captain.ts';
import { HEALTH } from '../sim/handling.ts';
import { hullCap, sunk } from '../sim/health.ts';
import { jobTime } from '../sim/pit.ts';

/**
 * The sea as the standings read it: its clock, every crew, and the sinkings so
 * far (whose, and by whom).
 */
interface Sea {
  seconds: number;
  crews: readonly Crew[];
  sunk: readonly { id: number; by: number | null }[];
}

/**
 * The ship they are read for, as the step left her: her team's call, the
 * finishing order as it stands (asked for only when the standings are made
 * anew), whether she lies in her team's water, and what a ship's bot is about
 * (none: no bot sails her, or she is sunk).
 */
interface Seat {
  call: Call;
  order(): readonly number[];
  home: boolean;
  mode(id: number): Mode | undefined;
}

/** What a bot about `mode` is doing, as a teammate's card tells it. */
const DOING: Record<Mode, Doing> = {
  roam: 'sailing',
  claim: 'sailing',
  loot: 'sailing',
  heal: 'sailing',
  fight: 'fighting',
  hunt: 'fighting',
  flee: 'fleeing',
  storm: 'storm',
  pit: 'pit',
};

/** The standings of the race dealt `card`, for a ship of it. */
export function createStandings(card: RaceCard) {
  const rows: Placed[] = card.ships.map(({ id, team }) => ({
    id,
    team,
    place: 0,
    afloat: false,
    sinkings: 0,
  }));
  const tower: Placed[] = [],
    mates: Mate[] = [],
    costs: number[] = JOBS.map(() => 0);
  const race: Race = {
    team: 0,
    call: 'free',
    place: 0,
    of: card.ships.length,
    mates,
    tower,
    pit: { open: false, costs, stop: null },
  };
  /** The step and the ship the standings were last made for. */
  let made = -1,
    seat = -1;

  /**
   * The race as ship `id`'s HUD reads it, the sea as a step left it (`sea`,
   * `at`).
   */
  return (id: number, sea: Sea, at: Seat): Race => {
    race.call = at.call;
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
      m.doing = !rows[s.id].afloat
        ? 'sunk'
        : c?.pit
          ? 'pit'
          : DOING[at.mode(s.id) ?? 'roam'];
      m.place = rows[s.id].place;
    }
    mates.length = n;
    const own = crews.get(id),
      pace = card.ships[id].pit.pace,
      stop = own?.pit ?? null;
    JOBS.forEach((job, i) => {
      costs[i] = own && rows[id].afloat ? jobTime(own, job, pace) : 0;
    });
    race.pit.open = rows[id].afloat && at.home && !stop;
    race.pit.stop =
      own && stop
        ? {
            jobs: stop.jobs,
            at: stop.at,
            done: stop.done,
            slips: stop.slips,
            // (the job in hand, begun or about to be, and those after it)
            left: stop.jobs.reduce(
              (t, job, i) =>
                i < stop.at || (i === stop.at && stop.left > 0)
                  ? t
                  : t + jobTime(own, job, pace),
              Math.max(0, stop.left)
            ),
          }
        : null;
    return race;
  };
}
