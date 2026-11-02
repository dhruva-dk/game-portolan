// The rock the regions' events move, drawn where the simulation has it, so what a ship runs into is what she sees:
// the Spires' three spires, each standing on its stump past one end of its fall until the event breaks one across
// the race, where it lies for good; the Narrows' rockfall, coming down into a mouth of the Gorge as the event starts
// and settling out of the way once it is over; and the Basalt Stacks' rock roofs over the tunnel, which shut it to
// a ship whenever the sea stands high under them. Each shape stands in its spot's frame: +Y the outward normal, +Z
// its facing, y = 0 at mean sea level.
import * as THREE from 'three';
import { R } from '../../sim/sphere.ts';
import { REGION_EVENTS, REGIONS, type RegionId } from '../../sim/world/index.ts';
import { STUMP } from '../../sim/world/regions/spires.ts';
import type { V3 } from '../../sim/math.ts';
import { patch } from '../engine.ts';

/** Where a region's event has got to: the spot it happens at, seconds into its phase and left until the next, and how
 *  hard it runs now (0…1, ramping up and down at its ends, as the simulation has it; 1 while running when absent). */
export interface EventPhase {
  phase: 'waiting' | 'warning' | 'running' | 'over';
  k: number;
  since: number;
  left: number;
  strength?: number;
}

/** Seconds a spire takes to fall and the Narrows' rocks to come down; both land as the event starts. */
export const FALL = 1.1, DROP = 0.8;
/** Seconds the Narrows' scree takes to settle out of the way once its event is over. */
const SETTLE = 4;
/** How long the falling spire is, base to tip: from its stump across the whole of the run. */
const SPIRE = 66;

const SPIRES = REGIONS.findIndex((r) => r.id === 'spires'), NARROWS = REGIONS.findIndex((r) => r.id === 'narrows');
const BASALT = REGIONS.findIndex((r) => r.id === 'basaltStacks');

// a fixed pseudo-random sequence per shape, so the shapes are the same every run
const jitter = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** A spot's frame: x across, y the outward normal, z along the facing, its origin at mean sea level. */
function frame(pos: V3, facing: V3): THREE.Matrix4 {
  const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize(), z = new THREE.Vector3(facing.x, facing.y, facing.z);
  z.addScaledVector(up, -z.dot(up)).normalize();
  const x = new THREE.Vector3().crossVectors(up, z);
  return new THREE.Matrix4().makeBasis(x, up, z).setPosition(up.multiplyScalar(R));
}

/** Roughens a shape: each corner pushed up to `by` metres, the same for every face sharing it, so it stays closed. */
function rough(g: THREE.BufferGeometry, by: number, seed: number, keep?: (x: number, y: number, z: number) => boolean): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (keep?.(x, y, z)) continue;
    const h = Math.round(x * 7.1 + y * 13.3 + z * 17.9) + seed * 101;
    p.setXYZ(i, x + (jitter(h, 1) - 0.5) * 2 * by, y + (jitter(h, 2) - 0.5) * 2 * by, z + (jitter(h, 3) - 0.5) * 2 * by);
  }
  return g;
}

/** Flat faces coloured by which way they look: `top` on those facing up, `side` on the rest. */
function paint(g: THREE.BufferGeometry, side: number, top?: number): THREE.BufferGeometry {
  const f = g.index ? g.toNonIndexed() : g;
  f.deleteAttribute('uv');
  f.deleteAttribute('normal');
  f.computeVertexNormals();
  const n = f.attributes.normal, col = new Float32Array(n.count * 3), a = new THREE.Color(side), b = new THREE.Color(top ?? side);
  for (let i = 0; i < n.count; i += 3) {
    const c = top !== undefined && n.getY(i) > 0.55 ? b : a;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  f.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return f;
}

/** A spire along +Y from its base a little under the sea: pale limestone, tapering, a little bent and fluted. */
function spire(i: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(4, 7.5, SPIRE + 2, 7, 10);
  g.translate(0, SPIRE / 2 - 1, 0);
  const p = g.attributes.position as THREE.BufferAttribute, bend = 1.5 + jitter(i, 5);
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k), u = y / SPIRE;
    p.setX(k, p.getX(k) + bend * Math.sin(u * Math.PI));
  }
  const f = paint(rough(g, 0.8, 30 + i), 0xffffff), pos = f.attributes.position, col = f.attributes.color as THREE.BufferAttribute;
  // weathered darker toward its foot, paler up its length, each face a shade of its own
  const foot = new THREE.Color(0x9c8462), tip = new THREE.Color(0xd9c9a6), c = new THREE.Color();
  for (let k = 0; k < pos.count; k += 3) {
    c.lerpColors(foot, tip, Math.min(1, Math.max(0, pos.getY(k) / SPIRE) * 1.6)).multiplyScalar(0.88 + 0.22 * jitter(k, 9 + i));
    for (let q = 0; q < 3; q++) col.setXYZ(k + q, c.r, c.g, c.b);
  }
  return f;
}

