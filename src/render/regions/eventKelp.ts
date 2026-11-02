// The Kelp Shallows' bloom: rafts of kelp come up and spread over the water round the event's spot, out to the
// bloom's radius as the simulation has it, so the water that holds a ship back is the water that looks choked. A few
// gather at the spot while the bloom is warned. Each raft is a fan of blades lying on the sea with its floats, laid
// on the swell every frame and tilting with it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, along, tangentAt } from '../../sim/sphere.ts';
import { REGION_EVENT } from '../../sim/tables.ts';
import { REGION_EVENTS, REGIONS, heightAt, type RegionId } from '../../sim/world/index.ts';
import { v3 } from '../../sim/math.ts';
import { patch } from '../engine.ts';
import { waveHeight, waveSlope } from '../swell.ts';
import type { EventPhase } from './eventRocks.ts';

const KELP = REGIONS.findIndex((r) => r.id === 'kelpShallows');
/** Rafts round each spot, the most that can show at once. */
const RAFTS = 1100;
/** Metres the bloom's edge takes to thin out to nothing, as in the simulation. */
const EDGE = 10;

const jitter = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** A raft about 5 m across: blades fanning out from its middle, rippled and tapering, and the floats among them. */
function raft(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], blades = 9;
  const tones = [0x8a7428, 0x9f8834, 0x766426, 0xae9840].map((h) => new THREE.Color(h));
  const tint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  };
  for (let b = 0; b < blades; b++) {
    const j = (k: number) => jitter(b, k), len = 2.4 + 2.2 * j(1), w = 0.5 + 0.35 * j(2);
    const g = new THREE.PlaneGeometry(w, len, 1, 6), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // from the raft's middle out along -Z (so its face looks up), narrowing to the tip and rippling on the water
      const t = p.getY(i) / len + 0.5;
      p.setXYZ(i, p.getX(i) * (1 - 0.55 * t) + 0.3 * Math.sin(t * 4 + b), 0.07 * Math.sin(t * 9 + b * 2) * t, -(0.3 + t * len));
    }
    g.rotateY((Math.PI * 2 * (b + 0.6 * j(3))) / blades);
    g.computeVertexNormals();
    parts.push(tint(g, tones[b % tones.length]));
  }
  for (let f = 0; f < 6; f++) {
    const a = Math.PI * 2 * jitter(f, 7), d = 0.4 + 1.6 * jitter(f, 8), g = new THREE.IcosahedronGeometry(0.16 + 0.1 * jitter(f, 9), 0);
    g.translate(Math.cos(a) * d, 0.06, Math.sin(a) * d);
    parts.push(tint(g, new THREE.Color(0xa48c3c)));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** One raft round a spot: where it floats (a unit vector), how far it is from the spot, its heading and size. */
interface Raft { up: THREE.Vector3; fwd: THREE.Vector3; d: number; s: number }

export class EventKelp {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  /** Each spot's rafts, nearest the spot first, made when the bloom first comes there. */
  private readonly spots: Raft[][] = [];
  private readonly m = new THREE.Matrix4();
  private readonly up = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly slope = { x: 0, y: 0, z: 0 };

  constructor() {
    this.group.name = 'eventKelp';
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide }), 'event-kelp');
    this.mesh = new THREE.InstancedMesh(raft(), mat, RAFTS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    // a little shading between rafts, so the mat is not one flat colour
    const tones = [0.88, 1, 1.12].map((k) => new THREE.Color(k, k, k));
    for (let i = 0; i < RAFTS; i++) this.mesh.setColorAt(i, tones[i % 3]);
    this.group.add(this.mesh);
  }

  /** Spreads the bloom for its event's phase (none when absent) on the sea at `tide`, riding the swell at `time`. */
  update(events: Partial<Record<RegionId, EventPhase>> | undefined, time: number, tide: number): void {
    const e = events?.kelpShallows;
    let r = 0;
    if (e?.phase === 'warning') r = 16 * Math.min(1, e.since / 6);
    else if (e?.phase === 'running') r = REGION_EVENT.bloom.r * (e.strength ?? 1);
    if (r < 2 || e === undefined) {
      this.mesh.visible = false;
      return;
    }
    const rafts = (this.spots[e.k] ??= this.lay(e.k));
    const { m, up, x, z, at, slope } = this;
    let n = 0;
    for (const f of rafts) {
      if (f.d > r) break;
      const grow = Math.min(1, (r - f.d) / EDGE) * f.s;
      at.copy(f.up).multiplyScalar(R + tide);
      const h = waveHeight(at, time);
      waveSlope(at, time, slope);
      // tilted with the swell, its heading kept along the water
      up.set(f.up.x - slope.x, f.up.y - slope.y, f.up.z - slope.z).normalize();
      z.copy(f.fwd).addScaledVector(up, -f.fwd.dot(up)).normalize();
      x.crossVectors(up, z);
      at.copy(f.up).multiplyScalar(R + tide + h + 0.08);
      m.makeBasis(x.multiplyScalar(grow), up.multiplyScalar(grow), z.multiplyScalar(grow)).setPosition(at);
      this.mesh.setMatrixAt(n, m);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  /** The rafts round spot k, scattered over the bloom's widest reach, leaving out the shallows and the land. */
  private lay(k: number): Raft[] {
    const spot = REGION_EVENTS[KELP].spots[k], max = REGION_EVENT.bloom.r, out: Raft[] = [], p = v3(), t = v3();
    for (let i = 0; i < RAFTS * 1.4 && out.length < RAFTS; i++) {
      const j = (q: number) => jitter(k * 7919 + i, q), d = Math.sqrt(j(1)) * max;
      along(spot, tangentAt(spot, j(2) * Math.PI * 2, t), d, p);
      if (heightAt(p) > -1.2) continue;
      const fwd = tangentAt(p, j(3) * Math.PI * 2, v3());
      out.push({ up: new THREE.Vector3(p.x, p.y, p.z), fwd: new THREE.Vector3(fwd.x, fwd.y, fwd.z), d, s: 0.75 + 0.6 * j(4) });
    }
    return out.sort((a, b) => a.d - b.d);
  }
}
