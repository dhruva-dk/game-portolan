// The round's close (Phase B section 13): once the three championships' results are in, each tier in turn has its points
// (D20 under its rules) and standings; then, team by team, its stand-ins paid, injuries, the drivers' records, morale,
// bonds, the pit crew's fatigue, its parts' wear and Feedback, its bonuses, the race's money, its sponsors' objectives and
// its sailors' marketability; then the tier's inspection, reputations and the chairmen' confidence; and mail. The
// round then ends: the race day is over, the next round is next, and the dilemmas are drawn (career/dilemmas.ts).

import type { RaceResult } from '../race.ts';
import { askWage } from './asks.ts';
import { paid } from './balance.ts';
import type { Dice } from './dice.ts';
import { effective } from './effective.ts';
import { afterRace, standingOf } from './chairmen.ts';
import { flagsCleared, today } from './flags.ts';
import { inspected } from './inspection.ts';
import { leadershipFatigue, leadershipMorale } from './service.ts';
import { lineups, sides, type Sailing } from './lineup.ts';
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
import { sponsorsAfterRace } from './sponsors.ts';
import { mine, post } from './post.ts';
import {
  marketabilityAfterRace,
  reputationAfterRace,
  type ShipRace,
} from './reputation.ts';
import type { Person, PersonOf } from './roles.ts';
import { bondGain, bondLevel, fatigueGained, fatigueOn } from './service.ts';
import { staffOf, type CareerState, type Standing } from './state.ts';
import { modifier } from './traits.ts';
import { TUNING } from './tuning.ts';

const R = TUNING.race;

/** A place's points (1 first): D20's 25, 22, 20, 18, 16, then 21 − place to the 20th, then none. */
export const placePoints = (place: number): number =>
  place <= R.top.length
    ? R.top[place - 1]
    : place <= R.last
      ? R.last + 1 - place
      : 0;

/** What a team's race came to: its points, its two ships' (null: forfeit before the start), its best place, ships
 *  sunk by it, ships afloat at the end, and whether it held the most sea. */
export interface TeamRace {
  points: number;
  ships: readonly [ShipRace | null, ShipRace | null];
  best: number;
  sank: number;
  afloat: number;
  mostSea: boolean;
  wins: number;
  podiums: number;
}

