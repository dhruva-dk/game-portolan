// Ribbon trails: what a shot draws through the air behind it, as one unbroken strip instead of a string of puffs.
//
// Each trail is a ring of points in storage buffers, laid down behind whatever draws it every few metres; the newest
// point rides on the shot itself, rewritten each frame, so the ribbon always reaches it. Points are written as the
// particles' are (staged on the CPU, uploaded as one range, scattered into their slots by a write kernel), and from
// then on live on the GPU: a step kernel ages each one, lets go of the shot's momentum, drifts it down the wind and
// stirs it with the same curl noise as the smoke, so a trail laid across a breeze bends and frays as it ages, and
// warm smoke rises. A point is dropped when it has lived its life, and the ring gives up its oldest point for the
// newest when it wraps.
//
// The strip is drawn one segment an instance (tsl/ribbons.ts), between neighbouring points of the same trail whose
// sequence numbers follow on, so a wrapped ring or a slot handed to a new trail never joins its old points to its
// new. Each end of a segment is turned to face the eye about its tangent, worked out from the points either side of
// it, so neighbouring segments meet edge to edge.
import * as THREE from 'three';
import { StorageBufferAttribute, type ComputeNode, type WebGPURenderer } from 'three/webgpu';
import { Fn, If, Return, float, instanceIndex, max, storage, uniform, vec4 } from 'three/tsl';
import { P } from '../gpu/uniforms.ts';
import { everyFrame } from '../gpu/work.ts';
import { curl } from './particles.ts';
import { ribbonNodeMaterial, type RibbonBuffers } from './tsl/ribbons.ts';
import type { F, V3, V4 } from './tsl/kit.ts';

export interface RibbonLook {
  /** Metres across at the shot, and the factor it has spread to at the end of its life. */
  width: number;
  grow: number;
  /** Seconds a point of it lasts. */
  life: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** A glowing ribbon (heated shot, a shell's fuse): how hot it starts, cooling over its life. */
  heat?: number;
  /** Metres a second it starts rising at, as warm smoke does, slowing as it mixes into the air. */
  rise?: number;
  /** Metres between points laid down. */
  step?: number;
  /** Seconds over which it thickens out of nothing behind the shot (smoke takes a moment to form). */
  form?: number;
}

/** Floats a staged point takes: five vec4s. */
const REC = 20;

interface Trail {
  slot: number;
  /** The ring index the next point is written to, and its sequence number. */
  head: number;
  seq: number;
  /** Where the last point was laid down, and the distance along the trail to it. */
  last: THREE.Vector3;
  dist: number;
  seed: number;
  life: number;
  /** The frame it was last drawn on. */
  seen: number;
}

export class Ribbons {
  readonly mesh: THREE.Mesh;
  readonly trails: number;
  readonly points: number;
  readonly glow: boolean;
  readonly #live = new Map<number, Trail>();
  /** When each slot's last point dies, in this pool's clock; a slot is free once that has passed. */
  readonly #busy: Float32Array;
  readonly #staged: Float32Array;
  readonly #stagedAttr: StorageBufferAttribute;
  readonly #buffers: StorageBufferAttribute[];
  readonly #dt = uniform(0);
  #step: ComputeNode | null = null;
  #write: ComputeNode | null = null;
  #wipe: ComputeNode | null = null;
  #n = 0;
  #clock = 0;
  #frame = 0;
  #frameDt = 0;
  #pending = false;
  #wiped = false;

  constructor(trails: number, points: number, glow: boolean, noise: THREE.Texture) {
    this.trails = trails;
    this.points = points;
    this.glow = glow;
    this.#busy = new Float32Array(trails);
    const total = trails * points;
    // position and age; velocity and life; colour; width, spread, sequence and heat; distance along, seed, form
    this.#buffers = Array.from({ length: 5 }, (_, k) => {
      const a = new Float32Array(total * 4);
      if (k === 1) for (let i = 0; i < total; i++) a[i * 4 + 3] = -1;
      return new StorageBufferAttribute(a, 4);
    });
    // a point for every trail each frame, and as many again laid down
    this.#staged = new Float32Array(trails * 2 * REC);
    this.#stagedAttr = new StorageBufferAttribute(this.#staged, 4);
    const read = this.#buffers.map((b) => storage(b, 'vec4', total).toReadOnly() as unknown as { element(i: unknown): V4 });
    const buffers: RibbonBuffers = { pos: read[0], vel: read[1], col: read[2], shape: read[3], more: read[4] };
    const geo = new THREE.InstancedBufferGeometry();
    // a segment: x picks its end, y its side
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.instanceCount = total;
    this.mesh = new THREE.Mesh(geo, ribbonNodeMaterial(noise, glow, buffers, points));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = glow ? 8 : 7;
    everyFrame((renderer) => this.#run(renderer));
  }

  /** Trails being drawn. */
  get count(): number {
    return this.#live.size;
  }

