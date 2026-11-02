// The landmarks the terrain can't make, as simple shapes at real size: an arch and a hollow log to sail through, a
// mangrove standing astride a channel on its roots, columns of kelp, shards and coral towers standing out of the
// water, a tree on a hill and a waterfall's curtain. Where the region's heights already carry the landmark (the Crown,
// the Needle, Cinder Peak, the Eye...), nothing is added. Each shape stands in the landmark's own frame: +Y the
// outward normal, +Z its facing, y = 0 at sea level. Most are for the eye only and the simulation sails through them;
// the kelp columns stand on the region's trunks, which it runs into.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, along, tangentAt } from '../../sim/sphere.ts';
import { v3 } from '../../sim/math.ts';
import { LANDMARKS, OBSTACLES, REGIONS, heightAt, type Landmark, type RegionId } from '../../sim/world/index.ts';
import { patch } from '../engine.ts';

const rock = (color: number, rough = 0.9) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true }), 'landmark-rock');

/** A glow that reads from far off at night: an unlit sphere bright enough to bloom. */
function glow(color: number, radius: number, power: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), fog: false, toneMapped: false });
  const g = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), m);
  g.userData.glow = { color: new THREE.Color(color), power };
  return g;
}

/** A half ring standing across +Z: you pass under it sailing along its facing. */
function arch(span: number, height: number, thick: number, mat: THREE.Material): THREE.Mesh {
  const r = span / 2 + thick;
  const g = new THREE.TorusGeometry(r, thick, 10, 28, Math.PI);
  g.scale(1, (height - thick) / r, 1.4);
  g.translate(0, -6, 0);
  return new THREE.Mesh(g, mat);
}

/** A column from below the waterline up to `top`, thinning as it climbs. */
function column(x: number, z: number, top: number, r: number, mat: THREE.Material, bottom = -10): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r * 0.7, r, top - bottom, 9, 3);
  g.translate(x, (top + bottom) / 2, z);
  return new THREE.Mesh(g, mat);
}

/** Things set round a circle of radius `ring`, with every `gap`th left out for a way in. */
function around(n: number, ring: number, gap: number, make: (x: number, z: number, i: number) => THREE.Object3D): THREE.Group {
  const out = new THREE.Group();
  for (let i = 0; i < n; i++) {
    if (gap && i % gap === 0) continue;
    const a = (i / n) * Math.PI * 2;
    out.add(make(Math.sin(a) * ring, Math.cos(a) * ring, i));
  }
  return out;
}

// a fixed pseudo-random sequence per shape, so the shapes are the same every run
const jitter = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Where the unit vector p lies in a landmark's frame: x to its right, z along its facing, metres over the surface. */
function local(lm: Landmark, p: THREE.Vector3Like): { x: number; z: number } {
  const up = new THREE.Vector3(lm.pos.x, lm.pos.y, lm.pos.z), fwd = new THREE.Vector3(lm.facing.x, lm.facing.y, lm.facing.z);
  fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd), q = new THREE.Vector3(p.x, p.y, p.z).sub(up).multiplyScalar(R);
  return { x: q.dot(right), z: q.dot(fwd) };
}

/** A smooth tube through `pts`, `r` thick. */
const tube = (pts: THREE.Vector3[], r: number, segs = 24): THREE.BufferGeometry =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 6, false);

/**
 * A column of giant kelp rising out of the water at (x, z) to `top`, about r across: a bundle of stipes twisting
 * round each other, each ending at its own height and drooping over, with blades hanging off them. Adds to `stipes`
 * and `blades`.
 */
