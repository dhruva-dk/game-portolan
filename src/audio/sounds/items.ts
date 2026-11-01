// Moves and items: the gust, the ship's own timbers and canvas, currents and tides; pickups (the variant is the
// rarity, and each step adds shimmer), coins, and the four consumables, each with a use loop and a finish.
import { type Buf, type Rng } from '../dsp.ts';
import { def, LOOP, RARITY } from '../def.ts';
import {
  ad, between, bowl, brown, bubbles, burst, canvasFlap, creak, filter, glass, hump, knock, metal, mix, n, normalize, normAll,
  pair, pink, scatter, shape, shards, splashOf, SR, stickSlip, stereoLoop, sweep, swells, thump, tone, white, whoosh,
} from '../kit.ts';
import { TAU } from '../dsp.ts';

// ---------------------------------------------------------------- the ship and the gust

function gust(r: Rng): Buf {
  const s = 1.5, x = new Float32Array(n(s));
  mix(x, whoosh(r, 1.3, 280, 1500, 1.3, 0.9), 0, 1);
  mix(x, canvasFlap(r), 0.06, 0.5);
  mix(x, thump(0.5, between(r, 70, 85), 42, 0.15), 0.07, 0.7);
  mix(x, shape(filter(white(n(0.8), r), 'hp', 2800), (t) => ad(t, 0.03, 0.18)), 0.05, 0.35); // spray off the bow
  return normalize(x, 0.75);
}

/** Coming back down onto the water after the gust's hop. */
function gustLand(r: Rng): Buf {
  const x = new Float32Array(n(1.2));
  mix(x, shape(filter(brown(n(0.6), r), 'lp', 700), (t) => ad(t, 0.004, 0.12)), 0, 1);
  mix(x, splashOf(r, 0.25, 1.1), 0, 0.6);
  return normalize(x, 0.7);
}

/** The gust has recharged. */
function gustReady(r: Rng): Buf {
  const x = new Float32Array(n(0.6));
  mix(x, whoosh(r, 0.4, 800, 2600, 1.5, 1.5), 0, 0.6);
  mix(x, knock(r, between(r, 1400, 1600), 0.02, 0.12), 0.3, 0.5);
  return normalize(x, 0.45);
}

function slap(r: Rng): Buf {
  const x = new Float32Array(n(0.8));
  mix(x, shape(filter(brown(n(0.5), r), 'lp', 700), (t) => ad(t, 0.004, 0.11)), 0, 1);
  mix(x, burst(r, 0.4, 'bp', 1800, 0.7, 0.01, 0.08), 0, 0.25);
  bubbles(x, r, 0.05, 0.6, 10, 0.15);
  return normalize(x, 0.6);
}

function sailFill(r: Rng): Buf {
  const x = new Float32Array(n(0.9));
  mix(x, thump(0.6, between(r, 65, 80), 44, 0.18), 0, 1);
  mix(x, shape(filter(white(n(0.6), r), 'lp', 420), (t) => ad(t, 0.012, 0.14)), 0, 0.8);
  mix(x, burst(r, 0.3, 'bp', 2600, 0.8, 0.004, 0.07), 0, 0.3);
  mix(x, canvasFlap(r), 0.14, 0.35);
  return normalize(x, 0.7);
}

function sailLuff(r: Rng): Buf {
  const s = 1.6, x = new Float32Array(n(s));
  for (let t = 0; t < s - 0.15; t += between(r, 0.065, 0.14)) mix(x, canvasFlap(r), t, hump(t / s, 0.7) * between(r, 0.4, 1));
  return normalize(x, 0.65);
}

/** Riding into a fast current. */
function currentRush(r: Rng): Buf {
  const s = 2.6, N = n(s), w = brown(N, r), p = pink(N, r);
  for (let i = 0; i < N; i++) w[i] = w[i] * 0.7 + p[i] * 0.5;
  sweep(w, 'bp', (t) => 380 + 900 * hump(t), 0.8);
  shape(w, (t) => hump(t / s, 0.9) * (0.75 + 0.25 * Math.sin(TAU * 2.2 * t)));
  bubbles(w, r, 0.3, 2.3, 18, 0.08);
  return normalize(w, 0.75);
}

