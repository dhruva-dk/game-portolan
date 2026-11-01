// Cloud formations you can see coming from far away: a cumulonimbus tower with its anvil over thunder, a heavy
// deck over rain, a soft white deck over snow, brown billows over ash, a fog bank lying on the sea, and a few fair
// puffs over calm. Each is a few hundred lit, soft puffs laid out once per system from its id, placed on the
// sphere each frame and sorted back to front. Grey curtains of rain, snow and ash hang from the decks to the sea.
import * as THREE from 'three';
import { SpriteBatch } from './batch.ts';
import {
  FRAG_END, frameAt, newFrame, placeOn, rng, smoothstep, weatherMaterial, type Frame, type Shared, type WeatherKind,
} from './common.ts';
import type { WeatherSystem } from './types.ts';

interface Puff {
  /** Offsets in system radii: u downwind, v across the wind. */
  u: number; v: number;
  /** Height above the sea, metres. */
  h: number;
  size: number;
  /** Vertical squash when seen side-on. */
  flat: number;
  /** 0 at the formation's base, 1 at its top: bases are dark. */
  shade: number;
  /** The intensity at which it appears: the core first, the anvil last. */
  rank: number;
  seed: number;
}

interface Curtain { u: number; v: number; width: number; rank: number; seed: number }

interface Formation {
  puffs: Puff[];
  curtains: Curtain[];
  /** Albedo, and how dark the formation's base is (0 black, 1 as lit as the top). */
  tint: [number, number, number];
  dark: number;
  /** Height of the deck's base, where curtains start; and the middle of the mass, for its sunward side. */
  base: number;
  middle: number;
  /** Curtain kind: 0 rain, 1 heavy rain, 2 snow, 3 ash, -1 none. */
  fall: number;
}

const disc = (r: () => number, max: number): [number, number] => {
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * max;
  return [Math.cos(a) * d, Math.sin(a) * d];
};
const span = (r: () => number, a: number, b: number): number => a + (b - a) * r();

function curtains(r: () => number, n: number, reach: number, w0: number, w1: number): Curtain[] {
  const out: Curtain[] = [];
  for (let i = 0; i < n; i++) {
    const [u, v] = disc(r, reach);
    out.push({ u, v, width: span(r, w0, w1), rank: Math.hypot(u, v) / reach * 0.7, seed: r() });
  }
  return out;
}