function kelpColumn(x: number, z: number, top: number, r: number, i: number, stipes: THREE.BufferGeometry[], blades: THREE.BufferGeometry[]): void {
  const n = 5 + Math.floor(3 * jitter(i, 30)), twist = (0.05 + 0.04 * jitter(i, 31)) * (i % 2 ? 1 : -1);
  const lx = (jitter(i, 32) - 0.5) * 0.12, lz = (jitter(i, 33) - 0.5) * 0.12;
  for (let s = 0; s < n; s++) {
    const j = (k: number) => jitter(i * 17 + s, k);
    const a0 = (s / n) * Math.PI * 2 + j(34), ring = r * (0.3 + 0.4 * j(35)), h = s === 0 ? top : top * (0.7 + 0.28 * j(36));
    const at = (y: number) => new THREE.Vector3(
      x + lx * y + ring * Math.cos(a0 + twist * y), y, z + lz * y + ring * Math.sin(a0 + twist * y));
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) pts.push(at(-8 + ((h + 8) * k) / 10));
    // the top bends out and over under its own weight
    const out = a0 + j(37) * 1.5, ox = Math.cos(out), oz = Math.sin(out), t = pts[10];
    for (const [d, dy] of [[3, 1.2], [6, 0], [8, -4]]) pts.push(new THREE.Vector3(t.x + ox * d, t.y + dy, t.z + oz * d));
    stipes.push(tube(pts, 0.3 + 0.25 * j(38), 30));
    // blades every few metres up the stipe, hanging out and down round it
    for (let y = 1 + 3 * j(39), b = 0; y < h - 2; y += 4 + 2 * jitter(b, s + i), b++) {
      const len = 3 + 3 * jitter(b, 40 + s), g = new THREE.PlaneGeometry(0.7 + 0.5 * jitter(b, 41 + s), len, 1, 2);
      g.translate(0, -len / 2, 0);
      g.rotateX(-0.5 - 0.6 * jitter(b, 42 + s));
      g.rotateY(Math.PI * 2 * jitter(b, 43 + s));
      const p = at(y);
      g.translate(p.x, p.y, p.z);
      blades.push(g);
    }
  }
}

/** The tangent at the landmark toward its highest ground at distance d. */
function highest(lm: Landmark, d: number): THREE.Vector3Like {
  const dir = v3(), p = v3();
  let best = -Infinity, at = 0;
  for (let k = 0; k < 72; k++) {
    const b = (k / 72) * Math.PI * 2, h = heightAt(along(lm.pos, tangentAt(lm.pos, b, dir), d, p));
    if (h > best) { best = h; at = b; }
  }
  return tangentAt(lm.pos, at, v3());
}

type Build = (lm: Landmark) => THREE.Object3D;

