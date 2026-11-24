import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAMES, SOUNDS } from '../src/audio/bank.ts';
import {
  CUES,
  CUE_NAMES,
  DEEDS,
  cueOf,
  soundOf,
  type Happening,
} from '../src/audio/cues.ts';
import { createListen, type Call, type Hearing } from '../src/audio/listen.ts';
import {
  FALL,
  NEAR,
  SPEED,
  bearingFrom,
  cutoffAt,
  hear,
  heard,
  panOf,
  rolloff,
} from '../src/audio/space.ts';
import { VOICES, claim, pool, type Pool } from '../src/audio/voices.ts';
import { breakers, galeOf, levels, levelsOf } from '../src/audio/bed.ts';
import { KINDS } from '../src/sim/kinds.ts';
import {
  HOTBAR,
  type GunKind,
  type Kit,
  type Status,
} from '../src/play/player.ts';
import type {
  BallDraw,
  Blast,
  Eye,
  ShipDraw,
  Snapshot,
} from '../src/render/snapshot.ts';
import { R, scale, type Vec3 } from '../src/world/sphere.ts';
import { inverse, lookAt, rotate } from '../src/world/turn.ts';

const at: Vec3 = [0, 0, 1];
const each = (ship: number, gun: GunKind = 'cannon'): Happening[] =>
  DEEDS.map((kind): Happening => {
    const base = { seq: 1, time: 0, at, ship };
    switch (kind) {
      case 'fired':
      case 'winding':
      case 'reloading':
      case 'reloaded':
      case 'swapped':
        return { ...base, kind, gun };
      case 'fell':
        return { ...base, kind, land: false };
      case 'struck':
        return {
          ...base,
          kind,
          by: 1,
          shield: 0,
          hull: 10,
          broke: false,
          ram: false,
        };
      case 'sank':
        return { ...base, kind, by: null };
      case 'took':
        return { ...base, kind, piece: gun, rarity: 0, slot: 0 };
      case 'mended':
        return { ...base, kind, piece: 'repairKit' };
      case 'gust':
        return { ...base, kind };
    }
  });

test('the table: every kind of deed, its own, is heard; every cue plays a sound there is; every sound is played by some cue', () => {
  for (const h of each(0)) assert.ok(cueOf(h, 0), `its ${h.kind} has a cue`);
  for (const h of [...each(0), ...each(5)]) {
    const c = cueOf(h, 0);
    if (c)
      assert.ok(SOUNDS[soundOf(CUES[c], null)], `${h.kind} → ${c} → a sound`);
  }
  for (const c of CUE_NAMES)
    assert.ok(SOUNDS[soundOf(CUES[c], null)], `${c} plays ${CUES[c].sound}`);
  const played = new Set([
    ...CUE_NAMES.map((c) => soundOf(CUES[c], null)),
    ...KINDS.flatMap((k) => CUE_NAMES.map((c) => soundOf(CUES[c], k))),
  ]);
  for (const n of NAMES) assert.ok(played.has(n), `${n} is played by a cue`);
  for (const k of KINDS)
    assert.equal(soundOf(CUES[cueOf(each(5, k)[0], 0)!], k), k);
  assert.equal(cueOf(each(5)[DEEDS.indexOf('winding')], 0), 'wound');
  assert.equal(cueOf(each(5)[DEEDS.indexOf('reloading')], 0), null);
  for (const h of each(5)) {
    const c = cueOf(h, 0);
    if (c) assert.equal(CUES[c].bus, 'world', `another's ${h.kind}`);
  }
});

test('its blows: its ward taking all of one rings, its last breaks it, the rest is on its hull; a gun taken up is the swap', () => {
  const blow = (shield: number, hull: number, broke: boolean): Happening => ({
    seq: 1,
    time: 0,
    at,
    ship: 0,
    kind: 'struck',
    by: 1,
    shield,
    hull,
    broke,
    ram: false,
  });
  assert.equal(cueOf(blow(20, 0, false), 0), 'ring');
  assert.equal(cueOf(blow(10, 10, true), 0), 'shatter');
  assert.equal(cueOf(blow(0, 20, false), 0), 'hurt');
  assert.equal(cueOf(blow(0, 20, false), 3), 'strike');
  assert.equal(
    cueOf(
      {
        seq: 1,
        time: 0,
        at,
        ship: 0,
        kind: 'took',
        piece: 'harpoon',
        rarity: 2,
        slot: 0,
      },
      0
    ),
    'swap'
  );
  assert.equal(
    cueOf(
      {
        seq: 1,
        time: 0,
        at,
        ship: 0,
        kind: 'took',
        piece: 'smallShield',
        rarity: 0,
        slot: 1,
      },
      0
    ),
    'took'
  );
  assert.equal(
    cueOf(
      { seq: 1, time: 0, at, ship: 0, kind: 'mended', piece: 'bigShield' },
      0
    ),
    'mendWard'
  );
});

