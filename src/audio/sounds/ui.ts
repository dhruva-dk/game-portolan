// The interface: parchment, wood and glass under the thumb, and the hit markers. Then the ceremony stingers for the
// big moments. These are sound-design hits (a riser, an impact and a shimmering tail), never a tune: there is no
// music anywhere in Portolan.
import { softclip, type Buf, type Rng } from '../dsp.ts';
import { def } from '../def.ts';
import {
  ad, between, bowl, brown, burst, filter, glass, hump, knock, metal, mix, n, normalize, normAll, pair, pink, riser, scatter,
  shape, shards, sweep, thump, white, whoosh,
} from '../kit.ts';

function tap(r: Rng): Buf {
  const x = new Float32Array(n(0.15));
  mix(x, knock(r, between(r, 1800, 2300), 0.018, 0.15), 0, 1);
  mix(x, burst(r, 0.01, 'hp', 5000, 0.7, 0.0002, 0.001), 0, 0.3);
  return normalize(x, 0.5);
}

function back(r: Rng): Buf {
  const x = new Float32Array(n(0.35));
  mix(x, shape(sweep(white(n(0.2), r), 'bp', (u) => 3800 - 2200 * u, 1), (t) => hump(t / 0.2, 0.8)), 0, 0.35);
  mix(x, knock(r, between(r, 900, 1100), 0.025, 0.15), 0.12, 1);
  return normalize(x, 0.45);
}

/** A page turned. */
function tab(r: Rng): Buf {
  const N = n(0.4), x = filter(white(N, r), 'bp', between(r, 2400, 3400), 0.6);
  let w = 0.5;
  for (let i = 0; i < N; i++) {
    if ((i & 63) === 0) w = Math.min(1, Math.max(0.05, w + (r() - 0.5) * 0.6));
    x[i] *= w;
  }
  shape(x, (t) => hump(t / 0.3, 0.8));
  mix(x, burst(r, 0.15, 'lp', 320, 0.7, 0.01, 0.04), 0.22, 0.5);
  return normalize(x, 0.4);
}

/** A slip of parchment sliding in with a small glint. */
function toast(r: Rng): Buf {
  const x = new Float32Array(n(0.8));
  mix(x, shape(filter(white(n(0.3), r), 'bp', 2600, 0.7), (t) => hump(t / 0.3, 1.2)), 0, 0.35);
  mix(x, glass(r, between(r, 2200, 2500), 0.15, 0.6), 0.18, 0.4);
  return normalize(x, 0.4);
}

/** A sheet unfurled, landing with a soft thump. */
function popup(r: Rng): Buf {
  const x = new Float32Array(n(0.7));
  scatter(r, 0, 0.22, 90, (at) => mix(x, burst(r, 0.01, 'bp', between(r, 2000, 5000), 1.5, 0.0005, 0.003), at, between(r, 0.2, 0.6)));
  mix(x, thump(0.3, 150, 80, 0.06), 0.22, 0.7);
  mix(x, burst(r, 0.2, 'lp', 400, 0.7, 0.005, 0.05), 0.22, 0.5);
  return normalize(x, 0.45);
}

function confirm(r: Rng): Buf {
  const x = new Float32Array(n(0.6));
  mix(x, knock(r, between(r, 700, 800), 0.04, 0.2), 0, 1);
  mix(x, thump(0.2, 160, 90, 0.04), 0, 0.5);
  mix(x, glass(r, between(r, 1900, 2100), 0.15, 0.5), 0.04, 0.35);
  return normalize(x, 0.5);
}

function deny(r: Rng): Buf {
  const x = new Float32Array(n(0.35));
  mix(x, knock(r, between(r, 260, 300), 0.03, 0.15), 0, 1);
  mix(x, knock(r, between(r, 240, 280), 0.03, 0.15), 0.1, 0.8);
  return normalize(x, 0.45);
}

function toggle(r: Rng): Buf {
  const x = new Float32Array(n(0.12));
  mix(x, metal(r, between(r, 2000, 2400), 0.008, 0.05), 0, 0.6);
  mix(x, knock(r, between(r, 1200, 1400), 0.01, 0.06), 0.002, 0.8);
  return normalize(x, 0.4);
}

