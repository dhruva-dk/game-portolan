// The game's sound: driven each frame by what the frame draws and the HUD reads (listen.ts Hearing), and nothing
// else. Every sound is made in code (sounds/*.ts: neither ambientCG nor Poly Haven offers recordings); no music.
//
// The engine (createEngine) runs on any context, the page's or an offline one (tools/audio.ts renders through it):
// each frame the deeds on the sea (derive.ts) and the rest of what is heard (listen.ts) become cues (cues.ts CUES, the
// one table), each played as heard from the eye (space.ts) in a voice (mixer.ts), and the bed follows her (bed.ts).
// The page's sound (createAudio) has one AudioContext, made and started on the first touch (WebKit plays nothing
// before one), put to sleep while the app is away and woken when it is back, its sounds made a few each frame.

import type { Vec3 } from '../world/sphere.ts';
import { R } from '../world/sphere.ts';
import { NAMES, SOUNDS, type SoundName } from './bank.ts';
import { createBed, levels, levelsOf } from './bed.ts';
import { CUES, cueOf, type Happening } from './cues.ts';
import { createDerive } from './derive.ts';
import { db, rng } from './dsp.ts';
import { createListen, type Call, type Hearing } from './listen.ts';
import { createMixer } from './mixer.ts';
import { close, hear, heard } from './space.ts';
import type { Screen } from '../ui/ways.ts';

/** Metres over the sea a deed is heard from: a gun at her muzzle, a blow on a hull at her side, the rest at the water. */
const LIFT: Record<Happening['kind'], number> = { fired: 3, fell: 0, struck: 2, sank: 2, took: 0.5, mended: 2, gust: 2 };
/** Seconds of the bed's noise loop. */
const LOOP = 6;

export function createEngine(ctx: BaseAudioContext, ground: (p: Vec3) => number) {
  const mixer = createMixer(ctx);
  const r = rng(0x5ea);
  const noise = ctx.createBuffer(2, Math.round(ctx.sampleRate * LOOP), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const x = noise.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  }
  const bed = createBed(ctx, noise, mixer.bed);
  const listen = createListen(ground), derive = createDerive();
  /** Each sound's takes, as they are made; and those still to make. */
  const bank = new Map<SoundName, AudioBuffer[]>();
  const queue = NAMES.flatMap((name) => Array.from({ length: SOUNDS[name].takes }, (_, i) => ({ name, seed: 1 + i * 7919 })));
  const deeds: Happening[] = [], calls: Call[] = [], lv = levels(), h = heard();

  /** Plays `call` as heard from `eye` at `at` (s on the context's clock). */
  const play = (call: Call, eye: Hearing['scene']['eye'], at: number) => {
    const c = CUES[call.cue], sound = SOUNDS[c.sound], takes = bank.get(c.sound);
    if (!takes?.length) return;
    if (c.bus === 'world' && call.at) {
      if (!hear(eye, call.at, sound.reach, h).audible) return;
    } else close(h);
    const gain = db(sound.level + c.level + (r() - 0.5) * 2) * call.gain;
    mixer.play(takes[Math.floor(r() * takes.length)], c.bus, h, gain, 1 + (r() - 0.5) * 0.06, sound.priority, at);
    if (call.cue === 'fire') mixer.duck(at);
  };

  return {
    /** Makes takes of the sounds still to make, for about `ms` milliseconds (Infinity: all); whether all are made. */
    fill(ms: number): boolean {
      const end = performance.now() + ms;
      while (queue.length && performance.now() < end) {
        const { name, seed } = queue[0];
        const x = SOUNDS[name].make(ctx.sampleRate, seed), b = ctx.createBuffer(1, x.length, ctx.sampleRate);
        b.copyToChannel(x, 0);
        bank.set(name, [...(bank.get(name) ?? []), b]);
        queue.shift();
      }
      return queue.length === 0;
    },
    /** Plays one cue as heard from `eye` at `at` (s on the context's clock). */
    cue: play,
    /** The sound's level (0…1, the settings') from `at`. */
    level: mixer.level,
    /** A frame of `dt` s heard at `at` on the context's clock, the sound's level `level` (0…1); `sounding` false keeps
     *  track of what changes without playing it (the context asleep). */
    update(hearing: Hearing, level: number, at: number, dt: number, sounding = true) {
      const { scene, status } = hearing;
      deeds.length = 0;
      calls.length = 0;
      derive.derive(scene, status, deeds);
      for (const d of deeds) {
        const cue = cueOf(d, scene.own);
        if (cue) calls.push({ cue, at: [d.at[0] * (R + LIFT[d.kind]), d.at[1] * (R + LIFT[d.kind]), d.at[2] * (R + LIFT[d.kind])], gain: 1 });
      }
      const b = listen.listen(hearing, dt, calls);
      if (!sounding) return;
      mixer.level(level, at);
      bed.steer(levelsOf(b, lv), at);
      for (const call of calls) play(call, scene.eye, at);
    },
    /** A tap on something of the UI's, on `screen`: a quill's tick, but in the match, where her controls have their
     *  own sounds. */
    tap(screen: Screen, eye: Hearing['scene']['eye'], at: number) {
      if (screen !== 'match') play({ cue: 'tap', at: null, gain: 1 }, eye, at);
    },
  };
}

/** The page's sound, on the ground `ground` (metres over the sea, for the coast). */
export function createAudio(ground: (p: Vec3) => number) {
  let ctx: AudioContext | null = null, engine: ReturnType<typeof createEngine> | null = null, eye: Hearing['scene']['eye'] | null = null;
  /** Made, or woken, by a touch: WebKit lets a page's sound start only from one. */
  const wake = () => {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      engine = createEngine(ctx, ground);
      const rate = ctx.sampleRate;
      ctx.addEventListener('statechange', () => console.info(`sound ${ctx?.state} at ${rate} Hz`));
      // (a moment of silence played inside the touch, which older WebKit needs to let the context sound at all)
      const hush = new AudioBufferSourceNode(ctx, { buffer: ctx.createBuffer(1, 1, ctx.sampleRate) });
      hush.connect(ctx.destination);
      hush.start();
    }
    if (ctx.state !== 'running' && !document.hidden) void ctx.resume();
  };
  for (const e of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(e, wake, { capture: true, passive: true });
  // asleep while the app is away; woken when it is back (or by the next touch, if the system kept it)
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });

  return {
    /** A frame of `dt` s: what is heard, at the sound level `level` (0…1, the settings'). */
    update(hearing: Hearing, level: number, dt: number) {
      if (!ctx || !engine) return;
      const running = ctx.state === 'running';
      if (running) engine.fill(2);
      eye = hearing.scene.eye;
      engine.update(hearing, level, ctx.currentTime, dt, running);
    },
    /** A tap on something of the UI's, on `screen`. */
    tap(screen: Screen) {
      if (ctx && engine && eye && ctx.state === 'running') engine.tap(screen, eye, ctx.currentTime);
    },
  };
}
