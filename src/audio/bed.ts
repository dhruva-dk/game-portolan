import { clamp } from '../world/scalar.ts';
import type { Bed } from './listen.ts';

interface Levels {
  swell: number;
  swellHz: number;
  wash: number;
  washHz: number;
  hiss: number;
  wind: number;
  windHz: number;
  rig: number;
  rigHz: number;
  surf: number;
  surfHz: number;
  gale: number;
  galeHz: number;
  rain: number;
  strain: number;
  presence: number;
  open: number;
  uncovered: number;
}

export const levels = (): Levels => ({
  swell: 0,
  swellHz: 0,
  wash: 0,
  washHz: 0,
  hiss: 0,
  wind: 0,
  windHz: 0,
  rig: 0,
  rigHz: 0,
  surf: 0,
  surfHz: 0,
  gale: 0,
  galeHz: 0,
  rain: 0,
  strain: 0,
  presence: 0,
  open: 0,
  uncovered: 1,
});

const COVER = 0.04;

export const breakers = (t: number) =>
  clamp(
    Math.max(0, Math.sin((2 * Math.PI * t) / 6.7)) ** 6 +
      0.7 * Math.max(0, Math.sin((2 * Math.PI * t) / 9.1 + 2)) ** 8 +
      0.5 * Math.max(0, Math.sin((2 * Math.PI * t) / 4.3 + 1)) ** 10
  );

const GALE_HEARD = 380,
  GALE_INSIDE = 45;

export const galeOf = (wall: number) =>
  wall >= GALE_HEARD
    ? 0
    : wall > 0
      ? 0.6 * (1 - wall / GALE_HEARD)
      : 0.6 + 0.4 * clamp(-wall / GALE_INSIDE);
const insideOf = (wall: number) => clamp(-wall / GALE_INSIDE + 0.15);

export function levelsOf(b: Bed, out: Levels): Levels {
  const heave = clamp(Math.abs(b.heave) / 1.5),
    speed = clamp(b.speed, 0, 1.6),
    wind = clamp(b.wind);
  out.swell = 0.34 * (0.8 + 0.4 * heave);
  out.swellHz = 300 + 160 * heave;
  out.wash =
    (0.05 + 0.13 * Math.min(1.3, speed)) *
    (0.75 + 0.5 * clamp(0.5 - b.heave / 1.2));
  out.washHz = 550 + 900 * Math.min(1.3, speed);
  out.hiss = 0.035 * speed ** 1.6 * (1 + 0.8 * clamp(-b.heave / 1.5));
  out.wind = 0.035 + 0.12 * wind * wind;
  out.windHz = 300 + 520 * wind;
  out.rig = 0.006 + 0.025 * wind ** 3;
  out.rigHz = 950 + 750 * wind + 300 * clamp(Math.abs(b.roll) / 0.1);
  const near = clamp((230 - b.coast) / 200),
    surf = breakers(b.clock);
  out.surf = near * (0.07 + 0.25 * surf);
  out.surfHz = 420 + 2200 * surf;
  const gale = galeOf(b.wall),
    inside = insideOf(b.wall);
  out.gale = 0.32 * gale;
  out.galeHz = 450 + 1400 * inside;
  out.rain = 0.14 * inside * gale;
  out.strain =
    0.5 *
    clamp((0.45 - b.hull) / 0.45) *
    (0.5 + 0.5 * clamp(Math.abs(b.roll) / 0.06));
  out.presence = clamp(b.presence);
  out.open = 18000 * (450 / 18000) ** clamp(b.muffle);
  out.uncovered = 1 - clamp(b.covered);
  return out;
}

interface Layer {
  gain: GainNode;
  moving: BiquadFilterNode | null;
}

