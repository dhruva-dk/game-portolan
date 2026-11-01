// The life over each region's bed: one-shots the ambience mixer places around the listener now and then, so the beds
// never repeat. Ice creaking and booming, drips, wood groaning in the fog, stones trickling down a gorge, sea caves,
// terns, songbirds, sand gusts, reef breakers, jungle birds, steam vents, falls, frogs and the vortex.
import { type Buf, type Rng } from '../dsp.ts';
import { def } from '../def.ts';
import {
  ad, between, brown, bubbles, burst, chirp, creak, drop, filter, grit, hump, knock, mix, n, normalize, normAll, pair, pink, scatter,
  shape, SR, stickSlip, sweep, thump, tone, white,
} from '../kit.ts';
import { TAU } from '../dsp.ts';
import { kelpBrushOf } from './world.ts';

/** A cicada: a buzzing tone pulsed fast, swelling and fading. Used in the Spice Isles' bed. */
export function cicada(r: Rng, N: number, f: number): Buf {
  const x = new Float32Array(N), am = between(r, 70, 110), slow = r() * TAU, span = N / SR;
  let p = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    p += (TAU * f * (1 + 0.01 * Math.sin(TAU * 0.3 * t))) / SR;
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(TAU * am * t), 4), swell = 0.5 + 0.5 * Math.sin((TAU * 2 * t) / span + slow);
    x[i] = Math.sin(p) * pulse * swell * swell;
  }
  return filter(x, 'hp', 2500);
}

/** A tree frog's peep: a quick rising chirp, twice. */
export function frogPeep(r: Rng, f: number): Buf {
  const x = new Float32Array(n(0.3)), k = between(r, 0.9, 1.1);
  for (let j = 0; j < 2; j++) mix(x, chirp(0.05, (u) => f * k * (0.85 + 0.25 * u), (u) => hump(u, 0.8), 0.3), j * 0.11);
  return x;
}

/** A songbird phrase. Five kinds: a trill, a falling run, a two-note call, a warble and a sweet whistle. */
export function songPhrase(r: Rng, kind: number): Buf {
  const x = new Float32Array(n(1.4)), base = between(r, 2600, 3600);
  let t = 0;
  if (kind === 0) for (let k = 0; k < 10; k++, t += 0.045) mix(x, chirp(0.035, (u) => base * (1 + 0.3 * u)), t, 0.7);
  else if (kind === 1) for (let k = 0; k < 6; k++, t += 0.11) mix(x, chirp(0.08, (u) => base * (1.4 - k * 0.07) * (1 - 0.2 * u)), t, 0.8);
  else if (kind === 2) for (let k = 0; k < 2; k++, t += 0.32) mix(x, chirp(0.18, (u) => base * (k ? 0.8 : 1.05) * (1 + 0.05 * hump(u))), t, 0.8);
  else if (kind === 3) mix(x, chirp(0.9, (u) => base * (1 + 0.25 * Math.sin(TAU * 7 * u) + 0.1 * u)), 0, 0.7);
  else mix(x, chirp(0.6, (u) => base * 0.8 * (1 + 0.5 * u * u), (u) => hump(u, 0.5)), 0, 0.8);
  return x;
}

function iceCreak(r: Rng): Buf {
  return normalize(stickSlip(r, between(r, 0.8, 1.6), between(r, 25, 50), between(r, 60, 120), [650, 1250, 2000, 2900].map((f) => f * between(r, 0.8, 1.2)), 0.03), 0.6);
}

function floeKnock(r: Rng): Buf {
  const x = new Float32Array(n(0.8));
  mix(x, knock(r, between(r, 400, 800), 0.05, 0.4), 0, 1);
  mix(x, knock(r, between(r, 500, 900), 0.04, 0.3), between(r, 0.12, 0.3), 0.6);
  mix(x, shape(filter(brown(n(0.4), r), 'lp', 500), (t) => ad(t, 0.005, 0.08)), 0, 0.5);
  return normalize(x, 0.6);
}

function dripLife(r: Rng): Buf {
  const x = new Float32Array(n(0.5));
  mix(x, drop(r), 0, 1);
  if (r() < 0.5) mix(x, drop(r), between(r, 0.12, 0.3), 0.5);
  return normalize(x, 0.5);
}

/** A giant trunk groaning somewhere in the fog. */
function woodCreakFar(r: Rng): Buf {
  const x = stickSlip(r, between(r, 1.5, 2.5), 8, 18, [110, 220, 360, 540].map((f) => f * between(r, 0.8, 1.2)), 0.2);
  return normalize(filter(x, 'lp', 900), 0.6);
}

/** Stones trickling down scree, each one answered by the walls. */
function stoneTrickle(r: Rng): Buf {
  const x = new Float32Array(n(2.6));
  grit(x, r, 0, 1, 18, 0.7);
  mix(x, x.slice(), 0.33, 0.35);
  mix(x, filter(x.slice(), 'lp', 1500), 0.7, 0.25);
  return normalize(x, 0.6);
}

