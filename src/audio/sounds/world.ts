// The world's one-shots: the gull and its deliveries, the whale, the Storm, the Gale, the weather's thunder and
// lightning, the region events, the abilities and the territory.
import { fm, softclip, type Buf, type Rng } from '../dsp.ts';
import { def } from '../def.ts';
import {
  ad, between, bowl, brown, bubbles, burst, crackles, creak, filter, glass, grit, gullNote, hump, knock, metal, mix, n,
  normalize, normAll, pair, pink, scatter, shape, shards, splashOf, splinters, stickSlip, sweep, thump, tone, white, whoosh, blast,
} from '../kit.ts';
import { modes, SR, TAU } from '../dsp.ts';

// ---------------------------------------------------------------- the gull

function gullCall(r: Rng): Buf {
  const x = new Float32Array(n(1.8)), count = 2 + Math.floor(r() * 3);
  let t = 0;
  for (let k = 0; k < count && t < 1.5; k++) {
    const first = k === 0, s = first ? between(r, 0.28, 0.38) : between(r, 0.14, 0.22), base = between(r, 1150, 1450);
    mix(x, gullNote(r, s, base * 0.9, base * 1.75, base * (first ? 0.85 : 1.05)), t, first ? 1 : 0.8);
    t += s + between(r, 0.04, 0.1);
  }
  return normalize(x, 0.6);
}

function gullKek(r: Rng): Buf {
  const x = new Float32Array(n(0.7)), count = 3 + Math.floor(r() * 3);
  for (let k = 0; k < count; k++) mix(x, gullNote(r, 0.06, 1700, 2100, 1800), k * 0.11, 0.8);
  return normalize(x, 0.5);
}

function gullWings(r: Rng): Buf {
  const x = new Float32Array(n(0.9)), gap = between(r, 0.1, 0.13);
  for (let k = 0; k < 5; k++) mix(x, burst(r, 0.12, 'bp', between(r, 250, 420), 0.8, 0.012, 0.04), k * gap, 1 - k * 0.12);
  return normalize(x, 0.5);
}

function gullDive(r: Rng): Buf {
  const x = new Float32Array(n(1.6));
  mix(x, shape(sweep(pink(n(1.1), r), 'bp', (t) => 500 + 2000 * hump(t, 1.3), 2), (t) => hump(t / 1.1)), 0, 1);
  mix(x, gullNote(r, 0.3, 1300, 2400, 1200), 0.85, 0.7);
  return normalize(x, 0.6);
}

/** The gull's parcel landing on deck: a solid thud, a box rattling, a few coins. */
function deliveryThud(r: Rng): Buf {
  const x = new Float32Array(n(1.2)), f = between(r, 105, 135);
  const box = modes(burst(r, 0.006, 'lp', 3000, 0.7, 0.0003, 0.002), [1, 2.08, 3.27, 4.61, 6.3].map((k, j) => ({ f: f * k, d: 0.12 / (1 + j * 0.6), g: 1 / (1 + j * 0.5) })), n(1));
  mix(x, normalize(box, 1), 0, 1);
  mix(x, thump(0.5, 92, 52, 0.12), 0, 0.9);
  mix(x, metal(r, between(r, 820, 980), 0.07, 0.4), 0.008, 0.25);
  for (let k = 0; k < 4; k++) mix(x, metal(r, between(r, 2500, 3600), 0.08, 0.3), between(r, 0.015, 0.22), 0.1);
  return normalize(x, 0.9);
}

// ---------------------------------------------------------------- the whale

/** The whale's blow: a huge pressurised exhale with spray. */
function whaleBreath(r: Rng): Buf[] {
  const s = 2.8, out = pair(s);
  out.forEach((o, c) => {
    const exhale = pink(n(2.2), r);
    sweep(exhale, 'bp', (u) => 700 - 450 * u, 0.9);
    mix(o, shape(exhale, (t) => ad(t, 0.04, 0.7)), c * 0.006, 1);
    mix(o, shape(filter(brown(n(2), r), 'lp', 180), (t) => ad(t, 0.03, 0.5)), 0, 0.8);
    mix(o, shape(filter(white(n(2.4), r), 'hp', 3500), (t) => ad(t - 0.05, 0.15, 0.8)), 0, 0.3); // the spray falling
    mix(o, shape(filter(pink(n(1), r), 'bp', 300, 1.5), (t) => ad(t, 0.15, 0.3)), 1.9, 0.35); // the inhale
  });
  return normAll(out, 0.75);
}

