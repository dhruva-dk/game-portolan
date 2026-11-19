// The game's sound: driven each frame by what the frame draws and the HUD reads (listen.ts Hearing), and nothing
// else. Every sound is made in code (sounds/*.ts: neither ambientCG nor Poly Haven offers recordings); no music.
//
// The engine (createEngine) runs on any context, the page's or an offline one (tools/audio.ts renders through it):
// each frame the deeds on the sea (the match's own: status.moments) and the rest of what is heard (listen.ts) become
// cues (cues.ts CUES, the one table), each played as heard from the eye (space.ts) in a voice (mixer.ts), and the bed
// follows her (bed.ts).
// The page's sound (createAudio) has one AudioContext, made with the page and started on the first touch (WebKit plays
// nothing before one), put to sleep while the app is away and woken when it is back; its sounds are made in a worker
// (maker.ts), each heard once it is back.

import type { Vec3 } from '../world/sphere.ts';
import { R } from '../world/sphere.ts';
import { NAMES, SOUNDS, type SoundName } from './bank.ts';
import type { Ask, Made } from './maker.ts';
import { createBed, levels, levelsOf } from './bed.ts';
import { CUES, cueOf, soundOf, type Happening } from './cues.ts';
import { db, rng } from './dsp.ts';
import { createListen, type Call, type Hearing } from './listen.ts';
import { createMixer } from './mixer.ts';
import { close, hear, heard } from './space.ts';
import { LIFT, type Screen } from '../player.ts';

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
  const listen = createListen(ground);
  /** The last of the match's moments heard (their seq runs on across matches). */
  let heardTo = 0;
  /** Each sound's takes, as they are made; and those still to make. */
  const bank = new Map<SoundName, AudioBuffer[]>();
  const queue = NAMES.flatMap((name) => Array.from({ length: SOUNDS[name].takes }, (_, i) => ({ name, seed: 1 + i * 7919 })));
  const deeds: Happening[] = [], calls: Call[] = [], lv = levels(), h = heard();
  /** A take of `name` made: heard from now on. */
  const took = (name: SoundName, x: Float32Array<ArrayBuffer>) => {
    const b = ctx.createBuffer(1, x.length, ctx.sampleRate);
    b.copyToChannel(x, 0);
    bank.set(name, [...(bank.get(name) ?? []), b]);
  };

  /** Plays `call` as heard from `eye` at `at` (s on the context's clock). */
  const play = (call: Call, eye: Hearing['scene']['eye'], at: number) => {
    const c = CUES[call.cue], name = soundOf(c, call.gun ?? null), sound = SOUNDS[name], takes = bank.get(name);
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
        took(name, SOUNDS[name].make(ctx.sampleRate, seed));
        queue.shift();
      }
      return queue.length === 0;
    },
    /** The takes still to make, handed over to be made elsewhere (each to come back to `took`). */
    asked(): Ask['takes'] {
      return queue.splice(0);
    },
    took,
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
      for (const m of status.moments) if (m.seq > heardTo) {
        deeds.push(m);
        heardTo = m.seq;
      }
      for (const d of deeds) {
        const cue = cueOf(d, scene.own);
        const lift = R + LIFT[d.kind], gun = 'gun' in d ? d.gun : undefined;
        if (cue) calls.push({ cue, at: [d.at[0] * lift, d.at[1] * lift, d.at[2] * lift], gain: 1, gun });
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
  // made with the page (making one is a long moment, never paid inside a frame), waiting for a touch to start it
  const ctx = new AudioContext({ latencyHint: 'interactive' }), engine = createEngine(ctx, ground), rate = ctx.sampleRate;
  ctx.addEventListener('statechange', () => console.info(`sound ${ctx.state} at ${rate} Hz`));
  const maker = new Worker(new URL('./maker.ts', import.meta.url), { type: 'module' });
  maker.onmessage = (e: MessageEvent<Made>) => engine.took(e.data.name, e.data.x);
  const ask: Ask = { rate, takes: engine.asked() };
  maker.postMessage(ask);
  let eye: Hearing['scene']['eye'] | null = null, hushed = false;
  /** Started, or woken, by a touch: WebKit lets a page's sound start only from one. */
  const wake = () => {
    if (!hushed) {
      // (a moment of silence played inside the touch, which older WebKit needs to let the context sound at all)
      const hush = new AudioBufferSourceNode(ctx, { buffer: ctx.createBuffer(1, 1, rate) });
      hush.connect(ctx.destination);
      hush.start();
      hushed = true;
    }
    if (ctx.state !== 'running' && !document.hidden) void ctx.resume();
  };
  for (const e of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(e, wake, { capture: true, passive: true });
  // asleep while the app is away; woken when it is back (or by the next touch, if the system kept it)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });

  return {
    /** A frame of `dt` s: what is heard, at the sound level `level` (0…1, the settings'). */
    update(hearing: Hearing, level: number, dt: number) {
      const running = ctx.state === 'running';
      eye = hearing.scene.eye;
      engine.update(hearing, level, ctx.currentTime, dt, running);
    },
    /** A tap on something of the UI's, on `screen`. */
    tap(screen: Screen) {
      if (eye && ctx.state === 'running') engine.tap(screen, eye, ctx.currentTime);
    },
  };
}
