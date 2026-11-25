import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, debugOf, type Match } from '../src/sim/engine.ts';
import { STILL, type Hands } from '../src/sim/hands.ts';
import { PLAYER } from '../src/sim/match.ts';
import { clearance, under } from '../src/sim/shoal.ts';
import { calm } from '../src/sim/storm.ts';
import { STEP } from '../src/sim/fixed.ts';
import {
  along,
  bearingAt,
  distance,
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

function voyage(m: Match, seconds: number, hands: (m: Match) => Hands) {
  const from = own(m).at,
    first = clearance(from, own(m).heading, waters.depth).least;
  let least = Infinity,
    out = Infinity,
    still = 0,
    longest = 0,
    idle = 0,
    last = from;
  for (let i = 0; i < Math.round(seconds * SECOND); i++) {
    m.step(hands(m));
    const s = own(m);
    least = Math.min(least, clearance(s.at, s.heading, waters.depth).least);
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
