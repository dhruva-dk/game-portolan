// The ambience beds: seamless stereo loops that the mixer crossfades as you sail. The shared beds are the sea, the
// wind and the ship moving through water; the weather beds sit on top; and each of the 16 regions has its own bed.
// Every bed changes slowly over its loop so it never sounds like a loop.
import { type Buf, type Rng } from '../dsp.ts';
import { def, LOOP } from '../def.ts';
import {
  ad, between, brown, bubbles, burst, chirp, creak, drop, filter, glass, hump, knock, mix, n, pink, scale, scatter, shape, SR,
  stereoLoop, stickSlip, sweep, swells, thump, tone, white,
} from '../kit.ts';
import { TAU } from '../dsp.ts';
import { cicada, frogPeep, songPhrase } from './life.ts';

const L = 8, XF = 0.8;
/** A region or weather bed: an 8 s stereo loop. */
const bed = (ch: (c: number, N: number) => Buf, to = 0.6): Buf[] => stereoLoop(L, XF, ch, to);
const secs = (N: number): number => N / SR;

/** Broadband water noise: the body of the sea, surf and falls. */
function waterNoise(r: Rng, N: number, lo: number, hi: number, wB = 0.9, wP = 0.55): Buf {
  const b = filter(brown(N, r), 'lp', lo), p = filter(pink(N, r), 'lp', hi), x = new Float32Array(N);
  for (let i = 0; i < N; i++) x[i] = b[i] * wB + p[i] * wP;
  return x;
}

/** Waves breaking: a swelling roar with a fizz of foam after each crest. */
function breakers(into: Buf, r: Rng, every: number, g: number, bright = 1): void {
  for (let at = between(r, 0, every); at < secs(into.length) - 0.5; at += every * between(r, 0.7, 1.3)) {
    const s = Math.min(5, secs(into.length) - at);
    mix(into, shape(sweep(pink(n(s), r), 'lp', (t) => 350 + 3200 * bright * Math.exp(-t * 4), 0.7), (t) => ad(t, 0.22, 1.3)), at, g);
    mix(into, shape(filter(white(n(s), r), 'hp', 2400), (t) => 0.25 * bright * ad(t - 0.2, 0.5, 1.8)), at, g);
  }
}

/** Small waves lapping at a hull or a bank. */
function laps(into: Buf, r: Rng, perSecond: number, g: number, cutoff = 700): void {
  scatter(r, 0, secs(into.length) - 0.4, perSecond, (at) => {
    mix(into, shape(filter(brown(n(0.4), r), 'lp', cutoff), (t) => ad(t, 0.01, 0.08)), at, g * between(r, 0.4, 1));
    mix(into, burst(r, 0.2, 'bp', between(r, 1200, 2200), 0.8, 0.008, 0.04), at, g * 0.15);
  });
}

/** Drops falling into still water. */
function drips(into: Buf, r: Rng, perSecond: number, g: number, lo = 900, hi = 2200): void {
  scatter(r, 0, secs(into.length) - 0.3, perSecond, (at) => mix(into, drop(r, between(r, lo, hi)), at, g * between(r, 0.3, 1)));
}

/** Rain on the sea: a hiss and a scatter of tiny impacts. */
function rainOn(into: Buf, r: Rng, density: number, g: number): void {
  const N = into.length;
  mix(into, scale(filter(pink(N, r), 'hp', 1500), 0.35), 0, g);
  scatter(r, 0, secs(N) - 0.01, density, (at) => mix(into, burst(r, 0.006, 'bp', between(r, 2000, 7000), 1.5, 0.0002, 0.0012), at, g * r() * r() * 0.6));
}

/** Wind: bandpassed pink noise breathing in gusts. */
function windOf(r: Rng, N: number, f: number, q: number, lo: number, hi: number): Buf {
  const x = filter(filter(pink(N, r), 'bp', f, q), 'lp', 2600), g = swells(r, L, 3, lo, hi);
  return shape(x, g);
}

/** Wind singing over an edge: narrow whistles that drift in pitch and swell with the gusts. */
function whistles(into: Buf, r: Rng, freqs: readonly number[], g: number): void {
  const N = into.length, span = secs(N);
  freqs.forEach((f0, j) => {
    const ph = r() * TAU, dr = between(r, 0.03, 0.08), sw = swells(r, L, 2, 0, 1);
    const w = sweep(white(N, r), 'bp', (u) => f0 * (1 + dr * Math.sin((TAU * u * span * (j + 1)) / L + ph)), 40);
    mix(into, shape(w, (t) => Math.pow(Math.max(0, sw(t)), 2)), 0, g / (1 + j * 0.3));
  });
}

