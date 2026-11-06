// The guns. Each of the eight classes has its own layered fire sound (a crack, a body, a blast and a tail), and the
// variant is the rarity: every step up adds a deeper sub, a longer tail, then a ringing barrel and a spirit
// sparkle. Then the projectiles' impacts, the mortar's falling whistle, reloads and the dry click.
import { pluck, softclip, type Buf, type Rng } from '../dsp.ts';
import { def, RARITY } from '../def.ts';
import {
  ad, between, blast, brown, burst, crackles, crunch, filter, glass, grit, hump, knock, metal, mix, n, normalize, normAll, pair, pink,
  scatter, shape, shards, splashOf, splinters, SR, sweep, thump, tone, white, whoosh, stickSlip,
} from '../kit.ts';

/** The weight a rarity adds to a fire sound, mixed into every channel. */
function weight(chs: Buf[], r: Rng, v: number): void {
  if (v <= 0) return;
  const sub = thump(1.4, 62, 26, 0.28 + 0.08 * v), len = chs[0].length / SR;
  const tail = shape(filter(pink(n(Math.min(len, 2.5)), r), 'lp', 260), (t) => ad(t, 0.05, 0.4 + 0.22 * v));
  const ring = v >= 3 ? metal(r, between(r, 780, 900), 0.18 + 0.05 * v, 1.2) : null;
  const sparkle = new Float32Array(n(Math.min(len, 1.6)));
  if (v >= 4) shards(sparkle, r, 0.04, 1.2, 40, 0.5, 4000, 9000);
  chs.forEach((o, c) => {
    mix(o, sub, 0, 0.22 * v);
    mix(o, tail, 0.02 + c * 0.004, 0.1 * v);
    if (ring) mix(o, ring, 0.004, 0.1);
    if (v >= 4) mix(o, sparkle, 0.03 + c * 0.011, 0.35);
  });
}

function finish(chs: Buf[], r: Rng, v: number, drive: number): Buf[] {
  weight(chs, r, v);
  normAll(chs, 1);
  chs.forEach((o) => softclip(o, drive));
  return normAll(chs, 0.9 + 0.02 * v);
}

function cannon(r: Rng, v: number): Buf[] {
  const out = pair(2.8);
  const crack = burst(r, 0.06, 'hp', 1500, 0.7, 0.0004, 0.007);
  const boom = thump(1.5, between(r, 95, 125), between(r, 33, 42), between(r, 0.38, 0.5));
  const bl = blast(r, 1.8, 4200, 9, 0.32);
  const recoil = knock(r, between(r, 120, 170), 0.09, 0.5);
  out.forEach((o, c) => {
    const tail = shape(filter(pink(o.length, r), 'lp', 300), (t) => ad(t, 0.06, 0.85));
    mix(o, crack, c * 0.0006, 0.9); mix(o, boom, 0, 1.1); mix(o, bl, 0.001 * c, 0.9); mix(o, tail, 0.01, 0.55); mix(o, recoil, 0.04, 0.35);
  });
  return finish(out, r, v, 1.6);
}

function scatterGun(r: Rng, v: number): Buf[] {
  const out = pair(2.2);
  const crack = burst(r, 0.05, 'hp', 2200, 0.7, 0.0003, 0.005);
  const boom = thump(0.9, between(r, 135, 160), 48, 0.22);
  const bl = blast(r, 1.2, 5200, 14, 0.18);
  out.forEach((o, c) => {
    mix(o, crack, c * 0.0005, 1); mix(o, boom, 0, 0.9); mix(o, bl, 0, 1);
    // the grapeshot rattling out of the muzzle, then the pellets whizzing away
    for (let k = 0; k < 9; k++) mix(o, metal(r, between(r, 1400, 3200), 0.012, 0.06), between(r, 0.002, 0.05), between(r, 0.08, 0.2));
    scatter(r, 0.04, 0.45, 26, (at) => {
      const f0 = between(r, 2500, 5000), s = between(r, 0.08, 0.16);
      mix(o, shape(sweep(white(n(s), r), 'bp', (u) => f0 * (1 - 0.45 * u), 6), (t) => hump(t / s, 1.5)), at, between(r, 0.05, 0.18));
    });
    mix(o, shape(filter(pink(o.length, r), 'lp', 420), (t) => ad(t, 0.04, 0.55)), 0.01, 0.5);
  });
  return finish(out, r, v, 1.8);
}

