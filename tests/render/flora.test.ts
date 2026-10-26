// The shared flora (WP15 part C): planted the same every match, each species where it belongs, kits light enough
// for a whole forested region in view.
import { cpuNow } from '../cpu.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { R, TERRITORY, cellOf } from '../../src/sim/sphere.ts';
import { buildGeography } from '../../src/sim/world/geography.ts';
import { FLOOR, REGIONS } from '../../src/sim/world/regions.ts';
import { FLORA, KINDS, TREES, kitGeometry, plantBed } from '../../src/render/flora.ts';
import { GROUND, TerrainField, type Surface } from '../../src/render/terrain.ts';

const geo = buildGeography(), field = new TerrainField(geo);
const t0 = cpuNow(), bed = plantBed(geo, field), ms = cpuNow() - t0;
const root = (i: number): THREE.Vector3 => new THREE.Vector3(bed.matrix[i * 16 + 12], bed.matrix[i * 16 + 13], bed.matrix[i * 16 + 14]);

test('the planet is planted densely with every region its own flora, the same every match', () => {
  const counts = KINDS.map((_, k) => bed.kind.reduce((a, x) => a + (x === k ? 1 : 0), 0));
  console.log(`planted ${bed.count} in ${ms.toFixed(0)} ms, ${bed.patches.length} patches: ${KINDS.map((k, i) => `${k} ${counts[i]}`).join(', ')}`);
  const again = plantBed(geo, field);
  assert.equal(again.count, bed.count);
  assert.ok(again.matrix.every((x, i) => x === bed.matrix[i]), 'planting differs between builds');
  const seen = REGIONS.map(() => new Set<string>());
  for (let i = 0; i < bed.count; i++) seen[geo.region[cellOf(TERRITORY, root(i).normalize())]].add(KINDS[bed.kind[i]]);
  REGIONS.forEach((r, ri) => {
    // (coral is the sea's: painted on the reef floor under the water, never planted as a mesh, S-021)
    for (const f of r.flora) if (f !== 'coral') assert.ok(seen[ri].has(f), `${r.name}: no ${f}`);
    assert.ok(!seen[ri].has('coral'), `${r.name}: coral planted as a mesh`);
    for (const k of seen[ri]) assert.ok(r.flora.includes(k as never) || k === 'reed' || ((k === 'pandanus' || k === 'broadleaf' || k === 'nutmeg') && r.flora.includes('jungle')), `${r.name}: ${k} does not grow there`);
  });
});

test('nothing grows on cliffs or ice, and no tree on a beach or in the mud; kelp and coral under water on their floors', () => {
  const s: Surface = { height: 0, normal: new THREE.Vector3(), up: 1, ground: GROUND.meadow, region: 0 };
  for (let i = 0; i < bed.count; i += 3) {
    const kind = KINDS[bed.kind[i]], p = root(i), dir = p.clone().normalize(), c = cellOf(TERRITORY, dir);
    if (FLORA[kind].veil) {
      assert.ok(p.length() < R - 0.3, `${kind} ${i} above the water`);
      assert.equal(geo.floor[c], kind === 'kelp' ? FLOOR.kelp : FLOOR.coral, `${kind} ${i} off its floor`);
      continue;
    }
    field.surface(dir, 0, s);
    if (kind === 'mangrove') continue;
    assert.ok(s.ground !== GROUND.cliff && s.ground !== GROUND.basalt && s.ground !== GROUND.ice, `${kind} ${i} on ground ${s.ground}`);
    if (TREES.includes(kind)) assert.ok(s.ground !== GROUND.beach && s.ground !== GROUND.mud, `${kind} ${i} on ground ${s.ground}`);
  }
});

test('every kit is light enough for a whole forested region in view', () => {
  const tris = KINDS.map((k) => [0, 1].map((l) => (l && !FLORA[k].far ? 0 : kitGeometry(k, l).index!.count / 3)));
  console.log(`kit triangles (near/far): ${KINDS.map((k, i) => `${k} ${tris[i].join('/')}`).join(', ')}`);
  KINDS.forEach((k, i) => {
    assert.ok(tris[i][0] <= 600, `${k} near kit ${tris[i][0]} triangles`);
    assert.ok(tris[i][1] <= 110, `${k} far kit ${tris[i][1]} triangles`);
  });
});
