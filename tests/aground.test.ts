import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, debugOf, type Match } from '../src/sim/engine.ts';
import { STILL, type Hands } from '../src/sim/hands.ts';
import { PLAYER } from '../src/sim/match.ts';
import { clearance, under } from '../src/sim/shoal.ts';
import { calm } from '../src/sim/storm.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gap } from '../src/sim/contact.ts';
import { RAM } from '../src/sim/handling.ts';
import type { Helm, ShipState } from '../src/sim/ship.ts';
import { watersAt, type Waters } from '../src/sim/waters.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { seedOf } from '../src/world/seeds.ts';
import {
  along,
  bearingAt,
  distance,
  dot,
  frameAt,
  normalize,
  type Vec3,
} from '../src/world/sphere.ts';
import { setupOf } from './setups.ts';
import { OPEN, SECOND, waters } from './small.ts';

interface Pose {
  at: Vec3;
  bearing: number;
}

const WEDGED: Pose = {
  at: normalize([0.5348627248074604, -0.5517973673830988, -0.6398761840861248]),
  bearing: -2.302679458470532,
};
const NOTCHED: Pose = {
  at: normalize([-0.48527048927222743, 0.7571533740190067, -0.43730003481949]),
  bearing: 1.5274157701964295,
};

function aground(pose: Pose, player: boolean, match = 1): Match {
  const m = createMatch(
    setupOf(match, { teams: 2, perTeam: 1, player }),
    waters
  );
  debugOf(m).rig({ storm: () => calm(OPEN) });
  debugOf(m).atSea(pose, [
    { at: OPEN, heading: bearingAt(OPEN, 0), lashed: null },
  ]);
  return m;
}

const own = (m: Match) => m.view.vessel(PLAYER)!.ship;

function voyage(
  m: Match,
  seconds: number,
  hands: (m: Match) => Hands,
  sea: Waters = waters
) {
  const from = own(m).at,
    first = clearance(from, own(m).heading, sea.depth).least;
  let least = Infinity,
    out = Infinity,
    still = 0,
    longest = 0,
    idle = 0,
    last = from;
  for (let i = 0; i < Math.round(seconds * SECOND); i++) {
    m.step(hands(m));
    const s = own(m);
    least = Math.min(least, clearance(s.at, s.heading, sea.depth).least);
    if (out === Infinity && distance(from, s.at) > 30) out = i / SECOND;
    still = distance(last, s.at) < 0.1 * STEP ? still + STEP : 0;
    if (out === Infinity) {
      longest = Math.max(longest, still);
      if (still > 0) idle = Math.max(idle, s.speed);
    }
    last = s.at;
  }
  return { first, least, out, longest, idle, off: distance(from, last) };
}

const dry = (v: { first: number; least: number }) =>
  v.least >= Math.min(v.first, 0) - 1e-9;

test('where bots lay for minutes: bow on a bank it faces, and nowhere to sail on to', () => {
  for (const pose of [WEDGED, NOTCHED]) {
    const s = own(aground(pose, true));
    const c = clearance(s.at, s.heading, waters.depth).least;
    assert.ok(c >= 0 && c < 0.05, `${c} m under its keel`);
    assert.ok(
      under(along(s.at, s.heading, 0.5).p, s.heading, waters.depth) < 0,
      'the bank is not under its bow'
    );
  }
});

test('nosed into a notch, a ship steered away turns on the spot and gets off, never over land', () => {
  for (const away of [Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3, Math.PI]) {
    const course = bearingAt(NOTCHED.at, NOTCHED.bearing + away);
    const v = voyage(aground(NOTCHED, true), 15, () => ({
      ...STILL,
      course,
      throttle: 1,
    }));
    assert.ok(dry(v), `${away}: ${v.least} m under its keel`);
    assert.ok(v.out < 10, `${away}: 30 m off only after ${v.out} s`);
    assert.ok(v.idle < 1, `${away}: ${v.idle.toFixed(2)} m/s while still`);
  }
});

test('held on into the bank it is wedged on, a ship stays where it is and says it is still', () => {
  const course = bearingAt(WEDGED.at, WEDGED.bearing);
  const v = voyage(aground(WEDGED, true), 10, () => ({
    ...STILL,
    course,
    throttle: 1,
  }));
  assert.ok(dry(v), `${v.least} m under its keel`);
  assert.ok(v.off < 1, `${v.off} m: it sailed through the bank`);
  assert.ok(v.idle < 1, `${v.idle.toFixed(2)} m/s while still`);
});