/** A boulder about `r` metres across, squashed a little and its corners knocked about. */
function boulder(i: number, r: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.scale(r * (0.9 + 0.3 * jitter(i, 11)), r * (0.6 + 0.3 * jitter(i, 12)), r * (0.9 + 0.3 * jitter(i, 13)));
  // the walls' banded ochre sandstone, its broken faces a shade lighter
  return paint(rough(g, r * 0.18, 60 + i), 0x8f5f3c, 0xb3825a);
}

/** A smooth field of lumps, about −1…1, the same at the same point every run. */
const lumps = (x: number, y: number, z: number, seed: number) =>
  (Math.sin(x * 0.41 + seed) * Math.sin(y * 0.37 + seed * 1.7) + Math.sin(z * 0.53 + x * 0.21 + seed * 2.3) * Math.sin(y * 0.29 - z * 0.17 + seed * 0.7)) / 2;

/** The tunnel's half-width, metres: the roof's opening comes no lower than its `under` across it. */
const TUNNEL_HALF = 6.5;

/**
 * A rock roof across the tunnel along +Z: a natural arch of basalt springing from under the water either side and
 * turfed on top, higher where it meets the plateau (−X) than over the shoal (+X). Its opening is a rounded arch whose
 * crown stands 2.5 m over `under` and which comes no lower than `under` across the tunnel, as the simulation has it;
 * the rock round it is lumpy, and its ends are broken back unevenly.
 */
function roof(i: number, length: number, under: number): THREE.BufferGeometry {
  // a box whose x runs over the arch from foot to foot, y from the opening out to the turf, and z along the tunnel
  const g = new THREE.BoxGeometry(1, 1, 1, 36, 5, 14), p = g.attributes.position as THREE.BufferAttribute;
  const sup = (c: number, e: number) => Math.sign(c) * Math.abs(c) ** e, seed = 3 + i * 5;
  for (let k = 0; k < p.count; k++) {
    const s = p.getX(k) + 0.5, t = p.getY(k) + 0.5, w = p.getZ(k), th = Math.PI * (1 - s), c = Math.cos(th), sn = Math.abs(Math.sin(th));
    // the opening: a rounded arch from 8 m under the sea; the outside: broader, and higher toward the plateau
    const ia = c < 0 ? 10.5 : 9.5, ix = ia * sup(c, 2 / 3), iy = -8 + (under + 10.5) * sn ** (2 / 3);
    const oa = c < 0 ? 15 : 13.5, ox = oa * sup(c, 0.8), oy = -8 + (27 - 3 * c) * sn ** 0.8;
    let x = ix + (ox - ix) * t, y = iy + (oy - iy) * t, z = w * length;
    // lumped out from the arch's middle: the opening only ever wider, the outside either way
    const bump = lumps(x, y, z, seed), out = t * 1.4 * bump + (1 - t) * 0.8 * Math.abs(bump), d = Math.hypot(x, y + 2) || 1;
    x += (x / d) * out;
    y += ((y + 2) / d) * out;
    // the ends broken back unevenly, up to 2 m in and 1 m out
    if (Math.abs(w) > 0.49) z = Math.sign(w) * (length / 2 - 0.5 + 1.5 * lumps(x * 1.3, y * 1.3, 0, seed + 1));
    if (t < 0.01 && Math.abs(x) <= TUNNEL_HALF + 0.5) y = Math.max(y, under);
    p.setXYZ(k, x, y, z);
  }
  // the opening over the tunnel stays where the simulation has it; the rest is broken up
  return paint(rough(g, 0.45, 80 + i, (x, y) => Math.abs(x) <= TUNNEL_HALF + 1 && y < under + 3), 0x35353b, 0x56703c);
}

const easeIn = (u: number) => u * u;
const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);

interface Spire { pivot: THREE.Group; mesh: THREE.Mesh }
interface Rock { mesh: THREE.Mesh; rest: THREE.Vector3; spin: THREE.Vector3; delay: number }

export class EventRocks {
  readonly group = new THREE.Group();
  private readonly spires: Spire[] = [];
  private readonly scree: THREE.Group[] = [];
  private readonly rocks: Rock[][] = [];

