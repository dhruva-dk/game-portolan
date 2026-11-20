// The guns' sounds: a report for each kind of gun (GUNS, a row each), the reload's clunk as the gun comes ready, the
// THUNK of a gun swapped onto her plinth, the light knock of a slot of the hotbar taken in hand, the ratchet of a gun
// wound up, and the reload begun.
//
// A report is built as a real one is heard: the muzzle's crack (a few milliseconds, bright), the blast's body (noise
// through a lowpass falling from the bright to the dull in some 30 ms), the thump (a falling sine for headphones and,
// for a phone's small speaker that hears little under 150 Hz, a band of noise in the low mids), the carriage's
// wooden kick, and the tail: a rumble, rolled on by the sea's and the air's slap back. Each kind tells by its own: the
// cannon's full boom; the scatter's rattle of shot; the repeater's short dry snap (it fires ten a second); the
// harpoon's thrum of a loosed cable over a soft cough; the mortar's hollow tube note and its long low tail.

import type { GunKind } from '../../player.ts';
import {
  ar, brown, crackle, echoes, fall, filter, finish, layer, mix, modes, noise, normal, saturate, slips, take, tone, type Samples,
  type Take,
} from '../dsp.ts';

export type { GunKind };

/**
 * A gun's report:
 *   crack   the muzzle's crack, 0…1
 *   thump   where the thump's sine starts, Hz (it falls to 45% of it)
 *   body    the low-mid band the blast's weight sits in, Hz (what a phone's speaker carries)
 *   blast   seconds the blast's body takes to fall (its time constant)
 *   tail    seconds of rumble after
 *   rattle  grains of a scattered charge (0 for one ball)
 *   drive   how hard the whole is saturated (density)
 *   ring    a note it rings with, Hz, and the seconds it rings (the harpoon's cable, the mortar's tube; 0 none)
 *   bend    how far the ring's note falls as it rings, a share of it
 */
interface Report {
  crack: number; thump: number; body: number; blast: number; tail: number; rattle: number; drive: number; ring: number; ringT: number;
  bend: number;
}

export const GUNS: Record<GunKind, Report> = {
  cannon: { crack: 1, thump: 105, body: 210, blast: 0.06, tail: 2.2, rattle: 0, drive: 1.6, ring: 0, ringT: 0, bend: 0 },
  scatter: { crack: 0.9, thump: 125, body: 280, blast: 0.04, tail: 1.3, rattle: 46, drive: 1.9, ring: 0, ringT: 0, bend: 0 },
  repeater: { crack: 1.3, thump: 170, body: 460, blast: 0.018, tail: 0.45, rattle: 0, drive: 1.3, ring: 0, ringT: 0, bend: 0 },
  harpoon: { crack: 0.25, thump: 80, body: 190, blast: 0.025, tail: 0.9, rattle: 0, drive: 1.2, ring: 118, ringT: 0.5, bend: 0.12 },
  mortar: { crack: 0.35, thump: 58, body: 150, blast: 0.09, tail: 3, rattle: 0, drive: 1.9, ring: 92, ringT: 0.45, bend: 0.04 },
};

/** The report of a gun of kind `g`. */
export const report = (g: Report) => (rate: number, seed: number): Samples => {
  const t = take(g.tail + 0.5, rate, seed);
  const crack = layer(t, 0.05);
  noise(crack, fall(0.0022));
  filter(crack, 'highpass', 900);
  mix(t, crack, 0, 1.3 * g.crack);
  if (g.ring) {
    // its note: a fundamental and its overtones, falling a little as it rings, a buzz of the cable or the tube on it
    for (const [k, a] of [[1, 0.9], [2, 0.45], [3, 0.3], [5, 0.12]] as const) {
      const pitch = (s: number) => k * g.ring * (1 - g.bend * (1 - Math.exp(-s / 0.08)));
      tone(t, pitch, (s) => a * ar(0.004, g.ringT / (0.6 + 0.4 * k))(s), 0, g.ringT * 2.5);
    }
    const buzz = layer(t, g.ringT * 1.5);
    noise(buzz, ar(0.003, g.ringT * 0.4));
    filter(buzz, 'bandpass', g.ring * 7, 2);
    mix(t, buzz, 0, 0.5);
  }
  // the blast: noise through a lowpass falling from bright to dull
  const blast = layer(t, 0.8);
  noise(blast, ar(0.0015, g.blast));
  filter(blast, 'lowpass', (s) => 260 + 5200 * Math.exp(-s / 0.028), 0.9);
  mix(t, blast, 0, 1.5);
  // weight: the falling sine, and the low mids a phone can carry
  tone(t, (s) => g.thump * (0.45 + 0.55 * Math.exp(-s / 0.06)), (s) => 0.45 * ar(0.003, 0.12)(s), 0, 0.7);
  const body = layer(t, 0.7);
  noise(body, ar(0.002, 0.1));
  filter(body, 'bandpass', g.body, 1.1);
  filter(body, 'peak', g.body * 1.9, 1.5, 5);
  mix(t, body, 0, 3.4);
  // the carriage's kick
  modes(t, [[180, 0.12, 0.25], [410, 0.08, 0.18], [760, 0.05, 0.1]], 0.012);
  if (g.rattle) {
    const shot = layer(t, 0.5);
    crackle(shot, g.rattle, 0.02, 0.3, 0.8);
    filter(shot, 'bandpass', 2600, 0.8);
    mix(t, shot, 0, 0.6);
  }
  // the tail: a rumble, and the slap back off the sea and the air rolling it on
  const tail = layer(t);
  brown(tail, (s) => ar(0.05, g.tail * 0.32)(s));
  filter(tail, 'lowpass', 700);
  filter(tail, 'highpass', 90);
  filter(tail, 'peak', 260, 1, 5);
  mix(t, tail, 0, 0.5);
  const roll = layer(t);
  mix(roll, blast);
  mix(roll, body, 0, 1.2);
  filter(roll, 'lowpass', 1100);
  mix(t, echoes(roll, [[0.13, 0.32], [0.29, 0.2], [0.47, 0.14], [0.78, 0.09], [1.2, 0.05]]), 0, 1);
  filter(t, 'lowshelf', 120, 0.7, -6);
  saturate(t, g.drive);
  return normal(finish(t, 0.0005, 0.3)).x;
};