/** A long low moan carried through the water. */
function whaleSong(r: Rng): Buf {
  const s = 4.5, a = between(r, 130, 160), b = between(r, 340, 420), c = between(r, 200, 250);
  const f = (t: number): number => {
    const u = t / s;
    return u < 0.4 ? a + (b - a) * (0.5 - 0.5 * Math.cos((Math.PI * u) / 0.4)) : b + (c - b) * (0.5 - 0.5 * Math.cos((Math.PI * (u - 0.4)) / 0.6));
  };
  const x = filter(fm(n(s), f, 0.5, () => 0.9, (t) => hump(t / s, 0.8)), 'bp', 600, 0.8), out = x.slice();
  mix(out, x, 0.13, 0.35); mix(out, x, 0.29, 0.22); mix(out, x, 0.47, 0.14);
  return normalize(filter(out, 'lp', 1800), 0.5);
}

/** The giant whale breaching: water rushing up, a vast body clearing the sea, then the crash and the cascade. */
function whaleBreach(r: Rng): Buf[] {
  const s = 6.5, out = pair(s);
  out.forEach((o, c) => {
    const rise = pink(n(1.6), r);
    sweep(rise, 'bp', (u) => 200 + 1200 * u, 0.8);
    mix(o, shape(rise, (t) => Math.pow(t / 1.6, 2)), 0, 0.7);
    mix(o, shape(filter(white(n(3), r), 'hp', 2500), (t) => ad(t - 1.3, 0.3, 1.2)), 0, 0.3); // sheets of water off its back
    const crash = 2.4 + c * 0.012;
    mix(o, thump(2.5, 70, 22, 0.9), crash, 1.3);
    mix(o, blast(r, 2.5, 2600, 4, 0.6), crash, 1);
    mix(o, splashOf(r, 1, 3.6), crash, 1.1);
    scatter(r, crash + 0.4, s - 0.3, 40, (at) => mix(o, burst(r, 0.05, 'bp', between(r, 800, 4000), 1, 0.002, 0.02), at, between(r, 0.05, 0.25) * (1 - (at - crash) / (s - crash))));
  });
  normAll(out, 1);
  out.forEach((o) => softclip(o, 1.6));
  return normAll(out, 0.97);
}

/** The whale sounding: a fluke slap and the water closing over it. */
function whaleDive(r: Rng): Buf {
  const x = new Float32Array(n(2.6));
  mix(x, shape(filter(brown(n(0.6), r), 'lp', 600), (t) => ad(t, 0.004, 0.14)), 0, 1);
  mix(x, thump(0.8, 90, 40, 0.2), 0, 0.8);
  mix(x, splashOf(r, 0.6, 2), 0.02, 0.8);
  bubbles(x, r, 0.6, 2.4, 20, 0.1, 150, 700);
  return normalize(x, 0.8);
}

// ---------------------------------------------------------------- the Storm and the Gale

/** A Storm phase about to close: a vast rising swell of wind and sea with a deep rumble under it. */
function stormWarning(r: Rng): Buf[] {
  const s = 4, out = pair(s);
  out.forEach((o, c) => {
    const howl = white(o.length, r);
    sweep(howl, 'bp', (u) => 220 + 500 * u * u + 40 * Math.sin(TAU * 3 * u + c), 6);
    mix(o, shape(howl, (t) => Math.pow(hump(t / s, 1), 1.5)), 0, 0.6);
    mix(o, shape(filter(brown(o.length, r), 'lp', 120), (t) => hump(t / s, 1)), 0, 1);
    mix(o, shape(sweep(pink(o.length, r), 'lp', (u) => 200 + 1600 * u, 0.7), (t) => Math.pow(Math.min(1, t / (s * 0.75)), 2) * Math.exp(-Math.max(0, t - s * 0.75) / 0.3)), 0, 0.6);
    mix(o, thump(2, 48, 28, 1), s * 0.72, 0.9);
  });
  return normAll(out, 0.85);
}

/** The Storm wall starting to move in. */
function stormShrink(r: Rng): Buf[] {
  const s = 3.5, out = pair(s);
  out.forEach((o) => {
    mix(o, shape(filter(brown(o.length, r), 'lp', 200), (t) => ad(t, 0.6, 1.5)), 0, 1);
    mix(o, shape(sweep(pink(o.length, r), 'bp', (u) => 600 - 400 * u, 1), (t) => ad(t, 0.4, 1.4)), 0, 0.6);
  });
  return normAll(out, 0.7);
}

