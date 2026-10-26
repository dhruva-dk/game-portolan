import * as THREE from 'three';
import { illustratedMaterial, inkMaterial, linearVec, type Style } from '../../style/glsl.ts';
import { mix, PIGMENTS } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { coastAt, heightAt } from '../../sim/world/geography.ts';
import { DRAFT, REGIONS, TIDE, rimAt } from '../../sim/world/regions.ts';
import { seas, surfAt } from '../sea.ts';
import type { Swell } from '../swell.ts';
import { GROUND, terrains, type Ground, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, ring, seeded, vec, type V, washOf, type Wash } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'coralAtolls');
const REGION = REGIONS[RI];
const TAU = 2 * Math.PI, DEG = Math.PI / 180;
export const LOW = -TIDE.amp - DRAFT, BLOCK = TIDE.amp - DRAFT, LAND = TIDE.amp + 0.15;
export const CORAL = { step: 1, near: 55, palms: 45, drawn: 24, leaflets: 14, lee: [-0.95, -0.3] as const } as const;
export const CLEAR = 1.6;
export const UNDER = -TIDE.amp - 0.12;
const MOTU = 0.6;

const W = {
  trunk: washOf(PIGMENTS.umber, 0.55), scar: washOf(PIGMENTS.sepia, 0.75),
  frond: washOf(PIGMENTS.malachite, 0.8), frondPale: washOf(PIGMENTS.verdigris, 0.7), frondOld: washOf(PIGMENTS.ochre, 0.75),
  frondDead: washOf(mix(PIGMENTS.umber, PIGMENTS.ochre, 0.4), 0.6), nut: washOf(PIGMENTS.ochre, 0.95),
  nutGreen: washOf(mix(PIGMENTS.verdigris, PIGMENTS.ochre, 0.5), 0.7), rachis: washOf(mix(PIGMENTS.ochre, PIGMENTS.leadWhite, 0.35), 0.5),
  leaf: washOf(PIGMENTS.verdigris, 0.85), root: washOf(PIGMENTS.umber, 0.7), fruit: washOf(PIGMENTS.vermilion, 0.6),
  shrub: washOf(PIGMENTS.malachite, 0.9), shrubLit: washOf(PIGMENTS.verdigris, 0.6), shade: washOf(PIGMENTS.umber, 0.6),
  coral: washOf(PIGMENTS.ochre, 0.42), coralPale: washOf(PIGMENTS.ochre, 0.2), algae: washOf(PIGMENTS.verdigris, 0.3),
  rose: washOf(PIGMENTS.roseMadder, 0.3), tip: washOf(PIGMENTS.leadWhite, 0.9),
  table: washOf(PIGMENTS.verdigris, 0.55), under: washOf(PIGMENTS.sepia, 0.65),
  bleach: washOf(PIGMENTS.leadWhite, 0.65), rock: washOf(PIGMENTS.sepia, 0.45),
  sand: washOf(PIGMENTS.leadWhite, 0.75), sandEdge: washOf(PIGMENTS.ochre, 0.3),
  drift: washOf(PIGMENTS.leadWhite, 0.5), driftDark: washOf(PIGMENTS.sepia, 0.5),
  pole: washOf(mix(PIGMENTS.sepia, PIGMENTS.leadWhite, 0.55), 0.4), poleFoot: washOf(mix(PIGMENTS.verdigris, PIGMENTS.leadWhite, 0.4), 0.4),
  crownLit: washOf(mix(PIGMENTS.verdigris, PIGMENTS.ochre, 0.45), 0.5), crownSun: washOf(mix(PIGMENTS.malachite, PIGMENTS.ochre, 0.3), 0.6),
  crownShade: washOf(mix(PIGMENTS.malachite, PIGMENTS.indigo, 0.25), 0.8),
  bole: washOf(mix(PIGMENTS.sepia, PIGMENTS.leadWhite, 0.45), 0.45), boleRing: washOf(PIGMENTS.sepia, 0.5),
  crownHang: washOf(mix(PIGMENTS.malachite, PIGMENTS.ochre, 0.3), 0.55), crownNoon: washOf(mix(PIGMENTS.verdigris, PIGMENTS.ochre, 0.62), 0.4),
  frondDry: washOf(mix(PIGMENTS.ochre, PIGMENTS.leadWhite, 0.25), 0.55),
  hulk: washOf(mix(mix(PIGMENTS.leadWhite, PIGMENTS.sepia, 0.42), PIGMENTS.ultramarine, 0.06), 0.5),
  hulkGrey: washOf(mix(PIGMENTS.leadWhite, PIGMENTS.sepia, 0.55), 0.5), hulkWarm: washOf(mix(PIGMENTS.leadWhite, PIGMENTS.umber, 0.45), 0.5),
  hulkUnder: washOf(mix(PIGMENTS.sepia, PIGMENTS.ultramarine, 0.2), 0.55),
};

const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

class Brush {
  wash: Wash;
  pick: ((c: V, n: V) => Wash) | null = null;
  readonly kit: Kit;
  constructor(wash: Wash) {
    this.wash = wash;
    this.kit = new Kit((c, n) => (this.pick ? this.pick(c, n) : this.wash));
  }
  tri(a: V, b: V, c: V): void {
    this.kit.tri(a, b, c);
  }
}

function frame(t: V): [V, V] {
  const u = vec().crossVectors(t, Math.abs(t.x) < 0.7 ? vec(1, 0, 0) : vec(0, 1, 0)).normalize();
  return [u, vec().crossVectors(t, u)];
}

function tube(b: Brush, path: readonly V[], radii: readonly number[], sides: number): void {
  const rings: V[][] = [];
  for (let i = 0; i < path.length; i++) {
    const [u, w] = frame(vec().subVectors(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]).normalize());
    rings.push(Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * TAU;
      return path[i].clone().addScaledVector(u, radii[i] * Math.cos(a)).addScaledVector(w, radii[i] * Math.sin(a));
    }));
  }
  b.kit.loft(rings);
}

function spike(b: Brush, a: V, tip: V, r: number, turn = 0): void {
  const [u, w] = frame(vec().subVectors(tip, a).normalize());
  const f = [0, 1, 2].map((j) => a.clone().addScaledVector(u, r * Math.cos(turn + (j / 3) * TAU)).addScaledVector(w, r * Math.sin(turn + (j / 3) * TAU)));
  for (let j = 0; j < 3; j++) b.tri(f[j], f[(j + 1) % 3], tip);
}

const laid = (b: Brush): number => (b.kit as unknown as { pos: number[] }).pos.length / 9;
function crownNormals(g: THREE.BufferGeometry, [a0, a1]: [number, number], topY: number, hang = -0.6): THREE.BufferGeometry {
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute, pos = g.getAttribute('position') as THREE.BufferAttribute, f = vec();
  for (let t = a0; t < a1; t++) {
    const cy = (pos.getY(3 * t) + pos.getY(3 * t + 1) + pos.getY(3 * t + 2)) / 3, up = cy > topY - 0.03;
    f.fromBufferAttribute(nrm, 3 * t);
    if (f.y < 0 === (up || hang >= 0)) f.negate();
    f.multiplyScalar(up ? 0.45 : 0.7).add(vec(0, up ? 1 : hang, 0)).normalize();
    for (let v = 0; v < 3; v++) nrm.setXYZ(3 * t + v, f.x, f.y, f.z);
  }
  return g;
}
function domeNormals(g: THREE.BufferGeometry, ranges: readonly [number, number][], c: V, own = 0.3): THREE.BufferGeometry {
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute, pos = g.getAttribute('position') as THREE.BufferAttribute, f = vec(), m = vec();
  for (const [a0, a1] of ranges) {
    for (let t = a0; t < a1; t++) {
      m.set(0, 0, 0);
      for (let v = 0; v < 3; v++) m.add(f.fromBufferAttribute(pos, 3 * t + v));
      const dn = m.divideScalar(3).sub(c).add(vec(0, 0.05, 0)).normalize();
      f.fromBufferAttribute(nrm, 3 * t);
      if (f.dot(dn) < 0) f.negate();
      f.multiplyScalar(own).addScaledVector(dn, 1 - own).normalize();
      for (let v = 0; v < 3; v++) nrm.setXYZ(3 * t + v, f.x, f.y, f.z);
    }
  }
  return g;
}
function liftNormals(g: THREE.BufferGeometry, ranges: readonly [number, number][]): THREE.BufferGeometry {
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute, f = vec();
  for (const [a0, a1] of ranges) {
    for (let t = a0; t < a1; t++) {
      f.fromBufferAttribute(nrm, 3 * t);
      if (f.y < 0) f.negate();
      f.multiplyScalar(0.45).add(vec(0, 1, 0)).normalize();
      for (let v = 0; v < 3; v++) nrm.setXYZ(3 * t + v, f.x, f.y, f.z);
    }
  }
  return g;
}