// ---------------------------------------------------------------- shared beds

const sea = (r: Rng): Buf[] => bed((c, N) => {
  const b = filter(brown(N, r), 'lp', 480), p = filter(pink(N, r), 'lp', 1300), h = filter(white(N, r), 'hp', 3800), x = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR, sw = 0.55 + 0.45 * Math.sin((TAU * t) / 4 + c * 1.1), fz = 0.5 + 0.5 * Math.sin((TAU * t * 3) / 8 + c * 2);
    x[i] = b[i] * 0.9 + p[i] * 0.55 * sw * sw + h[i] * 0.05 * fz * sw;
  }
  return x;
});

const swell = (r: Rng): Buf[] => bed((c, N) => shape(filter(brown(N, r), 'lp', 110), (t) => 0.6 + 0.4 * Math.sin((TAU * t * 2) / L + c * 0.7)));

/** The hull moving through water: a rushing hiss with bubbles under the bow. */
const bowWash = (r: Rng): Buf[] => bed((c, N) => {
  const x = shape(filter(pink(N, r), 'bp', 900 + c * 150, 0.6), swells(r, L, 3, 0.5, 1));
  mix(x, shape(filter(white(N, r), 'hp', 3200), swells(r, L, 2, 0.05, 0.2)));
  bubbles(x, r, 0, secs(N) - 0.2, 30, 0.08, 400, 1800);
  return x;
});

const wind = (r: Rng): Buf[] => bed((_c, N) => windOf(r, N, 520, 0.45, 0.4, 1));

const rigging = (r: Rng): Buf[] => bed((_c, N) => {
  const x = new Float32Array(N);
  whistles(x, r, [620, 905, 1340], 1);
  return x;
}, 0.5);

const surf = (r: Rng): Buf[] => bed((_c, N) => {
  const x = scale(filter(brown(N, r), 'lp', 300), 0.25);
  breakers(x, r, 3.6, 1);
  return x;
}, 0.7);

/** Insects ashore at night. */
const night = (r: Rng): Buf[] => bed((c, N) => {
  const x = new Float32Array(N), f = between(r, 4200, 4700), per = c ? 10 : 9, ch = tone(n(0.02), () => f, (t) => hump(t / 0.02));
  for (let k = 0; k < per * 2.1; k++) for (let p = 0; p < 3; p++) mix(x, ch, (k * 4) / per + c * 0.13 + p * 0.033, 0.5);
  return filter(x, 'hp', 2000);
}, 0.35);

// ---------------------------------------------------------------- weather beds

const rain = (r: Rng): Buf[] => bed((_c, N) => {
  const x = new Float32Array(N);
  rainOn(x, r, 700, 1);
  return x;
}, 0.55);

const rainHeavy = (r: Rng): Buf[] => bed((_c, N) => {
  const x = new Float32Array(N);
  rainOn(x, r, 1600, 1);
  mix(x, shape(filter(pink(N, r), 'lp', 700), swells(r, L, 3, 0.3, 0.7)));
  return x;
}, 0.65);

/** Fog: damp, hushed air, the sea gone quiet and close. */
const fog = (r: Rng): Buf[] => bed((_c, N) => {
  const x = shape(filter(brown(N, r), 'lp', 160), swells(r, L, 2, 0.5, 1));
  mix(x, shape(filter(pink(N, r), 'bp', 400, 0.6), swells(r, L, 2, 0.05, 0.15)));
  drips(x, r, 0.6, 0.15, 700, 1500);
  return x;
}, 0.4);

/** Snow: a soft hiss of flakes and a thin, cold wind. */
const snow = (r: Rng): Buf[] => bed((_c, N) => {
  const x = shape(filter(white(N, r), 'hp', 5000), swells(r, L, 3, 0.15, 0.3));
  mix(x, windOf(r, N, 900, 1.2, 0.1, 0.5));
  scatter(r, 0, secs(N) - 0.1, 25, (at) => mix(x, glass(r, between(r, 5000, 9000), 0.02, 0.06), at, 0.03));
  return x;
}, 0.35);

