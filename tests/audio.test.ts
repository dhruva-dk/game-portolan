import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAMES, SOUNDS } from '../src/audio/bank.ts';
import { CUES, CUE_NAMES, DEEDS, cueOf, type Happening } from '../src/audio/cues.ts';
import { createDerive } from '../src/audio/derive.ts';
import { createListen, type Call, type Hearing } from '../src/audio/listen.ts';
import { FALL, NEAR, SPEED, bearingFrom, cutoffAt, hear, heard, panOf, rolloff } from '../src/audio/space.ts';
import { VOICES, claim, playing, pool } from '../src/audio/voices.ts';
import { breakers, galeOf, levels, levelsOf } from '../src/audio/bed.ts';
import type { Kit, Status } from '../src/player.ts';
import type { Blast, Eye, ShipDraw, Snapshot } from '../src/snapshot.ts';
import { R, normalize, scale, type Vec3 } from '../src/world/sphere.ts';
import { inverse, lookAt, rotate } from '../src/world/turn.ts';

const at: Vec3 = [0, 0, 1];
/** A deed of each kind, befalling `ship`. */
const each = (ship: number): Happening[] => DEEDS.map((kind): Happening => {
  const base = { seq: 1, time: 0, at, ship };
  switch (kind) {
    case 'fired': return { ...base, kind };
    case 'fell': return { ...base, kind, land: false };
    case 'struck': return { ...base, kind, by: 1, shield: 0, hull: 10, broke: false, ram: false };
    case 'sank': return { ...base, kind, by: null };
    case 'took': return { ...base, kind, piece: 'gun', rarity: 0, slot: 0 };
    case 'mended': return { ...base, kind, piece: 'repairKit' };
    case 'gust': return { ...base, kind };
  }
});

test('the table: every kind of deed, hers, is heard; every cue plays a sound there is; every sound is played by some cue', () => {
  for (const h of each(0)) assert.ok(cueOf(h, 0), `her ${h.kind} has a cue`);
  for (const h of [...each(0), ...each(5)]) {
    const c = cueOf(h, 0);
    if (c) assert.ok(SOUNDS[CUES[c].sound], `${h.kind} → ${c} → a sound`);
  }
  for (const c of CUE_NAMES) assert.ok(SOUNDS[CUES[c].sound], `${c} plays ${CUES[c].sound}`);
  const played = new Set(CUE_NAMES.map((c) => CUES[c].sound));
  for (const n of NAMES) assert.ok(played.has(n), `${n} is played by a cue`);
  // others' deeds are placed in the world; hers are heard close
  for (const h of each(5)) {
    const c = cueOf(h, 0);
    if (c) assert.equal(CUES[c].bus, 'world', `another's ${h.kind}`);
  }
});

test('her blows: her ward taking all of one rings, its last breaks it, the rest is on her hull; a gun taken up is the swap', () => {
  const blow = (shield: number, hull: number, broke: boolean): Happening => ({ seq: 1, time: 0, at, ship: 0, kind: 'struck', by: 1, shield, hull, broke, ram: false });
  assert.equal(cueOf(blow(20, 0, false), 0), 'ring');
  assert.equal(cueOf(blow(10, 10, true), 0), 'shatter');
  assert.equal(cueOf(blow(0, 20, false), 0), 'hurt');
  assert.equal(cueOf(blow(0, 20, false), 3), 'strike');
  assert.equal(cueOf({ seq: 1, time: 0, at, ship: 0, kind: 'took', piece: 'gun', rarity: 2, slot: 0 }, 0), 'swap');
  assert.equal(cueOf({ seq: 1, time: 0, at, ship: 0, kind: 'took', piece: 'smallShield', rarity: 0, slot: 1 }, 0), 'took');
  assert.equal(cueOf({ seq: 1, time: 0, at, ship: 0, kind: 'mended', piece: 'bigShield' }, 0), 'mendWard');
});

test('every sound is made: samples within full scale, finite, starting and ending at rest, no DC', () => {
  for (const n of NAMES) {
    const x = SOUNDS[n].make(24000, 1);
    assert.ok(x.length > 0, n);
    let peak = 0, sum = 0;
    for (const v of x) {
      assert.ok(Number.isFinite(v), `${n} finite`);
      peak = Math.max(peak, Math.abs(v));
      sum += v;
    }
    assert.ok(peak <= 0.9 + 1e-6 && peak > 0.5, `${n} peak ${peak}`);
    assert.ok(Math.abs(x[0]) < 0.05 && Math.abs(x[x.length - 1]) < 1e-3, `${n} ends at rest`);
    // (the mean of a click a tenth of a second long is its low partials', not a standing offset: −50 dB is none)
    assert.ok(Math.abs(sum / x.length) < 3e-3, `${n} DC`);
  }
});