/** The tide turning: a long slow wash, water draining over bars with a gurgle. */
function tideTurn(r: Rng): Buf[] {
  const s = 4.5, out = pair(s);
  out.forEach((o) => {
    mix(o, shape(filter(pink(o.length, r), 'lp', 900), (t) => hump(t / s, 1.2)), 0, 0.8);
    mix(o, shape(filter(brown(o.length, r), 'lp', 250), (t) => hump(t / s, 1)), 0, 0.8);
    bubbles(o, r, 0.6, s - 0.6, 14, 0.1, 300, 1100);
  });
  return normAll(out, 0.6);
}

// ---------------------------------------------------------------- pickups and coins

/** Picking up an item; the variant is its rarity, and each step adds shimmer and depth. */
function pickup(r: Rng, v: number): Buf[] {
  const s = 0.8 + v * 0.45, out = pair(s), f = 1500 * (1 + 0.14 * v);
  const lift = splashOf(r, 0.02, 0.5), clunk = knock(r, between(r, 420, 520), 0.05, 0.3);
  out.forEach((o, c) => {
    mix(o, lift, 0, 0.35); mix(o, clunk, 0.04, 0.8);
    if (v >= 1) mix(o, glass(r, f * (1 + c * 0.003), 0.18 + 0.06 * v, 0.9), 0.06, 0.45);
    if (v >= 2) { mix(o, glass(r, f * 1.33, 0.2 + 0.05 * v, 0.9), 0.1 + c * 0.01, 0.3); shards(o, r, 0.1, 0.4 + 0.2 * v, 8 * v, 0.2, 4000, 9000); }
    if (v >= 3) mix(o, shape(sweep(pink(n(0.7), r), 'bp', (u) => 1200 + 5000 * u, 2.5), (t) => hump(t / 0.7, 1.4)), 0.02, 0.35);
    if (v >= 3) mix(o, metal(r, f * 0.5, 0.35, 1.6), 0.08, 0.15);
    if (v >= 4) { mix(o, thump(1, 90, 45, 0.3), 0.06, 0.5); mix(o, bowl(r, 380, 1.2, 2.2), 0.08, 0.25); shards(o, r, 0.2, s - 0.1, 30, 0.2, 5000, 10000); }
  });
  return normAll(out, 0.55 + 0.06 * v);
}

function coin(r: Rng): Buf {
  const x = new Float32Array(n(0.8)), f = between(r, 2500, 3700);
  mix(x, metal(r, f, between(r, 0.12, 0.22), 0.8), 0, 1);
  mix(x, metal(r, f * between(r, 1.01, 1.04), 0.08, 0.4), between(r, 0.05, 0.11), 0.45);
  mix(x, burst(r, 0.01, 'hp', 5000, 0.7, 0.0001, 0.0008), 0, 0.3);
  return normalize(x, 0.6);
}

/** Coins paid out for a delivery: a falling spill. */
function coinSpend(r: Rng): Buf {
  const x = new Float32Array(n(1.4));
  let t = 0;
  for (let k = 0; k < 12; k++) {
    mix(x, metal(r, between(r, 2400, 3600) * (1 - k * 0.02), 0.1, 0.5), t, 0.5 + 0.5 * (1 - k / 12));
    t += Math.max(0.03, 0.09 * Math.pow(0.88, k));
  }
  mix(x, whoosh(r, 0.5, 1500, 600, 1.2), 0.15, 0.25);
  return normalize(x, 0.55);
}

/** A sunk ship's hold bursting: items and coins spilling onto the water. */
function lootSpill(r: Rng): Buf {
  const x = new Float32Array(n(1.8));
  mix(x, splashOf(r, 0.3, 1.6), 0, 0.7);
  for (let k = 0; k < 6; k++) mix(x, knock(r, between(r, 300, 700), 0.05, 0.3), between(r, 0.1, 0.9), between(r, 0.3, 0.6));
  for (let k = 0; k < 5; k++) mix(x, metal(r, between(r, 2500, 3500), 0.1, 0.4), between(r, 0.15, 1.1), between(r, 0.1, 0.25));
  return normalize(x, 0.7);
}

