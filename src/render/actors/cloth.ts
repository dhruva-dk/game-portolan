// The sails and flags as cloth, simulated on the GPU for every ship at once: extended position-based dynamics
// (Macklin, Müller and Chentanez, "XPBD", MIG 2016) taken in many small steps of one iteration each (Macklin, Storey,
// Lu, Terdiman, Chentanez, Jeschke and Müller, "Small Steps in Physics Simulation", SCA 2019), which is what makes a
// Jacobi solve converge well enough for a sail without colouring the constraints.
//
// Each ship has a slot of particles, one for every vertex of her three lateens, three masthead pennants and the
// ensign (the yards are spars, and stay rigid). The cloth lives in the ship's own frame: her apparent wind (the true
// wind less her way, turned into her heeling, pitching frame), gravity in that frame and what her motion throws at the
// cloth (heave, the turn, speeding up and slowing) are given to it each frame. Wind presses on the cloth along its
// normal as the square of the wind through it, and drags along it, so a sail fills on whichever side the wind comes
// from and lifts and shakes when the wind runs along it; the flags stream and flutter on their own.
//
// A lateen is lashed along its yard (which swings round the mast with the sheet), at its tack and at the clew; a flag
// along its staff. The cloth is cut with draft, its rest lengths taken from the bellied shape, so it can fill to that
// depth and no further, and canvas pushed together buckles rather than shortening. Long-range attachments (Kim, Chentanez
// and Müller, "Long Range Attachments", SCA 2012) keep every particle within its cut distance of the nearest lashing,
// so a sail never stretches however hard it is blown, and a mast stands in the cloth as a cylinder it lies against.
//
// Where shot has gone through (the same holes the shader cuts), the wind goes through too and the canvas there holds
// nothing together: the rags round a hole flog loose.
//
// The running rigging hangs from the cloth: each lateen's sheet from its clew to the lee rail, and its vangs from the
// peak to either quarter. A rope is a chain of particles that holds against stretching and gives to any push, eased
// a little longer than the span between its ends, so it sags, swings with her roll and is blown out by the wind.
//
// Nothing is read back. The sail material reads the particles straight from the buffer in the vertex stage, and
// takes its normals from the neighbours' positions.
import * as THREE from 'three';
import { StorageBufferAttribute, type ComputeNode, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, If, Return, abs, cos, cross, dot, float, instanceIndex, int, length, max, min, select, sin, storage, texture, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { everyFrame, serializePreparation } from '../gpu/work.ts';
import { P } from '../gpu/uniforms.ts';
import type { Node } from 'three/webgpu';
import type { F, V3, V4 } from './tsl/kit.ts';

type I = Node<'int'>;
const imin = min as unknown as (a: I, b: I) => I, imax = max as unknown as (a: I, b: I) => I;

/** Ships with cloth at once: a match's fleet with the lobby's and the ceremonies' ships to spare. */
export const CLOTH_SLOTS = 64;
/** Steps a frame, each of one prediction and one Jacobi pass. */
const SUBSTEPS = 8;
/** How far a lateen and its yard hang on the lee side of the mast, metres (as the yards are drawn). */
export const HUNG = 0.38;
/** A lateen's draft as cut: how deep it can fill, as a share of its size. */
const DRAFT = 0.14;
/** Air pushing on canvas and on bunting, per (m/s)² through it: ½ρC over the cloth's weight a square metre. */
const PRESS_SAIL = 1.1, PRESS_FLAG = 3.2;
/** Air dragging along it, per (m/s)². */
const DRAG_SAIL = 0.02, DRAG_FLAG = 0.22;
/** The constraints: each neighbour's offset in the grid, its compliance (m/N), and whether it counts toward the
 *  average (the bending ones are too soft to). */
const STENCIL: readonly (readonly [number, number, number, boolean])[] = [
  [1, 0, 1e-8, true], [-1, 0, 1e-8, true], [0, 1, 1e-8, true], [0, -1, 1e-8, true],
  [1, 1, 2e-6, true], [-1, -1, 2e-6, true], [1, -1, 2e-6, true], [-1, 1, 2e-6, true],
  [2, 0, 1e-4, false], [-2, 0, 1e-4, false], [0, 2, 1e-4, false], [0, -2, 1e-4, false],
];
/** How much softer canvas is pushed together than pulled apart. */
const BUCKLE = 400;
/** Over-relaxation of the averaged Jacobi corrections (Macklin et al., "Unified Particle Physics", 2014). */
const OMEGA = 1.5;
/** Each slot's parameters, in vec4s. */
const PARAMS = 5;
/** Canvas round a shot hole, which holds next to nothing. */
const RAGGED = 2e-4;

/** One grid of the sail geometry: its kind (0 lateen, 1 yard, 2 pennant, 3 ensign), first vertex and size, and the
 *  radius of the mast it hangs from. */
export interface ClothGrid { kind: number; base: number; nu: number; nv: number; mastR: number }

/**
 * A rope of the running rigging, in the ship's frame: made fast at a corner of a lateen (given where it is drawn before
 * the yard swings, with the mast it swings round and its share of the swing), and at a point on her rail, on the lee
 * side if `lee` (x is then its distance out from the centreline). Eased `slack` times the span; on the mainmast or not.
 */
export interface ClothRope { from: THREE.Vector3; to: THREE.Vector3; lee: boolean; mastZ: number; swing: number; slack: number; radius: number; main: number }
/** Particles a rope. */
export const ROPE_POINTS = 12;
/** Sides of a rope's tube. */
const ROPE_SIDES = 4;

/**
 * The ropes as tubes the vertex stage builds round the particles: aRope is (particle, the one before, the one after,
 * angle round the rope), aRopeR its radius, aMain whether it is on the mainmast.
 */
export function ropeGeometry(ropes: ClothRope[]): THREE.BufferGeometry {
  const pos: number[] = [], rope: number[] = [], main: number[] = [], thick: number[] = [], idx: number[] = [];
  ropes.forEach((r, k) => {
    const first = k * ROPE_POINTS, base = pos.length / 3;
    const to = r.to.clone();
    for (let i = 0; i < ROPE_POINTS; i++) {
      const at = r.from.clone().lerp(to, i / (ROPE_POINTS - 1));
      for (let a = 0; a < ROPE_SIDES; a++) {
        pos.push(at.x, at.y, at.z);
        rope.push(first + i, first + Math.max(0, i - 1), first + Math.min(ROPE_POINTS - 1, i + 1), (a / ROPE_SIDES) * Math.PI * 2);
        main.push(r.main);
        thick.push(r.radius);
      }
    }
    for (let i = 0; i + 1 < ROPE_POINTS; i++) for (let a = 0; a < ROPE_SIDES; a++) {
      const p = base + i * ROPE_SIDES + a, q = base + i * ROPE_SIDES + ((a + 1) % ROPE_SIDES);
      idx.push(p, q, p + ROPE_SIDES, q, q + ROPE_SIDES, p + ROPE_SIDES);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('aRope', new THREE.Float32BufferAttribute(rope, 4));
  g.setAttribute('aMain', new THREE.Float32BufferAttribute(main, 1));
  g.setAttribute('aRopeR', new THREE.Float32BufferAttribute(thick, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // the yards swing the ropes' upper ends across her, either side
  g.boundingSphere!.radius += 8;
  g.userData.ropes = ropes;
  return g;
}

type Buffer = { element(i: unknown): V4 };

export class Cloth {
  /** Particles a ship. */
  readonly count: number;
  /** The particles' positions in each ship's frame, for the sail material's vertex stage. */
  readonly positions: Buffer;
  /** Rope particles a ship, and theirs, for the rigging's. */
  readonly ropeCount: number;
  readonly ropePositions: Buffer;
  readonly #rope: StorageBufferAttribute[];
  readonly #ropeTemplate: StorageBufferAttribute[];
  readonly #x: StorageBufferAttribute;
  readonly #v: StorageBufferAttribute;
  readonly #p: StorageBufferAttribute;
  readonly #template: StorageBufferAttribute[];
  readonly #params = new Float32Array(CLOTH_SLOTS * PARAMS * 4);
  readonly #paramsAttr: StorageBufferAttribute;
  readonly #noise: THREE.Texture;
  readonly #h = uniform(1 / 240);
  readonly #free: number[] = [];
  #prepared = false;
  #preparing: Promise<void> | null = null;
  #predict: ComputeNode | null = null;
  #solve: ComputeNode | null = null;
  #ropePredict: ComputeNode | null = null;
  #ropeSolve: ComputeNode | null = null;
  #dt = 0;
  #any = false;

  constructor(geo: THREE.BufferGeometry, rigging: THREE.BufferGeometry, noise: THREE.Texture) {
    this.#noise = noise;
    const grids = (geo.userData.grids as ClothGrid[]).filter((g) => g.kind !== 1);
    const pos = geo.getAttribute('position'), plane = geo.getAttribute('aPlane'), rig = geo.getAttribute('aRig');
    let n = 0;
    for (const g of grids) n += (g.nu + 1) * (g.nv + 1);
    this.count = n;
    // the template every slot shares: where each particle is lashed or cut, and how it sits in its grid
    const A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 4), D = new Float32Array(n * 4), E = new Float32Array(n * 4);
    const verts = geo.getAttribute('position').count;
    const sim = new Float32Array(verts).fill(-1), nbr = new Float32Array(verts * 4);
    const cut: THREE.Vector3[] = [];
    let t0 = 0;
    for (const g of grids) {
      const row = g.nu + 1;
      const pinned = (i: number, j: number) => (g.kind === 0 ? j === g.nv || i === 0 || (i === g.nu && j === 0) : i === 0);
      for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
        const vi = g.base + j * row + i, t = t0 + j * row + i;
        const u = i / g.nu, v = j / g.nv, size = rig.getY(vi);
        const flat = new THREE.Vector3().fromBufferAttribute(pos, vi);
        // a lateen is cut full: deepest a little forward of its middle, as the drawn belly was
        const draft = g.kind === 0 ? Math.sin(Math.PI * v) * (Math.sin(Math.PI * u ** 0.75) * 0.7 + 0.3) * Math.min(1, u * 4) * size * DRAFT : 0;
        cut[t] = flat.clone().setX(flat.x + draft);
        A.set([flat.x, flat.y, flat.z, pinned(i, j) ? 0 : 1], t * 4);
        B.set([cut[t].x, cut[t].y, cut[t].z, g.kind], t * 4);
        C.set([t0, g.nu, g.nv, g.mastR], t * 4);
        D.set([i, j, plane.getX(vi), plane.getY(vi)], t * 4);
        E.set([-1, 0, rig.getX(vi), rig.getZ(vi)], t * 4);
        sim[vi] = t;
        // the points the vertex's normal is taken across: its neighbours either way along the grid (the lateen's
        // tack, where the grid closes to a point, takes its run up the sail from the next column)
        const at = (a: number, b: number) => t0 + Math.min(g.nv, Math.max(0, b)) * row + Math.min(g.nu, Math.max(0, a));
        const iv = g.kind === 0 && i === 0 ? 1 : i;
        nbr.set([at(i - 1, j), at(i + 1, j), at(iv, j - 1), at(iv, j + 1)], vi * 4);
      }
      // each free particle's nearest lashing, and how far from it the cloth was cut
      for (let k = t0; k < t0 + row * (g.nv + 1); k++) {
        if (A[k * 4 + 3] === 0) continue;
        let best = -1, d = Infinity;
        for (let q = t0; q < t0 + row * (g.nv + 1); q++) {
          if (A[q * 4 + 3] !== 0) continue;
          const dq = cut[k].distanceTo(cut[q]);
          if (dq < d) { d = dq; best = q; }
        }
        E[k * 4] = best;
        E[k * 4 + 1] = d;
      }
      t0 += row * (g.nv + 1);
    }
    // each vertex's particle goes in the fourth place of its rig (a ship's draw has only eight vertex buffers)
    const rig4 = new Float32Array(verts * 4);
    for (let k = 0; k < verts; k++) rig4.set([rig.getX(k), rig.getY(k), rig.getZ(k), sim[k]], k * 4);
    geo.setAttribute('aRig', new THREE.Float32BufferAttribute(rig4, 4));
    geo.setAttribute('aClothN', new THREE.Float32BufferAttribute(nbr, 4));
    // the cloth moves out of the flat sail's bounds: the flags stream either way, the lateens fill
    geo.boundingSphere!.radius += 7;

    this.#template = [A, B, C, D, E].map((a) => new StorageBufferAttribute(a, 4));
    const total = CLOTH_SLOTS * n;
    this.#x = new StorageBufferAttribute(new Float32Array(total * 4), 4);
    this.#v = new StorageBufferAttribute(new Float32Array(total * 4), 4);
    this.#p = new StorageBufferAttribute(new Float32Array(total * 4), 4);
    this.#paramsAttr = new StorageBufferAttribute(this.#params, 4);
    this.positions = storage(this.#x, 'vec4', total).toReadOnly() as unknown as Buffer;

    // the ropes: each one's ends, and how far it is eased
    const ropes = rigging.userData.ropes as ClothRope[];
    const RA = new Float32Array(ropes.length * 4), RB = new Float32Array(ropes.length * 4), RC = new Float32Array(ropes.length * 4);
    ropes.forEach((r, k) => {
      RA.set([r.from.x, r.from.y, r.from.z, r.mastZ], k * 4);
      RB.set([r.to.x, r.to.y, r.to.z, r.lee ? 1 : 0], k * 4);
      RC.set([r.swing, r.slack, 0, 0], k * 4);
    });
    this.#ropeTemplate = [RA, RB, RC].map((a) => new StorageBufferAttribute(a, 4));
    this.ropeCount = ropes.length * ROPE_POINTS;
    const ropeTotal = CLOTH_SLOTS * this.ropeCount;
    this.#rope = [0, 1, 2].map(() => new StorageBufferAttribute(new Float32Array(ropeTotal * 4), 4));
    this.ropePositions = storage(this.#rope[0], 'vec4', ropeTotal).toReadOnly() as unknown as Buffer;
    for (let s = CLOTH_SLOTS - 1; s >= 0; s--) this.#free.push(s);
    everyFrame((renderer) => this.#run(renderer));
  }

  /** Builds pipelines without dispatching, advancing time, consuming staged writes or resetting live slots. */
  prepare(renderer: WebGPURenderer): Promise<void> {
    if (this.#prepared) return Promise.resolve();
    if (this.#preparing) return this.#preparing;
    this.#preparing = (async () => {
      if (!this.#predict) this.#build();
      for (const pass of [this.#predict!, this.#ropePredict!, this.#solve!, this.#ropeSolve!]) {
        await serializePreparation(renderer, () => renderer.compileComputeAsync(pass));
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      this.#prepared = true;
    })().finally(() => { this.#preparing = null; });
    return this.#preparing;
  }

  /** A slot for a new ship's cloth, laid out flat on its first frame. Slots are recycled when there are none free. */
  acquire(): number {
    const s = this.#free.pop() ?? 0;
    this.reset(s);
    return s;
  }

  /** Lays a ship's cloth out again, where it is lashed, at the next frame it is asked for (she has been moved). */
  reset(slot: number): void {
    this.#params[slot * PARAMS * 4 + 3] = 1;
  }

  release(slot: number): void {
    const o = slot * PARAMS * 4;
    this.#params.fill(0, o, o + PARAMS * 4);
    if (!this.#free.includes(slot)) this.#free.push(slot);
  }

  /**
   * A ship's cloth this frame, in her own frame: the yards' swing and the side they hang on; the wind the sails are
   * given and how much it gusts and swirls (the air's velocity past them, m/s); the apparent wind the flags fly in; the
   * acceleration the cloth feels besides the wind (gravity and her own motion, m/s²); and the canvas torn by shot
   * aloft and her damage, as the shader cuts holes from them.
   */
  set(slot: number, boom: number, side: number, sail: THREE.Vector3, gust: number, flag: THREE.Vector3, accel: THREE.Vector3, torn: number, damage: number, dt: number): void {
    const o = slot * PARAMS * 4, f = this.#params;
    f[o] = boom; f[o + 1] = side; f[o + 2] = 1;
    f[o + 4] = sail.x; f[o + 5] = sail.y; f[o + 6] = sail.z; f[o + 7] = gust;
    f[o + 8] = accel.x; f[o + 9] = accel.y; f[o + 10] = accel.z; f[o + 11] = torn;
    f[o + 12] = damage; f[o + 13] = slot * 1.37;
    f[o + 16] = flag.x; f[o + 17] = flag.y; f[o + 18] = flag.z; f[o + 19] = 0.25;
    this.#dt = Math.max(this.#dt, dt);
    this.#any = true;
  }

  #run(renderer: WebGPURenderer): void {
    // An explicit warmup may yield while building a pass; the frame must not compile/dispatch that same pass.
    // Pending CPU inputs stay queued and are consumed by the usual run once preparation finishes.
    if (this.#preparing) return;
    if (!this.#any || this.#dt <= 0) return;
    if (!this.#predict) this.#build();
    this.#h.value = Math.min(this.#dt, 1 / 20) / SUBSTEPS;
    const a = this.#paramsAttr;
    a.needsUpdate = true;
    const steps: ComputeNode[] = [];
    for (let k = 0; k < SUBSTEPS; k++) steps.push(this.#predict!, this.#ropePredict!, this.#solve!, this.#ropeSolve!);
    renderer.compute(steps);
    // a slot that is not asked for next frame rests; one laid out has been
    const f = this.#params;
    for (let o = 0; o < f.length; o += PARAMS * 4) {
      if (f[o + 2] > 0) f[o + 3] = 0;
      f[o + 2] = 0;
    }
    this.#dt = 0;
    this.#any = false;
  }

  #build(): void {
    const n = this.count, total = CLOTH_SLOTS * n;
    const rw = (b: StorageBufferAttribute) => storage(b, 'vec4', total) as unknown as Buffer;
    const ro = (b: StorageBufferAttribute, k: number) => storage(b, 'vec4', k).toReadOnly() as unknown as Buffer;
    const X = rw(this.#x), V = rw(this.#v), Pp = rw(this.#p);
    const [tA, tB, tC, tD, tE] = this.#template.map((b) => ro(b, n));
    const params = ro(this.#paramsAttr, CLOTH_SLOTS * PARAMS);
    const h = this.#h;
    const noise = this.#noise;

    /** Where a lashed particle is held: on a lateen, hung on the lee side and swung round the mast with the yard. */
    const lashed = (flat: V3, kind: F, boom: F, side: F, mastZ: F, swing: F): V3 => {
      const lateen = kind.lessThan(0.5);
      const x = flat.x.add(select(lateen, side.mul(HUNG), float(0)));
      const a = select(lateen, boom.mul(swing), float(0));
      const c = cos(a), s = sin(a), z = flat.z.sub(mastZ);
      return vec3(x.mul(c).add(z.mul(s)), flat.y, x.negate().mul(s).add(z.mul(c)).add(mastZ));
    };

    /** Which slot and which particle of the template a thread is. */
    const where = () => {
      const id = int(instanceIndex);
      const slot = id.div(n);
      const t = id.sub(slot.mul(n));
      return { id, slot, t, base: slot.mul(n) };
    };

    this.#predict = Fn(() => {
      const { id, slot, t, base } = where();
      const p0 = params.element(slot.mul(PARAMS));
      If(p0.z.lessThan(0.5), () => { Return(); });
      const a = tA.element(t), b = tB.element(t), e = tE.element(t);
      const kind = b.w;
      const held = lashed(a.xyz, kind, p0.x, p0.y, e.z, e.w);
      If(p0.w.greaterThan(0.5), () => {
        X.element(id).assign(vec4(held, 1));
        V.element(id).assign(vec4(0));
        Pp.element(id).assign(vec4(held, 1));
        Return();
      });
      If(a.w.lessThan(0.5), () => {
        Pp.element(id).assign(vec4(held, 1));
        Return();
      });
      const c = tC.element(t), d = tD.element(t);
      const g0 = int(c.x), nu = int(c.y), nv = int(c.z), row = nu.add(1);
      const i = int(d.x), j = int(d.y);
      const at = (ii: I, jj: I): V3 => X.element(base.add(g0).add(ii).add(jj.mul(row))).xyz;
      const x = X.element(id).xyz.toVar(), v = V.element(id).xyz.toVar();
      // the cloth's normal here, across its neighbours
      const tu = at(imin(i.add(1), nu), j).sub(at(imax(i.sub(1), int(0)), j));
      const tv = at(i, imin(j.add(1), nv)).sub(at(i, imax(j.sub(1), int(0))));
      const nn = cross(tu, tv);
      const normal = nn.div(max(length(nn), 1e-6));
      // the wind, gusting and swirling along the cloth so a flag flutters and a slack sail shivers
      const p1 = params.element(slot.mul(PARAMS).add(1)), p2 = params.element(slot.mul(PARAMS).add(2)), p3 = params.element(slot.mul(PARAMS).add(3));
      const p4 = params.element(slot.mul(PARAMS).add(4));
      const time = P.time as unknown as F, ph = p3.y;
      const lateen = kind.lessThan(0.5);
      const wind = select(lateen, p1.xyz, p4.xyz), gust = select(lateen, p1.w, p4.w), strength = length(wind);
      const swirl = vec3(
        sin(x.z.mul(1.7).sub(time.mul(9)).add(ph)).mul(0.6).add(sin(x.y.mul(2.3).add(time.mul(6.3)).add(ph.mul(2))).mul(0.4)),
        sin(x.z.mul(1.1).add(x.x.mul(2)).sub(time.mul(7.7)).add(ph.mul(3))).mul(0.7),
        sin(x.y.mul(1.3).sub(time.mul(5.1)).add(ph)).mul(0.5),
      ).mul(gust).mul(strength);
      const air = wind.add(swirl).sub(v);
      // shot through: as the shader cuts it (a hole lets the wind through and holds nothing)
      const u01 = float(i).div(float(nu)), v01 = float(j).div(float(nv));
      const hn = texture(noise, d.zw.mul(vec2(0.7, 1.1)).add(kind.mul(0.37))).level(float(0)).r;
      const rags = p2.w.mul(float(0.7).add(float(1).sub(v01).mul(0.25)).add(u01.mul(0.15))).sub(0.04);
      const hole = max(p3.x.mul(0.62).sub(0.05), select(lateen, rags, float(-1)));
      const whole = select(hn.greaterThanEqual(hole), float(1), float(0));
      const through = dot(air, normal);
      const push = normal.mul(through.mul(abs(through)).mul(select(lateen, float(PRESS_SAIL), float(PRESS_FLAG))))
        .add(air.mul(length(air)).mul(select(lateen, float(DRAG_SAIL), float(DRAG_FLAG))));
      const acc = push.mul(whole.mul(0.96).add(0.04)).add(p2.xyz);
      const v1 = v.add(acc.mul(h)).mul(float(1).sub(h.mul(1.2)));
      const fast = length(v1);
      const v2 = select(fast.greaterThan(40), v1.mul(float(40).div(fast)), v1);
      Pp.element(id).assign(vec4(x.add(v2.mul(h)), whole));
    })().compute(CLOTH_SLOTS * n, [64]);

    this.#solve = Fn(() => {
      const { id, slot, t, base } = where();
      const p0 = params.element(slot.mul(PARAMS));
      If(p0.z.lessThan(0.5), () => { Return(); });
      If(p0.w.greaterThan(0.5), () => { Return(); });
      const a = tA.element(t), b = tB.element(t), e = tE.element(t);
      const self = Pp.element(id);
      const p = self.xyz.toVar();
      const before = X.element(id).xyz;
      If(a.w.lessThan(0.5), () => {
        V.element(id).assign(vec4(p.sub(before).div(h), 0));
        X.element(id).assign(vec4(p, 1));
        Return();
      });
      const c = tC.element(t), d = tD.element(t);
      const g0 = int(c.x), nu = int(c.y), nv = int(c.z), row = nu.add(1);
      const i = int(d.x), j = int(d.y);
      const sum = vec3(0).toVar(), count = float(0).toVar();
      const h2 = h.mul(h);
      for (const [di, dj, alpha, counts] of STENCIL) {
        const ii = i.add(di), jj = j.add(dj);
        If(ii.greaterThanEqual(0).and(ii.lessThanEqual(nu)).and(jj.greaterThanEqual(0)).and(jj.lessThanEqual(nv)), () => {
          const tq = g0.add(ii).add(jj.mul(row));
          const q = Pp.element(base.add(tq));
          const rest = length(tB.element(tq).xyz.sub(b.xyz));
          const dv = p.sub(q.xyz);
          const len = max(length(dv), 1e-6);
          const C = len.sub(rest);
          // pushed together, canvas buckles; across a hole it holds nothing
          const soft = select(C.lessThan(0), float(alpha * (counts ? BUCKLE : 1)), float(alpha));
          const compliance = select(self.w.mul(q.w).lessThan(0.5), float(RAGGED), soft).div(h2);
          const dl = C.negate().div(float(1).add(tA.element(tq).w).add(compliance));
          sum.addAssign(dv.div(len).mul(dl));
          if (counts) count.addAssign(1);
        });
      }
      const x = p.add(sum.mul(float(OMEGA).div(max(count, 1)))).toVar();
      // never further from the nearest lashing than the cloth was cut
      const pin = int(e.x);
      If(pin.greaterThanEqual(0), () => {
        const anchor = Pp.element(base.add(pin)).xyz;
        const off = x.sub(anchor), far = length(off), most = e.y.mul(1.02);
        If(far.greaterThan(most), () => { x.assign(anchor.add(off.mul(most.div(far)))); });
      });
      // the mast stands in the lateen
      If(b.w.lessThan(0.5), () => {
        const r = vec2(x.x, x.z.sub(e.z)), rl = length(r), keep = c.w.add(0.06);
        If(rl.lessThan(keep), () => {
          const out = select(rl.greaterThan(1e-4), r.div(rl), vec2(select(p0.y.greaterThanEqual(0), float(1), float(-1)), 0)).mul(keep);
          x.assign(vec3(out.x, x.y, out.y.add(e.z)));
        });
      });
      V.element(id).assign(vec4(x.sub(before).div(h), 0));
      X.element(id).assign(vec4(x, self.w));
    })().compute(CLOTH_SLOTS * n, [64]);

    // the ropes: a chain between two ends, one on the cloth's lashings, the other on her rail
    const m = this.ropeCount, ropeTotal = CLOTH_SLOTS * m;
    const [RX, RV, RP] = this.#rope.map((b) => storage(b, 'vec4', ropeTotal) as unknown as Buffer);
    const lines = this.#ropeTemplate[0].count;
    const [rA, rB, rC] = this.#ropeTemplate.map((b) => ro(b, lines));
    const along = () => {
      const id = int(instanceIndex);
      const slot = id.div(m);
      const t = id.sub(slot.mul(m));
      const r = t.div(ROPE_POINTS);
      const i = t.sub(r.mul(ROPE_POINTS));
      const p0 = params.element(slot.mul(PARAMS));
      const a = rA.element(r), b = rB.element(r), c = rC.element(r);
      const head = lashed(a.xyz, float(0), p0.x, p0.y, a.w, c.x);
      const foot = vec3(select(b.w.greaterThan(0.5), b.x.mul(select(p0.y.greaterThanEqual(0), float(1), float(-1))), b.x), b.y, b.z);
      const ends = i.equal(0).or(i.equal(ROPE_POINTS - 1));
      const end = select(i.equal(0), head, foot);
      return { id, slot, i, p0, c, head, foot, ends, end };
    };

    this.#ropePredict = Fn(() => {
      const { id, slot, i, p0, head, foot, ends, end } = along();
      If(p0.z.lessThan(0.5), () => { Return(); });
      If(p0.w.greaterThan(0.5), () => {
        const at = head.add(foot.sub(head).mul(float(i).div(ROPE_POINTS - 1)));
        RX.element(id).assign(vec4(at, 1));
        RV.element(id).assign(vec4(0));
        RP.element(id).assign(vec4(at, 1));
        Return();
      });
      If(ends, () => {
        RP.element(id).assign(vec4(end, 1));
        Return();
      });
      const p2 = params.element(slot.mul(PARAMS).add(2)), p4 = params.element(slot.mul(PARAMS).add(4));
      const v = RV.element(id).xyz, x = RX.element(id).xyz;
      // a rope's weight, and the wind dragging it as it goes past
      const air = p4.xyz.sub(v);
      const v1 = v.add(p2.xyz.add(air.mul(length(air)).mul(0.035)).mul(h)).mul(float(1).sub(h.mul(0.8)));
      RP.element(id).assign(vec4(x.add(v1.mul(h)), 1));
    })().compute(ropeTotal, [64]);

    this.#ropeSolve = Fn(() => {
      const { id, i, p0, c, head, foot, ends } = along();
      If(p0.z.lessThan(0.5).or(p0.w.greaterThan(0.5)), () => { Return(); });
      const p = RP.element(id).xyz;
      const before = RX.element(id).xyz;
      If(ends, () => {
        RV.element(id).assign(vec4(p.sub(before).div(h), 0));
        RX.element(id).assign(vec4(p, 1));
        Return();
      });
      // eased off the span between its ends: it holds against stretching and gives to a push
      const rest = length(foot.sub(head)).mul(c.y).div(ROPE_POINTS - 1);
      const sum = vec3(0).toVar();
      for (const dj of [-1, 1]) {
        const j = i.add(dj);
        const q = RP.element(id.add(dj)).xyz;
        const w = select(j.equal(0).or(j.equal(ROPE_POINTS - 1)), float(0), float(1));
        const dv = p.sub(q), len = max(length(dv), 1e-6), C = len.sub(rest);
        If(C.greaterThan(0), () => { sum.addAssign(dv.div(len).mul(C.negate().div(float(1).add(w)))); });
      }
      const x = p.add(sum.mul(OMEGA * 0.5));
      RV.element(id).assign(vec4(x.sub(before).div(h), 0));
      RX.element(id).assign(vec4(x, 1));
    })().compute(ropeTotal, [64]);
  }
}
