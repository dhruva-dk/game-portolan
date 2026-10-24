// WP7, territory: the home disc and what its waters and the harbours and landmarks give, trails laid beyond it and the purse they fill, loops
// closing (round a cube corner, through a self-crossing trail, round a rival's sea, its open trail and an island's
// landmark), breaking and the coins it spills, the first voyage's charmed loop, the storm swallowing sea, the pennant
// and the snapshot, all through chart(), the step's territory system, with the ships' poses scripted.
//   node --test tests/sim/territory.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seaFor } from '../../src/sim/environment.ts';
import { cross, dot, normalize, v3, type V3 } from '../../src/sim/math.ts';
import { AREA_Q, R, TERRITORY, advance, cellOf } from '../../src/sim/sphere.ts';
import {
  EVENT, MATCH_FORMAT, SHIPS, TICK, createMatch, decodeMatch, encodeMatch, matchHash, type Happening, type MatchState,
} from '../../src/sim/state.ts';
import { COINS, ECONOMY, FORMS, HARBOUR, HOME, PERK } from '../../src/sim/tables.ts';
import {
  atHome, beamMarks, chart, chestSpeed, crownBeam, gullPrice, holds, inkHome, intruders, perksOf, reloadSpeed, repairRate,
  sheltered, swallow, unseen,
} from '../../src/sim/territory.ts';
import { world } from './vectors.ts';

const sea = seaFor(world(), 1); // the land: the harbours and the landmarks whose perks part B grants
const STEP = 3.5 * TICK; // u a tick
const A = normalize(v3(0.8, 0.2, 0.5)); // anywhere: territory never reads the land
const DISC = 2 * Math.PI * R * R * (1 - Math.cos(HOME.radius / R));

/** An orthonormal pair of tangents at c. */
function frame(c: V3): [V3, V3] {
  const e = normalize(cross(v3(), Math.abs(c.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0), c));
  return [e, cross(v3(), c, e)];
}

/** The point e u along the first tangent and n u along the second from c (offsets of a few tens of u). */
function local(c: V3, e: number, n: number): V3 {
  const [E, N] = frame(c);
  return normalize(v3(c.x + (E.x * e + N.x * n) / R, c.y + (E.y * e + N.y * n) / R, c.z + (E.z * e + N.z * n) / R));
}

/** The circle of radius r u round c every 3°, from local(c, r, 0) round and back to it. */
function ring(c: V3, r: number): V3[] {
  const [E, N] = frame(c), a = r / R, out: V3[] = [];
  for (let k = 0; k <= 120; k++) {
    const f = (2 * Math.PI * k) / 120, h = Math.cos(a), x = Math.cos(f) * Math.sin(a), y = Math.sin(f) * Math.sin(a);
    out.push(normalize(v3(c.x * h + E.x * x + N.x * y, c.y * h + E.y * x + N.y * y, c.z * h + E.z * x + N.z * y)));
  }
  return out;
}

function park(s: MatchState, i: number, p: V3): void {
  s.ships[i].pos = { ...p };
  s.ships[i].was = { ...p };
}

/** A match whose ships lie parked apart far to the south, holding nothing. */
function match(firstVoyage = false): MatchState {
  const s = createMatch({ seed: 7, firstVoyage });
  for (let i = 0; i < SHIPS; i++) park(s, i, normalize(v3(Math.cos(i), -3, Math.sin(i))));
  return s;
}

/** Sail the given ships each straight to its point at STEP a tick, together, charting every tick; the events on the way. */
function glide(s: MatchState, legs: [number, V3][]): Happening[] {
  const seen: Happening[] = [];
  for (;;) {
    for (const ship of s.ships) ship.was = { ...ship.pos };
    let moving = false;
    for (const [i, to] of legs) {
      const p = s.ships[i].pos, d = Math.hypot(to.x - p.x, to.y - p.y, to.z - p.z) * R;
      if (d === 0) continue;
      moving = true;
      const f = STEP / d;
      s.ships[i].pos = d <= STEP ? { ...to } : normalize(v3(p.x + (to.x - p.x) * f, p.y + (to.y - p.y) * f, p.z + (to.z - p.z) * f));
    }
    if (!moving) return seen;
    s.events.length = 0;
    chart(s);
    seen.push(...s.events);
  }
}

