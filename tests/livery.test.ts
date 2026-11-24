import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToLinear, linearToSrgbRgb } from '../src/world/color.ts';
import { ColorManagement, Vector3 } from 'three';
import { dealt, lookOf, worn } from '../src/play/colors.ts';
import {
  CREAM,
  FOAM,
  SEA_DEEP,
  SEA_MIDDLE,
  SEA_SHALLOW,
  STORM,
} from '../src/render/palette.ts';
import {
  COLORS,
  DYES,
  LIVERY,
  MARKS,
  PATTERNS,
  liveryAt,
  markOn,
  type Livery,
} from '../src/world/livery.ts';
import { teamLiveries } from '../src/app/race.ts';
import { SETUP } from '../src/sim/engine.ts';
import { setupOf } from './setups.ts';
import type { Vec3 } from '../src/world/sphere.ts';

const SEEDS = [0, 1, 7, 1234, 0xdeadbeef, 4105590181];
const every = (f: (l: Livery) => void) => {
  for (let dye = 0; dye < COLORS.length; dye++)
    for (let pattern = 0; pattern < PATTERNS.length; pattern++)
      f({ dye, pattern });
};

function hsl(c: Vec3) {
  const s = linearToSrgbRgb(c);
  const hi = Math.max(...s),
    lo = Math.min(...s),
    l = (hi + lo) / 2,
    d = hi - lo;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0)
    h =
      hi === s[0]
        ? ((s[1] - s[2]) / d + 6) % 6
        : hi === s[1]
          ? (s[2] - s[0]) / d + 2
          : (s[0] - s[1]) / d + 4;
  return { h: h * 60, s: sat, l };
}
const apart = (a: Vec3, b: Vec3) => {
  const x = hsl(a),
    y = hsl(b);
  const p = (c: typeof x) => [
    c.s * (1 - Math.abs(2 * c.l - 1)) * Math.cos((c.h * Math.PI) / 180),
    c.s * (1 - Math.abs(2 * c.l - 1)) * Math.sin((c.h * Math.PI) / 180),
    c.l,
  ];
  const [u, v] = [p(x), p(y)];
  return Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
};

test('the set: sixteen dyes, three patterns; hers by default vermilion, plain', () => {
  assert.equal(COLORS.length, 16);
  assert.deepEqual([...PATTERNS], ['plain', 'band', 'stripes']);
  const chosen = lookOf(LIVERY);
  assert.deepEqual(chosen.sail, [...hexToLinear('#D2332A')]);
  assert.deepEqual(chosen.paint, chosen.sail);
  assert.equal(chosen.pattern, 'plain');
});

test('every dye stands apart from every other, and from the sea, the foam and the storm', () => {
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++)
      assert.ok(
        apart(COLORS[i], COLORS[j]) > 0.15,
        `dyes ${i} and ${j}: ${apart(COLORS[i], COLORS[j]).toFixed(3)}`
      );
    for (const [name, c] of Object.entries({
      SEA_SHALLOW,
      SEA_MIDDLE,
      SEA_DEEP,
      FOAM,
      CREAM,
      STORM: STORM.lit,
    }))
      assert.ok(
        apart(COLORS[i], [...c]) > 0.18,
        `dye ${i} near ${name}: ${apart(COLORS[i], [...c]).toFixed(3)}`
      );
    const { h, s } = hsl(COLORS[i]);
    if (s > 0.2)
      assert.ok(h < 150 || h > 295, `dye ${i}'s hue ${h.toFixed(0)}°`);
  }
});