/** Diving out of the Gale: the air tearing past, faster and faster. */
function galeDive(r: Rng): Buf[] {
  const s = 3, out = pair(s);
  out.forEach((o, c) => {
    const w = pink(o.length, r);
    sweep(w, 'bp', (u) => 300 + 2400 * u * u + 60 * Math.sin(TAU * (9 + c) * u), 1.1);
    mix(o, shape(w, (t) => Math.pow(t / s, 1.5) * (t < s - 0.05 ? 1 : 0)), 0, 1);
    mix(o, shape(filter(brown(o.length, r), 'lp', 160), (t) => t / s), 0, 0.6);
    for (let t = 0.6; t < s - 0.3; t += between(r, 0.12, 0.3)) mix(o, canvasSnap(r), t + c * 0.02, 0.3 * (t / s));
  });
  return normAll(out, 0.8);
}

function canvasSnap(r: Rng): Buf {
  const x = burst(r, 0.12, 'bp', between(r, 500, 1100), 1.1, 0.002, 0.025);
  return mix(x, thump(0.1, 150, 90, 0.025), 0, 0.4);
}

/** Landing from the dive: a big splash-down and the sails catching. */
function galeLand(r: Rng): Buf[] {
  const out = pair(3);
  out.forEach((o, c) => {
    mix(o, thump(1.2, 75, 30, 0.35), 0, 1.1);
    mix(o, splashOf(r, 0.85, 2.8), c * 0.01, 1);
    mix(o, canvasSnap(r), 0.35 + c * 0.04, 0.4);
    mix(o, creak(r), 0.5, 0.3);
  });
  return normAll(out, 0.9);
}

// ---------------------------------------------------------------- weather

/** The warning glow before a lightning strike: static crackling and a rising electric buzz. */
function thunderWarn(r: Rng): Buf[] {
  const s = 1.8, out = pair(s);
  out.forEach((o, c) => {
    const N = o.length, buzz = new Float32Array(N);
    let p = 0;
    for (let i = 0; i < N; i++) { const t = i / SR; p += (TAU * (100 + 20 * t)) / SR; buzz[i] = Math.sign(Math.sin(p)) * 0.3 * Math.pow(t / s, 2); }
    mix(o, filter(buzz, 'bp', 1800, 1.5), 0, 0.5);
    scatter(r, 0, s - 0.05, 30, (at) => mix(o, burst(r, 0.01, 'hp', between(r, 2500, 7000), 0.8, 0.0001, 0.002), at, Math.pow(at / s, 1.5) * between(r, 0.3, 1)));
    mix(o, shape(filter(white(N, r), 'hp', 5000), (t) => 0.15 * Math.pow(t / s, 3)), c * 0.003, 1);
  });
  return normAll(out, 0.6);
}

/** A lightning strike close by: a tearing crack, then the boom. */
function lightning(r: Rng): Buf[] {
  const out = pair(3.5);
  out.forEach((o, c) => {
    scatter(r, 0, 0.12, 300, (at) => mix(o, burst(r, 0.01, 'hp', between(r, 1500, 6000), 0.7, 0.0001, 0.002), at, between(r, 0.4, 1)));
    mix(o, burst(r, 0.08, 'hp', 800, 0.7, 0.0002, 0.015), 0.1 + c * 0.0007, 1);
    mix(o, thump(2, 70, 24, 0.7), 0.1, 1.1);
    mix(o, blast(r, 3, 3000, 3, 0.7), 0.1, 1);
  });
  normAll(out, 1);
  out.forEach((o) => softclip(o, 2));
  return normAll(out, 0.97);
}

/** Thunder rolling in the distance. */
function thunder(r: Rng): Buf[] {
  const out = pair(5.5), crack = burst(r, 0.15, 'bp', 1400, 0.6, 0.001, 0.03);
  out.forEach((o, c) => {
    mix(o, crack, c * 0.004, 0.6);
    for (let k = 0; k < 7; k++) {
      const at = between(r, 0, 2.8), a = between(r, 0.03, 0.25), d = between(r, 0.4, 1.1);
      mix(o, shape(filter(brown(n(3), r), 'lp', between(r, 180, 420)), (t) => ad(t, a, d)), at, between(r, 0.4, 1));
    }
  });
  return normAll(out, 0.9);
}

/** Ice building on the rigging in the snow: a crinkling crust. */
function iceRigging(r: Rng): Buf {
  const x = new Float32Array(n(1.4));
  scatter(r, 0, 1.2, 60, (at) => mix(x, glass(r, between(r, 3000, 7000), 0.02, 0.08), at, between(r, 0.1, 0.5) * hump(at / 1.2, 0.5)));
  mix(x, stickSlip(r, 1, 60, 140, [1400, 2300, 3500], 0.01), 0.1, 0.3);
  return normalize(x, 0.5);
}

