// One ship of one harness match, second by second: what she is about, where
// she makes for and how far off it is, her route (its cells, and how far its
// end falls short of her goal), her helm's reflexes, her speed and the water
// under and ahead of her, both as the chart has it and as it is. For seeing why
// a bot the harness found pinned is pinned.
//   node tools/harness/inspect.ts --match 4 --ship 25 [--from 30] [--seconds 60]
//     [--brain default] [--planet seed]
//
// Node only (tools/).

import { parseArgs } from 'node:util';
import { createMatches } from '../../src/play/setup.ts';
import { createState, debugOf } from '../../src/play/state.ts';
import { BOT } from '../../src/sim/captain.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { SHIP } from '../../src/sim/handling.ts';
import { cellCentre, clearAt, openAt } from '../../src/sim/route.ts';
import { offCourse } from '../../src/sim/ship.ts';
import { along, distance, toward, type Vec3 } from '../../src/world/sphere.ts';
import { flat } from '../../src/world/swell.ts';
import { brainNamed } from './brains.ts';
import { worldOf } from './world.ts';

const { values: a } = parseArgs({
  options: {
    match: { type: 'string', default: '1' },
    ship: { type: 'string', default: '1' },
    from: { type: 'string', default: '0' },
    seconds: { type: 'string', default: '60' },
    brain: { type: 'string', default: 'default' },
    planet: { type: 'string' },
  },
});
const id = Number(a.ship),
  from = Number(a.from),
  until = from + Number(a.seconds);
const w = worldOf(a.planet ? Number(a.planet) : undefined);
const brain = brainNamed(a.brain);
const matches = createMatches(w.seed, w.planet, null, null);
const state = createState(w.planet, flat, w.waters, matches.first, () => brain);
let m = matches.deal();
for (let k = 1; k < Number(a.match); k++) m = matches.deal();
state.start(m, false);

const open = (p: Vec3) => w.depth(p) >= SHIP.draught + BOT.open;
/** The water ahead each `step` m out to `out`: '.' open, '#' not, 'c' open but not on the chart, 'x' on it but not open. */
const ahead = (at: Vec3, heading: Vec3, out = 60, step = 6) => {
  let s = '';
  for (let d = step; d <= out; d += step) {
    const p = along(at, heading, d).p,
      o = open(p),
      c = openAt(w.waters.chart, p);
    s += o && c ? '.' : !o && !c ? '#' : o ? 'c' : 'x';
  }
  return s;
};
const f = (x: number, n = 0) => x.toFixed(n).padStart(4);

const each = Math.round(1 / STEP),
  idle = { course: null, throttle: 0 },
  still = { aim: null, fire: false };
let steps = 0;
/** Over the last second: where she was at its start, the metres she sailed step by step, and the most in one step. */
let was: Vec3 | null = null,
  sailed = 0,
  most = 0;
console.log(`match ${a.match} (seed ${m.seed}), ship ${id}`);
console.log(
  '   s mode   goal m  route   short  avoid back stuckT  m/s  made/sailed/most-step  depth  chart  leg°/m  ahead(6 m, . open # land c off-chart x chart-only)'
);
while (state.time() < until && state.vessel(id)) {
  const before = state.vessel(id)!.ship.at;
  state.advance(idle, still);
  const now = state.vessel(id);
  if (!now) break;
  const step = distance(before, now.ship.at);
  [sailed, most] = [sailed + step, Math.max(most, step)];
  if (++steps % each !== 0) continue;
  const made = was ? distance(was, now.ship.at) : NaN,
    trip = `${f(made, 1)}/${f(sailed, 1)}/${most.toFixed(2)}`;
  [was, sailed, most] = [now.ship.at, 0, 0];
  if (steps / each < from) continue;
  const v = now,
    k = debugOf(state).mindOf(id)!;
  const r = k.route,
    short = r ? distance(r.to, k.goal) : NaN;
  // her chart cell (open or not, cells clear of shore) and her route's next
  // cell (degrees off her bow, + to port; metres)
  const ch = w.waters.chart,
    here = `${openAt(ch, now.ship.at) ? 'o' : '-'}${clearAt(ch, now.ship.at)}`;
  let leg = '   -    ';
  if (r && r.cells.length > 0) {
    const q = cellCentre(r.cells[Math.min(r.leg, r.cells.length - 1)]),
      t = toward(now.ship.at, q);
    if (t)
      leg = `${f((offCourse(now.ship, t) * 180) / Math.PI)}/${f(distance(now.ship.at, q))}`;
  }
  console.log(
    `${f(steps / each)} ${k.mode.padEnd(6)} ${f(distance(v.ship.at, k.goal))}  ` +
      `${r ? `${String(r.cells.length).padStart(3)}c leg${r.leg}` : '  none  '} ${f(short)}  ` +
      `${f(k.avoid, 1)} ${f(k.backT, 1)} ${f(k.stuckT, 1)}  ${f(v.ship.speed, 1)}  ${trip.padEnd(20)} ${f(w.depth(v.ship.at), 1)}   ${here.padEnd(4)} ${leg}  ` +
      `${ahead(v.ship.at, v.ship.heading)}`
  );
}
const last = state.vessel(id);
if (!last) console.log(`ship ${id} sunk at ${state.time().toFixed(0)} s`);
else console.log(`her ship at the end: ${JSON.stringify(last.ship)}`);