export function createBed(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  out: AudioNode
) {
  const open = new BiquadFilterNode(ctx, {
    type: 'lowpass',
    frequency: 18000,
    Q: 0.5,
  });
  const tilt = new BiquadFilterNode(ctx, {
    type: 'highshelf',
    frequency: 3000,
    gain: -8,
  });
  const presence = new GainNode(ctx, { gain: 0 }),
    uncovered = new GainNode(ctx, { gain: 1 });
  open.connect(tilt).connect(presence).connect(uncovered).connect(out);
  const loops = [1, 0.83, 1.13].map((rate, i) => {
    const src = new AudioBufferSourceNode(ctx, {
      buffer: noise,
      loop: true,
      playbackRate: rate,
    });
    src.start(0, i * 2);
    return src;
  });
  const layer = (
    from: number,
    chain: BiquadFilterOptions[],
    moves: boolean
  ): Layer => {
    const gain = new GainNode(ctx, { gain: 0 });
    const filters = chain.map((o) => new BiquadFilterNode(ctx, o));
    let node: AudioNode = loops[from];
    for (const f of filters) node = node.connect(f);
    node.connect(gain).connect(open);
    return { gain, moving: moves ? filters[0] : null };
  };
  const swell = layer(
    0,
    [
      { type: 'lowpass', frequency: 320, Q: 0.5 },
      { type: 'peaking', frequency: 180, Q: 1, gain: 4 },
      { type: 'highpass', frequency: 60 },
    ],
    true
  );
  const wash = layer(
    0,
    [
      { type: 'bandpass', frequency: 700, Q: 0.6 },
      { type: 'lowpass', frequency: 2500, Q: 0.5 },
    ],
    true
  );
  const hiss = layer(
    0,
    [
      { type: 'highpass', frequency: 1800, Q: 0.6 },
      { type: 'peaking', frequency: 3800, Q: 0.8, gain: 3 },
      { type: 'lowpass', frequency: 8000 },
    ],
    false
  );
  const wind = layer(1, [{ type: 'bandpass', frequency: 400, Q: 0.8 }], true);
  const rig = layer(1, [{ type: 'bandpass', frequency: 1100, Q: 3 }], true);
  const surf = layer(
    2,
    [
      { type: 'lowpass', frequency: 600, Q: 0.6 },
      { type: 'highpass', frequency: 70 },
    ],
    true
  );
  const gale = layer(
    1,
    [
      { type: 'lowpass', frequency: 400, Q: 0.6 },
      { type: 'peaking', frequency: 300, Q: 0.9, gain: 6 },
      { type: 'highpass', frequency: 70 },
    ],
    true
  );
  const rain = layer(
    2,
    [
      { type: 'bandpass', frequency: 5200, Q: 0.5 },
      { type: 'peaking', frequency: 2400, Q: 1, gain: 3 },
    ],
    false
  );
  const strain = layer(
    2,
    [
      { type: 'bandpass', frequency: 270, Q: 6 },
      { type: 'peaking', frequency: 540, Q: 4, gain: 6 },
    ],
    false
  );

  const asked = new Map<AudioParam, number>();
  const glide = (p: AudioParam, v: number, at: number, tau: number) => {
    const was = asked.get(p);
    if (
      was !== undefined &&
      Math.abs(v - was) <= 0.01 * Math.abs(was) &&
      (v === 0) === (was === 0)
    )
      return;
    asked.set(p, v);
    p.setTargetAtTime(v, at, tau);
  };
  const set = (
    l: Layer,
    g: number,
    hz: number | null,
    at: number,
    tau: number
  ) => {
    glide(l.gain.gain, g, at, tau);
    if (l.moving && hz !== null) glide(l.moving.frequency, hz, at, tau);
  };

  return {
    steer(v: Levels, at: number) {
      set(swell, v.swell, v.swellHz, at, 0.4);
      set(wash, v.wash, v.washHz, at, 0.5);
      set(hiss, v.hiss, null, at, 0.25);
      set(wind, v.wind, v.windHz, at, 0.6);
      set(rig, v.rig, v.rigHz, at, 0.8);
      set(surf, v.surf, v.surfHz, at, 0.35);
      set(gale, v.gale, v.galeHz, at, 1.2);
      set(rain, v.rain, null, at, 1.2);
      set(strain, v.strain, null, at, 0.6);
      glide(presence.gain, v.presence, at, 0.5);
      glide(open.frequency, v.open, at, 0.25);
      glide(uncovered.gain, v.uncovered, at, COVER);
    },
  };
}
