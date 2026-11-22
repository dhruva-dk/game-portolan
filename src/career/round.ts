// The round's close: once the three championships' results are in, each in turn
// has its points (under its rules) and its two tables, the teams' and the
// drivers'; then, team by team, its stand-ins paid, injuries, the drivers'
// records, morale, bonds, the pit crew's fatigue, its parts' wear and Feedback,
// its bonuses, the race's money, its sponsors' objectives and its sailors'
// marketability; then the championship's inspection, reputations and the
// chairmen's confidence; and mail. The round then ends: the race day is over,
// the next round is next, and the dilemmas are drawn (career/dilemmas.ts).

import { TEAM, type RaceResult } from '../race.ts';
import { SHIPS } from '../office/command.ts';
import { askWage } from './asks.ts';
import { paid } from './balance.ts';
import { afterRace } from './chairmen.ts';
import { standingOf } from './standings.ts';
import type { Dice } from './dice.ts';
import { effective } from './effective.ts';
import { mechanicsOf } from './improvement.ts';
import { flagsCleared, today } from './flags.ts';
import { inspected } from './inspection.ts';
import { grid, lineups, type Sailing } from './lineup.ts';
import { bonusesPaid, raceMoney } from './money.ts';
import {
  bondMove,
  injury,
  moraleIn,
  resultMove,
  statusMove,
  wageMove,
  wantsOut,
} from './morale.ts';
import { partsAfterRace } from './parts.ts';
import {
  bondGain,
  bondLevel,
  fatigueGained,
  fatigueOn,
  leadershipFatigue,
  leadershipMorale,
} from './pit.ts';
import { mine, post } from './post.ts';
import {
  marketabilityAfterRace,
  reputationAfterRace,
  type ShipRace,
} from './reputation.ts';
import { hasRole, type Person } from './roles.ts';
import { sponsorsAfterRace } from './sponsors.ts';
import {
  championshipOf,
  personAt,
  staffOf,
  teamOf,
  withPeople,
  withPerson,
  withTeam,
  type CareerState,
  type DriverStanding,
  type Standing,
} from './state.ts';
import { modifier } from './traits.ts';
import { TUNING } from './tuning.ts';

const R = TUNING.race;

/** A place's points (1 first): TUNING.race.top's to the first ten ships, then none. */
export const placePoints = (place: number): number => R.top[place - 1] ?? 0;

/**
 * What a team's race came to: its points, its ships' (by ship), its best
 * place, ships sunk by it, its ships afloat at the end, and whether it alone
 * held the most sea.
 */
interface TeamRace {
  points: number;
  ships: readonly (ShipRace & { place: number })[];
  best: number;
  sank: number;
  afloat: number;
  mostSea: boolean;
  wins: number;
  podiums: number;
}

/** A championship's result read by team, in the card's order (career/lineup.ts grid). */
export function tally(
  result: RaceResult,
  teams: number,
  rules: { pointsPerSinking: number; seaHeldPoint: boolean }
): TeamRace[] {
  const place = new Map(result.order.map((id, i) => [id, i + 1]));
  const kills = new Map<number, number>();
  for (const k of result.sinkings)
    if (k.by !== null) kills.set(k.by, (kills.get(k.by) ?? 0) + 1);
  const sunk = new Set(result.sinkings.map((k) => k.id));
  const sea = new Map<number, number>();
  for (const h of result.seaHeld) {
    const team = Math.floor(h.id / TEAM);
    sea.set(team, (sea.get(team) ?? 0) + h.share);
  }
  const most = Math.max(0, ...sea.values());
  const holders = [...sea.values()].filter((x) => x === most).length;
  return Array.from({ length: teams }, (_, team) => {
    const ships = SHIPS.map((ship) => {
      const id = team * TEAM + ship,
        p = place.get(id) ?? teams * TEAM,
        sinkings = kills.get(id) ?? 0;
      return {
        place: p,
        points: placePoints(p) + rules.pointsPerSinking * sinkings,
        sinkings,
        podium: p <= 3,
      };
    });
    const mostSea = most > 0 && holders === 1 && sea.get(team) === most;
    return {
      points:
        ships.reduce((a, x) => a + x.points, 0) +
        (mostSea && rules.seaHeldPoint ? 1 : 0),
      ships,
      best: Math.min(...ships.map((x) => x.place)),
      sank: ships.reduce((a, x) => a + x.sinkings, 0),
      afloat: SHIPS.filter((ship) => !sunk.has(team * TEAM + ship)).length,
      mostSea,
      wins: ships.filter((x) => x.place === 1).length,
      podiums: ships.filter((x) => x.podium).length,
    };
  });
}

