// The round's close (Phase B section 13): once the three leagues' results are in, each league in turn has its points
// (D20 under its rules) and standings; then, crew by crew, its stand-ins paid, injuries, the captains' records, morale,
// bonds, the flight's fatigue, its parts' wear and Feedback, its bonuses, the race's money, its patrons' objectives and
// its sailors' marketability; then the league's inspection, reputations and the elders' confidence; and mail. The
// round then ends: the race day is over, the next round is next, and the dilemmas are drawn (career/dilemmas.ts).

import type { RaceResult } from '../race.ts';
import { askWage } from './asks.ts';
import { paid } from './coin.ts';
import type { Dice } from './dice.ts';
import { effective } from './effective.ts';
import { afterRace, standingOf } from './elders.ts';
import { flagsCleared, today } from './flags.ts';
import { inspected } from './inspection.ts';
import { leadershipMorale } from './service.ts';
import { lineups, sides, type Sailing } from './lineup.ts';
import { bonusesPaid, raceMoney } from './money.ts';
import { bondMove, injury, moraleIn, resultMove, statusMove, wageMove, wantsOut } from './morale.ts';
import { partsAfterRace } from './parts.ts';
import { patronsAfterRace } from './patrons.ts';
import { mine, post } from './post.ts';
import { marketabilityAfterRace, reputationAfterRace, type ShipRace } from './reputation.ts';
import type { Gull, GullOf } from './roles.ts';
import { bondGain, bondLevel, fatigueGained, fatigueOn } from './service.ts';
import { staffOf, type CareerState, type Standing } from './state.ts';
import { modifier } from './traits.ts';
import { TUNING } from './tuning.ts';

const R = TUNING.race;

/** A place's points (1 first): D20's 25, 22, 20, 18, 16, then 21 − place to the 20th, then none. */
export const placePoints = (place: number): number => (place <= R.top.length ? R.top[place - 1] : place <= R.last ? R.last + 1 - place : 0);

/** What a crew's race came to: its points, its two ships' (null: forfeit before the start), its best place, ships
 *  sunk by it, ships afloat at the end, and whether it held the most sea. */
export interface CrewRace { points: number; ships: readonly [ShipRace | null, ShipRace | null]; best: number; sank: number; afloat: number; mostSea: boolean; wins: number; podiums: number }

/** A league's result read by side (career/lineup.ts sides). */
export function tally(result: RaceResult, crews: number, rules: { pointsPerSinking: number; seaHeldPoint: boolean }): CrewRace[] {
  const place = new Map(result.order.map((id, i) => [id, i + 1]));
  const kills = new Map<number, number>();
  for (const k of result.sinkings) if (k.by !== null) kills.set(k.by, (kills.get(k.by) ?? 0) + 1);
  const sunk = new Set(result.sinkings.map((k) => k.id));
  const sea = Array.from({ length: crews }, () => 0);
  for (const h of result.seaHeld) if (h.id >> 1 < crews) sea[h.id >> 1] += h.share;
  const most = sea.reduce((b, x, i) => (x > sea[b] ? i : b), 0);
  return Array.from({ length: crews }, (_, side) => {
    const ships = ([0, 1] as const).map((ship): ShipRace => {
      const id = side * 2 + ship, p = place.get(id) ?? crews * 2;
      return { points: placePoints(p) + rules.pointsPerSinking * (kills.get(id) ?? 0), sinkings: kills.get(id) ?? 0, podium: p <= 3 };
    });
    const places = [0, 1].map((ship) => place.get(side * 2 + ship) ?? crews * 2);
    const mostSea = sea[most] > 0 && most === side;
    return {
      points: ships[0].points + ships[1].points + (mostSea && rules.seaHeldPoint ? 1 : 0), ships: [ships[0], ships[1]], best: Math.min(...places),
      sank: ships[0].sinkings + ships[1].sinkings, afloat: [0, 1].filter((ship) => !sunk.has(side * 2 + ship)).length, mostSea,
      wins: places.filter((p) => p === 1).length, podiums: places.filter((p) => p <= 3).length,
    };
  });
}

/** A gull with a race added to their season's line of history. */
function logged(g: Gull, line: { season: number; crew: number; league: number; place: number; points: number; sinkings: number }): Gull {
  const last = g.history[g.history.length - 1];
  if (last && last.season === line.season && last.crew === line.crew) {
    const next = { ...last, races: last.races + 1, best: last.best === null ? line.place : Math.min(last.best, line.place), points: last.points + line.points, sinkings: last.sinkings + line.sinkings };
    return { ...g, history: [...g.history.slice(0, -1), next] };
  }
  return { ...g, history: [...g.history, { season: line.season, crew: line.crew, league: line.league, role: g.role, races: 1, best: line.place, points: line.points, sinkings: line.sinkings }] };
}

