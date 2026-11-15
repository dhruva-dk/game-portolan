// The round's race cards (Phase B section 13): one RaceCard a league, built from the career's state on race day. The
// spec ship's Handling is handed in by whoever runs the race (play/, tools/): the career never reads the sim.
//
// Ships by side (career/lineup.ts sides): side k's ships are 2k (ship one) and 2k + 1 (ship two). Each ship's Handling
// and Fitted from her fitted parts; her Captain's stats effective (morale and traits in the race's setting), then form
// (a shift drawn for the race by Consistency); her Service from her bosun, the flight (fatigue as of today) and the
// bond; her stance from the plan. The race's storm is the league's rules' pace × the planet's.

import type { Captain, Handling, RaceCard, RaceShip, Rules, Service } from '../race.ts';
import { endDay } from './contracts.ts';
import { captainStats, effective } from './effective.ts';
import { today } from './flags.ts';
import { formShift, shifted } from './form.ts';
import { lineups, raceRand, sides, type Aboard, type Sailing } from './lineup.ts';
import { fittedOf, handlingFrom, shipParts } from './parts.ts';
import type { GullOf } from './roles.ts';
import { fatigueOn, service } from './service.ts';
import { age } from './stars.ts';
import type { CareerState, Crew } from './state.ts';
import type { Setting } from './traits.ts';
import { TUNING } from './tuning.ts';

const D = TUNING.dilemmas;

/** The rules a league's race is sailed under today: its rules, the storm at the planet's pace. */
export function raceRules(s: CareerState, league: number): Rules {
  const r = s.leagues[league].rules;
  const pace = s.calendar?.rounds[s.round]?.planet.pace ?? 1;
  return { ...r, storm: { pace: Math.round(r.storm.pace * pace * 1000) / 1000 } };
}

/** What a captain's traits read in a league's race today. */
function settingOf(s: CareerState, g: GullOf<'captain'>, league: number, grid: readonly number[]): Setting {
  const rules = raceRules(s, league);
  const days = g.contract && g.contract.ends !== null ? endDay(s, g.contract) - s.day : null;
  return { pace: rules.storm.pace, round: s.round, rules, grid, grudge: g.grudge, daysLeft: days, age: age(g, s.day), league };
}

/** A captain as she sails today: effective in the setting, her form drawn, a dilemma's cost taken. */
function captainOf(s: CareerState, gull: number, crew: Crew, grid: readonly number[]): Captain {
  const g = s.gulls[gull] as GullOf<'captain'>;
  const base = captainStats(g, settingOf(s, g, crew.league, grid));
  let stats = shifted(base, formShift(base.consistency, raceRand(s, gull)));
  const less = (stat: 'consistency' | 'stamina', by: number) => { stats = { ...stats, [stat]: Math.max(0, stats[stat] - by) }; };
  if (today(s, `pushed:${gull}`)) less('stamina', D.stamina);
  if (crew.staff.ships[1].captain === gull && today(s, `guest:${crew.id}`)) less('consistency', D.guest);
  return { stats, style: g.style ?? 'hunter', seed: g.seed };
}

/** A ship's service today: her bosun, the flight by job (a dilemma's rest, push or cover taken), the bond. */
function serviceOf(s: CareerState, c: Crew, ship: 0 | 1, sailing: Sailing): Service {
  const b = c.staff.ships[ship].bosun;
  const loft = c.buildings.flightLoft.level;
  const flight = c.staff.flight.map((id) => {
    const g = s.gulls[id] as GullOf<'flight'>;
    const fresh = today(s, `rest:${id}`) || today(s, `cover:${id}`);
    return { job: g.job ?? 'mend', stats: effective(g, null), fatigue: fresh ? 0 : fatigueOn(g, s.day, loft) };
  });
  const out = service({ bosun: b === null ? null : effective(s.gulls[b] as GullOf<'bosun'>, null), flight, order: sailing.order, bond: c.bonds[ship] });
  const rate = { ...out.rate }, botch = { ...out.botch };
  for (const id of c.staff.flight) {
    const job = s.gulls[id].job;
    if (job === null) continue;
    if (today(s, `rest:${id}`)) rate[job] *= D.rest;
    if (today(s, `push:${id}`)) botch[job] = Math.min(1, botch[job] + D.push);
  }
  return { ...out, rate, botch };
}

/** A ship of a crew on the card. */
function shipOf(s: CareerState, c: Crew, side: number, ship: 0 | 1, ctx: { spec: Handling; sailing: Sailing; grid: readonly number[] }): RaceShip {
  const parts = shipParts(c, ship);
  const a: Aboard = ctx.sailing.ships[ship];
  const forfeit = a.forfeit || (ship === 0 && c.player && today(s, `forfeit:${c.id}`));
  return {
    id: side * 2 + ship, side, colours: c.colours, handling: handlingFrom(ctx.spec, parts), parts: parts.map(fittedOf),
    captain: a.captain === null ? null : captainOf(s, a.captain, c, ctx.grid), service: serviceOf(s, c, ship, ctx.sailing),
    stance: ctx.sailing.stance, forfeit,
  };
}

/** The race's seed for a league today. */
export const raceSeed = (s: CareerState, league: number): number => Math.floor(raceRand(s, 200000 + league)() * 4294967296) >>> 0;

/** A league's card today (race day), given the lineups. */
export function cardOf(s: CareerState, league: number, spec: Handling, all: readonly Sailing[]): RaceCard {
  const grid = sides(s, league);
  const ships = grid.flatMap((crew, side) => ([0, 1] as const).map((ship) => shipOf(s, s.crews[crew], side, ship, { spec, sailing: all[crew], grid })));
  return { seed: raceSeed(s, league), league, round: s.round, rules: raceRules(s, league), ships };
}

/** The round's three cards (race day), or none on another day. */
export function raceCards(s: CareerState, spec: Handling): RaceCard[] {
  if (s.race === null) return [];
  const all = lineups(s);
  return s.leagues.map((l) => cardOf(s, l.id, spec, all));
}
