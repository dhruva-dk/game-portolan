import * as THREE from 'three';
import { illustratedMaterial, type Style } from '../../style/glsl.ts';
import { PIGMENTS } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { coastAt } from '../../sim/world/geography.ts';
import { REGIONS } from '../../sim/world/regions.ts';
import { seas } from '../sea.ts';
import type { Riding, Swell } from '../swell.ts';
import { terrains, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, facetUV, Kit, lift, perInstance, pose, regionSeen, ring, seeded, tintFacets, vec, washOf, type V } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'basaltStacks');
const REGION = REGIONS[RI], MARK = REGION.landmark;
export const BASE = -2.6;
const NOTCH = [0.25, 0.95] as const;
const ARCH = { a: 3.6, spring: 10, w: 3.15, x1: 9.6, crest: 18.4, rise: 1.6, rays: 18 };
const SHORE = { step: 0.95, cliffs: 240, pave: 380, boulders: 280, colonies: 90 };
const SPRAY = { near: 60 };
const SHAFTS = [[5, 11, 5.5, [0.8]], [6, 23, 10, [0.6]], [7, 37, 16, [0.5, 0.76]], [6, 53, 0, [0.3, 0.55, 0.8]]] as const;
const ENTABLATURE = 3;
const classOf = (len: number) => (len < 7.5 ? 0 : len < 13 ? 1 : 2);

const WASH = {
  side: [0.5, 0.6, 0.7, 0.82].map((d) => washOf(PIGMENTS.ironGall, d)),
  wet: washOf(PIGMENTS.ironGall, 1.15),
  weed: washOf(PIGMENTS.verdigris, 0.85),
  top: washOf(PIGMENTS.ironGall, 0.55),
  pale: washOf(PIGMENTS.sepia, 0.45),
  moss: washOf(PIGMENTS.malachite, 0.6),
  guano: washOf(PIGMENTS.leadWhite, 0.6),
  spray: washOf(PIGMENTS.leadWhite, 0.22),
};
const STONES: readonly V[] = [PIGMENTS.malachite, PIGMENTS.leadWhite, PIGMENTS.sepia, PIGMENTS.ochre, PIGMENTS.verdigris].map((p) => washOf(p, 1).t);
const [MOSS, GUANO, BARE, LICHEN, WEED] = [0, 1, 2, 3, 4];
const SIDE = washOf(PIGMENTS.ironGall, 1).t;

const fract = (x: number) => x - Math.floor(x);
const unit = (p: { x: number; y: number; z: number }) => vec(p.x, p.y, p.z).normalize();
const tangent = (at: V, toward: V) => toward.clone().addScaledVector(at, -toward.dot(at)).normalize();
const offset = (u: V, e: V, n: V, dx: number, dy: number) => vec().copy(u).multiplyScalar(R).addScaledVector(e, dx).addScaledVector(n, dy).normalize();
const polygon = (sides: number, rng: () => number) =>
  Array.from({ length: sides }, (_, j) => [((j + 0.35 * (rng() - 0.5)) / sides) * 2 * Math.PI, 0.9 + 0.14 * rng()] as const);
const rim = (shape: readonly (readonly [number, number])[], y: number, s = 1, turn = 0) =>
  shape.map(([a, r]) => vec(Math.cos(a + turn) * r * s, y, Math.sin(a + turn) * r * s));
const strokes = (seed: number) => (_c: V, n: V, out: V) =>
  Math.abs(n.y) < 0.5 ? out.set(0, 1, 0) : Math.hypot(n.x, n.z) > 0.2 ? out.set(n.x, 0, n.z) : out.set(Math.cos(seed), 0, Math.sin(seed));

