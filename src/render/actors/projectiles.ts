// Shots in flight, one look per weapon class, ported from the rewrite: the cannon's glowing ball and smoke trail, the
// scatter's spray of hot pellets, the harpoon's iron bolt trailing its line back to the ship, the mortar's tumbling
// shell with a fuse of fire, the repeater's tracers tinted by rarity, and the broadside's heavy round shot.
import * as THREE from 'three';
import { patch, rand } from './common.ts';
import { RARITY_GLOW, type Effects } from './effects.ts';
import { SPRITE } from './particles.ts';
import type { ProjectileView } from './view.ts';

function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of gs) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

const CAP = 96;

export class Projectiles {
  readonly group = new THREE.Group();
  private readonly fx: Effects;
  private readonly bolts: THREE.InstancedMesh;
  private readonly shells: THREE.InstancedMesh;
  private readonly balls: THREE.InstancedMesh;
  private readonly lines: THREE.LineSegments;
  private readonly linePos: Float32Array;
  private readonly trails = new Map<number, THREE.Vector3>();
  private readonly tmp = new THREE.Object3D();
  private readonly a = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(fx: Effects) {
    this.fx = fx;
    const metal = patch(new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.8, roughness: 0.35 }));
    const bolt = new THREE.CylinderGeometry(0.09, 0.09, 4.2, 6).rotateX(Math.PI / 2);
    const tip = new THREE.ConeGeometry(0.28, 0.9, 6).rotateX(Math.PI / 2).translate(0, 0, 2.5);
    const barb = new THREE.ConeGeometry(0.2, 0.5, 4).rotateX(-Math.PI / 2).translate(0, 0, 1.9);
    this.bolts = new THREE.InstancedMesh(mergeGeos([bolt, tip, barb]), metal, CAP);
    const hot = patch(new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.5, emissive: 0xff5a10, emissiveIntensity: 2.5 }));
    this.shells = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 1), hot, CAP);
    const iron = patch(new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.45, metalness: 0.6, emissive: 0xff7a30, emissiveIntensity: 0.6 }));
    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 1), iron, CAP * 2);
    for (const m of [this.bolts, this.shells, this.balls]) { m.count = 0; m.frustumCulled = false; this.group.add(m); }
    // the harpoon's line, paid out behind the bolt
    this.linePos = new Float32Array(CAP * 2 * 3 * 8);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lg.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(lg, patch(new THREE.LineBasicMaterial({ color: 0x8a7556, transparent: true, opacity: 0.85 })));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
  }

  /** One frame of shots; `muzzle(ship)` gives where a ship's gun is, for the harpoon's line. */
  update(list: readonly ProjectileView[], t: number, muzzle: (ship: number) => THREE.Vector3 | null): void {
    let nb = 0, ns = 0, nr = 0, nl = 0;
    const seen = new Set<number>(), fx = this.fx, glow = fx.glow, smoke = fx.smoke;
    for (const p of list) {
      seen.add(p.id);
      const prev = this.trails.get(p.id) ?? this.a.set(p.pos.x - p.vel.x * 0.016, p.pos.y - p.vel.y * 0.016, p.pos.z - p.vel.z * 0.016).clone();
      const { x, y, z } = p.pos, { x: vx, y: vy, z: vz } = p.vel;
      const rc = RARITY_GLOW[p.rarity];
      const trail = (step: number, f: (x: number, y: number, z: number) => void) => {
        const d = Math.hypot(x - prev.x, y - prev.y, z - prev.z), n = Math.min(40, Math.floor(d / step));
        for (let i = 1; i <= n; i++) { const k = i / n; f(prev.x + (x - prev.x) * k, prev.y + (y - prev.y) * k, prev.z + (z - prev.z) * k); }
      };
      this.up.set(x, y, z).normalize();
      const ux = this.up.x * 0.4, uy = this.up.y * 0.4, uz = this.up.z * 0.4;
      switch (p.weapon) {
        case 'cannon':
          glow.emit({ x, y, z, vx, vy, vz, life: 0, size: 0.32, r: 6, g: 3.4, b: 1.2, frame: SPRITE.spark, mode: 1, stretch: 0.035 });
          trail(2.2, (x, y, z) => smoke.emit({ x, y, z, vx: ux, vy: uy, vz: uz, life: rand(0.5, 0.8), size: 0.25, grow: 4, r: 0.9, g: 0.88, b: 0.86, a: 0.3, frame: SPRITE.smoke, drag: 1.5 }));
          break;
        case 'broadside':
          if (nr < CAP * 2) this.place(this.balls, nr++, p.pos, t * 9 + p.id);
          glow.emit({ x, y, z, vx, vy, vz, life: 0, size: 0.4, r: 5, g: 2.6, b: 0.9, frame: SPRITE.spark, mode: 1, stretch: 0.025 });
          trail(1.6, (x, y, z) => smoke.emit({ x, y, z, vx: ux, vy: uy, vz: uz, life: rand(0.6, 1.0), size: 0.35, grow: 4, r: 0.8, g: 0.78, b: 0.76, a: 0.32, frame: SPRITE.smoke, drag: 1.5 }));
          break;
        case 'repeater':
          glow.emit({ x, y, z, vx, vy, vz, life: 0, size: 0.12, r: 6 * (0.6 + rc.r * 0.4), g: 4.6 * (0.6 + rc.g * 0.4), b: 1.6 + rc.b, frame: SPRITE.spark, mode: 1, stretch: 0.05 });
          break;
        case 'scatter':
          glow.emit({ x, y, z, vx, vy, vz, life: 0, size: 0.12, r: 6, g: 3, b: 1, frame: SPRITE.spark, mode: 1, stretch: 0.03 });
          if (Math.random() < 0.3) glow.emit({ x, y, z, life: 0.15, size: 0.08, r: 5, g: 2.4, b: 0.8, frame: SPRITE.spark, fadeIn: 0 });
          break;
        case 'harpoon': {
          if (nb < CAP) {
            this.tmp.position.set(x, y, z);
            this.tmp.up.copy(this.up);
            this.tmp.lookAt(x + vx, y + vy, z + vz);
            this.tmp.scale.setScalar(1);
            this.tmp.updateMatrix();
            this.bolts.setMatrixAt(nb++, this.tmp.matrix);
          }
          glow.emit({ x, y, z, vx, vy, vz, life: 0, size: 0.1, r: 2.4, g: 2.8, b: 3.4, a: 0.7, frame: SPRITE.spark, mode: 1, stretch: 0.06 });
          trail(3, (x, y, z) => smoke.emit({ x, y, z, life: 0.5, size: 0.15, grow: 3, r: 1.2, g: 1.25, b: 1.3, a: 0.35, frame: SPRITE.puff }));
          // the line: a sagging run from the gun to the bolt's tail
          const from = p.ship !== undefined ? muzzle(p.ship) : null;
          if (from && nl < CAP) {
            const L = this.linePos, segs = 8, d = from.distanceTo(p.pos);
            let px = from.x, py = from.y, pz = from.z;
            for (let i = 1; i <= segs; i++) {
              const k = i / segs, sag = Math.sin(k * Math.PI) * d * 0.06;
              const nx = from.x + (x - from.x) * k - this.up.x * sag, ny = from.y + (y - from.y) * k - this.up.y * sag, nz = from.z + (z - from.z) * k - this.up.z * sag;
              const o = (nl * segs + i - 1) * 6;
              L[o] = px; L[o + 1] = py; L[o + 2] = pz; L[o + 3] = nx; L[o + 4] = ny; L[o + 5] = nz;
              px = nx; py = ny; pz = nz;
            }
            nl++;
          }
          break;
        }
        case 'mortar': {
          if (ns < CAP) this.place(this.shells, ns++, p.pos, t * 7 + p.id);
          trail(0.9, (x, y, z) => {
            glow.emit({ x, y, z, life: rand(0.15, 0.3), size: 0.9, grow: 0.3, r: 5, g: 2.2, b: 0.5, frame: SPRITE.flame, fadeIn: 0 });
            smoke.emit({ x, y, z, vx: ux, vy: uy, vz: uz, life: rand(1.2, 2), size: 0.6, grow: 4, r: 0.35, g: 0.33, b: 0.32, a: 0.45, frame: SPRITE.smoke, drag: 1, spin: rand(-0.5, 0.5) });
          });
          break;
        }
      }
      const keep = this.trails.get(p.id);
      if (keep) keep.set(x, y, z); else this.trails.set(p.id, new THREE.Vector3(x, y, z));
    }
    for (const id of this.trails.keys()) if (!seen.has(id)) this.trails.delete(id);
    this.bolts.count = nb;
    this.shells.count = ns;
    this.balls.count = nr;
    for (const m of [this.bolts, this.shells, this.balls]) m.instanceMatrix.needsUpdate = true;
    const lg = this.lines.geometry;
    lg.setDrawRange(0, nl * 8 * 2);
    (lg.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private place(m: THREE.InstancedMesh, i: number, p: { x: number; y: number; z: number }, spin: number): void {
    this.tmp.position.set(p.x, p.y, p.z);
    this.tmp.rotation.set(spin, spin * 0.7, 0);
    this.tmp.scale.setScalar(1);
    this.tmp.updateMatrix();
    m.setMatrixAt(i, this.tmp.matrix);
  }
}
