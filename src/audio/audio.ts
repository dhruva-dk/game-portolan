import { STRIDE, random } from '../world/random.ts';
import { R, type Vec3 } from '../world/sphere.ts';
import { NAMES, SOUNDS, type SoundName } from './bank.ts';
import type { Ask, Made } from './maker.ts';
import { createBed, levels, levelsOf } from './bed.ts';
import {
  CUES,
  CUE_NAMES,
  cueOf,
  soundOf,
  type Cue,
  type Happening,
} from './cues.ts';
import { db } from './dsp.ts';
import { createListen, type Call, type Hearing } from './listen.ts';
import { createMixer } from './mixer.ts';
import { close, hear, heard } from './space.ts';
import { LIFT, type Screen } from '../play/player.ts';

const LOOP = 6;

function createEngine(ctx: BaseAudioContext, ground: (p: Vec3) => number) {
  const mixer = createMixer(ctx);
  const r = random(0x5ea);
  const noise = ctx.createBuffer(
    2,
    Math.round(ctx.sampleRate * LOOP),
    ctx.sampleRate
  );
  for (let c = 0; c < 2; c++) {
    const x = noise.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  }
  const bed = createBed(ctx, noise, mixer.bed);
  const listen = createListen(ground);
  let heardTo = 0;
  const bank = new Map<SoundName, AudioBuffer[]>();
  const first = new Set<SoundName>(
    CUE_NAMES.filter((c) => CUES[c].bus === 'ui').map((c) =>
      soundOf(CUES[c], null)
    )
  );
  const queue = [
    ...NAMES.filter((n) => first.has(n)),
    ...NAMES.filter((n) => !first.has(n)),
  ].flatMap((name) =>
    Array.from({ length: SOUNDS[name].takes }, (_, i) => ({
      name,
      seed: 1 + i * STRIDE,
    }))
  );
  const deeds: Happening[] = [],
    calls: Call[] = [],
    lv = levels(),
    h = heard();
  const took = (name: SoundName, x: Float32Array<ArrayBuffer>) => {
    const b = ctx.createBuffer(1, x.length, ctx.sampleRate);
    b.copyToChannel(x, 0);
    bank.set(name, [...(bank.get(name) ?? []), b]);
  };

  const play = (
    call: Call,
    eye: Hearing['scene']['eye'] | null,
    at: number
  ) => {
    const c = CUES[call.cue],
      name = soundOf(c, call.gun ?? null),
      sound = SOUNDS[name],
      takes = bank.get(name);
    if (!takes?.length) return;
    if (c.bus === 'world' && call.at) {
      if (!eye || !hear(eye, call.at, sound.reach, h).audible) return;
    } else close(h);
    const gain = db(sound.level + c.level + (r() - 0.5) * 2) * call.gain;
    mixer.play(
      takes[Math.floor(r() * takes.length)],
      c.bus,
      h,
      gain,
      1 + (r() - 0.5) * 0.06,
      sound.priority,
      at
    );
    if (call.cue === 'fire') mixer.duck(at);
  };

  return {
    fill(ms: number): boolean {
      const end = performance.now() + ms;
      while (queue.length && performance.now() < end) {
        const { name, seed } = queue[0];
        took(name, SOUNDS[name].make(ctx.sampleRate, seed));
        queue.shift();
      }
      return queue.length === 0;
    },
    asked(): Ask['takes'] {
      return queue.splice(0);
    },
    took,
    cue: play,
    level: mixer.level,
    update(
      hearing: Hearing,
      level: number,
      at: number,
      dt: number,
      sounding = true
    ) {
      const { scene, status } = hearing;
      deeds.length = 0;
      calls.length = 0;
      for (const m of status.moments)
        if (m.seq > heardTo) {
          deeds.push(m);
          heardTo = m.seq;
        }
      for (const d of deeds) {
        const cue = cueOf(d, scene.own);
        const lift = R + LIFT[d.kind],
          gun = 'gun' in d ? d.gun : undefined;
        if (cue)
          calls.push({
            cue,
            at: [d.at[0] * lift, d.at[1] * lift, d.at[2] * lift],
            gain: 1,
            gun,
          });
      }
      const b = listen.listen(hearing, dt, calls);
      if (!sounding) return;
      mixer.level(level, at);
      bed.steer(levelsOf(b, lv), at);
      for (const call of calls) play(call, scene.eye, at);
    },
    tap(screen: Screen, eye: Hearing['scene']['eye'] | null, at: number) {
      if (screen !== 'match') play({ cue: 'tap', at: null, gain: 1 }, eye, at);
    },
  };
}

export function createAudio(ground: (p: Vec3) => number) {
  const ctx = new AudioContext({ latencyHint: 'interactive' }),
    engine = createEngine(ctx, ground),
    rate = ctx.sampleRate;
  ctx.addEventListener('statechange', () =>
    console.info(`sound ${ctx.state} at ${rate} Hz`)
  );
  const maker = new Worker(new URL('./maker.ts', import.meta.url), {
    type: 'module',
  });
  maker.onmessage = (e: MessageEvent<Made>) =>
    engine.took(e.data.name, e.data.x);
  const ask: Ask = { rate, takes: engine.asked() };
  maker.postMessage(ask);
  let eye: Hearing['scene']['eye'] | null = null,
    hushed = false;
  const wake = () => {
    if (!hushed) {
      const hush = new AudioBufferSourceNode(ctx, {
        buffer: ctx.createBuffer(1, 1, rate),
      });
      hush.connect(ctx.destination);
      hush.start();
      hushed = true;
    }
    if (ctx.state !== 'running' && !document.hidden) void ctx.resume();
  };
  for (const e of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
    addEventListener(e, wake, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });

  return {
    update(hearing: Hearing, level: number, dt: number) {
      const running = ctx.state === 'running';
      eye = hearing.scene.eye;
      engine.update(hearing, level, ctx.currentTime, dt, running);
    },
    tap(screen: Screen) {
      if (ctx.state === 'running') engine.tap(screen, eye, ctx.currentTime);
    },
    sample() {
      if (ctx.state === 'running')
        engine.cue({ cue: 'ready', at: null, gain: 1 }, eye, ctx.currentTime);
    },
    cue(cue: Cue) {
      if (ctx.state === 'running')
        engine.cue({ cue, at: null, gain: 1 }, eye, ctx.currentTime);
    },
    level(v: number) {
      engine.level(v, ctx.currentTime);
    },
  };
}