function shaftKit(sides: number, seed: number, len: number, joints: readonly number[]): THREE.BufferGeometry {
  const rng = seeded(seed), shape = polygon(sides, rng), notch = len ? [(NOTCH[0] - BASE) / len, (NOTCH[1] - BASE) / len] : [-1, -1];
  const band = joints[joints.length - 1], wet = notch[1] + 0.02;
  const kit = new Kit((c, n) => (c.y > 0.965 ? WASH.top : c.y < notch[0] ? WASH.weed : c.y < wet ? WASH.wet
    : WASH.side[Math.floor(4 * fract(Math.atan2(n.z, n.x) * 1.7 + seed))]));
  const rings = len ? [rim(shape, 0), rim(shape, notch[0]), rim(shape, (notch[0] + notch[1]) / 2, 0.84), rim(shape, notch[1])] : [rim(shape, 0)];
  let s = 1, turn = 0;
  for (const j of joints) {
    rings.push(rim(shape, j, s, turn));
    s = 0.93 + 0.05 * rng();
    turn += 0.1 + 0.08 * rng();
    rings.push(rim(shape, j, s, turn));
  }
  rings.push(rim(shape, 0.97, s, turn), rim(shape, 1, 0.84 * s, turn + 0.05));
  const g = kit.loft(rings).build();
  tintFacets(g, (c, n) => (c.y > 0.965 ? 1 : c.y > band && Math.abs(n.y) < 0.5 && Math.floor(fract(Math.atan2(n.z, n.x) / (2 * Math.PI)) * sides) % 3 === 0 ? 2 : 0));
  return facetUV(g, strokes(seed));
}

function paveKit(): THREE.BufferGeometry {
  const shape = polygon(6, seeded(41));
  const g = new Kit((c) => (c.y > 0.85 ? WASH.top : c.y < 0.35 ? WASH.wet : WASH.side[1])).loft([rim(shape, 0), rim(shape, 0.88), rim(shape, 1, 0.86)]).build();
  tintFacets(g, (c) => (c.y > 0.85 ? 1 : 0));
  return facetUV(g, strokes(41));
}

function boulderKit(seed: number): THREE.BufferGeometry {
  const rng = seeded(seed), j = Array.from({ length: 7 }, () => 0.8 + 0.35 * rng());
  const kit = new Kit((c, n) => (c.y < 0.05 ? WASH.wet : n.y > 0.6 ? WASH.pale : WASH.side[Math.floor(4 * fract(Math.atan2(n.z, n.x) + seed))]));
  kit.loft([ring(7, -0.5, (k) => 0.55 * j[k]), ring(7, 0, (k) => j[k]), ring(7, 0.45, (k) => 0.85 * j[(k + 2) % 7]), ring(7, 0.75, (k) => 0.4 * j[(k + 4) % 7])]);
  return facetUV(kit.build(), strokes(seed));
}

function sprayKit(): THREE.BufferGeometry {
  const kit = new Kit(() => WASH.spray), turn = new THREE.Matrix4(), lean = new THREE.Matrix4();
  for (const [a, tilt, h] of [[0, 0.1, 1], [2.1, 0.45, 0.7], [4.2, 0.4, 0.55]]) {
    turn.makeRotationY(a).multiply(lean.makeRotationX(tilt));
    kit.loft([ring(5, 0, () => 0.2), ring(5, 0.35 * h, () => 0.34), ring(5, 0.75 * h, () => 0.24), ring(5, h, () => 0.05)].map((r) => r.map((p) => p.applyMatrix4(turn))));
  }
  return facetUV(kit.build(), (_c, _n, out) => out.set(0, 1, 0));
}

const crestAt = (x: number, crest: number) => crest + ARCH.rise * (1 - (x / ARCH.x1) ** 2);
function reach(th: number, crest: number): number {
  const cx = Math.cos(th), cy = Math.sin(th);
  let t = ARCH.a;
  for (; t < 40; t += 0.02) {
    const x = t * cx;
    if (Math.abs(x) >= ARCH.x1 || ARCH.spring + t * cy >= crestAt(x, crest)) break;
  }
  return t;
}

