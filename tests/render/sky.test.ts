import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LIGHT_MIN, newSkyLight, skyLight } from '../../src/render/light.ts';
import { hourPalette, toLinear } from '../../src/style/palette.ts';

const FEET = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.3, 0.8, -0.5), new THREE.Vector3(0.02, 1, 0.01), new THREE.Vector3(0, -1, 0.001)];
const STEP = 0.05;

test('the light stays above the horizon and turns smoothly through the day', () => {
  const a = newSkyLight(), b = newSkyLight();
  for (const foot of FEET) {
    for (let h = 0; h < 24; h += STEP) {
      skyLight(h, foot, a);
      skyLight(h + STEP, foot, b);
      assert.ok(a.light.dot(a.up) >= LIGHT_MIN.sun - 1e-9, `lit from below the horizon at ${h.toFixed(2)}`);
      assert.ok(a.light.angleTo(b.light) < 0.3, `the light jumps at ${h.toFixed(2)}`);
      assert.ok(Math.abs(a.lit - b.lit) < 0.1 && Math.abs(a.day - b.day) < 0.1, `the lamps or the day jump at ${h.toFixed(2)}`);
      if (h > 6.1 && h < 17.9) assert.ok(a.sunHeight > 0, `the sun is down at ${h.toFixed(2)}`);
      if (h > 7 && h < 17) assert.equal(a.lit, 0, `lamps lit by day at ${h.toFixed(2)}`);
      if (h < 5.9 || h > 18.1) assert.ok(a.sunHeight < 0 && a.moon.dot(a.up) > 0, `no moon at ${h.toFixed(2)}`);
    }
    skyLight(0, foot, a);
    assert.equal(a.lit, 1);
    assert.ok(a.light.angleTo(a.moon) < 1e-6, 'by night the light is the moon');
  }
});

test('the hour palettes blend without a jump', () => {
  const keys = ['paper', 'ink', 'shade', 'sunTint', 'skyZenith', 'skyHorizon', 'skyGlow'] as const;
  for (let h = 0; h < 24; h += 0.02) {
    const a = hourPalette(h), b = hourPalette(h + 0.02);
    for (const k of keys) {
      const x = toLinear(a[k]), y = toLinear(b[k]);
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(x[c] - y[c]) < 0.03, `${k} jumps at ${h.toFixed(2)}`);
    }
  }
});