/** Ash: a dry hiss with embers ticking and the far mountain grumbling. */
const ash = (r: Rng): Buf[] => bed((_c, N) => {
  const x = shape(filter(white(N, r), 'bp', 3000, 0.5), swells(r, L, 3, 0.1, 0.25));
  scatter(r, 0, secs(N) - 0.05, 18, (at) => mix(x, burst(r, 0.008, 'hp', between(r, 1800, 4500), 0.8, 0.0002, between(r, 0.0005, 0.002)), at, between(r, 0.2, 0.8)));
  mix(x, shape(filter(brown(N, r), 'lp', 70), swells(r, L, 2, 0.4, 1)), 0, 1.2);
  return x;
}, 0.45);

/** Calm: the wind gone, the water glassy, only small laps and drips. */
const calm = (r: Rng): Buf[] => bed((_c, N) => {
  const x = scale(filter(brown(N, r), 'lp', 200), 0.3);
  laps(x, r, 1.2, 0.5, 500);
  drips(x, r, 0.3, 0.1);
  return x;
}, 0.3);

const stormWall = (r: Rng): Buf[] => bed((c, N) => {
  const b = filter(brown(N, r), 'lp', 240), p = filter(pink(N, r), 'lp', 1100), ph = r() * TAU, span = secs(N);
  const howl = sweep(white(N, r), 'bp', (u) => 380 * (1 + 0.25 * Math.sin((TAU * u * span * 2) / L + ph)), 5), x = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const sg = 0.6 + 0.4 * Math.sin((TAU * (i / SR) * 3) / L + ph + c);
    x[i] = b[i] * 1.1 + p[i] * 0.6 * sg + howl[i] * 0.5 * sg;
  }
  return x;
}, 0.75);

/** High over the planet in the Gale: a roaring rush of air with a flutter in it. */
const galeWind = (r: Rng): Buf[] => bed((c, N) => {
  const x = shape(filter(pink(N, r), 'bp', 700 + c * 100, 0.4), swells(r, L, 3, 0.6, 1));
  mix(x, shape(filter(brown(N, r), 'lp', 200), swells(r, L, 2, 0.5, 1)));
  const flutter = filter(white(N, r), 'bp', 1600, 2);
  mix(x, shape(flutter, (t) => 0.2 * (0.5 + 0.5 * Math.sin(TAU * 13 * t)) * (0.5 + 0.5 * Math.sin((TAU * t * 3) / L))));
  return x;
}, 0.7);

// ---------------------------------------------------------------- the 16 regions

/** The Ice Crown: creaking ice, wind across the snow, floes knocking and a far boom. */
const iceCrown = (r: Rng): Buf[] => bed((_c, N) => {
  const x = shape(filter(white(N, r), 'hp', 3500), swells(r, L, 3, 0.1, 0.35)); // snow blowing
  mix(x, windOf(r, N, 1100, 1.4, 0.2, 0.9));
  scatter(r, 0.2, secs(N) - 1.5, 0.5, (at) => mix(x, stickSlip(r, between(r, 0.8, 1.4), 30, 70, [700, 1300, 2100, 3000], 0.03), at, 0.2)); // ice creaking
  scatter(r, 0, secs(N) - 0.3, 2, (at) => mix(x, knock(r, between(r, 500, 900), 0.04, 0.3), at, between(r, 0.1, 0.3))); // floes knocking
  mix(x, shape(filter(brown(N, r), 'lp', 80), (t) => 0.6 * ad(t - between(r, 1, 6), 0.05, 1.2)), 0, 1); // a far floe booming
  return x;
}, 0.55);

/** The Fjords: the roar of the falls, thrown back off the valley walls. */
const fjords = (r: Rng): Buf[] => bed((_c, N) => {
  const roar = waterNoise(r, N, 300, 2400, 1, 0.8);
  shape(roar, swells(r, L, 3, 0.75, 1));
  const x = roar.slice();
  for (const [d, g, f] of [[0.29, 0.45, 1200], [0.53, 0.3, 900], [0.88, 0.2, 700]] as const) mix(x, filter(roar.slice(), 'lp', f), d, g);
  return x;
}, 0.7);

/** Mistwood: near silence, slow drips, the fog muffling everything. */
const mistwood = (r: Rng): Buf[] => bed((_c, N) => {
  const x = shape(filter(brown(N, r), 'lp', 140), swells(r, L, 2, 0.15, 0.3));
  mix(x, shape(filter(pink(N, r), 'bp', 300, 0.8), swells(r, L, 2, 0.02, 0.06)));
  drips(x, r, 0.9, 0.35, 700, 1500);
  filter(x, 'lp', 2500);
  return x;
}, 0.3);