function archKit(crest: number): THREE.BufferGeometry {
  const { a, spring, w, rays } = ARCH, I: V[] = [], O: V[] = [];
  for (let i = 0; i <= rays; i++) {
    const th = (i / rays) * Math.PI, t = reach(th, crest);
    I.push(vec(a * Math.cos(th), spring + a * Math.sin(th)));
    O.push(vec(t * Math.cos(th), spring + t * Math.sin(th)));
  }
  const kit = new Kit((c, n) => (n.y > 0.45 ? (fract(c.x * 0.37 + c.z * 0.21) < 0.7 ? WASH.guano : WASH.moss) : n.y < -0.3 ? WASH.wet
    : Math.abs(n.z) > 0.7 ? WASH.side[3] : WASH.side[2]));
  const z = (p: V, d: number) => vec(p.x, p.y, d);
  const quad = (p: V, q: V, r: V, s: V) => {
    kit.tri(p, q, r);
    kit.tri(p, r, s);
  };
  for (let i = 0; i < rays; i++) {
    quad(z(I[i], w), z(O[i], w), z(O[i + 1], w), z(I[i + 1], w));
    quad(z(I[i], -w), z(I[i + 1], -w), z(O[i + 1], -w), z(O[i], -w));
    quad(z(I[i], w), z(I[i + 1], w), z(I[i + 1], -w), z(I[i], -w));
    quad(z(O[i], -w), z(O[i + 1], -w), z(O[i + 1], w), z(O[i], w));
  }
  quad(z(I[0], w), z(I[0], -w), z(O[0], -w), z(O[0], w));
  quad(z(I[rays], w), z(O[rays], w), z(O[rays], -w), z(I[rays], -w));
  return facetUV(kit.build(), (c, n, out) => (Math.abs(n.z) > 0.7 ? out.set(c.x, c.y - spring, 0) : Math.abs(n.y) > 0.3 ? out.set(0, 0, 1) : out.set(0, 1, 0)), [8, 0.55]);
}

export interface Prism { o: V; u: V; f: V; yaw: number; r: number; len: number; kit: number; stone: number; streak: boolean }
export interface Part { o: V; u: V; f: V; yaw: number; tilt: number; s: V; stone: number }
export interface Burst { dir: V; out: V; size: number; w: number; phase: number }
export interface Plan {
  prisms: Prism[];
  pave: Part[];
  boulders: Part[];
  bursts: Burst[];
  colonies: V[];
  crest: number;
  arch: { at: V; east: V; north: V };
}

function stoneFor(rng: () => number, far: number): number {
  const r = rng(), guano = 0.18 + 0.5 * far, moss = guano + 0.45 - 0.3 * far;
  return r < guano ? GUANO : r < moss ? MOSS : r < moss + 0.15 ? LICHEN : BARE;
}
const topOf = (p: Prism) => p.o.clone().addScaledVector(p.u, p.len);