const route = (s: MatchState, i: number, points: V3[]): Happening[] => points.flatMap((p) => glide(s, [[i, p]]));
const kinds = (events: Happening[], kind: number): Happening[] => events.filter((e) => e.kind === kind);
const ownerAt = (s: MatchState, p: V3): number => s.owner[cellOf(TERRITORY, p)];
const trailAt = (s: MatchState, p: V3): number => s.trail[cellOf(TERRITORY, p)];

/** A match with ship 0's home disc inked at A. */
function home(firstVoyage = false): MatchState {
  const s = match(firstVoyage);
  park(s, 0, A);
  inkHome(s, 0);
  return s;
}

test('the home disc inks round the ship; its waters mend, cheapen the gull and mark the rivals inside', () => {
  const s = home(), held = s.ships[0].held / AREA_Q, [inked] = kinds(s.events, EVENT.home);
  assert.ok(Math.abs(held - DISC) < 2 * Math.PI * HOME.radius, `${held} u² against ${DISC}`); // rim cells ≤ 1 u across
  assert.equal(inked.amount, held);
  assert.equal(inked.cells.length, s.owner.filter((o) => o === 1).length);
  assert.ok(atHome(s, 0));
  assert.equal(repairRate(sea, s, 0), HOME.repair);
  assert.equal(gullPrice(sea, s, 0, 100), 100 * HOME.gull);
  assert.equal(intruders(s, 0), 0);
  park(s, 3, local(A, 4, -3));
  assert.equal(intruders(s, 0), 1 << 3);
  assert.equal(repairRate(sea, s, 3), 0);
  assert.equal(gullPrice(sea, s, 3, 100), 100);
  chart(s);
  assert.equal(s.leader, 0);
});

test('leaving the waters lays a trail that fills the purse; returning closes the loop, claims what it encloses and banks the purse', () => {
  const s = home(), ship = s.ships[0];
  glide(s, [[0, local(A, 25, 0)]]);
  assert.ok(ship.laid.length > 0);
  assert.equal(trailAt(s, local(A, 18, 0)), 1);
  assert.ok(Math.abs(ship.purse - 15 * ECONOMY.trail) < 2 * ECONOMY.trail, `purse ${ship.purse}`); // 15 u beyond the disc
  const before = ship.held, events = route(s, 0, [local(A, 25, 25), local(A, 0, 25), A]);
  const [loop] = kinds(events, EVENT.loop), [bank] = kinds(events, EVENT.bank), held = ship.held / AREA_Q;
  assert.equal(ship.laid.length, 0);
  assert.equal(s.trail.indexOf(1), -1);
  assert.equal(ownerAt(s, local(A, 15, 15)), 1);
  assert.equal(ownerAt(s, local(A, 35, 12)), 0);
  assert.equal(ownerAt(s, local(A, -15, 12)), 0);
  const expected = 625 + (3 * DISC) / 4; // the 25 u square and the disc: trail cells reach ≤ 1 u past the square's edges
  assert.ok(held > expected - 20 && held < expected + 120, `${held} u² against ${expected}`);
  assert.equal(loop.amount, (ship.held - before) / AREA_Q);
  assert.ok(loop.cells.length > 0);
  assert.ok(Math.abs(bank.amount - 80 * ECONOMY.trail) < 3 * ECONOMY.trail, `banked ${bank.amount}`); // 80 u of trail
  assert.equal(ship.bank, bank.amount);
  assert.equal(ship.purse, 0);
  assert.deepEqual(s.timeline.map((e) => e.kind), [EVENT.lead, EVENT.loop]);
});

test("the purse fills only up to the form's capacity", () => {
  const s = home(), far = v3();
  advance(A, frame(A)[0], 260, far, v3());
  glide(s, [[0, far]]);
  assert.equal(s.ships[0].purse, FORMS[s.ships[0].form].purse);
});