/** The sea booming in a cave. */
function caveBoom(r: Rng): Buf {
  const x = new Float32Array(n(2.5));
  mix(x, thump(2, between(r, 50, 62), 26, 0.6), 0, 1);
  mix(x, filter(filter(burst(r, 1.5, 'lp', 500, 0.7, 0.02, 0.3), 'peak', 105, 5, 10), 'peak', 170, 4, 6), 0, 0.8);
  mix(x, shape(filter(white(n(1.6), r), 'hp', 2500), (t) => ad(t - 0.15, 0.2, 0.5)), 0, 0.2); // spray blown out
  return normalize(x, 0.8);
}

/** A tern: sharp high calls. */
function tern(r: Rng): Buf {
  const x = new Float32Array(n(0.8)), f = between(r, 2800, 3400), k = 2 + Math.floor(r() * 3);
  for (let j = 0; j < k; j++) mix(x, chirp(0.09, (u) => f * (1 + 0.2 * hump(u)), (u) => hump(u, 0.6), 0.5), j * 0.15);
  return normalize(filter(x, 'hp', 1500), 0.45);
}

function songbird(r: Rng, v: number): Buf {
  return normalize(songPhrase(r, v % 5), 0.45);
}

/** A gust lifting petals or sand: a soft swirl of air with a fine rustle. */
function gustSwirl(r: Rng, bright: number): Buf {
  const s = between(r, 1.8, 2.6), x = pink(n(s), r);
  sweep(x, 'bp', (u) => 600 + 1800 * hump(u, 0.8), 1);
  shape(x, (t) => hump(t / s, 1.2));
  mix(x, shape(filter(white(n(s), r), 'hp', 4000 + bright * 2000), (t) => 0.4 * hump(t / s, 1.5)));
  return normalize(x, 0.45);
}

function reefBreaker(r: Rng): Buf[] {
  const out = pair(4);
  out.forEach((o, c) => {
    mix(o, shape(sweep(pink(o.length, r), 'lp', (t) => 300 + 3000 * Math.exp(-t * 3), 0.7), (t) => ad(t, 0.3, 1.2)), c * 0.03, 1);
    mix(o, shape(filter(brown(o.length, r), 'lp', 200), (t) => ad(t, 0.25, 1)), 0, 0.8);
    mix(o, shape(filter(white(o.length, r), 'hp', 2500), (t) => 0.3 * ad(t - 0.3, 0.4, 1.5)), 0, 1);
  });
  return normAll(out, 0.7);
}

function palmRustle(r: Rng): Buf {
  const s = between(r, 1, 1.8), fr = filter(white(n(s), r), 'bp', between(r, 2500, 4000), 0.8);
  shape(fr, (t) => hump(t / s, 1) * (0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(TAU * between(r, 12, 20) * t), 2)));
  return normalize(fr, 0.4);
}

/** Jungle birds. Five kinds: a whooping call, a croak, a squawk, a liquid trill and a hoot. */
function jungleBird(r: Rng, v: number): Buf {
  const x = new Float32Array(n(1.6)), k = v % 5;
  if (k === 0) for (let j = 0; j < 4; j++) mix(x, chirp(0.18, (u) => (900 + j * 180) * (1 + 0.6 * u), (u) => hump(u, 0.6), 0.3), j * 0.22, 0.8);
  else if (k === 1) for (let j = 0; j < 5; j++) mix(x, filter(shape(white(n(0.07), r), (t) => hump(t / 0.07)), 'bp', 900, 4), j * 0.09, 1);
  else if (k === 2) mix(x, filter(chirp(0.35, (u) => 1500 * (1 + 0.3 * hump(u)), (u) => hump(u, 0.4), 0.9), 'bp', 2500, 1), 0, 1);
  else if (k === 3) mix(x, chirp(1, (u) => 2200 * (1 + 0.15 * Math.sin(TAU * 18 * u) - 0.3 * u)), 0, 0.7);
  else for (let j = 0; j < 3; j++) mix(x, chirp(0.3, (u) => 420 * (1 + 0.1 * hump(u)), (u) => hump(u, 0.8), 0.5), j * 0.45, 0.8);
  return normalize(x, 0.45);
}

/** A steam vent bursting. */
function steamVent(r: Rng): Buf {
  const s = between(r, 1.5, 2.5), x = filter(filter(white(n(s), r), 'hp', 2200), 'lp', 9000);
  shape(x, (t) => ad(t, 0.05, s * 0.4));
  mix(x, shape(filter(brown(n(s), r), 'lp', 200), (t) => ad(t, 0.05, 0.4)), 0, 0.4);
  return normalize(x, 0.55);
}

function rockCrack(r: Rng): Buf {
  const x = new Float32Array(n(1));
  mix(x, burst(r, 0.02, 'hp', 2000, 0.7, 0.0002, 0.003), 0, 0.8);
  mix(x, knock(r, between(r, 700, 1400), 0.02, 0.15), 0, 0.8);
  grit(x, r, 0.03, 0.6, 15, 0.3);
  return normalize(x, 0.55);
}

