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

export function tap(rate: number, seed: number): Samples {
  const t = take(0.09, rate, seed);
  noise(t, fall(0.004));
  filter(t, 'bandpass', 3000 + 600 * t.r(), 1.2);
  modes(
    t,
    [
      [1800, 0.03, 0.15],
      [3100, 0.02, 0.1],
    ],
    0,
    0.05
  );
  return normal(finish(t, 0.0005, 0.02)).x;
}

const parchment = (t: Take, at: number, seconds: number, grains: number) => {
  const p = layer(t);
  crackle(p, grains, at, seconds, 0.8, 0.002);
  filter(p, 'bandpass', 2600, 0.7);
  mix(t, p, 0, 1);
  const rustle = layer(t);
  noise(rustle, (s) =>
    s < at ? 0 : swell(seconds * 0.2, seconds, seconds * 0.6)(s - at)
  );
  filter(rustle, 'bandpass', 3500, 0.6);
  mix(t, rustle, 0, 0.35);
};

export function open(rate: number, seed: number): Samples {
  const t = take(0.55, rate, seed);
  parchment(t, 0, 0.32, 55);
  modes(
    t,
    [
      [160, 0.1, 0.4],
      [300, 0.07, 0.25],
    ],
    0.3,
    0.05
  );
  return normal(finish(t)).x;
}

export function close(rate: number, seed: number): Samples {
  const t = take(0.4, rate, seed);
  parchment(t, 0, 0.14, 25);
  modes(
    t,
    [
      [190, 0.1, 0.6],
      [340, 0.07, 0.4],
    ],
    0.13,
    0.05
  );
  const puff = layer(t, 0.2);
  noise(puff, ar(0.002, 0.03));
  filter(puff, 'lowpass', 800);
  mix(t, puff, 0.13, 0.6);
  return normal(finish(t)).x;
}

export function launch(rate: number, seed: number): Samples {
  const t = take(2.6, rate, seed);
  const crack = layer(t, 0.1);
  noise(crack, fall(0.008));
  filter(crack, 'highpass', 300);
  mix(t, crack, 0.02, 1.4);
  modes(
    t,
    [
      [150, 0.14, 0.8],
      [228, 0.11, 0.6],
      [380, 0.07, 0.35],
    ],
    0.02,
    0.05
  );
  tone(
    t,
    (s) => 120 * (0.6 + 0.4 * Math.exp(-s / 0.05)),
    ar(0.002, 0.07),
    0.02,
    0.3
  );
  const wash = layer(t);
  noise(wash, swell(0.5, 2.55, 1.6));
  filter(
    wash,
    'lowpass',
    (s) => 400 + 1800 * Math.exp(-(((s - 0.8) / 0.6) ** 2)),
    0.7
  );
  mix(t, wash, 0, 0.9);
  timber(
    t,
    (s) => 40 + 50 * Math.sin(s * 3),
    swell(0.2, 0.9, 0.3),
    0.35,
    0.9,
    330,
    0.5
  );
  filter(t, 'highpass', 50);
  return normal(finish(t, 0.002, 0.4)).x;
}

export function lost(rate: number, seed: number): Samples {
  const t = take(3.4, rate, seed);
  const under = layer(t);
  brown(under, swell(0.3, 3.35, 2.4));
  filter(under, 'lowpass', (s) => 900 * Math.exp(-s / 1.1) + 180);
  filter(under, 'peak', 200, 1, 4);
  mix(t, under, 0, 1.6);
  timber(t, (s) => 24 - 4 * s, swell(0.4, 2.4, 1.2), 0.2, 2.4, 170, 0.6);
  bubbles(t, 24, 0.3, 2.4, 120, 420, 0.12);
  filter(t, 'lowshelf', 130, 0.7, -7);
  return normal(finish(t, 0.03, 0.8)).x;
}

export function salute(rate: number, seed: number): Samples {
  const t = take(6, rate, seed);
  const sea = layer(t);
  noise(sea, swell(1.6, 5.9, 3));
  filter(
    sea,
    'lowpass',
    (s) => 350 + 1700 * Math.exp(-(((s - 2.1) / 1.3) ** 2)),
    0.7
  );
  mix(t, sea, 0, 0.7);
  const low = layer(t);
  brown(low, swell(1.6, 5.9, 3));
  filter(low, 'lowpass', 260);
  mix(t, low, 0, 1.1);
  [0.8, 1.45, 2.05, 2.8, 3.5].forEach((at, i) => {
    const gun = layer(t, 2.6);
    noise(gun, ar(0.003, 0.07));
    filter(gun, 'lowpass', 750 - 60 * i);
    filter(gun, 'peak', 220, 1.2, 6);
    brown(gun, fall(0.55, 0.01));
    filter(gun, 'lowpass', 900);
    mix(t, gun, at, 1.4 - 0.12 * i);
  });
  filter(t, 'lowshelf', 130, 0.7, -8);
  return normal(finish(t, 0.05, 1)).x;
}

