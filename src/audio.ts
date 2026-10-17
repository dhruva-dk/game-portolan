// Synthesized soundscape: swell, surf, wind in the rigging, rain, rolling thunder, creaking timbers,
// cracking canvas, the rush of a closing loop, the groan of a sinking, buoy bells and the respawn surge.
// No samples: every sound is noise and resonators rendered into buffers while the game loads. The beds
// are one fixed graph whose parameters glide every frame; one-shots borrow voices from a small pool.
import * as THREE from 'three';
import { R } from './sim.ts';
import { swell } from './ocean.ts';
import type { ShipPose } from './ships.ts';
import type { Ctx, Frame } from './main.ts';

const SR = 48000; // buffers and context share this rate; the browser resamples to the device
const SOUND_SPEED = 49; // world units per second (343 m/s at 7 m per unit)
const VOICES = 24;
const TAU = 2 * Math.PI;
const { clamp, smoothstep, lerp } = THREE.MathUtils;
const rnd = (lo: number, hi: number) => lo + (hi - lo) * Math.random();
const noise = () => Math.random() * 2 - 1;
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const lp = (frequency: number, Q = 0.7): BiquadFilterOptions => ({ type: 'lowpass', frequency, Q });
const hp = (frequency: number): BiquadFilterOptions => ({ type: 'highpass', frequency });

// ---------------------------------------------------------------------------------------------
// Offline synthesis, once, while the game loads.

function makeBuffer(seconds: number, channels: number): AudioBuffer {
  return new AudioBuffer({ length: Math.round(seconds * SR), numberOfChannels: channels, sampleRate: SR });
}

function mono(d: Float32Array): AudioBuffer {
  const b = makeBuffer(d.length / SR, 1);
  b.getChannelData(0).set(d);
  return b;
}

/** Scales the channels together to the given absolute peak and fades their last 50 ms so a one-shot never ends in
 *  a click. Returns the first channel. */
function peakTo(p: number, ...chans: Float32Array[]): Float32Array {
  let m = 1e-9;
  for (const d of chans) for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  for (const d of chans) {
    const fade = Math.min(d.length, 2400);
    for (let i = 0; i < d.length; i++) d[i] *= (p / m) * Math.min(1, (d.length - i) / fade);
  }
  return chans[0];
}

/** Kellet's pink filter over white noise. */
function pink(n: number): Float32Array {
  const d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = noise();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return d;
}

/** Leaky-integrated white noise: brown above ~150 Hz, flat below, so it rumbles without drifting. */
function brown(n: number): Float32Array {
  const d = new Float32Array(n);
  for (let i = 0, b = 0; i < n; i++) d[i] = b = (b + 0.02 * noise()) / 1.02;
  return d;
}

/** Stereo loop of independent noise per channel at a fixed RMS, its seam hidden by an equal-power crossfade. */
function noiseLoop(seconds: number, gen: (n: number) => Float32Array): AudioBuffer {
  const b = makeBuffer(seconds, 2), n = b.length, F = 4096;
  for (let c = 0; c < 2; c++) {
    const x = gen(n + F), d = b.getChannelData(c);
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    const k = 0.25 / Math.sqrt(s / x.length);
    for (let i = 0; i < n; i++) d[i] = x[i] * k;
    for (let i = 0; i < F; i++) {
      const w = (i / F) * Math.PI * 0.5;
      d[i] = (x[i] * Math.sin(w) + x[n + i] * Math.cos(w)) * k;
    }
  }
  return b;
}

/** Rings x through a two-pole resonator (an impulse comes out as a sine of amplitude `gain`) into out. */
function ring(x: Float32Array, out: Float32Array, freq: number, decay: number, gain: number): void {
  const w = (TAU * freq) / SR, r = Math.exp(-1 / (decay * SR)), a1 = 2 * r * Math.cos(w), a2 = r * r;
  const k = gain * Math.sin(w);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = a1 * y1 - a2 * y2 + x[i];
    y2 = y1;
    y1 = y;
    out[i] += y * k;
  }
}

/** Adds an exponentially decaying noise burst (time constant tau) at `at` seconds into x. */
function burst(x: Float32Array, at: number, amp: number, tau: number): void {
  const s = Math.round(at * SR), len = Math.min(x.length - s, Math.round(tau * 6 * SR));
  for (let i = 0; i < len; i++) x[s + i] += amp * Math.exp(-i / (tau * SR)) * noise();
}

/** Stick-slip friction of timber on timber: an irregular pulse train whose rate glides, ringing wooden modes. */
function creak(seconds: number, rate0: number, rate1: number, modes: readonly number[], decay: number): Float32Array {
  const n = Math.round(seconds * SR), x = new Float32Array(n), out = new Float32Array(n);
  const wobble = rnd(1, 3), phase = rnd(0, TAU);
  for (let i = 0, next = 0; i < n; i++) {
    const u = i / n, env = Math.sin(Math.PI * u ** 0.6) ** 2;
    x[i] = 0.03 * env * noise();
    if (i < next) continue;
    x[i] += env * rnd(0.3, 1);
    const rate = lerp(rate0, rate1, u) * (1 + 0.3 * Math.sin(TAU * wobble * u + phase));
    next = i + Math.max(2, (SR / rate) * rnd(0.7, 1.4));
  }
  modes.forEach((f, k) => ring(x, out, f * rnd(0.94, 1.06), decay * rnd(0.7, 1.3), 1 / (1 + 0.5 * k)));
  return peakTo(0.9, out);
}

/** Canvas slamming full: a bright crack and a few dying flaps over the low thump of the filling sail. */
function snap(): Float32Array {
  const n = Math.round(0.7 * SR), x = new Float32Array(n), out = new Float32Array(n);
  for (let k = 0, t = 0; k < 4; k++, t += rnd(0.06, 0.1)) burst(x, t, k ? 0.3 / k : 1, k ? 0.012 : 0.006);
  [480, 1100, 2300, 3900].forEach((f, k) => ring(x, out, f * rnd(0.9, 1.1), rnd(0.004, 0.01), 0.5 / (1 + 0.4 * k)));
  for (let i = 1; i < n; i++) out[i] += 0.3 * (x[i] - x[i - 1]);
  for (let i = 0; i < 0.15 * SR; i++) {
    const t = i / SR;
    out[i] += 0.8 * Math.sin(TAU * (95 * t - 120 * t * t)) * Math.exp(-t / 0.035) * Math.min(1, t / 0.003);
  }
  return peakTo(0.9, out);
}

