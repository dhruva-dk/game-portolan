import * as THREE from 'three';
import { smoothstep } from '../craft.ts';

export type FormName = 'pinnace' | 'caravel' | 'carrack' | 'galleon';
export const FORM_NAMES: readonly FormName[] = ['pinnace', 'caravel', 'carrack', 'galleon'];

export interface DeckSpec { from: number; to: number; rise: number }

export interface SquareMastSpec {
  kind: 'square';
  u: number;
  rake: number;
  r: number;
  top: number;
  heads: readonly number[];
  yards: readonly number[];
  shrouds: number;
}
export interface LateenMastSpec {
  kind: 'lateen';
  u: number;
  rake: number;
  r: number;
  top: number;
  sling: number;
  len: number;
  tilt: number;
  fore: number;
  clew: number;
  clewY: number;
  shrouds: number;
}
export type MastSpec = SquareMastSpec | LateenMastSpec;

export interface FormSpec {
  length: number; beam: number; draft: number;
  rail: number; sheerAft: number; sheerFwd: number; bulwark: number;
  maxY: number; tumble: number;
  stemRake: number; forefoot: number; sternRake: number;
  tuck: number; transom: number; bowStart: number; sternStart: number;
  overhang: number;
  decks: readonly DeckSpec[];
  strakes: number;
  wales: readonly number[];
  paintFrom: number;
  guns: number;
  gunStrake: number; gunSpan: readonly [number, number];
  beak: number;
  lanterns: number;
  masts: readonly MastSpec[];
  sprit: { len: number; angle: number; yard: number } | null;
}

