import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, debugOf } from '../src/play/state.ts';
import { lookOf } from '../src/play/colors.ts';
import { teamLiveries } from '../src/app/race.ts';
import { COLORS, LIVERY } from '../src/world/livery.ts';
import { STILL } from '../src/sim/hands.ts';
import { PLAYER } from '../src/sim/match.ts';
import { watersAt } from '../src/sim/waters.ts';
import { calm, type Storm } from '../src/sim/storm.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/world/environment.ts';
import { add, bearingAt } from '../src/world/sphere.ts';
import { EVEN_SHIP, setupOf } from './setups.ts';

const planet = planetOf(SEED, landOf(SEED));
const waters = watersAt(planet);
const start = planet.start;
const degrees = Math.PI / 180;
const race = setupOf(1, { player: true });

const deadly =
  (at: number) =>
  (t: number): Storm =>
    t < at
      ? calm(start.at)
      : {
          ...calm(start.at),
          radius: 1e-6,
          next: { center: start.at, radius: 1e-6 },
          damage: 1e6,
        };

function loop(at: number, state = createState(waters, start, EVEN_SHIP)) {
  debugOf(state).atSea(race, start, [], { storm: deadly(at) });
  const legs: [number, number][] = [
    [180, 5],
    [90, 4],
  ];
  const course = (k: number) => {
    const here = state.vessels()[0]?.ship.at ?? start.at;
    let s = k / 30;
    for (const [b, seconds] of legs) {
      if (s < seconds) return bearingAt(here, b * degrees);
      s -= seconds;
    }
    return add(start.at, here, -1);
  };
  for (let k = 0; k < 30 * 30; k++) {
    const time = state.time(),
      did = state.step({ ...STILL, course: course(k), throttle: 1 });
    if (did.held?.claimed.some((c) => c.id === PLAYER) || !state.mine())
      return { closed: time, did, state };
  }
  return { closed: null, did: null, state };
}

test('its livery: worn at anchor at once; its ship in it at sea, every team in the livery of its index round it, its water its dye', () => {
  const state = createState(waters, start, EVEN_SHIP),
    chosen = { dye: 4, pattern: 2 };
  const playerLook = () => state.drawn(1).find((d) => d.id === PLAYER)!.look;
  state.anchor(start);
  assert.deepEqual(
    playerLook(),
    lookOf(LIVERY),
    'vermilion, plain, till it is chosen'
  );
  state.wear(chosen);
  assert.deepEqual(playerLook(), lookOf(chosen), 'at anchor, in it at once');
  const liveries = teamLiveries(race, state.worn());
  state.start(race, liveries);
  const drawn = state.drawn(1);
  assert.equal(drawn.length, race.ships.length);
  for (const d of drawn)
    assert.deepEqual(
      d.look,
      lookOf(liveries[race.ships[d.id].team]),
      `ship ${d.id}`
    );
  assert.deepEqual(playerLook(), lookOf(chosen));
  for (const d of drawn)
    assert.equal(
      race.ships[d.id].team === race.ships[PLAYER].team,
      d.look.sail === playerLook().sail &&
        d.look.pattern === playerLook().pattern,
      `ship ${d.id}: only its team in its livery`
    );
  const sea = state.sea(1)!;
  assert.deepEqual(sea.colors[PLAYER], COLORS[chosen.dye]);
  drawn.forEach((d) => assert.deepEqual(sea.colors[d.id], d.look.sail));
  state.wear(LIVERY);
  assert.deepEqual(playerLook(), lookOf(chosen));
  state.anchor(start);
  state.wear({ dye: 99, pattern: 1 });
  assert.deepEqual(playerLook(), lookOf({ dye: 0, pattern: 1 }));
});

test('a ship sunk in a step lays, closes and cuts nothing in it: its water only drains', () => {
  const sailed = loop(Infinity);
  assert.ok(sailed.closed !== null, 'its loop closes');
  const sunk = loop(sailed.closed);
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
  const alone = loop(Infinity),
    first = loop(Infinity);
  for (let k = 0; k < 240; k++)
    first.state.step({
      ...STILL,
      course: bearingAt(first.state.mine()!.ship.at, 180 * degrees),
      throttle: 1,
    });
  const was = first.state.sea(1)!;
  assert.ok(
    was.changes.some((c) => c.kind === 'paint' && c.ship === PLAYER),
    "its strip painted at the first match's end"
  );
  const second = loop(Infinity, first.state);
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