/** Luffing canvas: a run of soft flaps that swells and dies as the sail spills its wind. */
function luff(): Float32Array {
  const len = 1.6, n = Math.round(len * SR), x = new Float32Array(n), out = new Float32Array(n);
  for (let t = rnd(0, 0.04); t < len - 0.15; t += rnd(0.06, 0.11)) {
    burst(x, t, Math.sin((Math.PI * t) / len) ** 1.5 * rnd(0.3, 1), rnd(0.008, 0.02));
  }
  [260, 620, 1300, 2600].forEach((f, k) => ring(x, out, f * rnd(0.9, 1.1), rnd(0.008, 0.02), 0.5 / (1 + 0.5 * k)));
  for (let i = 0; i < n; i++) out[i] += 0.25 * x[i];
  return peakTo(0.9, out);
}

/** A hull striking timber or rock: a splintering knock over the low hollow modes of the hull. */
function thud(): Float32Array {
  const n = Math.round(1.3 * SR), x = new Float32Array(n), out = new Float32Array(n);
  x[0] = 4;
  burst(x, 0, 1, 0.003);
  [44, 68, 103, 160, 245, 390, 610].forEach((f, k) => {
    ring(x, out, f * rnd(0.95, 1.05), 0.22 / (1 + 0.45 * k), 1 / (1 + 0.25 * k));
  });
  for (let i = 0; i < n; i++) out[i] += 0.15 * x[i];
  return peakTo(0.9, out);
}

/** Wood giving way: a volley of fibres snapping, ringing the spar. */
function splinter(): Float32Array {
  const n = Math.round(0.9 * SR), x = new Float32Array(n), out = new Float32Array(n);
  for (let t = 0, a = 1; t < 0.5; t += rnd(0.005, 0.06), a *= 0.85) burst(x, t, a * rnd(0.4, 1), rnd(0.001, 0.004));
  [180, 330, 720, 1500, 3100].forEach((f, k) => ring(x, out, f * rnd(0.9, 1.1), rnd(0.015, 0.05), 1 / (1 + 0.3 * k)));
  return peakTo(0.9, out);
}

/** Air escaping a flooding hull: 7 s of rising damped sines (Minnaert bubbles), thickest around 4 s. */
function bubbles(): Float32Array {
  const n = 7 * SR, out = new Float32Array(n);
  for (let t = 1; t < 6.8; t += -Math.log(1 - Math.random()) / 40) {
    if (Math.random() > Math.sin((Math.PI * (t - 1)) / 5.8)) continue;
    const f0 = 150 * 8 ** (Math.random() ** 1.6), tau = rnd(0.012, 0.04) * Math.sqrt(300 / f0);
    const amp = rnd(0.2, 1) * (300 / f0) ** 0.3, s = Math.round(t * SR);
    for (let i = 0, ph = 0; i < tau * 5 * SR && s + i < n; i++) {
      ph += (TAU * f0 * (1 + (0.08 * i) / (tau * SR))) / SR;
      out[s + i] += amp * Math.exp(-i / (tau * SR)) * Math.sin(ph);
    }
  }
  return out;
}

/** Thunder: the crackle of the leader, then a roll as sound arrives from ever farther along the bolt. */
function thunder(): Float32Array {
  const n = Math.round(10 * SR), out = new Float32Array(n);
  const arrivals = Array.from({ length: 9 }, (_, k) => {
    const t0 = k ? rnd(0.15, 5.5) : 0;
    return [t0, k ? rnd(0.35, 1) * (1 - t0 / 8) : 1, rnd(0.06, 0.4), rnd(0.4, 1.5)];
  });
  let a1 = 0, a2 = 0, e = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = 0;
    for (const [t0, a, att, dec] of arrivals) {
      if (t > t0) env += a * (1 - Math.exp((t0 - t) / att)) * Math.exp((t0 - t) / dec);
    }
    // highs die first: the low-pass closes from ~2.5 kHz to ~110 Hz across the roll; gain keeps the body level
    const fc = 110 + 2400 * Math.exp(-t / 0.35), k = 1 - Math.exp((-TAU * fc) / SR);
    a1 += k * (noise() - a1);
    a2 += k * (a1 - a2);
    out[i] = a2 * env * Math.exp(-t / 4) * Math.sqrt(2510 / fc);
    if (t < 4) e += out[i] * out[i];
  }
  const g = 0.3 / Math.sqrt(e / (4 * SR));
  for (let i = 0; i < n; i++) out[i] *= g;
  for (let c = 0; c < 60; c++) {
    const s = Math.round(rnd(0, 0.35) ** 1.6 * SR), a = rnd(-0.5, 0.5);
    for (let i = 0; i < 0.002 * SR; i++) out[s + i] += a * Math.exp(-i / (0.0004 * SR));
  }
  for (let i = 0; i < n; i++) out[i] = 0.9 * Math.tanh(out[i] / 0.9);
  return peakTo(0.9, out);
}

/** A hull going down: timbers groaning as they give way, spars snapping, air bursting out in bubbles. */
function groan(): AudioBuffer {
  const b = makeBuffer(7, 2), L = b.getChannelData(0), Rt = b.getChannelData(1);
  const layer = (x: Float32Array, at: number, gain: number, pan: number) => {
    const s = Math.round(at * SR);
    for (let i = 0; i < x.length && s + i < b.length; i++) {
      L[s + i] += x[i] * gain * (1 - pan);
      Rt[s + i] += x[i] * gain * (1 + pan);
    }
  };
  layer(creak(6.5, 30, 9, [58, 97, 160, 270, 450], 0.1), 0, 1, -0.2);
  layer(creak(6.2, 26, 11, [64, 105, 175, 300], 0.1), 0.15, 0.8, 0.25);
  layer(creak(3.5, 70, 35, [210, 370, 640, 1100], 0.035), rnd(0.4, 0.8), 0.45, 0.4);
  layer(splinter(), rnd(0.3, 0.6), 0.7, -0.3);
  layer(splinter(), rnd(1.6, 2.4), 0.6, 0.35);
  for (const pan of [-0.6, 0.6]) layer(bubbles(), 0, 0.3, pan);
  peakTo(0.9, L, Rt);
  return b;
}

