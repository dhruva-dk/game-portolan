// The round's race cards: one RaceCard a championship, built from the career's
// state on race day. The career never reads the sim: a card is the whole of
// what a race is told.
//
// Ships by team (career/lineup.ts grid): the ships of the team in place k are
// TEAM × k … TEAM × k + TEAM − 1, in the team's own order. Each ship's parts as
// fitted; her Driver's stats effective (morale and traits in the race's
// setting), then form (a shift drawn for the race by Consistency); her PitCrew
// from her mechanic, the team's pit crew (fatigue as of today) and the bond;
// her call the team's. The race's storm is the championship's rules' pace × the
// planet's.

import {
  STATS,
  TEAM,
  type Driver,
  type DriverStats,
  type PitCrew,
  type RaceCard,
  type RaceShip,
  type Rules,
  type Stat,
} from '../race.ts';
import { SHIPS, type Ship } from '../office/command.ts';
import { endDay } from './contracts.ts';
import { effective } from './effective.ts';
import { today } from './flags.ts';
import { formShift, shifted } from './form.ts';
import { grid, lineups, raceRand, type Sailing } from './lineup.ts';
import { fittedParts } from './parts.ts';
import { fatigueOn, pitCrew, type Member } from './pit.ts';
import { hasRole, inRole, type PersonOf } from './roles.ts';
import { age } from './stars.ts';
import {
  championshipOf,
  teamOf,
  type CareerState,
  type Team,
} from './state.ts';
import type { Setting } from './traits.ts';
import { TUNING } from './tuning.ts';

const D = TUNING.dilemmas;

/** The rules a championship's race is sailed under today: its rules, the storm at the planet's pace. */
function raceRules(s: CareerState, tier: number): Rules {
  const r = championshipOf(s, tier).rules;
  const pace = s.calendar?.rounds[s.round]?.planet.pace ?? 1;
  return { ...r, storm: Math.round(r.storm * pace * 1000) / 1000 };
}

/** What a driver's traits read in a championship's race today. */
function settingOf(
  s: CareerState,
  g: PersonOf<'driver'>,
  tier: number,
  teams: readonly number[]
): Setting {
  const rules = raceRules(s, tier);
  const days =
    g.contract && g.contract.ends !== null
      ? endDay(s, g.contract) - s.day
      : null;
  return {
    pace: rules.storm,
    round: s.round,
    rules,
    grid: teams,
    grudge: g.grudge,
    daysLeft: days,
    age: age(g, s.day),
    tier,
  };
}

/** A driver as she sails today: effective in the setting, her form drawn, a dilemma's cost taken. */
function driverOf(
  s: CareerState,
  person: number,
  c: Team,
  teams: readonly number[]
): Driver {
  const g = inRole(s.people[person], 'driver');
  const base = effective(g, settingOf(s, g, c.tier, teams));
  let stats = shifted(base, formShift(base.consistency, raceRand(s, person)));
  const less = (stat: 'consistency' | 'stamina', by: number) => {
    stats = { ...stats, [stat]: Math.max(0, stats[stat] - by) };
  };
  if (today(s, `pushed:${person}`)) less('stamina', D.stamina);
  if (c.staff.ships[1]?.driver === person && today(s, `guest:${c.id}`))
    less('consistency', D.guest);
  return { seed: g.seed, persona: g.persona ?? 'hunter', stats };
}

/** A team's pit crew today: each member's effective stats and fatigue, a dilemma's rest, push or cover taken. */
function membersOf(s: CareerState, c: Team): Member[] {
  const house = c.buildings.pitHouse.level;
  return c.staff.pit.flatMap((id) => {
    const g = s.people[id];
    if (!g || !hasRole(g, 'pit')) return [];
    const rested = today(s, `rest:${id}`);
    return [
      {
        stats: effective(g, null),
        fatigue:
          rested || today(s, `cover:${id}`) ? 0 : fatigueOn(g, s.day, house),
        rested,
        pushed: today(s, `push:${id}`),
      },
    ];
  });
}

/** A ship's pit today: her mechanic, the team's pit crew, the bond. */
export function pitOf(s: CareerState, c: Team, ship: Ship): PitCrew {
  const m = c.staff.ships[ship]?.mechanic ?? null;
  const g = m === null ? undefined : s.people[m];
  return pitCrew({
    mechanic: g && hasRole(g, 'mechanic') ? effective(g, null) : null,
    members: membersOf(s, c),
    bond: c.bonds[ship] ?? 0,
  });
}

/** A ship of a team on the card. */
function shipOf(
  s: CareerState,
  c: Team,
  ship: Ship,
  at: { place: number; sailing: Sailing; teams: readonly number[] }
): RaceShip {
  const a = at.sailing.ships[ship];
  const forfeit =
    !a || a.forfeit || (ship === 0 && c.player && today(s, `forfeit:${c.id}`));
  return {
    id: at.place * TEAM + ship,
    team: at.place,
    colours: c.colours,
    parts: fittedParts(c, ship),
    driver: a && a.driver !== null ? driverOf(s, a.driver, c, at.teams) : null,
    pit: pitOf(s, c, ship),
    call: at.sailing.call,
    forfeit,
  };
}

/**
 * A card's drivers read against their field: each stat as far from ten as it
 * is from the field's mean, × TUNING.race.field (kept to 0…20). The sim leans
 * a driver by her stat's distance from ten, and a championship's drivers lie
 * within a point or two of one another: read so, the better crew is the better
 * ship, whatever the championship's level.
 */
function fielded(ships: readonly RaceShip[]): RaceShip[] {
  const driven = ships.flatMap((h) => (h.driver ? [h.driver.stats] : []));
  if (driven.length === 0) return [...ships];
  const mean = (stat: Stat) =>
    driven.reduce((a, d) => a + d[stat], 0) / driven.length;
  const means = new Map(STATS.map((stat) => [stat, mean(stat)]));
  const read = (stats: DriverStats): DriverStats => {
    const out: Record<Stat, number> = { ...stats };
    for (const stat of STATS)
      out[stat] = Math.min(
        20,
        Math.max(
          0,
          10 + TUNING.race.field * (stats[stat] - (means.get(stat) ?? 10))
        )
      );
    return out;
  };
  return ships.map((h) =>
    h.driver
      ? { ...h, driver: { ...h.driver, stats: read(h.driver.stats) } }
      : h
  );
}

/** The race's seed for a championship today. */
const raceSeed = (s: CareerState, tier: number): number =>
  Math.floor(raceRand(s, 200000 + tier)() * 4294967296) >>> 0;

/** A championship's card today (race day), given the lineups. */
function cardOf(
  s: CareerState,
  tier: number,
  all: readonly Sailing[]
): RaceCard {
  const teams = grid(s, tier);
  const ships = teams.flatMap((team, place) => {
    const sailing = all[team];
    return sailing
      ? SHIPS.map((ship) =>
          shipOf(s, teamOf(s, team), ship, { place, sailing, teams })
        )
      : [];
  });
  return {
    seed: raceSeed(s, tier),
    tier,
    round: s.round,
    rules: raceRules(s, tier),
    ships: fielded(ships),
  };
}

/** The round's three cards (race day), or none on another day. */
export function raceCards(s: CareerState): RaceCard[] {
  if (s.race === null) return [];
  const all = lineups(s);
  return s.championships.map((l) => cardOf(s, l.id, all));
}