/** A person with a race added to their season's line of history. */
function logged(
  g: Person,
  line: {
    season: number;
    team: number;
    tier: number;
    place: number;
    points: number;
    sinkings: number;
  }
): Person {
  const last = g.history[g.history.length - 1];
  if (last && last.season === line.season && last.team === line.team) {
    const next = {
      ...last,
      races: last.races + 1,
      best: last.best === null ? line.place : Math.min(last.best, line.place),
      points: last.points + line.points,
      sinkings: last.sinkings + line.sinkings,
    };
    return { ...g, history: [...g.history.slice(0, -1), next] };
  }
  return {
    ...g,
    history: [
      ...g.history,
      {
        season: line.season,
        team: line.team,
        tier: line.tier,
        role: g.role,
        races: 1,
        best: line.place,
        points: line.points,
        sinkings: line.sinkings,
      },
    ],
  };
}

/** Every unfit person a race nearer fit; the player told of theirs. */
function healed(s: CareerState): CareerState {
  const unfit = s.people.filter((g) => g.unfit > 0);
  const fit = unfit.filter(
    (g) => g.unfit === 1 && g.contract?.team === mine(s)
  );
  return fit.reduce(
    (acc: CareerState, g) =>
      post(acc, {
        team: null,
        category: 'team',
        sender: null,
        kind: 'driverFit',
        slots: { person: g.id },
        links: [{ to: 'person', id: g.id }],
      }),
    withPeople(
      s,
      unfit.map((g) => ({ ...g, unfit: g.unfit - 1 }))
    )
  );
}

/** A state with a person's morale moved, and the player told if their person now asks to leave. */
function moved(s: CareerState, id: number, by: number): CareerState {
  const g = personAt(s, id);
  const morale = moraleIn(g.morale + by);
  const out = withPerson(s, { ...g, morale });
  return !wantsOut(g.morale) && wantsOut(morale) && g.contract?.team === mine(s)
    ? post(out, {
        team: g.contract.team,
        category: 'team',
        sender: id,
        kind: 'asksToLeave',
        slots: { person: id },
        links: [{ to: 'person', id }],
      })
    : out;
}

/** A team's race as the round's close reads it: where it stood on the card, who sailed, and what it came to. */
interface Raced {
  team: number;
  place: number;
  sailing: Sailing;
  race: TeamRace;
}

/** A championship's race as the round's close reads it. */
interface Closing {
  tier: number;
  teams: readonly number[];
  result: RaceResult;
}

/** A state after a race for one team's sailors: stand-ins paid, their records, grudges against the teams that sank them. */
function teamPeople(s: CareerState, x: Raced, of: Closing): CareerState {
  let out = s;
  const c = teamOf(s, x.team);
  const sunkBy = new Map(of.result.sinkings.map((k) => [k.id, k]));
  x.sailing.ships.forEach((a, ship) => {
    if (a.driver === null || a.forfeit) return;
    const id = a.driver,
      g = personAt(out, id);
    if (a.standIn) {
      const fee = Math.round(askWage(g, c.tier) * R.standIn);
      out = paid(out, x.team, fee, {
        kind: 'standIn',
        what: `${g.given} ${g.family} for the race`,
      });
      out = post(out, {
        team: x.team,
        category: 'team',
        sender: null,
        kind: 'standIn',
        slots: { person: id, wage: fee },
        links: [{ to: 'person', id }],
      });
    }
    const race = x.race.ships[ship];
    const killer = sunkBy.get(x.place * TEAM + ship)?.by ?? null;
    const told = logged(g, {
      season: out.season,
      team: x.team,
      tier: c.tier,
      place: race?.place ?? of.teams.length * TEAM,
      points: race?.points ?? 0,
      sinkings: race?.sinkings ?? 0,
    });
    out = withPerson(
      out,
      killer === null
        ? told
        : { ...told, grudge: of.teams[Math.floor(killer / TEAM)] ?? null }
    );
  });
  return out;
}

/**
 * Injuries for every driver of a championship whose ship was sunk (a forfeit
 * is no injury), and a relapse for one who sailed unfit by a dilemma's answer.
 */
