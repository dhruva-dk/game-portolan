import { clamp } from '../world/scalar.ts';
import { db } from './dsp.ts';
import type { Bus } from './cues.ts';
import type { Heard } from './space.ts';
import { claim, clear, pool, VOICES } from './voices.ts';

const CEILING = db(-1);
export const GAIN = 4;
export const BUS: Record<Bus | 'bed', number> = {
  bed: -4,
  world: -2,
  own: 0,
  ui: -3,
};

interface Slot {
  air: BiquadFilterNode;
  pan: StereoPannerNode;
  gain: GainNode;
  bus: Bus | null;
  src: AudioBufferSourceNode | null;
}

export function createMixer(ctx: BaseAudioContext) {
  const level = new GainNode(ctx, { gain: 1 });
  const floor = new BiquadFilterNode(ctx, {
    type: 'highpass',
    frequency: 40,
    Q: 0.6,
  });
  const glue = new DynamicsCompressorNode(ctx, {
    threshold: -14,
    knee: 8,
    ratio: 2,
    attack: 0.012,
    release: 0.28,
  });
  const limit = new DynamicsCompressorNode(ctx, {
    threshold: -4,
    knee: 0,
    ratio: 20,
    attack: 0.001,
    release: 0.1,
  });
  const ceiling = new GainNode(ctx, { gain: CEILING * db(-1) });
  level
    .connect(floor)
    .connect(glue)
    .connect(limit)
    .connect(ceiling)
    .connect(ctx.destination);

  const bus = (d: number) => new GainNode(ctx, { gain: db(d) });
  const bedDuck = new GainNode(ctx),
    worldDuck = new GainNode(ctx);
  const ducks = [
    [bedDuck, db(-9)],
    [worldDuck, db(-5)],
  ] as const;
  const buses = {
    bed: bus(BUS.bed),
    world: bus(BUS.world),
    own: bus(BUS.own),
    ui: bus(BUS.ui),
  };
  buses.bed.connect(bedDuck).connect(level);
  buses.world.connect(worldDuck).connect(level);
  buses.own.connect(level);
  buses.ui.connect(level);

  const slots: Slot[] = Array.from({ length: VOICES }, () => {
    const air = new BiquadFilterNode(ctx, {
      type: 'lowpass',
      frequency: 16000,
      Q: 0.5,
    });
    const pan = new StereoPannerNode(ctx);
    const gain = new GainNode(ctx, { gain: 0 });
    air.connect(pan).connect(gain);
    return { air, pan, gain, bus: null, src: null };
  });
  const voices = pool();
  let was = 1;

  return {
    bed: buses.bed,
    level(v: number, at: number) {
      const g = clamp(v) ** 2 * db(GAIN);
      if (g === was) return;
      was = g;
      level.gain.setTargetAtTime(g, at, 0.05);
    },
    play(
      buffer: AudioBuffer,
      b: Bus,
      heard: Heard,
      gain: number,
      rate: number,
      priority: number,
      at: number
    ): boolean {
      const when = at + heard.delay,
        slot = claim(voices, at, priority, when, when + buffer.duration / rate);
      if (slot < 0) return false;
      const s = slots[slot];
      if (s.src) {
        s.src.stop(at);
        s.src.disconnect();
      }
      if (s.bus !== b) {
        if (s.bus) s.gain.disconnect();
        s.gain.connect(buses[b]);
        s.bus = b;
      }
      const src = new AudioBufferSourceNode(ctx, {
        buffer,
        playbackRate: rate,
      });
      src.connect(s.air);
      s.air.frequency.setValueAtTime(heard.cutoff, when);
      s.pan.pan.setValueAtTime(heard.pan, when);
      s.gain.gain.setValueAtTime(heard.gain * gain, when);
      src.start(when);
      s.src = src;
      return true;
    },
    duck(at: number) {
      for (const [g, depth] of ducks) {
        g.gain.cancelScheduledValues(at);
        g.gain.setTargetAtTime(depth, at, 0.012);
        g.gain.setTargetAtTime(1, at + 0.18, 0.45);
      }
    },
    hush(at: number) {
      for (const s of slots) {
        s.src?.stop(at);
        s.src = null;
      }
      clear(voices);
    },
  };
}