function stick(br: Brush, a: V, b: V, r0: number, r1: number, cap: boolean): void {
  const [u, w] = frame(vec().subVectors(b, a).normalize());
  const at = (p: V, r: number, j: number): V => p.clone().addScaledVector(u, r * Math.cos((j / 3) * TAU)).addScaledVector(w, r * Math.sin((j / 3) * TAU));
  for (let j = 0; j < 3; j++) {
    const a0 = at(a, r0, j), a1 = at(a, r0, j + 1), b0 = at(b, r1, j), b1 = at(b, r1, j + 1);
    br.tri(a0, a1, b1);
    br.tri(a0, b1, b0);
    if (cap) br.tri(b0, b1, b.clone().addScaledVector(vec().subVectors(b, a).normalize(), r1 * 1.5));
  }
}

function blob(b: Brush, c: V, r: number): void {
  const p = [vec(r, 0, 0), vec(-r, 0, 0), vec(0, r, 0), vec(0, -r, 0), vec(0, 0, r), vec(0, 0, -r)].map((v) => v.add(c));
  for (const [i, j, k] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]]) b.tri(p[i], p[j], p[k]);
}

function palmKit(seed: number, young: boolean, far = false): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.bole), n = far ? 2 : young ? 4 : 7, bend = young ? 0.12 : 0.26 + 0.14 * rnd();
  const path: V[] = [], radii: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push(vec(0.015 * Math.sin(t * 4 + seed), t, bend * t * t + 0.05 * t * Math.sin(t * 3 + seed)));
    radii.push((i === 0 ? 0.058 : 0.036 - 0.012 * t) * (young ? 1.5 : 1) * (far ? 1.15 : 1));
  }
  b.pick = far ? null : (c) => (Math.floor(c.y * 26) % 3 ? W.bole : W.boleRing);
  tube(b, path, radii, far ? 3 : 6);
  b.pick = null;
  const top = path[n], Y = vec(0, 1, 0), count = far ? 8 : young ? 9 : 12, L = young ? 0.62 : 0.5, SEG = far ? 2 : 5, fronds = laid(b);
  for (let k = 0; k < count; k++) {
    const phi = (k / count) * TAU + 0.3 * rnd(), d = vec(Math.sin(phi), 0, Math.cos(phi) + 0.6).normalize(), age = k % 4;
    const droop = young ? 0.35 + 0.25 * age : far ? 0.32 + 0.16 * age : 0.45 + 0.28 * age, rise = young ? 0.55 : far ? 0.5 - 0.05 * age : 0.45 - 0.06 * age;
    const len = L * (0.85 + 0.3 * rnd()) * (age === 0 ? 0.8 : 1), side = vec().crossVectors(d, Y).normalize();
    b.wash = age === 3 && !young && k % 8 === 3 ? W.frondDry : age === 3 && k % 8 === 7 ? W.frondOld : age === 0 ? W.frondPale : W.frond;
    const tone = b.wash, kept = tone === W.frondDry || tone === W.frondOld;
    let prev = top.clone();
    for (let i = 1; i <= SEG; i++) {
      const s = i / SEG, p = top.clone().addScaledVector(d, len * s).addScaledVector(Y, len * (rise * s - droop * s * s));
      const w = len * (far ? 0.27 : 0.2) * (1 - 0.55 * s) * (i === 1 ? 0.6 : 1), mid = prev.clone().lerp(p, 0.5);
      if (!kept) b.wash = mid.y > top.y - 0.03 ? (far ? W.crownSun : age === 0 ? W.crownNoon : W.crownLit) : W.crownHang;
      const hang = vec(0, far ? -len * 0.02 : -len * 0.09, 0).addScaledVector(d, len * 0.05), low = vec(0, -len * 0.03, 0).add(hang);
      b.tri(prev, p, mid.clone().addScaledVector(side, w).add(hang));
      b.tri(p, prev, mid.clone().addScaledVector(side, -w).add(hang));
      b.tri(mid, p, p.clone().addScaledVector(side, 0.8 * w).add(low));
      b.tri(p, mid, p.clone().addScaledVector(side, -0.8 * w).add(low));
      prev = p;
    }
  }
  const lit: [number, number] = [fronds, laid(b)];
  b.wash = W.nut;
  for (let k = 0; k < (far ? 0 : young ? 2 : 5); k++) blob(b, top.clone().add(vec(0.035 * Math.cos(k * 2.4), -0.035 - 0.015 * (k % 2), 0.035 * Math.sin(k * 2.4))), 0.026);
  return crownNormals(b.kit.build(), lit, top.y, 0.35);
}

function palmNearKit(seed: number, young: boolean, fine = true): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.bole), Y = vec(0, 1, 0), bend = young ? 0.1 : 0.22 + 0.14 * rnd();
  const at = (t: number): V => vec(0.015 * Math.sin(t * 4 + seed), t, bend * t * t + 0.05 * t * Math.sin(t * 3 + seed));
  const R = fine ? 16 : 8, scar = 0.22, path: V[] = [], radii: number[] = [];
  const girth = (t: number): number => (0.031 - 0.008 * t + 0.03 * Math.exp(-t * 22)) * (young ? 1.35 : 1);
  for (let j = 0; j <= R; j++) {
    const t = j / R;
    path.push(at(t));
    radii.push(girth(t) * (fine && j > 0 && j < R ? 1.07 : 1));
    if (fine && j < R) {
      path.push(at(t + scar / R));
      radii.push(girth(t + scar / R));
    }
  }
  b.pick = fine ? (c) => ((c.y * R) % 1 < scar ? W.boleRing : W.bole) : null;
  tube(b, path, radii, fine ? 7 : 5);
  b.pick = null;
  const top = at(1), crown: [number, number][] = [], from0 = laid(b);
  const count = fine ? (young ? 16 : 22) : young ? 11 : 15, L = young ? 0.6 : 0.46, per = fine ? 16 : 10, SEG = fine ? 8 : 5;
  const frond = (d: V, len: number, el0: number, arc: number, fold: number, sag: number, tone: (h: number) => Wash, dead: boolean): void => {
    const side = vec().crossVectors(d, Y).normalize(), pts: V[] = [top.clone()], tans: V[] = [];
    for (let i = 0; i <= SEG; i++) {
      const el = el0 - arc * Math.pow(i / SEG, 1.4);
      tans.push(d.clone().multiplyScalar(Math.cos(el)).addScaledVector(Y, Math.sin(el)));
      if (i > 0) pts.push(pts[i - 1].clone().addScaledVector(tans[i - 1].clone().add(tans[i]).normalize(), len / SEG));
    }
    b.wash = dead ? W.frondDead : W.rachis;
    for (let i = 0; i < SEG; i++) stick(b, pts[i], pts[i + 1], 0.0075 * (1 - 0.6 * (i / SEG)), 0.0075 * (1 - 0.6 * ((i + 1) / SEG)), false);
    for (let j = 0; j < per; j++) {
      const s = 0.1 + (0.88 * (j + 0.5)) / per, f = s * SEG, i = Math.min(SEG - 1, Math.floor(f)), u = f - i;
      const base = pts[i].clone().lerp(pts[i + 1], u), t = tans[i].clone().lerp(tans[i + 1], u).normalize();
      const up = vec().crossVectors(side, t).normalize(), ll = len * (young ? 0.34 : 0.3) * Math.pow(Math.sin(Math.PI * (0.15 + 0.8 * s)), 0.8);
      const alpha = (62 - 26 * s) * DEG, w = len * (fine ? 0.026 : 0.034);
      b.wash = tone((base.y - top.y) / len);
      for (const sd of [-1, 1]) {
        const fo = fold + 0.14 * (rnd() - 0.5), across = side.clone().multiplyScalar(sd * Math.cos(fo)).addScaledVector(up, Math.sin(fo));
        const dir = t.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(across, Math.sin(alpha)).normalize();
        const l = ll * (0.88 + 0.24 * rnd()), wide = t.clone().addScaledVector(dir, -t.dot(dir)).normalize().multiplyScalar(w / 2);
        const knee = base.clone().addScaledVector(dir, 0.5 * l).addScaledVector(Y, -0.2 * sag * l);
        const tip = base.clone().addScaledVector(dir, l).addScaledVector(Y, -sag * l);
        const k0 = knee.clone().sub(wide), k1 = knee.clone().add(wide);
        if (fine) {
          b.tri(base, k1, k0);
          b.tri(k0, k1, tip);
        } else b.tri(base.clone().sub(wide), base.clone().add(wide), tip);
      }
    }
  };
  for (let k = 0; k < count; k++) {
    const a = k / (count - 1), phi = k * 2.39996 + 0.35 * rnd(), d = vec(Math.sin(phi), 0, Math.cos(phi) + 0.35).normalize();
    const len = L * (0.82 + 0.3 * rnd()) * (a < 0.08 ? 0.7 : 1), el0 = (young ? 72 : 66) * DEG - a * (young ? 66 : 76) * DEG;
    const arc = (18 + 72 * a) * DEG * (0.85 + 0.3 * rnd()), fold = (a < 0.1 ? 8 : -(18 + 34 * a)) * DEG, sag = 0.1 + 0.3 * a;
    const dry = !young && a > 0.86 && k % 2 === 0;
    frond(d, len, el0, arc, fold, sag, (h) => (dry ? W.frondDry : a < 0.12 ? W.crownNoon : h > 0.02 ? (k % 3 ? W.crownLit : W.crownNoon) : h > -0.3 ? (k % 2 ? W.crownSun : W.crownLit) : W.crownHang), false);
  }
  for (let k = 0; k < (young ? 0 : 2); k++) {
    const phi = 1.3 + 3.1 * k + rnd(), d = vec(Math.sin(phi), 0, Math.cos(phi)).normalize();
    frond(d, L * (0.6 + 0.2 * rnd()), -60 * DEG, 25 * DEG, -70 * DEG, 0.1, () => W.frondDead, true);
  }
  crown.push([from0, laid(b)]);
  for (let k = 0; k < (young ? 2 : 7); k++) {
    const q = k * 2.4 + 0.4, r = (k < 4 ? 0.045 : 0.07) * (young ? 0.8 : 1), c = top.clone().add(vec(r * Math.cos(q), -0.045 - 0.02 * (k % 3), r * Math.sin(q)));
    b.wash = k % 3 === 1 ? W.nut : W.nutGreen;
    b.kit.loft([-0.8, -0.35, 0.3, 0.8].map((y, i) => ring(6, 0.032 * y, () => 0.032 * [0.35, 0.95, 0.95, 0.35][i]).map((p) => p.add(c))));
  }
  return domeNormals(b.kit.build(), crown, top.clone().add(vec(0, 0.03, 0)));
}

function pandanusNearKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.trunk), Y = vec(0, 1, 0), foot = vec(0, 0.24, 0.04), fork = vec(0.02, 0.58, 0.12);
  b.pick = (c) => (Math.floor(c.y * 40) % 3 === 0 ? W.scar : W.trunk);
  tube(b, [foot, vec(0.01, 0.4, 0.08), fork], [0.042, 0.035, 0.03], 6);
  b.pick = null;
  b.wash = W.root;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.4 * rnd(), r = 0.16 + 0.08 * rnd(), from = vec(0, 0.12 + 0.12 * rnd(), 0.03);
    const end = vec(r * Math.cos(a), -0.02, r * Math.sin(a) + 0.04), knee = from.clone().lerp(end, 0.5).add(vec(0.25 * r * Math.cos(a), 0.05, 0.25 * r * Math.sin(a)));
    stick(b, from, knee, 0.013, 0.011, false);
    stick(b, knee, end, 0.011, 0.009, false);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + rnd(), end = fork.clone().add(vec(0.2 * Math.cos(a), 0.22 + 0.08 * rnd(), 0.2 * Math.sin(a)));
    b.wash = W.trunk;
    tube(b, [fork, fork.clone().lerp(end, 0.5).add(vec(0, 0.04, 0)), end], [0.024, 0.019, 0.015], 5);
    for (let j = 0; j < 20; j++) {
      const q = j * 2.4 + 0.2 * rnd(), up = 0.3 + 0.6 * rnd(), d = vec(Math.cos(q), 0, Math.sin(q)), len = 0.3 + 0.1 * rnd();
      const side = vec().crossVectors(d, Y).normalize();
      b.wash = j % 6 === 5 ? W.frondOld : j % 2 ? W.leaf : W.frond;
      let prev = end.clone(), w0 = 0.02;
      for (let i = 1; i <= 3; i++) {
        const s = i / 3, p = end.clone().addScaledVector(d, len * s).addScaledVector(Y, len * (up * s - (0.9 + up) * s * s));
        const w1 = 0.02 * (1 - 0.7 * s), keel = vec(0, -0.008, 0);
        b.tri(prev, p, prev.clone().addScaledVector(side, w0).add(keel));
        b.tri(p, p.clone().addScaledVector(side, w1).add(keel), prev.clone().addScaledVector(side, w0).add(keel));
        b.tri(p, prev, prev.clone().addScaledVector(side, -w0).add(keel));
        b.tri(p, prev.clone().addScaledVector(side, -w0).add(keel), p.clone().addScaledVector(side, -w1).add(keel));
        prev = p;
        w0 = w1;
      }
    }
    if (k === 0) {
      const c = end.clone().add(vec(0.02, -0.08, 0)), kf = 8;
      b.pick = (cc) => (Math.floor((Math.atan2(cc.z - c.z, cc.x - c.x) + Math.PI) * 2.5 + cc.y * 40) % 2 ? W.fruit : W.nut);
      b.kit.loft([-0.05, -0.03, 0.0, 0.03, 0.05].map((y, i) => ring(kf, y, () => 0.055 * [0.4, 0.85, 1, 0.85, 0.35][i]).map((p) => p.add(c))));
      b.pick = null;
    }
  }
  return b.kit.build();
}

function pandanusKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.trunk), Y = vec(0, 1, 0), foot = vec(0, 0.2, 0.04), fork = vec(0.02, 0.55, 0.12);
  tube(b, [foot, vec(0.01, 0.38, 0.08), fork], [0.04, 0.034, 0.03], 5);
  b.wash = W.root;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.4 * rnd();
    spike(b, foot.clone().add(vec(0, 0.02 * k, 0)), vec(0.2 * Math.cos(a), 0, 0.2 * Math.sin(a) + 0.04), 0.012, a);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + rnd(), end = fork.clone().add(vec(0.2 * Math.cos(a), 0.22 + 0.08 * rnd(), 0.2 * Math.sin(a)));
    b.wash = W.trunk;
    tube(b, [fork, fork.clone().lerp(end, 0.5).add(vec(0, 0.04, 0)), end], [0.022, 0.018, 0.014], 4);
    for (let j = 0; j < 14; j++) {
      const q = (j / 14) * TAU + 0.2 * rnd(), up = 0.25 + 0.7 * rnd(), d = vec(Math.cos(q), 0, Math.sin(q));
      const side = vec().crossVectors(d, Y).normalize().multiplyScalar(0.018);
      const m = end.clone().addScaledVector(d, 0.14).addScaledVector(Y, 0.1 * up), tip = end.clone().addScaledVector(d, 0.3).addScaledVector(Y, 0.08 * up - 0.12);
      b.wash = j % 5 === 4 ? W.frondOld : j % 2 ? W.leaf : W.frond;
      b.tri(end, m.clone().add(side), m.clone().sub(side));
      b.tri(m.clone().add(side), tip, m.clone().sub(side));
    }
    if (k === 0) {
      b.wash = W.fruit;
      blob(b, end.clone().add(vec(0, -0.05, 0)), 0.05);
    }
  }
  return b.kit.build();
}

function shrubKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 11, b = new Brush(W.shrub);
  b.pick = (c, n) => (n.y > 0.6 ? W.shrubLit : c.y < 0.1 ? W.shade : W.shrub);
  const lobes: [number, number, number, number][] = [[0, 0, 0.3, 0.42], [0.2, 0.1, 0.22, 0.33], [-0.2, -0.06, 0.22, 0.3], [0.04, -0.22, 0.18, 0.26], [-0.08, 0.22, 0.17, 0.24]];
  for (const [cx, cz, r, h] of lobes) {
    const jit = Array.from({ length: 5 * k }, () => 0.8 + 0.4 * rnd());
    b.kit.loft([0, 0.3, 0.6, 0.85, 1].map((y, i) => ring(k, y * h, (j) => [1, 1.02, 0.86, 0.56, 0.16][i] * r * jit[i * k + j]).map((p) => p.add(vec(cx, 0, cz)))));
  }
  const lobed = laid(b);
  for (const [cx, cz, r, h] of lobes) {
    for (let i = 0; i < 12; i++) {
      const a = rnd() * TAU, e = 0.15 + 0.8 * rnd(), out = vec(Math.cos(a) * Math.cos(e * 1.4), Math.sin(e * 1.4), Math.sin(a) * Math.cos(e * 1.4));
      const foot = vec(cx + out.x * r * 0.85, Math.max(0.03, out.y * h * 0.9), cz + out.z * r * 0.85);
      spike(b, foot, foot.clone().addScaledVector(out, 0.09 + 0.08 * rnd()).add(vec(0, 0.04, 0)), 0.035, rnd() * TAU);
    }
  }
  const end = laid(b);
  return liftNormals(smooth(b.kit.build()), [[lobed, end]]);
}