/** Lays out one system's formation. Pure: the same id and kind always give the same clouds. */
export function formation(kind: WeatherKind, id: number): Formation {
  const r = rng(0x9e3779b9 ^ Math.imul(id + 1, 2654435761) ^ kind.length * 7919);
  const puffs: Puff[] = [];
  const add = (p: Omit<Puff, 'seed'>): void => { puffs.push({ ...p, seed: r() }); };
  switch (kind) {
    case 'thunder': {
      // a dark shelf at the base, a boiling tower, an anvil sheared downwind, and ragged scud beneath
      for (let i = 0; i < 38; i++) {
        const [u, v] = disc(r, 0.75);
        add({ u, v, h: span(r, 44, 56), size: span(r, 26, 40), flat: 0.42, shade: span(r, 0, 0.12), rank: Math.hypot(u, v) * 0.6 });
      }
      for (let i = 0; i < 84; i++) {
        const t = Math.pow(r(), 0.85), [u, v] = disc(r, 0.34 * (1 - 0.3 * t) + 0.05 * Math.sin(t * 9));
        add({ u: u + 0.12 * t, v, h: 56 + t * 150, size: span(r, 24, 38) * (1 - 0.2 * t), flat: 0.85, shade: 0.15 + 0.85 * t, rank: 0.08 + t * 0.6 });
      }
      for (let i = 0; i < 58; i++) {
        const a = span(r, -0.4, 1.35), w = (1 - Math.abs(a - 0.45) * 0.45) * 0.55;
        add({ u: a, v: span(r, -w, w), h: span(r, 198, 232) - Math.abs(a - 0.45) * 14, size: span(r, 30, 46), flat: 0.34, shade: span(r, 0.82, 1), rank: span(r, 0.55, 0.95) });
      }
      for (let i = 0; i < 16; i++) {
        const [u, v] = disc(r, 0.9);
        add({ u, v, h: span(r, 36, 46), size: span(r, 14, 22), flat: 0.6, shade: 0, rank: span(r, 0.35, 0.9) });
      }
      return { puffs, curtains: curtains(r, 40, 0.55, 14, 30), tint: [0.72, 0.74, 0.8], dark: 0.2, base: 46, middle: 120, fall: 1 };
    }
    case 'rain': {
      for (let i = 0; i < 112; i++) {
        const [u, v] = disc(r, 0.95), h = span(r, 52, 78);
        add({ u, v, h, size: span(r, 26, 40), flat: 0.5, shade: (h - 52) / 52, rank: Math.hypot(u, v) * 0.7 });
      }
      for (let i = 0; i < 42; i++) {
        const [u, v] = disc(r, 0.65), t = r();
        add({ u, v, h: 78 + t * 48, size: span(r, 22, 34), flat: 0.75, shade: 0.5 + 0.5 * t, rank: 0.3 + t * 0.6 });
      }
      for (let i = 0; i < 18; i++) {
        const [u, v] = disc(r, 0.85);
        add({ u, v, h: span(r, 34, 44), size: span(r, 14, 24), flat: 0.55, shade: 0, rank: span(r, 0.3, 0.9) });
      }
      return { puffs, curtains: curtains(r, 34, 0.8, 16, 34), tint: [0.8, 0.82, 0.86], dark: 0.34, base: 50, middle: 72, fall: 0 };
    }
    case 'fog': {
      // a bank lying on the sea, thickest in the middle, with tendrils reaching out along a few arms
      const arms = Array.from({ length: 5 }, () => r() * Math.PI * 2);
      for (let i = 0; i < 150; i++) {
        let u: number, v: number;
        if (r() < 0.3) {
          const a = arms[Math.floor(r() * arms.length)] + span(r, -0.18, 0.18), d = span(r, 0.5, 1.15);
          u = Math.cos(a) * d; v = Math.sin(a) * d;
        } else [u, v] = disc(r, 0.85);
        const edge = Math.hypot(u, v), h = span(r, 5, 20) * (1 - 0.4 * edge);
        add({ u, v, h, size: span(r, 28, 46) * (1 - 0.35 * edge), flat: 0.42, shade: 0.4 + 0.6 * (h / 20), rank: edge * 0.85 });
      }
      return { puffs, curtains: [], tint: [0.9, 0.92, 0.94], dark: 0.78, base: 0, middle: 12, fall: -1 };
    }
    case 'snow': {
      for (let i = 0; i < 100; i++) {
        const [u, v] = disc(r, 0.95), h = span(r, 58, 90);
        add({ u, v, h, size: span(r, 26, 38), flat: 0.55, shade: (h - 58) / 40, rank: Math.hypot(u, v) * 0.7 });
      }
      for (let i = 0; i < 26; i++) {
        const [u, v] = disc(r, 0.6), t = r();
        add({ u, v, h: 90 + t * 30, size: span(r, 22, 30), flat: 0.7, shade: 0.75 + 0.25 * t, rank: 0.4 + t * 0.5 });
      }
      return { puffs, curtains: curtains(r, 28, 0.8, 20, 36), tint: [0.94, 0.96, 1], dark: 0.55, base: 56, middle: 80, fall: 2 };
    }
    case 'ash': {
      // lumpy brown billows clustered round a few heads, low and dark
      const heads = Array.from({ length: 8 }, () => disc(r, 0.7));
      for (let i = 0; i < 132; i++) {
        const [hu, hv] = heads[Math.floor(r() * heads.length)], [du, dv] = disc(r, 0.28), t = Math.pow(r(), 1.3);
        const u = hu + du, v = hv + dv;
        add({ u, v, h: 30 + t * 110, size: span(r, 24, 42), flat: 0.72, shade: t, rank: Math.hypot(u, v) * 0.8 });
      }
      return { puffs, curtains: curtains(r, 22, 0.7, 18, 30), tint: [0.42, 0.39, 0.36], dark: 0.35, base: 34, middle: 80, fall: 3 };
    }
    case 'calm': {
      // a few small fair-weather heaps, high and bright
      for (let c = 0; c < 8; c++) {
        const [cu, cv] = disc(r, 1.3), h0 = span(r, 112, 135), n = 5 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) {
          const t = r();
          add({ u: cu + span(r, -0.09, 0.09), v: cv + span(r, -0.09, 0.09), h: h0 + t * 12, size: span(r, 10, 17), flat: 0.6, shade: t, rank: c / 8 });
        }
      }
      return { puffs, curtains: [], tint: [1, 1, 1], dark: 0.62, base: 0, middle: 125, fall: -1 };
    }
    default:
      return { puffs, curtains: [], tint: [1, 1, 1], dark: 1, base: 0, middle: 0, fall: -1 };
  }
}

