// A bot's faults (DEPTH.md A): faulted, she wants mending more (purser.ts) and
// her own water more; lamed, her rigging or rudder faulted, she runs the less
// and, cornered, fights the more (fighting.ts). Each part reads its own slice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crewOf, type Crew } from '../src/sim/battle.ts';
import { mind } from '../src/sim/bot.ts';
import { DEFAULT_BRAIN } from '../src/sim/brain.ts';
import type { Ctx, Seen } from '../src/sim/captain.ts';
import { UNWORN, type Wear } from '../src/sim/faults.ts';
import { fightUrge, fleeUrge } from '../src/sim/fighting.ts';
import { healAct, healUrge } from '../src/sim/purser.ts';
import { shipAt } from '../src/sim/ship.ts';
import { temper } from '../src/sim/temper.ts';
import {
  R,
  along,
  dot,
  frameAt,
  fromLatLon,
  type Vec3,
} from '../src/world/sphere.ts';

const centre = fromLatLon(0.2, 0.3),
  east = frameAt(centre).east;
/** Her crew at `hull` (no shield), her tallies `zones`, a repair kit or not. */
const crew = (hull: number, zones: Wear['zones'], kit = false): Crew => {
  const c = crewOf(1);
  return {
    ...c,
    health: { hull, shield: 100 },
    wear: { ...UNWORN, zones },
    hold: {
      ...c.hold,
      items: [kit ? { kind: 'repairKit', count: 1 } : null, null, null],
    },
  };
};
/** Her own water: the sea more than `from` m east of her. */
const holdings = (from: number) => ({
  ownerAt: (p: Vec3) => (dot(p, east) * R > from ? 1 : -1),
});
/**
 * A think of her crew `c`, a foe `foeD` m to her north (or none), her own
 * water `water` m east of her (or no hold on the sea), and a temper that tops
 * up late.
 */
const ctx = (c: Crew, foeD = Infinity, water: number | null = 100): Ctx => {
  const ship = shipAt(centre, east),
    own: Seen = { id: 1, ship, hull: c.health.hull, crew: c },
    foe: Seen | null = Number.isFinite(foeD)
      ? {
          id: 2,
          ship: shipAt(along(centre, frameAt(centre).north, foeD).p, east),
        }
      : null;
  return {
    own,
    others: foe ? [foe] : [],
    sea: { depth: () => 30, holdings: water === null ? null : holdings(water) },
    m: mind(1, centre),
    b: DEFAULT_BRAIN,
    t: { ...temper(1), mend: 10, skill: 0, run: 50, fight: 0.4 },
    foe,
    foeD,
    seed: 1,
  };
};

test('faulted, she wants mending by her stores more: a minor fault at least 0.6, a major wholly', () => {
  const whole = healUrge(ctx(crew(38, [0, 0, 0, 0], true))),
    minor = healUrge(ctx(crew(38, [5, 0, 0, 0], true))),
    major = healUrge(ctx(crew(20, [5, 0, 0, 0], true)));
  assert.equal(whole, 0);
  assert.ok(minor >= 0.6 - 1e-9 && minor < 1, `${minor}`);
  assert.ok(major > minor, `${major}`);
});

test('under 25 hull with nothing to mend with, she makes for her own water near her, and sits in it once there', () => {
  const low = ctx(crew(15, [5, 0, 0, 0]));
  assert.ok(healUrge(low) > 0.5, `${healUrge(low)}`);
  const to = healAct(low, () => centre);
  assert.equal(low.sea.holdings?.ownerAt(to), 1, 'the goal is her water');
  // in it, she stays; none within reach, no hold on the sea, or her hull at 25: no urge
  const there = ctx(crew(15, [5, 0, 0, 0]), Infinity, -10);
  assert.equal(
    healAct(there, () => centre),
    there.own.ship.at
  );
  assert.equal(healUrge(ctx(crew(15, [5, 0, 0, 0]), Infinity, 400)), 0);
  assert.equal(healUrge(ctx(crew(15, [5, 0, 0, 0]), Infinity, null)), 0);
  assert.equal(healUrge(ctx(crew(25, [5, 0, 0, 0]))), 0);
  // with a foe close, not at all
  assert.equal(healUrge(ctx(crew(15, [5, 0, 0, 0]), 40)), 0);
});

test('lamed, her rigging or her rudder faulted, she runs the less; her waterline, as much as whole', () => {
  const whole = fleeUrge(ctx(crew(20, [0, 0, 0, 0]), 100)),
    rigging = fleeUrge(ctx(crew(20, [5, 0, 0, 0]), 100)),
    rudder = fleeUrge(ctx(crew(30, [0, 5, 0, 0]), 100)),
    waterline = fleeUrge(ctx(crew(20, [0, 0, 5, 0]), 100));
  assert.ok(whole > 0.9, `${whole}`);
  assert.ok(Math.abs(rigging - whole * 0.4) < 1e-9, `${rigging}`);
  assert.ok(Math.abs(rudder - whole * 0.7) < 1e-9, `${rudder}`);
  assert.equal(waterline, whole);
});

test('lamed and cornered, her foe within letGo, she fights the more; further off, no more than whole', () => {
  const at = (zones: Wear['zones'], d: number) =>
    fightUrge(ctx(crew(20, zones), d));
  assert.ok(at([5, 0, 0, 0], 70) > at([0, 0, 0, 0], 70));
  assert.ok(at([0, 5, 0, 0], 70) > at([0, 0, 0, 0], 70));
  assert.equal(at([5, 0, 0, 0], 140), at([0, 0, 0, 0], 140));
});
