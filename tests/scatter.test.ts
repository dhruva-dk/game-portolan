import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlanet } from '../src/world/planet.ts';
import { PALMS, SHRUBS, isle, litter, scatterPalms, scatterRocks, scatterShrubs } from '../src/world/scatter.ts';

const planet = createPlanet(1);
const isles = planet.islands.map((s) => isle(s, planet.height));
const big = isles[0], small = isles[isles.length - 1];
const fromCoast = (i: (typeof isles)[number], x: number, z: number) => Math.hypot(x, z) - i.site.coast(Math.atan2(z, x));

test('rocks: big masses 5–12 m across heaped in outcrops on the shoulders and at the waterline, boulders round them', () => {
  for (const [k, i] of isles.entries()) {
    const rocks = scatterRocks(i, 4, 4, k + 1);
    const masses = rocks.filter((r) => r.big), boulders = rocks.filter((r) => !r.big);
    assert.ok(masses.length >= 2, `island ${k}: ${masses.length} masses`);
    assert.ok(boulders.length >= masses.length, `island ${k}: ${boulders.length} boulders`);
    for (const r of masses) {
      assert.ok(r.size * 2 >= 5 && r.size * 2 <= 12, `across ${r.size * 2}`);
      const d = fromCoast(i, r.x, r.z);
      assert.ok(d > -17 && d < 10, `from the waterline ${d}`);
    }
    for (const r of rocks) {
      assert.ok(r.y < i.height(r.x, r.z) - 0.1 * r.size, 'sunk');
      assert.ok(r.shape >= 0 && r.shape < 4);
      // masses heap against each other; boulders stand apart
      for (const o of rocks) if (o !== r) assert.ok(Math.hypot(o.x - r.x, o.z - r.z) > (o.size + r.size) * (o.big && r.big ? 0.59 : 0.74), 'apart');
    }
    assert.deepEqual(scatterRocks(i, 4, 4, k + 1), rocks, 'the same every time');
  }
  // the largest island has more outcrops than the smallest
  assert.ok(scatterRocks(big, 4, 4).filter((r) => r.big).length > scatterRocks(small, 4, 4).filter((r) => r.big).length);
  // some of the waterline's stand out in the water
  const wet = isles.flatMap((i, k) => scatterRocks(i, 4, 4, k + 1).filter((r) => r.big && i.height(r.x, r.z) < -0.3));
  assert.ok(wet.length > 0, 'masses in the shallows');
});

test('palms stand on dry land, apart, off the rocks, leaning seaward, as many as the island\'s area holds', () => {
  for (const [k, i] of isles.entries()) {
    const rocks = scatterRocks(i, 4, 4, k + 1), palms = scatterPalms(i, rocks, k + 1);
    let seaward = 0;
    for (const p of palms) {
      assert.ok(i.height(p.x, p.z) > 0.4, 'dry');
      for (const o of palms) if (o !== p) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) >= 3.5, 'apart');
      for (const r of rocks) assert.ok(Math.hypot(r.x - p.x, r.z - p.z) > r.size, 'off the rocks');
      if (Math.cos(p.heading - Math.atan2(p.z, p.x)) > 0) seaward++;
    }
    assert.ok(seaward >= palms.length * 0.85, `seaward ${seaward}/${palms.length}`);
    assert.deepEqual(scatterPalms(i, rocks, k + 1), palms, 'the same every time');
  }
  const n = (i: (typeof isles)[number]) => scatterPalms(i, scatterRocks(i, 4, 4), 1).length;
  const expected = PALMS * (big.site.radius / 70) ** 2;
  assert.ok(n(big) > expected * 0.7, `largest: ${n(big)} palms, about ${expected.toFixed(0)} hoped`);
  assert.ok(n(small) < n(big) / 3, `smallest ${n(small)} vs largest ${n(big)}`);
});

test('shrubs stand on dry land behind the beach, as many as the island\'s area holds', () => {
  for (const [k, i] of isles.entries()) {
    const shrubs = scatterShrubs(i, scatterRocks(i, 4, 4, k + 1), 4, k + 1);
    for (const s of shrubs) {
      assert.ok(i.height(s.x, s.z) > 0.5, 'dry');
      assert.ok(s.shape >= 0 && s.shape < 4);
    }
    assert.deepEqual(scatterShrubs(i, scatterRocks(i, 4, 4, k + 1), 4, k + 1), shrubs, 'the same every time');
  }
  const shrubs = scatterShrubs(big, scatterRocks(big, 4, 4), 4).length, expected = SHRUBS * (big.site.radius / 70) ** 2;
  assert.ok(shrubs > expected * 0.7, `largest: ${shrubs} shrubs, about ${expected.toFixed(0)} hoped`);
});

test('litter lies under the palms', () => {
  const palms = scatterPalms(big, scatterRocks(big, 4, 4));
  const thick = litter(palms, []);
  assert.ok(palms.every((p) => thick(p.x, p.z) > 0.9));
  assert.equal(thick(1e4, 1e4), 0);
});
