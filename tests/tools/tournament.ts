// The captains' tournament (WP12; PROMPT.md acceptance check 3), on worker_threads.
//
//   node tests/tools/tournament.ts [--matches 200] [--careers 0] [--workers N] [--json out.json]
//
// A match: nine captains of every rank and temperament on a seeded sea (seed 12000 + m), every temperament and every
// tier taking every berth in turn under a league captain's identity (its signature) and its rank's kit (league.ts
// captainOutfit: form, fittings, gull, gunners), the player's ship idle (it rides the Great Current to its end). Each
// match is a pure function of m, so results merge in match order whatever worker ran them, and a run is the same on
// any machine and with any number of workers.
//
// A career (the scripted player of check 3): a fresh career past its first voyage, the player's ship sailed by a
// captain's brain (brain.ts piloted: the player's controls only) to a fixed habit — always breaking off into one
// region, drawing a temperament's loops (a gambler's huge ones) — for `change` matches, then another habit (another
// region, a turtle's small loops). Each match is sailed twice on the same seed and fleet: with the captains' minds
// (career/learn.ts, carried in, and their learning in play) and naive (no minds, so no learning at all); what the
// learning adds is the difference. Seeds are the first after the career's own whose Great Current passes both
// habits' regions, so the player can keep its habit and the captains can follow it into either.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE } from '../../src/sim/captains/brain.ts';
import { seaFor, type Sea } from '../../src/sim/environment.ts';
import { result } from '../../src/sim/end.ts';
import { idleInput } from '../../src/sim/input.ts';
import { startingFittings } from '../../src/sim/items.ts';
import { step } from '../../src/sim/match.ts';
import { passage, type Passage } from '../../src/sim/opening.ts';
import type { V3 } from '../../src/sim/math.ts';
import { R } from '../../src/sim/sphere.ts';
import { AFLOAT, EVENT, KNOW, PHASE, SHIPS, TICK, createMatch, type MatchSetup, type MatchState, type Outfit } from '../../src/sim/state.ts';
import { CAPTAINS, GUNNERY, captainForm, captainGull } from '../../src/career/league.ts';
import { applyResult } from '../../src/career/progress.ts';
import { toSetup } from '../../src/career/setup.ts';
import { RANK, newCareer, tierOf } from '../../src/career/state.ts';
import { newVoyage, observe, type Voyage } from '../../src/career/voyage.ts';
import { world } from '../sim/vectors.ts';

export const NAMES = ['hunter', 'expander', 'raider', 'turtle', 'opportunist', 'gambler'] as const;
/** Per captain: sea claimed (u², its loops), steady sea (u², its holding averaged over the match), trails broken, the purses they cost their owners, ships sunk, loot taken (scooped and found), spoils (coins scooped and bounties: loot from fights), finishing place. */
export const STATS = ['sea', 'held', 'broken', 'purse', 'sunk', 'loot', 'spoils', 'place'] as const;
export type Stat = (typeof STATS)[number];
export type Row = Record<Stat, number> & { m: number; i: number; temperament: number; tier: number; id: number; region: number; causes: number[]; kmode: number[]; kvict: number[]; tmode: number[]; dmode: number[] };
export interface MatchOut { m: number; minutes: number; ms: number; rows: Row[] }

const LIMIT = Math.round(1200 / TICK), SAMPLE = 30;
const PASS: Passage = { region: 0, next: -1, untilNext: 0, untilEnd: 0 };
let GEO: ReturnType<typeof world> | null = null;
const geo = (): ReturnType<typeof world> => (GEO ??= world());

/** Berth i's temperament and tier in tournament match m: temperaments rotate by match, tiers by berth and block of six. */
export const berth = (m: number, i: number): { temperament: number; tier: number } => ({ temperament: (i - 1 + m) % 6, tier: 1 + (((i - 1) * 5 + Math.floor(m / 6)) % 8) });
const IDS = NAMES.map((_, t) => CAPTAINS.flatMap((c, id) => (c.temperament === t ? [id] : [])));