const PUFF_VERT = /* glsl */ `
attribute vec4 aPos;   // world centre, size
attribute vec4 aInfo;  // seed, shade, alpha, flat
attribute vec4 aTint;  // albedo, base darkness
attribute vec4 aGlow;  // emitted light (lightning, embers), sunward side of the formation
varying vec2 vQ;
varying vec4 vInfo;
varying vec4 vTint;
varying vec4 vGlow;
varying vec3 vWorld, vRight, vBup, vFwd;
varying float vSize;
void main() {
  vec3 c = aPos.xyz;
  float s = aPos.w * (1.0 + 0.06 * sin(uTime * 0.13 + aInfo.x * 40.0));
  vec3 toCam = cameraPosition - c;
  vec3 fwd = normalize(toCam);
  vec3 up = normalize(c);
  vec3 right = cross(up, fwd);
  float rl = length(right);
  right = rl > 1e-3 ? right / rl : normalize(cross(vec3(0.0, 0.0, 1.0), fwd));
  vec3 bup = cross(fwd, right);
  // squashed when seen side-on, round from below or above
  float squash = mix(1.0, aInfo.w, 1.0 - abs(dot(fwd, up)));
  vec3 p = c + right * position.x * s + bup * position.y * s * squash;
  vQ = position.xy * 2.0;
  vInfo = aInfo; vTint = aTint; vGlow = aGlow;
  vWorld = p; vRight = right; vBup = bup; vFwd = fwd; vSize = s;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

/** Shades one soft puff: billowy edges, a sunward side, a dark base, silver linings and light from within. */
export const PUFF_GLSL = /* glsl */ `
vec4 shadePuff(vec2 q, float seed, float shade, float alpha, vec3 tint, float dark, vec3 glow, float formSun,
               vec3 world, vec3 right, vec3 bup, vec3 fwd, float size) {
  float r2 = dot(q, q);
  if (r2 > 1.0) return vec4(0.0);
  float a0 = seed * 6.2832, ca = cos(a0), sa = sin(a0);
  vec2 rq = mat2(ca, -sa, sa, ca) * q;
  vec2 nuv = rq * 0.34 + vec2(seed * 3.7, seed * 1.3) + uTime * vec2(0.0035, 0.0015);
  float cell = texture2D(uNoise, nuv).a;
  float fb = texture2D(uNoise, nuv * 2.3 + 0.5).r;
  float dens = (1.0 - r2) * 1.3 + (cell - 0.55) * 0.95 + (fb - 0.5) * 0.5;
  float a = smoothstep(0.0, 0.55, dens) * alpha;
  float h = length(world) - uRadius;
  a *= smoothstep(-1.0, 7.0, h);
  float dist = length(world - cameraPosition);
  a *= smoothstep(size * 0.35, size * 1.3, dist);
  if (a < 0.003) return vec4(0.0);
  vec3 n = normalize(right * (q.x + (cell - 0.5) * 0.6) + bup * (q.y + (fb - 0.5) * 0.6) + fwd * sqrt(max(1.0 - r2, 0.0)));
  vec3 up = normalize(world);
  float lam = clamp(dot(n, uSunDir) * 0.55 + 0.45, 0.0, 1.0);
  vec3 vdir = normalize(world - cameraPosition);
  float toward = max(dot(vdir, uSunDir), 0.0);
  float thin = 1.0 - smoothstep(0.1, 0.75, dens);
  float silver = pow(toward, 6.0) * thin * 2.4 + pow(toward, 2.0) * 0.22;
  float lit = mix(dark, 1.0, shade) * mix(0.42, 1.0, formSun);
  vec3 amb = skyAmbient(up) * mix(0.55, 1.1, shade) + moonColor(up) * (0.4 + 0.6 * lam) * lit;
  vec3 col = tint * (amb + sunColor(up, h) * (lam * lit + silver * mix(0.5, 1.0, lit)));
  col += glow * (0.55 + 0.45 * (1.0 - shade)) * (0.6 + 0.6 * thin);
  return vec4(haze(col, dist) * uGain, a);
}`;

const PUFF_FRAG = /* glsl */ `
varying vec2 vQ;
varying vec4 vInfo;
varying vec4 vTint;
varying vec4 vGlow;
varying vec3 vWorld, vRight, vBup, vFwd;
varying float vSize;
${PUFF_GLSL}
void main() {
  vec4 c = shadePuff(vQ, vInfo.x, vInfo.y, vInfo.z, vTint.rgb, vTint.w, vGlow.rgb, vGlow.w, vWorld, vRight, vBup, vFwd, vSize);
  if (c.a < 0.003) discard;
  gl_FragColor = c;
  ${FRAG_END}
}`;

const CURTAIN_VERT = /* glsl */ `
attribute vec4 aPos;  // bottom, width
attribute vec4 aTop;  // top, seed
attribute vec4 aInfo; // alpha, kind, glow, length
varying vec2 vUv;
varying vec4 vInfo;
varying vec3 vWorld;
varying float vSeed, vWidth;
void main() {
  vec3 b = aPos.xyz, t = aTop.xyz, axis = t - b;
  vec3 mid = (b + t) * 0.5;
  vec3 side = normalize(cross(axis, cameraPosition - mid));
  vec3 p = mix(b, t, position.y + 0.5) + side * position.x * aPos.w;
  vUv = uv; vInfo = aInfo; vWorld = p; vSeed = aTop.w; vWidth = aPos.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const CURTAIN_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vInfo;
varying vec3 vWorld;
varying float vSeed, vWidth;
void main() {
  float kind = vInfo.y;
  float x = vUv.x, y = vUv.y;
  float edge = smoothstep(0.0, 0.4, x) * smoothstep(1.0, 0.6, x);
  float ends = smoothstep(0.0, 0.06, y) * smoothstep(1.0, 0.72, y);
  float speed = kind > 2.5 ? 0.025 : kind > 1.5 ? 0.04 : 0.55;
  vec2 st = vec2(x * vWidth * 0.11 + vSeed * 17.0, y * vInfo.w * 0.004 + uTime * speed);
  float streak = texture2D(uNoise, st * vec2(1.0, kind > 1.5 ? 1.2 : 0.18)).b;
  float clump = texture2D(uNoise, vec2(x * 0.35 + vSeed * 5.0, y * 0.25 + uTime * speed * 0.15)).g;
  float dens = smoothstep(0.3, 0.8, streak * 0.6 + clump * 0.7);
  float a = edge * ends * (0.25 + 0.75 * dens) * vInfo.x;
  float dist = length(vWorld - cameraPosition);
  a *= smoothstep(8.0, 40.0, dist);
  if (a < 0.003) discard;
  vec3 up = normalize(vWorld);
  float h = length(vWorld) - uRadius;
  vec3 tint = kind > 2.5 ? vec3(0.4, 0.37, 0.34) : kind > 1.5 ? vec3(0.95, 0.97, 1.0) : kind > 0.5 ? vec3(0.62, 0.66, 0.72) : vec3(0.72, 0.76, 0.82);
  vec3 vdir = normalize(vWorld - cameraPosition);
  float back = pow(max(dot(vdir, uSunDir), 0.0), 4.0);
  vec3 col = tint * (skyAmbient(up) * 0.9 + moonColor(up) * 0.6 + sunColor(up, h) * (0.25 + 1.2 * back));
  col += vec3(0.75, 0.82, 1.0) * vInfo.z;
  gl_FragColor = vec4(haze(col, dist) * uGain, a);
  ${FRAG_END}
}`;

/** A point of lightning light, for the clouds round it. */
export interface Flash { pos: THREE.Vector3; power: number }

export class Clouds {
  readonly group = new THREE.Group();
  private readonly puffs: SpriteBatch;
  private readonly curtains: SpriteBatch;
  private readonly forms = new Map<string, Formation>();
  private readonly frame: Frame = newFrame();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private readonly core = new THREE.Vector3();
  private readonly u = new THREE.Vector2();
  private readonly shared: Shared;

  constructor(shared: Shared, maxSystems: number) {
    this.shared = shared;
    const pm = weatherMaterial(shared, {}, PUFF_VERT, PUFF_FRAG);
    this.puffs = new SpriteBatch(maxSystems * 200, ['aPos', 'aInfo', 'aTint', 'aGlow'], pm, 6);
    const cm = weatherMaterial(shared, {}, CURTAIN_VERT, CURTAIN_FRAG, { side: THREE.DoubleSide });
    this.curtains = new SpriteBatch(maxSystems * 40, ['aPos', 'aTop', 'aInfo'], cm, 3);
    this.group.add(this.curtains.mesh, this.puffs.mesh);
  }

  private formationOf(s: WeatherSystem): Formation {
    const key = `${s.kind}:${s.id}`;
    let f = this.forms.get(key);
    if (!f) {
      f = formation(s.kind, s.id);
      this.forms.set(key, f);
      if (this.forms.size > 64) this.forms.delete(this.forms.keys().next().value!);
    }
    return f;
  }

  /** The unit downwind direction at the system's centre, as (east, north). */
  private downwind(s: WeatherSystem, f: Frame): THREE.Vector2 {
    const d = s.drift;
    if (d) {
      const de = d.x * f.e.x + d.y * f.e.y + d.z * f.e.z, dn = d.x * f.n.x + d.y * f.n.y + d.z * f.n.z, l = Math.hypot(de, dn);
      if (l > 1e-4) return this.u.set(de / l, dn / l);
    }
    return this.u.set(1, 0);
  }

  update(systems: readonly WeatherSystem[], eye: THREE.Vector3, flashes: readonly Flash[], ember: number): void {
    const R = this.shared.uRadius.value, sun = this.shared.uSunDir.value, t = this.shared.uTime.value;
    this.puffs.begin();
    this.curtains.begin();
    const pd = this.puffs.data, cd = this.curtains.data;
    for (const s of systems) {
      if (s.intensity <= 0.001 || s.kind === 'clear') continue;
      const form = this.formationOf(s), f = frameAt(s.at, this.frame), w = this.downwind(s, f), r = s.radius;
      const scale = Math.min(1.5, Math.max(0.75, r / 110)), grow = s.intensity * 1.15;
      placeOn(f, 0, 0, form.middle, R, this.core);
      // embers glow under ash at night
      const glowE = s.kind === 'ash' ? ember * s.intensity : 0;
      for (const p of form.puffs) {
        const alpha = smoothstep(p.rank, p.rank + 0.22, grow);
        if (alpha <= 0.002) continue;
        const o = this.puffs.slot();
        if (o < 0) break;
        const cu = p.u + 0.025 * Math.sin(t * 0.05 + p.seed * 20), cv = p.v + 0.025 * Math.cos(t * 0.04 + p.seed * 13);
        const h = p.h + 2.5 * Math.sin(t * 0.07 + p.seed * 7);
        placeOn(f, r * (cu * w.x - cv * w.y), r * (cu * w.y + cv * w.x), h, R, this.p);
        const size = p.size * scale * (0.65 + 0.35 * smoothstep(p.rank, p.rank + 0.4, grow));
        let glow = 0;
        for (const fl of flashes) {
          const d2 = this.p.distanceToSquared(fl.pos);
          glow += fl.power * Math.exp(-d2 / 5000);
        }
        const sunward = this.q.subVectors(this.p, this.core).normalize().dot(sun) * 0.5 + 0.5;
        pd[o] = this.p.x; pd[o + 1] = this.p.y; pd[o + 2] = this.p.z; pd[o + 3] = size;
        pd[o + 4] = p.seed; pd[o + 5] = p.shade; pd[o + 6] = alpha * (s.kind === 'fog' ? 0.55 : 0.85); pd[o + 7] = p.flat;
        pd[o + 8] = form.tint[0]; pd[o + 9] = form.tint[1]; pd[o + 10] = form.tint[2]; pd[o + 11] = form.dark;
        const eb = glowE * (1 - p.shade) * (1 - p.shade) * 0.5;
        pd[o + 12] = glow * 0.8 + eb * 1.0; pd[o + 13] = glow * 0.88 + eb * 0.32; pd[o + 14] = glow * 1.1 + eb * 0.08; pd[o + 15] = sunward;
      }
      if (form.fall < 0) continue;
      // curtains lean so their feet trail downwind
      const lean = 10;
      for (const c of form.curtains) {
        const alpha = smoothstep(c.rank, c.rank + 0.3, grow);
        if (alpha <= 0.002) continue;
        const o = this.curtains.slot();
        if (o < 0) break;
        const de = r * (c.u * w.x - c.v * w.y), dn = r * (c.u * w.y + c.v * w.x);
        placeOn(f, de + w.x * lean, dn + w.y * lean, -1, R, this.p);
        placeOn(f, de, dn, form.base + 4, R, this.q);
        let glow = 0;
        for (const fl of flashes) glow += fl.power * Math.exp(-this.q.distanceToSquared(fl.pos) / 6000);
        const width = c.width * scale;
        cd[o] = this.p.x; cd[o + 1] = this.p.y; cd[o + 2] = this.p.z; cd[o + 3] = width;
        cd[o + 4] = this.q.x; cd[o + 5] = this.q.y; cd[o + 6] = this.q.z; cd[o + 7] = c.seed;
        const strength = form.fall === 1 ? 0.62 : form.fall === 0 ? 0.48 : form.fall === 2 ? 0.4 : 0.45;
        cd[o + 8] = alpha * strength; cd[o + 9] = form.fall; cd[o + 10] = glow * 0.3; cd[o + 11] = form.base + 5;
      }
    }
    this.puffs.end(eye);
    this.curtains.end(eye);
  }

  /** How many puffs and curtains were drawn last frame. */
  get counts(): { puffs: number; curtains: number } {
    return { puffs: this.puffs.count, curtains: this.curtains.count };
  }
}