function lavaBloop(r: Rng): Buf {
  const x = new Float32Array(n(0.8));
  mix(x, tone(n(0.4), (t) => between(r, 60, 100) * (1 + t * 4), (t) => ad(t, 0.01, 0.1)), 0, 1);
  mix(x, shape(filter(white(n(0.6), r), 'hp', 3000), (t) => ad(t - 0.08, 0.02, 0.2)), 0, 0.2);
  return normalize(x, 0.5);
}

/** A thin fall striking a pool close by. */
function fallSplash(r: Rng): Buf {
  const s = between(r, 2, 3), x = new Float32Array(n(s));
  scatter(r, 0, s - 0.1, 400, (at) => mix(x, burst(r, 0.008, 'bp', between(r, 1200, 5000), 1.2, 0.0003, 0.002), at, r() * hump(at / s, 0.5)));
  mix(x, shape(filter(pink(n(s), r), 'bp', 1200, 0.8), (t) => 0.3 * hump(t / s, 0.5)));
  return normalize(x, 0.55);
}

/** A frog's croak. Four kinds, low and high. */
function frogCroak(r: Rng, v: number): Buf {
  const x = new Float32Array(n(1)), f = [180, 260, 340, 520][v % 4] * between(r, 0.9, 1.1), k = 1 + Math.floor(r() * 3);
  for (let j = 0; j < k; j++) {
    const s = between(r, 0.12, 0.2), pulses = new Float32Array(n(s));
    for (let i = 0; i < pulses.length; i += Math.floor(SR / between(r, 35, 60))) pulses[i] = 1;
    const body = filter(filter(pulses, 'bp', f, 3), 'bp', f * 2.4, 2);
    mix(x, shape(body, (t) => hump(t / s, 0.5)), j * 0.25);
  }
  return normalize(x, 0.5);
}

function rootCreak(r: Rng): Buf {
  return normalize(filter(creak(r, between(r, 0.45, 0.65)), 'lp', 1800), 0.5);
}

/** Something small dropping into still water. */
function plop(r: Rng): Buf {
  const x = new Float32Array(n(0.8));
  mix(x, tone(n(0.2), (t) => between(r, 300, 500) * (1 + t * 8), (t) => ad(t, 0.002, 0.04)), 0, 1);
  bubbles(x, r, 0.05, 0.5, 8, 0.2, 600, 1500);
  return normalize(x, 0.5);
}

/** A crest breaking over itself in the vortex. */
function vortexCrash(r: Rng): Buf[] {
  const out = pair(4);
  out.forEach((o, c) => {
    mix(o, shape(sweep(pink(o.length, r), 'lp', (t) => 250 + 2500 * Math.exp(-t * 2), 0.7), (t) => ad(t, 0.4, 1.4)), c * 0.05, 1);
    mix(o, thump(1.5, 60, 28, 0.5), 0.35, 0.6);
  });
  return normAll(out, 0.75);
}

function kelpBrush(r: Rng): Buf {
  return normalize(kelpBrushOf(r), 0.4);
}

export const LIFE_SOUNDS = {
  iceCreak: def(iceCreak, 3, 'amb', 2, 0.5, 2),
  floeKnock: def(floeKnock, 3, 'amb', 2, 0.5, 3),
  drip: def(dripLife, 4, 'amb', 1, 0.45, 3),
  woodCreakFar: def(woodCreakFar, 3, 'amb', 2, 0.5, 1),
  stoneTrickle: def(stoneTrickle, 2, 'amb', 2, 0.5, 1),
  caveBoom: def(caveBoom, 3, 'amb', 3, 0.75, 2),
  tern: def(tern, 3, 'amb', 2, 0.45, 2),
  songbird: def(songbird, 5, 'amb', 2, 0.45, 2),
  petalGust: def((r) => gustSwirl(r, 1), 2, 'amb', 2, 0.45, 1),
  sandGust: def((r) => gustSwirl(r, 0.4), 2, 'amb', 2, 0.45, 1),
  reefBreaker: def(reefBreaker, 2, 'amb', 3, 0.65, 2),
  palmRustle: def(palmRustle, 3, 'amb', 2, 0.4, 2),
  jungleBird: def(jungleBird, 5, 'amb', 2, 0.45, 2),
  steamVent: def(steamVent, 3, 'amb', 3, 0.55, 2),
  rockCrack: def(rockCrack, 3, 'amb', 2, 0.5, 2),
  lavaBloop: def(lavaBloop, 3, 'amb', 2, 0.5, 2),
  fallSplash: def(fallSplash, 3, 'amb', 2, 0.5, 2),
  frogCroak: def(frogCroak, 4, 'amb', 2, 0.5, 3),
  rootCreak: def(rootCreak, 3, 'amb', 2, 0.5, 1),
  plop: def(plop, 3, 'amb', 1, 0.45, 2),
  vortexCrash: def(vortexCrash, 2, 'amb', 3, 0.7, 2),
  kelpBrush: def(kelpBrush, 3, 'amb', 2, 0.4, 2),
};