export function planStacks(field: TerrainField): Plan {
  const geo = field.geo, rng = seeded(1603), S: Surface = { height: 0, normal: vec(), up: 1, ground: 0, region: 0 };
  const ground = (p: V) => field.surface(p, 0, S).height;
  const at = chartDir(RI, MARK.x, MARK.y), east = tangent(at, chartDir(RI, MARK.x + 1, MARK.y)), north = tangent(at, chartDir(RI, MARK.x, MARK.y + 1));
  const heart = chartDir(RI, 0, 0);
  const plan: Plan = { prisms: [], pave: [], boulders: [], bursts: [], colonies: [], crest: ARCH.crest, arch: { at, east, north } };
  const flat = (x: number, y: number, z: number) => vec().copy(at).multiplyScalar(R + y).addScaledVector(east, x).addScaledVector(north, z);
  for (let x = -ARCH.x1; x <= ARCH.x1; x += 0.5) {
    for (let z = -ARCH.w; z <= ARCH.w; z += 0.5) plan.crest = Math.max(plan.crest, ground(flat(x, 0, z).normalize()) + 0.5);
  }
  const column = (u: V, f: V, r: number, base: number, top: number, stone: number): Prism =>
    ({ o: lift(u, base), u, f, yaw: rng() * 2 * Math.PI, r, len: top - base, kit: classOf(top - base), stone, streak: stone === GUANO && rng() < 0.85 });
  const footMax = (u: V, e: V, n: V, dx: number, dy: number, r: number) => {
    let h = ground(offset(u, e, n, dx, dy));
    for (let j = 0; j < 6; j++) h = Math.max(h, ground(offset(u, e, n, dx + r * Math.cos((j * Math.PI) / 3), dy + r * Math.sin((j * Math.PI) / 3))));
    return h;
  };

  const stacks = geo.stacks.filter((s) => s.region === RI);
  for (const st of stacks) {
    const u = unit(st.pos), n = unit(st.facing), e = vec().crossVectors(n, u);
    const pier = u.angleTo(at) * R < 9, far = Math.min(1, (u.angleTo(heart) * R) / 58);
    const pr = pier ? 1 : THREE.MathUtils.clamp(0.6 * st.r, 0.65, 1), rho = st.r - 0.5 * pr, rings = Math.max(1, Math.round(rho / (1.6 * pr)));
    const spots: (readonly [number, number])[] = [[0, 0]];
    for (let k = 1; k <= rings; k++) {
      const rk = (k * rho) / rings, count = Math.ceil((2 * Math.PI * rk) / (1.25 * pr)), a0 = rng() * 2 * Math.PI;
      for (let j = 0; j < count; j++) {
        const a = a0 + ((j + 0.3 * (rng() - 0.5)) / count) * 2 * Math.PI;
        spots.push([rk * Math.cos(a), rk * Math.sin(a)]);
      }
    }
    let ledge: Prism | null = null;
    for (const [dx, dy] of spots) {
      const r = pr * (0.92 + 0.16 * rng()), d = Math.hypot(dx, dy), h = footMax(u, e, n, dx, dy, r);
      const top = pier ? ARCH.spring + 0.45 : h + 0.3 + (1 - d / st.r) * st.height * 0.2 * rng() + (rng() < 0.12 ? 0.1 * st.height * rng() : 0);
      const p = column(offset(u, e, n, dx, dy), n, r, BASE, top, stoneFor(rng, far));
      plan.prisms.push(p);
      if (d > 0 && !pier && (!ledge || p.len < ledge.len)) ledge = p;
    }
    if (ledge && far > 0.5) {
      ledge.stone = GUANO;
      ledge.streak = true;
      plan.colonies.push(topOf(ledge));
    }
    for (let b = pier ? 3 : 1 + Math.round(rng()); b > 0; b--) {
      const a = rng() * 2 * Math.PI, d = st.r + 0.05;
      plan.bursts.push({ dir: offset(u, e, n, d * Math.cos(a), d * Math.sin(a)), out: e.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a)),
        size: 0.6 + 0.4 * rng() + 0.15 * st.r, w: 0.9 + 0.7 * rng(), phase: rng() * 2 * Math.PI });
    }
  }

  for (let i = 1; i < 2 * ARCH.rays; i++) {
    const th = (i / (2 * ARCH.rays)) * Math.PI, half = i % 2 === 1, t1 = reach(th, plan.crest), cx = Math.cos(th), cy = Math.sin(th);
    const t0 = half ? (ARCH.a + t1) / 2 : ARCH.a - 0.14, axis = east.clone().multiplyScalar(cx).addScaledVector(at, cy);
    for (const z of half ? [-ARCH.w + 0.05, ARCH.w - 0.05] : [-ARCH.w + 0.05, -ARCH.w / 2, 0, ARCH.w / 2, ARCH.w - 0.05]) {
      const stone = rng() < 0.65 ? GUANO : MOSS;
      plan.prisms.push({ o: flat(t0 * cx, ARCH.spring + t0 * cy, z), u: axis, f: north, yaw: rng() * 2 * Math.PI, r: 0.38 + 0.05 * rng(),
        len: t1 + 0.16 - t0, kit: ENTABLATURE, stone, streak: stone === GUANO });
    }
  }

  const near = stacks.map((s) => ({ u: unit(s.pos), lim: Math.cos((s.r + 0.7) / R) }));
  const clear = [...REGION.harbours.map((h) => [h.x, h.y, h.r + 2.5]), ...REGION.lighthouses.map((l) => [l.x, l.y, 4.5]), [MARK.x, MARK.y, 11]];
  let cliffs = 0;
  for (let y = -62; y <= 62; y += SHORE.step) {
    for (let x = -62; x <= 62; x += SHORE.step) {
      const px = x + 0.3 * (rng() - 0.5), py = y + 0.3 * (rng() - 0.5);
      if (clear.some(([cx, cy, cr]) => Math.hypot(px - cx, py - cy) < cr)) continue;
      const p = chartDir(RI, px, py), c = coastAt(geo, p);
      if (c > 0.6 || c < -2.8 || near.some((s) => p.dot(s.u) > s.lim)) continue;
      const h = ground(p), up = S.up;
      if (S.region !== RI) continue;
      if (c < -0.2 && c > -1.4 && h > 2.2 && cliffs < SHORE.cliffs) {
        const r = 0.5 + 0.12 * rng(), e = tangent(p, east), n = vec().crossVectors(p, e), stone = rng() < 0.45 ? GUANO : rng() < 0.6 ? MOSS : LICHEN;
        const q = column(p, east, r, BASE, footMax(p, e, n, 0, 0, r) + 0.25 + 0.5 * rng(), stone);
        plan.prisms.push(q);
        cliffs++;
        if (stone === GUANO && plan.colonies.length < SHORE.colonies) plan.colonies.push(topOf(q));
      } else if (c < -0.1 && h > 0.06 && h < 1.6 && up > 0.7 && plan.pave.length < SHORE.pave) {
        const r = 0.42 + 0.08 * rng(), base = h - 1.2, top = h + 0.06 + 0.22 * rng();
        plan.pave.push({ o: lift(p, base), u: p, f: east, yaw: rng() * 2 * Math.PI, tilt: 0, s: vec(r, top - base, r), stone: [MOSS, BARE, LICHEN, WEED][Math.floor(rng() * 4)] });
      } else if (c > -0.9 && h > -0.45 && h < 0.9) {
        if (rng() < 0.14 && plan.pave.length < SHORE.pave) {
          const r = 0.4 + 0.1 * rng();
          plan.pave.push({ o: lift(p, Math.max(h, -0.2) + 0.1), u: p, f: east, yaw: rng() * 2 * Math.PI, tilt: Math.PI / 2, s: vec(r, 0.7 + 0.8 * rng(), r), stone: BARE });
        } else if (rng() < 0.6 && plan.boulders.length < SHORE.boulders) {
          const s = 0.22 + 0.3 * rng() ** 2;
          plan.boulders.push({ o: lift(p, h - 0.1 * s), u: p, f: east, yaw: rng() * 2 * Math.PI, tilt: 0.3 * (rng() - 0.5),
            s: vec(s * (0.8 + 0.4 * rng()), s * (0.6 + 0.3 * rng()), s), stone: BARE });
        }
      }
    }
  }
  return plan;
}