const SHAPES: Partial<Record<RegionId, Build>> = {
  // the falls: a pale curtain hung from the cliff top at the head of the fjord, its foot in spray; it faces the cliff
  fjords: (lm) => {
    const out = new THREE.Group();
    out.userData.facing = highest(lm, 40);
    const water = new THREE.MeshStandardMaterial({ color: 0xe8f2f6, roughness: 0.3, transparent: true, opacity: 0.85, emissive: 0x30404a, side: THREE.DoubleSide });
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(26, lm.height, 1, 8), patch(water, 'landmark-falls'));
    curtain.position.set(0, lm.height / 2 - 4, 0);
    const spray = new THREE.Mesh(new THREE.SphereGeometry(16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), patch(water.clone(), 'landmark-falls'));
    spray.scale.set(1, 0.5, 0.6);
    // 26 m on toward the cliff, so the sailable gap is behind the curtain
    curtain.position.z = spray.position.z = 26;
    out.add(curtain, spray);
    return out;
  },
  // the fallen Hollow Cedar: a log to sail through, its broken stump standing tall, splintered at the top, with
  // fungus shelves glowing down its side
  mistwood: (lm) => {
    const out = new THREE.Group(), bark = rock(0x5a3b28);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 80, 16, 1, true), patch(new THREE.MeshStandardMaterial({ color: 0x5a3b28, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }), 'landmark-rock'));
    log.rotation.x = Math.PI / 2;
    log.position.y = 4;
    const top = lm.height - 14;
    out.add(log, column(18, -44, top, 9, bark, -6));
    // splinters left standing where the trunk snapped
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + jitter(i, 7), h = 5 + 9 * jitter(i, 8);
      const g = new THREE.ConeGeometry(1.6 + jitter(i, 9), h, 4);
      g.translate(18 + Math.cos(a) * 4.5, top + h / 2 - 0.5, -44 + Math.sin(a) * 4.5);
      out.add(new THREE.Mesh(g, bark));
    }
    for (let i = 0; i < 4; i++) {
      const f = 0.3 + 0.15 * i, a = 1.3 * i, r = 9 - 2.7 * f + 0.6;
      const shelf = glow(0x9dffb0, 2.2, 4);
      shelf.scale.set(1.2, 0.3, 1.2);
      shelf.position.set(18 + Math.cos(a) * r, -6 + f * (top + 6), -44 + Math.sin(a) * r);
      out.add(shelf);
    }
    return out;
  },
  // the Moonbow Arch: a basalt arch over the passage
  basaltStacks: (lm) => arch(46, lm.height, 9, rock(0x2c2e33)),
  // the Kelp Cathedral: columns of giant kelp rising out of the shallows, one at each of the region's trunks, so what
  // a ship runs into is what she sees
  kelpShallows: (lm) => {
    const stipes: THREE.BufferGeometry[] = [], blades: THREE.BufferGeometry[] = [];
    OBSTACLES.forEach((o, i) => {
      if (o.region !== lm.region || o.kind !== 'trunk') return;
      const { x, z } = local(lm, o.pos);
      kelpColumn(x, z, o.height, o.r, i, stipes, blades);
    });
    const out = new THREE.Group(), wet = { roughness: 0.55, metalness: 0 };
    out.add(new THREE.Mesh(mergeGeometries(stipes), patch(new THREE.MeshStandardMaterial({ color: 0x6a5c22, ...wet }), 'landmark-kelp')));
    out.add(new THREE.Mesh(mergeGeometries(blades), patch(new THREE.MeshStandardMaterial({ color: 0x938531, side: THREE.DoubleSide, ...wet }), 'landmark-kelp')));
    return out;
  },
  // the Great Cherry: a broad tree on the hilltop
  blossomRun: (lm) => {
    const out = new THREE.Group(), ground = Math.max(0, heightAt(lm.pos));
    const trunk = column(0, 0, lm.height - 14, 4, rock(0x4a3026), ground - 2);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(17, 1), rock(0xf2a7c3, 0.8));
    crown.scale.set(1.3, 0.8, 1.3);
    crown.position.y = lm.height - 12;
    out.add(trunk, crown);
    return out;
  },
  // Glasswater: shards of natural glass round the rim of the pool
  glassSea: (lm) => {
    const glass = patch(new THREE.MeshStandardMaterial({ color: 0x9fe6e0, roughness: 0.1, metalness: 0.2, flatShading: true }), 'landmark-glass');
    return around(14, 42, 7, (x, z, i) => {
      const h = 14 + (lm.height - 14) * jitter(i, 2) * (i % 3 === 1 ? 1 : 0.5);
      const g = new THREE.ConeGeometry(3 + 3 * jitter(i, 3), h + 4, 5);
      g.translate(x, h / 2 - 2, z);
      const m = new THREE.Mesh(g, glass);
      m.rotation.set((jitter(i, 4) - 0.5) * 0.2, 0, (jitter(i, 5) - 0.5) * 0.2);
      return m;
    });
  },
  // the Great Reef: coral towers round the rim of the biggest ring, with gaps to sail in by; the tallest grow as
  // clumps of leaning branches, like antler coral, not as single columns
  coralAtolls: (lm) => {
    const coral = rock(0xe39a7a);
    return around(18, 88, 4, (x, z, i) => {
      if (i % 5 !== 2) return column(x, z, 6 + 18 * jitter(i, 6), 5, coral);
      const clump = new THREE.Group();
      for (let b = 0; b < 5; b++) {
        const h = (lm.height - 4) * (b === 0 ? 1 : 0.45 + 0.4 * jitter(i, 10 + b)), a = b * 1.4 + jitter(i, 20 + b);
        const branch = column(0, 0, h, b === 0 ? 4.5 : 3, coral);
        branch.position.set(x + Math.cos(a) * 3 * Math.min(1, b), 0, z + Math.sin(a) * 3 * Math.min(1, b));
        branch.rotation.set(Math.sin(a) * 0.08 * b, 0, -Math.cos(a) * 0.08 * b);
        clump.add(branch);
      }
      return clump;
    });
  },
  // the Root Gate: a great mangrove standing astride the channel on its roots, which spring from the mounds either
  // side, tangle up into its trunk and cross over the top, with thin roots hanging from its crown into the water
  // outside the channel. The passage under it stays clear to 40 m.
  mangroveLabyrinth: (lm) => {
    const roots: THREE.BufferGeometry[] = [], P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    for (let i = 0; i < 22; i++) {
      const j = (k: number) => jitter(i, 50 + k), s = i % 2 ? 1 : -1, z = (j(0) - 0.5) * 22, wide = j(1);
      const pts = [
        P(s * (14 + 20 * wide), -3, z),
        P(s * (15 + 12 * wide + 3 * j(2)), 16 + 10 * j(3), z * 0.75),
        P(s * (10 + 5 * j(4)), 40 + 6 * j(5), z * 0.4),
        P(s * (1 + 3 * j(6)), 50 + 4 * j(7), (j(8) - 0.5) * 6),
      ];
      // one in three crosses over the top and runs down the far shoulder
      if (i % 3 === 0) pts.push(P(-s * (8 + 4 * j(9)), 46 + 4 * j(10), (j(11) - 0.5) * 8), P(-s * (12 + 4 * j(12)), 38 + 4 * j(13), z * 0.3));
      roots.push(tube(pts, 0.6 + 1.1 * j(14) * (1 - 0.5 * wide), 40));
    }
    // the trunk the roots gather into, short and thick under the crown
    roots.push(tube([P(0, 46, 0), P(0.8, 52, 0.5), P(0, 60, 0)], 3.8, 8));
    for (let i = 0; i < 12; i++) {
      const j = (k: number) => jitter(i, 70 + k), s = i % 2 ? 1 : -1, x = s * (14 + 18 * j(0)), z = (j(1) - 0.5) * 30;
      roots.push(tube([P(x, 54, z), P(x + (j(2) - 0.5) * 3, 26, z), P(x + (j(3) - 0.5) * 2, -2, z + (j(4) - 0.5) * 2)], 0.2 + 0.2 * j(5), 12));
    }
    const out = new THREE.Group();
    out.add(new THREE.Mesh(mergeGeometries(roots), patch(new THREE.MeshStandardMaterial({ color: 0x4a3d2c, roughness: 0.95 }), 'landmark-roots')));
    const leaves = rock(0x34502a, 0.85);
    for (let i = 0; i < 8; i++) {
      const j = (k: number) => jitter(i, 90 + k), r = 10 + 5 * j(0);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves);
      crown.scale.set(1.25, 0.5, 1.25);
      crown.position.set((j(1) - 0.5) * 44, lm.height - 0.5 * r - 2 * j(2) - (i % 3) * 3, (j(3) - 0.5) * 30);
      out.add(crown);
    }
    return out;
  },
};