function harpoon(r: Rng, v: number): Buf[] {
  const out = pair(1.8);
  const latch = knock(r, between(r, 2000, 2400), 0.02, 0.12);
  // the bow-arm's string: two low plucks a fifth-ish apart, so it twangs rather than sings
  const f = between(r, 92, 108), twang = normalize(pluck(n(1.2), f, r, 0.8, 0.993), 1), twang2 = normalize(pluck(n(0.9), f * 1.43, r, 0.7, 0.99), 1);
  const frame = knock(r, between(r, 260, 320), 0.07, 0.4);
  const zipLen = 0.75, zip = white(n(zipLen), r);
  sweep(zip, 'bp', (u) => 2800 - 1900 * u, 3);
  shape(zip, (t) => hump(t / zipLen, 0.6) * (0.55 + 0.45 * Math.sin(2 * Math.PI * (70 - 30 * t) * t)));
  out.forEach((o, c) => {
    mix(o, latch, 0, 0.6);
    mix(o, twang, 0.012 + c * 0.0007, 0.8); mix(o, twang2, 0.014, 0.35);
    mix(o, frame, 0.012, 0.7);
    mix(o, thump(0.4, 160, 70, 0.08), 0.012, 0.6);
    mix(o, zip, 0.03 + c * 0.006, 0.35);
  });
  return finish(out, r, v, 1.3);
}

function mortar(r: Rng, v: number): Buf[] {
  const out = pair(2.4);
  const boom = thump(1.4, between(r, 72, 84), 28, 0.42);
  const tube = normalize(filter(burst(r, 0.5, 'bp', between(r, 170, 200), 6, 0.002, 0.09), 'lp', 900), 1);
  const bl = blast(r, 1.2, 1000, 6, 0.24);
  const lift = whoosh(r, 0.9, 260, 1300, 1.6, 2);
  out.forEach((o, c) => {
    mix(o, burst(r, 0.04, 'hp', 1200, 0.7, 0.0005, 0.006), 0, 0.5);
    mix(o, boom, 0, 1.3); mix(o, tube, 0.002, 0.7); mix(o, bl, 0.001 * c, 0.9);
    mix(o, lift, 0.08 + c * 0.01, 0.25);
    mix(o, shape(filter(pink(o.length, r), 'lp', 240), (t) => ad(t, 0.08, 0.8)), 0.02, 0.55);
  });
  return finish(out, r, v, 1.7);
}

function repeater(r: Rng, v: number): Buf[] {
  const out = pair(0.75);
  const crack = burst(r, 0.03, 'hp', 2600, 0.7, 0.0002, 0.003);
  const boom = thump(0.3, between(r, 170, 200), 70, 0.06);
  const bl = blast(r, 0.4, 3000, 22, 0.06);
  const bolt = metal(r, between(r, 1700, 2100), 0.015, 0.08), bolt2 = metal(r, between(r, 2400, 2800), 0.012, 0.06);
  out.forEach((o, c) => {
    mix(o, crack, c * 0.0004, 1); mix(o, boom, 0, 0.8); mix(o, bl, 0, 0.8);
    mix(o, bolt, 0.055, 0.22); mix(o, bolt2, 0.1, 0.18);
    mix(o, shape(filter(pink(o.length, r), 'lp', 600), (t) => ad(t, 0.01, 0.16)), 0.005, 0.35);
  });
  return finish(out, r, Math.min(v, 3), 1.5);
}

