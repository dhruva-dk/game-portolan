import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOD,
  STRIDE,
  createLod,
  type LodEye,
} from '../src/land/terrain-lod.ts';
import {
  FACES,
  R,
  horizonDip,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import { createTerrain, heightBounds } from '../src/world/terrain.ts';

const terrain = createTerrain(1);
const lod = createLod(heightBounds(terrain, 2 ** LOD.LEAF));
const out = new Float32Array(8192 * STRIDE);
const always = () => true;

const eyeAt = (dir: Vec3, height: number): LodEye => ({
  position: scale(normalize(dir), R + height),
  height,
});

interface Patch {
  face: number;
  u: number;
  v: number;
  s: number;
  level: number;
  start: number;
  end: number;
}
function patches(eye: LodEye): Patch[] {
  const n = lod.select(eye, always, out),
    list: Patch[] = [];
  for (let k = 0; k < n; k++) {
    const o = k * STRIDE,
      across = [out[o + 6], out[o + 7], out[o + 8]];
    const face = FACES.findIndex((f) => across[f.across[0]] === f.across[1]);
    list.push({
      face,
      u: out[o],
      v: out[o + 1],
      s: out[o + 2],
      level: Math.round(Math.log2(2 / out[o + 2])),
      start: out[o + 4],
      end: out[o + 5],
    });
  }
  return list;
}

/** The point at (u, v) on a face, at sea level. */
function at(face: number, u: number, v: number): Vec3 {
  const f = FACES[face],
    d: [number, number, number] = [0, 0, 0];
  d[f.across[0]] += f.across[1];
  d[f.u[0]] += f.u[1] * Math.tan((u * Math.PI) / 4);
  d[f.v[0]] += f.v[1] * Math.tan((v * Math.PI) / 4);
  return scale(normalize(d), R);
}

const eyes: [string, LodEye][] = [
  ['at sea', eyeAt([1, 0.3, 0.2], 10)],
  ['aloft', eyeAt([0.2, -1, 0.7], 120)],
  ['on a face corner', eyeAt([1, 1, 1], 40)],
];

for (const [name, eye] of eyes) {
  test(`terrain lod ${name}: the finest patches lie under the eye, and the selection fits the budget`, () => {
    const list = patches(eye);
    assert.ok(list.length > 0 && list.length < 1200, `${list.length} patches`);
    const near = list.filter((p) => p.level === LOD.LEAF).length;
    assert.ok(near >= 4, `${near} leaf patches`);
  });

  test(
    `terrain lod ${name}: neighbouring patches differ by a level at most, ` +
      "and where they meet the finer is its parent's grid and the coarser unmorphed",
    () => {
      const list = patches(eye),
        eps = 1e-9;
      let seams = 0;
      for (const a of list)
        for (const b of list) {
          if (a.face !== b.face || b.level <= a.level) continue;
          // b finer than a: do they share a stretch of edge?
          const touchU =
            Math.abs(a.u + a.s - b.u) < eps || Math.abs(b.u + b.s - a.u) < eps;
          const touchV =
            Math.abs(a.v + a.s - b.v) < eps || Math.abs(b.v + b.s - a.v) < eps;
          const overlapU =
            Math.min(a.u + a.s, b.u + b.s) - Math.max(a.u, b.u) > eps;
          const overlapV =
            Math.min(a.v + a.s, b.v + b.s) - Math.max(a.v, b.v) > eps;
          if (!((touchU && overlapV) || (touchV && overlapU))) continue;
          assert.equal(b.level - a.level, 1, 'levels two apart side by side');
          seams++;
          // along the shared stretch, by the sea-level distance the shader morphs by: b has finished its morph, a not begun
          for (let t = 0; t <= 8; t++) {
            const u = touchU
              ? Math.abs(a.u + a.s - b.u) < eps
                ? b.u
                : b.u + b.s
              : b.u + (b.s * t) / 8;
            const v = touchU
              ? b.v + (b.s * t) / 8
              : Math.abs(a.v + a.s - b.v) < eps
                ? b.v
                : b.v + b.s;
            const p = at(a.face, u, v),
              e = eye.position;
            const d = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
            assert.ok(
              d <= a.start,
              `coarse patch morphing at its edge: ${d.toFixed(1)} m > ${a.start.toFixed(1)} m`
            );
            assert.ok(
              d >= b.end,
              `fine patch not done morphing at its edge: ${d.toFixed(1)} m < ${b.end.toFixed(1)} m`
            );
          }
        }
      assert.ok(seams > 10, `${seams} seams between levels`);
    }
  );
}

test('terrain lod: nothing the view excludes is drawn, and nothing beyond the horizon', () => {
  const eye = eyeAt([1, 0.3, 0.2], 10);
  assert.equal(
    lod.select(eye, () => false, out),
    0
  );
  const reach = R * (horizonDip(eye.height) + horizonDip(25));
  for (const p of patches(eye)) {
    const c = at(p.face, p.u + p.s / 2, p.v + p.s / 2),
      e = normalize(eye.position);
    const round =
      Math.acos(Math.min(1, (c[0] * e[0] + c[1] * e[1] + c[2] * e[2]) / R)) * R;
    assert.ok(
      round < reach + p.s * R,
      `patch ${round.toFixed(0)} m round, the horizon ${reach.toFixed(0)} m`
    );
  }
});
