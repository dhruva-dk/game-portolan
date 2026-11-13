// A module Worker: makes the sounds' takes (bank.ts) off the main thread, where one take of a gun is tens of
// milliseconds, and hands each back as it is made.
//   in:  { rate, takes: each sound's name and seed }     out: { name, x } a take at a time (its samples, transferred)

import { SOUNDS, type SoundName } from './bank.ts';

/** What the page asks for: takes at `rate` Hz. */
export interface Ask { rate: number; takes: { name: SoundName; seed: number }[] }
/** A take made. */
export interface Made { name: SoundName; x: Float32Array<ArrayBuffer> }

self.onmessage = (e: MessageEvent<Ask>) => {
  for (const { name, seed } of e.data.takes) {
    const made: Made = { name, x: SOUNDS[name].make(e.data.rate, seed) };
    // (the options form, which a worker's postMessage and the window's that the DOM types give `self` both take)
    self.postMessage(made, { transfer: [made.x.buffer] });
  }
};