function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute, nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const acc = new Map<string, V>(), f = vec(), key = (i: number): string => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i), a = acc.get(k);
    f.fromBufferAttribute(nrm, i);
    if (a) a.add(f);
    else acc.set(k, f.clone());
  }
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i))!;
    if (a.lengthSq() > 1e-6) nrm.setXYZ(i, ...(f.copy(a).normalize().toArray() as [number, number, number]));
  }
  return g;
}

const C = {
  shade: washOf(mix(PIGMENTS.sepia, PIGMENTS.ultramarine, 0.3), 0.45),
  rubble: washOf(mix(PIGMENTS.leadWhite, PIGMENTS.ochre, 0.15), 0.62), grey: washOf(mix(PIGMENTS.leadWhite, PIGMENTS.sepia, 0.3), 0.5),
};

function slabKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 12, jit = Array.from({ length: k }, (_, j) => 0.72 + 0.16 * Math.sin(j * 2.3 + seed) + 0.16 * rnd()), b = new Brush(C.rubble);
  b.pick = (c, n) => (n.y < 0.35 ? C.shade : Math.hypot(c.x, c.z) > 0.38 || hash(Math.floor(c.x * 9) + seed, Math.floor(c.z * 9)) > 0.86 ? C.grey : C.rubble);
  b.kit.loft([ring(k, -0.06, (j) => 0.46 * jit[j]), ring(k, 0.025, (j) => 0.5 * jit[j]), ring(k, 0.045, (j) => 0.42 * jit[j]), ring(k, 0.055, (j) => 0.26 * jit[j]), ring(k, 0.058, (j) => 0.1 * jit[j])]);
  return smooth(b.kit.build());
}

function boulderKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(C.rubble), k = 8;
  b.pick = (c, n) => (n.y < 0.05 ? C.shade : n.y < 0.5 && hash(Math.floor(c.x * 12) + seed, Math.floor(c.z * 12)) > 0.5 ? C.grey : C.rubble);
  for (const [x, z, r, h] of [[0, 0, 0.3, 0.36], [-0.3, 0.12, 0.17, 0.2], [0.26, -0.2, 0.14, 0.16]] as const) {
    const jit = Array.from({ length: 3 * k }, () => 0.75 + 0.45 * rnd());
    b.kit.loft([ring(k, -0.08, (j) => r * 0.85 * jit[j]), ring(k, h * 0.45, (j) => r * jit[k + j]), ring(k, h * 0.85, (j) => r * 0.7 * jit[2 * k + j]), ring(k, h, () => r * 0.15)].map((rg) => rg.map((p) => p.add(vec(x, 0, z)))));
  }
  for (let i = 0; i < 2; i++) stick(b, vec(-0.1 + 0.2 * i, 0.03, 0.2 - 0.25 * i), vec(0.1 + 0.15 * rnd(), 0.05, -0.1 + 0.3 * rnd()), 0.025, 0.02, true);
  return smooth(b.kit.build());
}

function driftKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.drift);
  b.pick = (_c, n) => (n.y > 0.3 ? W.drift : W.driftDark);
  tube(b, [vec(-0.5, 0.03, 0), vec(-0.15, 0.05, 0.06), vec(0.2, 0.04, -0.03), vec(0.5, 0.03, 0.04)], [0.05, 0.055, 0.045, 0.03], 5);
  for (let k = 0; k < 4; k++) spike(b, vec(-0.5, 0.04, 0), vec(-0.62 - 0.08 * rnd(), 0.05 + 0.1 * rnd(), 0.3 * (rnd() - 0.5)), 0.02, k);
  return b.kit.build();
}

function stakeKit(): THREE.BufferGeometry {
  const b = new Brush(W.pole);
  b.pick = (c) => (c.y < 0.3 ? W.poleFoot : W.pole);
  tube(b, [vec(0, -0.3, 0), vec(0.012, 0.8, 0), vec(0.02, 1.52, 0)], [0.026, 0.021, 0.016], 5);
  b.pick = null;
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4, r = 0.035 + 0.035 * (((k * 7) % 3) / 2);
    spike(b, vec(0.02, 1.4, 0), vec(0.02 + r * Math.cos(a), 1.78 + 0.1 * (((k * 5) % 3) / 2), r * Math.sin(a)), 0.012, k);
  }
  blob(b, vec(0.02, 1.43, 0), 0.022);
  return b.kit.build();
}

const WRECK =  `
  float hm = length(vWorld) - ${R.toFixed(1)}, hw = hm - uSeaLevel;
  float rag = 0.035 * sin(dot(vAnchor, vec3(9.1, 3.7, 6.3))) + 0.025 * sin(dot(vAnchor, vec3(23.0, 11.0, 17.0)));
  float lump = sin(dot(vAnchor, vec3(5.3, 2.1, 4.7))) * sin(dot(vAnchor, vec3(-3.1, 6.7, 8.9)));
  col *= mix(vec3(1.0), vec3(0.86, 0.84, 0.78), 1.0 - smoothstep(-0.03, 0.05, hm - 0.35 + rag));
  col *= mix(vec3(1.0), vec3(0.42, 0.44, 0.38), 1.0 - smoothstep(0.02, 0.2, hw + rag));
  col *= mix(vec3(1.0), vec3(0.5, 0.66, 0.34), 1.0 - smoothstep(-0.02, 0.05, hw - 0.04 + 2.5 * rag));
  float lace = (1.0 - smoothstep(0.02, 0.05, abs(hw - 0.02 + 0.4 * rag))) * smoothstep(-0.2, 0.3, lump);
  col = mix(col, vec3(0.92, 0.94, 0.9), 0.75 * lace);
  tone = min(tone, 0.55) * (1.0 - lace);
`;