/** Every unfit gull a race nearer fit; the player told of theirs. */
function healed(s: CareerState): CareerState {
  const gulls = [...s.gulls];
  const fit: number[] = [];
  for (const g of s.gulls) {
    if (g.unfit <= 0) continue;
    gulls[g.id] = { ...g, unfit: g.unfit - 1 };
    if (g.unfit === 1 && g.contract?.crew === mine(s)) fit.push(g.id);
  }
  return fit.reduce((acc: CareerState, id) => post(acc, { crew: null, category: 'crew', sender: null, kind: 'captainFit', slots: { gull: id }, links: [{ to: 'gull', id }] }), { ...s, gulls });
}

/** A state with a gull's morale moved, and the player told if their gull now asks to leave. */
function moved(s: CareerState, id: number, by: number): CareerState {
  const g = s.gulls[id];
  const morale = moraleIn(g.morale + by);
  const gulls = [...s.gulls];
  gulls[id] = { ...g, morale };
  const out = { ...s, gulls };
  return !wantsOut(g.morale) && wantsOut(morale) && g.contract?.crew === mine(s)
    ? post(out, { crew: g.contract.crew, category: 'crew', sender: id, kind: 'asksToLeave', slots: { gull: id }, links: [{ to: 'gull', id }] }) : out;
}

/** A state after a race for one crew's sailors: stand-ins paid, their records, grudges against the crews that sank them. */
function crewGulls(s: CareerState, crew: number, sailing: Sailing, ctx: { race: CrewRace; result: RaceResult; side: number; grid: readonly number[] }): CareerState {
  let out = s;
  const c = s.crews[crew];
  const sunkBy = new Map(ctx.result.sinkings.map((k) => [k.id, k]));
  const place = new Map(ctx.result.order.map((id, i) => [id, i + 1]));
  ([0, 1] as const).forEach((ship) => {
    const a = sailing.ships[ship];
    if (a.captain === null || a.forfeit) return;
    const id = a.captain;
    if (a.standIn) {
      const g = out.gulls[id];
      const fee = Math.round(askWage(g, c.league) * R.standIn);
      out = paid(out, crew, fee, { kind: 'standIn', what: `${g.given} ${g.family} for the race` });
      out = post(out, { crew, category: 'crew', sender: null, kind: 'standIn', slots: { gull: id, wage: fee }, links: [{ to: 'gull', id }] });
    }
    const race = ctx.race.ships[ship];
    const killer = sunkBy.get(ctx.side * 2 + ship)?.by ?? null;
    const gulls = [...out.gulls];
    const g = logged(gulls[id], { season: out.season, crew, league: c.league, place: place.get(ctx.side * 2 + ship) ?? 80, points: race?.points ?? 0, sinkings: race?.sinkings ?? 0 });
    gulls[id] = killer === null ? g : { ...g, grudge: ctx.grid[killer >> 1] ?? null };
    out = { ...out, gulls };
  });
  return out;
}

/** Injuries for every captain of a league whose ship was sunk (a forfeit is no injury), and a relapse for one who sailed
 *  unfit by a dilemma's answer. */
function injuries(s: CareerState, league: { all: readonly Sailing[]; grid: readonly number[]; result: RaceResult }, roll: Dice): CareerState {
  const rand = roll.roll('injury');
  const sunk = new Set(league.result.sinkings.filter((k) => k.cause !== 'forfeit').map((k) => k.id));
  let out = s;
  league.grid.forEach((crew, side) => ([0, 1] as const).forEach((ship) => {
    const id = league.all[crew].ships[ship].captain;
    if (id === null) return;
    let races = sunk.has(side * 2 + ship) ? injury(rand) : 0;
    if (today(out, `pushed:${id}`) && rand() < TUNING.dilemmas.relapse) races = Math.max(races, TUNING.dilemmas.relapseRaces);
    if (races <= 0) return;
    const gulls = [...out.gulls];
    gulls[id] = { ...gulls[id], unfit: Math.max(gulls[id].unfit, races) };
    out = { ...out, gulls };
    const k = gulls[id].contract;
    if (k && k.crew === mine(out)) out = post(out, { crew: k.crew, category: 'crew', sender: null, kind: 'captainUnfit', slots: { gull: id, races }, links: [{ to: 'gull', id }] });
  }));
  return out;
}

