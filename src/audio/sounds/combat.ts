// The shield and the hull. Shield hits ring like struck glass; the crack builds as the shield weakens (the level is
// how weak it is); the break is a big shatter with a boom under it; the refill shimmers back into place. Hull hits
// splinter, sinking groans and gurgles, and the Storm, rams, reefs, fire and ash all hurt in their own voices.
import { softclip, type Buf, type Rng } from '../dsp.ts';
import { def, LEVEL, LOOP } from '../def.ts';
import {
  ad, between, brown, bubbles, burst, crackles, creak, crunch, filter, glass, hump, knock, mix, modes, n, normalize, normAll,
  pair, pink, scatter, shape, shards, splinters, SR, stickSlip, stereoLoop, sweep, thump, tone, white, whoosh,
} from '../kit.ts';
import { fade, loopify, TAU } from '../dsp.ts';

/** A round meeting the shield: a glassy ring with an energy thud under it. */
function shieldHit(r: Rng): Buf {
  const x = new Float32Array(n(1.6)), f = between(r, 1300, 2100);
  mix(x, glass(r, f, between(r, 0.35, 0.5), 1.6), 0, 0.8);
  mix(x, glass(r, f * between(r, 1.45, 1.6), 0.25, 1), 0.003, 0.35);
  mix(x, thump(0.4, 260, 120, 0.07), 0, 0.5);
  mix(x, shape(sweep(white(n(0.3), r), 'bp', (u) => 3500 - 2500 * u, 2), (t) => ad(t, 0.002, 0.05)), 0, 0.35);
  shards(x, r, 0.01, 0.2, 18, 0.15, 5000, 9000);
  return normalize(x, 0.8);
}

/** The shield cracking under a hit; variant 0 is a hairline, 3 is about to go. */
function shieldCrack(r: Rng, v: number): Buf {
  const k = v / 3, s = 0.7 + k * 0.9, x = new Float32Array(n(s));
  // fracture: a dense run of sharp clicks, longer and lower as the shield weakens
  const run = 0.06 + k * 0.35;
  scatter(r, 0, run, 260 - k * 80, (at) => {
    const a = between(r, 0.3, 1) * (1 - (at / run) * 0.6);
    mix(x, burst(r, 0.006, 'hp', between(r, 2500 - k * 1200, 7000), 0.9, 0.0001, between(r, 0.0006, 0.002)), at, a);
  });
  mix(x, glass(r, between(r, 2400, 2800) - k * 900, 0.18 + k * 0.3, 1.4), 0.002, 0.5 + k * 0.2);
  if (v >= 1) mix(x, stickSlip(r, 0.25 + k * 0.4, 120, 260, [1800, 2900, 4100].map((f) => f * (1 - k * 0.3)), 0.012), 0.01, 0.35 + k * 0.3); // strain
  if (v >= 2) mix(x, thump(0.5, 200, 90, 0.08 + k * 0.05), 0, 0.5 * k);
  if (v >= 3) shards(x, r, 0.05, 0.5, 30, 0.25);
  return normalize(x, 0.6 + k * 0.25);
}

/** The shield gives way: a crack, a deep boom, a burst of shards and a long glassy ring. */
function shieldBreak(r: Rng): Buf[] {
  const out = pair(3.2);
  const crack = burst(r, 0.03, 'hp', 2500, 0.7, 0.0001, 0.004);
  const boom = thump(1.6, between(r, 95, 110), 30, 0.5), sub = thump(1.6, 55, 24, 0.6);
  const release = shape(sweep(pink(n(1.2), r), 'bp', (u) => 4200 * Math.pow(0.06, u) + 150, 1.3), (t) => ad(t, 0.003, 0.3));
  const ringA = glass(r, between(r, 950, 1100), 1.1, 3), ringB = glass(r, between(r, 1500, 1700), 0.8, 2.4);
  out.forEach((o, c) => {
    mix(o, crack, c * 0.0008, 1);
    mix(o, boom, 0, 1); mix(o, sub, 0, 0.7);
    mix(o, release, c * 0.004, 0.7);
    // the burst of shards: dense at first, thinning, and different in each ear
    shards(o, r, 0.0, 0.35, 220, 0.5, 2200, 8000);
    shards(o, r, 0.3, 2.2, 40, 0.3, 3000, 9000);
    mix(o, c ? ringB : ringA, 0.004, 0.35);
  });
  normAll(out, 1);
  out.forEach((o) => softclip(o, 1.5));
  return normAll(out, 0.97);
}