/** Chain shot: a short gun's flat bark, then the two halves whirring away on their chain, a whup-whup that falls. */
function chainShot(r: Rng, v: number): Buf[] {
  const out = pair(2.4);
  const crack = burst(r, 0.05, 'hp', 1300, 0.7, 0.0004, 0.006);
  const boom = thump(1.2, between(r, 105, 130), 40, between(r, 0.3, 0.38));
  const bl = blast(r, 1.4, 3600, 10, 0.26);
  const rattle = new Float32Array(n(0.12));
  for (let k = 0; k < 6; k++) mix(rattle, metal(r, between(r, 1200, 2200), 0.015, 0.06), between(r, 0, 0.08), between(r, 0.2, 0.5));
  // the whirr: noise through a band that pulses at the bar's spin, slowing and falling as it goes
  const s = 1.3, whirr = white(n(s), r);
  sweep(whirr, 'bp', (u) => 900 - 450 * u, 3.5);
  shape(whirr, (t) => hump(t / s, 0.5) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (26 - 9 * t) * t)) ** 2);
  out.forEach((o, c) => {
    mix(o, crack, c * 0.0006, 0.9); mix(o, boom, 0, 1); mix(o, bl, 0.001 * c, 0.8); mix(o, rattle, 0.004, 0.5);
    mix(o, whirr, 0.05 + c * 0.012, 0.42);
    mix(o, shape(filter(pink(o.length, r), 'lp', 320), (t) => ad(t, 0.05, 0.7)), 0.01, 0.45);
  });
  return finish(out, r, v, 1.6);
}

/** Heated shot: the cannon's report with a hiss of steam off the wet swab and the ball's own crackle as it leaves. */
function heatedShot(r: Rng, v: number): Buf[] {
  const out = pair(2.8);
  const crack = burst(r, 0.06, 'hp', 1600, 0.7, 0.0004, 0.007);
  const boom = thump(1.4, between(r, 100, 125), 36, between(r, 0.36, 0.46));
  const bl = blast(r, 1.6, 4400, 9, 0.3);
  const hiss = shape(filter(white(n(1.2), r), 'hp', 2600), (t) => ad(t, 0.01, 0.5));
  const sizzle = new Float32Array(n(1.4));
  crackles(sizzle, r, 0.02, 1.2, 45, 0.5);
  out.forEach((o, c) => {
    mix(o, crack, c * 0.0006, 0.9); mix(o, boom, 0, 1.05); mix(o, bl, 0.001 * c, 0.85);
    mix(o, hiss, 0.01 + c * 0.004, 0.35); mix(o, sizzle, 0.03 + c * 0.007, 0.35);
    mix(o, shape(filter(pink(o.length, r), 'lp', 300), (t) => ad(t, 0.06, 0.8)), 0.01, 0.5);
  });
  return finish(out, r, v, 1.6);
}

/** Both batteries at once: guns ripple down each side, port and starboard a beat apart, over one long rumble. */
function broadside(r: Rng, v: number): Buf[] {
  const out = pair(4);
  const guns = 5;
  for (let side = 0; side < 2; side++) {
    let t = side * between(r, 0.035, 0.06);
    for (let k = 0; k < guns; k++) {
      const crack = burst(r, 0.05, 'hp', 1400, 0.7, 0.0004, 0.006), boom = thump(1.2, between(r, 90, 120), between(r, 34, 42), between(r, 0.3, 0.4));
      const bl = blast(r, 1.2, 3600, 9, 0.25), near = side, far = 1 - side;
      mix(out[near], crack, t, 0.75); mix(out[near], boom, t, 0.75); mix(out[near], bl, t, 0.7);
      mix(out[far], crack, t + 0.0007, 0.3); mix(out[far], boom, t, 0.55); mix(out[far], bl, t + 0.001, 0.35);
      t += between(r, 0.08, 0.13);
    }
  }
  out.forEach((o) => {
    mix(o, shape(filter(brown(o.length, r), 'lp', 180), (t) => ad(t, 0.15, 1.2)), 0, 0.9);
    mix(o, shape(filter(pink(o.length, r), 'lp', 320), (t) => ad(t, 0.1, 1.1)), 0.05, 0.4);
  });
  return finish(out, r, v, 1.9);
}