test('distance: the speed of sound, heard whole near, falling as the distance after, nothing past its reach; duller further', () => {
  assert.equal(rolloff(5, 500), 1);
  assert.equal(rolloff(NEAR, 500), 1);
  assert.ok(Math.abs(rolloff(2 * NEAR, 500) - 0.5 ** FALL) < 1e-9);
  assert.equal(rolloff(500, 500), 0);
  assert.equal(rolloff(900, 500), 0);
  for (let d = 1; d < 600; d += 7) {
    assert.ok(rolloff(d + 7, 600) <= rolloff(d, 600), `rolloff falls at ${d}`);
    assert.ok(cutoffAt(d + 7) < cutoffAt(d), `cutoff falls at ${d}`);
  }
  const eye: Eye = { kind: 'air', position: [0, 0, 0], orientation: [0, 0, 0, 1], fov: 50 };
  const h = hear(eye, [0, 0, -680], 1400, heard());
  assert.ok(h.audible);
  assert.equal(h.delay, 680 / SPEED);
  assert.ok(!hear(eye, [0, 0, -1500], 1400, heard()).audible, 'past its reach');
});

test('bearing and pan: ahead 0, right +π/2, behind ±π, as the eye is turned; the right is the right ear', () => {
  const look = (o: Vec3, to: Vec3): Eye => ({ kind: 'air', position: o, orientation: lookAt(o, to, [0, 1, 0]), fov: 50 });
  const eye = look([0, 0, 0], [0, 0, -1]);
  assert.ok(Math.abs(bearingFrom(eye, [0, 0, -10])) < 1e-9);
  assert.ok(Math.abs(bearingFrom(eye, [10, 0, 0]) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(Math.abs(bearingFrom(eye, [0, 0, 10])) - Math.PI) < 1e-9);
  assert.ok(panOf(Math.PI / 2) > 0 && panOf(-Math.PI / 2) < 0);
  // as world/turn.ts turns: any eye, any point
  const turned = look([3, -2, 5], [-4, 1, 9]);
  for (const p of [[10, 4, -3], [-7, 2, 8], [1, 1, 1]] as Vec3[]) {
    const [x, , z] = rotate([p[0] - 3, p[1] + 2, p[2] - 5], inverse(turned.orientation));
    assert.ok(Math.abs(bearingFrom(turned, p) - Math.atan2(x, -z)) < 1e-9);
  }
});

test('voices: never more than VOICES at once; a new sound takes a free slot, else the oldest of the lowest priority no higher than its own', () => {
  const p = pool();
  for (let i = 0; i < VOICES; i++) assert.equal(claim(p, 0, 5, i * 0.01, 10), i);
  assert.equal(playing(p, 1), VOICES);
  assert.equal(claim(p, 1, 4, 1, 3), -1, 'a lower priority finds no room');
  assert.equal(claim(p, 1, 5, 1, 3), 0, 'the same priority takes the oldest');
  assert.equal(claim(p, 1, 9, 1, 3), 1, 'a higher, the oldest of the lowest');
  assert.equal(playing(p, 1), VOICES);
  assert.equal(claim(p, 1, 1, 1, 3), -1);
  assert.equal(claim(p, 2, 1, 2, 4), -1);
  assert.equal(claim(p, 3, 1, 3, 4), 0, 'once ended, a slot is free to any');
});

/** A plain scene: her ship (id 0) at `at`, others where given, the eye behind her. */
function scene(t: number, blasts: Blast[] = [], ships: ShipDraw[] = [], balls: Snapshot['balls'] = [], sea?: Snapshot['sea']): Snapshot {
  const her: ShipDraw = { id: 0, pose: { position: scale(at, R), forward: [1, 0, 0], up: at }, look: { paint: [1, 0, 0], sail: [1, 1, 1], band: false }, velocity: [6, 0, 0], afloat: true };
  return { eye: { kind: 'air', position: [-20, 0, R + 8], orientation: [0, 0, 0, 1], fov: 50 }, clock: t, storm: { centre: at, radius: 1 }, ships: [her, ...ships], own: 0, balls, loot: [], blasts, sea };
}
const status = (over: Partial<Status & Kit> = {}): Status & Kit => ({
  at, heading: [1, 0, 0], facing: [1, 0, 0], arriving: 0, ships: [], hull: 100, hullMax: 100, shield: 30, shieldMax: 50,
  gun: { rarity: 0, ready: 1, locked: false }, afloat: 2, sunk: false, storm: 30, closing: false, eye: { centre: at, radius: 2000 }, next: null,
  outside: 0, loot: [], reticle: null, items: [null, null, null], chosen: 0, using: null, offer: null, gust: 2, gusts: 2, blowing: false, ...over,
});

test('derive: each blast heard once; hers told from others by where; her blow by her ward and hull; a ship going down; her stores', () => {
  const d = createDerive(), out: Happening[] = [];
  d.derive(scene(0), status(), out);
  assert.equal(out.length, 0, 'the first frame takes in what is, telling nothing');
  const other: ShipDraw = { ...scene(0).ships[0], id: 3, pose: { position: scale(normalize([0.1, 0, 1]), R), forward: [1, 0, 0], up: at } };
  const shots: Blast[] = [
    { kind: 'shot', time: 1, from: scale(at, R + 3), dir: [1, 0, 0] },
    { kind: 'shot', time: 1, from: scale(normalize([0.1, 0, 1]), R + 3), dir: [-1, 0, 0] },
  ];
  d.derive(scene(1, shots, [other]), status(), out);
  assert.deepEqual(out.map((h) => [h.kind, h.ship]), [['fired', 0], ['fired', -1]]);
  out.length = 0;
  d.derive(scene(1.1, shots, [other]), status(), out);
  assert.equal(out.length, 0, 'a blast is heard once');
  const blow: Blast = { kind: 'strike', time: 2, at, ram: false };
  d.derive(scene(2, [...shots, blow], [other]), status({ shield: 0, hull: 90 }), out);
  assert.equal(out.length, 1);
  assert.equal(cueOf(out[0], 0), 'shatter');
  out.length = 0;
  d.derive(scene(3, [], [{ ...other, afloat: false }]), status({ shield: 0, hull: 90, items: [{ item: 'item.repairKit', count: 1 }, null, null], blowing: true }), out);
  assert.deepEqual(out.map((h) => h.kind), ['sank', 'took', 'gust']);
});

const hearing = (s: Snapshot, st: Status & Kit, screen: Hearing['screen'] = 'match', map = false): Hearing => ({ scene: s, status: st, screen, map });

test('listen: a ball passing near whistles once; her gun come ready; the screens; her water', () => {
  const l = createListen(() => -20), out: Call[] = [];
  const dt = 1 / 30, eye = scene(0).eye.position, way: Vec3 = [0, 136, 0];
  let whistles = 0;
  for (let t = 0; t < 1.5; t += dt) {
    out.length = 0;
    // closest to the eye, 5 m off, at t = 1
    const ball = { at: [eye[0] + 5, eye[1] + 136 * (t - 1), eye[2]] as Vec3, way };
    l.listen(hearing(scene(t, [], [], [ball]), status()), dt, out);
    whistles += out.filter((c) => c.cue === 'whistle').length;
  }
  assert.equal(whistles, 1);
  const cues = (h: Hearing) => {
    out.length = 0;
    l.listen(h, dt, out);
    return out.map((c) => c.cue);
  };
  assert.deepEqual(cues(hearing(scene(2), status({ gun: { rarity: 0, ready: 0.5, locked: false } }))), []);
  assert.deepEqual(cues(hearing(scene(2.1), status())), ['ready']);
  assert.deepEqual(cues(hearing(scene(2.2), status(), 'won')), ['salute']);
  assert.deepEqual(cues(hearing(scene(2.3), status(), 'lobby')), []);
  assert.deepEqual(cues(hearing(scene(2.4), status(), 'settings')), ['open']);
  assert.deepEqual(cues(hearing(scene(2.5), status(), 'lobby')), ['close']);
  assert.deepEqual(cues(hearing(scene(2.6), status(), 'match')), ['launch']);
  const sea = (seq: number, trail: boolean, changes: NonNullable<Snapshot['sea']>['changes'] = []): Snapshot['sea'] =>
    ({ generation: 1, owner: [], seq, changes, colours: [], trails: trail ? [{ id: 0, serial: 1, points: [] }] : [] });
  cues(hearing(scene(3, [], [], [], sea(0, false)), status()));
  assert.deepEqual(cues(hearing(scene(3.1, [], [], [], sea(0, true)), status())), ['leave']);
  assert.deepEqual(cues(hearing(scene(3.2, [], [], [], sea(1, false, [{ seq: 1, time: 3.2, kind: 'claim', ship: 0, cells: [], loop: 0 }])), status())), ['claim']);
  assert.deepEqual(cues(hearing(scene(3.3, [], [], [], sea(1, true)), status())), ['leave']);
  assert.deepEqual(cues(hearing(scene(3.4, [], [], [], sea(1, false)), status())), ['enter']);
});

test('the bed: the storm heard from afar and all about her inside; surf only near a coast; levels bounded', () => {
  assert.equal(galeOf(1000), 0);
  for (let w = 400; w > -100; w -= 10) assert.ok(galeOf(w - 10) >= galeOf(w), `the gale rises toward and into the storm at ${w}`);
  assert.equal(galeOf(-100), 1);
  for (let t = 0; t < 60; t += 0.1) assert.ok(breakers(t) >= 0 && breakers(t) <= 1);
  const bed = { speed: 1, wind: 1, heave: -1, roll: 0.1, coast: Infinity, wall: 5000, hull: 1, presence: 1, muffle: 0, clock: 3 };
  assert.equal(levelsOf(bed, levels()).surf, 0);
  assert.ok(levelsOf({ ...bed, coast: 25 }, levels()).surf > 0);
  assert.equal(levelsOf(bed, levels()).strain, 0, 'her hull whole, no strain');
  assert.ok(levelsOf({ ...bed, hull: 0.1 }, levels()).strain > 0);
  for (const v of Object.values(levelsOf({ ...bed, wall: -200, coast: 20, hull: 0, speed: 3 }, levels()))) assert.ok(Number.isFinite(v) && v >= 0);
});