// ---------------------------------------------------------------- region events

/** A floe splitting: a deep boom with a crack running through the ice. Also heard as life in the Ice Crown. */
function iceBoom(r: Rng): Buf[] {
  const out = pair(3);
  out.forEach((o, c) => {
    mix(o, thump(2, between(r, 60, 75), 28, 0.6), 0, 1);
    mix(o, burst(r, 0.05, 'hp', 1500, 0.7, 0.0003, 0.008), c * 0.002, 0.5);
    mix(o, stickSlip(r, 0.8, 200, 60, [600, 1100, 1900, 2800], 0.02), 0.02 + c * 0.01, 0.4);
    // the crack ringing away along the ice: a falling 'pew'
    mix(o, tone(n(1), (t) => 1800 * Math.exp(-t * 3) + 200, (t) => ad(t, 0.005, 0.3)), 0.03, 0.15);
  });
  return normAll(out, 0.8);
}

/** Floes grinding as the rings turn. */
function floesGrind(r: Rng): Buf {
  const N = n(2.5), ex = white(N, r);
  let w = 0.5;
  for (let i = 0; i < N; i++) {
    if ((i & 127) === 0) w = Math.min(1, Math.max(0, w + (r() - 0.5) * 0.5));
    ex[i] *= w * w * hump(i / N, 0.5) * 0.2;
  }
  const x = normalize(modes(ex, [1180, 1870, 2690, 3910, 5200].map((f, j) => ({ f: f * between(r, 0.9, 1.1), d: 0.04 / (1 + j * 0.3), g: 1 / (1 + j * 0.3) })), N), 0.6);
  scatter(r, 0.1, 2.3, 4, (at) => { const a = r(); mix(x, burst(r, 0.05, 'bp', between(r, 2000, 5000), 2, 0.0005, 0.008), at, 0.6 * a); });
  mix(x, shape(filter(brown(N, r), 'lp', 150), (t) => hump(t / 2.5)), 0, 0.5);
  return normalize(x, 0.7);
}

/** Rock breaking away and crashing down: the Narrows' rockfall and the Spires' toppling needle. */
function rockfall(r: Rng): Buf[] {
  const s = 5, out = pair(s);
  out.forEach((o, c) => {
    mix(o, burst(r, 0.1, 'hp', 1000, 0.7, 0.0005, 0.02), 0, 0.6);
    mix(o, stickSlip(r, 0.8, 80, 30, [180, 340, 600], 0.05), 0, 0.5);
    for (let k = 0; k < 14; k++) {
      const at = 0.6 + k * between(r, 0.08, 0.2) + c * 0.01;
      mix(o, thump(0.6, between(r, 70, 140), 35, between(r, 0.08, 0.2)), at, between(r, 0.3, 0.8));
      mix(o, knock(r, between(r, 300, 900), 0.03, 0.2), at, between(r, 0.2, 0.5));
    }
    mix(o, shape(filter(brown(o.length, r), 'lp', 200), (t) => ad(t - 0.6, 0.4, 1.4)), 0, 1);
    grit(o, r, 1, s - 0.5, 30, 0.2);
    mix(o, splashOf(r, 0.9, 2.5), 2.2, 0.7);
  });
  return normAll(out, 0.9);
}

/** A surge of water: the Fjords' flood and Blossom Run's spring flood. */
function floodSurge(r: Rng): Buf[] {
  const s = 5, out = pair(s);
  out.forEach((o) => {
    const w = pink(o.length, r);
    sweep(w, 'lp', (u) => 400 + 2400 * hump(u, 0.7), 0.8);
    mix(o, shape(w, (t) => hump(t / s, 0.7)), 0, 1);
    mix(o, shape(filter(brown(o.length, r), 'lp', 160), (t) => hump(t / s, 0.8)), 0, 0.9);
    bubbles(o, r, 0.5, s - 0.5, 25, 0.06, 300, 1400);
  });
  return normAll(out, 0.8);
}

/** The tide drawing off the Jade Shoals: a long hiss of water running off the sand that falls away as it goes, with
 *  gurgles in the channels as they empty. */
function tideDraw(r: Rng): Buf[] {
  const s = 6, out = pair(s);
  out.forEach((o) => {
    const w = pink(o.length, r);
    sweep(w, 'lp', (u) => 2800 - 2300 * u, 0.7);
    mix(o, shape(w, (t) => hump(t / s, 0.4)), 0, 0.9);
    mix(o, shape(filter(brown(o.length, r), 'lp', 220), (t) => hump(t / s, 0.6)), 0, 0.6);
    bubbles(o, r, 1, s - 0.5, 40, 0.08, 200, 900);
  });
  return normAll(out, 0.75);
}

