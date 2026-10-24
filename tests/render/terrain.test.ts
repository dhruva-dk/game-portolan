// WP15 part A terrain: the mesh agrees with itself across cube edges and corners, the LOD templates tile a chunk and
// close every T-junction, every piece of land has a chunk, and the surface queries follow the mesh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHUNK, GROUND, LEVELS, TerrainField, buildChunks, groundAt, template, type Surface } from '../../src/render/terrain.ts';
import { TERRITORY, cellDir } from '../../src/sim/sphere.ts';
import { v3 } from '../../src/sim/math.ts';
import { buildGeography } from '../../src/sim/world/geography.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';

const geo = buildGeography(), field = new TerrainField(geo), N = TERRITORY.n, P = N / CHUNK;
const set = buildChunks(field);
const region = (id: string) => REGIONS.findIndex((r) => r.id === id);

test('a corner shared by faces (cube edges and corners) has one height and one position', () => {
  const seen = new Map<string, { h: number; f: number }>(), d = v3();
  let shared = 0;
  for (let f = 0; f < 6; f++) {
    for (let t = 0; t <= N; t++) {
      for (const [i, j] of [[0, t], [N, t], [t, 0], [t, N]]) {
        field.dir(f, i, j, d);
        const key = `${Math.round(d.x * 1e7)},${Math.round(d.y * 1e7)},${Math.round(d.z * 1e7)}`, h = field.corner(f, i, j), s = seen.get(key);
        if (!s) seen.set(key, { h, f });
        else if (s.f !== f) {
          assert.equal(h, s.h, `corner at ${key}`);
          shared++;
        }
      }
    }
  }
  assert.ok(shared >= 12 * (N - 1), `${shared} shared corners`);
});

test('every LOD template tiles its chunk counter-clockwise and uses no vertex a coarser neighbour lacks', () => {
  const S = CHUNK + 1;
  for (let L = 0; L < LEVELS; L++) {
    for (let mask = 0; mask < 16; mask++) {
      const t = template(L, mask), s = 1 << L, odd = (q: number) => (q / s) % 2 === 1;
      let area = 0;
      for (let k = 0; k < t.length; k += 3) {
        const [a, b, c] = [t[k], t[k + 1], t[k + 2]].map((x) => [x % S, Math.floor(x / S)]);
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        assert.ok(cr > 0, `level ${L} mask ${mask}: outward`);
        area += cr / 2;
      }
      assert.equal(area, CHUNK * CHUNK, `level ${L} mask ${mask}: no hole, no overlap`);
      for (const x of t) {
        const i = x % S, j = Math.floor(x / S);
        if ((mask & 1 && i === 0) || (mask & 2 && i === CHUNK)) assert.ok(!odd(j));
        if ((mask & 4 && j === 0) || (mask & 8 && j === CHUNK)) assert.ok(!odd(i));
      }
    }
  }
});

test('every cell of land lies in a chunk, and chunk neighbours are mutual', () => {
  const has = new Set(set.chunks.map((c) => (c.face * P + c.cy) * P + c.cx));
  for (let cell = 0; cell < geo.heights.length; cell++) {
    if (geo.heights[cell] <= 0) continue;
    const f = Math.floor(cell / (N * N)), i = cell % N, j = Math.floor(cell / N) % N;
    assert.ok(has.has((f * P + Math.floor(j / CHUNK)) * P + Math.floor(i / CHUNK)), `land cell ${cell}`);
  }
  set.chunks.forEach((c, k) => c.nb.forEach((n) => assert.ok(n < 0 || set.chunks[n].nb.includes(k))));
  assert.equal(set.position.length, set.chunks.length * (CHUNK + 1) ** 2 * 3);
});

test('the surface queries follow the mesh: heights at its vertices, outward normals, grounds by slope', () => {
  const d = v3();
  for (const c of set.chunks.slice(0, 20)) {
    for (let k = 0; k < 20; k++) {
      const i = c.cx * CHUNK + ((k * 13) % CHUNK), j = c.cy * CHUNK + ((k * 29) % CHUNK);
      field.dir(c.face, i, j, d);
      assert.ok(Math.abs(field.height(d) - field.corner(c.face, i, j)) < 1e-6);
    }
  }
  let top = 0;
  for (let cell = 1; cell < geo.heights.length; cell++) if (geo.heights[cell] > geo.heights[top]) top = cell;
  const out: Surface = { height: 0, normal: new THREE.Vector3(), up: 0, ground: GROUND.beach, region: 0 };
  field.surface(cellDir(TERRITORY, top, d), 0, out);
  assert.ok(out.height > 5 && out.up > 0 && out.up <= 1, `summit ${out.height} up ${out.up}`);
  assert.equal(out.region, geo.region[top]);
  assert.equal(groundAt(region('iceCrown'), 3, 1), GROUND.ice);
  assert.equal(groundAt(region('spiceIsles'), 0.6, 0.99), GROUND.beach);
  assert.equal(groundAt(region('spiceIsles'), 8, 0.99), GROUND.meadow);
  assert.equal(groundAt(region('spiceIsles'), 3, 0.3), GROUND.cliff);
  assert.equal(groundAt(region('basaltStacks'), 3, 0.3), GROUND.basalt);
  assert.equal(groundAt(region('mangroveLabyrinth'), 0.5, 0.99), GROUND.mud);
});