/** The mortar shell's whistle on the way down: a falling, narrowing band of air. About 1.3 s long. */
function whistle(r: Rng): Buf {
  const s = between(r, 1.15, 1.35), N = n(s), f = (u: number): number => 2600 - 1500 * Math.pow(u, 1.2);
  const x = sweep(white(N, r), 'bp', f, 16);
  shape(x, (t) => Math.pow(Math.min(1, t / s), 1.6));
  mix(x, tone(N, (t) => f(t / s), (t) => 0.025 * Math.pow(t / s, 2)));
  return normalize(x, 0.6);
}

/** A round passing close overhead. */
function flyby(r: Rng): Buf {
  const s = 0.55, x = pink(n(s), r);
  sweep(x, 'bp', (u) => 1800 - 1100 * u, 2.5);
  shape(x, (t) => Math.pow(hump(t / s, 1), 3));
  return normalize(x, 0.6);
}

function impactWater(r: Rng): Buf {
  return normalize(splashOf(r, between(r, 0.3, 0.5)), 0.85);
}

function impactLand(r: Rng): Buf {
  const x = new Float32Array(n(1.4));
  mix(x, shape(filter(brown(n(0.8), r), 'lp', 380), (t) => ad(t, 0.003, 0.12)), 0, 1);
  mix(x, thump(0.7, 85, 38, 0.16), 0, 0.9);
  mix(x, burst(r, 0.04, 'hp', 1800, 0.7, 0.0003, 0.006), 0, 0.5);
  for (let k = 0; k < 7; k++) mix(x, knock(r, between(r, 380, 1400), between(r, 0.01, 0.03), 0.15), between(r, 0, 0.06), between(r, 0.2, 0.5));
  grit(x, r, 0.08, 1.1, 22, 0.25);
  return normalize(x, 0.85);
}

/** A round striking a hull, heard from outside: the crack of planks and a dull boom inside the hold. */
function impactShip(r: Rng): Buf {
  const x = new Float32Array(n(1.3));
  mix(x, burst(r, 0.03, 'hp', 2200, 0.7, 0.0003, 0.004), 0, 0.9);
  crunch(x, r, 0, 0.14, 8 + Math.floor(r() * 5), 0.7);
  splinters(x, r, 0.02, 0.6, 40, 0.45);
  mix(x, thump(0.6, 100, 48, 0.15), 0, 0.9);
  mix(x, knock(r, between(r, 110, 150), 0.12, 0.6), 0.004, 0.5);
  return normalize(x, 0.95);
}

function harpoonHit(r: Rng): Buf {
  const x = new Float32Array(n(1.2));
  mix(x, knock(r, between(r, 160, 200), 0.1, 0.6), 0, 1);
  mix(x, metal(r, between(r, 1100, 1300), 0.06, 0.4), 0, 0.3);
  splinters(x, r, 0, 0.25, 30, 0.35);
  mix(x, normalize(pluck(n(1), between(r, 70, 85), r, 0.5, 0.996), 1), 0.02, 0.45);
  mix(x, stickSlip(r, 0.5, 30, 60, [240, 520, 890], 0.03), 0.08, 0.3);
  return normalize(x, 0.85);
}

/** The mortar's burst: a big explosion with debris. */
function mortarBlast(r: Rng): Buf[] {
  const out = pair(3.4);
  const crack = burst(r, 0.08, 'hp', 1200, 0.7, 0.0003, 0.01), boom = thump(2, 80, 26, 0.7);
  const bl = shape(sweep(brown(n(2.4), r), 'lp', (t) => 100 + 5200 * Math.exp(-t * 6), 0.8), (t) => ad(t, 0.002, 0.55));
  out.forEach((o) => {
    mix(o, crack, 0, 1); mix(o, boom, 0, 1.2); mix(o, bl, 0, 1);
    mix(o, shape(filter(pink(o.length, r), 'lp', 220), (t) => ad(t, 0.1, 1.1)), 0, 0.6);
    splinters(o, r, 0.05, 1.6, 30, 0.35);
  });
  normAll(out, 1);
  out.forEach((o) => softclip(o, 2.2));
  return normAll(out, 0.97);
}