// ---------------------------------------------------------------- consumables: a loop while in use, then a finish

/** A glassy charging hum. The engine raises its rate over the use time so it climbs as it charges. */
function shieldUse(r: Rng, base: number, L: number, sparkle: number): Buf[] {
  return stereoLoop(L, 0.3, (c, N) => {
    const x = new Float32Array(N), sw = swells(r, L, 2, 0.6, 1);
    [1, 1.5, 2.31, 3.4].forEach((k, j) => {
      const f = base * k * (1 + c * 0.003), beat = (j + 1) * (1 / L);
      mix(x, tone(N, () => f, (t) => (0.3 / (1 + j)) * (0.7 + 0.3 * Math.sin(TAU * beat * t)) * sw(t)));
      mix(x, tone(N, () => f * 1.004, (t) => (0.15 / (1 + j)) * sw(t)));
    });
    mix(x, shape(filter(white(N, r), 'bp', base * 8, 1.5), (t) => 0.05 * sw(t)));
    scatter(r, 0, N / SR, sparkle, (at) => mix(x, glass(r, between(r, 3500, 8000), 0.06, 0.25), at, 0.12));
    return x;
  }, 0.5);
}

function shieldDone(r: Rng, base: number, big: boolean): Buf[] {
  const s = big ? 2.4 : 1.6, out = pair(s);
  out.forEach((o, c) => {
    mix(o, glass(r, base * 3 * (1 + c * 0.004), big ? 0.9 : 0.6, s), 0, 0.6);
    mix(o, glass(r, base * 4.6, big ? 0.6 : 0.4, s * 0.8), 0.01, 0.35);
    mix(o, shape(sweep(pink(n(0.5), r), 'bp', (u) => 1500 + 6000 * u, 2), (t) => hump(t / 0.5, 1.5)), 0, 0.3);
    mix(o, thump(0.6, big ? 150 : 220, big ? 70 : 110, 0.12), 0, big ? 0.6 : 0.4);
    shards(o, r, 0.02, s * 0.7, big ? 40 : 22, 0.18, 4000, 9500);
  });
  return normAll(out, big ? 0.75 : 0.65);
}

/** Timbers knitting: knocks in a working rhythm, a rope drawn tight, a little spirit sparkle. */
function repairUse(r: Rng, L: number, knocks: number, heavy: boolean): Buf[] {
  return stereoLoop(L, 0.25, (c, N) => {
    const x = new Float32Array(N), step = L / knocks;
    for (let k = 0; k < knocks; k++) {
      const at = k * step + between(r, -0.02, 0.02) + c * 0.006;
      mix(x, knock(r, between(r, heavy ? 260 : 420, heavy ? 360 : 620), heavy ? 0.06 : 0.04, 0.3), Math.max(0, at), between(r, 0.5, 0.9));
      if (heavy) mix(x, thump(0.25, 110, 60, 0.05), Math.max(0, at), 0.4);
    }
    mix(x, stickSlip(r, L * 0.6, 22, 40, (heavy ? [140, 300, 520, 800] : [380, 780, 1200]), 0.05), L * 0.2, heavy ? 0.35 : 0.2);
    scatter(r, 0, N / SR, 5, (at) => mix(x, glass(r, between(r, 2500, 5500), 0.07, 0.25), at, 0.08));
    return x;
  }, 0.5);
}

function repairDone(r: Rng, big: boolean): Buf[] {
  const s = big ? 2 : 1.3, out = pair(s);
  out.forEach((o, c) => {
    mix(o, knock(r, between(r, 180, 230), 0.1, 0.6), c * 0.01, 1);
    mix(o, thump(0.6, big ? 90 : 120, 50, big ? 0.2 : 0.12), 0, 0.8);
    if (big) for (let k = 0; k < 3; k++) mix(o, knock(r, between(r, 300, 600), 0.05, 0.3), 0.1 + k * 0.09 + c * 0.01, 0.5);
    mix(o, creak(r, 1.3), 0.12, 0.2);
    mix(o, shape(sweep(pink(n(0.6), r), 'bp', (u) => 900 + 4000 * u, 2), (t) => hump(t / 0.6, 1.5)), 0.05, 0.25);
    shards(o, r, 0.1, s * 0.7, big ? 25 : 12, 0.15, 3000, 8000);
    if (big) mix(o, bowl(r, 260, 0.8, 1.6), 0.02, 0.15);
  });
  return normAll(out, big ? 0.75 : 0.65);
}