test('a loop round a cube corner claims its cap, across all three faces', () => {
  const c = normalize(v3(1, 1, 1)), a = 30 / R, pts = ring(c, 30), s = match();
  park(s, 0, pts[0]);
  inkHome(s, 0);
  assert.equal(kinds(route(s, 0, pts.slice(1)), EVENT.loop).length, 1);
  const held = s.ships[0].held / AREA_Q, capArea = 2 * Math.PI * R * R * (1 - Math.cos(a)), P = 2 * Math.PI * R * Math.sin(a);
  assert.ok(held > capArea - P && held < capArea + DISC + P, `${held} u² against ${capArea}`);
  const faces = new Set<number>();
  s.owner.forEach((o, cell) => o === 1 && faces.add(cell >> (2 * TERRITORY.log)));
  assert.deepEqual([...faces].sort(), [0, 2, 4]);
});

test('crossing your own trail does nothing; back home, each pocket the trail closed is claimed', () => {
  const s = home();
  const out = route(s, 0, [local(A, 30, 0), local(A, 30, 20), local(A, 15, 20), local(A, 15, -15)]);
  assert.equal(kinds(out, EVENT.broken).length, 0);
  assert.equal(trailAt(s, local(A, 15, 0)), 1);
  assert.ok(s.ships[0].purse > 0);
  assert.equal(kinds(route(s, 0, [local(A, 0, -15), A]), EVENT.loop).length, 1);
  assert.equal(ownerAt(s, local(A, 22, 10)), 1); // the pocket the crossing closed
  assert.equal(ownerAt(s, local(A, 8, -10)), 1); // the pocket between the trail and the disc
  assert.equal(ownerAt(s, local(A, 7, 12)), 0); // open to the sea
  assert.equal(ownerAt(s, local(A, 22, -8)), 0);
});

test("a loop claims all it encloses: a rival's sea, an island's landmark, a rival's open trail (which stays open)", () => {
  const sea = seaFor(world(), 7), mark = sea.geo.landmarks[0], L = mark.pos, pts = ring(L, 25), s = match();
  park(s, 1, local(L, -5, 0));
  inkHome(s, 1);
  glide(s, [[1, local(L, -5, 18)]]);
  const rival = s.ships[1], laid = rival.laid.length, purse = rival.purse;
  assert.ok(laid > 0 && purse > 0 && holds(sea, s, 1, mark.perk));
  park(s, 0, pts[0]);
  inkHome(s, 0);
  const events = route(s, 0, pts.slice(1));
  assert.equal(kinds(events, EVENT.loop).length, 1);
  assert.equal(kinds(events, EVENT.broken).length, 0);
  assert.equal(ownerAt(s, local(L, -5, 0)), 1);
  assert.equal(rival.held, 0);
  assert.ok(holds(sea, s, 0, mark.perk) && !holds(sea, s, 1, mark.perk));
  assert.equal(rival.laid.length, laid);
  assert.equal(rival.purse, purse);
  assert.equal(trailAt(s, local(L, -5, 15)), 2);
});

test('a rival crossing an open trail breaks it: the trail washes away, the loop is lost, the purse spills as coins at the break', () => {
  const s = home(), ship = s.ships[0];
  glide(s, [[0, local(A, 30, 0)]]);
  const purse = ship.purse, held = ship.held;
  assert.ok(purse > 0);
  park(s, 1, local(A, 20, -10));
  const events = glide(s, [[1, local(A, 20, 10)]]), [broken] = kinds(events, EVENT.broken), [spilt] = kinds(events, EVENT.spill);
  assert.deepEqual([broken.ship, broken.by, broken.amount, spilt.ship, spilt.amount], [0, 1, purse, 0, purse]);
  assert.ok(broken.cells.length > 0);
  assert.deepEqual([ship.laid.length, ship.purse, s.trail.indexOf(1)], [0, 0, -1]);
  const afloat = s.coins.filter((c) => c.value > 0), at = local(A, 20, 0);
  assert.ok(Math.abs(afloat.reduce((sum, c) => sum + c.value, 0) - purse) < 1e-9);
  for (const c of afloat) assert.ok(Math.hypot(c.at.x - at.x, c.at.y - at.y, c.at.z - at.z) * R < COINS.scatter + 1);
  assert.deepEqual(s.timeline.map((e) => e.kind), [EVENT.lead, EVENT.broken]);
  assert.equal(kinds(route(s, 0, [A]), EVENT.loop).length, 0);
  assert.equal(ship.held, held);
});

