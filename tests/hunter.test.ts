import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armed, crewOf, type Shot } from '../src/sim/battle.ts';
import { nature } from '../src/sim/persona.ts';
import { mind, think, type Memory, type Seen } from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf } from '../src/sim/gun.ts';
import { heard, type Report } from '../src/sim/hunter.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import type { Depth } from '../src/sim/shoal.ts';
import {
  R,
  along,
  distance,
  frameAt,
  fromLatLon,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';

const DEEP: Depth = () => 30;
const c0 = fromLatLon(0.3, 0.1);
const east = (m: number) => along(c0, frameAt(c0).east, m).p;
const shot = (shooter: number, at: Vec3): Shot => ({
  shooter,
  gun: 'cannon',
  from: scale(at, R),
  dirs: [],
  target: null,
});

test('the sea keeps each ship’s last shot ringing for a few seconds, then lets it go', () => {
  let r: Report[] = heard([], [shot(3, east(10)), shot(4, east(20))], 0);
  assert.deepEqual(
    r.map((x) => x.by),
    [3, 4]
  );
  r = heard(r, [shot(3, east(40))], 2);
  assert.equal(r.filter((x) => x.by === 3).length, 1);
  assert.ok(distance(r.find((x) => x.by === 3)!.at, east(40)) < 1e-6);
  assert.equal(r.find((x) => x.by === 3)!.t, 2);
  assert.deepEqual(heard(r, [], 30), []);
});

function sail(gunned: boolean, gunfire: readonly Report[], seconds: number) {
  const crew = gunned ? crewOf(0, gunOf('cannon', 1)) : crewOf(0);
  let fleet: Vessel[] = [afloat(0, shipAt(c0, frameAt(c0).north))];
  let m: Memory = mind(11, c0);
  const modes: string[] = [];
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const own: Seen = {
      ...fleet[0],
      crew,
      hull: crew.health.hull,
      shield: crew.health.shield,
      armed: armed(crew),
    };
    const r = think(own, [], { depth: DEEP, gunfire }, m, nature(11));
    m = r.memory;
    if (modes.at(-1) !== m.mode) modes.push(m.mode);
    const helms: Helm[] = [r.helm];
    fleet = stepFleet(fleet, helms, STEP, DEEP).fleet;
  }
  return { modes, at: fleet[0].ship.at };
}

test('armed, a bot goes to the guns it hears; unarmed, it lets them be', () => {
  const guns = [{ at: east(320), by: 7, t: 0 }];
  const hunter = sail(true, guns, 12);
  assert.ok(hunter.modes.includes('hunt'), hunter.modes.join(' '));
  assert.ok(
    distance(hunter.at, east(320)) < 320 - 100,
    `${distance(hunter.at, east(320)).toFixed(0)} m off`
  );
  const bare = sail(false, guns, 12);
  assert.ok(!bare.modes.includes('hunt'), bare.modes.join(' '));
  const far = sail(true, [{ at: east(900), by: 7, t: 0 }], 6);
  assert.ok(!far.modes.includes('hunt'), far.modes.join(' '));
});