/** A captain's outfit at a tier, as the career fits it (league.ts captainOutfit), without a career. */
export function outfit(id: number, tier: number): Outfit {
  const t = CAPTAINS[id].temperament;
  return { form: captainForm(id, tier), pigment: id, pattern: 1 + t, fittings: startingFittings(tier), gull: captainGull(tier, t), gunnery: GUNNERY[tier - 1], captain: { temperament: t, tier } };
}

/** The regions the Great Current passes on `sea`, in order. */
export function routeRegions(sea: Sea): number[] {
  const out: number[] = [];
  for (let s = 0; s < 8000; s += 4) {
    passage(sea, s, PASS);
    if (!out.includes(PASS.region)) out.push(PASS.region);
    if (PASS.next < 0 && PASS.untilEnd <= 0) break;
  }
  return out;
}

/** The scripted player's habit: the region it always breaks off into, and the temperament whose loops it draws. */
export interface Habit { region: number; temperament: number }
const ang = (a: V3, b: V3): number => R * Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));

/** Sail match s to its end: the player idle, or piloted to `pilot`; each captain's tally from the events; `hook` every tick. */
function play(sea: Sea, s: MatchState, pilot: Habit | null, voyage: Voyage | null, hook?: (s: MatchState) => void): { rows: Row[]; ticks: number } {
  const rows: Row[] = Array.from({ length: SHIPS }, (_, i) => ({ m: 0, i, temperament: s.ships[i].captain.temperament, tier: 0, id: s.ships[i].pigment, region: -1, causes: [0, 0, 0, 0, 0, 0], kmode: new Array<number>(15).fill(0), kvict: new Array<number>(7).fill(0), tmode: new Array<number>(15).fill(0), dmode: new Array<number>(15).fill(0), sea: 0, held: 0, broken: 0, purse: 0, sunk: 0, loot: 0, spoils: 0, place: 0 }));
  const out: number[] = new Array<number>(SHIPS).fill(-1), input = idleInput(), p = s.ships[0];
  if (pilot) Object.assign(p.captain, { temperament: pilot.temperament, skill: 0.6 });
  let sunk = 0, over = false, k = 0, samples = 0;
  for (; k < LIMIT && !over; k++) {
    if (pilot && p.phase === PHASE.riding) { // the script: off the current into its region, never elsewhere
      passage(sea, p.ride, PASS);
      p.captain.mode = PASS.region === pilot.region && s.tick * TICK >= 20 ? MODE.peel : MODE.ride;
    }
    step(sea, s, input);
    if (voyage) observe(voyage, sea, s);
    hook?.(s);
    if (k % SAMPLE === 0) {
      samples++;
      for (let i = 0; i < SHIPS; i++) if (s.ships[i].phase !== PHASE.sunk) rows[i].held += s.ships[i].held;
      for (let i = 0; i < SHIPS; i++) if (s.ships[i].phase !== PHASE.sunk) rows[i].tmode[s.ships[i].captain.mode]++; // time by mode (diagnostic)
    }
    for (const e of s.events) {
      if (e.kind === EVENT.loop && e.ship >= 0) rows[e.ship].sea += e.amount;
      else if (e.kind === EVENT.broken && e.by >= 0) {
        rows[e.by].broken++;
        rows[e.by].purse += e.amount;
      } else if (e.kind === EVENT.scoop && e.ship >= 0) {
        rows[e.ship].loot += e.amount;
        if (e.by === AFLOAT.coin) rows[e.ship].spoils += e.amount;
      } else if (e.kind === EVENT.find && e.ship >= 0) rows[e.ship].loot += e.amount;
      else if (e.kind === EVENT.bounty && e.ship >= 0) rows[e.ship].spoils += e.amount;
      else if (e.kind === EVENT.breakOff && e.ship >= 0) rows[e.ship].region = e.by;
      else if (e.kind === EVENT.hit && e.by >= 0) rows[e.by].dmode[s.ships[e.by].captain.mode] += e.amount; // hurt dealt by the striker's mode (diagnostic)
      else if (e.kind === EVENT.sunk) {
        out[e.ship] = sunk++;
        if (e.by >= 0) {
          rows[e.by].sunk++;
          rows[e.by].causes[e.amount]++;
          rows[e.by].kmode[s.ships[e.by].captain.mode]++; // the killer's mode and the victim's temperament (+1: the player is 0)
          rows[e.by].kvict[s.ships[e.ship].captain.temperament + 1]++;
        }
      } else if (e.kind === EVENT.win) over = true;
    }
  }
  const afloat = s.ships.map((_, i) => i).filter((i) => s.ships[i].phase !== PHASE.sunk).sort((a, b) => s.ships[b].held - s.ships[a].held);
  for (let i = 0; i < SHIPS; i++) {
    rows[i].place = out[i] >= 0 ? SHIPS - out[i] : 1 + afloat.indexOf(i);
    rows[i].held /= Math.max(1, samples);
  }
  return { rows, ticks: k };
}

