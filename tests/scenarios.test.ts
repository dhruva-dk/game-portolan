// Set pieces: a few ships placed just so on a made sea, sailed some seconds by
// their bots, and what came of it. Each stands for a behaviour the harness
// (tools/harness) measured over whole matches, held here in miniature, fast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crewOf } from '../src/sim/battle.ts';
import { DEFAULT_BRAIN, nature, type Brain } from '../src/sim/brain.ts';
import { mind, think, type Memory, type Seen } from '../src/sim/bot.ts';
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
import type { Depth } from '../src/sim/shoal.ts';
import {
  along,
  distance,
  frameAt,
  fromLatLon,
  toward,
  type Vec3,
} from '../src/world/sphere.ts';

const c0 = fromLatLon(0.3, 0.1);
const { east, north } = frameAt(c0);
/** The point `e` m east and `n` m north of c0. */
const at = (e: number, n: number) => along(along(c0, east, e).p, north, n).p;

/** Open sea 30 m deep, with round islands (centre, radius m) 10 m high. */
const islands =
  (...isles: [Vec3, number][]): Depth =>
  (p) =>
    isles.some(([c, r]) => distance(p, c) < r) ? -10 : 30;

/** Whether land stands between a and b (as the bots' lookout has it). */
function blocked(depth: Depth, a: Vec3, b: Vec3): boolean {
  const t = toward(a, b);
  if (!t) return false;
  for (let s = 5; s < distance(a, b); s += 5)
    if (-depth(along(a, t, s).p) > 2.5) return true;
  return false;
}

/**
 * A battered, unarmed bot at c0 heading north, with an armed foe lying still
 * 100 m west of her, sailed `seconds` with `brain` on a chart of `depth`: her
 * modes in turn, the seconds land hid her from her foe, and the seconds she
 * made good less than a metre in.
 */
function run(depth: Depth, brain: Brain, seconds: number) {
  const ch = chart(depth),
    crew = { ...crewOf(0), health: { hull: 12, shield: 0 } },
    foe: Seen = {
      id: 1,
      ship: shipAt(at(-100, 0), east),
      hull: 100,
      shield: 50,
      armed: true,
    },
    second = Math.round(1 / STEP);
  let fleet: Vessel[] = [afloat(0, shipAt(c0, north))],
    m: Memory = mind(5, c0),
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
    const own: Seen = { ...fleet[0], crew, hull: 12, shield: 0, armed: false };
    const r = think(own, [foe], { depth, chart: ch }, m, nature(5, brain));
    m = r.memory;
    if (modes.at(-1) !== m.mode) modes.push(m.mode);
    fleet = stepFleet(fleet, [r.helm], STEP, depth).fleet;
  }
  return { modes, hidden, pinned };
}

// an island 70 m off to the east-north-east, its near side some 40 m off her,
// on her way out of her foe's sight
const isle = islands([at(60, 35), 28]);

test('a bot running from a foe makes for cover behind an island off her bow, out of his sight; told never to, she runs on in plain view', () => {
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

test("a bot routed round an island's shoulder keeps her bow off it: she is never pinned on it, by either way round", () => {
  // (her route's look ahead once cut the shoulder through the cells by the
  // shore, and she lay with her bow on it for good: ROUTE.wide)
  for (const cover of [DEFAULT_BRAIN.mind.cover, 0]) {
    const r = run(
      isle,
      { ...DEFAULT_BRAIN, mind: { ...DEFAULT_BRAIN.mind, cover } },
      16
    );
    assert.equal(r.pinned, 0, `cover ${cover}: ${r.modes.join(' ')}`);
  }
});

/** Metres east and north of c0, of a point near it. */
function en(p: Vec3): [number, number] {
  const t = toward(c0, p),
    d = distance(c0, p);
  if (!t) return [0, 0];
  const dot = (b: Vec3) => t[0] * b[0] + t[1] * b[1] + t[2] * b[2];
  return [d * dot(east), d * dot(north)];
}

test('the way into the calm leads round the end of a long wall, where a route given up on runs to the wall nearest it', () => {
  // a wall of land 20 m thick from 300 m west to 200 m east; she lies 50 m
  // south of it, the calm's heart 60 m north
  const depth: Depth = (p) => {
      const [e, n] = en(p);
      return Math.abs(n) < 10 && e > -300 && e < 200 ? -10 : 30;
    },
    ch = chart(depth),
    heart = at(0, 60),
    from = at(0, -50);
  // the pathfinder given little work gives up, its route ending at the wall
  const gaveUp = findPath(ch, from, heart, 200);
  assert.ok(!gaveUp.found);
  // the field, found a share at a time, leads round
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