export const FORMS: Record<FormName, FormSpec> = {
  pinnace: {
    length: 3.8, beam: 1.06, draft: 0.42, rail: 0.46, sheerAft: 0.2, sheerFwd: 0.24, bulwark: 0.17, maxY: 0.1, tumble: 0.22,
    stemRake: 0.38, forefoot: 0.32, sternRake: 0.26, tuck: 0.22, transom: 0.62, bowStart: 0.6, sternStart: 0.36, overhang: 0,
    decks: [{ from: 0, to: 0.27, rise: 0.2 }],
    strakes: 13, wales: [7.3, 9.6], paintFrom: 10.4, guns: 1, gunStrake: 8.45, gunSpan: [0.44, 0.6],
    beak: 0.32, lanterns: 1,
    masts: [
      { kind: 'lateen', u: 0.19, rake: 0.06, r: 0.042, top: 2.9, sling: 2.25, len: 1.95, tilt: 0.6, fore: 0.28, clew: 0.78, clewY: 0.6, shrouds: 2 },
      { kind: 'square', u: 0.55, rake: 0.03, r: 0.066, top: 2.5, heads: [3.95], yards: [1.06, 0.74], shrouds: 4 },
    ],
    sprit: { len: 1.5, angle: 0.46, yard: 0.5 },
  },
  caravel: {
    length: 4.4, beam: 1.28, draft: 0.5, rail: 0.46, sheerAft: 0.38, sheerFwd: 0.3, bulwark: 0.17, maxY: 0.12, tumble: 0.18,
    stemRake: 0.46, forefoot: 0.4, sternRake: 0.3, tuck: 0.3, transom: 0.6, bowStart: 0.56, sternStart: 0.36, overhang: 0,
    decks: [{ from: 0, to: 0.32, rise: 0.27 }, { from: 0, to: 0.12, rise: 0.5 }],
    strakes: 14, wales: [8.3, 10.5], paintFrom: 11.2, guns: 2, gunStrake: 9.4, gunSpan: [0.4, 0.66],
    beak: 0, lanterns: 1,
    masts: [
      { kind: 'lateen', u: 0.09, rake: 0.05, r: 0.045, top: 3.35, sling: 2.45, len: 1.75, tilt: 0.66, fore: 0.24, clew: 0.5, clewY: 0.75, shrouds: 2 },
      { kind: 'lateen', u: 0.45, rake: -0.04, r: 0.075, top: 4.25, sling: 3.25, len: 2.9, tilt: 0.84, fore: 0.2, clew: 0.88, clewY: 0.6, shrouds: 4 },
      { kind: 'lateen', u: 0.79, rake: -0.1, r: 0.06, top: 3.65, sling: 2.7, len: 2.3, tilt: 0.8, fore: 0.26, clew: 0.8, clewY: 0.6, shrouds: 3 },
    ],
    sprit: null,
  },
  carrack: {
    length: 5.2, beam: 1.76, draft: 0.6, rail: 0.62, sheerAft: 0.3, sheerFwd: 0.42, bulwark: 0.2, maxY: 0.16, tumble: 0.3,
    stemRake: 0.66, forefoot: 0.45, sternRake: 0.36, tuck: 0.36, transom: 0.58, bowStart: 0.55, sternStart: 0.35, overhang: 0.55,
    decks: [{ from: 0, to: 0.4, rise: 0.42 }, { from: 0, to: 0.25, rise: 0.8 }, { from: 0, to: 0.11, rise: 1.12 }, { from: 0.77, to: 1, rise: 0.62 }],
    strakes: 17, wales: [9.5, 11.9, 14.4], paintFrom: 15, guns: 3, gunStrake: 10.7, gunSpan: [0.43, 0.68],
    beak: 0.42, lanterns: 2,
    masts: [
      { kind: 'lateen', u: 0.27, rake: 0.06, r: 0.05, top: 4.6, sling: 3.7, len: 2.2, tilt: 0.6, fore: 0.28, clew: 0.68, clewY: 0.7, shrouds: 3 },
      { kind: 'square', u: 0.53, rake: 0.03, r: 0.095, top: 3.45, heads: [5.0], yards: [1.62, 1.0], shrouds: 5 },
      { kind: 'square', u: 0.83, rake: -0.02, r: 0.075, top: 3.3, heads: [4.45], yards: [1.18, 0.76], shrouds: 4 },
    ],
    sprit: { len: 2.2, angle: 0.58, yard: 0.66 },
  },
  galleon: {
    length: 5.8, beam: 1.6, draft: 0.62, rail: 0.66, sheerAft: 0.24, sheerFwd: 0.3, bulwark: 0.2, maxY: 0.14, tumble: 0.3,
    stemRake: 0.55, forefoot: 0.5, sternRake: 0.42, tuck: 0.3, transom: 0.66, bowStart: 0.58, sternStart: 0.36, overhang: 0,
    decks: [{ from: 0, to: 0.36, rise: 0.32 }, { from: 0, to: 0.17, rise: 0.62 }, { from: 0.8, to: 0.95, rise: 0.34 }],
    strakes: 18, wales: [9.9, 12.5, 15.1], paintFrom: 15.7, guns: 4, gunStrake: 11.2, gunSpan: [0.4, 0.72],
    beak: 1.0, lanterns: 3,
    masts: [
      { kind: 'lateen', u: 0.09, rake: 0.06, r: 0.04, top: 3.9, sling: 3.1, len: 1.8, tilt: 0.6, fore: 0.26, clew: 0.55, clewY: 0.7, shrouds: 2 },
      { kind: 'lateen', u: 0.25, rake: 0.06, r: 0.055, top: 4.5, sling: 3.6, len: 2.6, tilt: 0.6, fore: 0.27, clew: 0.9, clewY: 0.75, shrouds: 3 },
      { kind: 'square', u: 0.53, rake: 0.04, r: 0.09, top: 3.5, heads: [5.15, 6.25], yards: [1.5, 1.08, 0.62], shrouds: 6 },
      { kind: 'square', u: 0.81, rake: -0.02, r: 0.08, top: 3.15, heads: [4.62, 5.55], yards: [1.32, 0.94, 0.54], shrouds: 5 },
    ],
    sprit: { len: 2.6, angle: 0.55, yard: 0.75 },
  },
};

const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3(), _fd = new THREE.Vector3();

export class HullForm {
  readonly s: FormSpec;
  readonly name: FormName;
  readonly L: number;
  readonly yk: number;
  readonly railAft: number;
  readonly railFwd: number;
  constructor(name: FormName) {
    this.name = name;
    this.s = FORMS[name];
    this.L = this.s.length;
    this.yk = -this.s.draft;
    this.railAft = this.rail(0);
    this.railFwd = this.rail(1);
  }