/** Tournament match m. */
export function tournamentMatch(m: number): MatchOut {
  const t0 = performance.now(), seed = 12000 + m;
  const fleet: Outfit[] = Array.from({ length: SHIPS }, (_, i) => {
    if (i === 0) return {};
    const { temperament, tier } = berth(m, i), ids = IDS[temperament];
    return outfit(ids[(i + Math.floor(m / 6)) % ids.length], tier);
  });
  const sea = seaFor(geo(), seed), s = createMatch({ seed, fleet, rank: 5 });
  const { rows, ticks } = play(sea, s, null, null);
  const out = rows.slice(1).map((r) => ({ ...r, m, tier: berth(m, r.i).tier }));
  return { m, minutes: (ticks * TICK) / 60, ms: performance.now() - t0, rows: out };
}

/** What a captain's learning adds, measured in one match: captains breaking off into the first habit's region and into the current habit's, captains near the player (mean over the ticks it sails, within NEAR u), how far hunters' loops reach from their homes (u, mean of each one's farthest), the player's trails broken by captains, the player's place. */
export interface Measure { follow: number; followNow: number; near: number; reach: number; broken: number; place: number }
export interface CareerMatch { j: number; seed: number; learn: Measure; naive: Measure; knewRegion: number; knewLoop: number; learnt: number }
export interface CareerJob { kind: 'career'; k: number; a: Habit; b: Habit; matches: number; change: number }
export const NEAR = 60;

function measured(sea: Sea, setup: MatchSetup, habit: Habit, first: number, voyage: Voyage | null): { m: Measure; s: MatchState; knewRegion: number; knewLoop: number } {
  const s = createMatch(setup), far = new Array<number>(SHIPS).fill(0);
  let near = 0, sailing = 0, knewRegion = 0, knewLoop = 0, trails = 0;
  for (let i = 1; i < SHIPS; i++) {
    const c = s.ships[i].captain;
    if ((c.knows & KNOW.breakOff) !== 0 && c.breakOff === first) knewRegion++;
    if ((c.knows & KNOW.loop) !== 0) knewLoop++;
  }
  const { rows } = play(sea, s, habit, voyage, (st) => {
    const p = st.ships[0];
    for (const e of st.events) if (e.kind === EVENT.broken && e.ship === 0 && e.by >= 1) trails++;
    for (let i = 1; i < SHIPS; i++) {
      const q = st.ships[i], c = q.captain;
      if (q.phase === PHASE.sunk || q.phase === PHASE.riding || q.phase === PHASE.peeling) continue;
      if (c.temperament === 0 && (c.anchor.x || c.anchor.y || c.anchor.z)) far[i] = Math.max(far[i], ang(q.pos, c.anchor));
      if (p.phase !== PHASE.sunk && p.phase !== PHASE.riding && ang(q.pos, p.pos) < NEAR) near++;
    }
    if (p.phase !== PHASE.sunk && p.phase !== PHASE.riding) sailing++;
  });
  const hunters = rows.slice(1).filter((r) => r.temperament === 0).map((r) => far[r.i]);
  return {
    s, knewRegion, knewLoop,
    m: {
      follow: rows.slice(1).filter((r) => r.region === first).length,
      followNow: rows.slice(1).filter((r) => r.region === habit.region).length,
      near: near / Math.max(1, sailing),
      reach: hunters.length ? hunters.reduce((a, b) => a + b, 0) / hunters.length : 0,
      broken: trails,
      place: rows[0].place,
    },
  };
}

