// The colour script: the frame's grade, as a three-dimensional lookup table baked from looks for each part of the day
// and each kind of weather, and blended between them as the sun moves and the weather comes and goes.
//
// A look is what a colourist would set on a shot: white balance (warm to cool, green to magenta), contrast about
// middle grey in log space, split toning (one colour pushed into the shadows, another into the highlights, each
// holding its luminance), saturation, and saturation by hue for what the game shows most (the warm of sunlit sails and
// rock, the sea's teal and green, the sky's blue), and a fade that lifts the blacks toward a colour, as fog and haze
// do on film. Looks are mixed by weight (the day's by the sun's height at the eye, and whether it is rising or
// setting; the weather's by how deep the eye is in each kind), and the mixed look is baked into a 33³ table on the CPU
// a few slices a frame, then cross-faded in over the last one, so a change of light is never a step.
//
// The table is applied after AgX, indexed by the display's encoded value, and holds display-linear colour.
import { Data3DTexture, HalfFloatType, LinearFilter, RGBAFormat, ClampToEdgeWrapping, DataUtils, Vector3 } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { Fn, float, max, mix, pow, texture3D, uniform, vec3 } from 'three/tsl';
import type { WeatherDepth } from '../stage.ts';

type V3 = Node<'vec3'>;

/** Texels along each side of the table. */
const N = 33;
/** Slices of the table baked a frame. */
const SLICES = 6;
/** Seconds a newly baked table takes to fade in. */
const FADE = 0.6;

/** A look. Colours are offsets in linear light, small. */
interface Look {
  /** White balance: + warm, − cool; + green, − magenta. */
  temp: number;
  tint: number;
  /** Contrast about middle grey: a power on the light in log space. */
  contrast: number;
  saturation: number;
  /** Saturation of the warm hues (reds to yellows), the sea's (greens to cyans) and the sky's (blues). */
  warm: number;
  sea: number;
  sky: number;
  /** Split toning, in the shadows and the highlights: each channel's gain there, a tenth of it. */
  shadows: readonly [number, number, number];
  highlights: readonly [number, number, number];
  /** Lifts the blacks toward this colour by this much. */
  fade: number;
  fadeTo: readonly [number, number, number];
}

const NEUTRAL: Look = {
  temp: 0, tint: 0, contrast: 1, saturation: 1, warm: 1, sea: 1, sky: 1, shadows: [0, 0, 0], highlights: [0, 0, 0], fade: 0, fadeTo: [0, 0, 0],
};
const look = (l: Partial<Look>): Look => ({ ...NEUTRAL, ...l });

/** The day's looks, by the sun's height over the horizon at the eye. */
const DAY = {
  /** Moonlight: cold, the shadows a deep blue, the lights silver, colour mostly gone. */
  night: look({ temp: -0.5, tint: -0.05, contrast: 1.06, saturation: 0.72, warm: 0.8, sea: 1.1, sky: 1.1, shadows: [-0.004, 0, 0.012], highlights: [-0.01, 0.005, 0.02], fade: 0.012, fadeTo: [0.02, 0.03, 0.07] }),
  /** The blue hour: violet in the lights, blue in the shadows. */
  dusk: look({ temp: -0.25, tint: -0.12, contrast: 1.04, saturation: 0.95, warm: 1.2, sea: 0.95, sky: 1.15, shadows: [0, 0, 0.012], highlights: [0.02, -0.006, 0.018], fade: 0.01, fadeTo: [0.05, 0.03, 0.09] }),
  /** Dawn: rose and cool gold, softer than the evening. */
  dawn: look({ temp: 0.25, tint: -0.1, contrast: 1.03, saturation: 1.08, warm: 1.15, sea: 1, sky: 1.05, shadows: [-0.004, 0.002, 0.012], highlights: [0.03, 0.008, 0.012], fade: 0.006, fadeTo: [0.06, 0.04, 0.07] }),
  /** The golden hour: orange lights against teal shadows. */
  golden: look({ temp: 0.55, tint: 0.02, contrast: 1.08, saturation: 1.14, warm: 1.25, sea: 1.08, sky: 0.95, shadows: [-0.008, 0.004, 0.012], highlights: [0.04, 0.012, -0.012], fade: 0, fadeTo: [0, 0, 0] }),
  /** Morning and afternoon: a little warm, clear. */
  day: look({ temp: 0.1, contrast: 1.04, saturation: 1.06, warm: 1.06, sea: 1.08, sky: 1.02, shadows: [-0.003, 0.001, 0.006], highlights: [0.006, 0.003, -0.002] }),
  /** Noon in the tropics: punchy, the sea at its most turquoise, the shadows a little cool. */
  noon: look({ temp: 0.02, contrast: 1.06, saturation: 1.06, warm: 1.02, sea: 1.15, sky: 1.06, shadows: [-0.004, 0.001, 0.008], highlights: [0.004, 0.003, 0] }),
};

