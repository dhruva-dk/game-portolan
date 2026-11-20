// Whether a ship set down as given can get herself off: from her state (JSON,
// as inspect.ts prints it), each helm tried alone for some seconds (hard to
// port, hard to starboard, amidships; at a crawl and at full), on the fleet's
// own step with no one else afloat. Prints how far each took her and how far
// it swung her head, and the water under each point of her hull at the start.
//   node tools/harness/wedge.ts '<ship JSON>' [--seconds 10] [--planet seed]
//
// Node only (tools/).

import { parseArgs } from 'node:util';
import { afloat, stepFleet } from '../../src/sim/contact.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { SHIP } from '../../src/sim/handling.ts';
import { turned, type ShipState } from '../../src/sim/ship.ts';
import { clearance } from '../../src/sim/shoal.ts';
import { BOT } from '../../src/sim/captain.ts';
import { along, distance, dot } from '../../src/world/sphere.ts';
import { worldOf } from './world.ts';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seconds: { type: 'string', default: '10' },
    planet: { type: 'string' },
  },
});
const start = JSON.parse(positionals[0]) as ShipState;
const w = worldOf(a.planet ? Number(a.planet) : undefined);
const c = clearance(start.at, start.heading, w.depth);
console.log(
  `draught ${SHIP.draught} m; depth amidships ${w.depth(start.at).toFixed(2)} m; least under her hull ${c.least.toFixed(2)} m`
);
// the water round her: each 30° from her bow (to port), open ('.') or not ('#')
// each 6 m out to 60
for (let deg = 0; deg < 360; deg += 30) {
  const t = turned(start, (deg * Math.PI) / 180);
  let s = '';
  for (let d = 6; d <= 60; d += 6)
    s +=
      w.depth(along(start.at, t, d).p) >= SHIP.draught + BOT.open ? '.' : '#';
  console.log(`${String(deg).padStart(3)}° ${s}`);
}
for (const throttle of [0.35, 1])
  for (const [name, turn] of [
    ['port', 2.4],
    ['starboard', -2.4],
    ['amidships', 0],
  ] as const) {
    let fleet = [afloat(0, start)];
    for (let t = 0; t < Number(a.seconds); t += STEP) {
      const s = fleet[0].ship;
      fleet = stepFleet(
        fleet,
        [{ course: turned(s, turn), throttle }],
        STEP,
        w.depth
      ).fleet;
    }
    const end = fleet[0].ship,
      swung = Math.acos(
        Math.max(-1, Math.min(1, dot(end.heading, start.heading)))
      );
    console.log(
      `${name.padEnd(9)} at ${throttle}: moved ${distance(start.at, end.at).toFixed(1)} m, ` +
        `head swung ${((swung * 180) / Math.PI).toFixed(0)}°, ${end.speed.toFixed(1)} m/s`
    );
  }