/** Iron and wood: the breech's latch and the gun's seat, struck at `at`. */
const latch = (t: Take, at: number, gain: number) => {
  modes(t, [[1250, 0.07, 0.5 * gain], [2890, 0.05, 0.35 * gain], [4420, 0.035, 0.2 * gain]], at, 0.03);
  modes(t, [[215, 0.13, 0.8 * gain], [470, 0.09, 0.5 * gain], [830, 0.05, 0.3 * gain]], at + 0.01, 0.03);
  const click = layer(t, 0.02);
  noise(click, fall(0.0015));
  filter(click, 'bandpass', 3200, 0.9);
  mix(t, click, at, 0.8 * gain);
};

/** The gun come ready: the latch drawn home, and the breech seated a moment after. */
export function ready(rate: number, seed: number): Samples {
  const t = take(0.45, rate, seed);
  latch(t, 0, 1);
  latch(t, 0.085 + 0.02 * t.r(), 0.55);
  return normal(finish(t)).x;
}

/** A gun swapped onto her plinth: dragged a moment, then a heavy THUNK of iron on oak, its chain settling after. */
export function swap(rate: number, seed: number): Samples {
  const t = take(1, rate, seed);
  const drag = layer(t, 0.2);
  noise(drag, (s) => Math.sin((Math.PI * s) / 0.12) * (s < 0.12 ? 1 : 0));
  filter(drag, 'bandpass', (s) => 1500 - 5000 * s, 1.4);
  mix(t, drag, 0, 0.25);
  const at = 0.11;
  // the mass of it: oak's low modes, a falling thump, and the low mids weighted for a phone
  modes(t, [[92, 0.4, 0.45], [151, 0.32, 0.6], [236, 0.24, 0.95], [362, 0.16, 0.75], [548, 0.1, 0.4]], at, 0.02);
  tone(t, (s) => 120 * (0.5 + 0.5 * Math.exp(-s / 0.04)), (s) => 0.4 * ar(0.002, 0.08)(s), at, 0.4);
  const hit = layer(t, 0.3);
  noise(hit, ar(0.001, 0.025));
  filter(hit, 'lowpass', 1600);
  filter(hit, 'peak', 280, 1.2, 6);
  mix(t, hit, at, 1.6);
  modes(t, [[1480, 0.14, 0.12], [2350, 0.09, 0.08]], at, 0.02);
  // the chain settling
  const chain = layer(t, 0.5);
  crackle(chain, 14, 0, 0.28, 0.6, 0.003);
  filter(chain, 'bandpass', 3400, 1.2);
  mix(t, chain, at + 0.05, 0.4);
  filter(t, 'lowshelf', 120, 0.7, -6);
  saturate(t, 1.8);
  return normal(finish(t)).x;
}

/** A gun wound up to fire (the harpoon's cable drawn, the mortar's charge rammed): a ratchet's pawl clicking quicker
 *  over some 0.6 s, iron on iron, ending in a catch. */
export function wind(rate: number, seed: number): Samples {
  const t = take(0.8, rate, seed);
  const pawl = layer(t, 0.7);
  slips(pawl, (s) => 14 + 30 * s, (s) => 0.6 + 0.6 * s, 0, 0.6, 0.12);
  filter(pawl, 'bandpass', 2300, 3);
  filter(pawl, 'peak', 5100, 4, 6);
  mix(t, pawl, 0, 1);
  modes(t, [[1900, 0.06, 0.4], [3300, 0.04, 0.25]], 0.62, 0.02);
  latch(t, 0.62, 0.5);
  return normal(finish(t)).x;
}

/** A reload begun: the spent breech knocked open, and the shot rolled in. */
export function reload(rate: number, seed: number): Samples {
  const t = take(0.5, rate, seed);
  latch(t, 0, 0.6);
  const roll = layer(t, 0.3);
  slips(roll, () => 60, (s) => Math.sin(Math.PI * Math.min(1, s / 0.22)), 0, 0.22, 0.4);
  filter(roll, 'bandpass', 900, 1.5);
  mix(t, roll, 0.12, 0.5);
  return normal(finish(t)).x;
}

/** A slot of the hotbar taken in hand: a light wooden knock. */
export function select(rate: number, seed: number): Samples {
  const t = take(0.18, rate, seed);
  modes(t, [[620, 0.06, 0.6], [1340, 0.04, 0.4], [2610, 0.025, 0.2]], 0, 0.04);
  const click = layer(t, 0.01);
  noise(click, fall(0.001));
  filter(click, 'highpass', 2500);
  mix(t, click, 0, 0.4);
  return normal(finish(t)).x;
}