  sheer(u: number): number {
    const s = this.s;
    return s.rail + (u < 0.45 ? s.sheerAft * ((0.45 - u) / 0.45) ** 2 : s.sheerFwd * ((u - 0.45) / 0.55) ** 2);
  }
  level(u: number): number {
    let r = 0;
    for (const d of this.s.decks) if (u >= d.from - 1e-6 && u <= d.to + 1e-6) r = Math.max(r, d.rise);
    return r;
  }
  rail(u: number): number {
    let r = 0;
    for (const d of this.s.decks) {
      const k = d.from <= 0 ? 1 - smoothstep(d.to, d.to + 0.022, u) : d.to >= 1 ? smoothstep(d.from - 0.022, d.from, u)
        : smoothstep(d.from - 0.022, d.from, u) * (1 - smoothstep(d.to, d.to + 0.022, u));
      r = Math.max(r, d.rise * k);
    }
    return this.sheer(u) + r;
  }
  deck(u: number, rise = this.level(u)): number {
    return this.sheer(u) - this.s.bulwark + rise;
  }
  zFwd(y: number): number {
    const s = this.s, h = this.L / 2, main = this.sheer(1);
    if (y < 0) return h - s.forefoot * (y / s.draft) ** 2;
    return h + s.stemRake * Math.pow(Math.min(y, main) / main, 1.25) + s.overhang * smoothstep(main - 0.05, main + 0.4, y);
  }
  zAft(y: number): number {
    return -this.L / 2 - (this.s.sternRake * (y - this.yk)) / (this.railAft - this.yk);
  }
  z(u: number, y: number): number {
    const a = this.zAft(y);
    return a + u * (this.zFwd(y) - a);
  }
  uAt(z: number, y: number): number {
    const a = this.zAft(y);
    return (z - a) / (this.zFwd(y) - a);
  }
  half(u: number, y: number): number {
    const s = this.s;
    const above = smoothstep(s.tuck - 0.28, s.tuck + 0.04, y);
    const flare = smoothstep(-0.3, 0.9, y);
    let plan = 1;
    if (u > s.bowStart) {
      const t = Math.min(1, (u - s.bowStart) / (1 - s.bowStart));
      plan = Math.pow(1 - Math.pow(t, 1.7 + 0.9 * flare), 0.5 + 0.15 * flare);
    } else if (u < s.sternStart) {
      const t = Math.min(1, (s.sternStart - u) / s.sternStart);
      const run = Math.pow(1 - Math.pow(t, 1.9), 0.75);
      const upper = 1 - (1 - s.transom) * Math.pow(t, 1.6);
      plan = run + (upper - run) * above;
    }
    let sec: number;
    if (y < s.maxY) {
      const e = 1.35 + 1.4 * plan, t = Math.min(1, (s.maxY - y) / (s.maxY - this.yk));
      sec = Math.pow(Math.max(0, 1 - Math.pow(t, e)), 1 / e);
    } else sec = 1 - s.tumble * (1 - Math.exp(-(y - s.maxY) * 1.5));
    return 0.5 * s.beam * plan * sec;
  }
  strake(u: number, y: number): number {
    return ((y - this.yk) / (this.sheer(u) - this.yk)) * this.s.strakes;
  }
  strakeY(u: number, k: number): number {
    return this.yk + (k / this.s.strakes) * (this.sheer(u) - this.yk);
  }
  get strakeH(): number {
    return (this.s.rail - this.yk) / this.s.strakes;
  }
  at(u: number, y: number, o: THREE.Vector3): THREE.Vector3 {
    return o.set(this.half(u, y), y, this.z(u, y));
  }
  normal(u: number, y: number, o: THREE.Vector3): THREE.Vector3 {
    this.at(u + 1e-3, y, _fa).sub(this.at(u - 1e-3, y, _fb));
    this.at(u, y + 1e-3, _fc).sub(this.at(u, y - 1e-3, _fd));
    return o.crossVectors(_fc, _fa).normalize();
  }
  side(z: number, y: number, off: number, o = new THREE.Vector3()): THREE.Vector3 {
    const u = this.uAt(z, y);
    return this.at(u, y, o).addScaledVector(this.normal(u, y, _fd), off);
  }
  gunports(): THREE.Vector3[] {
    const s = this.s, n = s.guns, [a, b] = s.gunSpan, out: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? (a + b) / 2 : a + ((b - a) * k) / (n - 1), y = this.strakeY(u, s.gunStrake);
      out.push(this.at(u, y, new THREE.Vector3()));
    }
    return out;
  }
}
