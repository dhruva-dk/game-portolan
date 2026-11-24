import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChase } from '../src/play/chase.ts';
import { battleOf, crewOf, stepBattle } from '../src/sim/battle.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf, laid, spreadOf } from '../src/sim/gun.ts';
import { spreadBy } from '../src/sim/gunner.ts';
import { GUN } from '../src/sim/handling.ts';
import { loosed } from '../src/sim/shot.ts';
import { offSight, type Sight } from '../src/sim/sight.ts';
import { shipAt, turned } from '../src/sim/ship.ts';
import {
  R,
  add,
  along,
  cross,
  dot,
  frameAt,
  fromLatLon,
  normalize,
  scale,
} from '../src/world/sphere.ts';
import type { ShipValues } from '../src/sim/setup.ts';
import { EVEN_SHIP, WORST } from './setups.ts';

const deep = () => 30,
  N = 200;
const center = fromLatLon(0.2, 0.3);

function sightOn(v: Vessel, o: Vessel, off: number): Sight {
  const chase = createChase(
    () => -30,
    () => 0
  );
  const toward = normalize(
    add(o.ship.at, v.ship.at, -dot(o.ship.at, v.ship.at))
  );
  chase.reset(
    { position: scale(v.ship.at, R), forward: toward, up: v.ship.at },
    0
  );
  const from = chase.sight().from,
    up = normalize(from);
  const d = normalize(add(scale(o.ship.at, R + GUN.freeboard / 2), from, -1));
  const swung = (a: number): Sight => ({
    from,
    dir: normalize(
      add(
        add(scale(d, Math.cos(a)), cross(up, d), Math.sin(a)),
        up,
        dot(up, d) * (1 - Math.cos(a))
      )
    ),
  });
  let a = 0;
  while (off !== 0 && offSight(swung(a), o.ship)!.angle < Math.abs(off))
    a += Math.sign(off) * 1e-4;
  return swung(a);
}

function rate(
  meters: number,
  off = 0,
  k = 1,
  values: ShipValues = EVEN_SHIP
): number {
  let hits = 0;
  for (let n = 0; n < N; n++) {
    const bearing = 0.3 + n * 0.031,
      side = n % 2 ? 1 : -1;
    const a = shipAt(center, frameAt(center).east),
      toward = turned(a, bearing);
    const p = along(center, toward, meters).p,
      b = shipAt(p, frameAt(p).east);
    let fleet: Vessel[] = [
      afloat(1, a),
      afloat(2, {
        ...b,
        heading: turned(b, bearing + (side * Math.PI) / 2),
        speed: WORST.topSpeed,
      }),
    ];
    const gun = { ...gunOf('cannon'), fired: n };
    const lay = laid(
      fleet[0],
      gun,
      sightOn(fleet[0], fleet[1], off * side),
      fleet,
      {
        seed: 11,
        depth: deep,
        spread: spreadOf('cannon', values.spreadFactor) * k,
        cone: values.assistCone,
      }
    );
    let battle = {
        ...battleOf([crewOf(1, WORST), crewOf(2, WORST)], 0),
        balls: [loosed(1, 'cannon', lay.from, lay.dirs[0], lay.speed, 1)],
      },
      struck = false;
    for (let i = 0; i < 300 && battle.balls.length && !struck; i++) {
      fleet = stepFleet(
        fleet,
        [
          { course: null, throttle: 0 },
          { course: null, throttle: 1 },
        ],
        STEP,
        deep,
        fleet.map(() => WORST)
      ).fleet;
      const r = stepBattle(
        battle,
        fleet,
        fleet.map(() => ({ aim: null, fire: false })),
        [],
        STEP,
        deep
      );
      battle = r.battle;
      struck = r.strikes.length > 0;
    }
    if (struck) hits++;
  }
  return hits / N;
}

const RANGES = [60, 100, 120, 150, 180];
const row = (f: (m: number) => number) => RANGES.map(f);
const show = (rates: number[]) =>
  rates.map((r, i) => `${RANGES[i]} m ${Math.round(100 * r)}%`).join(', ');

test('the reticle on a crossing ship: a gun strikes it 9 balls in 10 or more out to 180 m', () => {
  const on = row((m) => rate(m));
  console.log(`# on it: ${show(on)}`);
  for (const r of on) assert.ok(r >= 0.88, show(on));
});

test("the assist: a thumb's slip (2° off its body) is led onto it; well off it (5°) it is not", () => {
  const slip = row((m) => rate(m, 2 * (Math.PI / 180))),
    wide = row((m) => rate(m, 5 * (Math.PI / 180)));
  console.log(`# 2° off: ${show(slip)}`);
  console.log(`# 5° off: ${show(wide)}`);
  for (let i = 0; i < 4; i++) assert.ok(slip[i] >= 0.85, show(slip));
  for (const r of wide) assert.ok(r <= 0.25, show(wide));
});

test("a bot's unsteady hand: a green captain's balls strike less often than a sharp one's", () => {
  const green = row((m) => rate(m, 0, spreadBy(0))),
    sharp = row((m) => rate(m, 0, spreadBy(1)));
  console.log(`# a green captain's hand: ${show(green)}`);
  for (let i = 1; i < RANGES.length; i++)
    assert.ok(green[i] < sharp[i] - 0.15, `${show(green)} / ${show(sharp)}`);
});