/** The Spires: wind whistling between the towers, foam ringing their feet. */
const spires = (r: Rng): Buf[] => bed((c, N) => {
  const x = windOf(r, N, 700, 0.8, 0.2, 0.7);
  whistles(x, r, c ? [760, 1130, 1580] : [690, 1040, 1720], 0.9);
  mix(x, scale(filter(brown(N, r), 'lp', 300), 0.15));
  breakers(x, r, 4.5, 0.25, 0.7);
  return x;
}, 0.55);

/** The Narrows: a still slot of air humming between walls, every lap coming back twice. */
const narrows = (r: Rng): Buf[] => bed((_c, N) => {
  const hum = filter(filter(brown(N, r), 'lp', 200), 'peak', 95, 6, 12);
  const x = shape(hum, swells(r, L, 2, 0.25, 0.45));
  const wet = new Float32Array(N);
  laps(wet, r, 1.3, 0.6, 800);
  mix(x, wet);
  mix(x, filter(wet.slice(), 'lp', 1600), 0.21, 0.45);
  mix(x, filter(wet.slice(), 'lp', 1000), 0.43, 0.25);
  mix(x, shape(filter(pink(N, r), 'bp', 2400, 1.2), swells(r, L, 2, 0.01, 0.05))); // the strip of sky above
  return x;
}, 0.4);

/** The Basalt Stacks: surf booming in the sea caves, wind combing the turf. */
const basaltStacks = (r: Rng): Buf[] => bed((_c, N) => {
  const x = waterNoise(r, N, 260, 1100, 0.5, 0.25);
  breakers(x, r, 3.2, 0.7, 0.9);
  for (let at = between(r, 0.3, 1.5); at < secs(N) - 1.5; at += between(r, 2.2, 3.4)) {
    mix(x, thump(1.5, between(r, 55, 70), 30, 0.35), at, 0.9); // the cave boom
    mix(x, filter(filter(burst(r, 1.2, 'lp', 400, 0.7, 0.01, 0.25), 'peak', 110, 4, 9), 'peak', 165, 4, 6), at, 0.6);
  }
  mix(x, shape(filter(pink(N, r), 'bp', 2200, 0.7), swells(r, L, 3, 0.1, 0.35))); // grass hiss
  return x;
}, 0.7);

/** The Kelp Shallows: soft water, blades brushing the hull, seabirds far off. */
const kelpShallows = (r: Rng): Buf[] => bed((_c, N) => {
  const x = scale(filter(brown(N, r), 'lp', 350), 0.35);
  laps(x, r, 1.6, 0.45, 600);
  scatter(r, 0, secs(N) - 0.7, 0.9, (at) => {
    const s = between(r, 0.3, 0.6), sw = pink(n(s), r);
    sweep(sw, 'bp', (u) => 500 + 600 * hump(u), 1.6);
    mix(x, shape(sw, (t) => hump(t / s, 1.2)), at, 0.2);
  });
  bubbles(x, r, 0, secs(N) - 0.2, 4, 0.05, 500, 1500);
  scatter(r, 0.5, secs(N) - 0.5, 0.4, (at) => {
    for (let k = 0; k < 3; k++) mix(x, chirp(0.07, (u) => 3000 + 600 * hump(u)), at + k * 0.12, 0.05); // a tern, far
  });
  return x;
}, 0.4);

/** Blossom Run: the river rushing, petals on the wind, birdsong. */
const blossomRun = (r: Rng): Buf[] => bed((_c, N) => {
  const river = shape(filter(pink(N, r), 'bp', 1100, 0.5), swells(r, L, 3, 0.5, 0.8));
  bubbles(river, r, 0, secs(N) - 0.2, 60, 0.1, 600, 2600); // babbling
  const x = river;
  mix(x, shape(filter(white(N, r), 'hp', 4500), swells(r, L, 3, 0.02, 0.12))); // petals and leaves
  scatter(r, 0.3, secs(N) - 2, 0.45, (at) => mix(x, songPhrase(r, Math.floor(r() * 5)), at, between(r, 0.1, 0.25)));
  return x;
}, 0.5);

/** The Glass Sea: almost nothing. A breath of air, the faintest lap. */
const glassSea = (r: Rng): Buf[] => bed((_c, N) => {
  const x = scale(filter(brown(N, r), 'lp', 120), 0.25);
  mix(x, shape(filter(pink(N, r), 'bp', 900, 0.5), swells(r, L, 2, 0.01, 0.04)));
  laps(x, r, 0.25, 0.15, 400);
  return x;
}, 0.18);