/** A scripted player's career: `matches` matches, habit `a` for the first `change`, then habit `b`. */
export function careerRun(job: CareerJob): CareerMatch[] {
  let career = newCareer(9000 + job.k);
  career.match = 1; // past the first voyage: captains of rank, at their own temperaments
  career.player.points = 4 * RANK.tier;
  career.player.tier = tierOf(career.player.points);
  const out: CareerMatch[] = [];
  for (let j = 0; j < job.matches; j++) {
    const habit = j < job.change ? job.a : job.b;
    let seed = 30000 + 1000 * job.k + 37 * j, sea = seaFor(geo(), seed);
    for (let n = 0; n < 60; n++, sea = seaFor(geo(), ++seed)) {
      const route = routeRegions(sea);
      if (route.includes(job.a.region) && route.includes(job.b.region) && route[0] !== habit.region) break;
    }
    const { setup } = toSetup(career, seed), voyage = newVoyage();
    const learn = measured(sea, setup, habit, job.a.region, voyage);
    const naive = measured(sea, { ...setup, minds: setup.minds?.map(() => null) }, habit, job.a.region, null);
    out.push({ j, seed, learn: learn.m, naive: naive.m, knewRegion: learn.knewRegion, knewLoop: learn.knewLoop, learnt: learn.s.ships.filter((q, i) => i > 0 && q.captain.learnt !== 0).length });
    career = applyResult(career, result(learn.s), voyage);
  }
  return out;
}

/** The two regions the Great Current passes most often over the first 80 career seeds (ties to the lower index): the scripted player's two habits. */
export function habitRegions(): [number, number] {
  const n = new Map<number, number>();
  for (let s = 30000; s < 30080; s++) for (const r of routeRegions(seaFor(geo(), s)).slice(1)) n.set(r, (n.get(r) ?? 0) + 1);
  const top = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return [top[0][0], top[1][0]];
}

type Job = { kind: 'match'; m: number } | CareerJob;
function run(job: Job): unknown {
  return job.kind === 'match' ? tournamentMatch(job.m) : careerRun(job);
}

/** Run jobs on `width` workers, each pulling the next job as it finishes; results by job index. */
export async function pool<T>(jobs: readonly Job[], width = availableParallelism()): Promise<T[]> {
  const out: T[] = new Array<T>(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, jobs.length)) }, () => new Promise<void>((done, fail) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { tournamentWorker: true } });
    const give = (): void => {
      if (next < jobs.length) {
        const k = next++;
        w.postMessage({ k, job: jobs[k] });
      } else void w.terminate().then(() => done());
    };
    w.on('message', (msg: { k: number; out: T }) => {
      out[msg.k] = msg.out;
      give();
    });
    w.on('error', fail);
    give();
  })));
  return out;
}

export interface Tournament { matches: MatchOut[]; rows: Row[]; wall: number; workerSeconds: number; meanMinutes: number }
/** The tournament of `n` matches. */
export async function tournament(n = 200, width = availableParallelism()): Promise<Tournament> {
  const t0 = performance.now();
  const matches = (await pool<MatchOut>(Array.from({ length: n }, (_, m) => ({ kind: 'match' as const, m })), width)).sort((a, b) => a.m - b.m);
  return {
    matches, rows: matches.flatMap((x) => x.rows), wall: (performance.now() - t0) / 1000,
    workerSeconds: matches.reduce((a, x) => a + x.ms, 0) / 1000, meanMinutes: matches.reduce((a, x) => a + x.minutes, 0) / n,
  };
}