/** A tiny glint for numbers counting up and sliders moving. Play it with a rising rate. */
function tick(r: Rng): Buf {
  const x = new Float32Array(n(0.12));
  mix(x, metal(r, between(r, 3000, 3300), 0.02, 0.1), 0, 1);
  return normalize(x, 0.3);
}

/** A reward flying into its counter and landing. */
function reward(r: Rng): Buf {
  const x = new Float32Array(n(1));
  mix(x, whoosh(r, 0.45, 700, 3000, 1.6, 1.4), 0, 0.5);
  mix(x, metal(r, between(r, 2600, 3000), 0.12, 0.5), 0.4, 0.6);
  mix(x, glass(r, between(r, 3800, 4200), 0.15, 0.5), 0.41, 0.3);
  mix(x, thump(0.2, 200, 120, 0.04), 0.4, 0.4);
  return normalize(x, 0.5);
}

/** Putting on a cosmetic: canvas snapping taut and a knock. */
function equip(r: Rng): Buf {
  const x = new Float32Array(n(0.5));
  mix(x, burst(r, 0.12, 'bp', between(r, 700, 1000), 1.1, 0.002, 0.03), 0, 0.8);
  mix(x, thump(0.12, 150, 90, 0.03), 0, 0.3);
  mix(x, knock(r, between(r, 800, 950), 0.03, 0.2), 0.08, 0.6);
  return normalize(x, 0.5);
}

// ---------------------------------------------------------------- hit markers (your shot landed)

function hitMarker(r: Rng): Buf {
  const x = new Float32Array(n(0.15));
  mix(x, knock(r, between(r, 1350, 1500), 0.02, 0.12), 0, 1);
  mix(x, burst(r, 0.01, 'hp', 4000, 0.7, 0.0001, 0.0015), 0, 0.5);
  return normalize(x, 0.55);
}

function hitMarkerShield(r: Rng): Buf {
  const x = new Float32Array(n(0.35));
  mix(x, glass(r, between(r, 2500, 2700), 0.08, 0.35), 0, 1);
  mix(x, burst(r, 0.01, 'hp', 5000, 0.7, 0.0001, 0.0015), 0, 0.4);
  return normalize(x, 0.5);
}

function hitMarkerCrit(r: Rng): Buf {
  const x = new Float32Array(n(0.5));
  mix(x, knock(r, between(r, 1500, 1650), 0.02, 0.12), 0, 0.9);
  mix(x, metal(r, between(r, 3100, 3300), 0.1, 0.5), 0.03, 0.7);
  mix(x, glass(r, between(r, 4700, 5000), 0.08, 0.35), 0.06, 0.4);
  return normalize(x, 0.6);
}

// ---------------------------------------------------------------- ceremonies

/** A rising sweep that cuts off into an impact, then a shimmering tail. The shape of every stinger. */
function sting(r: Rng, o: { len: number; rise: number; boom: number; low: number; bright: number; sparkle: number; ring: number; drive: number }): Buf[] {
  const out = pair(o.len), hit = o.rise;
  const up = o.rise > 0 ? riser(r, o.rise, 300, 6000) : null;
  out.forEach((x, c) => {
    if (up) mix(x, up, c * 0.004, 0.45);
    mix(x, burst(r, 0.04, 'hp', 2000, 0.7, 0.0002, 0.006), hit, 0.6 * o.bright);
    mix(x, thump(Math.min(2.5, o.len - hit), o.low * 2.2, o.low, 0.35 * o.boom), hit, o.boom);
    mix(x, shape(filter(brown(n(o.len - hit), r), 'lp', 200), (t) => ad(t, 0.005, 0.5 * o.boom)), hit, 0.6 * o.boom);
    if (o.ring > 0) mix(x, bowl(r, o.low * 4 * (1 + c * 0.004), o.ring, o.len - hit), hit + 0.005, 0.35);
    mix(x, glass(r, between(r, 1800, 2200) * (1 + c * 0.005), 0.4 + 0.3 * o.bright, Math.min(2, o.len - hit)), hit + 0.01, 0.3 * o.bright);
    shards(x, r, hit + 0.02, o.len - 0.3, o.sparkle, 0.25, 3500, 10000);
    mix(x, shape(sweep(pink(n(o.len - hit), r), 'bp', (u) => 2000 + 5000 * u, 1.5), (t) => ad(t, 0.3, 0.6) * 0.5), hit, 0.25 * o.bright);
  });
  normAll(out, 1);
  out.forEach((x) => softclip(x, o.drive));
  return normAll(out, 0.9);
}