interface Tinted { m: THREE.Matrix4; stone: number; streak: boolean }
const placed = (p: Part) => pose(new THREE.Matrix4(), p.o, p.u, p.f, p.yaw, p.tilt, p.s.x, p.s.y, p.s.z);

export class BasaltStacks {
  readonly group = new THREE.Group();
  readonly colonies: readonly V[];
  private readonly material: THREE.ShaderMaterial;
  private readonly draws: Draw[];
  private readonly spray: Draw;
  private readonly bursts: readonly Burst[];
  private readonly swell: Swell;
  private readonly ride: Riding = { position: vec(), up: vec() };
  private readonly at = vec();
  private readonly m = new THREE.Matrix4();

  constructor(style: Style, field: TerrainField, swell: Swell) {
    const plan = planStacks(field);
    this.swell = swell;
    this.colonies = plan.colonies;
    this.bursts = plan.bursts;
    this.material = illustratedMaterial(style, { pigment: PIGMENTS.ironGall, painted: true, hatch: { mode: 'uv', scale: [8, 0.55] }, side: THREE.DoubleSide });
    const tinted = (g: THREE.BufferGeometry, parts: readonly Tinted[]): Draw => {
      const d = new Draw(g, this.material, parts.length), t = perInstance(g, parts.length);
      d.begin();
      parts.forEach((p, i) => {
        const s = STONES[p.stone], a = p.streak ? STONES[GUANO] : SIDE;
        d.add(p.m);
        t.stone.setXYZ(i, s.x, s.y, s.z);
        t.accent.setXYZ(i, a.x, a.y, a.z);
      });
      d.end();
      return d;
    };
    const byClass: Tinted[][] = SHAFTS.map(() => []);
    for (const p of plan.prisms) byClass[p.kit].push({ m: pose(new THREE.Matrix4(), p.o, p.u, p.f, p.yaw, 0, p.r, p.len, p.r), stone: p.stone, streak: p.streak });
    const arch = pose(new THREE.Matrix4(), lift(plan.arch.at, 0), plan.arch.at, plan.arch.north, 0, 0, 1);
    this.draws = [
      ...SHAFTS.map(([sides, seed, len, joints], k) => tinted(shaftKit(sides, seed, len, joints), byClass[k])),
      tinted(paveKit(), plan.pave.map((p) => ({ m: placed(p), stone: p.stone, streak: false }))),
      new Draw(boulderKit(7), this.material, plan.boulders.length).fill(plan.boulders.map(placed)),
      new Draw(archKit(plan.crest), this.material, 1).fill([arch]),
    ];
    this.spray = new Draw(sprayKit(), this.material, plan.bursts.length);
    this.group.add(...this.draws.map((d) => d.mesh), this.spray.mesh);
  }