interface Grain { from: number; to: number; c: V[]; t: V[]; s: V[]; d: V[]; arc: number[] }
function timber(b: Brush, grains: Grain[], path: readonly V[], side: V | readonly V[], sw: number | readonly number[], sd: number, taper: number, snap: number, snap0 = 0): void {
  const n = path.length, rings: V[][] = [], g: Grain = { from: laid(b), to: 0, c: [], t: [], s: [], d: [], arc: [] };
  for (let i = 0; i < n; i++) {
    const t = vec().subVectors(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)]).normalize(), sv = Array.isArray(side) ? side[i] : (side as V);
    const s = sv.clone().addScaledVector(t, -sv.dot(t)).normalize(), d = vec().crossVectors(t, s), f = 1 - (taper * i) / (n - 1);
    const w = (Array.isArray(sw) ? sw[i] : (sw as number)) * f, r = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, c]) => path[i].clone().addScaledVector(s, a * w).addScaledVector(d, c * sd * f));
    if (snap && i === n - 1) r.forEach((p, j) => p.addScaledVector(t, snap * (j < 2 ? (j === 0 ? 1.6 : 0.7) : -0.5)));
    if (snap0 && i === 0) r.forEach((p, j) => p.addScaledVector(t, -snap0 * (j % 3 ? 1.4 : -0.4)));
    rings.push(r);
    g.c.push(path[i].clone()), g.t.push(t), g.s.push(s), g.d.push(d), g.arc.push(i ? g.arc[i - 1] + path[i].distanceTo(path[i - 1]) : 0);
  }
  b.kit.loft(rings);
  g.to = laid(b);
  grains.push(g);
}
function grained(g: THREE.BufferGeometry, grains: readonly Grain[]): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute, uv = new Float32Array(2 * pos.count), p = vec(), o = vec();
  for (const gr of grains) {
    for (let v = 3 * gr.from; v < 3 * gr.to; v++) {
      p.fromBufferAttribute(pos, v);
      let k = 0;
      for (let i = 1; i < gr.c.length; i++) if (gr.c[i].distanceToSquared(p) < gr.c[k].distanceToSquared(p)) k = i;
      o.subVectors(p, gr.c[k]);
      uv[2 * v] = gr.arc[k] + o.dot(gr.t[k]);
      uv[2 * v + 1] = o.dot(gr.s[k]) + 0.7 * o.dot(gr.d[k]);
    }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function hulkKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.hulk), grains: Grain[] = [], ST = 10, DEPTH = 0.34;
  let tint = W.hulk;
  b.pick = (_c, n) => (n.y < -0.55 ? W.hulkUnder : tint);
  const tints = [W.hulk, W.hulk, W.hulkGrey, W.hulkWarm];
  const beam = (x: number): number => 0.165 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / 0.5, 2.4)));
  const at = (x: number, u: number, sd: number): V => {
    const z = sd * beam(x) * Math.sin(Math.min(1.2 * u, 1) * Math.PI * 0.5) * (1 - 0.06 * Math.max(0, u - 0.8) / 0.2);
    const rise = 0.14 * Math.max(0, x) ** 2, sag = x < -0.12 ? 0.22 * (x + 0.12) : 0, sheer = 0.25 * x * x * u;
    return vec(x, 0.02 + DEPTH * (0.55 * u + 0.45 * u * u) + rise + sag + sheer, z);
  };
  const out = (x: number, u: number, sd: number): V => {
    const e = 0.01, a = vec().subVectors(at(x + e, u, sd), at(x - e, u, sd)), c = vec().subVectors(at(x, u + e, sd), at(x, Math.max(u - e, 0), sd));
    const n = vec().crossVectors(a, c).normalize();
    return n.dot(vec(0, -0.6, sd)) < 0 ? n.negate() : n;
  };
  const keel = [-0.5, -0.33, -0.16, 0, 0.16, 0.33, 0.49].map((x) => at(x, 0, 1).setZ(0).add(vec(0, -0.02, 0)));
  timber(b, grains, keel, vec(0, 0, 1), 0.016, 0.024, 0, 0);
  const bow = keel[keel.length - 1], stern = keel[0];
  tint = W.hulkGrey;
  timber(b, grains, [0, 0.09, 0.22, 0.36, 0.47].map((y, i) => bow.clone().add(vec([0, 0.05, 0.088, 0.105, 0.11][i], y, 0))), vec(0, 0, 1), 0.01, 0.014, 0.3, 0.02);
  timber(b, grains, [0, 0.11, 0.21, 0.28].map((y, i) => stern.clone().add(vec([0, -0.03, -0.062, -0.08][i], y, 0))), vec(0, 0, 1), 0.01, 0.014, 0.25, 0.018);
  for (let i = 0; i < ST; i++) {
    const x = -0.42 + (0.84 * i) / (ST - 1), end = Math.abs(x) > 0.3 ? 0.8 : 1;
    for (const sd of [-1, 1]) {
      const top = end * (sd < 0 ? (i % 3 === 1 ? 0.4 + 0.2 * rnd() : 0.82 + 0.22 * rnd()) : 0.62 + 0.28 * rnd());
      for (const [dx, k] of [[-0.01, 1], [0.01, 0.7 + 0.3 * rnd()]] as const) {
        tint = tints[Math.floor(rnd() * tints.length)];
        const u1 = top * k, pts: V[] = [];
        for (let j = 0; j <= 5; j++) pts.push(at(x + dx, (j / 5) * u1, sd).addScaledVector(out(x + dx, (j / 5) * u1, sd), -0.01));
        timber(b, grains, pts, vec(1, 0, 0), 0.0068, 0.01, 0.4, 0.012 + 0.012 * rnd());
      }
    }
  }
  const plank = (sd: number, u0: number, u1: number, x0: number, x1: number): void => {
    tint = tints[Math.floor(rnd() * tints.length)];
    const segs = Math.max(2, Math.ceil((x1 - x0) / 0.045)), path: V[] = [], side: V[] = [], sw: number[] = [];
    for (let k = 0; k <= segs; k++) {
      const x = x0 + ((x1 - x0) * k) / segs, lo = at(x, u0, sd), hi = at(x, u1, sd), um = (u0 + u1) / 2;
      path.push(at(x, um, sd).addScaledVector(out(x, um, sd), 0.006));
      side.push(vec().subVectors(hi, lo));
      sw.push(lo.distanceTo(hi) / 2);
    }
    timber(b, grains, path, side, sw, 0.0055, 0, 0.02 + 0.03 * rnd(), 0.02 + 0.03 * rnd());
  };
  const run = (sd: number, u0: number, u1: number, x0: number, x1: number, gap: number): void => {
    if (gap > 0 && rnd() < gap) {
      const m = x0 + (x1 - x0) * (0.3 + 0.4 * rnd()), w = 0.06 + 0.1 * rnd();
      plank(sd, u0, u1, x0, m - w / 2);
      plank(sd, u0, u1, m + w / 2, x1);
    } else plank(sd, u0, u1, x0, x1);
  };
  for (const [u0, u1, x0, x1, gap] of [[0.02, 0.135, -0.47, 0.47, 0], [0.15, 0.265, -0.42, 0.44, 0.3], [0.28, 0.395, -0.33, 0.36, 0.6], [0.41, 0.52, -0.2, 0.3, 0.7], [0.535, 0.64, -0.06, 0.2, 0]] as const) {
    run(1, u0, u1, x0 + 0.04 * rnd(), x1 - 0.05 * rnd(), gap);
  }
  plank(-1, 0.02, 0.125, -0.3, 0.38);
  plank(-1, 0.14, 0.24, 0.06, 0.27);
  return grained(b.kit.build(), grains);
}

