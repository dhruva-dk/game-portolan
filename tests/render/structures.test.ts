import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { R } from '../../src/sim/sphere.ts';
import { buildGeography } from '../../src/sim/world/geography.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { HARBOUR, layHarbours, layLighthouses, TOWER } from '../../src/render/structures.ts';
import { TerrainField } from '../../src/render/terrain.ts';

const geo = buildGeography(), field = new TerrainField(geo);
const towers = layLighthouses(geo, field), harbours = layHarbours(geo, field);

test('a lighthouse stands on every headland light, its lantern (where its beam is seated) over the light', () => {
  assert.equal(towers.length, geo.lights.length);
  geo.lights.forEach((l, i) => {
    const lantern = new THREE.Vector3(0, TOWER.lamp, 0).applyMatrix4(towers[i].matrix);
    assert.ok(lantern.distanceTo(towers[i].lamp) < 1e-3, `light ${i}: lantern ${lantern.distanceTo(towers[i].lamp).toFixed(4)} u off its lamp`);
    assert.ok(lantern.clone().normalize().distanceTo(new THREE.Vector3(l.pos.x, l.pos.y, l.pos.z).normalize()) < (TOWER.setBack + 0.1) / R, `light ${i} stood too far back`);
  });
});

test('every lighthouse is seated: its plinth reaches below the ground round it, and it is not sunk in the rock', () => {
  for (const [i, t] of towers.entries()) {
    assert.ok(t.base - TOWER.plinth * t.scale <= t.low, `light ${i} floats: foot ${(t.base - TOWER.plinth * t.scale).toFixed(2)} over ${t.low.toFixed(2)}`);
    assert.ok(t.high - t.base <= Math.max(1.4 * t.scale, t.high - t.low - TOWER.plinth * t.scale * 0.95) + 1e-9, `light ${i} sunk ${(t.high - t.base).toFixed(2)} u into the rock`);
    assert.ok(t.low > 0, `light ${i} stands in the sea (${t.low.toFixed(2)})`);
  }
});

test('every region has a harbour, each with a mouth to the sea, a lamp over the water and moorings', () => {
  REGIONS.forEach((r, ri) => assert.ok(harbours.some((h) => h.region === ri), `${r.name} has no harbour`));
  for (const [i, h] of harbours.entries()) {
    assert.ok(Math.abs(h.mouth.dot(h.pos)) < 1e-6 && Math.abs(h.mouth.length() - 1) < 1e-6, `harbour ${i}: mouth not a tangent`);
    assert.ok(h.lamp.length() - R > HARBOUR.lamp, `harbour ${i}: lamp at ${(h.lamp.length() - R).toFixed(2)} u`);
    assert.ok(h.posts.length + h.bollards.length > 0, `harbour ${i} has nothing to moor to`);
    assert.ok(h.rocks.length > 0, `harbour ${i} has no stone`);
  }
});
