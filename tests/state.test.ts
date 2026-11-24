import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, debugOf, type Match } from '../src/play/state.ts';
import { COLORS, dealt, lookOf } from '../src/play/colors.ts';
import { LIVERY } from '../src/player.ts';
import { PLAYER, SHIPS } from '../src/sim/match.ts';
import { chart } from '../src/sim/route.ts';
import { MIXED } from '../src/sim/persona.ts';
import { berthing } from '../src/sim/spawn.ts';
import { calm, type Storm } from '../src/sim/storm.ts';
import type { Helm } from '../src/sim/ship.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/environment.ts';
import { add, bearingAt, type Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

const planet = planetOf(SEED, landOf(SEED));
const depth = (p: Vec3) => -planet.height(p);
const waters = { chart: chart(depth), water: berthing(depth) };
const start = planet.start;
const still = { aim: null, fire: false };
const degrees = Math.PI / 180;

const deadly = (at: number): Match => ({
  seed: 1,
  type: MIXED,
  gun: null,
  storm: (t): Storm =>
    t < at
      ? calm(start.at)
      : {
          ...calm(start.at),
          radius: 1e-6,
          next: { center: start.at, radius: 1e-6 },
          damage: 1e6,
        },
});

function loop(m: Match, state = createState(planet, flat, waters, m)) {
  debugOf(state).atSea(start, []);
  const legs: [number, number][] = [
    [180, 5],
    [90, 4],
  ];
  const helm = (k: number): Helm => {
    const at = state.vessels()[0]?.ship.at ?? start.at;
    let s = k / 30;
    for (const [b, seconds] of legs) {
      if (s < seconds)
        return { course: bearingAt(at, b * degrees), throttle: 1 };
      s -= seconds;
    }
    return { course: add(start.at, at, -1), throttle: 1 };
  };
  for (let k = 0; k < 30 * 30; k++) {
    const time = state.time(),
      did = state.advance(helm(k), still);
    if (did.held?.claimed.some((c) => c.id === PLAYER) || !state.mine())
      return { closed: time, did, state };
  }
  return { closed: null, did: null, state };
}

test('her livery: worn at anchor at once; her ship in it at sea, the bots dealt round it, her water her dye', () => {
  const state = createState(planet, flat, waters, deadly(Infinity)),
    hers = { dye: 4, pattern: 2 };
  const her = () => state.drawn(1).find((d) => d.id === PLAYER)!.look;
  state.anchor(start);
  assert.deepEqual(her(), lookOf(LIVERY), 'vermilion, plain, till she chooses');
  state.wear(hers);
  assert.deepEqual(her(), lookOf(hers), 'at anchor, in it at once');
  state.start(deadly(Infinity));
  const drawn = state.drawn(1);
  assert.equal(drawn.length, SHIPS);
  for (const d of drawn)
    assert.deepEqual(
      d.look,
      lookOf(d.id === PLAYER ? hers : dealt(1, d.id, hers)),
      `ship ${d.id}`
    );
  assert.ok(drawn.every((d) => d.id === PLAYER || d.look.sail !== her().sail));
  const sea = state.sea(1)!;
  assert.deepEqual(sea.colors[PLAYER], COLORS[hers.dye]);
  drawn.forEach((d) => assert.deepEqual(sea.colors[d.id], d.look.sail));
  state.wear(LIVERY);
  assert.deepEqual(her(), lookOf(hers));
  state.anchor(start);
  state.wear({ dye: 99, pattern: 1 });
  assert.deepEqual(her(), lookOf({ dye: 0, pattern: 1 }));
});

test('a ship sunk in a step lays, closes and cuts nothing in it: its water only drains', () => {
  const sailed = loop(deadly(Infinity));
  assert.ok(sailed.closed !== null, 'its loop closes');
  const sunk = loop(deadly(sailed.closed));
  assert.equal(sunk.state.mine(), null, 'it sank');
  assert.deepEqual(sunk.did?.held?.claimed, []);
  assert.deepEqual(sunk.did?.regained, []);
  const changes = sunk.state.sea(1)!.changes.filter((c) => c.ship === PLAYER);
  assert.ok(
    !changes.some((c) => c.kind === 'claim'),
    'no loop of its own closed'
  );
  assert.equal(changes.at(-1)?.kind, 'drain');
  assert.equal(sunk.state.share(PLAYER), 0);
});

test("a second match on the same state starts clean: its sea as a new state's, its loop closing as it did", () => {
  const alone = loop(deadly(Infinity)),
    first = loop(deadly(Infinity));
  for (let k = 0; k < 240; k++)
    first.state.advance(
      {
        course: bearingAt(first.state.mine()!.ship.at, 180 * degrees),
        throttle: 1,
      },
      still
    );
  const was = first.state.sea(1)!;
  assert.ok(
    was.changes.some((c) => c.kind === 'paint' && c.ship === PLAYER),
    "its strip painted at the first match's end"
  );
  const second = loop(deadly(Infinity), first.state);
  assert.equal(
    second.closed,
    alone.closed,
    'its loop closes at the same moment of its match'
  );
  const a = alone.state.sea(1)!,
    b = second.state.sea(1)!,
    later = b.changes.at(-1)!.time - a.changes.at(-1)!.time,
    since = Math.max(a.changes[0].seq, b.changes[0].seq);
  const timed = (cs: typeof a.changes, by: number) =>
    cs
      .filter((c) => c.seq >= since)
      .map((c) => ({ ...c, time: Math.round((c.time - by) * 1e6) }));
  assert.equal(b.generation, was.generation + 1);
  assert.equal(b.seq, a.seq);
  assert.ok(later > 0);
  assert.ok(Math.abs(a.changes[0].seq - b.changes[0].seq) <= 1);
  assert.deepEqual(timed(b.changes, later), timed(a.changes, 0));
  assert.deepEqual(b.owner, a.owner);
  assert.equal(second.state.share(PLAYER), alone.state.share(PLAYER));
});
