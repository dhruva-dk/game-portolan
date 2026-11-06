// Sprites by the tens of thousands, simulated on the GPU in compute and set on the sphere: gravity pulls toward the
// planet's centre, smoke is carried off by the wind and stirred by curl noise (Bridson, Hourihan and Nordenstam,
// "Curl-Noise for Procedural Fluid Flow", SIGGRAPH 2007), spray that lands rides the sea's own waves, sparks that
// reach the water go out on it, and the flat kind (rings, halos) lies in the water's tangent plane. Two pools: glow
// (added, for fire, sparks and light) and smoke (blended, lit from six sides by the sun, the moon and the sky:
// smokeBake.ts).
//
// The effects emit from the CPU as before; what a frame emits is written into a staging buffer and one compute pass
// copies it into the pool, where a second steps every particle alive. Nothing is read back. A pool is a ring with
// its slots' lifetimes kept on the CPU, so a new particle takes a free slot near the ring's head and only overwrites
// a live one when the ring is full; a glow lit for one frame (a lantern's halo) takes a slot from a slab of its own
// at the ring's end, so the halos lit every frame never eat into the long-lived smoke.
import * as THREE from 'three';
import { StorageBufferAttribute, type ComputeNode, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, If, Return, cos, float, instanceIndex, length, max, min, sin, storage, uniform, vec3, vec4,
} from 'three/tsl';
import { TAU } from './common.ts';
import { particleNodeMaterial, type ParticleBuffers } from './tsl/particles.ts';
import { bakeSmoke } from './smokeBake.ts';
import { everyFrame } from '../gpu/work.ts';
import { P } from '../gpu/uniforms.ts';
import { seaHeightNode } from '../ocean/surface.ts';
import type { F, V3, V4 } from './tsl/kit.ts';

/** Eight soft white shapes on a 4×2 sheet: puff, smoke, spark, ring, spray, star, shard, flame; and two drawn from the
 *  baked smoke instead: `billow`, a puff of smoke lit from six sides, and `blast`, the same burning from inside. */
export const SPRITE = { puff: 0, smoke: 1, spark: 2, ring: 3, spray: 4, star: 5, shard: 6, flame: 7, billow: 8, blast: 9 } as const;

/** What a particle does besides fly: ride the sea where it lands, drift with the wind, be stirred, go out on the
 *  water. */
export const FLAG = { float: 1, wind: 2, curl: 4, quench: 8 } as const;

