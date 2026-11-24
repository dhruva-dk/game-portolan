import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GLYPHS,
  SMALLEST,
  type Glyph,
  type Prim,
} from '../src/ui/base/glyphs.ts';
import { CUT, INK, glyph } from '../src/ui/base/ink.ts';

type Tint = NonNullable<Prim['ink']> | 'iron' | 'caller';

const TABLE: readonly (readonly [string, Tint, number])[] = [
  ['part.sails', 'iron', 40],
  ['part.rigging', 'iron', 40],
  ['part.rudder', 'iron', 40],
  ['part.hull', 'iron', 40],
  ['part.keel', 'iron', 40],
  ['part.mounts', 'iron', 40],
  ['part.gun', 'iron', 40],
  ['weapon.cannon', 'iron', 32],
  ['weapon.scatter', 'iron', 32],
  ['weapon.repeater', 'iron', 32],
  ['weapon.harpoon', 'iron', 32],
  ['weapon.mortar', 'iron', 32],
  ['stat.gunnery', 'rubric', 40],
  ['stat.helm', 'iron', 40],
  ['stat.nerve', 'rubric', 40],
  ['territory', 'iron', 40],
  ['stat.stormcraft', 'storm', 40],
  ['stat.lookout', 'iron', 40],
  ['stat.shield', 'blue', 40],
  ['stat.healSpeed', 'green', 40],
  ['stat.healAmount', 'green', 40],
  ['stat.thrift', 'gold', 40],
  ['stat.upkeep', 'iron', 40],
  ['role.owner', 'iron', 40],
  ['role.driver', 'iron', 40],
  ['role.designer', 'iron', 40],
  ['role.mechanic', 'iron', 40],
  ['ship', 'iron', 24],
  ['afloat', 'iron', 40],
  ['heal', 'green', 40],
  ['storm', 'storm', 32],
  ['storm.holding', 'storm', 24],
  ['storm.closing', 'storm', 24],
  ['gust', 'iron', 32],
  ['target', 'rubric', 40],
  ['pennant', 'iron', 40],
  ['table', 'iron', 40],
  ['flag', 'iron', 40],
  ['winter', 'iron', 40],
  ['starburst', 'iron', 24],
  ['coin', 'gold', 24],
  ['star', 'iron', 24],
  ['starHalf', 'iron', 24],
  ['plus', 'blue', 24],
  ['tick', 'iron', 24],
  ['cross', 'caller', 24],
  ['arrow', 'iron', 24],
  ['counter', 'iron', 24],
  ['pause', 'iron', 24],
  ['wheel', 'iron', 24],
  ['pin', 'iron', 24],
  ['hourglass', 'iron', 24],
];

const glyphs = new Map<string, readonly Prim[]>(Object.entries(GLYPHS));
const drawn = (name: string) => {
  const prims = glyphs.get(name);
  assert.ok(prims, `${name} is drawn`);
  return prims;
};

test('every glyph of the plan exists, in its order, with its smallest size', () => {
  assert.deepEqual(
    SMALLEST.map(([name, size]) => [name, size]),
    TABLE.map(([name, , size]) => [name, size])
  );
  for (const [name] of TABLE) assert.ok(drawn(name).length > 0, name);
});

test('a glyph uses iron and at most the one other ink its meaning fixes', () => {
  for (const [name, tint] of TABLE) {
    const inks = new Set(drawn(name).flatMap((p) => (p.ink ? [p.ink] : [])));
    if (tint === 'iron' || tint === 'caller')
      assert.equal(inks.size, 0, `${name} is drawn in the caller's ink`);
    else assert.deepEqual([...inks], [tint], `${name} is ${tint}`);
  }
});

type Point = readonly [number, number];
type Matrix = readonly [number, number, number, number, number, number];

const apply = (m: Matrix, [x, y]: Point): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
const times = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

