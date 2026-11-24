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
  saturate,
  slips,
  swell,
  take,
  tone,
  type Samples,
  type Take,
} from '../dsp.ts';

const hull = (t: Take, weight: number, splinters: number) => {
  const tick = layer(t, 0.05);
  noise(tick, fall(0.003));
  filter(tick, 'highpass', 1500);
  mix(t, tick, 0, 1.2);
  modes(
    t,
    [
      [128, 0.3, 0.45],
      [211, 0.24, 0.75],
      [337, 0.18, 0.65],
      [523, 0.13, 0.5],
      [811, 0.09, 0.32],
      [1290, 0.06, 0.2],
    ],
    0.002,
    0.05
  );
  const crack = layer(t, 0.3);
  noise(crack, ar(0.001, 0.035));
  filter(crack, 'bandpass', 1900, 0.6);
  mix(t, crack, 0, 1.3);
  const chips = layer(t);
  crackle(chips, splinters, 0.01, 0.4, 0.7, 0.003);
  filter(chips, 'highpass', 1300);
  mix(t, chips, 0, 0.7);
  tone(
    t,
    (s) => 95 * (0.55 + 0.45 * Math.exp(-s / 0.05)),
    (s) => 0.4 * ar(0.002, 0.08)(s),
    0,
    0.4
  );
  const body = layer(t, 0.5);
  noise(body, ar(0.002, 0.09));
  filter(body, 'bandpass', 300, 1);
  mix(t, body, 0, 1.6 * weight);
};

export function strike(rate: number, seed: number): Samples {
  const t = take(1.1, rate, seed);
  hull(t, 1, 110);
  filter(t, 'lowshelf', 120, 0.7, -5);
  saturate(t, 1.7);
  return normal(finish(t)).x;
}

export function hurt(rate: number, seed: number): Samples {
  const t = take(1.6, rate, seed);
  hull(t, 2.2, 70);
  filter(t, 'lowpass', 3800);
  tone(
    t,
    (s) => 78 * (0.6 + 0.4 * Math.exp(-s / 0.07)),
    (s) => 0.5 * ar(0.003, 0.12)(s),
    0,
    0.5
  );
  timber(t, (s) => 55 - 30 * s, swell(0.08, 0.75, 0.4), 0.14, 0.75, 290, 0.5);
  filter(t, 'lowshelf', 120, 0.7, -6);
  saturate(t, 2);
  return normal(finish(t)).x;
}

const WARD: readonly (readonly [number, number, number])[] = [
  [587, 1.1, 0.5],
  [1403, 0.8, 0.42],
  [2234, 0.62, 0.36],
  [3399, 0.45, 0.26],
  [4807, 0.3, 0.18],
  [6210, 0.2, 0.1],
];

export function ring(rate: number, seed: number): Samples {
  const t = take(1.4, rate, seed);
  modes(t, WARD, 0, 0.03);
  modes(
    t,
    WARD.map(([f, t60, a]) => [f * 1.006, t60 * 0.9, a * 0.7] as const),
    0,
    0.03
  );
  const hit = layer(t, 0.05);
  noise(hit, fall(0.004));
  filter(hit, 'highpass', 2000);
  mix(t, hit, 0, 0.8);
  const rush = layer(t, 0.5);
  noise(rush, ar(0.01, 0.12));
  filter(rush, 'bandpass', 1200, 0.8);
  mix(t, rush, 0, 0.6);
  tone(t, (s) => 160 - 120 * s, ar(0.002, 0.06), 0, 0.3);
  return normal(finish(t)).x;
}

export function shatter(rate: number, seed: number): Samples {
  const t = take(1.5, rate, seed);
  modes(
    t,
    WARD.map(([f, t60, a]) => [f, t60 * 0.25, a] as const),
    0,
    0.05
  );
  for (let k = 0; k < 70; k++) {
    const when = 0.005 + 0.45 * t.r() ** 1.8,
      f = 2400 + 6000 * t.r();
    modes(
      t,
      [[f, 0.03 + 0.1 * t.r(), 0.15 + 0.25 * t.r() * (1 - when)]],
      when,
      0.02
    );
  }
  const whump = layer(t, 0.5);
  noise(whump, ar(0.003, 0.09));
  filter(whump, 'lowpass', 420);
  mix(t, whump, 0, 1.5);
  tone(
    t,
    (s) => 140 * (0.5 + 0.5 * Math.exp(-s / 0.06)),
    ar(0.002, 0.09),
    0,
    0.4
  );
  filter(t, 'highpass', 50);
  return normal(finish(t)).x;
}