test('every sound is made: samples within full scale, finite, starting and ending at rest, no DC', () => {
  for (const n of NAMES) {
    const x = SOUNDS[n].make(24000, 1);
    assert.ok(x.length > 0, n);
    let peak = 0,
      sum = 0;
    for (const v of x) {
      assert.ok(Number.isFinite(v), `${n} finite`);
      peak = Math.max(peak, Math.abs(v));
      sum += v;
    }
    assert.ok(peak <= 0.9 + 1e-6 && peak > 0.5, `${n} peak ${peak}`);
    assert.ok(
      Math.abs(x[0]) < 0.05 && Math.abs(x[x.length - 1]) < 1e-3,
      `${n} ends at rest`
    );
    assert.ok(Math.abs(sum / x.length) < 3e-3, `${n} DC`);
  }
});

test("each kind's report is its own: unlike the others in length and in where its weight lies", () => {
  const rate = 24000;
  const made = KINDS.map((k) => SOUNDS[k].make(rate, 1));
  const length = (x: Float32Array) => {
    let last = 0;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.009) last = i;
    return last / rate;
  };
  const bright = (x: Float32Array) => {
    const a = Math.exp((-2 * Math.PI * 1500) / rate);
    let low = 0,
      hi = 0,
      all = 0;
    for (const v of x) {
      low = a * low + (1 - a) * v;
      hi += (v - low) ** 2;
      all += v * v;
    }
    return hi / all;
  };
  const rows = made.map((x, i) => ({
    kind: KINDS[i],
    length: length(x),
    bright: bright(x),
  }));
  console.log(
    `# ${rows.map((r) => `${r.kind} ${r.length.toFixed(2)} s, ${(100 * r.bright).toFixed(0)}% bright`).join('; ')}`
  );
  const by = Object.fromEntries(rows.map((r) => [r.kind, r]));
  assert.ok(by.repeater.length < 0.5 * by.cannon.length, 'the repeater short');
  assert.ok(by.mortar.length > by.cannon.length, 'the mortar longest');
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i],
        b = rows[j];
      assert.ok(
        Math.abs(a.length - b.length) > 0.1 ||
          Math.abs(a.bright - b.bright) > 0.03,
        `${a.kind} and ${b.kind} alike`
      );
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
  const eye: Eye = {
    kind: 'air',
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    fov: 50,
  };
  const h = hear(eye, [0, 0, -680], 1400, heard());
  assert.ok(h.audible);
  assert.equal(h.delay, 680 / SPEED);
  assert.ok(!hear(eye, [0, 0, -1500], 1400, heard()).audible, 'past its reach');
});