test("the first voyage: the player's first loop always succeeds, and the charm lifts once it closes", () => {
  const s = home(true);
  glide(s, [[0, local(A, 30, 0)]]);
  park(s, 1, local(A, 20, -10));
  assert.equal(kinds(glide(s, [[1, local(A, 20, 10)]]), EVENT.broken).length, 0);
  assert.ok(s.ships[0].laid.length > 0 && s.charm);
  assert.equal(kinds(route(s, 0, [local(A, 30, 20), local(A, 0, 20), A]), EVENT.loop).length, 1);
  assert.equal(ownerAt(s, local(A, 20, 5)), 1);
  assert.equal(s.charm, false);
  glide(s, [[0, local(A, 0, -30)]]);
  park(s, 2, local(A, -10, -20));
  const [broken] = kinds(glide(s, [[2, local(A, 10, -20)]]), EVENT.broken);
  assert.deepEqual([broken.ship, broken.by], [0, 2]);
});

test('the storm swallows sea; the pennant flies over the most sea, stays with its holder through a tie, and falls when none is held', () => {
  const s = home(), B = local(A, 60, 0);
  park(s, 1, B);
  inkHome(s, 1);
  chart(s);
  assert.equal(s.leader, s.ships[1].held > s.ships[0].held ? 1 : 0);
  route(s, 1, [local(A, 80, 0), local(A, 80, 20), local(A, 60, 20), B]);
  assert.equal(s.leader, 1);
  const cellsOf = (mark: number): number[] => {
    const out: number[] = [];
    s.owner.forEach((o, c) => o === mark && out.push(c));
    return out;
  };
  const ones = cellsOf(2), area = s.ships[1].held / AREA_Q;
  s.events.length = 0;
  swallow(s, ones);
  const [gone] = kinds(s.events, EVENT.swallow);
  assert.deepEqual([s.ships[1].held, gone.cells.length, gone.amount], [0, ones.length, area]);
  chart(s);
  const [lead] = kinds(s.events, EVENT.lead);
  assert.deepEqual([s.leader, lead.ship, lead.by], [0, 0, 1]);
  s.ships[2].held = s.ships[0].held; // a tie: the holder keeps it
  chart(s);
  assert.equal(s.leader, 0);
  s.ships[2].held = 0;
  swallow(s, cellsOf(1));
  s.events.length = 0;
  chart(s);
  assert.deepEqual([s.leader, kinds(s.events, EVENT.lead)[0].ship], [-1, -1]);
});

test('territory, trails, purses, coins and the timeline survive a snapshot', () => {
  const s = home();
  glide(s, [[0, local(A, 30, 0)]]);
  park(s, 1, local(A, 20, -10));
  glide(s, [[1, local(A, 20, 10)]]);
  route(s, 0, [A, local(A, 0, -20)]);
  assert.ok(s.ships[0].laid.length > 0 && s.coins.some((c) => c.value > 0));
  assert.equal(MATCH_FORMAT.version, 8); // WP8 part B's schema
  const back = decodeMatch(encodeMatch(s));
  assert.equal(matchHash(back), matchHash(s));
  assert.deepEqual([back.ships[0].laid, back.coins, back.timeline], [s.ships[0].laid, s.coins, s.timeline]);
});

// Part B: what the harbours and the landmarks' perks give. (The Root Gate and the Whale Road are tested through trim in
// sailing.test.ts, the Eye's launch in environment.test.ts, the Weeping Isle and the Caldera in economy.test.ts.)

/** The landmark carrying a perk. */
const landmark = (perk: string) => sea.geo.landmarks.find((l) => l.perk === perk)!;