/** The weather's looks, mixed over the day's by how deep in it the eye is. */
const WEATHER: Partial<Record<keyof WeatherDepth, Look>> = {
  fog: look({ temp: -0.12, contrast: 0.86, saturation: 0.72, warm: 0.9, sea: 0.85, sky: 0.8, shadows: [0, 0.002, 0.006], fade: 0.06, fadeTo: [0.42, 0.46, 0.5] }),
  rain: look({ temp: -0.25, tint: 0.02, contrast: 0.95, saturation: 0.74, warm: 0.85, sea: 0.9, sky: 0.85, shadows: [-0.004, 0, 0.01], highlights: [-0.004, 0.002, 0.008], fade: 0.02, fadeTo: [0.16, 0.19, 0.23] }),
  thunder: look({ temp: -0.2, tint: 0.14, contrast: 1.12, saturation: 0.62, warm: 0.8, sea: 0.85, sky: 0.75, shadows: [-0.006, 0.003, 0.004], highlights: [-0.004, 0.01, 0.004], fade: 0.015, fadeTo: [0.07, 0.1, 0.1] }),
  snow: look({ temp: -0.38, contrast: 0.94, saturation: 0.8, warm: 0.85, sea: 0.95, sky: 1, shadows: [-0.004, 0, 0.012], highlights: [-0.006, 0, 0.012], fade: 0.03, fadeTo: [0.45, 0.5, 0.6] }),
  ash: look({ temp: 0.5, tint: -0.02, contrast: 1.1, saturation: 0.7, warm: 1.2, sea: 0.7, sky: 0.6, shadows: [0.008, 0, -0.006], highlights: [0.02, 0.006, -0.01], fade: 0.03, fadeTo: [0.2, 0.12, 0.08] }),
  calm: look({ temp: 0.08, contrast: 1.02, saturation: 1.08, sea: 1.12, sky: 1.08 }),
};

const KEYS: readonly (keyof Look)[] = ['temp', 'tint', 'contrast', 'saturation', 'warm', 'sea', 'sky', 'shadows', 'highlights', 'fade', 'fadeTo'];

/** Weighted sum of looks (the weights need not add to one: the rest is left neutral). */
function blend(parts: readonly (readonly [Look, number])[]): Look {
  const out = { ...NEUTRAL, shadows: [0, 0, 0], highlights: [0, 0, 0], fadeTo: [0, 0, 0] } as { [K in keyof Look]: Look[K] } & Record<string, unknown>;
  let total = 0;
  for (const [, w] of parts) total += w;
  const rest = Math.max(0, 1 - total);
  for (const k of KEYS) {
    const base = NEUTRAL[k];
    if (Array.isArray(base)) {
      const v = [0, 1, 2].map((i) => parts.reduce((s, [l, w]) => s + (l[k] as readonly number[])[i] * w, 0) + (base as readonly number[])[i] * rest);
      (out as Record<string, unknown>)[k] = v;
    } else {
      (out as Record<string, unknown>)[k] = parts.reduce((s, [l, w]) => s + (l[k] as number) * w, 0) + (base as number) * rest;
    }
  }
  // the fade's colour is where its weight lies
  const fade = parts.reduce((s, [l, w]) => s + l.fade * w, 0);
  if (fade > 1e-5) (out as Record<string, unknown>).fadeTo = [0, 1, 2].map((i) => parts.reduce((s, [l, w]) => s + l.fadeTo[i] * l.fade * w, 0) / fade);
  return out as Look;
}

