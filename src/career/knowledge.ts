// What a crew knows of a gull (Phase B section 4, D16). Knowledge is per crew: a crew knows its own staff and every
// gull its scouts have reported on, exactly; of the rest it sees ranges, as wide as its best scout's Judgement
// (stars) and Insight (potential) among those with the gull in Reach allow, the stars' centre off by a seeded amount
// fixed for that crew and gull. The player's screens and the rivals' choices read the same view.

import { seeded } from './dice.ts';
import { effective } from './effective.ts';
import type { Gull, GullOf } from './roles.ts';
import { centreOff, inReach, potentialWidth, shownRange, starWidth, traitShows } from './staff.ts';
import { potential, stars } from './stars.ts';
import type { CareerState } from './state.ts';

/** What a crew sees of a gull: exact once known; ranges otherwise. `arrow` is the change in stars since the last
 *  season's end, for a known gull. */
export interface View {
  known: boolean;
  stars: readonly [number, number];
  potential: readonly [number, number];
  trait: string | null;
  arrow: number | null;
}

/** The league a gull is seen in: their crew's, or null for a free agent. */
export const leagueOf = (s: CareerState, g: Gull): number | null => (g.contract ? s.crews[g.contract.crew].league : null);

/** Whether a crew knows a gull exactly: its own, or scouted. */
export const knows = (s: CareerState, crew: number, g: Gull): boolean => g.contract?.crew === crew || g.known[crew] !== undefined;

/** The ids of the gulls with an entry for each crew in their `known`, for the last gulls list read. States share every
 *  gull they did not change, so a new list is brought up to date by comparing it with that one and reading again only
 *  the gulls that differ: a crew's reviews then look over the few dozen gulls it knows, not every gull there is. */
let indexed: readonly Gull[] = [];
const byCrew = new Map<string, Set<number>>();

function reindexed(gulls: readonly Gull[]): void {
  if (gulls === indexed) return;
  const both = Math.min(gulls.length, indexed.length);
  for (let i = 0; i < both; i++) {
    const was = indexed[i], now = gulls[i];
    if (was === now || was.known === now.known) continue;
    for (const k of Object.keys(was.known)) byCrew.get(k)?.delete(i);
    entered(now);
  }
  for (let i = both; i < indexed.length; i++) for (const k of Object.keys(indexed[i].known)) byCrew.get(k)?.delete(i);
  for (let i = both; i < gulls.length; i++) entered(gulls[i]);
  indexed = gulls;
}

function entered(g: Gull): void {
  for (const k of Object.keys(g.known)) {
    const ids = byCrew.get(k) ?? new Set<number>();
    byCrew.set(k, ids.add(g.id));
  }
}

/** The ids of the gulls a crew has an entry for (its scouts' reports, its signings), in id order. */
export function knownTo(s: CareerState, crew: number): number[] {
  reindexed(s.gulls);
  return [...(byCrew.get(String(crew)) ?? [])].sort((a, b) => a - b);
}

/** A crew's eyes: the best Judgement and Insight among its scouts with a league (null: the free agents) in Reach. */
export type Sight = (league: number | null) => { judgement: number; insight: number };

/** A crew's sight, its scouts' effective stats read once. */
export function sightOf(s: CareerState, crew: number): Sight {
  const c = s.crews[crew];
  const scouts = c.staff.scouts.map((id) => s.gulls[id]).filter((g) => g.role === 'scout').map((g) => effective(g as GullOf<'scout'>, null));
  const by = new Map<number | null, { judgement: number; insight: number }>();
  return (league) => {
    const hit = by.get(league);
    if (hit) return hit;
    let judgement = 0, insight = 0;
    for (const st of scouts) {
      if (!inReach(st.reach, c.league, league)) continue;
      judgement = Math.max(judgement, st.judgement);
      insight = Math.max(insight, st.insight);
    }
    const out = { judgement, insight };
    by.set(league, out);
    return out;
  };
}

/** What a crew sees of a gull (its sight passed in when many gulls are viewed at once). */
export function view(s: CareerState, crew: number, gull: number, sight: Sight = sightOf(s, crew)): View {
  const g = s.gulls[gull];
  const st = stars(g), pot = potential(g);
  const k = g.known[crew];
  const e = sight(leagueOf(s, g));
  if (knows(s, crew, g)) {
    return { known: true, stars: [st, st], potential: shownRange(pot, potentialWidth(e.insight, true)), trait: g.traits[0] ?? null,
      arrow: k ? st - k.last : null };
  }
  const off = centreOff(e.judgement, seeded(g.seed, crew + 1));
  return {
    known: false,
    stars: shownRange(st + off, starWidth(e.judgement)),
    potential: shownRange(pot + off, potentialWidth(e.insight, false)),
    trait: traitShows(e.insight) ? (g.traits[0] ?? null) : null,
    arrow: null,
  };
}

/** The middle of a range. */
export const middle = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

/** A state with a gull known to a crew from a report today. */
export function learned(s: CareerState, crew: number, gull: number, scout: number | null): CareerState {
  const g = s.gulls[gull];
  const gulls = [...s.gulls];
  gulls[gull] = { ...g, known: { ...g.known, [crew]: { day: s.day, last: stars(g), by: scout, used: false } } };
  return { ...s, gulls };
}

/** A state with every crew's knowledge marked at this season's end (each known gull's stars now), so next season's
 *  screens show the change as an arrow. Section 13 calls it at the season's end before growth. */
export function knowledgeTurned(s: CareerState): CareerState {
  const gulls = s.gulls.map((g) => {
    const crews = Object.keys(g.known);
    if (crews.length === 0 || g.retired !== null) return g;
    const st = stars(g);
    const known = Object.fromEntries(crews.map((c) => [c, { ...g.known[c], last: st }]));
    return { ...g, known };
  });
  return { ...s, gulls };
}
