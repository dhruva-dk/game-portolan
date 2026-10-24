// The player's voyage, watched (PROMPT.md, Captains learn the player; The career chart; The first voyage): what the
// career takes from a match besides its result, gathered by reading the match state after every step, as the
// renderer does, never writing it. Each tick it reads that tick's events; every VOYAGE.sample ticks it surveys what
// the player can see, to ink the career chart, and how it sails, to learn its habits. The app keeps one Voyage beside
// each match (observe after every step) and hands it to applyResult (progress.ts) with the result; the first voyage's
// lettering (WP27) reads its lessons, and the chart's lettering of region names reads toLetter.
import type { Sea } from '../sim/environment.ts';
import { startingFittings } from '../sim/items.ts';
import { PI, dcos, dot, v3, type V3 } from '../sim/math.ts';
import { R, cellDir, cellOf, cubeGrid, neighbor, surfaceDistance } from '../sim/sphere.ts';
import { EVENT, PHASE, SHIPS, afloat, fullHull, type MatchState } from '../sim/state.ts';
import { calmNow } from '../sim/storm.ts';
import { FITTING } from '../sim/tables.ts';
import { eyeReach, newSight, survey } from '../sim/visibility.ts';
import { regionOf } from '../sim/world/geography.ts';
import { REGIONS } from '../sim/world/regions.ts';
import { CHART, CHART_CELLS, FIND_SITES, FITTINGS, type Career } from './state.ts';

/**
 * How the voyage is watched: sampled every `sample` ticks (half a second); the chart inks what lies within the
 * player's sight through the air, out to its lookout's horizon and `land` u beyond (coasts stand above the sea); a run
 * is `away` samples in a row sailing away from the rival that last hit it, within `window` ticks of the hit; the storm
 * is watched while its edge is within `watch` u of the player, and a storm run is a turn for the calm within `near` u
 * of the edge (or beyond it).
 */
export const VOYAGE = { sample: 15, land: 20, away: 3, window: 600, watch: 60, near: 15 } as const;

/** The first voyage's lessons (PROMPT.md, The first voyage): the moments its lettering answers (WP27). */
export const LESSON = { breakOff: 0, steer: 1, loop: 2, gull: 3, chest: 4, broadside: 5, storm: 6 } as const;
export const LESSONS = 7;

/** One match of the player's, as the career watched it. Plain data, integers but for nothing. */
export interface Voyage {
  /** The region (REGIONS index) the player first broke off the Great Current into, −1 none. */
  breakOff: number;
  /** Loops closed, and the u² they claimed, each rounded. */
  loops: number;
  area: number;
  /** Rivals' trails it broke. */
  raids: number;
  /** Hits it took; the runs it made from the rival that last hit it, and the hull it ran at, percent of full, summed. */
  hits: number;
  runs: number;
  runHull: number;
  /** Samples while the storm's edge was near, and the margin it kept inside the calm then, u, summed (each rounded). */
  storm: number;
  margin: number;
  /** Samples taken, and of them, by FITTING kind, those in which it carried one beyond the starting kit. */
  samples: number;
  fittings: number[];
  /** The career chart's cells seen (state.ts CHART: cell c at byte c >> 3, bit c & 7). */
  seen: Uint8Array;
  /** The find sites (Geography.finds) discovered: seen, taken, or marked by its gull, 1 each. */
  found: Uint8Array;
  /** By region, the tick it first sailed into it, −1 not yet. */
  entered: number[];
  /** By LESSON, the tick it first did it, −1 not yet. */
  lessons: number[];
  /** The rival that last hit it (−1 none) and when, and the samples since that it has sailed away from it. */
  foe: number;
  foeHit: number;
  away: number;
}

export const newVoyage = (): Voyage => ({
  breakOff: -1, loops: 0, area: 0, raids: 0, hits: 0, runs: 0, runHull: 0, storm: 0, margin: 0, samples: 0,
  fittings: new Array<number>(FITTINGS).fill(0), seen: new Uint8Array(CHART_CELLS >> 3), found: new Uint8Array(FIND_SITES),
  entered: new Array<number>(REGIONS.length).fill(-1), lessons: new Array<number>(LESSONS).fill(-1), foe: -1, foeHit: 0, away: 0,
});