/** The shield refilling: rising glassy partials and sparkle, settling into a soft bloom. */
function shieldRefill(r: Rng): Buf[] {
  const s = 1.6, out = pair(s + 1);
  const base = between(r, 420, 500), ratios = [1, 1.51, 2.27, 3.08, 4.13];
  out.forEach((o, c) => {
    ratios.forEach((k, j) => {
      const f0 = base * k * (1 + c * 0.004);
      mix(o, tone(n(s + 0.9), (t) => f0 * (1 + 0.9 * Math.min(1, t / s) ** 1.5), (t) => (t < s ? Math.pow(t / s, 1.3) : Math.exp(-(t - s) / 0.25)) * 0.12 / (1 + j * 0.3)), j * 0.02);
    });
    mix(o, shape(sweep(pink(n(s), r), 'bp', (u) => 800 + 5000 * u * u, 2), (t) => Math.pow(t / s, 2)), 0, 0.35);
    shards(o, r, 0.3, s + 0.6, 30, 0.18, 4000, 9500);
    mix(o, glass(r, base * 4.1, 0.5, 1), s - 0.02, 0.35);
  });
  return normAll(out, 0.7);
}

/** A round through your own planks: a crack, splintering and the hold booming, with the timbers complaining after. */
function hullHit(r: Rng): Buf {
  const x = new Float32Array(n(1.6));
  mix(x, burst(r, 0.03, 'hp', 2200, 0.7, 0.0003, 0.004), 0, 0.9);
  crunch(x, r, 0, 0.16, 9 + Math.floor(r() * 6), 0.75);
  splinters(x, r, 0.03, 0.8, 55, 0.55);
  mix(x, thump(0.5, 95, 50, 0.14), 0, 0.85);
  mix(x, creak(r), 0.25, 0.3);
  return normalize(x, 0.95);
}

/** A ship going down: the hull groans, water rushes in, it gurgles and is swallowed. */
function sinking(r: Rng): Buf[] {
  const s = 5.5, out = pair(s);
  const k = between(r, 0.85, 1.15), gr = between(r, 3, 6);
  const groan1 = stickSlip(r, 3.2, 6, 20, [68, 124, 203, 331, 512].map((f) => f * k), 0.3);
  const groan2 = stickSlip(r, 2.2, 14, 9, [88, 160, 262, 410].map((f) => f * k), 0.25);
  const crack = new Float32Array(n(1));
  crunch(crack, r, 0, 0.25, 12, 0.7);
  out.forEach((o, c) => {
    mix(o, crack, 0.05 + c * 0.01, 0.6);
    mix(o, groan1, c * 0.02, 1); mix(o, groan2, 1.9 + c * 0.03, 0.8);
    mix(o, shape(filter(brown(o.length, r), 'lp', 400), (t) => ad(t - 1, 0.8, 2.5) * (0.5 + 0.5 * Math.sin(TAU * gr * t))), 0, 0.5);
    bubbles(o, r, 1.2, 5, 26, 0.12, 200, 1200);
    // big gurgles: low bubbles bursting at the surface
    scatter(r, 2, 5, 3, (at) => mix(o, tone(n(0.25), (t) => between(r, 90, 160) * (1 + t * 3), (t) => ad(t, 0.005, 0.06)), at, 0.4));
    mix(o, shape(sweep(pink(o.length, r), 'lp', (t) => 300 + 1500 * t, 0.7), (t) => ad(t - 3.4, 0.5, 0.9)), 0, 0.5);
  });
  return normAll(out.map((o) => fade(o, 0, 0.3)), 0.9);
}

/** The Storm tearing at the hull: a lash of wind and a strained timber. */
function stormDamage(r: Rng): Buf {
  const x = new Float32Array(n(1.1));
  mix(x, whoosh(r, 0.7, 250, 900, 1.2, 0.6), 0, 0.7);
  mix(x, creak(r, between(r, 0.6, 0.8)), 0.05, 0.6);
  mix(x, thump(0.5, 80, 40, 0.12), 0.05, 0.6);
  crackles(x, r, 0.05, 0.6, 30, 0.25);
  return normalize(x, 0.75);
}

function ram(r: Rng): Buf {
  const x = new Float32Array(n(2.2));
  mix(x, thump(1.2, 70, 30, 0.45), 0, 1.2);
  mix(x, stickSlip(r, 1.6, 10, 34, [92, 170, 284, 446, 690], 0.14), 0.05, 0.9);
  crunch(x, r, 0, 0.35, 16, 0.6);
  splinters(x, r, 0.05, 1.2, 40, 0.45);
  mix(x, shape(filter(pink(n(1.6), r), 'lp', 650), (t) => ad(t, 0.12, 0.5)), 0.1, 0.6);
  return normalize(x, 0.95);
}