test('a bot wedged on a bank it faces turns away and leaves within seconds, never over land', () => {
  for (const match of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const v = voyage(aground(WEDGED, false, match), 15, () => STILL);
    assert.ok(dry(v), `${match}: ${v.least} m under its keel`);
    assert.ok(v.out < 10, `${match}: 30 m off only after ${v.out} s`);
    assert.ok(v.longest < 5, `${match}: ${v.longest.toFixed(1)} s still`);
    assert.ok(v.idle < 1, `${match}: ${v.idle.toFixed(2)} m/s while still`);
  }
});

const inlet = seedOf('11/1/1'),
  narrow = watersAt(planetOf(inlet, landOf(inlet)));
const LOCKED = [
  {
    at: normalize([
      -0.42767424453776576, -0.4387891970424414, -0.7902903144527972,
    ]),
    heading: normalize([
      0.13678056061283636, 0.8327988773578827, -0.536411323621984,
    ]),
  },
  {
    at: normalize([
      -0.44368267983160997, -0.43385530734837435, -0.7841653217932358,
    ]),
    heading: normalize([
      0.4314659266127188, 0.6635079412026106, -0.6112236629363275,
    ]),
  },
] as const;

const bearingOf = (p: { at: Vec3; heading: Vec3 }) => {
  const f = frameAt(p.at);
  return Math.atan2(dot(p.heading, f.east), dot(p.heading, f.north));
};

function offshore(): Vec3 {
  const from = LOCKED[0].at;
  for (let d = 300; ; d += 50)
    for (let k = 0; k < 16; k++) {
      const p = along(from, bearingAt(from, (k * Math.PI) / 8), d).p;
      if (
        [0, 1, 2, 3].every(
          (j) =>
            clearance(p, bearingAt(p, (j * Math.PI) / 2), narrow.depth).least >
            5
        )
      )
        return p;
    }
}

function locked(player: boolean, lashed: Helm | null): Match {
  const m = createMatch(setupOf(1, { teams: 2, player }), narrow),
    sea = offshore(),
    [a, b] = LOCKED;
  debugOf(m).rig({ storm: () => calm(sea) });
  debugOf(m).atSea({ at: a.at, bearing: bearingOf(a) }, [
    { at: b.at, heading: b.heading, lashed },
    ...[0, 1].map((k) => {
      const at = along(sea, bearingAt(sea, k * Math.PI), 60).p;
      return { at, heading: bearingAt(at, 0), lashed: null };
    }),
  ]);
  return m;
}

const pair = (m: Match) => [0, 1].map((id) => m.view.vessel(id)!.ship);
const shoalest = (s: ShipState) =>
  clearance(s.at, s.heading, narrow.depth).least;

test('two mates wedged hull to hull in an inlet, as in a real race, part within seconds, never over land', () => {
  const m = locked(false, null),
    first = pair(m).map(shoalest);
  assert.ok(gap(pair(m)[0], pair(m)[1]) < RAM.skin * 2, 'hull to hull');
  let widest = 0;
  for (let i = 0; i < 10 * SECOND; i++) {
    m.step(STILL);
    const [a, b] = pair(m);
    widest = Math.max(widest, gap(a, b));
    [a, b].forEach((s, k) =>
      assert.ok(shoalest(s) >= Math.min(first[k], 0) - 1e-9, `ship ${k}`)
    );
  }
  assert.ok(widest > RAM.rearm, `${widest.toFixed(2)} m apart at most`);
});

test('a hand-steered ship wedged there against its moored mate turns either way, never over land', () => {
  const [a] = LOCKED;
  for (const away of [-1.2, 1.2]) {
    const m = locked(true, { course: null, throttle: 0 }),
      course = bearingAt(a.at, bearingOf(a) + away),
      v = voyage(m, 15, () => ({ ...STILL, course, throttle: 0 }), narrow),
      swung = Math.acos(Math.min(1, dot(own(m).heading, a.heading)));
    assert.ok(dry(v), `${away}: ${v.least} m under its keel`);
    assert.ok(swung > 0.5, `${away}: swung ${swung.toFixed(2)} rad`);
  }
});