/** Mistwood's fog surge: a cold breath rolling out of the trees. */
function fogSurge(r: Rng): Buf[] {
  const s = 5, out = pair(s);
  out.forEach((o, c) => {
    mix(o, shape(sweep(pink(o.length, r), 'bp', (u) => 300 + 300 * hump(u), 0.7), (t) => hump(t / s, 1.2)), c * 0.05, 1);
    mix(o, shape(filter(brown(o.length, r), 'lp', 90), (t) => hump(t / s, 1)), 0, 0.6);
  });
  return normAll(out, 0.6);
}

/** Cinder Peak erupting. */
function eruption(r: Rng): Buf[] {
  const out = pair(5);
  out.forEach((o) => {
    mix(o, shape(filter(brown(o.length, r), 'lp', 95), (t) => ad(t, 0.35, 1.6)), 0, 1);
    mix(o, thump(2, 55, 24, 0.8), 0, 0.9);
    mix(o, shape(filter(white(o.length, r), 'hp', 2800), (t) => 0.18 * ad(t - 0.5, 0.6, 1.5)));
    scatter(r, 0.2, 3, 8, (at) => { const a = r(); mix(o, thump(0.3, between(r, 90, 160), 60, 0.05), at, 0.3 * a); });
    crackles(o, r, 0.3, 4, 20, 0.2);
  });
  return normAll(out, 0.95);
}

/** A lava bomb landing. */
function lavaBomb(r: Rng): Buf {
  const x = new Float32Array(n(2));
  mix(x, thump(1, 80, 30, 0.25), 0, 1);
  mix(x, blast(r, 1, 1500, 6, 0.2), 0, 0.8);
  mix(x, shape(filter(white(n(1.8), r), 'hp', 2500), (t) => ad(t - 0.05, 0.1, 0.6)), 0, 0.4); // the hiss of hot rock in water
  crackles(x, r, 0.05, 1.5, 25, 0.3);
  return normalize(x, 0.85);
}

/** The Weeping Isle's cloudburst: a downpour arriving in a rush. */
function cloudburst(r: Rng): Buf[] {
  const s = 4.5, out = pair(s);
  out.forEach((o) => {
    mix(o, shape(filter(pink(o.length, r), 'hp', 900), (t) => Math.min(1, t / 1.5) * hump(t / s, 0.3)), 0, 0.8);
    scatter(r, 0.3, s - 0.2, 350, (at) => mix(o, burst(r, 0.006, 'bp', between(r, 2000, 7000), 1.5, 0.0002, 0.0012), at, r() * r() * 0.8 * Math.min(1, at / 1.5)));
    mix(o, shape(filter(brown(o.length, r), 'lp', 300), (t) => hump(t / s, 0.5)), 0, 0.4);
  });
  return normAll(out, 0.7);
}

/** The Maelstrom's vortex strengthening: a vast rising roar. */
function vortexSurge(r: Rng): Buf[] {
  const s = 5, out = pair(s);
  out.forEach((o, c) => {
    const w = pink(o.length, r);
    sweep(w, 'bp', (u) => 250 + 700 * u + 120 * Math.sin(TAU * (2 + u * 3) * u + c * Math.PI), 1);
    mix(o, shape(w, (t) => hump(t / s, 0.6)), 0, 1);
    mix(o, shape(filter(brown(o.length, r), 'lp', 140), (t) => hump(t / s, 0.6)), 0, 1);
  });
  return normAll(out, 0.85);
}

/** The Kelp Shallows' bloom: the canopy thickening, a rubbery rustle spreading through the water. */
function kelpBloom(r: Rng): Buf[] {
  const s = 3.5, out = pair(s);
  out.forEach((o) => {
    scatter(r, 0, s - 0.3, 18, (at) => mix(o, kelpBrushOf(r), at, between(r, 0.2, 0.6) * hump(at / s, 0.6)));
    bubbles(o, r, 0.2, s - 0.2, 20, 0.08, 400, 1600);
  });
  return normAll(out, 0.6);
}

/** A rubbery blade dragging along planks. */
export function kelpBrushOf(r: Rng): Buf {
  const s = between(r, 0.3, 0.6), x = pink(n(s), r);
  sweep(x, 'bp', (u) => 500 + 600 * hump(u), 1.6);
  shape(x, (t) => hump(t / s, 1.2));
  return mix(x, stickSlip(r, s, 40, 70, [240, 510, 860], 0.03), 0, 0.15);
}