/** The career chart's grid (state.ts CHART), for the renderer too. */
export const CHART_GRID = cubeGrid(CHART.n);

const STAMP = new Uint32Array(CHART_GRID.cells), QUEUE = new Int32Array(CHART_GRID.cells), DIR = v3();
const SIGHT = Array.from({ length: SHIPS }, newSight);
/** Fittings a ship may start with, which say nothing of the player's taste. */
const KIT: readonly number[] = [FITTING.none, ...startingFittings(8).map((f) => f.kind)];
let stamp = 0;

const first = (v: Voyage, lesson: number, tick: number): void => {
  if (v.lessons[lesson] < 0) v.lessons[lesson] = tick;
};

/** Whether chart cell `cell` is inked in `seen`. */
export const chartSeen = (seen: Uint8Array, cell: number): boolean => (seen[cell >> 3] & (1 << (cell & 7))) !== 0;

/** Ink into `seen` every chart cell within `reach` u of `p`, flooding out from its own cell. */
function ink(seen: Uint8Array, p: V3, reach: number): void {
  const cos = dcos(Math.min(PI, reach / R)), start = cellOf(CHART_GRID, p);
  let head = 0, tail = 0;
  stamp++;
  STAMP[start] = stamp;
  QUEUE[tail++] = start;
  while (head < tail) {
    const c = QUEUE[head++];
    seen[c >> 3] |= 1 << (c & 7);
    for (let k = 0; k < 4; k++) {
      const nb = neighbor(CHART_GRID, c, k);
      if (STAMP[nb] === stamp) continue;
      STAMP[nb] = stamp;
      if (dot(cellDir(CHART_GRID, nb, DIR), p) >= cos) QUEUE[tail++] = nb;
    }
  }
}

/** Watch the match after a step: the player's events this tick and, every VOYAGE.sample ticks, its sight and sailing. */
export function observe(v: Voyage, sea: Sea, state: MatchState): void {
  const me = state.ships[0], t = state.tick;
  for (const e of state.events) {
    if (e.ship !== 0) {
      if (e.kind === EVENT.broken && e.by === 0) v.raids++;
      continue;
    }
    if (e.kind === EVENT.breakOff) {
      if (v.breakOff < 0) v.breakOff = e.by;
      first(v, LESSON.breakOff, t);
    } else if (e.kind === EVENT.loop) {
      v.loops++;
      v.area += Math.round(e.amount);
      first(v, LESSON.loop, t);
    } else if ((e.kind === EVENT.hit || e.kind === EVENT.ram) && e.by > 0) {
      v.hits++;
      v.foe = e.by;
      v.foeHit = t;
      v.away = 0;
    } else if (e.kind === EVENT.called) first(v, LESSON.gull, t);
    else if (e.kind === EVENT.chosen) first(v, LESSON.chest, t);
    else if (e.kind === EVENT.broadside) first(v, LESSON.broadside, t);
    else if (e.kind === EVENT.find && e.by >= 0 && e.by < FIND_SITES) v.found[e.by] = 1;
    else if (e.kind === EVENT.spotted && e.by < 0 && Number.isInteger(e.amount) && e.amount >= 0 && e.amount < FIND_SITES) v.found[e.amount] = 1;
  }
  if (!afloat(me)) return;
  if (me.phase === PHASE.sailing && (me.rate !== 0 || me.course.length > 0)) first(v, LESSON.steer, t);
  if (t % VOYAGE.sample !== 0) return;
  v.samples++;
  for (const f of me.fittings) if (!KIT.includes(f.kind)) v.fittings[f.kind]++;
  const r = regionOf(me.pos);
  if (v.entered[r] < 0) v.entered[r] = t;
  survey(sea, state, SIGHT);
  const reach = Math.min(SIGHT[0].range, eyeReach(state, 0) + VOYAGE.land);
  ink(v.seen, me.pos, reach);
  sea.geo.finds.forEach((f, k) => {
    if (surfaceDistance(me.pos, f.pos) <= reach) v.found[k] = 1;
  });
  if (v.foe > 0) {
    const foe = state.ships[v.foe];
    if (!afloat(foe) || t - v.foeHit > VOYAGE.window) v.foe = -1;
    else {
      const away = (me.pos.x - me.was.x) * (foe.pos.x - me.pos.x) + (me.pos.y - me.was.y) * (foe.pos.y - me.pos.y) + (me.pos.z - me.was.z) * (foe.pos.z - me.pos.z) < 0;
      v.away = away ? v.away + 1 : 0;
      if (v.away >= VOYAGE.away) {
        v.runs++;
        v.runHull += Math.max(1, Math.round((100 * me.hull) / fullHull(me.form, me.fittings)));
        v.foe = -1;
      }
    }
  }
  const calm = calmNow(state), margin = R * calm.r - surfaceDistance(me.pos, calm.at);
  if (calm.r < PI && margin < VOYAGE.watch) {
    v.storm++;
    v.margin += Math.round(margin);
    if (margin < VOYAGE.near && dot(me.pos, calm.at) > dot(me.was, calm.at)) first(v, LESSON.storm, t);
  }
}