function injuries(
  s: CareerState,
  of: Closing,
  all: readonly Sailing[],
  roll: Dice
): CareerState {
  const rand = roll.roll('injury');
  const sunk = new Set(
    of.result.sinkings.filter((k) => k.cause !== 'forfeit').map((k) => k.id)
  );
  let out = s;
  of.teams.forEach((team, place) =>
    all[team]?.ships.forEach((a, ship) => {
      const id = a.driver;
      if (id === null) return;
      let races = sunk.has(place * TEAM + ship) ? injury(rand) : 0;
      if (today(out, `pushed:${id}`) && rand() < TUNING.dilemmas.relapse)
        races = Math.max(races, TUNING.dilemmas.relapseRaces);
      if (races <= 0) return;
      const g = personAt(out, id);
      out = withPerson(out, { ...g, unfit: Math.max(g.unfit, races) });
      if (g.contract && g.contract.team === mine(out))
        out = post(out, {
          team: g.contract.team,
          category: 'team',
          sender: null,
          kind: 'driverUnfit',
          slots: { person: id, races },
          links: [{ to: 'person', id }],
        });
    })
  );
  return out;
}

const mean = (xs: readonly number[], none: number): number =>
  xs.length === 0 ? none : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Morale, bonds and the pit crew's fatigue after a race, for one team. The pit
 * crew tire only if they worked: a ship of theirs made a stop.
 */
function spirits(s: CareerState, x: Raced, of: Closing): CareerState {
  const c = teamOf(s, x.team);
  const standing = standingOf(s, x.team);
  const sailed = new Set(x.sailing.ships.map((a) => a.driver));
  const levels = c.bonds.map(bondLevel);
  const mechanics = mechanicsOf(s, c);
  const led = mechanics.flatMap((m) => (m ? [m.leadership] : []));
  const lead = mean(led.map(leadershipMorale), 0);
  let out = s;
  for (const id of staffOf(c)) {
    const g = personAt(out, id);
    if (g.player || g.role === 'chairman' || g.role === 'manager') continue;
    let by = resultMove(c.target, standing) + modifier(g.traits, null).morale;
    if (g.contract) by += wageMove(g.contract.wage, askWage(g, c.tier));
    if (g.role === 'driver')
      by += statusMove(g.wants.includes('status'), sailed.has(id));
    c.staff.ships.forEach((h, k) => {
      if (h.mechanic === id || h.driver === id) by += bondMove(levels[k] ?? 0);
    });
    if (g.role === 'pit') by += lead;
    out = moved(out, id, by);
  }
  const bonds = c.staff.ships.map((h, k) => {
    const m = mechanics[k],
      bond = c.bonds[k] ?? 0;
    return m && h.driver !== null
      ? Math.round((bond + bondGain(m.chemistry)) * 100) / 100
      : bond;
  });
  out = withTeam(out, { ...teamOf(out, x.team), bonds });
  const worked = of.result.pits.some(
    (p) => Math.floor(p.id / TEAM) === x.place
  );
  if (!worked) return out;
  const house = c.buildings.pitHouse.level;
  const tires = mean(led.map(leadershipFatigue), 1);
  return withPeople(
    out,
    c.staff.pit.flatMap((id) => {
      const g = out.people[id];
      if (!g || !hasRole(g, 'pit')) return [];
      const gained = fatigueGained(effective(g, null).stamina) * tires;
      const fatigue = fatigueOn(g, out.day, house) + gained;
      return [
        {
          ...g,
          fatigue: Math.min(100, Math.round(fatigue * 10) / 10),
          fatigueDay: out.day,
        },
      ];
    })
  );
}

/** Who sailed each ship of a team for the drivers' table: her driver, and the player on their own. */
const sailorOf = (s: CareerState, x: Raced, ship: number): number | null => {
  const a = x.sailing.ships[ship];
  if (!a || a.forfeit) return null;
  return (
    a.driver ?? (teamOf(s, x.team).player ? (s.player?.person ?? null) : null)
  );
};

/** A championship's two tables after a race: the teams', and the drivers' (each ship's points to who sailed her). */
function stood(
  s: CareerState,
  of: Closing,
  raced: readonly Raced[]
): CareerState {
  const l = championshipOf(s, of.tier);
  const by = new Map(raced.map((x) => [x.team, x.race]));
  const standings = l.standings.map((x): Standing => {
    const r = by.get(x.team);
    return r
      ? {
          ...x,
          points: x.points + r.points,
          wins: x.wins + r.wins,
          podiums: x.podiums + r.podiums,
          sinkings: x.sinkings + r.sank,
        }
      : x;
  });
  const drivers = new Map(l.drivers.map((d) => [d.person, d]));
  for (const x of raced)
    x.race.ships.forEach((r, ship) => {
      const person = sailorOf(s, x, ship);
      if (person === null) return;
      const was: DriverStanding = drivers.get(person) ?? {
        person,
        team: x.team,
        points: 0,
        wins: 0,
        podiums: 0,
        sinkings: 0,
      };
      drivers.set(person, {
        person,
        team: x.team,
        points: was.points + r.points,
        wins: was.wins + (r.place === 1 ? 1 : 0),
        podiums: was.podiums + (r.podium ? 1 : 0),
        sinkings: was.sinkings + r.sinkings,
      });
    });
  return {
    ...s,
    championships: s.championships.map((c) =>
      c.id === of.tier ? { ...l, standings, drivers: [...drivers.values()] } : c
    ),
  };
}

