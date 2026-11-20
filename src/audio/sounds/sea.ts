// Her ship and her sea's sounds: a gust filling her canvas, the loot she takes
// up and the stores she mends with, and her water: a loop closed (the sea
// rushing as her colour floods it), the storm beginning to close.

import {
  ar,
  brown,
  bubbles,
  crackle,
  fall,
  filter,
  finish,
  layer,
  mix,
  modes,
  noise,
  normal,
  swell,
  take,
  tone,
  type Samples,
  type Take,
} from '../dsp.ts';
import { timber } from './blows.ts';

/** Canvas filling at once: a crack with a low body, its flutter after. */
const canvas = (t: Take, at: number, gain: number) => {
  const crack = layer(t, 0.1);
  noise(crack, fall(0.006));
  filter(crack, 'highpass', 380);
  mix(t, crack, at, 1.4 * gain);
  modes(
    t,
    [
      [170, 0.1, 0.7 * gain],
      [255, 0.08, 0.5 * gain],
      [410, 0.05, 0.3 * gain],
    ],
    at,
    0.05
  );
  tone(
    t,
    (s) => 135 * (0.6 + 0.4 * Math.exp(-s / 0.04)),
    ar(0.002, 0.05),
    at,
    0.25
  );
  const flutter = layer(t, 0.7);
  noise(
    flutter,
    (s) => (0.55 + 0.45 * Math.sin(2 * Math.PI * 21 * s)) * fall(0.18)(s)
  );
  filter(flutter, 'bandpass', 900, 0.8);
  mix(t, flutter, at + 0.03, 0.8 * gain);
};

/**
 * A gust: the wind's rush through her rig, her canvas cracking full as it takes
 * her.
 */
export function gust(rate: number, seed: number): Samples {
  const t = take(1.9, rate, seed);
  const rush = layer(t);
  noise(rush, swell(0.3, 1.85, 1.3));
  filter(
    rush,
    'bandpass',
    (s) => 320 + 1400 * Math.exp(-(((s - 0.4) / 0.35) ** 2)),
    0.9
  );
  mix(t, rush, 0, 1.1);
  canvas(t, 0.2, 1);
  filter(t, 'highpass', 60);
  return normal(finish(t)).x;
}

/**
 * A loop closed: the sea's rush swelling as her colour floods the water,
 * settling after.
 */
export function claim(rate: number, seed: number): Samples {
  const t = take(3.4, rate, seed);
  const peak = (s: number) => Math.exp(-(((s - 1.05) / 0.6) ** 2));
  const rush = layer(t);
  noise(rush, swell(0.9, 3.35, 2));
  filter(rush, 'lowpass', (s) => 300 + 2900 * peak(s), 0.7);
  mix(t, rush, 0, 0.9);
  const low = layer(t);
  brown(low, swell(1, 3.3, 2));
  filter(low, 'lowpass', 280);
  mix(t, low, 0, 1.5);
  const spray = layer(t);
  noise(spray, peak);
  filter(spray, 'highpass', 3200);
  mix(t, spray, 0, 0.18);
  bubbles(t, 22, 1, 1.8, 300, 900, 0.06);
  filter(t, 'lowshelf', 130, 0.7, -8);
  return normal(finish(t, 0.05, 0.4)).x;
}

/**
 * The storm beginning to close: a far, heavy roll of wind rising and passing
 * on.
 */
export function closing(rate: number, seed: number): Samples {
  const t = take(5, rate, seed);
  const env = swell(1.6, 4.9, 2.6);
  const roll = layer(t);
  brown(
    roll,
    (s) =>
      env(s) *
      (0.7 +
        0.3 *
          Math.sin(2 * Math.PI * 0.9 * s + 1) *
          Math.sin(2 * Math.PI * 0.37 * s))
  );
  filter(roll, 'lowpass', 380);
  filter(roll, 'peak', 190, 1, 5);
  mix(t, roll, 0, 1.4);
  const wind = layer(t);
  noise(wind, env);
  filter(wind, 'bandpass', (s) => 450 + 250 * Math.sin(s * 1.3), 0.8);
  mix(t, wind, 0, 0.5);
  filter(t, 'lowshelf', 130, 0.7, -8);
  return normal(finish(t, 0.1, 0.6)).x;
}

/**
 * Loot taken up: the crate scraping aboard and set down, the sea running off
 * it.
 */
export function took(rate: number, seed: number): Samples {
  const t = take(1, rate, seed);
  const scrape = layer(t, 0.15);
  noise(scrape, ar(0.01, 0.04));
  filter(scrape, 'bandpass', 1800, 1.2);
  mix(t, scrape, 0, 0.5);
  modes(
    t,
    [
      [240, 0.16, 0.8],
      [410, 0.11, 0.6],
      [690, 0.07, 0.4],
      [1130, 0.04, 0.2],
    ],
    0.06,
    0.05
  );
  const run = layer(t);
  noise(run, (s) => (s < 0.09 ? 0 : ar(0.03, 0.16)(s - 0.09)));
  filter(run, 'lowpass', 1500);
  mix(t, run, 0, 0.5);
  bubbles(t, 7, 0.22, 0.45, 900, 1600, 0.08);
  return normal(finish(t)).x;
}

/**
 * Her ward made good: a shimmer rising, and the ward's own ring as it holds.
 */
export function mendWard(rate: number, seed: number): Samples {
  const t = take(1.7, rate, seed);
  const rise = layer(t);
  noise(rise, swell(0.6, 1.25, 0.35));
  filter(rise, 'bandpass', (s) => 700 * 2 ** (1.9 * s), 4);
  mix(t, rise, 0, 2.2);
  modes(
    t,
    [
      [587, 0.8, 0.3],
      [1403, 0.6, 0.25],
      [2234, 0.45, 0.2],
      [3399, 0.35, 0.15],
    ],
    0.95,
    0.02
  );
  return normal(finish(t, 0.02, 0.3)).x;
}

/**
 * Her hull made good: her timbers drawn tight, two knocks of them seating home.
 */
export function mendHull(rate: number, seed: number): Samples {
  const t = take(1.2, rate, seed);
  timber(t, (s) => 30 + 110 * s, swell(0.1, 0.55, 0.15), 0, 0.55, 340, 1);
  for (const at of [0.56, 0.78])
    modes(
      t,
      [
        [205, 0.16, 0.8],
        [395, 0.11, 0.55],
        [660, 0.07, 0.35],
      ],
      at,
      0.04
    );
  const knock = layer(t, 0.05);
  noise(knock, fall(0.002));
  filter(knock, 'bandpass', 2600, 1);
  mix(t, knock, 0.56, 0.5);
  crackle(t, 4, 0.8, 0.2, 0.15);
  return normal(finish(t)).x;
}
