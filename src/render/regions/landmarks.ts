// The landmarks the terrain can't make, as simple shapes at real size: arches and a hollow log to sail through,
// columns, shards and coral towers standing out of the water, a tree on a hill and a waterfall's curtain. Where the
// region's heights already carry the landmark (the Crown, the Needle, Cinder Peak, the Eye...), nothing is added.
// Each shape stands in the landmark's own frame: +Y the outward normal, +Z its facing, y = 0 at sea level. These are
// for the eye only: the simulation sails through them.
import * as THREE from 'three';
import { R, along, tangentAt } from '../../sim/sphere.ts';
import { v3 } from '../../sim/math.ts';
import { LANDMARKS, REGIONS, heightAt, type Landmark, type RegionId } from '../../sim/world/index.ts';
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
  // the fallen Hollow Cedar: a log to sail through, its broken stump standing tall with a fungus light on top
  mistwood: (lm) => {
    const out = new THREE.Group(), bark = rock(0x5a3b28);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 80, 16, 1, true), patch(new THREE.MeshStandardMaterial({ color: 0x5a3b28, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }), 'landmark-rock'));
    log.rotation.x = Math.PI / 2;
    log.position.y = 4;
    const stump = column(18, -44, lm.height - 6, 9, bark, -6);
    out.add(log, stump, glow(0x9dffb0, 3.2, 6).translateX(18).translateY(lm.height - 3).translateZ(-44));
    return out;
  },
  // the Moonbow Arch: a basalt arch over the passage
  basaltStacks: (lm) => arch(46, lm.height, 9, rock(0x2c2e33)),
  // the Kelp Cathedral: a ring of kelp-draped columns rising out of the shallows
  kelpShallows: (lm) => {
    const kelp = rock(0x4a5a2c);
    const out = around(10, 34, 0, (x, z, i) => column(x, z, lm.height * (0.6 + 0.4 * jitter(i, 1)), 4.5, kelp));
    out.add(glow(0xb8ff9a, 2.4, 4).translateY(lm.height + 2));
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
  // the Great Reef: coral towers round the rim of the biggest ring, with gaps to sail in by
  coralAtolls: (lm) => {
    const coral = rock(0xe39a7a);
    const out = around(18, 88, 4, (x, z, i) => column(x, z, 6 + (i % 5 === 2 ? lm.height - 6 : 18 * jitter(i, 6)), 5, coral));
    out.add(glow(0xffd0a0, 2.4, 4).translateY(lm.height + 2).translateX(Math.sin((2 / 18) * Math.PI * 2) * 88).translateZ(Math.cos((2 / 18) * Math.PI * 2) * 88));
    return out;
  },
  // the Root Gate: an arch of roots over the channel
  mangroveLabyrinth: (lm) => {
    const out = new THREE.Group(), roots = rock(0x3d3324);
    out.add(arch(26, lm.height, 4, roots));
    const twin = arch(30, lm.height - 8, 3, roots);
    twin.position.z = 5;
    twin.rotation.y = 0.15;
    out.add(twin, glow(0xc8ff70, 2, 4).translateY(lm.height - 1));
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