/**
 * What one match showed of the player's habits (state.ts BINS), null where it showed nothing: the region it broke off
 * into; its loops' mean radius, u; the trails it broke; the hull it ran at, mean percent (0: it was hit and never ran,
 * it stood and fought); the mean margin it kept inside the calm while the storm closed, u; the fittings beyond the
 * starting kit it carried for a quarter of the match or more.
 */
export interface Habits {
  breakOff: number | null;
  loop: number | null;
  raids: number;
  run: number | null;
  storm: number | null;
  fittings: number[];
}

export function habitsOf(v: Voyage): Habits {
  const fittings: number[] = [];
  v.fittings.forEach((n, k) => {
    if (n > 0 && 4 * n >= v.samples) fittings.push(k);
  });
  return {
    breakOff: v.breakOff >= 0 ? v.breakOff : null,
    loop: v.loops > 0 ? Math.round(Math.sqrt(v.area / v.loops / PI)) : null,
    raids: v.raids,
    run: v.runs > 0 ? Math.round(v.runHull / v.runs) : v.hits > 0 ? 0 : null,
    storm: v.storm > 0 ? Math.round(v.margin / v.storm) : null,
    fittings,
  };
}

/**
 * The regions whose names the career chart letters in this match (PROMPT.md, The career chart): those entered for the
 * first time in the career, earliest first, with the tick the lettering animates at.
 */
export function toLetter(career: Career, v: Voyage): { region: number; tick: number }[] {
  const out: { region: number; tick: number }[] = [];
  v.entered.forEach((tick, region) => {
    if (tick >= 0 && career.chart.named[region].match < 0) out.push({ region, tick });
  });
  return out.sort((a, b) => a.tick - b.tick || a.region - b.region);
}

let cellRegion: Uint8Array | null = null;

/** How much of each region the career chart has inked, permille of its cells: a finished chart is 1000 everywhere. */
export function chartInked(career: Career): number[] {
  if (cellRegion === null) {
    cellRegion = new Uint8Array(CHART_GRID.cells);
    for (let c = 0; c < CHART_GRID.cells; c++) cellRegion[c] = regionOf(cellDir(CHART_GRID, c, DIR));
  }
  const all = new Array<number>(REGIONS.length).fill(0), inked = new Array<number>(REGIONS.length).fill(0);
  for (let c = 0; c < CHART_GRID.cells; c++) {
    all[cellRegion[c]]++;
    if (chartSeen(career.chart.seen, c)) inked[cellRegion[c]]++;
  }
  return all.map((n, r) => (n > 0 ? Math.floor((1000 * inked[r]) / n) : 0));
}