/** The look for the sun's height over the horizon at the eye (its sine) and whether it is rising. */
function dayLook(elevation: number, rising: boolean): Look {
  const e = elevation;
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (e - a) / (b - a)));
  const twilight = rising ? DAY.dawn : DAY.dusk;
  const low = rising ? DAY.dawn : DAY.golden;
  // night → twilight → the low sun → day → noon
  const parts: [Look, number][] = [];
  const n = 1 - ramp(-0.22, -0.06), t = ramp(-0.22, -0.06) * (1 - ramp(-0.02, 0.06)), g = ramp(-0.02, 0.06) * (1 - ramp(0.16, 0.34));
  const d = ramp(0.16, 0.34) * (1 - ramp(0.55, 0.8)), m = ramp(0.55, 0.8);
  parts.push([DAY.night, n], [twilight, t], [low, g], [DAY.day, d], [DAY.noon, m]);
  return blend(parts);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Each step of the table's side, decoded to linear. */
const LINEAR = Float64Array.from({ length: N }, (_, i) => (i / (N - 1)) ** 2.2);

/** One texel of the table: the encoded display value in (by its steps along the table), display-linear out. */
function grade(l: Look, r: number, g: number, b: number, out: number[]): void {
  // to linear, white balanced
  let R = LINEAR[r] * (1 + l.temp * 0.09 - l.tint * 0.02), G = LINEAR[g] * (1 + l.tint * 0.05), B = LINEAR[b] * (1 - l.temp * 0.09 - l.tint * 0.02);
  // contrast about middle grey, in log
  const k = l.contrast;
  R = 0.18 * (Math.max(R, 1e-6) / 0.18) ** k; G = 0.18 * (Math.max(G, 1e-6) / 0.18) ** k; B = 0.18 * (Math.max(B, 1e-6) / 0.18) ** k;
  // split toning: a gain per channel in the shadows and another in the highlights (each tone's colour, ten times over,
  // as a share), the luminance held
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const ws = 1 - smooth(0.0, 0.25, Y), wh = smooth(0.2, 0.8, Y);
  const gain = (i: number) => 1 + (l.shadows[i] * ws + l.highlights[i] * wh) * 10;
  R *= gain(0); G *= gain(1); B *= gain(2);
  const Yt = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  if (Yt > 1e-6) { const k = Y / Yt; R *= k; G *= k; B *= k; }
  // saturation, overall and by hue
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), chroma = mx - mn;
  let hue = 0;
  if (chroma > 1e-6) {
    if (mx === R) hue = ((G - B) / chroma + 6) % 6;
    else if (mx === G) hue = (B - R) / chroma + 2;
    else hue = (R - G) / chroma + 4;
  }
  hue *= 60;
  const band = (centre: number, width: number) => {
    const d = Math.abs(((hue - centre + 540) % 360) - 180);
    return Math.max(0, 1 - d / width);
  };
  const s = l.saturation * (1 + (l.warm - 1) * band(35, 50) + (l.sea - 1) * band(170, 45) + (l.sky - 1) * band(220, 40));
  const y2 = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  R = y2 + (R - y2) * s; G = y2 + (G - y2) * s; B = y2 + (B - y2) * s;
  // the fade lifts the blacks
  out[0] = Math.max(0, R * (1 - l.fade) + l.fadeTo[0] * l.fade);
  out[1] = Math.max(0, G * (1 - l.fade) + l.fadeTo[1] * l.fade);
  out[2] = Math.max(0, B * (1 - l.fade) + l.fadeTo[2] * l.fade);
}

function table(): Data3DTexture {
  const data = new Uint16Array(N * N * N * 4);
  const t = new Data3DTexture(data, N, N, N);
  t.format = RGBAFormat;
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  // the identity, so the first frames are as they were
  const c = [0, 0, 0];
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    grade(NEUTRAL, x, y, z, c);
    const o = ((z * N + y) * N + x) * 4;
    data[o] = DataUtils.toHalfFloat(c[0]); data[o + 1] = DataUtils.toHalfFloat(c[1]); data[o + 2] = DataUtils.toHalfFloat(c[2]); data[o + 3] = DataUtils.toHalfFloat(1);
  }
  t.needsUpdate = true;
  return t;
}