/** A raindrop on taut canvas (a low "tup" that falls slightly in pitch) or on the deck (a short wooden tick). */
function drop(): Float32Array {
  const canvas = Math.random() < 0.65, f = canvas ? rnd(160, 480) : rnd(1500, 4500);
  const tau = canvas ? rnd(0.006, 0.02) : rnd(0.0012, 0.004), amp = Math.random() ** 2.2 * (canvas ? 1 : 0.5);
  const len = Math.round(tau * 6 * SR), d = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const tone = Math.sin((TAU * f * i * (1 - (0.15 * i) / len)) / SR);
    d[i] = amp * Math.exp(-i / (tau * SR)) * (tone + (i < 24 ? 0.5 * noise() : 0));
  }
  return d;
}

/** Water slapping the hull: a soft splat ringing a couple of hollow modes of the planking. */
function slap(): Float32Array {
  const len = Math.round(0.25 * SR), x = new Float32Array(len), d = new Float32Array(len), amp = Math.random() ** 1.5;
  burst(x, 0, 1, rnd(0.004, 0.012));
  ring(x, d, rnd(220, 420), rnd(0.01, 0.025), 1);
  ring(x, d, rnd(600, 1300), rnd(0.006, 0.012), 0.6);
  for (let i = 0; i < len; i++) d[i] = amp * (d[i] + 0.3 * x[i]);
  return d;
}

/** A stereo loop of `perSecond` grains at random times and places, wrapped around the seam, at a fixed RMS. */
function scatter(seconds: number, perSecond: number, grain: () => Float32Array): AudioBuffer {
  const b = makeBuffer(seconds, 2), n = b.length, L = b.getChannelData(0), Rt = b.getChannelData(1);
  for (let k = Math.round(perSecond * seconds); k > 0; k--) {
    const g = grain(), pan = Math.random(), gl = Math.sqrt(1 - pan), gr = Math.sqrt(pan);
    const at = Math.floor(Math.random() * n);
    for (let i = 0; i < g.length; i++) {
      L[(at + i) % n] += g[i] * gl;
      Rt[(at + i) % n] += g[i] * gr;
    }
  }
  let e = 0;
  for (let i = 0; i < n; i++) e += L[i] * L[i] + Rt[i] * Rt[i];
  const k = 0.12 / Math.sqrt(e / (2 * n));
  for (const d of [L, Rt]) for (let i = 0; i < n; i++) d[i] = 0.9 * Math.tanh((d[i] * k) / 0.9);
  return b;
}

/** Bronze bell partials: frequency ratio to the strike note, amplitude, decay time constant (s). */
const BELL = [
  [0.5, 0.35, 3.2], [1, 1, 2.4], [1.19, 0.5, 1.7], [1.5, 0.3, 1.3], [2, 0.6, 1], [2.51, 0.3, 0.7], [2.66, 0.25, 0.55],
  [3.01, 0.2, 0.45], [4.15, 0.12, 0.3], [5.43, 0.08, 0.2],
] as const;

/** A small bronze buoy bell rung by an iron clapper: inharmonic partials, each a slowly beating pair. */
function bell(): Float32Array {
  const n = Math.round(4.5 * SR), x = new Float32Array(n), out = new Float32Array(n);
  x[0] = 1;
  burst(x, 0, 0.3, 0.0008);
  for (const [ratio, amp, decay] of BELL) {
    for (const beat of [0, rnd(0.4, 1.6)]) ring(x, out, 620 * ratio + beat, decay, amp);
  }
  for (let i = 0; i < 0.005 * SR; i++) out[i] += 0.2 * x[i];
  return peakTo(0.9, out);
}

/** Open-air space: a short diffuse tail that darkens as it fades, after a small pre-delay. */
function room(): AudioBuffer {
  const b = makeBuffer(2.6, 2);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = Math.round(0.012 * SR), lp = 0; i < b.length; i++) {
      const t = i / SR, a = 0.1 + 0.85 * (1 - Math.exp(-t / 0.6));
      lp += (1 - a) * (noise() - lp);
      d[i] = lp * Math.exp(-t / 0.4);
    }
  }
  return b;
}

/** Transparent below 0.8, then bends smoothly toward 0.99: a last guard against overs, never a sound. */
function softClip(): Float32Array {
  const c = new Float32Array(1025);
  for (let i = 0; i < c.length; i++) {
    const x = i / 512 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.19 * Math.tanh((a - 0.8) / 0.19));
  }
  return c;
}

function renderBank() {
  return {
    pink: noiseLoop(11, pink),
    brown: noiseLoop(9, brown),
    drizzle: scatter(6.3, 18, drop),
    downpour: scatter(5.1, 170, drop),
    lapping: scatter(9.3, 3, slap),
    creaks: [
      creak(0.9, 22, 14, [140, 260, 410, 720], 0.05), // hull timbers working
      creak(1.3, 16, 9, [110, 205, 330, 560], 0.06),
      creak(1.1, 30, 45, [170, 300, 520, 900], 0.04),
      creak(0.6, 55, 30, [230, 450, 780, 1300], 0.03), // planks and knees
      creak(0.8, 85, 60, [320, 610, 990, 1700], 0.02), // rope on a block
      creak(0.5, 120, 70, [400, 760, 1250, 2100], 0.015),
    ].map(mono),
    snaps: [snap(), snap(), snap()].map(mono),
    luff: mono(luff()),
    thud: mono(thud()),
    thunder: [thunder(), thunder(), thunder()].map(mono),
    groan: groan(),
    bell: mono(bell()),
    room: room(),
  };
}
type Bank = ReturnType<typeof renderBank>;

// ---------------------------------------------------------------------------------------------
// Live graph.

/** A continuous layer: looping source → filters → gain → panner. */
interface Bed {
  gain: GainNode;
  tone: BiquadFilterNode;
  pan: StereoPannerNode;
}

/** A pooled one-shot chain; only the source node is created per sound. */
interface Voice {
  src: AudioBufferSourceNode | null;
  readonly filter: BiquadFilterNode;
  readonly env: GainNode; // the sound's own envelope
  readonly amp: GainNode; // level × distance
  readonly pan: StereoPannerNode;
  readonly send: GainNode; // to the room
  end: number;
}

/** Each buoy bell's pitch (playback rate of the one rendered bell), so neighbours never ring in unison. */
const BELL_PITCH = [1, 0.84, 1.13, 0.94];

