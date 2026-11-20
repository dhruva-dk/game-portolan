import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOTTOM,
  MIE_EXTINCTION,
  MIE_SCALE_HEIGHT,
  TOP,
  transmittance,
  transmittanceRMu,
  transmittanceUV,
} from '../src/sky/atmosphere.ts';

const near = (a: number, b: number, tol: number) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('transmittance table mapping round-trips', () => {
  for (const r of [BOTTOM, BOTTOM + 0.5, BOTTOM + 30, TOP - 1]) {
    for (const mu of [-0.1, 0, 0.05, 0.5, 1]) {
      const horizon = -Math.sqrt(1 - (BOTTOM * BOTTOM) / (r * r));
      if (mu < horizon) continue; // rays into the ground have no entry
      const [u, v] = transmittanceUV(r, mu);
      const [r2, mu2] = transmittanceRMu(u, v);
      near(r2, r, 1e-6);
      near(mu2, mu, 1e-6);
    }
  }
});

test('straight up from the sea, the air passes most red and less blue', () => {
  // Optical depth ≈ Rayleigh·8 km + Mie·its scale height + ozone·15 km.
  const mie = MIE_EXTINCTION * MIE_SCALE_HEIGHT;
  const [r, g, b] = transmittance(BOTTOM, 1, 200);
  near(r, Math.exp(-(5.802e-3 * 8 + mie + 0.65e-3 * 15)), 0.01);
  near(g, Math.exp(-(13.558e-3 * 8 + mie + 1.881e-3 * 15)), 0.01);
  near(b, Math.exp(-(33.1e-3 * 8 + mie + 0.085e-3 * 15)), 0.01);
});

test('at the horizon the sun is red', () => {
  const [r, g, b] = transmittance(BOTTOM + 0.01, 0, 200);
  assert.ok(r > g && g > b, `${r} ${g} ${b}`);
  assert.ok(b < 0.05, `blue ${b}`);
});
