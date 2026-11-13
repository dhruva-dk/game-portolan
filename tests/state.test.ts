// The match afloat (play/state.ts), as the game steps it: who holds the sea through a step, and a match after another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startOf } from '../src/play/setup.ts';
import { bearing, createState, type Match } from '../src/play/state.ts';
import { PLAYER } from '../src/sim/match.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { calm, type Storm } from '../src/sim/storm.ts';
import type { Helm } from '../src/sim/ship.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import { add, type Vec3 } from '../src/world/sphere.ts';

const planet = createPlanet(SEED);
const depth = (p: Vec3) => -planet.height(p);
const waters = { chart: chart(depth), water: berthing(depth) };
const start = startOf(planet);
const still = { aim: null, fire: false };
const degrees = Math.PI / 180;

/** A match whose storm lies calm until `at` s on its clock, then shrinks to nothing and sinks every ship in a step. */
const deadly = (at: number): Match => ({
  seed: 1, gun: null,
  storm: (t): Storm => (t < at ? calm(start.at) : { ...calm(start.at), radius: 1e-6, next: { centre: start.at, radius: 1e-6 }, damage: 1e6 }),
});

/** Her loop sailed alone from her berth in a match at sea: south, east, and home; each step's helm, until it closes.
 *  Returns the match's clock at the start of the step that closed it (null: it never did), and the state. */
function loop(m: Match) {
  const state = createState(planet, () => 0, waters, m);
  state.debug.atSea(start, []);
  const legs: [number, number][] = [[180, 5], [90, 4]];
  const helm = (k: number): Helm => {
    const at = state.vessels()[0]?.ship.at ?? start.at;
    let s = k / 30;
    for (const [b, seconds] of legs) {
      if (s < seconds) return { course: bearing(at, b * degrees), throttle: 1 };
      s -= seconds;
    }
    return { course: add(start.at, at, -1), throttle: 1 };
  };
  for (let k = 0; k < 30 * 30; k++) {
    const time = state.time(), did = state.advance(helm(k), still);
    if (did.held?.claimed.some((c) => c.id === PLAYER) || !state.mine()) return { closed: time, did, state };
  }
  return { closed: null, did: null, state };
}

test('a ship sunk in a step lays, closes and cuts nothing in it: her water only drains', () => {
  const sailed = loop(deadly(Infinity));
  assert.ok(sailed.closed !== null, 'her loop closes');
  // the same loop, the storm sinking her in the very step it would have closed
  const sunk = loop(deadly(sailed.closed));
  assert.equal(sunk.state.mine(), null, 'she sank');
  assert.deepEqual(sunk.did?.held?.claimed, []);
  assert.deepEqual(sunk.did?.regained, []);
  const changes = sunk.state.sea(1)!.changes.filter((c) => c.ship === PLAYER);
  assert.ok(!changes.some((c) => c.kind === 'claim'), 'no loop of hers closed');
  assert.equal(changes.at(-1)?.kind, 'drain');
  assert.equal(sunk.state.share(PLAYER), 0);
});