/** A tier's result read by side (career/lineup.ts sides). */
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
  const sea = Array.from({ length: teams }, () => 0);
  for (const h of result.seaHeld)
    if (h.id >> 1 < teams) sea[h.id >> 1] += h.share;
  const most = sea.reduce((b, x, i) => (x > sea[b] ? i : b), 0);
  return Array.from({ length: teams }, (_, side) => {
    const ships = ([0, 1] as const).map((ship): ShipRace => {
      const id = side * 2 + ship,
        p = place.get(id) ?? teams * 2;
      return {
        points: placePoints(p) + rules.pointsPerSinking * (kills.get(id) ?? 0),
        sinkings: kills.get(id) ?? 0,
        podium: p <= 3,
      };
    });
    const places = [0, 1].map(
      (ship) => place.get(side * 2 + ship) ?? teams * 2
    );
    const mostSea = sea[most] > 0 && most === side;
    return {
      points:
        ships[0].points +
        ships[1].points +
        (mostSea && rules.seaHeldPoint ? 1 : 0),
      ships: [ships[0], ships[1]],
      best: Math.min(...places),
      sank: ships[0].sinkings + ships[1].sinkings,
      afloat: [0, 1].filter((ship) => !sunk.has(side * 2 + ship)).length,
      mostSea,
      wins: places.filter((p) => p === 1).length,
      podiums: places.filter((p) => p <= 3).length,
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
  const people = [...s.people];
  const fit: number[] = [];
  for (const g of s.people) {
    if (g.unfit <= 0) continue;
    people[g.id] = { ...g, unfit: g.unfit - 1 };
    if (g.unfit === 1 && g.contract?.team === mine(s)) fit.push(g.id);
  }
  return fit.reduce(
    (acc: CareerState, id) =>
      post(acc, {
        team: null,
        category: 'team',
        sender: null,
        kind: 'driverFit',
        slots: { person: id },
        links: [{ to: 'person', id }],
      }),
    { ...s, people }
  );
}

/** A state with a person's morale moved, and the player told if their person now asks to leave. */
function moved(s: CareerState, id: number, by: number): CareerState {
  const g = s.people[id];
  const morale = moraleIn(g.morale + by);
  const people = [...s.people];
  people[id] = { ...g, morale };
  const out = { ...s, people };
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

/** A state after a race for one team's sailors: stand-ins paid, their records, grudges against the teams that sank them. */
function teamPeople(
  s: CareerState,
  team: number,
  sailing: Sailing,
  ctx: {
    race: TeamRace;
    result: RaceResult;
    side: number;
    grid: readonly number[];
  }
): CareerState {
  let out = s;
  const c = s.teams[team];
  const sunkBy = new Map(ctx.result.sinkings.map((k) => [k.id, k]));
  const place = new Map(ctx.result.order.map((id, i) => [id, i + 1]));
  ([0, 1] as const).forEach((ship) => {
    const a = sailing.ships[ship];
    if (a.driver === null || a.forfeit) return;
    const id = a.driver;
    if (a.standIn) {
      const g = out.people[id];
      const fee = Math.round(askWage(g, c.tier) * R.standIn);
      out = paid(out, team, fee, {
        kind: 'standIn',
        what: `${g.given} ${g.family} for the race`,
      });
      out = post(out, {
        team,
        category: 'team',
        sender: null,
        kind: 'standIn',
        slots: { person: id, wage: fee },
        links: [{ to: 'person', id }],
      });
    }
    const race = ctx.race.ships[ship];
    const killer = sunkBy.get(ctx.side * 2 + ship)?.by ?? null;
    const people = [...out.people];
    const g = logged(people[id], {
      season: out.season,
      team,
      tier: c.tier,
      place: place.get(ctx.side * 2 + ship) ?? 80,
      points: race?.points ?? 0,
      sinkings: race?.sinkings ?? 0,
    });
    people[id] =
      killer === null ? g : { ...g, grudge: ctx.grid[killer >> 1] ?? null };
    out = { ...out, people };
  });
  return out;
}

/** Injuries for every driver of a tier whose ship was sunk (a forfeit is no injury), and a relapse for one who sailed
 *  unfit by a dilemma's answer. */
function injuries(
  s: CareerState,
  tier: {
    all: readonly Sailing[];
    grid: readonly number[];
    result: RaceResult;
  },
  roll: Dice
): CareerState {
  const rand = roll.roll('injury');
  const sunk = new Set(
    tier.result.sinkings.filter((k) => k.cause !== 'forfeit').map((k) => k.id)
  );
  let out = s;
  tier.grid.forEach((team, side) =>
    ([0, 1] as const).forEach((ship) => {
      const id = tier.all[team].ships[ship].driver;
      if (id === null) return;
      let races = sunk.has(side * 2 + ship) ? injury(rand) : 0;
      if (today(out, `pushed:${id}`) && rand() < TUNING.dilemmas.relapse)
        races = Math.max(races, TUNING.dilemmas.relapseRaces);
      if (races <= 0) return;
      const people = [...out.people];
      people[id] = { ...people[id], unfit: Math.max(people[id].unfit, races) };
      out = { ...out, people };
      const k = people[id].contract;
      if (k && k.team === mine(out))
        out = post(out, {
          team: k.team,
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

/** Morale, bonds and the pit crew's fatigue after a race, for one team. */
function spirits(s: CareerState, team: number, sailing: Sailing): CareerState {
  const c = s.teams[team];
  const standing = standingOf(s, team);
  const sailed = new Set(
    sailing.ships.map((a) => a.driver).filter((x): x is number => x !== null)
  );
  const levels = c.bonds.map(bondLevel);
  const mechanics = c.staff.ships.map((h) =>
    h.mechanic === null
      ? null
      : effective(s.people[h.mechanic] as PersonOf<'mechanic'>, null)
  );
  const lead = mechanics.reduce(
    (a, b) => a + (b ? leadershipMorale(b.leadership) / 2 : 0),
    0
  );
  let out = s;
  for (const id of staffOf(c)) {
    const g = out.people[id];
    if (g.player || g.role === 'chairman' || g.role === 'manager') continue;
    let by = resultMove(c.target, standing) + modifier(g.traits, null).morale;
    if (g.contract) by += wageMove(g.contract.wage, askWage(g, c.tier));
    if (g.role === 'driver')
      by += statusMove(g.wants.includes('status'), sailed.has(id));
    c.staff.ships.forEach((h, k) => {
      if (h.mechanic === id || h.driver === id) by += bondMove(levels[k]);
    });
    if (g.role === 'pit') by += lead;
    out = moved(out, id, by);
  }
  const bonds = c.staff.ships.map((h, k) =>
    h.mechanic !== null && h.driver !== null && mechanics[k]
      ? Math.round((c.bonds[k] + bondGain(mechanics[k]!.chemistry)) * 100) / 100
      : c.bonds[k]
  );
  const people = [...out.people];
  const loft = c.buildings.pitHouse.level;
  // the pit crew serves both ships: the leading mechanic's Leadership (ship one's, else ship two's) sets how it tires
  const leader = mechanics[0] ?? mechanics[1];
  const tires = leader ? leadershipFatigue(leader.leadership) : 1;
  for (const id of c.staff.pit) {
    const g = people[id] as PersonOf<'pit'>;
    people[id] = {
      ...g,
      fatigue: Math.min(
        100,
        Math.round(
          (fatigueOn(g, out.day, loft) +
            fatigueGained(effective(g, null).stamina) * tires) *
            10
        ) / 10
      ),
      fatigueDay: out.day,
    };
  }
  const teams = [...out.teams];
  teams[team] = { ...out.teams[team], bonds: [bonds[0], bonds[1]] };
  return { ...out, people, teams };
}

/** A tier's standings after a race. */
function stood(
  s: CareerState,
  tier: number,
  grid: readonly number[],
  races: readonly TeamRace[]
): CareerState {
  const by = new Map(grid.map((team, side) => [team, races[side]]));
  const standings = s.championships[tier].standings.map((x): Standing => {
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
  const championships = [...s.championships];
  championships[tier] = { ...s.championships[tier], standings };
  return { ...s, championships };
}

/** A state with one tier's race closed. */
function tierClosed(
  s: CareerState,
  tier: number,
  all: readonly Sailing[],
  roll: Dice
): CareerState {
  const result = s.race!.results[tier]!;
  const grid = sides(s, tier);
  const l = s.championships[tier];
  const races = tally(result, grid.length, l.rules);
  const pointsOf = (team: number) => races[grid.indexOf(team)]?.points ?? 0;
  let out = stood(s, tier, grid, races);
  out = injuries(out, { all, grid, result }, roll);
  grid.forEach((team, side) => {
    const r = races[side],
      sailing = all[team];
    out = teamPeople(out, team, sailing, { race: r, result, side, grid });
    out = spirits(out, team, sailing);
    const ids = ([0, 1] as const).map((ship) =>
      sailing.ships[ship].forfeit ? null : side * 2 + ship
    );
    out = partsAfterRace(out, team, [ids[0], ids[1]], result);
    const earned = ([0, 1] as const).flatMap((ship) => {
      const id = sailing.ships[ship].driver;
      return id === null || !r.ships[ship]
        ? []
        : [
            {
              person: id,
              podium: r.ships[ship]!.podium,
              sinkings: r.ships[ship]!.sinkings,
            },
          ];
    });
    out = bonusesPaid(out, team, earned);
    out = raceMoney(out, team);
    out = sponsorsAfterRace(
      out,
      team,
      { best: r.best, sinkings: r.sank, afloat: r.afloat, mostSea: r.mostSea },
      sailing.objectives
    );
    out = marketabilityAfterRace(out, team, r.ships);
  });
  out = inspected(out, tier, pointsOf, roll).state;
  const me = mine(out);
  const myShip = me !== null && grid[0] === me ? races[0].ships[0] : null;
  out = reputationAfterRace(out, tier, pointsOf, myShip);
  for (const team of grid) out = afterRace(out, team, roll);
  return told(out, tier, { grid, races, result });
}

/** The player's mail of a tier's race: their own result, or the others' podium. */
function told(
  s: CareerState,
  tier: number,
  ctx: {
    grid: readonly number[];
    races: readonly TeamRace[];
    result: RaceResult;
  }
): CareerState {
  const me = mine(s);
  if (me === null) return s;
  if (ctx.grid[0] === me && s.teams[me].tier === tier) {
    const r = ctx.races[0];
    return post(s, {
      team: me,
      category: 'tier',
      sender: null,
      kind: 'raceResult',
      slots: {
        tier,
        place: r.best,
        points: r.points,
        standing: standingOf(s, me),
      },
      links: [{ to: 'screen', id: 'standings' }],
    });
  }
  const top = ctx.result.order.slice(0, 3).map((id) => ctx.grid[id >> 1]);
  return post(s, {
    team: null,
    category: 'tier',
    sender: null,
    kind: 'roundResults',
    slots: { tier, first: top[0], second: top[1], third: top[2] },
    links: [{ to: 'screen', id: 'standings' }],
  });
}

/** A state with the round closed: every tier's race, then the race day over and the next round next. */
export function roundClosed(s: CareerState, roll: Dice): CareerState {
  const all = lineups(s);
  let out = healed(s);
  for (const l of s.championships) out = tierClosed(out, l.id, all, roll);
  return flagsCleared({ ...out, race: null, round: s.race!.round + 1 });
}