/** Ship i holds the landmark carrying `perk`: the landmark's cell becomes its sea. */
function grant(s: MatchState, perk: string, i: number): void {
  s.owner[sea.marks[sea.geo.landmarks.indexOf(landmark(perk))]] = i + 1;
}

test('harbours mend any hull at harbour speed; home waters slowly, twice as fast with the Great Falls; the Great Lagoon at harbour speed and out of fire while held', () => {
  const s = createMatch({ seed: 5 }), ship = s.ships[0];
  assert.equal(new Set(sea.geo.harbours.map((h) => h.region)).size, sea.geo.landmarks.length); // a harbour in every region
  for (const h of sea.geo.harbours) {
    ship.pos = { ...h.pos };
    assert.equal(repairRate(sea, s, 0), HARBOUR.repair);
  }
  ship.pos = { ...A };
  assert.equal(repairRate(sea, s, 0), 0);
  s.owner[cellOf(TERRITORY, A)] = 1;
  assert.equal(repairRate(sea, s, 0), HOME.repair);
  grant(s, 'greatFalls', 0);
  assert.equal(repairRate(sea, s, 0), HOME.repair * PERK.greatFalls);
  const lagoon = landmark('greatLagoon').pos;
  ship.pos = { ...lagoon };
  s.ships[1].pos = { ...lagoon };
  assert.ok(!sheltered(sea, s, 0));
  grant(s, 'greatLagoon', 0);
  assert.ok(sheltered(sea, s, 0) && !sheltered(sea, s, 1));
  assert.equal(repairRate(sea, s, 0), HARBOUR.repair);
});

test('the Arch, the Sandbar Light, Spice Harbour and the Kelp Cathedral give their holder its edge, and nobody else', () => {
  const s = createMatch({ seed: 5 }), held = ['arch', 'sandbarLight', 'spiceHarbour', 'kelpCathedral'];
  s.ships[0].pos = { ...A };
  s.ships[1].pos = { ...A };
  const edge = (i: number) => [reloadSpeed(sea, s, i), chestSpeed(sea, s, i), gullPrice(sea, s, i, 100), unseen(sea, s, i)];
  assert.deepEqual(edge(0), [1, 1, 100, false]);
  for (const perk of held) grant(s, perk, 0);
  assert.deepEqual(edge(0), [PERK.arch, PERK.sandbarLight, 100 * PERK.spiceHarbour, false]);
  s.owner[cellOf(TERRITORY, A)] = 1; // in its own waters: off rival charts, and its gull cheaper still
  assert.deepEqual(edge(0), [PERK.arch, PERK.sandbarLight, 100 * HOME.gull * PERK.spiceHarbour, true]);
  assert.deepEqual(edge(1), [1, 1, 100, false]);
  const marks = held.reduce((m, perk) => m | (1 << sea.geo.landmarks.indexOf(landmark(perk))), 0);
  assert.deepEqual([perksOf(sea, s, 0), perksOf(sea, s, 1)], [marks, 0]);
});

test("the Crown Light's turning beam marks the rivals in it on its holder's chart", () => {
  const s = createMatch({ seed: 5 }), light = landmark('crownLight').pos, beam = crownBeam(sea, s, v3()), d = v3();
  for (const ship of s.ships) ship.pos = normalize(v3(-light.x, -light.y, -light.z)); // the fleet out of its reach
  advance(light, beam, 30, s.ships[3].pos, d);
  advance(light, beam, PERK.crownLight.reach + 10, s.ships[4].pos, d); // in line, but beyond its reach
  assert.equal(beamMarks(sea, s, 0), 0); // nobody holds it
  grant(s, 'crownLight', 0);
  assert.deepEqual([beamMarks(sea, s, 0), beamMarks(sea, s, 3)], [1 << 3, 0]);
  s.tick += Math.round(PERK.crownLight.period / 4 / TICK); // a quarter turn on, clockwise
  assert.equal(beamMarks(sea, s, 0), 0);
  assert.ok(Math.abs(dot(crownBeam(sea, s, v3()), beam)) < 1e-9);
});