/** The Spice Isles' pearl bloom: the giant clam bed creaking open with a glint. */
function clamOpen(r: Rng): Buf[] {
  const out = pair(3);
  out.forEach((o, c) => {
    mix(o, stickSlip(r, 1.4, 12, 30, [90, 170, 280, 430], 0.15), 0, 0.8);
    bubbles(o, r, 0.3, 1.6, 30, 0.12, 300, 1500);
    mix(o, glass(r, 2600 * (1 + c * 0.003), 0.6, 1.4), 1.4, 0.35);
    shards(o, r, 1.4, 2.6, 18, 0.2, 4000, 9000);
  });
  return normAll(out, 0.7);
}

// ---------------------------------------------------------------- abilities

function smokeScreen(r: Rng): Buf[] {
  const s = 3, out = pair(s);
  out.forEach((o, c) => {
    mix(o, thump(0.5, 110, 50, 0.1), 0, 0.6);
    mix(o, shape(filter(white(o.length, r), 'bp', 1600 + c * 200, 0.5), (t) => ad(t, 0.06, 1.2)), 0, 0.8); // the hiss of smoke pouring out
    mix(o, shape(filter(pink(o.length, r), 'lp', 500), (t) => ad(t, 0.2, 1.2)), 0, 0.6);
  });
  return normAll(out, 0.7);
}

function rush(r: Rng): Buf {
  const x = new Float32Array(n(1.6));
  mix(x, whoosh(r, 1.2, 200, 1100, 1, 0.6), 0, 1);
  mix(x, shape(filter(brown(n(1.2), r), 'lp', 300), (t) => ad(t, 0.1, 0.5)), 0, 0.8);
  mix(x, shape(filter(white(n(1.2), r), 'hp', 2500), (t) => ad(t, 0.1, 0.4)), 0, 0.3);
  return normalize(x, 0.8);
}

/** Reveal: a deep pulse pushed out across the water, with a glassy ring that spreads. */
function reveal(r: Rng): Buf[] {
  const s = 3, out = pair(s);
  out.forEach((o, c) => {
    mix(o, thump(1.5, 140, 60, 0.4), 0, 1);
    mix(o, glass(r, 700 * (1 + c * 0.006), 1.2, s), 0.01, 0.45);
    mix(o, shape(sweep(pink(o.length, r), 'bp', (u) => 3000 * Math.pow(0.1, u) + 200, 2), (t) => ad(t, 0.01, 0.8)), c * 0.03, 0.35);
    for (let k = 1; k < 4; k++) mix(o, glass(r, 700, 0.4, 1), k * 0.35 + c * 0.02, 0.3 / k); // echoes coming back
  });
  return normAll(out, 0.75);
}

function hardTurn(r: Rng): Buf {
  const x = new Float32Array(n(1.6));
  mix(x, whoosh(r, 1.1, 300, 1600, 1.1, 0.8), 0, 0.8); // the water carved aside
  mix(x, shape(filter(white(n(1.2), r), 'hp', 2000), (t) => ad(t, 0.08, 0.35)), 0.05, 0.4);
  mix(x, creak(r, 0.8), 0.15, 0.6);
  mix(x, creak(r, 1), 0.5, 0.35);
  return normalize(x, 0.75);
}

/** Decoy: a ghostly shimmer splitting away. */
function decoy(r: Rng): Buf[] {
  const s = 2, out = pair(s);
  out.forEach((o, c) => {
    [1, 1.33, 1.79].forEach((k, j) => mix(o, tone(o.length, (t) => 600 * k * (1 + (c ? 1 : -1) * 0.04 * t), (t) => ad(t, 0.15, 0.5) * 0.25 / (1 + j)), 0));
    mix(o, whoosh(r, 1.2, 600, 2800, 1.4), c * 0.15, 0.5);
    shards(o, r, 0.1, 1.5, 20, 0.15, 3000, 8000);
  });
  return normAll(out, 0.65);
}

/** Wave: a wall of water pushed outward. */
function wave(r: Rng): Buf[] {
  const s = 3, out = pair(s);
  out.forEach((o) => {
    mix(o, thump(1, 70, 35, 0.3), 0, 1);
    const w = pink(o.length, r);
    sweep(w, 'lp', (u) => 300 + 2600 * hump(u, 0.5), 0.8);
    mix(o, shape(w, (t) => ad(t, 0.15, 0.9)), 0, 1);
    mix(o, splashOf(r, 0.7, 2.4), 0.25, 0.6);
  });
  return normAll(out, 0.85);
}

