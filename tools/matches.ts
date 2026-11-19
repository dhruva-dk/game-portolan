// Whole matches of bots, no browser needed: how they arm themselves from the loot, and how they end.
//   node tools/matches.ts [matches=3] [seed]
// Each match is the game's own (play/state.ts start and advance, the matches dealt as play/setup.ts deals them), every
// ship a bot, hers too, on a flat sea (the waves only lift the drawn ships). Prints, per match, the share of ships
// afloat that are armed at 30, 60 and 120 s and the share with a shield or something to mend with, how the ships were
// sunk, how and when it ended, the balls fired and how many struck home, and the bots stuck: any that moved less than STUCK m in WINDOW s, told apart by her
// speed over it: aground (under AGROUND m/s), or sailing round in circles (fighting round a foe, going for a piece
// near her, or roaming, a new mark every few seconds on any bearing). And who holds the sea
// (sim/territory.ts): the share of the planet held at 30, 60, 120, 240 s and at the end (all ships', and the most
// any one holds), the loops closed and cut, and the shield their own water gave back.

import { STEP } from '../src/sim/fixed.ts';
import { KINDS } from '../src/kinds.ts';
import { GUNS, SHIP } from '../src/sim/handling.ts';
import { LOOT } from '../src/sim/loot.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { STORM } from '../src/sim/storm.ts';
import { createMatches } from '../src/play/setup.ts';
import { createState } from '../src/play/state.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/world/planet.ts';
import { distance, type Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

/** A bot is stuck if she moves less than STUCK m in WINDOW s. */
const STUCK = 15, WINDOW = 30, AGROUND = 2;
const games = Number(process.argv[2] ?? 3), seed = Number(process.argv[3] ?? SEED);
const t0 = performance.now();
const planet = planetOf(seed, landOf(seed));
const depth = (p: Vec3) => -planet.height(p);
const waters = { chart: chart(depth), water: berthing(depth) };
const matches = createMatches(seed, planet, null, null);
const state = createState(planet, flat, waters, matches.first);
console.log(`planet, chart and berths in ${(performance.now() - t0).toFixed(0)} ms`);
const end = STORM.phases.reduce((t, p) => t + p.wait + p.close, 0) + 120;
const idle = { course: null, throttle: 0 }, still = { aim: null, fire: false };

for (let g = 0; g < games; g++) {
  const m = matches.deal();
  state.start(m, false);
  const loot = state.loot().pieces, shallow = loot.filter((l) => depth(l.at) < SHIP.draught + LOOT.open).length;
  const marks: string[] = [], track = new Map<number, { at: Vec3; speed: number }[]>();
  const stuck = new Map<number, { from: number; seconds: number; speed: number }>();
  let steps = 0;
  const held: string[] = [];
  /** The share of the planet held, all ships' and the most of one, per cent. */
  const holding = () => {
    const shares = state.ships().map((k) => state.share(k.id));
    return `${(100 * shares.reduce((a, b) => a + b, 0)).toFixed(2)}% (most ${(100 * Math.max(...shares)).toFixed(2)}%)`;
  };
  /** The match's loops (closed, the square metres they took, cut by another, cut by herself or given up) and the shield
   *  each ship's own water gave back, from what each step did. */
  const loops = { closed: 0, metres: 0, cut: 0, own: 0 }, back = new Map<number, number>();
  const balls = { fired: 0, struck: 0 };
  /** By kind: shots fired, balls fired (a scatter's pellets each), and balls come down short of a ship. */
  const kinds = new Map(KINDS.map((k) => [k, { shots: 0, balls: 0, fell: 0 }]));
  /** Each ship's first second with a gun, and with two of different kinds; the quiet longest after the first 30 s. */
  const first = new Map<number, number>(), second = new Map<number, number>();
  let lastShot = 0, quiet = 0;
  let seen = -Infinity;
  const t1 = performance.now();
  while (state.alive().length > 1 && state.time() < end) {
    const did = state.advance(idle, still);
    for (const k of did.held?.claimed ?? []) [loops.closed, loops.metres] = [loops.closed + 1, loops.metres + k.metres];
    for (const k of did.held?.cut ?? []) {
      if (k.by !== null && k.by !== k.id) loops.cut++;
      else loops.own++;
    }
    for (const k of did.regained) back.set(k.id, (back.get(k.id) ?? 0) + k.shield);
    // the balls fired and struck home this step (what the guns did, kept for the frame: those newer than the last seen)
    for (const b of state.blasts()) {
      if (b.time <= seen) continue;
      if (b.kind === 'shot') {
        balls.fired++;
        const k = kinds.get(b.gun)!;
        k.shots++;
        k.balls += GUNS[b.gun].pellets;
        const now = state.time();
        if (now > 30) quiet = Math.max(quiet, now - Math.max(30, lastShot));
        lastShot = now;
      } else if (b.kind === 'strike' && !b.ram) balls.struck++;
      else if (b.kind === 'splash') kinds.get(b.gun)!.fell++;
    }
    seen = Math.max(seen, ...state.blasts().map((b) => b.time));
    steps++;
    const t = Math.round(state.time() / STEP);
    if (t % Math.round(1 / STEP) === 0) {
      // once a second: where each ship afloat is, and whether she has moved STUCK m in the last WINDOW s
      const s = Math.round(t * STEP);
      for (const k of state.ships()) {
        if (!k.afloat) continue;
        const guns = state.crew(k.id).guns.filter((x) => x !== null);
        if (guns.length > 0 && !first.has(k.id)) first.set(k.id, s);
        if (new Set(guns.map((x) => x.kind)).size > 1 && !second.has(k.id)) second.set(k.id, s);
      }
      for (const v of state.vessels()) {
        const path = track.get(v.id) ?? [];
        path.push({ at: v.ship.at, speed: v.ship.speed });
        track.set(v.id, path);
        if (path.length > WINDOW && distance(path[path.length - 1 - WINDOW].at, v.ship.at) < STUCK) {
          const k = stuck.get(v.id), speed = path.slice(-WINDOW).reduce((a, q) => a + q.speed, 0) / WINDOW;
          stuck.set(v.id, k ? { ...k, seconds: k.seconds + 1, speed: Math.min(k.speed, speed) } : { from: s - WINDOW, seconds: WINDOW, speed });
        }
      }
      if ([30, 60, 120, 240].includes(s)) held.push(`${s} s ${holding()}`);
      if ([30, 60, 120].includes(s)) {
        const up = state.ships().filter((k) => k.afloat), armed = up.filter((k) => k.armed).length;
        const stocked = up.filter((k) => k.shield > 0 || state.crew(k.id).hold.items.some((x) => x)).length;
        marks.push(`${s} s: ${armed}/${up.length} armed (${((100 * armed) / up.length).toFixed(0)}%), ${stocked} shielded or stocked`);
      }
    }
  }
  const ms = performance.now() - t1, causes = { shot: 0, ram: 0, storm: 0 };
  let credited = 0;
  for (const k of state.sinkings()) {
    causes[k.cause]++;
    if (k.cause === 'storm' && k.by !== null) credited++;
  }
  const left = state.alive();
  console.log(`match ${g + 1} (seed ${m.seed}): ${left.length} left at ${state.time().toFixed(0)} s${left.length === 1 ? ` (ship ${left[0]} wins)` : ''};`
    + ` sunk by shot ${causes.shot}, ram ${causes.ram}, storm ${causes.storm} (${credited} credited); ${(ms / steps).toFixed(2)} ms a step`);
  console.log(`  balls: ${balls.fired} fired, ${balls.struck} struck home (${((100 * balls.struck) / Math.max(1, balls.fired)).toFixed(0)}%)`);
  console.log(`  by kind: ${[...kinds].map(([k, n]) => `${k} ${n.shots} shots ${n.balls ? (100 * (1 - n.fell / n.balls)).toFixed(0) : '-'}% home`).join(', ')}`);
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1] ?? NaN, ships = state.ships().length;
  const firsts = [...first.values()], seconds2 = [...second.values()];
  console.log(`  armed: ${firsts.length}/${ships} found a gun, median ${median(firsts)} s, 90% by ${firsts.sort((a, b) => a - b)[Math.floor(0.9 * firsts.length)] ?? NaN} s;`
    + ` ${seconds2.length} a second kind, median ${median(seconds2)} s; the longest quiet after 30 s, ${quiet.toFixed(0)} s with no shot`);
  console.log(`  loot: ${loot.length} pieces at the start, ${shallow} in water too shoal to reach`);
  for (const k of marks) console.log(`  ${k}`);
  const l = loops, regained = [...back.values()];
  console.log(`  held: ${held.join(', ')}, end ${holding()}`);
  console.log(`  loops: ${l.closed} closed (${l.metres.toFixed(0)} m²), ${l.cut} cut by another, ${l.own} cut by herself or given up;`
    + ` shield from her water ${regained.reduce((a, b) => a + b, 0).toFixed(0)} hp over ${regained.filter((k) => k > 0).length} ships`);
  const all = [...stuck.values()], aground = all.filter((k) => k.speed < AGROUND);
  const seconds = all.map((k) => k.seconds).sort((a, b) => a - b), speeds = all.map((k) => k.speed).sort((a, b) => a - b);
  // (a ship circling in her own water, way on, moves little over WINDOW s: her speed tells her from one lying still)
  console.log(`  stuck (<${STUCK} m in ${WINDOW} s): ${all.length} ships, ${aground.length} of them aground;`
    + ` ${all.filter((k) => k.from < 30).length} from the first 30 s; seconds stuck, median ${seconds[seconds.length >> 1] ?? 0}, most ${seconds.at(-1) ?? 0};`
    + ` their slowest mean speed, median ${(speeds[speeds.length >> 1] ?? 0).toFixed(1)} m/s`);
}