test('bearing and pan: ahead 0, right +π/2, behind ±π, as the eye is turned; the right is the right ear', () => {
  const look = (o: Vec3, to: Vec3): Eye => ({
    kind: 'air',
    position: o,
    orientation: lookAt(o, to, [0, 1, 0]),
    fov: 50,
  });
  const eye = look([0, 0, 0], [0, 0, -1]);
  assert.ok(Math.abs(bearingFrom(eye, [0, 0, -10])) < 1e-9);
  assert.ok(Math.abs(bearingFrom(eye, [10, 0, 0]) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(Math.abs(bearingFrom(eye, [0, 0, 10])) - Math.PI) < 1e-9);
  assert.ok(panOf(Math.PI / 2) > 0 && panOf(-Math.PI / 2) < 0);
  const turned = look([3, -2, 5], [-4, 1, 9]);
  const points: Vec3[] = [
    [10, 4, -3],
    [-7, 2, 8],
    [1, 1, 1],
  ];
  for (const p of points) {
    const [x, , z] = rotate(
      [p[0] - 3, p[1] + 2, p[2] - 5],
      inverse(turned.orientation)
    );
    assert.ok(Math.abs(bearingFrom(turned, p) - Math.atan2(x, -z)) < 1e-9);
  }
});

test('voices: never more than VOICES at once; a new sound takes a free slot, else the oldest of the lowest priority no higher than its own', () => {
  const p = pool(),
    playing = (q: Pool, now: number) => q.ends.filter((e) => e > now).length;
  for (let i = 0; i < VOICES; i++)
    assert.equal(claim(p, 0, 5, i * 0.01, 10), i);
  assert.equal(playing(p, 1), VOICES);
  assert.equal(claim(p, 1, 4, 1, 3), -1, 'a lower priority finds no room');
  assert.equal(claim(p, 1, 5, 1, 3), 0, 'the same priority takes the oldest');
  assert.equal(claim(p, 1, 9, 1, 3), 1, 'a higher, the oldest of the lowest');
  assert.equal(playing(p, 1), VOICES);
  assert.equal(claim(p, 1, 1, 1, 3), -1);
  assert.equal(claim(p, 2, 1, 2, 4), -1);
  assert.equal(claim(p, 3, 1, 3, 4), 0, 'once ended, a slot is free to any');
});

function scene(
  t: number,
  blasts: Blast[] = [],
  ships: ShipDraw[] = [],
  balls: Snapshot['balls'] = [],
  sea?: Snapshot['sea']
): Snapshot {
  const playerShip: ShipDraw = {
    id: 0,
    pose: { position: scale(at, R), forward: [1, 0, 0], up: at },
    look: { paint: [1, 0, 0], sail: [1, 1, 1], pattern: 'plain' },
    velocity: [6, 0, 0],
    afloat: true,
    gun: null,
    wear: 0,
  };
  return {
    eye: {
      kind: 'air',
      position: [-20, 0, R + 8],
      orientation: [0, 0, 0, 1],
      fov: 50,
    },
    clock: t,
    storm: { center: at, radius: 1, closing: false },
    ships: [playerShip, ...ships],
    own: 0,
    balls,
    loot: [],
    blasts,
    sea,
  };
}
const status = (over: Partial<Status & Kit> = {}): Status & Kit => ({
  at,
  heading: [1, 0, 0],
  facing: [1, 0, 0],
  arriving: 0,
  top: 16,
  hull: 100,
  hullMax: 100,
  shield: 30,
  shieldMax: 50,
  gun: {
    kind: 'cannon',
    rarity: 0,
    rounds: 8,
    ready: 1,
    charge: null,
    swapping: 0,
    locked: false,
  },
  afloat: 2,
  sunk: false,
  storm: 30,
  closing: false,
  eye: { center: at, radius: 2000 },
  next: null,
  outside: 0,
  reticle: null,
  moments: [],
  race: null,
  guns: [{ kind: 'cannon', rarity: 0, rounds: 8, mag: 8, reload: null }, null],
  items: [null, null, null],
  chosen: 0,
  using: null,
  offer: null,
  gust: 2,
  gusts: 2,
  blowing: false,
  ...over,
});

const hearing = (
  s: Snapshot,
  st: Status & Kit,
  screen: Hearing['screen'] = 'match',
  map = false,
  covered = 0
): Hearing => ({ scene: s, status: st, screen, map, covered });

test('listen: a ball passing near whistles once; a slot of its stores taken in hand, not a gun; the screens; its water', () => {
  const l = createListen(() => -20),
    out: Call[] = [];
  const dt = 1 / 30,
    eye = scene(0).eye.position,
    way: Vec3 = [0, 136, 0];
  let whistles = 0;
  for (let t = 0; t < 1.5; t += dt) {
    out.length = 0;
    const ball: BallDraw = {
      at: [eye[0] + 5, eye[1] + 136 * (t - 1), eye[2]],
      way,
      gun: 'cannon',
      to: at,
    };
    l.listen(hearing(scene(t, [], [], [ball]), status()), dt, out);
    whistles += out.filter((c) => c.cue === 'whistle').length;
  }
  assert.equal(whistles, 1);
  const cues = (h: Hearing) => {
    out.length = 0;
    l.listen(h, dt, out);
    return out.map((c) => c.cue);
  };
  assert.deepEqual(
    cues(hearing(scene(2), status({ chosen: 1 }))),
    [],
    "its other gun taken in hand: its deed's (swapped)"
  );
  assert.deepEqual(cues(hearing(scene(2.1), status({ chosen: HOTBAR.guns }))), [
    'select',
  ]);
  cues(hearing(scene(2.15), status()));
  assert.deepEqual(cues(hearing(scene(2.2), status(), 'won')), ['salute']);
  assert.deepEqual(cues(hearing(scene(2.3), status(), 'lobby')), []);
  assert.deepEqual(cues(hearing(scene(2.4), status(), 'settings')), ['open']);
  assert.deepEqual(cues(hearing(scene(2.5), status(), 'lobby')), ['close']);
  assert.deepEqual(cues(hearing(scene(2.52), status(), 'livery')), ['open']);
  assert.deepEqual(cues(hearing(scene(2.54), status(), 'lobby')), ['close']);
  assert.deepEqual(cues(hearing(scene(2.6), status(), 'match')), ['launch']);
  const sea = (
    seq: number,
    changes: NonNullable<Snapshot['sea']>['changes'] = []
  ): Snapshot['sea'] => ({
    generation: 1,
    owner: [],
    seq,
    changes,
    colors: [],
  });
  cues(hearing(scene(3, [], [], [], sea(0)), status()));
  assert.deepEqual(
    cues(
      hearing(
        scene(
          3.1,
          [],
          [],
          [],
          sea(2, [
            { seq: 1, time: 3.1, kind: 'paint', ship: 0, cells: [] },
            { seq: 2, time: 3.1, kind: 'claim', ship: 0, cells: [], loop: 0 },
          ])
        ),
        status()
      )
    ),
    ['claim'],
    'a loop closed heard, its strip not'
  );
  assert.deepEqual(
    cues(hearing(scene(3.2, [], [], [], sea(2)), status())),
    [],
    'each change heard once'
  );
  assert.equal(
    l.listen(hearing(scene(3.5), status(), 'result', false, 0.4), dt, out)
      .covered,
    0.4
  );
  assert.equal(
    l.listen(hearing(scene(3.6), status(), 'lobby', false, 0), dt, out).covered,
    0
  );
});

test('the bed hears its speed as a share of its own top', () => {
  const speedAt = (top: number) =>
    createListen(() => -20).listen(
      hearing(scene(0), status({ top })),
      1 / 30,
      []
    ).speed;
  assert.equal(speedAt(12), 0.5);
  assert.equal(speedAt(24), 0.25);
});

test('listen: the storm closing thunders, then its wind', () => {
  const l = createListen(() => -20),
    out: Call[] = [];
  const cues = (t: number, over: Partial<Status & Kit>) => {
    out.length = 0;
    l.listen(hearing(scene(t), status(over)), 1 / 30, out);
    return out.map((c) => c.cue);
  };
  cues(0, {});
  assert.deepEqual(cues(0.5, { closing: true }), ['thunder', 'closing']);
  assert.deepEqual(cues(0.6, { closing: true }), []);
});

test('the bed: the storm heard from afar and all about it inside; surf only near a coast; levels bounded', () => {
  assert.equal(galeOf(1000), 0);
  for (let w = 400; w > -100; w -= 10)
    assert.ok(
      galeOf(w - 10) >= galeOf(w),
      `the gale rises toward and into the storm at ${w}`
    );
  assert.equal(galeOf(-100), 1);
  for (let t = 0; t < 60; t += 0.1)
    assert.ok(breakers(t) >= 0 && breakers(t) <= 1);
  const bed = {
    speed: 1,
    wind: 1,
    heave: -1,
    roll: 0.1,
    coast: Infinity,
    wall: 5000,
    hull: 1,
    presence: 1,
    muffle: 0,
    covered: 0,
    clock: 3,
  };
  assert.equal(levelsOf(bed, levels()).surf, 0);
  assert.equal(levelsOf(bed, levels()).uncovered, 1);
  assert.equal(levelsOf({ ...bed, covered: 1 }, levels()).uncovered, 0);
  assert.equal(levelsOf({ ...bed, covered: 0.25 }, levels()).uncovered, 0.75);
  assert.ok(levelsOf({ ...bed, coast: 25 }, levels()).surf > 0);
  assert.equal(levelsOf(bed, levels()).strain, 0, 'its hull whole, no strain');
  assert.ok(levelsOf({ ...bed, hull: 0.1 }, levels()).strain > 0);
  for (const v of Object.values(
    levelsOf({ ...bed, wall: -200, coast: 20, hull: 0, speed: 3 }, levels())
  )) {
    assert.ok(Number.isFinite(v) && v >= 0);
  }
});