  /** Draws trail `key` on to `p` this frame, starting it if it is new. */
  push(key: number, p: THREE.Vector3, look: RibbonLook): void {
    let t = this.#live.get(key);
    if (!t) {
      const slot = this.#freeSlot();
      if (slot < 0) return;
      t = { slot, head: 0, seq: 0, last: p.clone(), dist: 0, seed: Math.random(), life: look.life, seen: this.#frame };
      this.#live.set(key, t);
      this.#busy[slot] = Infinity;
    }
    else if (t.seen === this.#frame) return; // once a frame: two writes to one slot in a dispatch would race
    t.seen = this.#frame;
    const moved = p.distanceTo(t.last), lay = t.seq === 0 || moved >= (look.step ?? 2.5);
    this.#stage(t, p, t.dist + moved, look);
    if (lay) {
      t.dist += moved;
      t.last.copy(p);
      t.head = (t.head + 1) % this.points;
      t.seq++;
    }
  }

  /** Steps the trails by dt on the GPU at the next frame drawn, and lets go of those not drawn this frame. */
  update(dt: number): void {
    this.#clock += dt;
    this.#frameDt += dt;
    this.#pending = true;
    for (const [key, t] of this.#live) {
      if (t.seen === this.#frame) continue;
      // its shot has landed: the trail is left to drift and fade, and its slot is free once the last of it has gone
      this.#busy[t.slot] = this.#clock + t.life;
      this.#live.delete(key);
    }
    this.#frame++;
  }

  /** Drops every trail. */
  clear(): void {
    this.#live.clear();
    this.#busy.fill(0);
    this.#n = 0;
    this.#wiped = true;
  }

  #freeSlot(): number {
    for (let s = 0; s < this.trails; s++) if (this.#busy[s] <= this.#clock) return s;
    return -1;
  }

  #stage(t: Trail, p: THREE.Vector3, dist: number, look: RibbonLook): void {
    if ((this.#n + 1) * REC > this.#staged.length) return;
    const o = this.#n++ * REC, f = this.#staged, slot = t.slot * this.points + t.head;
    const r = Math.hypot(p.x, p.y, p.z) || 1, rise = look.rise ?? 0.4;
    f[o] = p.x; f[o + 1] = p.y; f[o + 2] = p.z; f[o + 3] = slot;
    f[o + 4] = (p.x / r) * rise; f[o + 5] = (p.y / r) * rise; f[o + 6] = (p.z / r) * rise; f[o + 7] = look.life;
    f[o + 8] = look.r; f[o + 9] = look.g; f[o + 10] = look.b; f[o + 11] = look.a;
    f[o + 12] = look.width; f[o + 13] = look.grow; f[o + 14] = t.seq; f[o + 15] = look.heat ?? 0;
    f[o + 16] = dist; f[o + 17] = t.seed; f[o + 18] = look.form ?? 0.05; f[o + 19] = 0;
  }

  #run(renderer: WebGPURenderer): void {
    if (!this.mesh.parent) return;
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
  }

  #build(): void {
    const total = this.trails * this.points;
    const [pos, vel, col, shape, more] = this.#buffers.map((b) => storage(b, 'vec4', total) as unknown as { element(i: unknown): V4 });
    const staged = storage(this.#stagedAttr, 'vec4', this.#staged.length / 4).toReadOnly() as unknown as { element(i: unknown): V4 };

    this.#write = Fn(() => {
      const base = instanceIndex.mul(5);
      const a = staged.element(base);
      const slot = a.w.toUint();
      pos.element(slot).assign(vec4(a.xyz, 0));
      vel.element(slot).assign(staged.element(base.add(1)));
      col.element(slot).assign(staged.element(base.add(2)));
      shape.element(slot).assign(staged.element(base.add(3)));
      more.element(slot).assign(staged.element(base.add(4)));
    })().compute(this.#staged.length / REC, [64]);

    this.#wipe = Fn(() => {
      vel.element(instanceIndex).w.assign(-1);
    })().compute(total, [64]);

    const dt = this.#dt;
    this.#step = Fn(() => {
      const i = instanceIndex;
      const v = vel.element(i).toVar();
      If(v.w.lessThan(0), () => { Return(); });
      const p = pos.element(i).toVar();
      const age = p.w.add(dt);
      If(age.greaterThanEqual(v.w), () => {
        vel.element(i).w.assign(-1);
        Return();
      });
      const up = p.xyz.normalize();
      // the air it was left in carries it down the wind, and what it rose with mixes away
      const w = P.wind as unknown as V3;
      const air = w.sub(up.mul(w.dot(up))).mul(0.85);
      const u = air.add(v.xyz.sub(air).mul(max(float(1).sub(dt.mul(0.9)), 0))).toVar();
      u.addAssign(curl(p.xyz, P.time as unknown as F).mul(dt).mul(1.3));
      pos.element(i).assign(vec4(p.xyz.add(u.mul(dt)), age));
      vel.element(i).assign(vec4(u, v.w));
    })().compute(total, [64]);
  }
}