function matrixOf(tr: string | undefined): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  for (const [, kind, args] of (tr ?? '').matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).map(Number);
    if (kind === 'translate') m = times(m, [1, 0, 0, 1, v[0], v[1] ?? 0]);
    else if (kind === 'scale') m = times(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
    else if (kind === 'rotate') {
      const a = (v[0] * Math.PI) / 180,
        [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
      m = times(m, [1, 0, 0, 1, cx, cy]);
      m = times(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
      m = times(m, [1, 0, 0, 1, -cx, -cy]);
    } else assert.fail(`unknown transform ${kind}`);
  }
  return m;
}

function arcPoints(
  from: Point,
  rx: number,
  ry: number,
  large: number,
  sweep: number,
  to: Point
): Point[] {
  const dx = (from[0] - to[0]) / 2,
    dy = (from[1] - to[1]) / 2;
  const scale = Math.max(
    1,
    Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
  );
  const a = rx * scale,
    b = ry * scale;
  const k =
    (large === sweep ? -1 : 1) *
    Math.sqrt(
      Math.max(
        0,
        (a * a * b * b - a * a * dy * dy - b * b * dx * dx) /
          (a * a * dy * dy + b * b * dx * dx)
      )
    );
  const cx = (k * a * dy) / b + (from[0] + to[0]) / 2,
    cy = (-k * b * dx) / a + (from[1] + to[1]) / 2;
  const t0 = Math.atan2((from[1] - cy) / b, (from[0] - cx) / a);
  let t1 = Math.atan2((to[1] - cy) / b, (to[0] - cx) / a) - t0;
  if (sweep && t1 < 0) t1 += 2 * Math.PI;
  if (!sweep && t1 > 0) t1 -= 2 * Math.PI;
  return Array.from({ length: 33 }, (_, i) => {
    const t = t0 + (t1 * i) / 32;
    return [cx + a * Math.cos(t), cy + b * Math.sin(t)] as const;
  });
}

function pointsOf(d: string): Point[] {
  const out: Point[] = [];
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e-?\d+)?/g) ?? [];
  let i = 0,
    at: Point = [0, 0],
    start: Point = [0, 0],
    control: Point = [0, 0],
    command = '';
  const num = () => Number(tokens[i++]);
  const bezier = (ps: readonly Point[]) => {
    for (let s = 1; s <= 16; s++) {
      const t = s / 16;
      let pts = [...ps];
      while (pts.length > 1)
        pts = pts
          .slice(1)
          .map((p, j) => [
            pts[j][0] + (p[0] - pts[j][0]) * t,
            pts[j][1] + (p[1] - pts[j][1]) * t,
          ]);
      out.push(pts[0]);
    }
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    const rel = command === command.toLowerCase(),
      c = command.toUpperCase();
    const pt = (): Point => {
      const x = num(),
        y = num();
      return rel ? [at[0] + x, at[1] + y] : [x, y];
    };
    if (c === 'Z') {
      control = at = start;
      continue;
    }
    if (c === 'M') {
      at = start = pt();
      out.push(at);
      command = rel ? 'l' : 'L';
    } else if (c === 'L') out.push((at = pt()));
    else if (c === 'H') out.push((at = [rel ? at[0] + num() : num(), at[1]]));
    else if (c === 'V') out.push((at = [at[0], rel ? at[1] + num() : num()]));
    else if (c === 'C') {
      const p1 = pt(),
        p2 = pt(),
        p3 = pt();
      bezier([at, p1, p2, p3]);
      control = p2;
      at = p3;
      continue;
    } else if (c === 'S' || c === 'T') {
      const reflected: Point = [2 * at[0] - control[0], 2 * at[1] - control[1]];
      const p1 = c === 'S' ? pt() : reflected,
        p2 = pt();
      bezier(c === 'S' ? [at, reflected, p1, p2] : [at, reflected, p2]);
      control = p1;
      at = p2;
      continue;
    } else if (c === 'Q') {
      const p1 = pt(),
        p2 = pt();
      bezier([at, p1, p2]);
      control = p1;
      at = p2;
      continue;
    } else if (c === 'A') {
      const rx = num(),
        ry = num();
      num();
      const large = num(),
        sweep = num(),
        to = pt();
      out.push(...arcPoints(at, rx, ry, large, sweep, to));
      at = to;
    } else assert.fail(`unknown path command ${command} in ${d}`);
    control = at;
  }
  return out;
}

test('no shape of a glyph leaves its 24-unit square', () => {
  const outside: string[] = [];
  for (const [name] of TABLE)
    for (const p of drawn(name)) {
      const m = matrixOf(p.tr),
        half = p.k === 's' ? (p.w ?? 1.5) / 2 : 0;
      for (const point of pointsOf(p.d)) {
        const [x, y] = apply(m, point);
        if (Math.min(x, y) - half < -0.01 || Math.max(x, y) + half > 24.01) {
          outside.push(`${name} reaches ${x.toFixed(2)}, ${y.toFixed(2)}`);
          break;
        }
      }
    }
  assert.deepEqual(outside, []);
});

const paths = (svg: string) =>
  [...svg.matchAll(/<path ([^>]*)\/>/g)].map(([, attrs]) =>
    Object.fromEntries(
      [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])
    )
  );

const isGlyph = (name: string): name is Glyph => name in GLYPHS;
const names = Object.keys(GLYPHS).filter(isGlyph);
const inked = names.filter((name) => GLYPHS[name].some((p) => p.ink && !p.cut));

test('a shape with its own ink is drawn in that ink whatever the caller asks', () => {
  assert.ok(inked.length > 0);
  for (const name of inked)
    for (const asked of [undefined, 'iron', 'white', 'rubric'] as const) {
      const drawnPaths = paths(glyph(name, 32, 32, 64, { ink: asked }));
      for (const p of GLYPHS[name]) {
        if (p.cut) continue;
        const ink = p.ink ?? asked ?? 'iron';
        const match = drawnPaths.filter(
          (a) => a.d === p.d && a.stroke !== undefined && a.stroke !== CUT
        );
        assert.ok(match.length > 0, `${name} draws ${p.d}`);
        for (const a of match)
          assert.equal(
            a.stroke,
            INK[ink],
            `${name} asked in ${asked ?? 'nothing'}`
          );
        if (p.k === 'f')
          for (const a of match)
            assert.match(a.fill, new RegExp(`^url\\(#h-${ink}(-d)?\\)$`));
      }
    }
});

test('fine shapes appear only at 40 and above', () => {
  for (const name of names) {
    const fine = GLYPHS[name].filter((p) => p.fine && !p.bold);
    for (const size of [24, 32, 39.9, 40, 64]) {
      const d = new Set(paths(glyph(name, 0, 0, size)).map((a) => a.d));
      const others = new Set(
        GLYPHS[name].filter((p) => !p.fine).map((p) => p.d)
      );
      for (const p of fine)
        if (!others.has(p.d))
          assert.equal(d.has(p.d), size >= 40, `${name} at ${size}`);
    }
  }
});

test('a faint glyph keeps every shape and every ink, only fainter', () => {
  for (const name of inked) {
    const full = glyph(name, 12, 12, 40),
      faint = glyph(name, 12, 12, 40, { opacity: 0.35 });
    assert.match(faint, /^<g [^>]*opacity="0.35"/);
    assert.deepEqual(paths(faint), paths(full));
  }
});