/** Morale, bonds and the flight's fatigue after a race, for one crew. */
function spirits(s: CareerState, crew: number, sailing: Sailing): CareerState {
  const c = s.crews[crew];
  const standing = standingOf(s, crew);
  const sailed = new Set(sailing.ships.map((a) => a.captain).filter((x): x is number => x !== null));
  const levels = c.bonds.map(bondLevel);
  const bosuns = c.staff.ships.map((h) => (h.bosun === null ? null : effective(s.gulls[h.bosun] as GullOf<'bosun'>, null)));
  const lead = bosuns.reduce((a, b) => a + (b ? leadershipMorale(b.leadership) / 2 : 0), 0);
  let out = s;
  for (const id of staffOf(c)) {
    const g = out.gulls[id];
    if (g.player || g.role === 'elder' || g.role === 'manager') continue;
    let by = resultMove(c.target, standing) + modifier(g.traits, null).morale;
    if (g.contract) by += wageMove(g.contract.wage, askWage(g, c.league));
    if (g.role === 'captain') by += statusMove(g.wants.includes('status'), sailed.has(id));
    c.staff.ships.forEach((h, k) => { if (h.bosun === id || h.captain === id) by += bondMove(levels[k]); });
    if (g.role === 'flight') by += lead;
    out = moved(out, id, by);
  }
  const bonds = c.staff.ships.map((h, k) => (h.bosun !== null && h.captain !== null && bosuns[k] ? Math.round((c.bonds[k] + bondGain(bosuns[k]!.chemistry)) * 100) / 100 : c.bonds[k]));
  const gulls = [...out.gulls];
  const loft = c.buildings.flightLoft.level;
  for (const id of c.staff.flight) {
    const g = gulls[id] as GullOf<'flight'>;
    gulls[id] = { ...g, fatigue: Math.min(100, Math.round((fatigueOn(g, out.day, loft) + fatigueGained(effective(g, null).stamina)) * 10) / 10), fatigueDay: out.day };
  }
  const crews = [...out.crews];
  crews[crew] = { ...out.crews[crew], bonds: [bonds[0], bonds[1]] };
  return { ...out, gulls, crews };
}

/** A league's standings after a race. */
function stood(s: CareerState, league: number, grid: readonly number[], races: readonly CrewRace[]): CareerState {
  const by = new Map(grid.map((crew, side) => [crew, races[side]]));
  const standings = s.leagues[league].standings.map((x): Standing => {
    const r = by.get(x.crew);
    return r ? { ...x, points: x.points + r.points, wins: x.wins + r.wins, podiums: x.podiums + r.podiums, sinkings: x.sinkings + r.sank } : x;
  });
  const leagues = [...s.leagues];
  leagues[league] = { ...s.leagues[league], standings };
  return { ...s, leagues };
}

/** A state with one league's race closed. */
function leagueClosed(s: CareerState, league: number, all: readonly Sailing[], roll: Dice): CareerState {
  const result = s.race!.results[league]!;
  const grid = sides(s, league);
  const l = s.leagues[league];
  const races = tally(result, grid.length, l.rules);
  const pointsOf = (crew: number) => races[grid.indexOf(crew)]?.points ?? 0;
  let out = stood(s, league, grid, races);
  out = injuries(out, { all, grid, result }, roll);
  grid.forEach((crew, side) => {
    const r = races[side], sailing = all[crew];
    out = crewGulls(out, crew, sailing, { race: r, result, side, grid });
    out = spirits(out, crew, sailing);
    const ids = ([0, 1] as const).map((ship) => (sailing.ships[ship].forfeit ? null : side * 2 + ship));
    out = partsAfterRace(out, crew, [ids[0], ids[1]], result);
    const earned = ([0, 1] as const).flatMap((ship) => {
      const id = sailing.ships[ship].captain;
      return id === null || !r.ships[ship] ? [] : [{ gull: id, podium: r.ships[ship]!.podium, sinkings: r.ships[ship]!.sinkings }];
    });
    out = bonusesPaid(out, crew, earned);
    out = raceMoney(out, crew);
    out = patronsAfterRace(out, crew, { best: r.best, sinkings: r.sank, afloat: r.afloat, mostSea: r.mostSea }, sailing.objectives);
    out = marketabilityAfterRace(out, crew, r.ships);
  });
  out = inspected(out, league, pointsOf, roll).state;
  const me = mine(out);
  const myShip = me !== null && grid[0] === me ? races[0].ships[0] : null;
  out = reputationAfterRace(out, league, pointsOf, myShip);
  for (const crew of grid) out = afterRace(out, crew, roll);
  return told(out, league, { grid, races, result });
}

/** The player's mail of a league's race: their own result, or the others' podium. */
function told(s: CareerState, league: number, ctx: { grid: readonly number[]; races: readonly CrewRace[]; result: RaceResult }): CareerState {
  const me = mine(s);
  if (me === null) return s;
  if (ctx.grid[0] === me && s.crews[me].league === league) {
    const r = ctx.races[0];
    return post(s, { crew: me, category: 'league', sender: null, kind: 'raceResult', slots: { league, place: r.best, points: r.points, standing: standingOf(s, me) }, links: [{ to: 'screen', id: 'standings' }] });
  }
  const top = ctx.result.order.slice(0, 3).map((id) => ctx.grid[id >> 1]);
  return post(s, { crew: null, category: 'league', sender: null, kind: 'roundResults', slots: { league, first: top[0], second: top[1], third: top[2] }, links: [{ to: 'screen', id: 'standings' }] });
}

/** A state with the round closed: every league's race, then the race day over and the next round next. */
export function roundClosed(s: CareerState, roll: Dice): CareerState {
  const all = lineups(s);
  let out = healed(s);
  for (const l of s.leagues) out = leagueClosed(out, l.id, all, roll);
  return flagsCleared({ ...out, race: null, round: s.race!.round + 1 });
}