export class Landmarks {
  readonly group = new THREE.Group();
  /** The glows, dimmed by day. */
  private readonly glows: THREE.Mesh[] = [];

  constructor() {
    this.group.name = 'landmarks';
    for (const lm of LANDMARKS) {
      const build = SHAPES[REGIONS[lm.region].id];
      if (!build) continue;
      const shape = build(lm);
      shape.name = lm.name;
      stand(shape, lm.pos, shape.userData.facing ?? lm.facing, R);
      shape.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData.glow) this.glows.push(o as THREE.Mesh);
        else if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      this.group.add(shape);
    }
  }

  /** night: 0 day to 1 night where the camera is. */
  update(night: number): void {
    for (const g of this.glows) {
      const { color, power } = g.userData.glow as { color: THREE.Color; power: number };
      (g.material as THREE.MeshBasicMaterial).color.copy(color).multiplyScalar(0.25 + night * power);
    }
  }
}

/** Stands an object on the sphere at unit vector pos: +Y along the outward normal, +Z toward the tangent `facing`. */
export function stand(obj: THREE.Object3D, pos: THREE.Vector3Like, facing: THREE.Vector3Like, radius: number, lift = 0): void {
  const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
  const fwd = new THREE.Vector3(facing.x, facing.y, facing.z);
  fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
  obj.position.copy(up).multiplyScalar(radius + lift);
}