/** The crit sting laid over an impact: a bright metallic 'shing' and a sharp snap. */
function crit(r: Rng): Buf {
  const x = new Float32Array(n(1.1));
  mix(x, burst(r, 0.02, 'hp', 4000, 0.7, 0.0002, 0.002), 0, 0.8);
  mix(x, metal(r, between(r, 2900, 3300), 0.18, 0.9), 0.002, 0.7);
  mix(x, glass(r, between(r, 4600, 5200), 0.2, 0.8), 0.01, 0.4);
  mix(x, tone(n(0.35), (t) => 2400 - 1600 * t, (t) => ad(t, 0.004, 0.08)), 0, 0.25);
  return normalize(x, 0.75);
}

// ---------------------------------------------------------------- reloads and the hotbar

function reloadCannon(r: Rng): Buf {
  const x = new Float32Array(n(1.1));
  mix(x, stickSlip(r, 0.35, 40, 70, [300, 640, 1020], 0.03), 0, 0.4); // the ramrod
  mix(x, knock(r, between(r, 180, 220), 0.07, 0.4), 0.38, 0.8); // the ball seated
  mix(x, metal(r, between(r, 900, 1100), 0.05, 0.3), 0.38, 0.25);
  mix(x, knock(r, between(r, 900, 1100), 0.03, 0.2), 0.7, 0.6); // the gun run out
  mix(x, thump(0.3, 120, 70, 0.06), 0.7, 0.5);
  return normalize(x, 0.6);
}

function reloadChain(r: Rng): Buf {
  const x = new Float32Array(n(1.2));
  for (let k = 0; k < 9; k++) mix(x, metal(r, between(r, 1100, 2300), 0.02, 0.09), 0.05 + k * 0.035 + between(r, 0, 0.02), between(r, 0.2, 0.45)); // the chain paid in
  mix(x, knock(r, between(r, 170, 210), 0.08, 0.4), 0.45, 0.8); // the halves seated
  mix(x, knock(r, between(r, 850, 1000), 0.03, 0.2), 0.8, 0.6);
  mix(x, thump(0.3, 120, 70, 0.06), 0.8, 0.5);
  return normalize(x, 0.6);
}

function reloadHeated(r: Rng): Buf {
  const x = new Float32Array(n(1.3));
  mix(x, metal(r, between(r, 700, 850), 0.06, 0.3), 0, 0.5); // the tongs off the furnace
  mix(x, shape(filter(white(n(0.7), r), 'hp', 3200), (t) => ad(t, 0.01, 0.3)), 0.2, 0.35); // hissing on the wet wad
  crackles(x, r, 0.2, 0.8, 30, 0.3);
  mix(x, knock(r, between(r, 180, 220), 0.07, 0.4), 0.45, 0.8);
  mix(x, knock(r, between(r, 900, 1100), 0.03, 0.2), 0.85, 0.6);
  mix(x, thump(0.3, 120, 70, 0.06), 0.85, 0.5);
  return normalize(x, 0.6);
}

function reloadScatter(r: Rng): Buf {
  const x = new Float32Array(n(1));
  for (let k = 0; k < 10; k++) mix(x, metal(r, between(r, 2200, 4200), 0.02, 0.1), 0.1 + between(r, 0, 0.25), between(r, 0.1, 0.3)); // shot poured in
  mix(x, knock(r, between(r, 700, 900), 0.04, 0.2), 0.5, 0.7);
  mix(x, knock(r, between(r, 1100, 1300), 0.03, 0.2), 0.62, 0.6);
  return normalize(x, 0.55);
}