  update(eye: V, clock: number): void {
    this.group.visible = regionSeen(RI, eye, 75);
    if (!this.group.visible) return;
    this.spray.begin();
    for (const b of this.bursts) {
      const k = Math.sin(clock * b.w + b.phase);
      if (k < 0.2 || eye.distanceTo(this.at.copy(b.dir).multiplyScalar(R)) > SPRAY.near) continue;
      this.swell.ride(b.dir, b.out, 1.5, 1.5, clock, this.ride);
      const s = b.size * (0.6 + 0.4 * k);
      this.spray.add(pose(this.m, this.ride.position, this.ride.up, b.out, 0, 0.2, s, b.size * (0.3 + 2.2 * k * k), s));
    }
    this.spray.end();
  }

  get triangles(): number {
    return this.group.visible ? [...this.draws, this.spray].reduce((s, d) => s + d.triangles, 0) : 0;
  }

  dispose(): void {
    this.material.dispose();
    for (const d of [...this.draws, this.spray]) d.mesh.geometry.dispose();
  }
}

export function createBasaltStacks(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sea || !terrain) throw new Error('createBasaltStacks: the sea and terrain are built first (MODULES order)');
  const basalt = new BasaltStacks(ctx.pipeline.style, terrain.field, sea.swell);
  ctx.scene.add(basalt.group);
  return {
    frame() {
      basalt.update(ctx.camera.position, ctx.pipeline.style.uniforms.uTime.value);
    },
    dispose() {
      ctx.scene.remove(basalt.group);
      basalt.dispose();
    },
  };
}
