// The flight as the gulls draw it (play/flights.ts, #61 section 2): a called flight is drawn from the edge of her
// side's water nearest her, coming as the sim's stop comes; the drawing reads the sim and changes nothing in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raceOf } from '../src/play/crewing.ts';
import { deal } from '../src/play/deal.ts';
import { edgeOf } from '../src/play/flights.ts';
import { matchOf } from '../src/play/race.ts';
import { createState } from '../src/play/state.ts';
import { shipAt } from '../src/sim/ship.ts';
import { PLAYER } from '../src/sim/match.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import { distance, frameAt, type Vec3 } from '../src/world/sphere.ts';
import type { Hull } from '../src/world/swell.ts';

const planet = createPlanet(SEED), depth = (p: Vec3) => -planet.height(p);
const waters = { chart: chart(depth), water: berthing(depth) };
const still: Hull = () => ({ bow: 0, stern: 0, port: 0, starboard: 0 });
const IDLE = { helm: { course: null, throttle: 0 }, gun: { aim: null, fire: false }, ask: { tap: null, arm: null, gust: false, take: null } };

test('where a flight sets out: the edge of her side\'s water nearest her', () => {
  const at = frameAt([0, 0, 1]).up, centre: Vec3 = [0.05, 0, 1];
  // her water a disc 60 m round a point 28 m east of her: its nearest edge 32 m off, on her west
  const c = frameAt(centre).up, waters = { ownerAt: (p: Vec3) => (distance(p, c) < 60 ? PLAYER : -1) };
  const v = { id: PLAYER, ship: shipAt(at, [1, 0, 0]) };
  const edge = edgeOf(waters, v), off = distance(edge, at);
  assert.ok(distance(edge, c) >= 60 && off < distance(at, c) + 60 + 4, `${off.toFixed(1)} m off`);
  assert.ok(off <= 60 - distance(at, c) + 4 + 1, 'the nearest edge');
});

/** A race of ten under way, its ships' places after `steps` steps, `drawn` reading its flights each step. */
function sail(steps: number, drawn: boolean) {
  const c = deal(5, 10), m = matchOf(c, planet), state = createState(planet, still, waters, m);
  state.start(m);
  const seen = [];
  for (let k = 0; k < steps; k++) {
    if (k === 10) assert.ok(state.summon(), 'called in her own water');
    state.advance(IDLE.helm, IDLE.gun, IDLE.ask);
    if (drawn) seen.push(...state.flights().filter((f) => f.id === PLAYER));
  }
  return { ships: state.ships(), seen, her: state.mine()! };
}

test('her flight drawn: from her water\'s edge, coming as the stop does, then working on deck', () => {
  const { seen } = sail(30 * 20, true), [first] = seen;
  assert.ok(first.coming > 0 && first.coming < 0.1, `coming ${first.coming}`);
  assert.ok(seen.every((f, i) => i === 0 || f.coming >= seen[i - 1].coming), 'it only comes nearer');
  assert.ok(seen.every((f) => f.from === first.from), 'from where it set out, as long as it lasts');
  assert.ok(seen.some((f) => f.coming === 1 && f.job !== null), 'it came, and worked');
});

test('drawing the flights changes nothing in the race', () => {
  assert.deepEqual(sail(30 * 12, true).ships, sail(30 * 12, false).ships);
});

test("her crewmate's face is the race card's: its seed and her ship's colours, the same for the same card", () => {
  const faceIn = (seed: number) => {
    const c = deal(seed, 10), m = matchOf(c, planet), state = createState(planet, still, waters, m);
    state.start(m);
    return { face: raceOf(state)?.mate?.face, colours: c.ships[PLAYER + 1].colours };
  };
  const a = faceIn(5), again = faceIn(5), other = faceIn(6);
  assert.ok(a.face, 'a face');
  assert.deepEqual(a.face!.colours, a.colours, "her ship's colours");
  assert.deepEqual(again.face, a.face, 'the same card, the same face');
  assert.notEqual(other.face!.seed, a.face!.seed, 'another card, another face');
});