const tables = [table(), table()];
const older = texture3D(tables[0]), newer = texture3D(tables[1]);
const mixing = uniform(1);

/** The grade, on AgX's display-linear output. */
export const graded = Fn(([c]: [V3]) => {
  const at = pow(max(c, vec3(0)), vec3(1 / 2.2)).mul((N - 1) / N).add(0.5 / N);
  return mix(older.sample(at).level(float(0)).rgb, newer.sample(at).level(float(0)).rgb, mixing);
});

/** What the colour script reads each frame. */
export interface GradeInput {
  /** The sun's height over the horizon at the eye: the sine of its elevation. */
  elevation: number;
  rising: boolean;
  weather: WeatherDepth;
}

export class ColourScript {
  /** The look the newer table holds, and the one being baked. */
  #shown: Look = NEUTRAL;
  #baking: Look | null = null;
  #slice = 0;
  #staging = new Uint16Array(N * N * N * 4);
  #texel = [0, 0, 0];
  /** The look as it stands this frame, for tests and tuning. */
  current: Look = NEUTRAL;

  update(input: GradeInput, dt: number): void {
    const day = dayLook(input.elevation, input.rising);
    const parts: [Look, number][] = [];
    let weight = 0;
    for (const [kind, l] of Object.entries(WEATHER) as [keyof WeatherDepth, Look][]) {
      const w = Math.min(1, input.weather[kind] ?? 0);
      if (w > 0.01) { parts.push([l, w]); weight += w; }
    }
    // the weather over the day: where the eye is deep in it, its look is most of the grade
    const over = Math.min(1, weight);
    const scaled = parts.map(([l, w]) => [l, (w / Math.max(weight, 1e-6)) * over] as [Look, number]);
    this.current = blend([[day, 1 - over], ...scaled]);
    // fade in what has been baked
    if (mixing.value < 1) mixing.value = Math.min(1, mixing.value + dt / FADE);
    if (this.#baking) {
      this.#bake();
      return;
    }
    if (mixing.value >= 1 && differs(this.current, this.#shown)) {
      this.#baking = this.current;
      this.#slice = 0;
    }
  }

  /** A few slices of the table a frame; once whole, it becomes the newer table and the newer the older. */
  #bake(): void {
    const l = this.#baking!, data = this.#staging, c = this.#texel;
    const end = Math.min(N, this.#slice + SLICES);
    for (let z = this.#slice; z < end; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      grade(l, x, y, z, c);
      const o = ((z * N + y) * N + x) * 4;
      data[o] = DataUtils.toHalfFloat(c[0]); data[o + 1] = DataUtils.toHalfFloat(c[1]); data[o + 2] = DataUtils.toHalfFloat(c[2]); data[o + 3] = 15360;
    }
    this.#slice = end;
    if (end < N) return;
    // the newer table becomes the older; the one just baked fades in over it
    const was = newer.value as Data3DTexture, next = older.value as Data3DTexture;
    (next.image.data as Uint16Array).set(data);
    next.needsUpdate = true;
    older.value = was;
    newer.value = next;
    mixing.value = 0;
    this.#shown = l;
    this.#baking = null;
  }
}

function differs(a: Look, b: Look): boolean {
  for (const k of KEYS) {
    const x = a[k], y = b[k];
    if (Array.isArray(x)) {
      for (let i = 0; i < 3; i++) if (Math.abs((x as number[])[i] - (y as readonly number[])[i]) > 0.002) return true;
    } else if (Math.abs((x as number) - (y as number)) > 0.01) return true;
  }
  return false;
}

/** The east at a point on the planet (which turns about y), to tell a rising sun from a setting one. */
export function rising(up: Vector3, sun: Vector3): boolean {
  const ex = up.z, ez = -up.x;
  return sun.x * ex + sun.z * ez > 0;
}
