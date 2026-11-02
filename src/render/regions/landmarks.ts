// The landmarks the terrain can't make, as simple shapes at real size: an arch and a hollow log to sail through, a
// mangrove standing astride a channel on its roots, columns of kelp, shards and coral towers standing out of the
// water, a tree on a hill and a waterfall's curtain. Where the region's heights already carry the landmark (the Crown,
// the Needle, Cinder Peak, the Eye...), nothing is added. Each shape stands in the landmark's own frame: +Y the
// outward normal, +Z its facing, y = 0 at sea level. The columns of kelp, glass and coral and the cedar's stump stand
// on the region's trunks, which the simulation runs into, and the Root Gate's roots over trunks of their own.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, along, tangentAt } from '../../sim/sphere.ts';
import { v3 } from '../../sim/math.ts';
import { LANDMARKS, OBSTACLES, REGIONS, heightAt, type Landmark, type Obstacle, type RegionId } from '../../sim/world/index.ts';
import { patch } from '../engine.ts';
import type { EventPhase } from './eventRocks.ts';
import { Kit, particles, strip, surface, tick, SHAPE_PUFF } from '../beacons/kit.ts';

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

/** A shape at each of the landmark's region's columns, so what a ship runs into is what she sees. */
function columnsOf(lm: Landmark, make: (x: number, z: number, o: Obstacle, i: number) => THREE.Object3D): THREE.Group {
  const out = new THREE.Group();
  OBSTACLES.forEach((o, i) => {
    if (o.region !== lm.region || o.kind !== 'trunk') return;
    const { x, z } = local(lm, o.pos);
    out.add(make(x, z, o, i));
  });
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

/** The Hollow Cedar's fallen log along +Z, 80 m long: out of round, its bark fluted, its ends broken off ragged. */
function cedarLog(): THREE.BufferGeometry {
  const segs = 20, rows = 6, g = new THREE.CylinderGeometry(1, 1, 80, segs, rows, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const row = Math.floor(i / (segs + 1)), col = i % (segs + 1), a = (col / segs) * Math.PI * 2;
    const r = (11 + row / rows) * (1 + 0.06 * Math.cos(7 * a + 0.5) ** 2 + 0.04 * Math.cos(3 * a + 1));
    // each end broken off a few metres short in places
    const short = row === 0 ? -6 * jitter(col % segs, 60) : row === rows ? 6 * jitter(col % segs, 61) : 0;
    p.setXYZ(i, r * Math.sin(a), p.getY(i) + short, r * Math.cos(a));
  }
  g.rotateX(Math.PI / 2);
  g.translate(0, 4, 0);
  g.computeVertexNormals();
  return g;
}

/**
 * The Hollow Cedar's broken stump at (x, z), from `bottom` to about `top` and r across: hollow, out of round and
 * fluted, flaring into its roots at the foot, leaning a little, and torn off in a ragged slant that stands highest on
 * the side it tore from (bearing `torn` round the trunk, 0 along +Z), with splinters left standing there. `bark(t, a,
 * out)` is the point `out` m off its bark at the share t of its height and bearing a, for hanging things on it.
 */
function cedarStump(x: number, z: number, bottom: number, top: number, r: number, torn: number) {
  const segs = 22, rows = 14, tall = top - bottom;
  const radius = (t: number, a: number) => {
    const foot = Math.max(0, 1 - (t * tall) / 14);
    return r * (1 - 0.3 * t) * (1 + 0.07 * Math.cos(9 * a + 0.8) + 0.05 * Math.cos(4 * a + 2.1) + 0.08 * Math.cos(2 * a))
      * (1 + 0.5 * foot * foot * (1 + 0.5 * Math.cos(5 * a + 1)));
  };
  const bark = (t: number, a: number, out = 0) => {
    // the break comes down 12 m on the far side from the tear
    const rr = radius(t, a) + out, y = bottom + t * tall - 12 * (0.5 - 0.5 * Math.cos(a - torn)) * t;
    return new THREE.Vector3(x + 0.03 * (y - bottom) + rr * Math.sin(a), y, z + rr * Math.cos(a));
  };
  const g = new THREE.CylinderGeometry(1, 1, 1, segs, rows, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const row = Math.floor(i / (segs + 1)), col = i % (segs + 1), v = bark(1 - row / rows, (col / segs) * Math.PI * 2);
    // the rim splintered, each stave standing up a little or a lot
    if (row === 0) v.y += 7 * jitter(col % segs, 50) ** 2;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [g];
  // a few long splinters left standing on the torn side, thin and leaning out
  for (let i = 0; i < 3; i++) {
    const a = torn + (jitter(i, 51) - 0.5) * 1.6, h = 8 + 10 * jitter(i, 52), s = new THREE.ConeGeometry(1.2 + jitter(i, 53), h, 3);
    s.scale(1, 1, 0.45);
    s.translate(0, h / 2, 0);
    s.rotateX(0.12 + 0.25 * jitter(i, 54));
    s.rotateY(a);
    const at = bark(1, a, -0.4);
    s.translate(at.x, at.y - 1.5, at.z);
    parts.push(s);
  }
  return { geometry: mergeGeometries(parts), bark };
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
  // the falls: a sheet of white water poured off the cliff top at the head of the fjord, arching out as it drops and
  // streaming down in ragged strands, its foot lost in mist; it faces the cliff. In the Flood Surge it widens, runs
  // whiter and thicker, and its mist billows up
  fjords: (lm) => {
    const k = new Kit(lm.region * 977 + 5, 'landmark:falls'), swell = { value: 0 }, facing = highest(lm, 40);
    k.root.userData.facing = facing;
    k.root.userData.swell = swell;
    // the cliff as it stands toward the head of the fjord: the lip is where the face has climbed most of the way to
    // the top, the foot the last of the water short of it
    const ground = (d: number) => heightAt(along(lm.pos, facing, d, v3()));
    let peak = 0, lip = 30, foot = 12;
    for (let d = 0; d <= 60; d++) peak = Math.max(peak, ground(d));
    for (let d = 0; d <= 60; d++) if (ground(d) >= 0.8 * peak) { lip = d; break; }
    for (let d = lip; d > 0; d--) if (ground(d) < -1) { foot = d - 1; break; }
    const top = ground(lip) + 0.5;
    // poured off the lip and arching out from the face as it drops, to its foot in the water
    const pts: THREE.Vector3[] = [], widths: number[] = [];
    for (let i = 0; i <= 48; i++) {
      const f = i / 48;
      pts.push(new THREE.Vector3(Math.sin(i * 0.5) * 0.3, top - f * (top + 1), lip - (lip - foot) * Math.sqrt(f)));
      widths.push(22 + 9 * f);
    }
    const length = pts.reduce((s, p, i) => s + (i ? p.distanceTo(pts[i - 1]) : 0), 0);
    k.add(surface(k, strip(pts, widths), {
      color: 0xbfe4ee, day: 0, night: 0.25, blend: 'alpha', matter: 0xd8e6ea, uniforms: { uSwell: swell },
      vertex: /* glsl */ `p.x *= 1.0 + 0.75 * uSwell;`,
      paint: /* glsl */ `float x = vUv.x, v = vUv.y;
        float edge = smoothstep(0.0, 0.16, x) * smoothstep(1.0, 0.84, x);
        float n1 = bNoise(vec3(x * 7.0, v * 0.05 - uTime * 0.9, 0.0));
        float n2 = bNoise(vec3(x * 19.0, v * 0.14 - uTime * 1.7, 3.0));
        float n3 = bNoise(vec3(x * 42.0, v * 0.4 - uTime * 3.1, 9.0));
        float streak = smoothstep(0.3, 0.95, n1 * 0.55 + n2 * 0.35 + n3 * 0.25);
        // ragged at the edges, thin at the lip, dissolving into the mist at the foot
        float lip = smoothstep(0.0, 3.0, v), foot = 1.0 - smoothstep(${(length - 15).toFixed(1)}, ${length.toFixed(1)}, v);
        float body = edge * mix(0.35, 0.6, uSwell) + edge * (0.4 + 0.25 * uSwell) * streak;
        alpha = body * lip * foot * (0.55 + 0.45 * n2);
        col = mix(vec3(0.72, 0.82, 0.86), vec3(1.12), streak * (0.55 + 0.4 * uSwell));
        glow = body * streak;`,
    }));
    // mist rolling off the plunge, up the lower face and out over the water
    k.add(particles(k, {
      count: 180, color: 0xbfe4ee, day: 0, night: 0.05, blend: 'alpha', matter: 0xe2eaec, shape: SHAPE_PUFF, uniforms: { uSwell: swell },
      motion: /* glsl */ `float life = fract(s.x + t * (0.05 + s.y * 0.05));
        float a = s.z * 6.2831, grow = 1.0 + 1.3 * uSwell;
        float rr = (4.0 + life * (9.0 + s.w * 12.0)) * grow;
        pos = vec3(cos(a) * rr, 1.0 + life * (10.0 + s.y * 20.0) * grow, ${(foot + 1).toFixed(1)} - abs(sin(a)) * rr * 0.7);
        size = (3.5 + life * 7.0) * (0.8 + 0.5 * uSwell);
        alpha = sin(life * 3.14159) * (0.14 + 0.14 * uSwell);`,
    }));
    return k.root;
  },
  // the fallen Hollow Cedar: a log to sail through, its broken stump standing tall beside it, with fungus shelves
  // glowing down its side
  mistwood: (lm) => {
    const out = new THREE.Group(), wood = patch(new THREE.MeshStandardMaterial({ color: 0x5a3b28, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }), 'landmark-rock');
    const at = OBSTACLES.find((o) => o.region === lm.region && o.kind === 'trunk'), foot = at ? local(lm, at.pos) : { x: 18, z: -44 };
    const stump = cedarStump(foot.x, foot.z, -6, lm.height - 14, at?.r ?? 9, 2.4);
    out.add(new THREE.Mesh(cedarLog(), wood), new THREE.Mesh(stump.geometry, wood));
    for (let i = 0; i < 4; i++) {
      const shelf = glow(0x9dffb0, 2.2, 4);
      shelf.scale.set(1.2, 0.3, 1.2);
      shelf.position.copy(stump.bark(0.3 + 0.15 * i, 1.3 * i, 0.6));
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
  // Glasswater: shards of natural glass round the rim of the pool, one at each of the region's columns, which are
  // their girth at the waterline
  glassSea: (lm) => {
    const glass = patch(new THREE.MeshStandardMaterial({ color: 0x9fe6e0, roughness: 0.1, metalness: 0.2, flatShading: true }), 'landmark-glass');
    return columnsOf(lm, (x, z, o, i) => {
      const g = new THREE.ConeGeometry(o.r / 0.8, o.height + 4, 5);
      g.translate(0, o.height / 2 - 2, 0);
      const m = new THREE.Mesh(g, glass);
      m.position.set(x, 0, z);
      m.rotation.set((jitter(i, 4) - 0.5) * 0.1, 0, (jitter(i, 5) - 0.5) * 0.1);
      return m;
    });
  },
  // the Great Reef: coral towers round the rim of the biggest ring, with gaps to sail in by; the tallest grow as
  // clumps of leaning branches, like antler coral, not as single columns
  coralAtolls: (lm) => {
    const coral = rock(0xe39a7a);
    return columnsOf(lm, (x, z, o, i) => {
      if (o.height < lm.height - 4) return column(x, z, o.height, o.r, coral);
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

/** How far the Fjords' Flood Surge has the falls swollen, 0…1: rising through the warning, with the event's strength
 *  while it runs, and settling back once it's over. */
export function swollen(e: EventPhase | undefined): number {
  if (!e) return 0;
  if (e.phase === 'warning') return 0.35 * Math.min(1, e.since / 8);
  if (e.phase === 'running') return Math.max(0.35, e.strength ?? 1);
  if (e.phase === 'over') return Math.max(0, 0.35 * (1 - e.since / 6));
  return 0;
}

export class Landmarks {
  readonly group = new THREE.Group();
  /** The glows, dimmed by day. */
  private readonly glows: THREE.Mesh[] = [];
  /** The shapes drawn with the beacons' kit, whose clocks run with the frame. */
  private readonly kits: THREE.Object3D[] = [];
  /** How swollen the falls are, as their shaders read it. */
  private falls: { value: number } | null = null;

  constructor() {
    this.group.name = 'landmarks';
    for (const lm of LANDMARKS) {
      const build = SHAPES[REGIONS[lm.region].id];
      if (!build) continue;
      const shape = build(lm);
      shape.name = lm.name;
      stand(shape, lm.pos, shape.userData.facing ?? lm.facing, R);
      if (shape.userData.beacon) this.kits.push(shape);
      if (shape.userData.swell) this.falls = shape.userData.swell;
      shape.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData.glow) this.glows.push(o as THREE.Mesh);
        // (the kit's sheets and mist are see-through: they cast no shadow)
        else if ((o as THREE.Mesh).isMesh && !((o as THREE.Mesh).material as THREE.ShaderMaterial).isShaderMaterial) { o.castShadow = true; o.receiveShadow = true; }
      });
      this.group.add(shape);
    }
  }

  /** night: 0 day to 1 night where the camera is; `time` the clock the swell and beacons share; the regions'
   *  events, for the falls' swell. */
  update(night: number, time: number, events?: Partial<Record<RegionId, EventPhase>>): void {
    for (const g of this.glows) {
      const { color, power } = g.userData.glow as { color: THREE.Color; power: number };
      (g.material as THREE.MeshBasicMaterial).color.copy(color).multiplyScalar(0.25 + night * power);
    }
    for (const k of this.kits) tick(k, time, night);
    if (this.falls) this.falls.value = swollen(events?.fjords);
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