/** Radii (world units) of the two rings sampled around the ear when looking for the shore. */
const RINGS = [6, 16];

/** Rigging strands: whistle frequency (Hz), resonance, stereo place, wind at which it starts to sing, level. */
const STRANDS = [
  [150, 14, -0.35, 0.25, 1], // moaning shrouds
  [212, 18, 0.3, 0.4, 0.8],
  [470, 45, -0.15, 0.55, 0.55], // whistling stays and halyards
  [690, 60, 0.45, 0.7, 0.45],
  [1030, 70, -0.5, 0.85, 0.35],
] as const;

const ear = new THREE.Vector3(), ground = new THREE.Vector3(), right = new THREE.Vector3(), ahead = new THREE.Vector3();
const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), side = new THREE.Vector3();
const q = new THREE.Vector3(), rel = new THREE.Vector3(), mid = new THREE.Vector3(), tmp = new THREE.Vector3();
const at = new THREE.Vector3(), wave = new THREE.Vector4();

class Soundscape {
  readonly ac: AudioContext;
  private readonly ctx: Ctx;
  private readonly bank: Bank;
  private readonly master: GainNode;
  private readonly world: GainNode;
  private readonly muffle: BiquadFilterNode;
  private readonly beds: GainNode;
  private readonly roomOut: GainNode;
  private readonly room: ConvolverNode;
  private readonly deep: Bed;
  private readonly wash: Bed[];
  private readonly caps: Bed;
  private readonly surf: Bed;
  private readonly breeze: Bed;
  private readonly howl: Bed;
  private readonly rain: Bed;
  private readonly ship: Bed;
  private readonly hull: Bed;
  private readonly strands: Bed[];
  private readonly drizzle: Bed;
  private readonly downpour: Bed;
  private readonly lapping: Bed;
  private readonly voices: Voice[];
  private readonly spot = { gain: 0, pan: 0, cut: 20000 };
  private readonly lastHit: Float64Array;
  private readonly shoreDir = new THREE.Vector3();
  private shoreNear = 0;
  private toShore = 0;
  private surveyIn = 0;
  private amp = 0.5; // running swell amplitude near the ear
  private h1 = 0; // swell height at the nearest shore, last two frames
  private h2 = 0;
  private nextBreak = 0;
  private bowH = 0;
  private gust = 0.5;
  private gustTo = 0.5;
  private gustIn = 0;
  private roll = 0;
  private pitch = 0;
  private rollRate = 0;
  private pitchRate = 0;
  private nextCreak = 0;
  private nextClaim = 0;
  private nextLuff = 0;
  private nextSnap = 0;
  private tack = 0;
  private luffing = false;
  private strikes = -1;

  constructor(ctx: Ctx, bank: Bank, muted: boolean) {
    this.ctx = ctx;
    this.bank = bank;
    this.lastHit = new Float64Array(ctx.sim.ships.length).fill(-1);
    const ac = (this.ac = new AudioContext({ sampleRate: SR, latencyHint: 'playback' }));
    if (ac.state !== 'running') void ac.resume();

    // world → menu muffle → limiter → soft clip → mute fader
    this.master = new GainNode(ac, { gain: 0 });
    this.master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.6);
    this.world = new GainNode(ac);
    this.muffle = new BiquadFilterNode(ac, lp(20000));
    this.world
      .connect(this.muffle)
      .connect(new DynamicsCompressorNode(ac, { threshold: -8, knee: 4, ratio: 16, attack: 0.002, release: 0.25 }))
      .connect(new WaveShaperNode(ac, { curve: softClip(), oversample: '2x' }))
      .connect(this.master)
      .connect(ac.destination);
    this.room = new ConvolverNode(ac, { buffer: bank.room });
    this.roomOut = new GainNode(ac, { gain: 0.5 });
    this.room.connect(this.roomOut).connect(this.world);
    this.beds = new GainNode(ac);
    this.beds.connect(this.world);
    this.beds.connect(new GainNode(ac, { gain: 0.12 })).connect(this.room);

    const { pink, brown } = bank;
    // the open sea: a deep body, a wash each side that swells as crests pass, whitecap hiss in a blow
    this.deep = this.bed(brown, this.beds, lp(160));
    this.wash = [-0.75, 0.75].map((p) => {
      const b = this.bed(pink, this.beds, lp(800, 0.4), hp(90));
      b.pan.pan.value = p;
      return b;
    });
    this.caps = this.bed(pink, this.beds, lp(9000), hp(2400));
    this.surf = this.bed(pink, this.beds, lp(1200, 0.6), hp(55));
    // air: the broad rush of wind, a storm howl, rain hissing on the sea
    this.breeze = this.bed(pink, this.beds, lp(600, 1.4), hp(70));
    this.howl = this.bed(pink, this.beds, { type: 'bandpass', frequency: 380, Q: 5 });
    this.lfo(this.howl.tone.detune, 0.11, 60);
    this.rain = this.bed(pink, this.beds, lp(9000), hp(1100));
    // on board: everything that belongs to the player's ship shares one placement
    this.ship = {
      gain: new GainNode(ac, { gain: 0 }),
      tone: new BiquadFilterNode(ac, lp(20000)),
      pan: new StereoPannerNode(ac),
    };
    this.ship.gain.connect(this.ship.tone).connect(this.ship.pan).connect(this.beds);
    this.hull = this.bed(pink, this.ship.gain, { type: 'bandpass', frequency: 900, Q: 0.7 });
    this.strands = STRANDS.map(([frequency, Q, pan]) => {
      const b = this.bed(pink, this.ship.gain, { type: 'bandpass', frequency, Q });
      b.pan.pan.value = pan;
      this.lfo(b.tone.detune, rnd(0.05, 0.2), rnd(15, 40));
      return b;
    });
    this.drizzle = this.bed(bank.drizzle, this.ship.gain, hp(120));
    this.downpour = this.bed(bank.downpour, this.ship.gain, hp(120));
    this.lapping = this.bed(bank.lapping, this.ship.gain, lp(3500));