/** Running aground: the keel grinding over rock and sand. */
function aground(r: Rng): Buf {
  const N = n(1.6), ex = white(N, r);
  let w = 0.5;
  for (let i = 0; i < N; i++) {
    if ((i & 63) === 0) w = Math.min(1, Math.max(0.1, w + (r() - 0.5) * 0.35));
    ex[i] *= w * hump(i / N, 0.5) * 0.2;
  }
  const x = normalize(modes(ex, [310, 720, 1150, 1730, 2600, 3400].map((f, j) => ({ f: f * between(r, 0.9, 1.1), d: 0.025 / (1 + j * 0.3), g: 1 / (1 + j * 0.4) })), N), 0.7);
  filter(x, 'lp', 4000);
  mix(x, thump(0.7, 62, 34, 0.22), 0, 0.8);
  mix(x, burst(r, 0.03, 'hp', 2000, 0.7, 0.0003, 0.004), 0, 0.4);
  return normalize(x, 0.85);
}

/** Fire Shot catching: a whoomp of flame. */
function ignite(r: Rng): Buf {
  const w = pink(n(1.4), r);
  sweep(w, 'lp', (t) => 250 + 3300 * Math.min(1, t * 3) * Math.exp(-t * 1.5), 0.9);
  shape(w, (t) => ad(t, 0.22, 0.45));
  crackles(w, r, 0.1, 1.3, 40, 0.35);
  return normalize(w, 0.8);
}

/** A ship burning, as a loop. */
function burning(r: Rng): Buf {
  const L = 3, xf = 0.3, roar = filter(pink(n(L + xf), r), 'lp', 450);
  shape(roar, (t) => 0.25 * (0.75 + 0.25 * Math.sin((TAU * t * 2) / L)));
  crackles(roar, r, 0, L + xf, 35, 0.8);
  return normalize(loopify(roar, xf), 0.6);
}

/** Ash embers searing the deck: a hiss and a few pops. */
function emberBurn(r: Rng): Buf {
  const x = new Float32Array(n(0.9));
  mix(x, shape(filter(white(n(0.8), r), 'hp', 3000), (t) => ad(t, 0.02, 0.25)), 0, 0.5);
  crackles(x, r, 0, 0.7, 25, 0.6);
  return normalize(x, 0.5);
}

/** Your own ship repairing slowly in your own water: soft timbers knitting, as a loop. */
function mending(r: Rng): Buf[] {
  return stereoLoop(4, 0.4, (c, N) => {
    const x = new Float32Array(N);
    scatter(r, 0, N / SR - 0.3, 2.5, (at) => mix(x, knock(r, between(r, 500, 800), 0.03, 0.2), at, between(r, 0.2, 0.5)));
    scatter(r, 0, N / SR - 1, 0.6, (at) => mix(x, creak(r, between(r, 1.1, 1.4)), at, 0.15));
    scatter(r, 0, N / SR - 0.3, 3 + c, (at) => mix(x, glass(r, between(r, 3000, 6000), 0.08, 0.3), at, 0.05));
    return x;
  }, 0.4);
}

export const COMBAT_SOUNDS = {
  shieldHit: def(shieldHit, 4, 'fx', 8, 0.85, 6, { range: 380 }),
  shieldCrack: def(shieldCrack, 4, 'fx', 8, 0.8, 3, { ...LEVEL, range: 300 }),
  shieldBreak: def(shieldBreak, 2, 'fx', 10, 1, 2, { range: 500, jitter: 0.02 }),
  shieldRefill: def(shieldRefill, 2, 'fx', 7, 0.7, 2, { range: 120 }),
  hullHit: def(hullHit, 4, 'fx', 8, 0.95, 6, { range: 380 }),
  sinking: def(sinking, 2, 'fx', 9, 0.95, 3, { range: 600 }),
  stormDamage: def(stormDamage, 3, 'fx', 7, 0.75, 2, { range: 80 }),
  ram: def(ram, 2, 'fx', 8, 1, 2, { range: 400 }),
  aground: def(aground, 2, 'fx', 7, 0.85, 2, { range: 200 }),
  ignite: def(ignite, 2, 'fx', 6, 0.7, 3, { range: 260 }),
  burning: def(burning, 1, 'fx', 5, 0.5, 4, { ...LOOP, range: 200 }),
  emberBurn: def(emberBurn, 3, 'fx', 5, 0.5, 2, { range: 60 }),
  mending: def(mending, 1, 'fx', 3, 0.35, 1, { ...LOOP, range: 60 }),
};