function makeAtlas(): THREE.CanvasTexture {
  const C = 128, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C * 2;
  const g = cv.getContext('2d')!;
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2);
    g.beginPath(); g.rect(-C / 2, -C / 2, C, C); g.clip();
    draw();
    g.restore();
  };
  const blob = (x: number, y: number, r: number, a: number) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  cell(0, () => blob(0, 0, 60, 1));
  cell(1, () => { for (let k = 0; k < 22; k++) { const a = r() * TAU, d = r() * 26; blob(Math.cos(a) * d, Math.sin(a) * d, 18 + r() * 22, 0.32); } });
  cell(2, () => { blob(0, 0, 60, 0.5); blob(0, 0, 22, 1); });
  cell(3, () => {
    for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(255,255,255,${0.12 + k * 0.05})`; g.lineWidth = 14 - k * 2.2; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke(); }
  });
  cell(4, () => { for (let k = 0; k < 40; k++) { const a = r() * TAU, d = Math.sqrt(r()) * 50; blob(Math.cos(a) * d, Math.sin(a) * d, 3 + r() * 7, 0.9); } });
  cell(5, () => {
    blob(0, 0, 30, 1);
    for (const ang of [0, Math.PI / 2]) {
      g.save(); g.rotate(ang);
      const gr = g.createLinearGradient(-60, 0, 60, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 60, 4, 0, 0, TAU); g.fill();
      g.restore();
    }
  });
  cell(6, () => {
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-8, -54); g.lineTo(9, -40); g.lineTo(6, 50); g.lineTo(-3, 56); g.lineTo(-10, 20); g.closePath(); g.fill();
  });
  // a tongue of flame: soft blobs narrowing up to a tip, so no edge of it is ever cut hard
  cell(7, () => {
    for (let k = 0; k < 12; k++) blob(Math.sin(k * 1.7) * k * 0.6, 30 - k * 7.5, 30 - k * 2.2, 0.22 + 0.02 * (12 - k));
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export interface Emit {
  x: number; y: number; z: number; vx?: number; vy?: number; vz?: number;
  life: number; size: number; grow?: number; // size at birth, and the factor it reaches at death (life 0: one frame)
  r: number; g: number; b: number; a?: number;
  frame: number; mode?: 0 | 1 | 2; stretch?: number; rot?: number; spin?: number;
  drag?: number; grav?: number; fadeIn?: number; float?: boolean;
  /** How hot a billow or blast burns at its core: its glow, at the lamps' scale. */
  heat?: number;
  /** Rides the wind and is stirred by it (smoke), or not; by default billows and blasts are, and nothing else. */
  wind?: boolean;
  /** Goes out where it reaches the sea; by default sparks do. */
  quench?: boolean;
}

/** Floats a staged particle takes: six vec4s. */
const REC = 24;
/** Particles a pool can take in one frame. */
const SPAWN = 4096;

export class Particles {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.Material;
  /** Slots in the ring, and in the slab of one-frame glows after it. */
  readonly cap: number;
  readonly once: number;
  readonly #staged = new Float32Array(SPAWN * REC);
  readonly #stagedAttr: StorageBufferAttribute;
  /** When each ring slot's particle dies, in this pool's clock. */
  readonly #death: Float32Array;
  readonly #buffers: StorageBufferAttribute[];
  readonly #dt = uniform(0);
  #step: ComputeNode | null = null;
  #write: ComputeNode | null = null;
  #wipe: ComputeNode | null = null;
  #n = 0;
  #onceN = 0;
  #head = 0;
  #clock = 0;
  #frameDt = 0;
  #pending = false;
  #wiped = false;

  readonly glow: boolean;

  constructor(cap: number, once: number, glow: boolean, atlas: THREE.Texture) {
    this.glow = glow;
    this.cap = cap;
    this.once = once;
    this.#death = new Float32Array(cap);
    const total = cap + once;
    // position and age; velocity and life; colour; size, growth, sprite, mode; stretch, turn, spin, drag;
    // gravity, flags, fade-in, heat
    this.#buffers = Array.from({ length: 6 }, (_, k) => {
      const a = new Float32Array(total * 4);
      // every slot starts dead: a life below zero
      if (k === 1) for (let i = 0; i < total; i++) a[i * 4 + 3] = -1;
      return new StorageBufferAttribute(a, 4);
    });
    this.#stagedAttr = new StorageBufferAttribute(this.#staged, 4);
    const read = this.#buffers.map((b) => storage(b, 'vec4', total).toReadOnly() as unknown as { element(i: unknown): V4 });
    const buffers: ParticleBuffers = { pos: read[0], vel: read[1], col: read[2], shape: read[3], turn: read[4], more: read[5] };
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.instanceCount = total;
    this.mat = particleNodeMaterial(atlas, glow, buffers);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = glow ? 8 : 7;
    everyFrame((renderer) => this.#run(renderer));
  }

  /** Particles alive in the ring, by the lifetimes they were given. */
  get count(): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.#death[i] > this.#clock) n++;
    return n;
  }

  /** Drops every live particle. */
  clear(): void {
    this.#death.fill(0);
    this.#n = 0;
    this.#onceN = 0;
    this.#wiped = true;
  }

  emit(e: Emit): void {
    if (this.#n >= SPAWN) return;
    let slot: number;
    if (e.life <= 0) {
      if (this.#onceN >= this.once) return;
      slot = this.cap + this.#onceN++;
    } else {
      slot = this.#take(e.life);
    }
    const o = this.#n++ * REC, f = this.#staged;
    const smoky = e.frame === SPRITE.billow || e.frame === SPRITE.blast;
    const flags = (e.float ? FLAG.float : 0) | ((e.wind ?? smoky) ? FLAG.wind | FLAG.curl : 0)
      | ((e.quench ?? e.frame === SPRITE.spark) ? FLAG.quench : 0);
    f[o] = e.x; f[o + 1] = e.y; f[o + 2] = e.z; f[o + 3] = slot;
    f[o + 4] = e.vx ?? 0; f[o + 5] = e.vy ?? 0; f[o + 6] = e.vz ?? 0; f[o + 7] = e.life;
    f[o + 8] = e.r; f[o + 9] = e.g; f[o + 10] = e.b; f[o + 11] = e.a ?? 1;
    f[o + 12] = e.size; f[o + 13] = e.grow ?? 1; f[o + 14] = e.frame; f[o + 15] = e.mode ?? 0;
    f[o + 16] = e.stretch ?? 0; f[o + 17] = e.rot ?? Math.random() * TAU; f[o + 18] = e.spin ?? 0; f[o + 19] = e.drag ?? 0;
    f[o + 20] = e.grav ?? 0; f[o + 21] = flags; f[o + 22] = e.fadeIn ?? 0.08; f[o + 23] = e.heat ?? 0;
  }

  /** A free ring slot near the head (the oldest when none is), held for `life` seconds. */
  #take(life: number): number {
    let slot = this.#head;
    for (let k = 0; k < 64; k++) {
      const s = (this.#head + k) % this.cap;
      if (this.#death[s] <= this.#clock) { slot = s; break; }
    }
    this.#head = (slot + 1) % this.cap;
    this.#death[slot] = this.#clock + life;
    return slot;
  }

  /** Steps the pool by dt on the GPU at the next frame drawn. */
  update(dt: number): void {
    this.#clock += dt;
    this.#frameDt += dt;
    this.#pending = true;
  }

  #run(renderer: WebGPURenderer): void {
    if (!this.mesh.parent) return;
    if (!this.glow) bakeSmoke(renderer);
    if (!this.#step) this.#build();
    if (this.#wiped) {
      renderer.compute(this.#wipe!);
      this.#wiped = false;
    }
    if (!this.#pending) return;
    this.#dt.value = Math.min(this.#frameDt, 0.1);
    this.#frameDt = 0;
    this.#pending = false;
    renderer.compute(this.#step!);
    if (this.#n > 0) {
      const a = this.#stagedAttr;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.#n * REC);
      a.needsUpdate = true;
      this.#write!.count = this.#n;
      renderer.compute(this.#write!, this.#n);
    }
    this.#n = 0;
    this.#onceN = 0;
  }

  #build(): void {
    const total = this.cap + this.once;
    const rw = this.#buffers.map((b) => storage(b, 'vec4', total) as unknown as { element(i: unknown): V4 });
    const [pos, vel, col, shape, turn, more] = rw;
    const staged = storage(this.#stagedAttr, 'vec4', SPAWN * 6).toReadOnly() as unknown as { element(i: unknown): V4 };

    this.#write = Fn(() => {
      const base = instanceIndex.mul(6);
      const a = staged.element(base);
      const slot = a.w.toUint();
      pos.element(slot).assign(vec4(a.xyz, 0));
      vel.element(slot).assign(staged.element(base.add(1)));
      col.element(slot).assign(staged.element(base.add(2)));
      shape.element(slot).assign(staged.element(base.add(3)));
      turn.element(slot).assign(staged.element(base.add(4)));
      more.element(slot).assign(staged.element(base.add(5)));
    })().compute(SPAWN, [64]);

    this.#wipe = Fn(() => {
      vel.element(instanceIndex).w.assign(-1);
    })().compute(total, [64]);

    const dt = this.#dt;
    this.#step = Fn(() => {
      const i = instanceIndex;
      const v = vel.element(i).toVar();
      // a glow lit for one frame has been drawn: it goes; the dead stay dead
      If(v.w.lessThanEqual(0), () => {
        If(v.w.equal(0), () => { vel.element(i).w.assign(-1); });
        Return();
      });
      const p = pos.element(i).toVar();
      const age = p.w.add(dt);
      If(age.greaterThanEqual(v.w), () => {
        vel.element(i).w.assign(-1);
        Return();
      });
      const m = more.element(i);
      const t = turn.element(i);
      const flags = m.y.toInt();
      const up = p.xyz.normalize();
      const u = v.xyz.toVar();
      // drag toward still air, or toward the wind for what rides it, and gravity toward the planet's centre
      const air = vec3(0).toVar();
      If(flags.bitAnd(FLAG.wind).notEqual(0), () => {
        const w = P.wind as unknown as V3;
        air.assign(w.sub(up.mul(w.dot(up))).mul(0.85));
      });
      const keep = max(float(1).sub(t.w.mul(dt)), 0);
      u.assign(air.add(u.sub(air).mul(keep)));
      u.subAssign(up.mul(m.x.mul(dt)));
      If(flags.bitAnd(FLAG.curl).notEqual(0), () => {
        u.addAssign(curl(p.xyz, P.time as unknown as F).mul(dt).mul(1.6));
      });
      const at = p.xyz.add(u.mul(dt)).toVar();
      // landing on the sea: what floats rides it, a spark goes out
      If(flags.bitAnd(FLAG.float | FLAG.quench).notEqual(0), () => {
        const up2 = at.normalize();
        const sea = (seaHeightNode(up2) ?? (P.planet as unknown as V4).y).add(0.05);
        If(length(at).lessThan(sea), () => {
          If(flags.bitAnd(FLAG.quench).notEqual(0), () => {
            vel.element(i).w.assign(-1);
            Return();
          });
          at.assign(up2.mul(sea));
          const vr = u.dot(up2);
          If(vr.lessThan(0), () => { u.subAssign(up2.mul(vr)); });
        });
      });
      pos.element(i).assign(vec4(at, age));
      vel.element(i).assign(vec4(u, v.w));
      turn.element(i).y.assign(t.y.add(t.z.mul(dt)));
    })().compute(total, [64]);
  }
}

/** Curl noise: the curl of a smooth vector potential, so it stirs without gathering or spreading anything; two
 *  scales, the larger drifting with time. Metres per second squared, about ±1. */
const curl = Fn(([p, t]: [V3, F]) => {
  const out = vec3(0).toVar();
  for (const [k, s, w] of [[0.13, 0.21, 1], [0.37, 0.5, 0.5]] as const) {
    const q = p.mul(k).add(vec3(t.mul(s), t.mul(s * 0.7), t.mul(s * -0.6)));
    // ψ = (sin(qy)·cos(qz), sin(qz)·cos(qx), sin(qx)·cos(qy)); ∇×ψ by hand
    const sx = sin(q.x), cx = cos(q.x), sy = sin(q.y), cy = cos(q.y), sz = sin(q.z), cz = cos(q.z);
    const dpz_dy = sx.mul(sy).negate(); // ∂ψz/∂y = −sin(qx)·sin(qy)
    const dpy_dz = cz.mul(cx); // ∂ψy/∂z = cos(qz)·cos(qx)
    const dpx_dz = sy.mul(sz).negate(); // ∂ψx/∂z = −sin(qy)·sin(qz)
    const dpz_dx = cx.mul(cy); // ∂ψz/∂x = cos(qx)·cos(qy)
    const dpy_dx = sz.mul(sx).negate(); // ∂ψy/∂x = −sin(qz)·sin(qx)
    const dpx_dy = cy.mul(cz); // ∂ψx/∂y = cos(qy)·cos(qz)
    out.addAssign(vec3(dpz_dy.sub(dpy_dz), dpx_dz.sub(dpz_dx), dpy_dx.sub(dpx_dy)).mul(w));
  }
  return min(max(out, vec3(-2)), vec3(2));
}).setLayout({ name: 'particleCurl', type: 'vec3', inputs: [{ name: 'p', type: 'vec3' }, { name: 't', type: 'float' }] });

export function makeParticles(): { glow: Particles; smoke: Particles } {
  const atlas = makeAtlas();
  return { glow: new Particles(12000, 1500, true, atlas), smoke: new Particles(14000, 256, false, atlas) };
}