const knocked = (
  t: Take,
  at: number,
  low: number,
  ring: number,
  click: number
) => {
  modes(
    t,
    [
      [low, ring, 0.7],
      [low * 2.45, ring * 0.7, 0.3],
    ],
    at,
    0.04
  );
  const tick = layer(t, 0.03);
  noise(tick, fall(0.004));
  filter(tick, 'lowpass', click);
  mix(t, tick, at, 0.5);
};

const thump = (t: Take, at: number, low: number, tau: number, gain: number) => {
  const p = layer(t, tau * 8);
  noise(p, ar(0.001, tau));
  filter(p, 'lowpass', low);
  mix(t, p, at, gain);
};

const grit = (
  t: Take,
  grains: number,
  seconds: number,
  gain: number,
  band: number
) => {
  const g = layer(t);
  crackle(g, grains, 0.004, seconds, gain, 0.002);
  filter(g, 'bandpass', band, 0.8);
  mix(t, g, 0, 1);
};

const swish = (
  t: Take,
  at: number,
  seconds: number,
  from: number,
  to: number,
  q: number
) => {
  const w = layer(t, seconds);
  noise(w, swell(seconds * 0.3, seconds, seconds * 0.6));
  filter(w, 'bandpass', (s) => from + (to - from) * (s / seconds), q);
  mix(t, w, at, 1);
};

const struck = (
  t: Take,
  at: number,
  list: readonly (readonly [number, number, number])[]
) => {
  modes(t, list, at, 0.004);
  const strike = layer(t, 0.01);
  noise(strike, fall(0.0015));
  filter(strike, 'highpass', 2500);
  mix(t, strike, at, 0.3);
};

export function stamp(rate: number, seed: number): Samples {
  const t = take(0.18, rate, seed);
  thump(t, 0, 900, 0.012, 1.2);
  knocked(t, 0, 175 + 20 * t.r(), 0.05, 1400);
  grit(t, 6, 0.03, 0.25, 2400);
  filter(t, 'highpass', 70);
  return normal(finish(t, 0.0006, 0.04)).x;
}

export function debt(rate: number, seed: number): Samples {
  const t = take(0.26, rate, seed);
  thump(t, 0, 650, 0.018, 1.4);
  knocked(t, 0, 128, 0.08, 1000);
  grit(t, 10, 0.05, 0.3, 2000);
  filter(t, 'highpass', 70);
  return normal(finish(t, 0.0006, 0.06)).x;
}

export function slam(rate: number, seed: number): Samples {
  const t = take(0.8, rate, seed);
  thump(t, 0, 320, 0.05, 1.6);
  modes(
    t,
    [
      [68, 0.32, 0.9],
      [118, 0.22, 0.5],
      [255, 0.12, 0.3],
    ],
    0,
    0.03
  );
  parchment(t, 0.002, 0.16, 40);
  const rattle = layer(t);
  crackle(rattle, 24, 0.04, 0.25, 0.35, 0.003);
  filter(rattle, 'bandpass', 1400, 0.8);
  mix(t, rattle, 0, 0.6);
  filter(t, 'highpass', 45);
  return normal(finish(t, 0.0008, 0.25)).x;
}

export function row(rate: number, seed: number): Samples {
  const t = take(0.14, rate, seed);
  const pen = layer(t);
  noise(pen, swell(0.015, 0.13, 0.08));
  filter(pen, 'highpass', 2200);
  filter(pen, 'bandpass', 3800 + 500 * t.r(), 1.4);
  mix(t, pen, 0, 0.8);
  crackle(t, 8, 0.01, 0.1, 0.25, 0.0015);
  return normal(finish(t, 0.003, 0.04)).x;
}

export function coin(rate: number, seed: number): Samples {
  const t = take(0.12, rate, seed);
  const k = 1 + 0.05 * (t.r() - 0.5);
  struck(t, 0, [
    [2650 * k, 0.07, 0.5],
    [4180 * k, 0.05, 0.35],
    [6040 * k, 0.03, 0.2],
  ]);
  return normal(finish(t, 0.0005, 0.03)).x;
}

