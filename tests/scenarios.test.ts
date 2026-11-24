import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crewOf } from '../src/sim/battle.ts';
import { DEFAULT_BRAIN, type Brain } from '../src/sim/brain.ts';
import { nature } from '../src/sim/persona.ts';
import {
  mind,
  think,
  type Memory,
  type Own,
  type Seen,
} from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import {
  building,
  chart,
  downField,
  findPath,
  openAt,
} from '../src/sim/route.ts';
import { shipAt } from '../src/sim/ship.ts';
import { eye } from '../src/sim/lookout.ts';
import { temper } from '../src/sim/temper.ts';
import type { Depth } from '../src/sim/shoal.ts';
import {
  along,
  distance,
  frameAt,
  fromLatLon,
  toward,
  type Vec3,
} from '../src/world/sphere.ts';
import { WORST } from './setups.ts';

const c0 = fromLatLon(0.3, 0.1);
const { east, north } = frameAt(c0);
const at = (e: number, n: number) => along(along(c0, east, e).p, north, n).p;

const islands =
  (...isles: [Vec3, number][]): Depth =>
  (p) =>
    isles.some(([c, r]) => distance(p, c) < r) ? -10 : 30;

function blocked(depth: Depth, a: Vec3, b: Vec3): boolean {
  const t = toward(a, b);
  if (!t) return false;
  for (let s = 5; s < distance(a, b); s += 5)
    if (-depth(along(a, t, s).p) > 2.5) return true;
  return false;
}

const SEED = (() => {
  let s = 1;
  while (eye(temper(s)) < 150) s++;
  return s;
})();

function run(depth: Depth, brain: Brain, seconds: number) {
  const ch = chart(depth),
    crew = {
      ...crewOf(0, WORST),
      health: { hull: 12, shield: 0, most: WORST.hullPoints },
    },
    foe: Seen = {
      id: 1,
      ship: shipAt(at(-100, 0), east),
      hull: 100,
      shield: 50,
    },
    second = Math.round(1 / STEP);
  let fleet: Vessel[] = [afloat(0, shipAt(c0, north))],
    m: Memory = mind(SEED, c0),
    hidden = 0,
    pinned = 0,
    was = c0;
  const modes: string[] = [];
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const here = fleet[0].ship.at;
    if (blocked(depth, foe.ship.at, here)) hidden += STEP;
    if (n % second === 0) {
      if (n > 0 && distance(was, here) < 1) pinned++;
      was = here;
    }
    const own: Own = { ...fleet[0], crew, hull: 12, shield: 0 };
    const r = think(own, [foe], { depth, chart: ch }, m, nature(SEED, brain));
    m = r.memory;
    if (modes.at(-1) !== m.mode) modes.push(m.mode);
    fleet = stepFleet(
      fleet,
      [r.helm],
      STEP,
      depth,
      fleet.map(() => WORST)
    ).fleet;
  }
  return { modes, hidden, pinned };
}

const isle = islands([at(60, 35), 28]);

test('a bot running from a foe makes for cover behind an island off its bow, out of its sight; told never to, it runs on in plain view', () => {
  const hid = run(isle, DEFAULT_BRAIN, 16),
    plain = run(
      isle,
      { ...DEFAULT_BRAIN, mind: { ...DEFAULT_BRAIN.mind, cover: 0 } },
      16
    ),
    told = `hidden ${hid.hidden.toFixed(1)} s (${hid.modes.join(' ')}) vs ${plain.hidden.toFixed(1)} s (${plain.modes.join(' ')})`;
  assert.ok(hid.modes.includes('flee') && plain.modes.includes('flee'), told);
  assert.ok(hid.hidden > plain.hidden + 3, told);
});

test("a bot routed round an island's shoulder keeps its bow off it: it is never pinned on it, by either way round", () => {
  for (const cover of [DEFAULT_BRAIN.mind.cover, 0]) {
    const r = run(
      isle,
      { ...DEFAULT_BRAIN, mind: { ...DEFAULT_BRAIN.mind, cover } },
      16
    );
    assert.equal(r.pinned, 0, `cover ${cover}: ${r.modes.join(' ')}`);
  }
});

function en(p: Vec3): [number, number] {
  const t = toward(c0, p),
    d = distance(c0, p);
  if (!t) return [0, 0];
  const dot = (b: Vec3) => t[0] * b[0] + t[1] * b[1] + t[2] * b[2];
  return [d * dot(east), d * dot(north)];
}

test('the way into the calm leads round the end of a long wall, where a route given up on runs to the wall nearest it', () => {
  const depth: Depth = (p) => {
      const [e, n] = en(p);
      return Math.abs(n) < 10 && e > -300 && e < 200 ? -10 : 30;
    },
    ch = chart(depth),
    heart = at(0, 60),
    from = at(0, -50);
  const gaveUp = findPath(ch, from, heart, 200);
  assert.ok(!gaveUp.found);
  const f = building(ch, (p) => distance(p, heart) < 30);
  let shares = 0;
  while (!f.build(5000)) shares++;
  assert.ok(shares > 2, `whole in ${shares + 1} shares`);
  let p = from,
    hops = 0,
    furthestEast = 0;
  for (; hops < 200; hops++) {
    const to = downField(ch, f.field, p);
    if (!to) break;
    assert.ok(openAt(ch, to));
    p = to;
    furthestEast = Math.max(furthestEast, en(p)[0]);
  }
  assert.ok(distance(p, heart) < 40, `ended ${en(p).map(Math.round)}`);
  assert.ok(furthestEast > 200, `round the east end: ${furthestEast}`);
});
