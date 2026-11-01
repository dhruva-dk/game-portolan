// LEGACY: the old game's career (commit 2025e68), kept only because tests/tools/tournament.ts and the sim tests
// that run it still import it. Portolan's career does not use this file: see src/career/index.ts.
// Whoever retires or rewrites the tournament may delete this file, and the other legacy career files with it.
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

export const VOYAGE = { sample: 15, land: 20, away: 3, window: 600, watch: 60, near: 15 } as const;

export const LESSON = { breakOff: 0, steer: 1, loop: 2, gull: 3, chest: 4, broadside: 5, storm: 6 } as const;
export const LESSONS = 7;

export interface Voyage {
  breakOff: number;
  sea: number;
  seaSq: number;
  raids: number;
  hits: number;
  runs: number;
  runHull: number;
  storm: number;
  margin: number;
  samples: number;
  fittings: number[];
  seen: Uint8Array;
  found: Uint8Array;
  entered: number[];
  lessons: number[];
  foe: number;
  foeHit: number;
  away: number;
}

export const newVoyage = (): Voyage => ({
  breakOff: -1, sea: 0, seaSq: 0, raids: 0, hits: 0, runs: 0, runHull: 0, storm: 0, margin: 0, samples: 0,
  fittings: new Array<number>(FITTINGS).fill(0), seen: new Uint8Array(CHART_CELLS >> 3), found: new Uint8Array(FIND_SITES),
  entered: new Array<number>(REGIONS.length).fill(-1), lessons: new Array<number>(LESSONS).fill(-1), foe: -1, foeHit: 0, away: 0,
});

export const CHART_GRID = cubeGrid(CHART.n);

const STAMP = new Uint32Array(CHART_GRID.cells), QUEUE = new Int32Array(CHART_GRID.cells), DIR = v3();
const SIGHT = Array.from({ length: SHIPS }, newSight);
const KIT: readonly number[] = [FITTING.none, ...startingFittings(8).map((f) => f.kind)];
let stamp = 0;

const first = (v: Voyage, lesson: number, tick: number): void => {
  if (v.lessons[lesson] < 0) v.lessons[lesson] = tick;
};

export const chartSeen = (seen: Uint8Array, cell: number): boolean => (seen[cell >> 3] & (1 << (cell & 7))) !== 0;

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
      const a = Math.round(e.amount);
      v.sea += a;
      v.seaSq += a * a;
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
    loop: v.sea > 0 ? Math.round(Math.sqrt(v.seaSq / v.sea / PI)) : null,
    raids: v.raids,
    run: v.runs > 0 ? Math.round(v.runHull / v.runs) : v.hits > 0 ? 0 : null,
    storm: v.storm > 0 ? Math.round(v.margin / v.storm) : null,
    fittings,
  };
}

export function toLetter(career: Career, v: Voyage): { region: number; tick: number }[] {
  const out: { region: number; tick: number }[] = [];
  v.entered.forEach((tick, region) => {
    if (tick >= 0 && career.chart.named[region].match < 0) out.push({ region, tick });
  });
  return out.sort((a, b) => a.tick - b.tick || a.region - b.region);
}

let cellRegion: Uint8Array | null = null;

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