  constructor() {
    this.group.name = 'eventRocks';
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }), 'landmark-rock');
    const add = (o: THREE.Object3D, pos: V3, facing: V3) => {
      o.matrixAutoUpdate = false;
      o.matrix.copy(frame(pos, facing));
      this.group.add(o);
    };
    const s = REGION_EVENTS[SPIRES];
    s.spots.forEach((at, k) => {
      const holder = new THREE.Group(), pivot = new THREE.Group(), mesh = new THREE.Mesh(spire(k), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      pivot.add(mesh);
      holder.add(pivot);
      add(holder, at, s.facings[k]);
      this.spires.push({ pivot, mesh });
    });
    const n = REGION_EVENTS[NARROWS], r = (n.block?.width ?? 30) / 2;
    n.spots.forEach((at, k) => {
      const holder = new THREE.Group(), rocks: Rock[] = [];
      for (let i = 0; i < 12; i++) {
        const j = (q: number) => jitter(k * 12 + i, q), a = j(1) * Math.PI * 2, d = (i === 0 ? 0 : 0.35 + 0.55 * j(2)) * (r - 4);
        const size = 4.5 + 3.5 * j(3) + (i < 3 ? 2 : 0), mesh = new THREE.Mesh(boulder(k * 12 + i, size), mat);
        mesh.castShadow = mesh.receiveShadow = true;
        // heaped highest in the middle of the mouth, a few metres clear of the water, lower out to its sides
        const rest = new THREE.Vector3(Math.cos(a) * d, 1 + 2.5 * j(4) - 0.12 * d, Math.sin(a) * d);
        const spin = new THREE.Vector3(j(5) - 0.5, j(6) - 0.5, j(7) - 0.5).normalize();
        holder.add(mesh);
        rocks.push({ mesh, rest, spin, delay: 0.35 * j(8) });
      }
      holder.visible = false;
      add(holder, at, n.facings[k]);
      this.scree.push(holder);
      this.rocks.push(rocks);
    });
    const b = REGION_EVENTS[BASALT];
    b.roofs.forEach((o, i) => {
      const mesh = new THREE.Mesh(roof(i, o.length, o.under), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      add(mesh, o.pos, o.facing);
    });
  }

  /** Lays the rock out for the events' phases (none under way when absent) at `time` seconds on the shared clock. */
  update(events: Partial<Record<RegionId, EventPhase>> | undefined, time: number): void {
    const sp = events?.spires;
    this.spires.forEach((s, k) => this.spire(s, sp !== undefined && sp.k === k ? sp : null, time));
    const nw = events?.narrows;
    this.scree.forEach((g, k) => this.fall(g, this.rocks[k], nw !== undefined && nw.k === k ? nw : null));
  }

  /** A spire stands on its stump; the one its event picks leans as it is warned, falls as it starts and lies across the run. */
  private spire(s: Spire, e: EventPhase | null, time: number): void {
    let tilt = 0, u = 0;
    if (e?.phase === 'warning') {
      tilt = 0.12 * clamp01(e.since / 8) + (e.left < 3 ? 0.004 * Math.sin(time * 31) : 0);
      u = clamp01(1 - e.left / FALL);
    } else if (e?.phase === 'running' || e?.phase === 'over') u = 1;
    const k = easeIn(u);
    // from upright on its stump, round about its foot nearest the run, to lying along it half in the water
    s.pivot.position.set(0, -1.5 * k, STUMP.at - 6 * k);
    s.pivot.rotation.set(-(tilt + (Math.PI / 2 - tilt) * k), 0, 0);
  }

  /** The Narrows' rocks: down from the walls as the event starts, lying in the mouth, then settling out of sight. */
  private fall(g: THREE.Group, rocks: Rock[], e: EventPhase | null): void {
    // seconds until the event starts: the rocks are all down a moment after
    const coming = e?.phase === 'warning' ? e.left : e?.phase === 'running' ? -e.since : -1e9;
    g.visible = e !== null && (e.phase === 'running' || (e.phase === 'warning' && e.left < DROP + 0.4) || (e.phase === 'over' && e.since < SETTLE));
    if (!g.visible || !e) return;
    const sink = e.phase === 'over' ? 18 * easeIn(clamp01(e.since / SETTLE)) : 0;
    for (const r of rocks) {
      const air = clamp01((coming + r.delay) / DROP);
      r.mesh.visible = air < 1;
      r.mesh.position.copy(r.rest);
      r.mesh.position.y += 50 * easeIn(air) - sink;
      r.mesh.setRotationFromAxisAngle(r.spin, air * 4 + r.delay * 9);
    }
  }
}

/** Where the event that just started in region `ri` brings its rock down into the water, unit vectors: along the
 *  Spires' fallen spire, or across the Narrows' rockfall. None for the other regions. */
export function rockfallAt(ri: number, at: V3): V3[] {
  const e = REGION_EVENTS[ri];
  if ((ri !== SPIRES && ri !== NARROWS) || !e.block) return [];
  let k = 0;
  e.spots.forEach((s, i) => {
    if (s.x * at.x + s.y * at.y + s.z * at.z > e.spots[k].x * at.x + e.spots[k].y * at.y + e.spots[k].z * at.z) k = i;
  });
  const c = e.spots[k], f = e.facings[k], x = { x: c.y * f.z - c.z * f.y, y: c.z * f.x - c.x * f.z, z: c.x * f.y - c.y * f.x };
  const out: V3[] = [];
  const put = (along: number, across: number) => {
    const p = { x: c.x + (f.x * along + x.x * across) / R, y: c.y + (f.y * along + x.y * across) / R, z: c.z + (f.z * along + x.z * across) / R };
    const n = Math.hypot(p.x, p.y, p.z);
    out.push({ x: p.x / n, y: p.y / n, z: p.z / n });
  };
  if (ri === SPIRES) for (let t = -30; t <= 30; t += 10) put(t, 0);
  else for (let i = 0; i < 6; i++) put(Math.cos(i) * e.block.width * 0.3, Math.sin(i) * e.block.width * 0.3);
  return out;
}
