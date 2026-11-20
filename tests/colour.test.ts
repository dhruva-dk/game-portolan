// src/colour.ts: the sRGB curve both ways, as three's ColorManagement has it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color, SRGBColorSpace } from 'three';
import { hexToLinear, linearToSrgb, linearToSrgbRgb, srgbToLinear } from '../src/colour.ts';

test('hexToLinear is three\'s sRGB to linear, from a string or a number', () => {
  for (const hex of [0x000000, 0xffffff, 0x4fc3ff, 0xd2332a, 0x0a0b0c, 0x808080]) {
    const c = new Color().setHex(hex, SRGBColorSpace);
    const ours = hexToLinear(hex);
    for (const [i, v] of [c.r, c.g, c.b].entries()) {
      assert.ok(Math.abs(ours[i] - v) < 1e-7, `${hex.toString(16)}: ${ours} vs ${[c.r, c.g, c.b]}`);
    }
    assert.deepEqual(hexToLinear(`#${hex.toString(16).padStart(6, '0')}`), ours);
  }
});

test('linearToSrgb undoes srgbToLinear', () => {
  for (let i = 0; i <= 255; i++) assert.ok(Math.abs(linearToSrgb(srgbToLinear(i / 255)) - i / 255) < 1e-12);
  // held within 0…1
  const held = linearToSrgbRgb([-1, 2, 0]);
  assert.ok(held[0] === 0 && Math.abs(held[1] - 1) < 1e-12 && held[2] === 0, `${held}`);
});