function reloadHarpoon(r: Rng): Buf {
  const x = new Float32Array(n(1.2));
  for (let k = 0; k < 7; k++) mix(x, knock(r, between(r, 1900, 2200) * (1 - k * 0.02), 0.012, 0.08), 0.05 + k * 0.1, 0.5); // the winch's ratchet
  mix(x, stickSlip(r, 0.8, 25, 45, [420, 860, 1300], 0.04), 0.05, 0.25); // the rope drawn tight
  mix(x, knock(r, between(r, 380, 440), 0.05, 0.3), 0.85, 0.8); // the latch
  return normalize(x, 0.55);
}

function reloadMortar(r: Rng): Buf {
  const x = new Float32Array(n(1.1));
  mix(x, knock(r, between(r, 140, 170), 0.12, 0.6), 0.25, 1); // the shell dropped into the tube
  mix(x, normalize(filter(burst(r, 0.4, 'bp', 190, 7, 0.002, 0.1), 'lp', 900), 1), 0.25, 0.5);
  mix(x, metal(r, between(r, 600, 700), 0.1, 0.5), 0.26, 0.2);
  mix(x, whoosh(r, 0.25, 400, 1200, 1.2), 0, 0.2);
  return normalize(x, 0.6);
}

function reloadRepeater(r: Rng): Buf {
  const x = new Float32Array(n(0.6));
  mix(x, metal(r, between(r, 1500, 1700), 0.02, 0.1), 0, 0.6);
  mix(x, knock(r, between(r, 1300, 1500), 0.02, 0.1), 0.02, 0.6);
  mix(x, metal(r, between(r, 2400, 2700), 0.015, 0.08), 0.24, 0.7);
  mix(x, knock(r, between(r, 2000, 2300), 0.015, 0.08), 0.25, 0.5);
  return normalize(x, 0.55);
}

function reloadBroadside(r: Rng): Buf[] {
  const out = pair(1.6);
  for (let k = 0; k < 5; k++) {
    const at = 0.15 + k * between(r, 0.14, 0.2), g = knock(r, between(r, 850, 1100), 0.03, 0.2), t = thump(0.3, 120, 70, 0.06);
    mix(out[0], g, at, 0.6); mix(out[0], t, at, 0.4);
    mix(out[1], g, at + 0.06, 0.6); mix(out[1], t, at + 0.06, 0.4);
  }
  out.forEach((o) => mix(o, stickSlip(r, 1, 30, 50, [200, 430, 700], 0.04), 0, 0.3));
  return normAll(out, 0.6);
}

/** The gun is ready: a crisp latch. */
function reloadDone(r: Rng): Buf {
  const x = new Float32Array(n(0.25));
  mix(x, metal(r, between(r, 2600, 2900), 0.03, 0.15), 0, 0.6);
  mix(x, knock(r, between(r, 1500, 1700), 0.02, 0.12), 0.004, 0.7);
  return normalize(x, 0.5);
}

/** Out of shot: a dry click on an empty breech. */
function empty(r: Rng): Buf {
  const x = new Float32Array(n(0.18));
  mix(x, knock(r, between(r, 2400, 2800), 0.008, 0.05), 0, 1);
  mix(x, metal(r, between(r, 3800, 4200), 0.01, 0.05), 0.002, 0.3);
  return normalize(x, 0.5);
}

function select(r: Rng): Buf {
  const x = new Float32Array(n(0.3));
  mix(x, knock(r, between(r, 900, 1100), 0.025, 0.15), 0, 0.8);
  mix(x, metal(r, between(r, 1900, 2200), 0.02, 0.1), 0.03, 0.4);
  return normalize(x, 0.5);
}

function swap(r: Rng): Buf {
  const x = new Float32Array(n(0.5));
  mix(x, whoosh(r, 0.22, 500, 2200, 1.4), 0, 0.5);
  mix(x, knock(r, between(r, 700, 900), 0.03, 0.15), 0.12, 0.8);
  mix(x, knock(r, between(r, 1100, 1300), 0.025, 0.15), 0.22, 0.7);
  return normalize(x, 0.5);
}

/** An item dropped over the side. */
function dropItem(r: Rng): Buf {
  return normalize(splashOf(r, 0.05, 0.9), 0.55);
}

