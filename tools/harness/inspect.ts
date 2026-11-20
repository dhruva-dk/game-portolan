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
import { createState } from '../../src/play/state.ts';
import { BOT } from '../../src/sim/captain.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { SHIP } from '../../src/sim/handling.ts';
import { openAt } from '../../src/sim/route.ts';
import { along, distance, type Vec3 } from '../../src/world/sphere.ts';
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
console.log(`match ${a.match} (seed ${m.seed}), ship ${id}`);
console.log(
  '   s mode   goal m  route   short  avoid back stuckT  m/s  depth  ahead(6 m, . open # land c off-chart x chart-only)'
);
while (state.time() < until && state.vessel(id)) {
  state.advance(idle, still);
  if (++steps % each !== 0 || steps / each < from) continue;
  const v = state.vessel(id)!,
    k = state.debug.mindOf(id)!;
  const r = k.route,
    short = r ? distance(r.to, k.goal) : NaN;
  console.log(
    `${f(steps / each)} ${k.mode.padEnd(6)} ${f(distance(v.ship.at, k.goal))}  ` +
      `${r ? `${String(r.cells.length).padStart(3)}c leg${r.leg}` : '  none  '} ${f(short)}  ` +
      `${f(k.avoid, 1)} ${f(k.backT, 1)} ${f(k.stuckT, 1)}  ${f(v.ship.speed, 1)} ${f(w.depth(v.ship.at), 1)}  ` +
      `${ahead(v.ship.at, v.ship.heading)}`
  );
}
const last = state.vessel(id);
if (!last) console.log(`ship ${id} sunk at ${state.time().toFixed(0)} s`);
else console.log(`her ship at the end: ${JSON.stringify(last.ship)}`);
