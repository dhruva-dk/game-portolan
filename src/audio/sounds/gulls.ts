// The flight's sounds (the gulls: gulls/gulls.ts draws them): a few birds' wingbeats as they come aboard or go, and a
// gull's cry, a laughing "kee-ow" falling in pitch, as they set to a job or botch one.

import { ar, filter, finish, layer, mix, noise, normal, saturate, swell, take, tone, type Samples, type Take } from '../dsp.ts';

/** One bird's beats: from `at` for `seconds`, `rate` a second, each a soft rush of air through feathers. */
function beats(t: Take, at: number, seconds: number, rate: number, gain: number) {
  const air = layer(t);
  const on = swell(0.15, seconds, 0.4);
  noise(air, (s) => {
    const u = s - at;
    if (u < 0 || u > seconds) return 0;
    // each downstroke a quick swell and a slower fall, every 1/rate s, a little uneven
    const phase = (u * rate + 0.08 * Math.sin(u * 7)) % 1;
    return on(u) * (phase < 0.25 ? phase / 0.25 : Math.exp(-(phase - 0.25) / 0.18));
  });
  filter(air, 'bandpass', 520 + 260 * t.r(), 0.9);
  mix(t, air, 0, gain);
}

/** Wingbeats: four gulls beating past, each its own rate, one after another. */
export function wings(rate: number, seed: number): Samples {
  const t = take(1.6, rate, seed);
  for (let k = 0; k < 4; k++) beats(t, 0.06 * k + 0.05 * t.r(), 1.1 + 0.3 * t.r(), 4.6 + 1.4 * t.r(), 0.6 + 0.4 * t.r());
  filter(t, 'highpass', 150);
  filter(t, 'lowpass', 2600);
  return normal(finish(t, 0.01, 0.15)).x;
}

/** One call: a rasping, falling "kee-ow" from `at`, `pitch` its top, `seconds` long. */
function call(t: Take, at: number, pitch: number, seconds: number) {
  const voice = layer(t);
  const f = (s: number) => pitch * (1 - 0.38 * Math.min(1, s / seconds) ** 0.7) * (1 + 0.03 * Math.sin(s * 2 * Math.PI * 31));
  const env = (s: number) => ar(0.02, seconds * 0.45)(s) * (s < seconds ? 1 : 0);
  // its harmonics, the second strongest: the gull's reedy, nasal ring
  ([[1, 0.5], [2, 1], [3, 0.45], [4, 0.25], [5, 0.12]] as const).forEach(([h, g]) => tone(voice, (s) => f(s) * h, (s) => env(s) * g, at, seconds * 1.3));
  saturate(voice, 2.2);
  filter(voice, 'bandpass', pitch * 2.1, 1.3);
  mix(t, voice, 0, 1);
  const breath = layer(t);
  noise(breath, (s) => (s >= at && s < at + seconds ? 0.12 * env(s - at) : 0));
  filter(breath, 'bandpass', pitch * 2.5, 2);
  mix(t, breath, 0, 1);
}

/** A gull's cry: two or three calls, the first the highest. */
export function cry(rate: number, seed: number): Samples {
  const t = take(1.3, rate, seed);
  const n = 2 + Math.floor(t.r() * 2), top = 820 + 220 * t.r();
  for (let k = 0; k < n; k++) call(t, k * (0.26 + 0.06 * t.r()), top * (1 - 0.06 * k), 0.2 + 0.08 * t.r() + (k === 0 ? 0.08 : 0));
  filter(t, 'highpass', 300);
  return normal(finish(t, 0.005, 0.1)).x;
}
