// WP28: the sound bank offline, in Node: every sound and variant renders finite, audible, under full scale, inside a
// loudness band and of a sane length; renders are deterministic and variants differ; beds loop seamlessly; one-shots end
// without a click; the chord and the chest shimmer grow with the claim and the tier; the bank's synthesis cost is bounded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, render, SOUND_NAMES, SOUNDS } from '../../src/audio/sfx.ts';

const variants = (name: (typeof SOUND_NAMES)[number]): number[] => [...Array(SOUNDS[name].variants).keys()];

test('every sound and variant: finite, audible, under full scale, in the loudness band, of sane length', () => {
  const t0 = performance.now();
  let n = 0;
  for (const name of SOUND_NAMES) for (const v of variants(name)) {
    const chs = render(name, v), m = measure(chs), id = `${name}:${v}`;
    n++;
    assert.ok(chs.length === 1 || chs.length === 2, id);
    assert.ok(chs.every((c) => c.length === chs[0].length), `${id} channels`);
    assert.ok(m.finite, `${id} not finite`);
    assert.ok(m.peak > 0.2 && m.peak <= 1, `${id} peak ${m.peak}`);
    assert.ok(m.loudness > -36 && m.loudness < -4, `${id} loudness ${m.loudness.toFixed(1)} dBFS`);
    assert.ok(m.seconds >= 0.1 && m.seconds <= (SOUNDS[name].loop ? 12.5 : 6), `${id} ${m.seconds}s`);
  }
  const ms = performance.now() - t0;
  console.log(`bank: ${SOUND_NAMES.length} sounds, ${n} variants rendered in ${ms.toFixed(0)} ms`);
  assert.ok(ms < 15000, `the whole bank renders in ${ms.toFixed(0)} ms (budget 15 s of one core, off the main thread)`);
});

test('renders are deterministic and variants differ', () => {
  for (const name of SOUND_NAMES) {
    const a = render(name, 0)[0], b = render(name, 0)[0];
    assert.ok(a.length === b.length && a.every((x, i) => x === b[i]), `${name} is not deterministic`);
    if (SOUNDS[name].variants > 1) {
      const c = render(name, 1)[0];
      assert.ok(c.length !== a.length || c.some((x, i) => x !== a[i]), `${name}: variants 0 and 1 are identical`);
    }
  }
});

test('beds loop seamlessly and one-shots end without a click', () => {
  for (const name of SOUND_NAMES) {
    for (const c of render(name, 0)) {
      if (SOUNDS[name].loop) {
        let step = 0;
        for (let i = 1; i < c.length; i++) step = Math.max(step, Math.abs(c[i] - c[i - 1]));
        assert.ok(Math.abs(c[c.length - 1] - c[0]) <= step * 1.01 + 1e-6, `${name}: the loop seam jumps`);
      } else assert.ok(Math.abs(c[c.length - 1]) < 1e-3, `${name}: ends on ${c[c.length - 1]}`);
    }
  }
});

test('the loop chord grows with the claim and the chest shimmer with its pigment tier', () => {
  const lens = (names: (typeof SOUND_NAMES)[number][], vs: number[]): number[] => names.map((n, i) => render(n, vs[i])[0].length);
  const chords = lens(['chord', 'chord', 'chord', 'chord'], [0, 1, 2, 3]), chests = lens(['open0', 'open1', 'open2', 'open3', 'open4'], [0, 0, 0, 0, 0]);
  for (let i = 1; i < chords.length; i++) assert.ok(chords[i] > chords[i - 1]);
  for (let i = 1; i < chests.length; i++) assert.ok(chests[i] > chests[i - 1]);
});
