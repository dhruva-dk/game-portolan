// The mix: four buses (the bed, the world's sounds, hers, the UI's) into the master: the player's sound level, a
// highpass under what any speaker plays (the sub only spends headroom), a glue compressor, and a limiter with a ceiling
// under full scale. Her gun ducks the bed and the world's sounds for a moment, so it lands with its whole weight.
// Each one-shot sound plays in one of VOICES slots kept wired (a lowpass for the air, a pan, a gain), routed to its bus
// as it is taken; a new source node is all a sound makes.

import { clamp } from '../world/scalar.ts';
import { db } from './dsp.ts';
import type { Bus } from './cues.ts';
import type { Heard } from './space.ts';
import { claim, clear, pool, VOICES } from './voices.ts';

/** The ceiling the limiter holds the output under (−1 dBFS). */
const CEILING = db(-1);
/** The mix's gain into the master's dynamics, dB: the whole set so the passage of play (tools/audio.ts) sits near
 *  −22 LUFS at the settings' default level, her gun's peaks taken by the limiter. */
const GAIN = 4;
/** Each bus's level, dB. */
const BUS: Record<Bus | 'bed', number> = { bed: -4, world: -2, own: 0, ui: -3 };

/** A voice's slot: its nodes, the bus it is routed to, and its source while it plays. */
interface Slot { air: BiquadFilterNode; pan: StereoPannerNode; gain: GainNode; bus: Bus | null; src: AudioBufferSourceNode | null }

export function createMixer(ctx: BaseAudioContext) {
  const level = new GainNode(ctx, { gain: 1 });
  const floor = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 40, Q: 0.6 });
  const glue = new DynamicsCompressorNode(ctx, { threshold: -14, knee: 8, ratio: 2, attack: 0.012, release: 0.28 });
  const limit = new DynamicsCompressorNode(ctx, { threshold: -4, knee: 0, ratio: 20, attack: 0.001, release: 0.1 });
  const ceiling = new GainNode(ctx, { gain: CEILING * db(-1) });
  level.connect(floor).connect(glue).connect(limit).connect(ceiling).connect(ctx.destination);

  const bus = (d: number) => new GainNode(ctx, { gain: db(d) });
  // the bed and the world each through a duck (her gun)
  const bedDuck = new GainNode(ctx), worldDuck = new GainNode(ctx);
  /** Each duck and how deep it dips. */
  const ducks = [[bedDuck, db(-9)], [worldDuck, db(-5)]] as const;
  const buses = { bed: bus(BUS.bed), world: bus(BUS.world), own: bus(BUS.own), ui: bus(BUS.ui) };
  buses.bed.connect(bedDuck).connect(level);
  buses.world.connect(worldDuck).connect(level);
  buses.own.connect(level);
  buses.ui.connect(level);

  const slots: Slot[] = Array.from({ length: VOICES }, () => {
    const air = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 16000, Q: 0.5 });
    const pan = new StereoPannerNode(ctx);
    const gain = new GainNode(ctx, { gain: 0 });
    air.connect(pan).connect(gain);
    return { air, pan, gain, bus: null, src: null };
  });
  const voices = pool();
  /** The level as last set. */
  let was = 1;

  return {
    /** Where the bed plays into. */
    bed: buses.bed,
    /** The player's sound level (0…1, as the settings hold it), from `at`: a square law, near what is heard as half. */
    level(v: number, at: number) {
      const g = clamp(v) ** 2 * db(GAIN);
      if (g === was) return;
      was = g;
      level.gain.setTargetAtTime(g, at, 0.05);
    },
    /**
     * Plays `buffer` on `bus` as `heard` (when, how loud, how dull, which side) from `at`, at `rate`, with `priority`:
     * in a free slot, or one taken from a sound of lower priority; false if none could be had.
     */
    play(buffer: AudioBuffer, b: Bus, heard: Heard, gain: number, rate: number, priority: number, at: number): boolean {
      const when = at + heard.delay, slot = claim(voices, at, priority, when, when + buffer.duration / rate);
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
      const src = new AudioBufferSourceNode(ctx, { buffer, playbackRate: rate });
      src.connect(s.air);
      s.air.frequency.setValueAtTime(heard.cutoff, when);
      s.pan.pan.setValueAtTime(heard.pan, when);
      s.gain.gain.setValueAtTime(heard.gain * gain, when);
      src.start(when);
      s.src = src;
      return true;
    },
    /** Her gun at `at`: the bed and the world's sounds dip, and come back over most of a second. */
    duck(at: number) {
      for (const [g, depth] of ducks) {
        g.gain.cancelScheduledValues(at);
        g.gain.setTargetAtTime(depth, at, 0.012);
        g.gain.setTargetAtTime(1, at + 0.18, 0.45);
      }
    },
    /** Every voice stopped (a new sea, the app put away). */
    hush(at: number) {
      for (const s of slots) {
        s.src?.stop(at);
        s.src = null;
      }
      clear(voices);
    },
  };
}