/** The Jade Shoals: gentle surf on the bars, sand hissing over the dunes. */
const jadeShoals = (r: Rng): Buf[] => bed((_c, N) => {
  const x = scale(filter(brown(N, r), 'lp', 260), 0.2);
  breakers(x, r, 2.8, 0.35, 0.6);
  const sand = new Float32Array(N), sw = swells(r, L, 3, 0, 1);
  scatter(r, 0, secs(N) - 0.01, 900, (at) => { sand[Math.floor(at * SR)] += (r() - 0.5) * Math.max(0, sw(at)) ** 2; });
  mix(x, filter(sand, 'hp', 2500), 0, 1.2);
  mix(x, shape(filter(pink(N, r), 'bp', 1800, 0.8), (t) => 0.2 * Math.max(0, sw(t))));
  return x;
}, 0.45);

/** The Coral Atolls: surf roaring on the reef edge to one side, calm lapping inside, palm fronds. */
const coralAtolls = (r: Rng): Buf[] => bed((c, N) => {
  const reef = waterNoise(r, N, 220, 900, 0.7, 0.5);
  shape(reef, swells(r, L, 3, 0.5, 1));
  breakers(reef, r, 2.5, 0.5, 0.5);
  const x = scale(reef, c ? 0.9 : 0.45); // the reef lies off one side
  laps(x, r, 1, 0.3, 600);
  scatter(r, 0.2, secs(N) - 1, 0.5, (at) => {
    const s = between(r, 0.5, 1), fr = filter(white(n(s), r), 'bp', between(r, 2500, 4000), 0.8);
    mix(x, shape(fr, (t) => hump(t / s, 1) * (0.5 + 0.5 * Math.sin(TAU * 18 * t))), at, 0.12);
  });
  return x;
}, 0.55);

/** The Spice Isles: insects singing, warm rain pattering on leaves, birds deep in the jungle. */
const spiceIsles = (r: Rng): Buf[] => bed((c, N) => {
  const x = new Float32Array(N);
  mix(x, cicada(r, N, c ? 4700 : 5200), 0, 0.35);
  rainOn(x, r, 250, 0.3);
  scatter(r, 0, secs(N) - 0.5, 1.5, (at) => mix(x, chirp(0.08, (u) => 3600 + 800 * Math.sin(TAU * 3 * u)), at, 0.06)); // crickets
  scatter(r, 0.3, secs(N) - 1.5, 0.3, (at) => mix(x, chirp(0.5, (u) => 900 + 500 * hump(u), (u) => hump(u, 1.5), 0.4), at, 0.08)); // a far hoot
  return x;
}, 0.45);

/** The Fire Archipelago: the mountain rumbling, steam hissing, rock cracking as it cools. */
const fireArchipelago = (r: Rng): Buf[] => bed((_c, N) => {
  const x = shape(filter(brown(N, r), 'lp', 60), swells(r, L, 3, 0.6, 1.2));
  mix(x, shape(filter(white(N, r), 'bp', 4500, 0.7), swells(r, L, 2, 0.02, 0.25))); // steam
  scatter(r, 0.1, secs(N) - 0.4, 0.8, (at) => mix(x, knock(r, between(r, 900, 2000), 0.015, 0.1), at, between(r, 0.15, 0.4))); // cracking rock
  scatter(r, 0.2, secs(N) - 0.5, 0.5, (at) => mix(x, tone(n(0.25), (t) => between(r, 70, 110) * (1 + t * 2), (t) => ad(t, 0.01, 0.06)), at, 0.25)); // lava blooping
  return x;
}, 0.65);

/** The Weeping Isle: falling water at every distance, far roar to near spatter. */
const weepingIsle = (r: Rng): Buf[] => bed((_c, N) => {
  const far = shape(filter(pink(N, r), 'lp', 600), swells(r, L, 3, 0.5, 0.9));
  const mid = shape(filter(pink(N, r), 'bp', 1500, 0.7), swells(r, L, 3, 0.2, 0.6));
  const x = far;
  mix(x, mid);
  scatter(r, 0, secs(N) - 0.01, 500, (at) => mix(x, burst(r, 0.008, 'bp', between(r, 1500, 6000), 1.2, 0.0003, 0.002), at, r() * 0.25)); // near spatter
  drips(x, r, 1.2, 0.15);
  return x;
}, 0.6);