/** A use cut short: the charge fizzles out. */
function useCancel(r: Rng): Buf {
  const x = new Float32Array(n(0.7));
  mix(x, tone(n(0.5), (t) => 1400 * Math.pow(0.3, t / 0.5), (t) => ad(t, 0.003, 0.15)), 0, 0.4);
  mix(x, shape(sweep(white(n(0.5), r), 'bp', (u) => 3000 - 2500 * u, 2), (t) => ad(t, 0.003, 0.12)), 0, 0.5);
  mix(x, knock(r, 300, 0.04, 0.2), 0.02, 0.4);
  return normalize(x, 0.5);
}

export const ITEM_SOUNDS = {
  gust: def(gust, 2, 'fx', 7, 0.75, 3, { range: 200 }),
  gustLand: def(gustLand, 2, 'fx', 5, 0.7, 3, { range: 150 }),
  gustReady: def(gustReady, 1, 'ui', 6, 0.45, 1),
  creak: def((r) => creak(r), 4, 'fx', 3, 0.45, 3, { range: 60 }),
  slap: def(slap, 4, 'fx', 2, 0.4, 3, { range: 60 }),
  sailFill: def(sailFill, 3, 'fx', 3, 0.55, 2, { range: 80 }),
  sailLuff: def(sailLuff, 2, 'fx', 3, 0.5, 2, { range: 80 }),
  currentRush: def(currentRush, 2, 'fx', 5, 0.7, 2, { range: 120 }),
  tideTurn: def(tideTurn, 1, 'amb', 5, 0.6, 1),
  pickup: def(pickup, 5, 'fx', 8, 0.8, 3, { ...RARITY, range: 80, jitter: 0 }),
  coin: def(coin, 6, 'fx', 5, 0.5, 8, { range: 80 }),
  coinSpend: def(coinSpend, 2, 'ui', 7, 0.55, 2),
  lootSpill: def(lootSpill, 2, 'fx', 6, 0.7, 3, { range: 300 }),
  useSmallShield: def((r) => shieldUse(r, 520, 2, 6), 1, 'fx', 7, 0.55, 3, { ...LOOP, range: 120, climb: 1.25 }),
  smallShieldDone: def((r) => shieldDone(r, 520, false), 2, 'fx', 7, 0.65, 2, { range: 160 }),
  useBigShield: def((r) => shieldUse(r, 330, 3, 12), 1, 'fx', 7, 0.6, 3, { ...LOOP, range: 140, climb: 1.3 }),
  bigShieldDone: def((r) => shieldDone(r, 330, true), 2, 'fx', 8, 0.75, 2, { range: 200 }),
  useRepairKit: def((r) => repairUse(r, 1.6, 4, false), 1, 'fx', 7, 0.55, 3, { ...LOOP, range: 120, climb: 1.12 }),
  repairKitDone: def((r) => repairDone(r, false), 2, 'fx', 7, 0.65, 2, { range: 160 }),
  useFullRepair: def((r) => repairUse(r, 2.4, 6, true), 1, 'fx', 7, 0.6, 3, { ...LOOP, range: 140, climb: 1.12 }),
  fullRepairDone: def((r) => repairDone(r, true), 2, 'fx', 8, 0.75, 2, { range: 200 }),
  useCancel: def(useCancel, 1, 'fx', 6, 0.5, 2, { range: 100 }),
};

/** The use loop and finish for each consumable. */
export const CONSUMABLE = {
  smallShield: { use: 'useSmallShield', done: 'smallShieldDone' },
  bigShield: { use: 'useBigShield', done: 'bigShieldDone' },
  repairKit: { use: 'useRepairKit', done: 'repairKitDone' },
  fullRepair: { use: 'useFullRepair', done: 'fullRepairDone' },
} as const;