/** Drift Mine: a heavy thing let down into the water, then a slow tick. */
function mineDrop(r: Rng): Buf {
  const x = new Float32Array(n(1.6));
  mix(x, splashOf(r, 0.2, 1), 0, 0.6);
  mix(x, knock(r, 160, 0.1, 0.5), 0, 0.6);
  for (let k = 0; k < 3; k++) mix(x, metal(r, 1800, 0.05, 0.2), 0.6 + k * 0.3, 0.3);
  return normalize(x, 0.6);
}

/** The mine going off under a ship: a muffled boom and a geyser. */
function mineBurst(r: Rng): Buf[] {
  const out = pair(3.5);
  out.forEach((o) => {
    mix(o, thump(2, 60, 22, 0.6), 0, 1.2);
    mix(o, shape(filter(brown(o.length, r), 'lp', 300), (t) => ad(t, 0.01, 0.4)), 0, 1);
    mix(o, splashOf(r, 0.9, 3), 0.08, 1);
    splinters(o, r, 0.1, 1.2, 30, 0.3);
  });
  normAll(out, 1);
  out.forEach((o) => softclip(o, 1.8));
  return normAll(out, 0.95);
}

function repairAbility(r: Rng): Buf[] {
  const s = 3, out = pair(s);
  out.forEach((o, c) => {
    for (let k = 0; k < 8; k++) mix(o, knock(r, between(r, 350, 650), 0.04, 0.25), 0.1 + k * 0.33 + c * 0.01 + between(r, 0, 0.04), between(r, 0.4, 0.8));
    mix(o, stickSlip(r, 2.4, 20, 35, [300, 620, 980], 0.05), 0.2, 0.25);
    mix(o, shape(sweep(pink(o.length, r), 'bp', (u) => 600 + 3000 * u, 2), (t) => hump(t / s, 1)), 0, 0.2);
    shards(o, r, 0.2, s - 0.2, 12, 0.12, 3000, 7000);
  });
  return normAll(out, 0.65);
}

/** An active ability's cooldown is over. */
function abilityReady(r: Rng): Buf {
  const x = new Float32Array(n(0.9));
  mix(x, whoosh(r, 0.35, 900, 3000, 1.6, 1.5), 0, 0.4);
  mix(x, glass(r, 1900, 0.25, 0.8), 0.2, 0.5);
  mix(x, glass(r, 2850, 0.2, 0.6), 0.24, 0.3);
  return normalize(x, 0.5);
}

// ---------------------------------------------------------------- territory

/** Water turning your colour: a soft wash with a faint glint. */
function claim(r: Rng): Buf {
  const x = new Float32Array(n(0.9));
  mix(x, whoosh(r, 0.6, 600, 1800, 1.2, 1.2), 0, 0.4);
  mix(x, glass(r, between(r, 2000, 2600), 0.2, 0.7), 0.05, 0.3);
  return normalize(x, 0.4);
}

/** Holding a landmark: its perk is yours. A deep resonant hit with a bloom of light. */
function landmarkTaken(r: Rng): Buf[] {
  const s = 3.2, out = pair(s);
  out.forEach((o, c) => {
    mix(o, thump(1.6, 90, 40, 0.45), 0, 1);
    mix(o, bowl(r, 220 * (1 + c * 0.003), 1.3, s), 0.01, 0.4);
    mix(o, shape(sweep(pink(n(1.2), r), 'bp', (u) => 500 + 5000 * u * u, 2), (t) => Math.pow(t / 1.2, 2) * (t < 1.18 ? 1 : 0)), 0, 0.3);
    shards(o, r, 0.05, 2.4, 25, 0.2, 3000, 9000);
  });
  return normAll(out, 0.8);
}

/** The landmark lost to someone else: a falling, hollow knock. */
function landmarkLost(r: Rng): Buf {
  const x = new Float32Array(n(2));
  mix(x, thump(1.2, 120, 45, 0.35), 0, 0.8);
  mix(x, bowl(r, 160, 0.7, 1.8), 0.01, 0.35);
  mix(x, shape(sweep(pink(n(1), r), 'bp', (u) => 2500 - 2200 * u, 1.5), (t) => ad(t, 0.01, 0.4)), 0, 0.4);
  return normalize(x, 0.7);
}