const lum = (c: readonly number[]) => {
  const k = ColorManagement.getLuminanceCoefficients(new Vector3());
  return k.x * c[0] + k.y * c[1] + k.z * c[2];
};
const contrast = (a: readonly number[], b: readonly number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('every dye has its marks in an ink that stands out on it: cream on the dark, tar on the light', () => {
  for (const d of DYES) {
    assert.deepEqual(d.mark, [...markOn(d.color)]);
    const c = contrast(d.color, d.mark);
    assert.ok(c >= 3, `${d.name}'s marks ${c.toFixed(2)} : 1`);
    const other = d.mark[0] === MARKS.light[0] ? MARKS.dark : MARKS.light;
    assert.ok(c >= contrast(d.color, other), `${d.name}: the other ink`);
  }
  const ink = (name: string) => DYES.find((d) => d.name === name)?.mark;
  for (const name of ['lemon', 'peach', 'chartreuse', 'rose', 'ochre'])
    assert.deepEqual(ink(name), [...MARKS.dark], name);
  for (const name of ['vermilion', 'oxblood', 'murrey', 'charcoal'])
    assert.deepEqual(ink(name), [...MARKS.light], name);
});

test('every dye has a name of its own, and its color is the set’s', () => {
  assert.equal(new Set(DYES.map((d) => d.name)).size, DYES.length);
  assert.deepEqual(
    DYES.map((d) => d.color),
    COLORS
  );
  assert.equal(DYES[LIVERY.dye].name, 'vermilion');
});

test("a livery's look: its dye as paint and canvas, its pattern; one past the set is hers by default", () => {
  every((l) => {
    const look = lookOf(l);
    assert.deepEqual(look.paint, COLORS[l.dye]);
    assert.deepEqual(look.sail, COLORS[l.dye]);
    assert.equal(look.pattern, PATTERNS[l.pattern]);
  });
  for (const bad of [
    { dye: -1, pattern: 0 },
    { dye: 16, pattern: 1 },
    { dye: 2.5, pattern: 1 },
    { dye: Number.NaN, pattern: 9 },
  ])
    assert.deepEqual(worn(bad).dye, LIVERY.dye);
  assert.deepEqual(worn({ dye: 3, pattern: 7 }), { dye: 3, pattern: 0 });
  assert.deepEqual(worn({ dye: 5, pattern: 2 }), { dye: 5, pattern: 2 });
});

test('the seed deals every bot its own from the set, the same every time for the same seed', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((id) => dealt(1234, id, LIVERY)),
    [
      { dye: 12, pattern: 1 },
      { dye: 4, pattern: 2 },
      { dye: 12, pattern: 2 },
      { dye: 12, pattern: 2 },
      { dye: 9, pattern: 2 },
      { dye: 5, pattern: 0 },
    ]
  );
  for (const seed of SEEDS)
    for (let id = 1; id < SETUP.most; id++) {
      const a = dealt(seed, id, LIVERY);
      assert.deepEqual(
        worn(a),
        a,
        `seed ${seed} ship ${id}: ${JSON.stringify(a)}`
      );
    }
  const fleet = (seed: number) =>
    Array.from({ length: SETUP.most - 1 }, (_, i) =>
      dealt(seed, i + 1, LIVERY)
    );
  assert.notDeepEqual(fleet(1), fleet(2));
});

test('never her dye: whatever she wears, no bot of any seed wears it', () => {
  every((chosen) => {
    for (const seed of SEEDS)
      for (let id = 1; id < SETUP.most; id++)
        assert.notEqual(dealt(seed, id, chosen).dye, chosen.dye);
  });
});

test('the fleet is dealt across the whole set: every other dye and every pattern at sea in a race', () => {
  every((chosen) => {
    const dyes = new Set<number>(),
      patterns = new Set<number>();
    for (let id = 1; id < SETUP.most; id++) {
      const l = dealt(1234, id, chosen);
      dyes.add(l.dye);
      patterns.add(l.pattern);
    }
    assert.equal(dyes.size, COLORS.length - 1);
    assert.equal(patterns.size, PATTERNS.length);
  });
  const counts = new Array<number>(COLORS.length).fill(0);
  for (let seed = 0; seed < 200; seed++)
    for (let id = 1; id < SETUP.most; id++)
      counts[dealt(seed, id, LIVERY).dye]++;
  const others = counts.slice(1),
    mean = others.reduce((a, b) => a + b) / others.length;
  assert.equal(counts[0], 0);
  for (const n of others)
    assert.ok(Math.abs(n / mean - 1) < 0.1, `${n} of ${mean}`);
});

test('her pattern moves no bot: only her dye is kept from them', () => {
  for (let id = 1; id < SETUP.most; id++) {
    const a = dealt(99, id, { dye: 0, pattern: 0 }),
      b = dealt(99, id, { dye: 0, pattern: 2 });
    assert.deepEqual(a, b, 'her pattern does not move the bots');
  }
});

test('until the career, every team wears the livery of its index, the player’s its own, and no other team that one', () => {
  const race = setupOf(1, { player: true }),
    teams = new Set(race.ships.map((s) => s.team)).size;
  const same = (a: Livery, b: Livery) =>
    a.dye === b.dye && a.pattern === b.pattern;
  assert.deepEqual(
    teamLiveries(race, LIVERY),
    Array.from({ length: teams }, (_, t) => liveryAt(t))
  );
  every((chosen) => {
    const all = teamLiveries(race, chosen);
    assert.equal(all.length, teams);
    assert.deepEqual(all[0], chosen);
    assert.equal(all.filter((l) => same(l, chosen)).length, 1);
    assert.equal(new Set(all.map((l) => `${l.dye} ${l.pattern}`)).size, teams);
    all.forEach((l, t) =>
      assert.ok(t === 0 || same(l, liveryAt(t)) || same(liveryAt(t), chosen))
    );
  });
});