function spillKit(nx: number, nu: number, spray: boolean): THREE.BufferGeometry {
  const pos: number[] = [], us: number[] = [], rows = nu + (spray ? 2 : 0);
  const at = (i: number, j: number): void => {
    const x = i / nx - 0.5, u = j <= nu ? j / nu : 1 + (j - nu) * 0.25;
    const s = Math.max(0, (Math.min(u, 1) - 0.3) / 0.7), z = u < 0.3 ? 0.3 : 0.3 - 0.8 * s, y = u < 0.3 ? u / 0.3 : 1 - s;
    pos.push(x, y + Math.max(0, u - 1), z);
    us.push(u);
  };
  for (let j = 0; j < rows; j++) {
    if (spray && j === nu) continue;
    for (let i = 0; i < nx; i++) for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) at(a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  return g;
}

const BORE =  `
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

const SPILL_VERT =  `
uniform float uSeaLevel, uTime;
in float aU;
varying vec3 vWorld, vN;
varying vec2 vAt;
varying float vU, vPhase, vDist, vSeed, vEnd, vH;
${BORE}
vec2 section(float u, float zc, float h) {
  if (u < 0.3) { float a = u / 0.3 * 1.5707963; return vec2(zc + 0.17 * cos(a), h * (-0.25 + 1.25 * sin(a))); }
  if (u > 1.0) { float s = u - 1.0; return vec2(zc - 0.12 - 0.5 * s, h * (1.0 + 1.6 * s)); }
  float s = (u - 0.3) / 0.7;
  return vec2(mix(zc, -0.5, s), h * mix(0.04, 1.0, (1.0 - s) * (1.0 - s) * (1.0 + 2.0 * s)));
}
vec3 shape(float x, float u, vec3 o, mat3 B, float ph, float set) {
  float rise = smoothstep(0.0, 0.14, ph), slump = smoothstep(0.16, 0.8, ph);
  float zc = mix(0.3, 0.02, slump);
  float lumps = n3((o + B * vec3(x, 0.0, 0.0)) * 2.2 + vec3(set * 3.1));
  float h = mix(0.6, 1.0, rise) * mix(1.0, 0.5, slump) * (0.75 + 0.5 * lumps) * sqrt(1.0 - smoothstep(0.28, 0.5, abs(x)));
  vec2 zy = section(u, zc, h);
  return vec3(x, zy.y, zy.x);
}
void main() {
  vEnd = position.x;
  vU = aU;
  mat4 M = modelMatrix * instanceMatrix;
  vec3 o = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vSeed = fract(sin(dot(floor(o * 4.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vPhase = uTime / 7.5 + dot(o, vec3(0.031, 0.047, 0.023)) + 0.06 * vSeed;
  float ph = fract(vPhase), set = floor(vPhase);
  mat3 B = mat3(M);
  vec3 p = shape(position.x, aU, o, B, ph, set);
  vec3 px = shape(position.x + 0.02, aU, o, B, ph, set), pu = shape(position.x, aU + (aU < 1.0 ? 0.02 : 0.05), o, B, ph, set);
  vN = normalize(cross(B * (px - p), B * (pu - p)));
  vec4 wp = M * vec4(p, 1.0);
  wp.xyz += normalize(o) * uSeaLevel;
  float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
  vAt = vec2(position.x * sx + 7.0 * vSeed, p.y * sy);
  vH = sy;
  vWorld = wp.xyz;
  vDist = distance(wp.xyz, cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SPILL_FRAG =  `
uniform vec3 uFoam, uFace;
varying vec3 vWorld, vN;
varying vec2 vAt;
varying float vU, vPhase, vDist, vSeed, vEnd, vH;
${BORE}
void main() {
  float ph = fract(vPhase), set = floor(vPhase), rise = smoothstep(0.0, 0.14, ph), slump = smoothstep(0.16, 0.8, ph);
  float u = vU, y = vAt.y, x = vAt.x;
  vec3 n = normalize(vN), v = normalize(cameraPosition - vWorld);
  float nv = abs(dot(n, v)), ndl = dot(n, uSun);
  float a;
  vec3 col;
  Paper q = paperPlain(vWorld, n);
  if (u > 1.0) {
    float s = (u - 1.0) / 0.5, fl = n3(vWorld * vec3(13.0, 6.0, 13.0) + vec3(0.0, -2.5 * uTime, set));
    a = smoothstep(0.74, 0.8, fl) * (1.0 - s) * rise * (1.0 - smoothstep(0.1, 0.45, ph)) * 0.85;
    col = mix(parchment(q), uFoam, 0.7);
  } else {
    float along = vAt.x, lumpy = n3(vWorld * 9.0 + vec3(set));
    float streak = n3(vec3(along * 1.1, u * 7.0 + y * 5.0, set * 5.3 + vSeed)) + 0.45 * n3(vec3(along * 3.7, u * 19.0 + y * 13.0, set));
    float lace = n3(vWorld * 6.0 + vec3(0.3 * uTime, set, 0.0)) + 0.35 * n3(vWorld * 15.0 + vec3(set));
    float crest = smoothstep(0.08, 0.24, u) * (1.0 - smoothstep(0.42, 0.7, u));
    float tail = smoothstep(0.38, 0.7, u);
    float dense = mix(mix(0.5, 0.92, crest), 0.3, tail) - 0.3 * slump;
    float white = smoothstep(1.32 - dense - 0.05, 1.32 - dense + 0.05, 0.55 * streak + 0.45 * lace + 0.2 * crest);
    float face = (1.0 - rise * 0.7) * (1.0 - slump) * (1.0 - smoothstep(0.12, 0.3, u)) * smoothstep(-0.1, 0.05, y);
    float ragged = smoothstep(0.0, 0.3, nv + 0.35 * (lumpy - 0.5)) * (1.0 - smoothstep(0.3, 0.5, abs(vEnd) + 0.12 * (lumpy - 0.5)));
    float fu = max(fwidth(u), 1e-4);
    float top = (1.0 - smoothstep(0.5, 1.3, abs(u - 0.3 - 0.04 * (lumpy - 0.5)) / fu)) * step(0.3, n3(vec3(along * 1.6, set * 2.3, vSeed * 5.0)));
    float lip = (1.0 - smoothstep(0.4, 1.1, abs(u - 0.13 - 0.05 * lumpy) / fu)) * step(0.48, n3(vec3(along * 3.1 + 4.0, set, vSeed * 3.0)));
    float pen = max(top, 0.75 * lip) * (1.0 - 0.6 * slump) * (1.0 - smoothstep(0.32, 0.5, abs(vEnd) + 0.12 * (lumpy - 0.5)));
    a = max(max(white * mix(0.72, 0.5, tail), 0.3 * face) * ragged, pen * 0.85) * (1.0 - smoothstep(0.8, 1.0, u)) * smoothstep(-0.12, 0.0, y);
    col = parchment(q) * 1.04;
    float tone = lightTone(ndl, nv);
    col = mix(col, wash(col, uShade, 0.5), 0.3 * smoothstep(0.4, 0.95, tone));
    col = mix(col, uFace, (1.0 - white) * 0.75 + 0.25 * (1.0 - smoothstep(0.0, 0.08, y)));
    vec2 c = vec2(x * 9.0 + y * 4.0, y * 9.0 - x * 2.0);
    float hat = hatching(c, dFdx(c), dFdy(c), 0.45 * face * (1.0 - white) + 0.3 * smoothstep(0.6, 1.0, tone) * white, 7.0);
    col = mix(col, hatchInk(0.35), 0.45 * hat);
    col = mix(col, hatchInk(0.8), pen);
  }
  if (a < 0.03) discard;
  writeVeil(col, min(a, 0.96) * (1.0 - smoothstep(40.0, 62.0, vDist)));
}`;

export interface Part { m: THREE.Matrix4; at: V; dir: V; base: number; ground: number; sim: number; top: number }
export interface Channel { reef: number; great: boolean; bearing: number; width: number; crest: { x: number; y: number }; centre: { x: number; y: number }; line: V[] }
export interface CoralPlan {
  palms: Part[][]; pandanus: Part[]; shrubs: Part[]; heads: Part[]; branches: Part[]; tables: Part[]; slabs: Part[];
  boulders: Part[]; drift: Part[]; stakes: Part[]; hulks: Part[];
  surf: V[];
  spill: Part[];
  channels: Channel[]; sills: Channel[];
  turtles: { swim: V[]; nest: V[] }; fish: V[]; seabirds: V[]; voices: { at: V; loud: number }[];
}

const surfaceOut = (): Surface => ({ height: 0, normal: vec(), up: 1, ground: GROUND.beach as Ground, region: RI });
export const groundAt = (field: TerrainField, dir: V): number => field.surface(dir, -10, surfaceOut()).height;

export function planCoral(field: TerrainField): CoralPlan {
  const geo = field.geo, rnd = seeded(717), S = surfaceOut(), lee = CORAL.lee, mark = REGION.landmark;
  const sim = (x: number, y: number): number => heightAt(geo, chartDir(RI, x, y));
  const tan = (x: number, y: number, dx: number, dy: number): V =>
    chartDir(RI, x + dx * 0.25, y + dy * 0.25).sub(chartDir(RI, x - dx * 0.25, y - dy * 0.25)).normalize();
  const plan: CoralPlan = {
    palms: [[], [], []], pandanus: [], shrubs: [], heads: [], branches: [], tables: [], slabs: [], boulders: [],
    drift: [], stakes: [], hulks: [], surf: [], spill: [], channels: [], sills: [], turtles: { swim: [], nest: [] }, fish: [],
    seabirds: [], voices: [],
  };
  const place = (list: Part[], x: number, y: number, o: { sink: number; fwd: V; yaw?: number; tilt?: number; s: number; sy?: number; sz?: number; hug?: boolean; kitH: number }): Part => {
    const dir = chartDir(RI, x, y), ground = field.surface(dir, -10, S).height, base = ground - o.sink, sy = o.sy ?? o.s;
    const up = o.hug && S.normal.lengthSq() > 0.25 && S.normal.dot(dir) > 0.6 ? S.normal.clone() : dir, at = lift(dir, base);
    const p: Part = { m: pose(new THREE.Matrix4(), at, up, o.fwd, o.yaw ?? 0, o.tilt ?? 0, o.s, sy, o.sz ?? o.s), at, dir, base, ground, sim: heightAt(geo, dir), top: base + o.kitH * sy };
    list.push(p);
    return p;
  };
  REGION.strokes.forEach((s, si) => {
    if (s.k !== 'reef') return;
    const crest: number[] = [], rad: number[] = [];
    for (let b = 0; b < 360; b++) {
      const c = Math.cos(b * DEG), sn = Math.sin(b * DEG), rim = rimAt(s.rim, 90 - b), r0 = rim.r - rim.w - 3, r1 = rim.r + rim.w + 3;
      let best = -Infinity, br = r0;
      for (let rr = r0; rr <= r1; rr += 0.5) {
        const h = sim(s.x + rr * c, s.y + rr * sn);
        if (h > best) { best = h; br = rr; }
      }
      crest.push(best);
      rad.push(best < LOW ? rim.r : br);
    }
    const kinds: [(h: number) => boolean, Channel[], number][] = [[(h) => h < LOW, plan.channels, 2], [(h) => h >= LOW && h < BLOCK, plan.sills, 3]];
    for (const [pass, list, least] of kinds) {
      const start = crest.findIndex((h) => !pass(h));
      if (start < 0) continue;
      let run: number[] = [];
      const emit = (): void => {
        const mid = run[run.length >> 1], rc = rad[mid], width = run.length * DEG * rc;
        run = [];
        if (width < least) return;
        const c = Math.cos(mid * DEG), sn = Math.sin(mid * DEG), line: V[] = [];
        for (let d = 3; d >= -Math.min(8, 0.45 * rc); d--) line.push(chartDir(RI, s.x + (rc + d) * c, s.y + (rc + d) * sn));
        list.push({ reef: si, great: s.great, bearing: mid, width, crest: { x: s.x + rc * c, y: s.y + rc * sn }, centre: { x: s.x, y: s.y }, line });
      };
      for (let i = 1; i <= 360; i++) {
        const b = (start + i) % 360;
        if (pass(crest[b])) run.push(b);
        else if (run.length) emit();
      }
    }
  });
  const lines = plan.channels.map((c) => {
    const rc = Math.hypot(c.crest.x - c.centre.x, c.crest.y - c.centre.y), ux = (c.crest.x - c.centre.x) / rc, uy = (c.crest.y - c.centre.y) / rc;
    const inner = Math.min(8, 0.45 * rc);
    return { x: c.centre.x + (rc - inner) * ux, y: c.centre.y + (rc - inner) * uy, ux, uy, len: inner + 3 };
  });
  const open = (x: number, y: number, r = CLEAR): boolean => lines.some((l) => {
    const t = Math.min(l.len, Math.max(0, (x - l.x) * l.ux + (y - l.y) * l.uy));
    return Math.hypot(x - l.x - t * l.ux, y - l.y - t * l.uy) < r;
  });
  for (let y = -66; y <= 66; y += CORAL.step) {
    for (let x = -66; x <= 66; x += CORAL.step) {
      const px = x + (rnd() - 0.5) * 0.9, py = y + (rnd() - 0.5) * 0.9, h = sim(px, py), r = rnd(), dir = chartDir(RI, px, py);
      if (surfAt(geo, dir, 0) > 0.5) plan.surf.push(dir);
      if (h < LOW) {
        if (h > -5 && Math.hypot(px - mark.x, py - mark.y) < mark.r - 2 && r < 0.05) plan.turtles.swim.push(dir);
        continue;
      }
      const ground = field.surface(dir, -10, S).height;
      const gx = sim(px + 0.7, py) - sim(px - 0.7, py), gy = sim(px, py + 0.7) - sim(px, py - 0.7), gl = Math.hypot(gx, gy);
      const ox = gl > 1e-4 ? -gx / gl : 1, oy = gl > 1e-4 ? -gy / gl : 0;
      const seaward = sim(px + 6 * ox, py + 6 * oy) < -6, out = tan(px, py, ox, oy), east = tan(px, py, 1, 0);
      const windward = -(ox * lee[0] + oy * lee[1]) > 0.3, yaw = rnd() * TAU;
      if (h > LAND) continue;
      if (open(px, py, CLEAR + 0.9)) continue;
      if (h >= BLOCK) {
        if (Math.abs(coastAt(geo, dir)) < 1.2 && h > 0.1 && r > 0.8) place(plan.slabs, px, py, { sink: 0.03, fwd: out, tilt: 0.1, s: 0.4 + 0.35 * rnd(), hug: true, kitH: 0.06 });
        else if (seaward && r < 0.35) place(plan.slabs, px, py, { sink: 0.03, fwd: east, yaw, s: 0.3 + 0.3 * rnd(), hug: true, kitH: 0.06 });
        else if (seaward && windward && r < 0.6) place(plan.boulders, px, py, { sink: 0.1, fwd: east, yaw, tilt: 0.3 * (rnd() - 0.5), s: 0.22 + 0.2 * rnd(), kitH: 0.42 });
        else if (r < 0.78) place(plan.boulders, px, py, { sink: 0.06, fwd: east, yaw, tilt: 0.2 * (rnd() - 0.5), s: 0.14 + 0.16 * rnd(), sy: 0.6 * (0.14 + 0.16 * rnd()), kitH: 0.42 });
      } else if (r < 0.5) {
        const k = rnd(), kind: [Part[], number, number] = k < 0.4 ? [plan.heads, 0.46, 0.08] : k < 0.75 ? [plan.branches, 0.45, 0.05] : [plan.tables, 0.36, 0.04];
        const s = Math.min(0.7 + 0.9 * rnd(), (UNDER - (ground - kind[2])) / kind[1]);
        if (s >= 0.2) {
          const p = place(kind[0], px, py, { sink: kind[2], fwd: east, yaw, s, kitH: kind[1] });
          if (plan.fish.length < 160 && rnd() < 0.4) plan.fish.push(p.dir);
        }
      }
    }
  }
  const lr = seeded(718);
  for (let y = -66; y <= 66; y += MOTU) {
    for (let x = -66; x <= 66; x += MOTU) {
      const px = x + (lr() - 0.5) * 0.8 * MOTU, py = y + (lr() - 0.5) * 0.8 * MOTU, r = lr(), q = lr();
      if (sim(px, py) <= LAND) continue;
      const dir = chartDir(RI, px, py);
      if (field.surface(dir, -10, S).up < 0.75) continue;
      const gx = sim(px + 0.7, py) - sim(px - 0.7, py), gy = sim(px, py + 0.7) - sim(px, py - 0.7), gl = Math.hypot(gx, gy);
      const ox = gl > 1e-4 ? -gx / gl : 1, oy = gl > 1e-4 ? -gy / gl : 0;
      const inland = -coastAt(geo, dir), leeFwd = tan(px, py, lee[0], lee[1]);
      const grove = 0.5 + 0.5 * Math.sin(0.8 * px + 2 * Math.sin(0.5 * py)) * Math.cos(0.6 * py - 1.7 * Math.sin(0.4 * px));
      if (inland < 0.5 && !(inland >= 0.18 && sim(px, py) > LAND + 0.12 && r < 0.55)) {
        if (r < 0.1) place(plan.drift, px, py, { sink: 0.02, fwd: tan(px, py, -oy, ox), yaw: 0.6 * (lr() - 0.5), s: 0.8 + lr(), hug: true, kitH: 0.08 });
        else if (r > 0.93) plan.turtles.nest.push(dir);
        continue;
      }
      if (r < 0.4 + 0.45 * grove) {
        const young = lr() < 0.3, edge = inland < 2.5;
        const p = place(plan.palms[young ? 2 : lr() < 0.5 ? 0 : 1], px, py, {
          sink: 0.06, fwd: edge ? tan(px, py, 0.6 * ox + 0.4 * lee[0], 0.6 * oy + 0.4 * lee[1]) : leeFwd, yaw: 0.5 * (lr() - 0.5),
          tilt: edge ? 0.14 + 0.22 * lr() : 0.03 + 0.1 * lr(), s: young ? 1.1 + 0.6 * lr() : 2.2 + 1.3 * lr(), kitH: 1,
        });
        if (!young && plan.seabirds.length < 60 && lr() < 0.2) plan.seabirds.push(lift(dir, p.top));
      } else if (inland > 1.2 && r < 0.82) place(plan.pandanus, px, py, { sink: 0.05, fwd: leeFwd, yaw: lr() * TAU, tilt: 0.12 * lr(), s: 1.5 + 0.8 * lr(), kitH: 0.85 });
      else if (q < 0.5) place(plan.shrubs, px, py, { sink: 0.06, fwd: leeFwd, yaw: lr() * TAU, s: 0.7 + 0.8 * lr(), sy: 0.6 + 0.5 * lr(), kitH: 0.46 });
    }
  }
  for (const c of plan.channels) {
    const rc = Math.hypot(c.crest.x - c.centre.x, c.crest.y - c.centre.y), ux = (c.crest.x - c.centre.x) / rc, uy = (c.crest.y - c.centre.y) / rc;
    const across = (d: number, sd: number, beyond: number, edge: number): { x: number; y: number } | null => {
      const r = rc + d, at = (t: number): { x: number; y: number } => {
        const a = (sd * t) / r, ca = Math.cos(a), sa = Math.sin(a);
        return { x: c.centre.x + r * (ux * ca - uy * sa), y: c.centre.y + r * (ux * sa + uy * ca) };
      };
      for (let t = CLEAR + 0.2; t < 11; t += 0.25) {
        const q = at(t);
        if (sim(q.x, q.y) < edge) continue;
        const e = at(t + beyond);
        return sim(e.x, e.y) >= edge ? e : null;
      }
      return null;
    };
    for (const d of c.great ? [7, 3, -1, -5].filter((d) => d >= -Math.min(8, 0.45 * rc)) : [1.5, -1]) {
      for (const sd of [-1, 1]) {
        const e = across(d, sd, 0.4, -DRAFT);
        if (!e || open(e.x, e.y, 1.1)) continue;
        const g = groundAt(field, chartDir(RI, e.x, e.y)), sc = 1 + 0.15 * rnd(), sy = Math.max(sc, (TIDE.amp + 0.9 - (g - 0.3)) / 2);
        place(plan.stakes, e.x, e.y, { sink: 0.3, fwd: tan(e.x, e.y, ux, uy), yaw: rnd() * TAU, tilt: 0.08 * (rnd() - 0.5), s: sc, sy, kitH: 2 });
      }
    }
    const e = c.great ? across(0, -1, 0.5, BLOCK) : null;
    if (e && !open(e.x, e.y, 2.5)) {
      const p = place(plan.hulks, e.x, e.y, { sink: 0.17, fwd: tan(e.x, e.y, -uy, ux), yaw: 0.2, tilt: 0.32, s: 3.4, kitH: 0.62 });
      plan.seabirds.push(lift(p.dir, p.top));
    }
  }
  const taken = new Set<string>(), sr = seeded(719);
  for (let y = -66; y <= 66; y += 0.45) {
    for (let x = -66; x <= 66; x += 0.45) {
      const px = x + (sr() - 0.5) * 0.4, py = y + (sr() - 0.5) * 0.4, dir = chartDir(RI, px, py);
      const c = coastAt(geo, dir);
      if (c < -0.1 || c > 1.1) continue;
      const loud = surfAt(geo, dir, 0);
      if (loud < 0.3 || open(px, py, CLEAR + 1.3)) continue;
      const key = `${Math.round(px / 0.9)},${Math.round(py / 0.9)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      const gx = coastAt(geo, chartDir(RI, px + 0.5, py)) - coastAt(geo, chartDir(RI, px - 0.5, py));
      const gy = coastAt(geo, chartDir(RI, px, py + 0.5)) - coastAt(geo, chartDir(RI, px, py - 0.5)), gl = Math.hypot(gx, gy);
      if (gl < 1e-4) continue;
      if ([2, 4, 6].some((k) => open(px + (k * gx) / gl, py + (k * gy) / gl))) continue;
      for (const [back, tall] of [[0, 0.24 + 0.12 * sr()], [1.1, 0.08 + 0.05 * sr()]]) {
        const bx = px - (back * gx) / gl, by = py - (back * gy) / gl, d = chartDir(RI, bx, by), ground = heightAt(geo, d);
        if (back > 0 && ground > TIDE.amp * 0.5) continue;
        const at = lift(d, -0.04), sy = tall * (0.6 + 0.4 * loud);
        plan.spill.push({ m: pose(new THREE.Matrix4(), at, d, tan(bx, by, gx / gl, gy / gl), 0.25 * (sr() - 0.5), 0, 1.5 + 0.6 * sr(), sy, 1 - 0.4 * Math.sign(back)), at, dir: d, base: -0.04, ground, sim: ground, top: sy });
      }
    }
  }
  const bins = new Map<string, { at: V; n: number }>();
  for (const d of plan.surf) {
    const k = [d.x, d.y, d.z].map((v) => Math.round((v * R) / 10)).join(','), b = bins.get(k);
    if (b) { b.at.add(d); b.n++; } else bins.set(k, { at: d.clone(), n: 1 });
  }
  const most = Math.max(1, ...[...bins.values()].map((b) => b.n));
  plan.voices = [...bins.values()].map((b) => ({ at: b.at.normalize(), loud: b.n / most }));
  return plan;
}

export class CoralAtolls {
  readonly group = new THREE.Group();
  readonly plan: CoralPlan;
  readonly turtles: { swim: readonly V[]; nest: readonly V[] };
  readonly fish: readonly V[];
  readonly seabirds: readonly V[];
  readonly voices: readonly { at: V; loud: number }[];
  private readonly material: THREE.ShaderMaterial;
  private readonly fine: THREE.ShaderMaterial;
  private readonly grove: THREE.ShaderMaterial;
  private readonly palm: THREE.ShaderMaterial;
  private readonly wreck: THREE.ShaderMaterial;
  private readonly spillMaterial: THREE.ShaderMaterial;
  private readonly fixed: Draw[];
  private readonly near: [Draw, Part[], number, number, boolean, number][];
  private readonly spills: Draw[];
  private drawn = NaN;
  private readonly swell: Swell;
  private readonly seen = vec(1e9, 0, 0);
  private readonly fwd = vec(0, 0, 0);
  private readonly look = vec(0, 0, 0);
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly ball = new THREE.Sphere();

  constructor(style: Style, field: TerrainField, swell: Swell) {
    const plan = (this.plan = planCoral(field));
    this.turtles = plan.turtles;
    this.fish = plan.fish;
    this.seabirds = plan.seabirds;
    this.voices = plan.voices;
    this.swell = swell;
    this.material = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide });
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -1;
    this.material.polygonOffsetUnits = -2;
    this.fine = illustratedMaterial(style, {
      pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide, inkWeight: 0.45, anchor: 'object', hatch: { axis: [1, 0, 0] }, surface: 'tone = min(tone, 0.6);',
    });
    this.grove = illustratedMaterial(style, {
      pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide, inkWeight: 0.55,
      surface: `n = normalize(vNormal); ndl = dot(n, uSun); tone = lightTone(ndl, abs(dot(n, v)));
        col = sunGlaze(shadeGlaze(glaze(parchment(q), vPaint.rgb, vPaint.w, washPool(n, v, q), q), tone, q), ndl, tone);
        tone = min(tone, 0.5);`,
    });
    this.palm = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide, inkWeight: 0.45, surface: 'tone = min(tone, 0.6);' });
    const wreck = (this.wreck = illustratedMaterial(style, {
      pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide, inkWeight: 0.6, anchor: 'object', hatch: { mode: 'uv', scale: [3.4, 3.4] }, surface: WRECK,
    }));
    wreck.fragmentShader = `uniform float uSeaLevel;\n${wreck.fragmentShader}`;
    wreck.uniforms.uSeaLevel = swell.uniforms.uSeaLevel;
    const fixed = (kit: THREE.BufferGeometry, parts: Part[], m = this.material): Draw => new Draw(kit, m, parts.length).fill(parts.map((p) => p.m));
    this.fixed = [
      fixed(shrubKit(9), plan.shrubs),
      fixed(driftKit(4), plan.drift), fixed(stakeKit(), plan.stakes, this.fine), fixed(hulkKit(8), plan.hulks, wreck),
    ];
    const near: [THREE.BufferGeometry, Part[], number, number, boolean, THREE.ShaderMaterial?, number?][] = [
      [slabKit(12), plan.slabs, 0, CORAL.near, true], [boulderKit(13), plan.boulders, 0, CORAL.near, false],
      ...[11, 29, 23].flatMap((seed, k): [THREE.BufferGeometry, Part[], number, number, boolean, THREE.ShaderMaterial?, number?][] => [
        [palmNearKit(seed, k === 2), plan.palms[k], 0, CORAL.leaflets, false, this.palm], [palmNearKit(seed, k === 2, false), plan.palms[k], CORAL.leaflets, CORAL.palms, false, this.palm],
        [palmKit(seed, k === 2, true), plan.palms[k], CORAL.palms, 1e4, false, this.grove, k === 2 ? 0.35 : 0.6]]),
      [pandanusNearKit(5), plan.pandanus, 0, CORAL.drawn, false], [pandanusKit(5), plan.pandanus, CORAL.drawn, 1e4, false]];
    this.near = near.map(([kit, parts, from, to, dry, m, keep]) => [new Draw(kit, m ?? this.material, parts.length), parts, from, to, dry, keep ?? 1]);
    this.spillMaterial = inkMaterial(style, { vertexShader: SPILL_VERT, fragmentShader: SPILL_FRAG, veil: true, side: THREE.DoubleSide,
      uniforms: { uSeaLevel: swell.uniforms.uSeaLevel, uFoam: { value: linearVec(PIGMENTS.leadWhite) }, uFace: { value: linearVec(PIGMENTS.verdigris) } } });
    this.spills = [new Draw(spillKit(10, 7, true), this.spillMaterial, plan.spill.length), new Draw(spillKit(5, 4, false), this.spillMaterial, plan.spill.length)];
    this.near.push([this.spills[0], plan.spill, 0, CORAL.drawn, false, 1], [this.spills[1], plan.spill, CORAL.drawn, 62, false, 1]);
    this.group.add(...this.draws.map((d) => d.mesh));
  }

  private get draws(): Draw[] {
    return [...this.fixed, ...this.near.map(([d]) => d)];
  }

  update(eye: V, camera?: THREE.Camera): void {
    this.group.visible = regionSeen(RI, eye, 90);
    if (!this.group.visible) return;
    const level = this.swell.uniforms.uSeaLevel.value as number, fwd = camera ? camera.getWorldDirection(this.fwd) : null;
    if (eye.distanceToSquared(this.seen) < 2.25 && Math.abs(level - this.drawn) < 0.01 && (!fwd || fwd.dot(this.look) > 0.996)) return;
    this.seen.copy(eye);
    this.drawn = level;
    if (camera && fwd) {
      this.look.copy(fwd);
      camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
    const ball = this.ball;
    for (const [d, parts, from, to, dry, keep] of this.near) {
      const wet = this.spills.includes(d);
      d.begin();
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], r2 = eye.distanceToSquared(p.at);
        if ((keep < 1 && (i * 0.618034) % 1 >= keep) || r2 < from * from || r2 >= to * to || (dry && p.ground <= level - 0.02) || (wet && p.ground >= level - 0.08)) continue;
        if (camera) {
          const h = (p.top - p.base) / 2;
          ball.center.copy(p.dir).multiplyScalar(h).add(p.at);
          ball.radius = Math.max(h, 1.2 * p.m.getMaxScaleOnAxis()) + 0.5 + 0.09 * Math.sqrt(r2);
          if (!this.frustum.intersectsSphere(ball)) continue;
        }
        d.add(p.m);
      }
      d.end();
    }
  }

  get triangles(): number {
    return this.group.visible ? this.draws.reduce((s, d) => s + d.triangles, 0) : 0;
  }

  dispose(): void {
    this.material.dispose();
    this.fine.dispose();
    this.grove.dispose();
    this.palm.dispose();
    this.wreck.dispose();
    this.spillMaterial.dispose();
    for (const d of this.draws) d.mesh.geometry.dispose();
  }
}

export function createCoralAtolls(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sea || !terrain) throw new Error('createCoralAtolls: the sea and terrain are built first (MODULES order)');
  const coral = new CoralAtolls(ctx.pipeline.style, terrain.field, sea.swell);
  ctx.scene.add(coral.group);
  return {
    frame() {
      coral.update(ctx.camera.position, ctx.camera);
    },
    dispose() {
      ctx.scene.remove(coral.group);
      coral.dispose();
    },
  };
}
