import { SOUNDS, type SoundName } from './bank.ts';

export interface Ask {
  rate: number;
  takes: { name: SoundName; seed: number }[];
}
export interface Made {
  name: SoundName;
  x: Float32Array<ArrayBuffer>;
}

self.onmessage = (e: MessageEvent<Ask>) => {
  for (const { name, seed } of e.data.takes) {
    const made: Made = { name, x: SOUNDS[name].make(e.data.rate, seed) };
    self.postMessage(made, { transfer: [made.x.buffer] });
  }
};