export const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export const sd = (xs: readonly number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
/** Welch's t of a over b. */
export const welch = (a: readonly number[], b: readonly number[]): number => (mean(a) - mean(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length || 1e-18);

export interface Profile { n: number; mean: Record<Stat, number>; sd: Record<Stat, number>; values: Record<Stat, number[]> }
export function profiles(rows: readonly Row[]): Profile[] {
  return NAMES.map((_, t) => {
    const mine = rows.filter((r) => r.temperament === t);
    const values = Object.fromEntries(STATS.map((f) => [f, mine.map((r) => r[f])])) as Record<Stat, number[]>;
    return { n: mine.length, values, mean: Object.fromEntries(STATS.map((f) => [f, mean(values[f])])) as Record<Stat, number>, sd: Object.fromEntries(STATS.map((f) => [f, sd(values[f])])) as Record<Stat, number> };
  });
}
export const placesByTier = (rows: readonly Row[]): number[][] => Array.from({ length: 8 }, (_, t) => rows.filter((r) => r.tier === t + 1).map((r) => r.place));

/** The compact table: per temperament its means, then mean place by tier. */
export function table(rows: readonly Row[]): string[] {
  const p = profiles(rows), w = [7, 9, 7, 7, 6, 6, 7, 6];
  const lines = [`temperament  ships ${STATS.map((f, k) => f.padStart(w[k])).join('')}`];
  p.forEach((x, t) => lines.push(`${NAMES[t].padEnd(12)} ${String(x.n).padStart(5)} ${STATS.map((f, k) => x.mean[f].toFixed(f === 'sea' || f === 'held' || f === 'purse' || f === 'loot' || f === 'spoils' ? 0 : 2).padStart(w[k])).join(' ')}  sinks gun/ram/fire/rocks/hot/storm ${[0, 1, 2, 3, 4, 5].map((c) => (rows.filter((r) => r.temperament === t).reduce((a, r) => a + r.causes[c], 0) / Math.max(1, x.n)).toFixed(2)).join('/')}`));
  lines.push(`place by tier 1…8: ${placesByTier(rows).map((x) => mean(x).toFixed(2)).join(' ')}`);
  return lines;
}

if (!isMainThread && (workerData as { tournamentWorker?: boolean } | null)?.tournamentWorker) {
  parentPort!.on('message', ({ k, job }: { k: number; job: Job }) => parentPort!.postMessage({ k, out: run(job) }));
} else if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name: string, d: number): number => {
    const k = process.argv.indexOf(`--${name}`);
    return k > 0 ? Number(process.argv[k + 1]) : d;
  };
  const jk = process.argv.indexOf('--json'), json = jk > 0 ? process.argv[jk + 1] : null;
  const n = arg('matches', 200), careers = arg('careers', 0), width = arg('workers', availableParallelism());
  const report: Record<string, unknown> = {};
  if (n > 0) {
    const t = await tournament(n, width);
    console.log(`${n} matches on ${width} workers: ${t.wall.toFixed(1)} s wall, ${t.workerSeconds.toFixed(0)} worker-s, mean match ${t.meanMinutes.toFixed(2)} min`);
    for (const l of table(t.rows)) console.log(l);
    Object.assign(report, { matches: n, wall: t.wall, workerSeconds: t.workerSeconds, meanMinutes: t.meanMinutes, rows: t.rows });
  }
  if (careers > 0) {
    const [ra, rb] = habitRegions(), t0 = performance.now();
    const runs = await pool<CareerMatch[]>(Array.from({ length: careers }, (_, k) => ({ kind: 'career' as const, k, a: { region: ra, temperament: 5 }, b: { region: rb, temperament: 3 }, matches: 10, change: 5 })), width);
    console.log(`${careers} careers, habits ${ra}→${rb}: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    console.log(' j  follow(learn-naive)  now    near    reach  broken  knewRegion knewLoop learnt');
    for (let j = 0; j < 10; j++) {
      const d = (f: keyof Measure): number => mean(runs.map((r) => r[j].learn[f] - r[j].naive[f]));
      console.log(`${String(j + 1).padStart(2)} ${d('follow').toFixed(2).padStart(10)} ${d('followNow').toFixed(2).padStart(14)} ${d('near').toFixed(2).padStart(7)} ${d('reach').toFixed(1).padStart(8)} ${d('broken').toFixed(2).padStart(7)} ${mean(runs.map((r) => r[j].knewRegion)).toFixed(1).padStart(9)} ${mean(runs.map((r) => r[j].knewLoop)).toFixed(1).padStart(8)} ${mean(runs.map((r) => r[j].learnt)).toFixed(1).padStart(6)}`);
    }
    Object.assign(report, { careers: runs, habits: [ra, rb] });
  }
  if (json) {
    mkdirSync(dirname(resolve(json)), { recursive: true });
    writeFileSync(json, JSON.stringify(report));
  }
}