    this.voices = Array.from({ length: VOICES }, () => {
      const v: Voice = {
        src: null, filter: new BiquadFilterNode(ac), env: new GainNode(ac, { gain: 0 }), amp: new GainNode(ac),
        pan: new StereoPannerNode(ac), send: new GainNode(ac, { gain: 0 }), end: 0,
      };
      v.filter.connect(v.env).connect(v.amp).connect(v.pan).connect(this.world);
      v.amp.connect(v.send).connect(this.room);
      return v;
    });
  }

  private bed(buf: AudioBuffer, dest: AudioNode, tone: BiquadFilterOptions, pre?: BiquadFilterOptions): Bed {
    const ac = this.ac, src = new AudioBufferSourceNode(ac, { buffer: buf, loop: true });
    const b: Bed = {
      gain: new GainNode(ac, { gain: 0 }), tone: new BiquadFilterNode(ac, tone), pan: new StereoPannerNode(ac),
    };
    const head = pre ? src.connect(new BiquadFilterNode(ac, pre)) : src;
    head.connect(b.tone).connect(b.gain).connect(b.pan).connect(dest);
    src.start(0, Math.random() * buf.duration);
    return b;
  }

  /** A slow sine wobble on a parameter, e.g. a few cents of detune so a whistle never sits still. */
  private lfo(param: AudioParam, frequency: number, depth: number): void {
    const osc = new OscillatorNode(this.ac, { frequency });
    osc.connect(new GainNode(this.ac, { gain: depth })).connect(param);
    osc.start(this.ac.currentTime + rnd(0, 5));
  }

  private glide(param: AudioParam, value: number, tc = 0.12): void {
    param.setTargetAtTime(value, this.ac.currentTime, tc);
  }

  mute(on: boolean): void {
    this.master.gain.setTargetAtTime(on ? 0 : 1, this.ac.currentTime, on ? 0.08 : 0.25);
  }

  update(f: Frame): void {
    const now = this.ac.currentTime, env = f.env, dt = Math.max(f.dt, 1e-3);
    const me = f.poses[0], turn = this.ctx.sim.ships[0].turn;
    right.set(1, 0, 0).applyQuaternion(f.camera.quaternion);
    ahead.set(0, 0, -1).applyQuaternion(f.camera.quaternion);
    // The ear sits between camera and ship: panning follows the view, distance stays close to the deck.
    ear.lerpVectors(f.camera.position, f.focus, 0.6);
    ground.copy(ear).normalize();
    const sea = 1 / (1 + Math.max(0, ear.length() - R - 4) / 30); // the ocean fades as the camera climbs

    // Mood: hushed and close at night, gentle at dawn, wild in the storm.
    const storm = env.storm, night = env.night;
    const dawn = Math.exp(-(((env.hour - 6.3) / 1.3) ** 2)) * (1 - storm);
    const hush = (1 - 0.3 * night) * (1 - 0.3 * dawn);
    const air = 1 - 0.4 * night;
    this.glide(this.world.gain, f.paused ? 0.3 : 1, 0.25);
    this.glide(this.muffle.frequency, f.paused ? 700 : 20000, 0.25);
    this.glide(this.roomOut.gain, 0.5 + 0.25 * night, 1);

    // Wind at the player from the shared field, with gusts of our own on top.
    const windV = env.windDir, wl = windV.length() + 1e-6;
    const base = lerp(0.2 + 0.6 * clamp((wl - 0.15) / 1.1, 0, 1) * (1 - 0.5 * dawn), 1, storm);
    const e = clamp(base * (1 + (0.25 + 0.5 * storm) * (2 * this.gust - 1)), 0, 1.3);
    const rough = clamp(0.2 + 0.5 * base + 0.5 * storm, 0, 1);
    const afloat = me.visible ? (1 - me.sink) * me.rise : 0;
    this.gustIn -= dt;
    if (this.gustIn <= 0) {
      const to = Math.random();
      if (to - this.gust > 0.3 && e > 0.45 && afloat > 0.5 && now > this.nextSnap && Math.random() < 0.6) {
        this.nextSnap = now + 2.5;
        this.canvas(me, 0.3 * e, pick(this.bank.snaps));
      }
      this.gustTo = to;
      this.gustIn = rnd(1.2, 4) * (1 - 0.5 * storm);
    }
    this.gust += (this.gustTo - this.gust) * (1 - Math.exp(-dt / 0.8));

    // Open sea: the wash on each side rises as a crest passes under it.
    const hL = this.swellAt(-8, f), hR = this.swellAt(8, f);
    this.amp += (0.5 * (Math.abs(hL) + Math.abs(hR)) - this.amp) * (1 - Math.exp(-dt / 6));
    let crests = 0;
    for (let i = 0; i < 2; i++) {
      const c = clamp(0.5 + (i ? hR : hL) / (2 * this.amp + 1e-3), 0, 1);
      this.glide(this.wash[i].gain.gain, 0.45 * sea * hush * (0.5 + 0.6 * rough) * (0.12 + 0.88 * c * c * c));
      this.glide(this.wash[i].tone.frequency, (350 + 1500 * c * (0.5 + 0.5 * rough)) * air);
      crests += c / 2;
    }
    this.glide(this.deep.gain.gain, 0.13 * Math.sqrt(sea) * (0.6 + 0.6 * rough) * hush);
    this.glide(this.caps.gain.gain, sea * (0.03 + 0.1 * smoothstep(rough, 0.3, 1)) * (0.3 + 0.7 * crests) * air);
    this.shore(f, sea * hush, rough, air);

    // Air.
    this.glide(this.breeze.gain.gain, (0.04 + 0.25 * e * e) * (0.5 + 0.5 * sea) * hush);
    this.glide(this.breeze.tone.frequency, (300 + 2000 * e) * air);
    this.glide(this.breeze.pan.pan, (-windV.dot(right) / wl) * 0.35, 0.5);
    this.glide(this.howl.gain.gain, 0.3 * storm * smoothstep(e, 0.5, 1.2));
    this.glide(this.howl.tone.frequency, 260 + 260 * e);
    this.glide(this.rain.gain.gain, 0.3 * env.rain ** 1.2 * (0.45 + 0.55 * sea));
    this.glide(this.rain.tone.frequency, 5000 + 6000 * air);

    // On board: hull wash, rigging, rain on canvas, all placed at the player's ship.
    const near = this.locate(me.pos, 10) * afloat;
    this.glide(this.ship.gain.gain, near);
    this.glide(this.ship.pan.pan, this.spot.pan);
    this.glide(this.ship.tone.frequency, this.spot.cut);
    const speed = me.speed / 9;
    const bowH = swell(q.copy(me.pos).addScaledVector(me.fwd, me.length * 0.5).normalize(), f.t, f.simTime, wave).w;
    const plunge = clamp((this.bowH - bowH) / dt / (2 * this.amp + 0.2), 0, 1); // the bow driving down into chop
    this.bowH = bowH;
    this.glide(this.hull.gain.gain, 0.6 * speed * (0.45 + 0.55 * plunge) * (0.6 + 0.6 * rough), 0.06);
    this.glide(this.hull.tone.frequency, 700 + 1300 * speed * (0.6 + 0.6 * plunge), 0.06);
    for (let i = 0; i < STRANDS.length; i++) {
      const f0 = STRANDS[i][0], th = STRANDS[i][3], level = STRANDS[i][4];
      this.glide(this.strands[i].gain.gain, 0.5 * level * smoothstep(e, th, th + 0.35), 0.3);
      this.glide(this.strands[i].tone.frequency, f0 * (0.75 + 0.4 * e), 0.3);
    }
    const drizzle = smoothstep(env.rain, 0.02, 0.3) * (1 - 0.7 * smoothstep(env.rain, 0.45, 0.9));
    this.glide(this.drizzle.gain.gain, 0.22 * drizzle);
    this.glide(this.downpour.gain.gain, 0.25 * smoothstep(env.rain, 0.3, 0.9));
    this.glide(this.lapping.gain.gain, 0.5 * (0.3 + 0.7 * rough) * (0.5 + 0.5 * plunge) * hush, 0.3);

    // Timbers creak as the hull works: at the turn of each roll and pitch, and more often under load.
    const deck = tmp.set(0, 1, 0).applyQuaternion(me.quat);
    side.crossVectors(me.up, me.fwd);
    const roll = deck.dot(side), pitch = deck.dot(me.fwd);
    const rollRate = (roll - this.roll) / dt, pitchRate = (pitch - this.pitch) / dt;
    const turnOver = (rollRate * this.rollRate < 0 && Math.abs(roll) > 0.02) ||
      (pitchRate * this.pitchRate < 0 && Math.abs(pitch) > 0.02);
    this.roll = roll;
    this.pitch = pitch;
    this.rollRate = rollRate;
    this.pitchRate = pitchRate;
    const load = clamp(0.15 * rough + 0.3 * Math.abs(turn) + 0.5 * storm + 1.5 * Math.abs(me.heel), 0, 1);
    const creakChance = turnOver ? 0.1 + 0.4 * load : (0.04 + 0.3 * load) * dt;
    if (afloat > 0.5 && now > this.nextCreak && Math.random() < creakChance) {
      this.nextCreak = now + 0.6;
      this.creak(me.pos, (0.15 + 0.5 * load) * rnd(0.6, 1), 10);
    }

    // Sails: the wind crossing the bow spills them, filling on the new side cracks them taut.
    const lateral = windV.dot(side) / wl;
    if (Math.abs(lateral) < 0.12 && !this.luffing) {
      this.luffing = true;
      if (afloat > 0.5 && now > this.nextLuff) {
        this.nextLuff = now + 5;
        this.canvas(me, 0.3 * (0.5 + e), this.bank.luff);
      }
    }
    if (Math.abs(lateral) > 0.25) {
      const tack = Math.sign(lateral);
      if (this.tack && tack !== this.tack && afloat > 0.5 && now > this.nextSnap) {
        this.nextSnap = now + 4;
        this.canvas(me, 0.55 * (0.5 + e), pick(this.bank.snaps));
      }
      this.tack = tack;
      this.luffing = false;
    }

    // Thunder: each new strike, heard after its distance at the speed of sound.
    if (env.strikes !== this.strikes) {
      if (this.strikes >= 0) this.thunder(env.lightningPos);
      this.strikes = env.strikes;
    }

    // Buoy bells, on the frame each clapper lands.
    const bells = this.ctx.structures.bells;
    for (let i = 0; i < bells.length; i++) {
      const b = bells[i];
      if (b.ring > 0 && this.locate(b.pos, 12) * b.ring > 0.01) {
        this.oneShot(this.bank.bell, now, 0.45 * b.ring, 0.4, BELL_PITCH[i % BELL_PITCH.length] * rnd(0.995, 1.005));
      }
    }

    for (const ev of f.events) {
      switch (ev.type) {
        case 'claim':
          this.claim(ev.ship, ev.cells.length, f.poses[ev.ship].pos);
          break;
        case 'sink':
          this.sinking(ev.ship, at.set(ev.pos.x, ev.pos.y, ev.pos.z).multiplyScalar(R));
          break;
        case 'respawn':
          this.surge(ev.ship, f.poses[ev.ship].pos);
          break;
        case 'bump': {
          const ship = ev.a === 0 || ev.b === 0 ? 0 : ev.a;
          this.impact(ship, f.poses[ship].pos, ev.strength);
          break;
        }
        case 'ground':
          this.impact(ev.ship, f.poses[ev.ship].pos, ev.strength);
      }
    }
  }

  /** Swell height `offset` units to the right of the ground under the ear. */
  private swellAt(offset: number, f: Frame): number {
    return swell(q.copy(ground).multiplyScalar(R).addScaledVector(right, offset).normalize(), f.t, f.simTime, wave).w;
  }

  /** Surf: a bed placed toward the coast, and breakers crashing on the bigger crests at the nearest shore. */
  private shore(f: Frame, level: number, rough: number, air: number): void {
    // the coast around the ear changes slowly: survey two rings of bearings ten times a second, each pulling
    // toward the shore by how close the coast passes; shoreDir's length says how one-sided it is
    if ((this.surveyIn -= f.dt) <= 0) {
      const world = this.ctx.world, c0 = world.coastAt(ground);
      this.surveyIn = 0.1;
      this.toShore = (Math.max(c0, 0) + 1) / R;
      t1.copy(right).addScaledVector(ground, -right.dot(ground)).normalize();
      t2.crossVectors(ground, t1);
      this.shoreDir.set(0, 0, 0);
      let sum = 0;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        for (const r of RINGS) {
          q.copy(ground).addScaledVector(t1, (ca * r) / R).addScaledVector(t2, (sa * r) / R).normalize();
          const w = Math.exp(-Math.abs(world.coastAt(q)) / 6);
          this.shoreDir.addScaledVector(t1, w * ca).addScaledVector(t2, w * sa);
          sum += w;
        }
      }
      this.shoreDir.divideScalar(sum + 1e-6);
      this.shoreNear = Math.max(Math.exp(-Math.abs(c0) / (c0 > 0 ? 16 : 10)), sum / (12 * RINGS.length));
    }
    const near = this.shoreNear * level, focus = this.shoreDir.length();
    const dir = tmp.copy(this.shoreDir).divideScalar(focus + 1e-6), behind = focus * Math.max(0, -dir.dot(ahead));
    this.glide(this.surf.gain.gain, 0.35 * near * (0.55 + 0.6 * rough));
    this.glide(this.surf.pan.pan, dir.dot(right) * focus * 0.8, 0.3);
    this.glide(this.surf.tone.frequency, (700 + 1400 * rough) * air * (1 - 0.5 * behind), 0.3);
    if (near < 0.1) return;
    q.copy(ground).addScaledVector(dir, this.toShore).normalize();
    const h = swell(q, f.t, f.simTime, wave).w, now = this.ac.currentTime;
    if (this.h1 > h && this.h1 >= this.h2 && this.h1 > 0.9 * this.amp && now > this.nextBreak) {
      this.nextBreak = now + rnd(2, 3.5);
      const crest = clamp(this.h1 / (2 * this.amp), 0.4, 1.2);
      this.breaker(at.copy(q).multiplyScalar(R), near * crest * (0.6 + 0.6 * rough));
    }
    this.h2 = this.h1;
    this.h1 = h;
  }

  /** Sets `spot` for a world point heard from the ear: gain (full inside `ref`), pan, and a low-pass for air,
   *  for sounds behind the camera, and for anything the planet hides beyond the horizon. Returns the gain. */
  private locate(p: THREE.Vector3, ref: number): number {
    const d = rel.subVectors(p, ear), dist = Math.max(d.length(), 1e-3);
    const t = clamp(-ear.dot(d) / (dist * dist), 0, 1);
    const hidden = smoothstep(R - mid.copy(ear).addScaledVector(d, t).length(), 1, 10);
    d.divideScalar(dist);
    const s = this.spot;
    s.pan = clamp(d.dot(right), -1, 1) * 0.85 * (dist / (dist + 3));
    s.cut = (16000 / (1 + dist / 80)) * (1 - 0.55 * Math.max(0, -d.dot(ahead))) * (1 - 0.92 * hidden);
    s.gain = (ref / Math.max(ref, dist)) * (1 - 0.85 * hidden);
    return s.gain;
  }

  /** Borrows the voice that frees up soonest (fading it if still sounding) and plays buf on it from `at`, placed
   *  at the last located spot. The envelope starts at env0; callers shape it from there. */
  private voice(buf: AudioBuffer, at: number, len: number, level: number, send: number, rate = 1, env0 = 1): Voice {
    const now = this.ac.currentTime;
    const v = this.voices.reduce((a, b) => (b.end < a.end ? b : a));
    const env = v.env.gain;
    env.cancelScheduledValues(now);
    v.filter.frequency.cancelScheduledValues(now);
    if (v.end > now) {
      env.setValueAtTime(env.value, now);
      env.linearRampToValueAtTime(0, now + 0.03);
      v.src?.stop(now + 0.03);
      at = Math.max(at, now + 0.035);
    }
    const src = new AudioBufferSourceNode(this.ac, { buffer: buf, playbackRate: rate });
    src.connect(v.filter);
    src.start(at, Math.random() * Math.max(0, buf.duration - len * rate));
    src.stop(at + len);
    v.src = src;
    v.end = at + len;
    v.filter.type = 'lowpass';
    v.filter.Q.value = 0.7;
    v.filter.frequency.setValueAtTime(this.spot.cut, at);
    env.setValueAtTime(env0, at);
    env.setTargetAtTime(0, at + len - 0.1, 0.02);
    v.amp.gain.setValueAtTime(level * this.spot.gain, at);
    v.pan.pan.setValueAtTime(this.spot.pan, at);
    v.send.gain.setValueAtTime(send * (2 - this.spot.gain), at); // farther sounds are heard more through the room
    return v;
  }

  private oneShot(buf: AudioBuffer, at: number, level: number, send: number, rate = 1): Voice {
    return this.voice(buf, at, buf.duration / rate, level, send, rate);
  }

  /** Draws the ambient beds back for a moment so a big event stands clear. */
  private duck(depth: number, hold: number, at = this.ac.currentTime): void {
    const g = this.beds.gain;
    g.cancelScheduledValues(at);
    g.setTargetAtTime(depth, at, 0.25);
    g.setTargetAtTime(1, at + hold, 1.2);
  }

  private creak(p: THREE.Vector3, level: number, ref: number): void {
    this.locate(p, ref);
    this.spot.pan = clamp(this.spot.pan + rnd(-0.3, 0.3), -1, 1); // timbers all along the hull
    this.oneShot(pick(this.bank.creaks), this.ac.currentTime, level, 0.12, rnd(0.8, 1.2));
  }

  private canvas(me: ShipPose, level: number, buf: AudioBuffer): void {
    this.locate(at.copy(me.pos).addScaledVector(me.up, me.length * 0.8), 10);
    this.oneShot(buf, this.ac.currentTime, level, 0.1, rnd(0.9, 1.12));
  }

  /** A breaker: a low boom opening into the roar of tumbling water, then foam fizzing back down the sand. */
  private breaker(p: THREE.Vector3, strength: number): void {
    if (this.locate(p, 14) * strength < 0.02) return;
    const now = this.ac.currentTime, len = rnd(3.5, 5);
    const roar = this.voice(this.bank.pink, now, len, strength, 0.2, rnd(0.9, 1.1), 1e-3);
    roar.filter.Q.value = 0.8;
    roar.filter.frequency.setValueAtTime(220, now);
    roar.filter.frequency.exponentialRampToValueAtTime(Math.min(this.spot.cut, 2200), now + 0.45);
    roar.filter.frequency.setTargetAtTime(500, now + 0.6, 1.1);
    roar.env.gain.exponentialRampToValueAtTime(1, now + 0.4);
    roar.env.gain.setTargetAtTime(0, now + 0.55, len * 0.2);
    const fizz = this.voice(this.bank.pink, now + 0.7, len, 0.5 * strength, 0.2, 1, 1e-3);
    fizz.filter.type = 'highpass';
    fizz.filter.frequency.setValueAtTime(2800, now + 0.7);
    fizz.env.gain.linearRampToValueAtTime(1, now + 1.6);
    fizz.env.gain.setTargetAtTime(0, now + 1.8, 0.9);
  }

  private thunder(p: THREE.Vector3): void {
    const dist = p.distanceTo(ear);
    this.locate(p, 60);
    // thunder carries far: a gentle fall-off, the planet does not hide it, but the crack is lost with distance
    this.spot.gain = clamp((70 / dist) ** 0.8, 0.25, 1);
    this.spot.cut = 180 + 9000 * Math.exp(-dist / 45);
    const rate = rnd(0.9, 1.05) * (1 - 0.15 * smoothstep(dist, 60, 200));
    const when = this.ac.currentTime + Math.min(6, dist / SOUND_SPEED);
    this.oneShot(pick(this.bank.thunder), when, 1, 0.5, rate);
    this.duck(1 - 0.3 * this.spot.gain, 1, when); // a close strike drowns out the sea for a moment
  }

  /** The rush of a closing loop: water pouring inward, longer and fuller for bigger claims. */
  private claim(ship: number, cells: number, p: THREE.Vector3): void {
    const own = ship === 0, big = clamp((Math.log2(cells + 1) - 9) / 8, 0, 1), now = this.ac.currentTime;
    // rivals nibble constantly: only their real bites are heard, one at a time
    if (!own && (cells < 600 || now < this.nextClaim)) return;
    if (this.locate(p, own ? 60 : 15) < 0.03) return;
    if (own) this.spot.pan *= 0.3;
    else this.nextClaim = now + 1.5;
    const dur = 1.8 + 3 * big, crest = now + 0.55 * dur;
    const rush = this.voice(this.bank.pink, now, dur * 1.8, (own ? 0.7 : 0.55) * (0.6 + 0.4 * big), 0.3, 1, 1e-2);
    rush.filter.type = 'bandpass';
    rush.filter.Q.value = 0.8;
    rush.filter.frequency.setValueAtTime(150, now);
    rush.filter.frequency.exponentialRampToValueAtTime(900 + 1600 * big, crest);
    rush.filter.frequency.setTargetAtTime(450, crest, 0.3 * dur);
    rush.env.gain.exponentialRampToValueAtTime(1, crest);
    rush.env.gain.setTargetAtTime(0, crest, 0.22 * dur);
    if (!own) return;
    // the player's own: the sea surging deep underneath, then spray settling
    const surge = this.voice(this.bank.brown, now, dur * 2, 0.8 * (0.5 + 0.5 * big), 0.2, 1, 1e-2);
    surge.filter.frequency.setValueAtTime(90, now);
    surge.filter.frequency.exponentialRampToValueAtTime(320, crest);
    surge.filter.frequency.setTargetAtTime(110, crest, 0.3 * dur);
    surge.env.gain.exponentialRampToValueAtTime(1, crest - 0.1 * dur);
    surge.env.gain.setTargetAtTime(0, crest, 0.3 * dur);
    const at = crest - 0.15 * dur;
    const spray = this.voice(this.bank.pink, at, dur * 1.6, 0.25, 0.4, 1, 1e-3);
    spray.filter.type = 'highpass';
    spray.filter.frequency.setValueAtTime(3500, at);
    spray.env.gain.linearRampToValueAtTime(1, crest + 0.1 * dur);
    spray.env.gain.setTargetAtTime(0, crest + 0.1 * dur, 0.3 * dur);
    this.duck(0.7, dur * 0.6);
  }

  /** The deep groan of a sinking; the player's own adds a concussion and draws the world back. */
  private sinking(ship: number, p: THREE.Vector3): void {
    const own = ship === 0;
    if (this.locate(p, own ? 60 : 12) < 0.03) return;
    const now = this.ac.currentTime;
    this.oneShot(this.bank.groan, now, own ? 0.9 : 0.45, own ? 0.45 : 0.3, own ? 0.82 : rnd(0.9, 1.15));
    if (!own) return;
    this.oneShot(this.bank.thud, now + 0.15, 1, 0.5, 0.45).filter.frequency.setValueAtTime(260, now + 0.15);
    this.duck(0.45, 3.5);
  }

  /** A ship surging up out of spray. */
  private surge(ship: number, p: THREE.Vector3): void {
    const own = ship === 0;
    if (this.locate(p, own ? 30 : 12) < 0.03) return;
    const now = this.ac.currentTime, top = now + 0.7;
    const v = this.voice(this.bank.pink, now, 3, own ? 0.6 : 0.35, 0.25, 1, 1e-3);
    v.filter.Q.value = 1.1;
    v.filter.frequency.setValueAtTime(120, now);
    v.filter.frequency.exponentialRampToValueAtTime(Math.min(2800, this.spot.cut), top);
    v.filter.frequency.setTargetAtTime(700, top, 0.5);
    v.env.gain.exponentialRampToValueAtTime(1, top);
    v.env.gain.setTargetAtTime(0, top + 0.05, 0.45);
  }

  /** Hull against hull or rock: a heavy knock and the timbers complaining after it. */
  private impact(ship: number, p: THREE.Vector3, strength: number): void {
    const now = this.ac.currentTime;
    if (now < this.lastHit[ship] + 0.35) return;
    this.lastHit[ship] = now;
    const own = ship === 0, s = clamp(strength / 8, 0.15, 1); // closing speed, u/s
    if (this.locate(p, own ? 20 : 12) * s < 0.03) return;
    this.oneShot(this.bank.thud, now, (own ? 0.9 : 0.6) * s, 0.15, rnd(0.85, 1.1));
    this.creak(p, (own ? 0.7 : 0.4) * s, own ? 20 : 12);
  }
}

export class Audio {
  private muted = false;
  private readonly ctx: Ctx;
  private readonly bank: Bank;
  private scape: Soundscape | null = null;

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    this.bank = renderBank();
  }

  /** Browsers only allow audio after a user gesture; main calls this on the first key or click. */
  resume(): void {
    if (!this.scape) this.scape = new Soundscape(this.ctx, this.bank, this.muted);
    else if (this.scape.ac.state !== 'running') void this.scape.ac.resume();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.scape?.mute(this.muted);
  }

  update(f: Frame): void {
    this.scape?.update(f);
  }
}