/** The win: a long rise, a double impact, a wash of sparkle and distant guns rolling like thunder. */
function stingVictory(r: Rng): Buf[] {
  const out = sting(r, { len: 5.5, rise: 1.3, boom: 1.2, low: 42, bright: 1, sparkle: 60, ring: 1.6, drive: 1.5 });
  const second = thump(2, 90, 34, 0.5);
  out.forEach((x, c) => {
    mix(x, second, 1.62, 0.6);
    for (let k = 0; k < 4; k++) mix(x, shape(filter(brown(n(1.6), r), 'lp', 220), (t) => ad(t, 0.02, 0.4)), 2.2 + k * 0.55 + c * 0.04, 0.35 / (1 + k * 0.3));
  });
  return normAll(out, 0.92);
}

export const UI_SOUNDS = {
  tap: def(tap, 4, 'ui', 10, 0.6, 3),
  back: def(back, 2, 'ui', 10, 0.6, 2),
  tab: def(tab, 3, 'ui', 10, 0.55, 2),
  toast: def(toast, 2, 'ui', 9, 0.55, 2),
  popup: def(popup, 2, 'ui', 9, 0.6, 2),
  confirm: def(confirm, 2, 'ui', 10, 0.6, 2),
  deny: def(deny, 1, 'ui', 10, 0.55, 2),
  toggle: def(toggle, 2, 'ui', 10, 0.5, 2),
  tick: def(tick, 3, 'ui', 6, 0.4, 4, { jitter: 0 }),
  reward: def(reward, 2, 'ui', 9, 0.6, 3),
  equip: def(equip, 2, 'ui', 10, 0.55, 2),
  hitMarker: def(hitMarker, 3, 'ui', 9, 0.6, 4, { jitter: 0.03 }),
  hitMarkerShield: def(hitMarkerShield, 3, 'ui', 9, 0.55, 4, { jitter: 0.03 }),
  hitMarkerCrit: def(hitMarkerCrit, 2, 'ui', 10, 0.65, 3, { jitter: 0.02 }),
  stingVictory: def(stingVictory, 1, 'ui', 10, 0.9, 1, { jitter: 0 }),
  stingLevelUp: def((r) => sting(r, { len: 2.8, rise: 0.6, boom: 0.6, low: 70, bright: 1, sparkle: 45, ring: 0.6, drive: 1.3 }), 1, 'ui', 10, 0.8, 1, { jitter: 0 }),
  stingRankUp: def((r) => sting(r, { len: 3.8, rise: 0.9, boom: 1.1, low: 45, bright: 0.8, sparkle: 50, ring: 1.3, drive: 1.6 }), 1, 'ui', 10, 0.85, 1, { jitter: 0 }),
  stingAbilityUnlock: def((r) => sting(r, { len: 3, rise: 0.75, boom: 0.4, low: 90, bright: 1.2, sparkle: 70, ring: 0.8, drive: 1.2 }), 1, 'ui', 10, 0.8, 1, { jitter: 0 }),
  stingShieldBreak: def((r) => sting(r, { len: 2, rise: 0, boom: 1.3, low: 32, bright: 1.3, sparkle: 90, ring: 0, drive: 2 }), 1, 'ui', 10, 0.75, 1, { jitter: 0 }),
  stingKill: def((r) => sting(r, { len: 1.6, rise: 0, boom: 0.7, low: 60, bright: 1, sparkle: 30, ring: 0.5, drive: 1.6 }), 2, 'ui', 10, 0.7, 2),
  stingDefeat: def((r) => sting(r, { len: 3.5, rise: 0, boom: 1.2, low: 30, bright: 0.2, sparkle: 4, ring: 1.4, drive: 1.3 }), 1, 'ui', 10, 0.8, 1, { jitter: 0 }),
};