export function sink(rate: number, seed: number): Samples {
  const t = take(4.8, rate, seed);
  timber(t, (s) => 34 - 4 * s, swell(0.4, 3.4, 1), 0, 3.4, 230, 0.9);
  timber(
    t,
    (s) => 22 + 6 * Math.sin(s * 2.3),
    swell(0.8, 3.0, 1.2),
    0.6,
    2.4,
    150,
    0.6
  );
  const rush = layer(t);
  noise(rush, swell(1.2, 4.7, 1.8));
  filter(
    rush,
    'lowpass',
    (s) => 500 + 2200 * Math.sin(Math.min(1, s / 3.6) * Math.PI) ** 2,
    0.8
  );
  mix(t, rush, 0, 0.5);
  const deep = layer(t);
  brown(deep, swell(1, 4.6, 2));
  filter(deep, 'lowpass', 320);
  mix(t, deep, 0, 1.2);
  const chips = layer(t);
  crackle(chips, 30, 0.2, 1.4, 0.5, 0.004);
  filter(chips, 'highpass', 1200);
  mix(t, chips, 0, 0.5);
  bubbles(t, 40, 1.6, 2.8, 140, 480, 0.18);
  filter(t, 'lowshelf', 130, 0.7, -8);
  return normal(finish(t, 0.05, 0.6)).x;
}

export function timber(
  t: Take,
  rate: (s: number) => number,
  env: (s: number) => number,
  at: number,
  seconds: number,
  low: number,
  gain: number
) {
  const a = layer(t),
    b = layer(t);
  slips(a, rate, env, at, seconds);
  b.x.set(a.x);
  filter(a, 'bandpass', low, 4);
  filter(b, 'bandpass', low * 2.1, 5);
  mix(t, a, 0, gain * 6);
  mix(t, b, 0, gain * 4);
}

export function whistle(rate: number, seed: number): Samples {
  const t = take(0.75, rate, seed);
  const by = 0.3,
    near = 5 + 4 * t.r(),
    speed = 136,
    mid = 1300 + 300 * t.r();
  const env = (s: number) =>
    near / Math.sqrt(near * near + (speed * (s - by)) ** 2);
  const pitch = (s: number) => mid * (1 + 0.22 * Math.tanh((by - s) / 0.05));
  const tear = layer(t);
  noise(tear, env);
  filter(tear, 'bandpass', pitch, 5);
  filter(tear, 'bandpass', pitch, 2.5);
  mix(t, tear, 0, 2.5);
  const air = layer(t);
  noise(air, env);
  filter(air, 'highpass', 2200);
  mix(t, air, 0, 0.45);
  return normal(finish(t, 0.02, 0.05)).x;
}

export function splash(rate: number, seed: number): Samples {
  const t = take(1.4, rate, seed);
  const plop = layer(t, 0.3);
  noise(plop, ar(0.002, 0.045));
  filter(plop, 'lowpass', 520);
  mix(t, plop, 0, 1.4);
  tone(t, (s) => 190 - 300 * s, ar(0.002, 0.04), 0, 0.2);
  const spray = layer(t);
  noise(spray, ar(0.015, 0.22));
  filter(spray, 'bandpass', 2600, 0.7);
  mix(t, spray, 0, 0.7);
  const back = layer(t);
  noise(back, (s) => (s < 0.12 ? 0 : ar(0.12, 0.3)(s - 0.12)));
  filter(back, 'lowpass', 1300);
  mix(t, back, 0, 0.8);
  bubbles(t, 26, 0.06, 0.7, 380, 1100, 0.12);
  filter(t, 'highpass', 70);
  return normal(finish(t)).x;
}

export function thud(rate: number, seed: number): Samples {
  const t = take(0.9, rate, seed);
  const blow = layer(t, 0.3);
  noise(blow, ar(0.002, 0.06));
  filter(blow, 'lowpass', 650);
  mix(t, blow, 0, 1.4);
  tone(
    t,
    (s) => 125 * (0.55 + 0.45 * Math.exp(-s / 0.05)),
    (s) => 0.15 * ar(0.002, 0.07)(s),
    0,
    0.3
  );
  filter(t, 'peak', 320, 1, 6);
  filter(t, 'lowshelf', 130, 0.7, -6);
  const earth = layer(t);
  crackle(earth, 60, 0.02, 0.55, 0.7, 0.005);
  filter(earth, 'bandpass', 2100, 0.7);
  mix(t, earth, 0, 0.6);
  return normal(finish(t)).x;
}