/** A state after a race for one team: its people, its parts and its money. */
function teamClosed(s: CareerState, x: Raced, of: Closing): CareerState {
  let out = teamPeople(s, x, of);
  out = spirits(out, x, of);
  out = partsAfterRace(
    out,
    x.team,
    x.sailing.ships.map((a, ship) =>
      a.forfeit ? null : x.place * TEAM + ship
    ),
    of.result
  );
  out = bonusesPaid(
    out,
    x.team,
    x.sailing.ships.flatMap((a, ship) => {
      const r = x.race.ships[ship];
      return a.driver === null || a.forfeit || !r
        ? []
        : [{ person: a.driver, podium: r.podium, sinkings: r.sinkings }];
    })
  );
  out = raceMoney(out, x.team);
  out = sponsorsAfterRace(
    out,
    x.team,
    {
      best: x.race.best,
      sinkings: x.race.sank,
      afloat: x.race.afloat,
      mostSea: x.race.mostSea,
    },
    x.sailing.objectives
  );
  return marketabilityAfterRace(out, x.team, x.race.ships);
}

/** A state with one championship's race closed. */
function tierClosed(
  s: CareerState,
  of: Closing,
  all: readonly Sailing[],
  roll: Dice
): CareerState {
  const races = tally(
    of.result,
    of.teams.length,
    championshipOf(s, of.tier).rules
  );
  const raced = of.teams.flatMap((team, place): Raced[] => {
    const sailing = all[team],
      race = races[place];
    return sailing && race ? [{ team, place, sailing, race }] : [];
  });
  const pointsOf = (team: number) =>
    raced.find((x) => x.team === team)?.race.points ?? 0;
  let out = stood(s, of, raced);
  out = injuries(out, of, all, roll);
  for (const x of raced) out = teamClosed(out, x, of);
  out = inspected(out, of.tier, pointsOf, roll).state;
  const first = raced[0];
  const hers =
    first && first.team === mine(out) ? (first.race.ships[0] ?? null) : null;
  out = reputationAfterRace(out, of.tier, pointsOf, hers);
  for (const team of of.teams) out = afterRace(out, team, roll);
  return told(out, of, raced);
}

/** The player's mail of a championship's race: their own result, or the others' podium. */
function told(
  s: CareerState,
  of: Closing,
  raced: readonly Raced[]
): CareerState {
  const me = mine(s);
  if (me === null) return s;
  const own = raced.find((x) => x.team === me);
  if (own)
    return post(s, {
      team: me,
      category: 'tier',
      sender: null,
      kind: 'raceResult',
      slots: {
        tier: of.tier,
        place: own.race.best,
        points: own.race.points,
        standing: standingOf(s, me),
      },
      links: [{ to: 'screen', id: 'standings' }],
    });
  const top = of.result.order
    .slice(0, 3)
    .map((id) => of.teams[Math.floor(id / TEAM)] ?? -1);
  return post(s, {
    team: null,
    category: 'tier',
    sender: null,
    kind: 'roundResults',
    slots: {
      tier: of.tier,
      first: top[0] ?? -1,
      second: top[1] ?? -1,
      third: top[2] ?? -1,
    },
    links: [{ to: 'screen', id: 'standings' }],
  });
}

/** A state with the round closed: every championship's race, then the race day over and the next round next. */
export function roundClosed(s: CareerState, roll: Dice): CareerState {
  const day = s.race;
  if (!day) return s;
  const all = lineups(s);
  let out = healed(s);
  for (const l of s.championships) {
    const result = day.results[l.id];
    if (result)
      out = tierClosed(
        out,
        { tier: l.id, teams: grid(s, l.id), result },
        all,
        roll
      );
  }
  return flagsCleared({ ...out, race: null, round: day.round + 1 });
}