export const WORLD_SOUNDS = {
  gullCall: def(gullCall, 6, 'fx', 4, 0.6, 3, { range: 220 }),
  gullKek: def(gullKek, 3, 'fx', 4, 0.5, 2, { range: 150 }),
  gullWings: def(gullWings, 2, 'fx', 3, 0.45, 2, { range: 60 }),
  gullDive: def(gullDive, 2, 'fx', 5, 0.65, 2, { range: 160 }),
  deliveryThud: def(deliveryThud, 2, 'fx', 8, 0.85, 2, { range: 160 }),
  whaleBreath: def(whaleBreath, 3, 'fx', 5, 0.75, 2, { range: 650 }),
  whaleSong: def(whaleSong, 3, 'amb', 3, 0.55, 1, { range: 900 }),
  whaleBreach: def(whaleBreach, 2, 'fx', 9, 1, 1, { range: 900, jitter: 0.02 }),
  whaleDive: def(whaleDive, 2, 'fx', 5, 0.8, 2, { range: 500 }),
  stormWarning: def(stormWarning, 2, 'ui', 9, 0.85, 1, { jitter: 0 }),
  stormShrink: def(stormShrink, 1, 'amb', 7, 0.7, 1),
  galeDive: def(galeDive, 1, 'fx', 8, 0.8, 1, { range: 100 }),
  galeLand: def(galeLand, 2, 'fx', 8, 0.9, 2, { range: 300 }),
  thunderWarn: def(thunderWarn, 2, 'fx', 8, 0.6, 2, { range: 200 }),
  lightning: def(lightning, 3, 'fx', 9, 1, 2, { range: 900 }),
  thunder: def(thunder, 3, 'amb', 6, 0.9, 2, { range: 2000 }),
  iceRigging: def(iceRigging, 2, 'fx', 4, 0.5, 2, { range: 60 }),
  iceBoom: def(iceBoom, 3, 'fx', 5, 0.8, 2, { range: 800 }),
  floesGrind: def(floesGrind, 2, 'fx', 4, 0.6, 2, { range: 300 }),
  rockfall: def(rockfall, 2, 'fx', 7, 0.9, 1, { range: 900, near: 60 }),
  floodSurge: def(floodSurge, 1, 'fx', 6, 0.8, 1, { range: 900 }),
  tideDraw: def(tideDraw, 1, 'fx', 6, 0.75, 1, { range: 900 }),
  fogSurge: def(fogSurge, 1, 'amb', 6, 0.6, 1),
  eruption: def(eruption, 1, 'fx', 9, 1, 1, { range: 1500, near: 150 }),
  lavaBomb: def(lavaBomb, 3, 'fx', 7, 0.85, 4, { range: 600, near: 50 }),
  cloudburst: def(cloudburst, 1, 'amb', 6, 0.7, 1),
  vortexSurge: def(vortexSurge, 1, 'amb', 7, 0.85, 1),
  kelpBloom: def(kelpBloom, 1, 'fx', 5, 0.6, 1, { range: 300 }),
  clamOpen: def(clamOpen, 1, 'fx', 7, 0.7, 1, { range: 500 }),
  abilitySmoke: def(smokeScreen, 1, 'fx', 7, 0.7, 2, { range: 300 }),
  abilityRam: def(rush, 2, 'fx', 7, 0.8, 2, { range: 300 }),
  abilityRepair: def(repairAbility, 1, 'fx', 6, 0.65, 2, { range: 200 }),
  abilityReveal: def(reveal, 1, 'fx', 7, 0.75, 1, { range: 500 }),
  abilityHardTurn: def(hardTurn, 2, 'fx', 6, 0.75, 2, { range: 250 }),
  abilityDecoy: def(decoy, 1, 'fx', 6, 0.65, 2, { range: 250 }),
  abilityWave: def(wave, 1, 'fx', 7, 0.85, 2, { range: 400 }),
  mineDrop: def(mineDrop, 2, 'fx', 5, 0.6, 3, { range: 150 }),
  mineBurst: def(mineBurst, 2, 'fx', 8, 0.95, 3, { range: 600 }),
  abilityReady: def(abilityReady, 1, 'ui', 6, 0.5, 1, { jitter: 0 }),
  claim: def(claim, 2, 'ui', 3, 0.35, 1),
  landmarkTaken: def(landmarkTaken, 1, 'ui', 9, 0.8, 1, { jitter: 0 }),
  landmarkLost: def(landmarkLost, 1, 'ui', 8, 0.7, 1, { jitter: 0 }),
};

/** The sound each active ability makes when used. */
export const ABILITY = {
  repair: 'abilityRepair', smokeScreen: 'abilitySmoke', ram: 'abilityRam', reveal: 'abilityReveal', hardTurn: 'abilityHardTurn',
  decoy: 'abilityDecoy', wave: 'abilityWave', driftMine: 'mineDrop',
} as const;

