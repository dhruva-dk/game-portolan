// The UI's sounds, in the world's manner, no tune anywhere: a tap a quill's tick on parchment; a folio unfolding and
// folded shut; PLAY her canvas filling and the sea taking her; her end, sunk, the sea closing over; her win, a great
// swell and a salute of guns far off.

import { ar, brown, bubbles, crackle, fall, filter, finish, layer, mix, modes, noise, normal, swell, take, tone, type Samples, type Take } from '../dsp';
import { timber } from './blows';

/** A tap: a quill's tick on parchment. */
export function tap(rate: number, seed: number): Samples {
  const t = take(0.09, rate, seed);
  noise(t, fall(0.004));
  filter(t, 'bandpass', 3000 + 600 * t.r(), 1.2);
  modes(t, [[1800, 0.03, 0.15], [3100, 0.02, 0.1]], 0, 0.05);
  return normal(finish(t, 0.0005, 0.02)).x;
}

/** Parchment handled: crinkle and rustle over `seconds`, from `at`. */
const parchment = (t: Take, at: number, seconds: number, grains: number) => {
  const p = layer(t);
  crackle(p, grains, at, seconds, 0.8, 0.002);
  filter(p, 'bandpass', 2600, 0.7);
  mix(t, p, 0, 1);
  const rustle = layer(t);
  noise(rustle, (s) => (s < at ? 0 : swell(seconds * 0.2, seconds, seconds * 0.6)(s - at)));
  filter(rustle, 'bandpass', 3500, 0.6);
  mix(t, rustle, 0, 0.35);
};

/** A folio opened: parchment unfolding, laid down. */
export function open(rate: number, seed: number): Samples {
  const t = take(0.55, rate, seed);
  parchment(t, 0, 0.32, 55);
  modes(t, [[160, 0.1, 0.4], [300, 0.07, 0.25]], 0.3, 0.05);
  return normal(finish(t)).x;
}

/** A folio closed: folded shut on a soft thump. */
export function close(rate: number, seed: number): Samples {
  const t = take(0.4, rate, seed);
  parchment(t, 0, 0.14, 25);
  modes(t, [[140, 0.12, 0.6], [262, 0.08, 0.35]], 0.13, 0.05);
  const puff = layer(t, 0.2);
  noise(puff, ar(0.002, 0.03));
  filter(puff, 'lowpass', 800);
  mix(t, puff, 0.13, 0.6);
  return normal(finish(t)).x;
}

/** PLAY: her canvas filling with a great crack, the sea taking her, her timbers answering. */
export function launch(rate: number, seed: number): Samples {
  const t = take(2.6, rate, seed);
  const crack = layer(t, 0.1);
  noise(crack, fall(0.008));
  filter(crack, 'highpass', 300);
  mix(t, crack, 0.02, 1.4);
  modes(t, [[150, 0.14, 0.8], [228, 0.11, 0.6], [380, 0.07, 0.35]], 0.02, 0.05);
  tone(t, (s) => 120 * (0.6 + 0.4 * Math.exp(-s / 0.05)), ar(0.002, 0.07), 0.02, 0.3);
  const wash = layer(t);
  noise(wash, swell(0.5, 2.55, 1.6));
  filter(wash, 'lowpass', (s) => 400 + 1800 * Math.exp(-(((s - 0.8) / 0.6) ** 2)), 0.7);
  mix(t, wash, 0, 0.9);
  timber(t, (s) => 40 + 50 * Math.sin(s * 3), swell(0.2, 0.9, 0.3), 0.35, 0.9, 330, 0.5);
  filter(t, 'highpass', 50);
  return normal(finish(t, 0.002, 0.4)).x;
}

/** Her end, sunk: the sea closing over, deep and muffled, the last of her going down. */
export function lost(rate: number, seed: number): Samples {
  const t = take(3.4, rate, seed);
  const under = layer(t);
  brown(under, swell(0.3, 3.35, 2.4));
  filter(under, 'lowpass', (s) => 900 * Math.exp(-s / 1.1) + 180);
  filter(under, 'peak', 200, 1, 4);
  mix(t, under, 0, 1.6);
  timber(t, (s) => 24 - 4 * s, swell(0.4, 2.4, 1.2), 0.2, 2.4, 170, 0.6);
  bubbles(t, 24, 0.3, 2.4, 120, 420, 0.12);
  filter(t, 'highpass', 45);
  return normal(finish(t, 0.03, 0.8)).x;
}

/** Her win: a great swell of the sea, and a salute of guns fired far off, one after another. */
export function salute(rate: number, seed: number): Samples {
  const t = take(6, rate, seed);
  const sea = layer(t);
  noise(sea, swell(1.6, 5.9, 3));
  filter(sea, 'lowpass', (s) => 350 + 1700 * Math.exp(-(((s - 2.1) / 1.3) ** 2)), 0.7);
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
  filter(t, 'highpass', 45);
  return normal(finish(t, 0.05, 1)).x;
}