export function standing(rate: number, seed: number): Samples {
  const t = take(0.36, rate, seed);
  struck(t, 0, [
    [1175, 0.3, 0.45],
    [2930, 0.17, 0.2],
    [4120, 0.09, 0.1],
  ]);
  struck(t, 0.07, [
    [1568, 0.26, 0.35],
    [3910, 0.14, 0.15],
  ]);
  return normal(finish(t, 0.0008, 0.08)).x;
}

export function landed(rate: number, seed: number): Samples {
  const t = take(0.26, rate, seed);
  const slap = layer(t, 0.08);
  noise(slap, ar(0.001, 0.018));
  filter(slap, 'bandpass', 1100, 0.6);
  mix(t, slap, 0, 1);
  modes(t, [[105, 0.07, 0.35]], 0, 0.03);
  parchment(t, 0.004, 0.08, 14);
  return normal(finish(t, 0.0006, 0.06)).x;
}

export function tossed(rate: number, seed: number): Samples {
  const t = take(0.3, rate, seed);
  swish(t, 0, 0.28, 1500, 3600, 0.9);
  crackle(t, 12, 0.03, 0.2, 0.2, 0.002);
  return normal(finish(t, 0.01, 0.06)).x;
}

export function seal(rate: number, seed: number): Samples {
  const t = take(0.24, rate, seed);
  knocked(t, 0, 215, 0.06, 900);
  const squish = layer(t, 0.12);
  noise(squish, ar(0.004, 0.03));
  filter(squish, 'lowpass', 1100);
  mix(t, squish, 0.006, 0.6);
  filter(t, 'highpass', 70);
  return normal(finish(t, 0.0008, 0.05)).x;
}

export function built(rate: number, seed: number): Samples {
  const t = take(0.36, rate, seed);
  knocked(t, 0, 300, 0.05, 2200);
  knocked(t, 0.14, 285, 0.06, 2000);
  filter(t, 'highpass', 70);
  return normal(finish(t, 0.0006, 0.06)).x;
}

export function painted(rate: number, seed: number): Samples {
  const t = take(0.34, rate, seed);
  swish(t, 0, 0.32, 2600, 1800, 1.1);
  crackle(t, 20, 0.02, 0.26, 0.12, 0.0012);
  return normal(finish(t, 0.01, 0.06)).x;
}

export function knock(rate: number, seed: number): Samples {
  const t = take(0.15, rate, seed);
  knocked(t, 0, 150 + 15 * t.r(), 0.05, 1100);
  filter(t, 'highpass', 70);
  return normal(finish(t, 0.0006, 0.04)).x;
}

export function unroll(rate: number, seed: number): Samples {
  const t = take(0.3, rate, seed);
  parchment(t, 0, 0.22, 30);
  return normal(finish(t, 0.004, 0.06)).x;
}

export function furl(rate: number, seed: number): Samples {
  const t = take(0.22, rate, seed);
  parchment(t, 0, 0.12, 18);
  thump(t, 0.12, 700, 0.02, 0.5);
  return normal(finish(t, 0.004, 0.05)).x;
}

export function laurel(rate: number, seed: number): Samples {
  const t = take(0.4, rate, seed);
  const leaves = layer(t);
  crackle(leaves, 40, 0, 0.26, 0.6, 0.003);
  filter(leaves, 'bandpass', 3300, 0.8);
  mix(t, leaves, 0, 0.7);
  struck(t, 0.02, [
    [1568, 0.36, 0.25],
    [2349, 0.3, 0.15],
    [3136, 0.2, 0.08],
  ]);
  return normal(finish(t, 0.002, 0.08)).x;
}

export function card(rate: number, seed: number): Samples {
  const t = take(0.15, rate, seed);
  const flick = layer(t, 0.04);
  noise(flick, ar(0.001, 0.007));
  filter(flick, 'highpass', 2000);
  mix(t, flick, 0, 0.6);
  const slap = layer(t, 0.08);
  noise(slap, ar(0.001, 0.015));
  filter(slap, 'bandpass', 1500, 0.7);
  mix(t, slap, 0.02, 1);
  return normal(finish(t, 0.0006, 0.04)).x;
}

export function frost(rate: number, seed: number): Samples {
  const t = take(0.4, rate, seed);
  for (let i = 0; i < 6; i++) {
    const f = 3200 + 3800 * t.r();
    struck(t, 0.15 * t.r() ** 1.5, [
      [f, 0.18, 0.2 + 0.15 * t.r()],
      [f * 1.51, 0.1, 0.08],
    ]);
  }
  return normal(finish(t, 0.002, 0.1)).x;
}
