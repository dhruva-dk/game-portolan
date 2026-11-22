// The round's race cards (Phase B section 13): one RaceCard a tier, built from the career's state on race day. The
// spec ship's Handling is handed in by whoever runs the race (play/, tools/): the career never reads the sim.
//
// Ships by side (career/lineup.ts sides): side k's ships are 2k (ship one) and 2k + 1 (ship two). Each ship's Handling
// and Fitted from her fitted parts; her Driver's stats effective (morale and traits in the race's setting), then form
// (a shift drawn for the race by Consistency); her Service from her mechanic, the pit crew (fatigue as of today) and the
// bond; her stance from the plan. The race's storm is the tier's rules' pace × the planet's.

import type {
  Driver,
  Handling,
  RaceCard,
  RaceShip,
  Rules,
  Service,
} from '../race.ts';
import { endDay } from './contracts.ts';
import { driverStats, effective } from './effective.ts';
import { today } from './flags.ts';
import { formShift, shifted } from './form.ts';
import {
  lineups,
  raceRand,
  sides,
  type Aboard,
  type Sailing,
} from './lineup.ts';
import { fittedOf, handlingFrom, shipParts } from './parts.ts';
import type { PersonOf } from './roles.ts';
import { fatigueOn, service } from './service.ts';
import { age } from './stars.ts';
import type { CareerState, Team } from './state.ts';
import type { Setting } from './traits.ts';
import { TUNING } from './tuning.ts';

const D = TUNING.dilemmas;

/** The rules a tier's race is sailed under today: its rules, the storm at the planet's pace. */
export function raceRules(s: CareerState, tier: number): Rules {
  const r = s.championships[tier].rules;
  const pace = s.calendar?.rounds[s.round]?.planet.pace ?? 1;
  return {
    ...r,
    storm: { pace: Math.round(r.storm.pace * pace * 1000) / 1000 },
  };
}

/** What a driver's traits read in a tier's race today. */
function settingOf(
  s: CareerState,
  g: PersonOf<'driver'>,
  tier: number,
  grid: readonly number[]
): Setting {
  const rules = raceRules(s, tier);
  const days =
    g.contract && g.contract.ends !== null
      ? endDay(s, g.contract) - s.day
      : null;
  return {
    pace: rules.storm.pace,
    round: s.round,
    rules,
    grid,
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
  team: Team,
  grid: readonly number[]
): Driver {
  const g = s.people[person] as PersonOf<'driver'>;
  const base = driverStats(g, settingOf(s, g, team.tier, grid));
  let stats = shifted(base, formShift(base.consistency, raceRand(s, person)));
  const less = (stat: 'consistency' | 'stamina', by: number) => {
    stats = { ...stats, [stat]: Math.max(0, stats[stat] - by) };
  };
  if (today(s, `pushed:${person}`)) less('stamina', D.stamina);
  if (team.staff.ships[1].driver === person && today(s, `guest:${team.id}`))
    less('consistency', D.guest);
  return { stats, persona: g.persona ?? 'hunter', seed: g.seed };
}

/** A ship's service today: her mechanic, the pit crew by job (a dilemma's rest, push or cover taken), the bond. */
function serviceOf(
  s: CareerState,
  c: Team,
  ship: 0 | 1,
  sailing: Sailing
): Service {
  const b = c.staff.ships[ship].mechanic;
  const loft = c.buildings.pitHouse.level;
  const pit = c.staff.pit.map((id) => {
    const g = s.people[id] as PersonOf<'pit'>;
    const fresh = today(s, `rest:${id}`) || today(s, `cover:${id}`);
    return {
      job: g.job ?? 'mend',
      stats: effective(g, null),
      fatigue: fresh ? 0 : fatigueOn(g, s.day, loft),
    };
  });
  const out = service({
    mechanic:
      b === null ? null : effective(s.people[b] as PersonOf<'mechanic'>, null),
    pit,
    order: sailing.order,
    bond: c.bonds[ship],
  });
  const rate = { ...out.rate },
    botch = { ...out.botch };
  for (const id of c.staff.pit) {
    const job = s.people[id].job;
    if (job === null) continue;
    if (today(s, `rest:${id}`)) rate[job] *= D.rest;
    if (today(s, `push:${id}`)) botch[job] = Math.min(1, botch[job] + D.push);
  }
  return { ...out, rate, botch };
}

/** A ship of a team on the card. */
function shipOf(
  s: CareerState,
  c: Team,
  side: number,
  ship: 0 | 1,
  ctx: { spec: Handling; sailing: Sailing; grid: readonly number[] }
): RaceShip {
  const parts = shipParts(c, ship);
  const a: Aboard = ctx.sailing.ships[ship];
  const forfeit =
    a.forfeit || (ship === 0 && c.player && today(s, `forfeit:${c.id}`));
  return {
    id: side * 2 + ship,
    side,
    colours: c.colours,
    handling: handlingFrom(ctx.spec, parts),
    parts: parts.map(fittedOf),
    driver: a.driver === null ? null : driverOf(s, a.driver, c, ctx.grid),
    service: serviceOf(s, c, ship, ctx.sailing),
    stance: ctx.sailing.stance,
    forfeit,
  };
}

/** The race's seed for a tier today. */
export const raceSeed = (s: CareerState, tier: number): number =>
  Math.floor(raceRand(s, 200000 + tier)() * 4294967296) >>> 0;

/** A tier's card today (race day), given the lineups. */
export function cardOf(
  s: CareerState,
  tier: number,
  spec: Handling,
  all: readonly Sailing[]
): RaceCard {
  const grid = sides(s, tier);
  const ships = grid.flatMap((team, side) =>
    ([0, 1] as const).map((ship) =>
      shipOf(s, s.teams[team], side, ship, { spec, sailing: all[team], grid })
    )
  );
  return {
    seed: raceSeed(s, tier),
    tier,
    round: s.round,
    rules: raceRules(s, tier),
    ships,
  };
}

/** The round's three cards (race day), or none on another day. */
export function raceCards(s: CareerState, spec: Handling): RaceCard[] {
  if (s.race === null) return [];
  const all = lineups(s);
  return s.championships.map((l) => cardOf(s, l.id, spec, all));
}