/** The Mangrove Labyrinth: frogs, drips, roots creaking, a close, low silence. */
const mangroveLabyrinth = (r: Rng): Buf[] => bed((c, N) => {
  const x = scale(filter(brown(N, r), 'lp', 150), 0.25);
  scatter(r, 0.1, secs(N) - 0.5, 2.2, (at) => mix(x, frogPeep(r, c ? 2900 : 3200), at, between(r, 0.08, 0.2)));
  drips(x, r, 0.8, 0.25, 800, 1800);
  scatter(r, 0.5, secs(N) - 1.6, 0.2, (at) => mix(x, creak(r, between(r, 0.5, 0.7)), at, 0.15));
  filter(x, 'lp', 5000);
  return x;
}, 0.35);

/** The Maelstrom: a constant roar of rushing water, swirling. The mixer raises it toward the Eye. */
const maelstrom = (r: Rng): Buf[] => bed((c, N) => {
  const b = filter(brown(N, r), 'lp', 150), span = secs(N), x = new Float32Array(N);
  const w = sweep(pink(N, r), 'bp', (u) => 300 + 600 * (0.5 + 0.5 * Math.sin((TAU * u * span * 2) / L + c * Math.PI)), 1.2);
  for (let i = 0; i < N; i++) x[i] = b[i] * (0.8 + 0.2 * Math.sin((TAU * (i / SR) * 4) / L)) + w[i] * 0.7;
  breakers(x, r, 2.4, 0.3, 0.8);
  return x;
}, 0.8);

export const BED_SOUNDS = {
  sea: def(sea, 1, 'amb', 10, 1, 1, LOOP),
  swell: def(swell, 1, 'amb', 10, 1, 1, LOOP),
  bowWash: def(bowWash, 1, 'amb', 10, 1, 1, LOOP),
  wind: def(wind, 1, 'amb', 10, 1, 1, LOOP),
  rigging: def(rigging, 1, 'amb', 10, 1, 1, LOOP),
  surf: def(surf, 1, 'amb', 10, 1, 1, LOOP),
  night: def(night, 1, 'amb', 10, 1, 1, LOOP),
  rain: def(rain, 1, 'amb', 10, 1, 1, LOOP),
  rainHeavy: def(rainHeavy, 1, 'amb', 10, 1, 1, LOOP),
  fog: def(fog, 1, 'amb', 10, 1, 1, LOOP),
  snow: def(snow, 1, 'amb', 10, 1, 1, LOOP),
  ash: def(ash, 1, 'amb', 10, 1, 1, LOOP),
  calm: def(calm, 1, 'amb', 10, 1, 1, LOOP),
  stormWall: def(stormWall, 1, 'amb', 10, 1, 1, LOOP),
  galeWind: def(galeWind, 1, 'amb', 10, 1, 1, LOOP),
  bedIceCrown: def(iceCrown, 1, 'amb', 10, 1, 1, LOOP),
  bedFjords: def(fjords, 1, 'amb', 10, 1, 1, LOOP),
  bedMistwood: def(mistwood, 1, 'amb', 10, 1, 1, LOOP),
  bedSpires: def(spires, 1, 'amb', 10, 1, 1, LOOP),
  bedNarrows: def(narrows, 1, 'amb', 10, 1, 1, LOOP),
  bedBasaltStacks: def(basaltStacks, 1, 'amb', 10, 1, 1, LOOP),
  bedKelpShallows: def(kelpShallows, 1, 'amb', 10, 1, 1, LOOP),
  bedBlossomRun: def(blossomRun, 1, 'amb', 10, 1, 1, LOOP),
  bedGlassSea: def(glassSea, 1, 'amb', 10, 1, 1, LOOP),
  bedJadeShoals: def(jadeShoals, 1, 'amb', 10, 1, 1, LOOP),
  bedCoralAtolls: def(coralAtolls, 1, 'amb', 10, 1, 1, LOOP),
  bedSpiceIsles: def(spiceIsles, 1, 'amb', 10, 1, 1, LOOP),
  bedFireArchipelago: def(fireArchipelago, 1, 'amb', 10, 1, 1, LOOP),
  bedWeepingIsle: def(weepingIsle, 1, 'amb', 10, 1, 1, LOOP),
  bedMangroveLabyrinth: def(mangroveLabyrinth, 1, 'amb', 10, 1, 1, LOOP),
  bedMaelstrom: def(maelstrom, 1, 'amb', 10, 1, 1, LOOP),
};
