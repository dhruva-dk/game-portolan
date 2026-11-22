// A season of a headless career as the runner reports it, with what MANAGER.md 6's claims read from it:
//
// - 3, no seat advantage: each team's slot on the grid (its berth follows from it) and its colours, with its points;
// - 4, strength pays: its drivers' stars, its fitted parts' performance and reliability, with its points;
// - 5, decisions pay: its levers (fitted parts' risk, its buildings, its wages, its sailing school), with its points;
// - 7, the economy holds: each balance at the season's start and end, the leader's lead in each tier, and where the
//   scripted manager's team lands.
//
// The tables are read when the season's last round closes (the season's end resets them); the balances and next
// tiers when the next season begins (after prizes, promotion and relegation).

import type { Colours } from '../../src/race.ts';
import { grid } from '../../src/career/lineup.ts';
import { wages } from '../../src/career/money.ts';
import { stars } from '../../src/career/stars.ts';
import { standingOf } from '../../src/career/standings.ts';
import type { CareerState, Team } from '../../src/career/state.ts';

/** A team's season. */
export interface TeamSeason {
  team: number;
  name: string;
  tier: number; // 0 Tier 1
  slot: number; // its place on its tier's grid, 0 first
  colours: Colours;
  player: boolean;
  place: number; // 1 the first
  points: number;
  wins: number;
  podiums: number;
  sinkings: number;
  balance: { start: number; end: number | null };
  next: number | null; // its tier next season
  strength: {
    drivers: number; // the mean stars of its ships' drivers (the player's ship's bot not counted)
    perf: number; // its fitted parts' mean performance, 0..1000
    reliability: number; // and reliability, 0..1
    risk: number; // and risk, 0..1
    buildings: number; // its buildings' levels, summed
    school: number; // its sailing school's level
    wages: number; // a race
  };
}

/** A season's record. */
export interface Season {
  season: number;
  wall: { ms: number; races: number; raceMs: number; planetMs: number };
  tiers: {
    tier: number;
    lead: number;
    drivers: { person: number; points: number }[];
  }[]; // lead: 1st − 2nd; the drivers' top three
  teams: TeamSeason[];
  player: {
    team: number;
    tier: number;
    place: number;
    sacked: boolean; // at any time this season
    balance: number | null;
  };
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** A team's strength as it stands. */
function strengthOf(s: CareerState, c: Team): TeamSeason['strength'] {
  const fitted = c.parts.filter((p) => p.ship !== null);
  const drivers = c.staff.ships.flatMap((h) =>
    h.driver === null ? [] : [stars(s.people[h.driver])]
  );
  return {
    drivers: mean(drivers),
    perf: mean(fitted.map((p) => p.perf)),
    reliability: mean(fitted.map((p) => p.reliability)),
    risk: mean(fitted.map((p) => p.risk)),
    buildings: Object.values(c.buildings).reduce((a, w) => a + w.level, 0),
    school: c.buildings.sailingSchool.level,
    wages: wages(s, c),
  };
}

/** The tables as the season's last round leaves them, the balances at its start given. */
export function tables(
  s: CareerState,
  start: readonly number[],
  wall: Season['wall'],
  sacked: boolean
): Season {
  const teams: TeamSeason[] = s.championships.flatMap((l) => {
    const order = grid(s, l.id);
    return l.teams.map((id) => {
      const c = s.teams[id];
      const line = l.standings.find((x) => x.team === id);
      return {
        team: id,
        name: c.name,
        tier: l.id,
        slot: order.indexOf(id),
        colours: c.colours,
        player: c.player,
        place: standingOf(s, id),
        points: line?.points ?? 0,
        wins: line?.wins ?? 0,
        podiums: line?.podiums ?? 0,
        sinkings: line?.sinkings ?? 0,
        balance: { start: start[id] ?? c.balance, end: null },
        next: null,
        strength: strengthOf(s, c),
      };
    });
  });
  const tiers = s.championships.map((l) => {
    const points = l.standings.map((x) => x.points).sort((a, b) => b - a);
    return {
      tier: l.id,
      lead: (points[0] ?? 0) - (points[1] ?? 0),
      drivers: [...l.drivers]
        .sort((a, b) => b.points - a.points || a.person - b.person)
        .slice(0, 3)
        .map((d) => ({ person: d.person, points: d.points })),
    };
  });
  const me = s.player?.team ?? -1;
  return {
    season: s.season,
    wall,
    tiers,
    teams,
    player: {
      team: me,
      tier: s.teams[me]?.tier ?? -1,
      place: me < 0 ? -1 : standingOf(s, me),
      sacked,
      balance: null,
    },
  };
}

/** A season's record closed as the next begins: each balance at its end, each team's tier for the next. */
export function turned(r: Season, s: CareerState): Season {
  return {
    ...r,
    teams: r.teams.map((t) => ({
      ...t,
      balance: { ...t.balance, end: s.teams[t.team].balance },
      next: s.teams[t.team].tier,
    })),
    player: { ...r.player, balance: s.teams[r.player.team]?.balance ?? null },
  };
}