export const WEAPON_SOUNDS = {
  fireCannon: def(cannon, 5, 'fx', 7, 1, 10, { ...RARITY, range: 600 }),
  fireScatter: def(scatterGun, 5, 'fx', 7, 1, 8, { ...RARITY, range: 520 }),
  fireHarpoon: def(harpoon, 5, 'fx', 7, 0.9, 6, { ...RARITY, range: 380 }),
  fireMortar: def(mortar, 5, 'fx', 7, 1, 6, { ...RARITY, range: 620 }),
  fireRepeater: def(repeater, 5, 'fx', 6, 0.85, 12, { ...RARITY, range: 450 }),
  fireBroadside: def(broadside, 5, 'fx', 8, 1, 6, { ...RARITY, range: 700 }),
  fireChain: def(chainShot, 5, 'fx', 7, 0.95, 6, { ...RARITY, range: 520 }),
  fireHeated: def(heatedShot, 5, 'fx', 7, 1, 8, { ...RARITY, range: 600 }),
  mortarWhistle: def(whistle, 3, 'fx', 5, 0.6, 6, { range: 220 }),
  flyby: def(flyby, 3, 'fx', 4, 0.6, 4, { range: 40 }),
  impactWater: def(impactWater, 4, 'fx', 5, 0.75, 8, { range: 420 }),
  impactLand: def(impactLand, 3, 'fx', 5, 0.8, 6, { range: 420 }),
  impactShip: def(impactShip, 4, 'fx', 7, 0.95, 8, { range: 460 }),
  harpoonHit: def(harpoonHit, 2, 'fx', 7, 0.85, 4, { range: 300 }),
  mortarBlast: def(mortarBlast, 3, 'fx', 8, 1, 5, { range: 700 }),
  crit: def(crit, 2, 'fx', 9, 0.75, 3, { range: 300, jitter: 0.02 }),
  reloadCannon: def(reloadCannon, 2, 'fx', 4, 0.55, 2, { range: 60 }),
  reloadScatter: def(reloadScatter, 2, 'fx', 4, 0.55, 2, { range: 60 }),
  reloadHarpoon: def(reloadHarpoon, 2, 'fx', 4, 0.55, 2, { range: 60 }),
  reloadMortar: def(reloadMortar, 2, 'fx', 4, 0.55, 2, { range: 60 }),
  reloadRepeater: def(reloadRepeater, 2, 'fx', 4, 0.55, 2, { range: 60 }),
  reloadBroadside: def(reloadBroadside, 1, 'fx', 4, 0.6, 2, { range: 60 }),
  reloadChain: def(reloadChain, 2, 'fx', 4, 0.55, 2, { range: 60 }),
  reloadHeated: def(reloadHeated, 2, 'fx', 4, 0.55, 2, { range: 60 }),
  reloadDone: def(reloadDone, 2, 'ui', 6, 0.5, 2),
  empty: def(empty, 2, 'ui', 6, 0.55, 2),
  select: def(select, 2, 'ui', 7, 0.5, 2),
  swap: def(swap, 2, 'ui', 7, 0.5, 2),
  dropItem: def(dropItem, 2, 'fx', 4, 0.6, 3, { range: 80 }),
};

/** The fire sound for each weapon class. */
export const FIRE = {
  cannon: 'fireCannon', scatter: 'fireScatter', harpoon: 'fireHarpoon', mortar: 'fireMortar', repeater: 'fireRepeater', broadside: 'fireBroadside',
  chain: 'fireChain', heated: 'fireHeated',
} as const;

/** The reload sound for each weapon class. */
export const RELOAD = {
  cannon: 'reloadCannon', scatter: 'reloadScatter', harpoon: 'reloadHarpoon', mortar: 'reloadMortar', repeater: 'reloadRepeater', broadside: 'reloadBroadside',
  chain: 'reloadChain', heated: 'reloadHeated',
} as const;

export const IMPACT = { water: 'impactWater', land: 'impactLand', ship: 'impactShip' } as const;

