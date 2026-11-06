// The Spice Isles' Pearl Bloom: a bed of giant clams comes up round the event's spot while it is warned, gapes open
// as it starts, each with a pearl glowing in its lips, and closes and sinks again once it is over. The pearls the
// simulation spills are loot; the clams only show where the bed is. Each clam rides the swell.
import * as THREE from 'three';
import { R, along, tangentAt } from '../../sim/sphere.ts';
import { REGION_EVENTS, REGIONS, heightAt, type RegionId } from '../../sim/world/index.ts';
import { v3 } from '../../sim/math.ts';
import { seaAt } from '../swell.ts';
import { addedGlowNode, faintGlowNode, glowNode } from '../beacons/nodes.ts';
import type { EventPhase } from './eventRocks.ts';

const SPICE = REGIONS.findIndex((r) => r.id === 'spiceIsles');
/** Clams in the bed, and the metres round its spot they lie in. */
const CLAMS = 9, BED = 16;
/** Seconds a clam takes to come up, to gape open, and to close and sink. */
const RISE = 3, OPEN = 1.4, SINK = 4;
/** How far a clam's upper shell gapes, radians. */
const GAPE = 1.05;

const jitter = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** The upper shell, its hinge at the origin and its lip toward +Z: a shallow dome about 2.6 m across, fluted into
 *  ribs that wave its rim. The lower shell is the same dome mirrored into a cup. */
function shell(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1.3, 22, 6, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), rim = 1 - y / 1.3;
    // fluted: the ribs push the rim in and out, more toward the lip
    const rib = 1 + 0.09 * Math.sin(a * 11) * rim;
    p.setXYZ(i, x * rib, y * 0.42, z * rib * 0.8 + 1.05);
  }
  g.computeVertexNormals();
  return g;
}

/** One clam in a bed: where it floats (a unit vector), its heading, its size, and its turn to come up, 0…1. */
interface Clam { up: THREE.Vector3; fwd: THREE.Vector3; s: number; turn: number }

export class EventClams {
  readonly group = new THREE.Group();
  private readonly lower: THREE.InstancedMesh;
  private readonly upper: THREE.InstancedMesh;
  private readonly pearls: THREE.InstancedMesh;
  private readonly halos: THREE.InstancedMesh;
  /** Each spot's bed, laid out when it first blooms there, on water only. */
  private readonly beds: Clam[][] = [];
  private readonly m = new THREE.Matrix4();
  private readonly hinge = new THREE.Matrix4();
  private readonly top = new THREE.Matrix4();
  private readonly dot = new THREE.Matrix4();
  private readonly up = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly slope = { x: 0, y: 0, z: 0 };

  constructor() {
    this.group.name = 'eventClams';
    const dome = shell(), cup = shell().scale(1, -1, 1);
    cup.computeVertexNormals();
    const outside = new THREE.MeshStandardMaterial({ color: 0x6d7e86, roughness: 0.55, flatShading: true, side: THREE.DoubleSide });
    // the cup's nacre, seen when they gape
    const shine = { color: 0xe7d3e6, roughness: 0.25, metalness: 0.2, emissive: 0x3a2a48, side: THREE.DoubleSide };
    const nacre = (faintGlowNode(shine) as unknown as THREE.MeshStandardMaterial);
    this.lower = new THREE.InstancedMesh(cup, nacre, CLAMS);
    this.upper = new THREE.InstancedMesh(dome, outside, CLAMS);
    // the pearls glow past white, so they bloom, at the lamps' scale
    const pearl = glowNode(0xffe9c2, { value: 3 });
    this.pearls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 2), pearl as THREE.Material, CLAMS);
    const halo = addedGlowNode(0xffd9a0, 0.13);
    this.halos = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 2), halo as THREE.Material, CLAMS);
    for (const mesh of [this.lower, this.upper, this.pearls, this.halos]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
    }
    this.lower.castShadow = this.upper.castShadow = true;
  }

  /** Raises, opens and closes the bed for its event's phase (none when absent), on the sea at `tide`, riding the
   *  swell at `time`. */
  update(events: Partial<Record<RegionId, EventPhase>> | undefined, time: number, tide: number): void {
    const e = events?.spiceIsles;
    // how far up the bed has come (0 under the water, 1 afloat) and how far open, 0…1
    let lift = 0, open = 0;
    if (e?.phase === 'warning') lift = Math.min(1, e.since / RISE);
    else if (e?.phase === 'running') (lift = 1), (open = Math.min(1, e.since / OPEN));
    else if (e?.phase === 'over') (lift = Math.max(0, 1 - e.since / SINK)), (open = Math.max(0, 1 - e.since / OPEN));
    if (lift <= 0 || e === undefined) {
      for (const mesh of [this.lower, this.upper, this.pearls, this.halos]) mesh.visible = false;
      return;
    }
    const bed = (this.beds[e.k] ??= this.lay(e.k));
    const { m, hinge, top, dot, up, x, z, at, slope } = this;
    let n = 0;
    for (const { up: u, fwd, s: size, turn } of bed) {
      at.copy(u).multiplyScalar(R + tide);
      const h = seaAt(at, time, slope);
      up.set(u.x - slope.x, u.y - slope.y, u.z - slope.z).normalize();
      z.copy(fwd).addScaledVector(up, -fwd.dot(up)).normalize();
      x.crossVectors(up, z);
      // each comes up in its own turn, and gapes with a slow breath once open
      const own = Math.min(1, Math.max(0, lift * 1.6 - turn * 0.6)), s = size * (0.35 + 0.65 * own);
      at.copy(u).multiplyScalar(R + tide + h - 1.1 * (1 - own) + 0.1);
      m.makeBasis(x.multiplyScalar(s), up.multiplyScalar(s), z.multiplyScalar(s)).setPosition(at);
      this.lower.setMatrixAt(n, m);
      const breath = 0.88 + 0.12 * Math.sin(time * 1.3 + turn * 9);
      this.upper.setMatrixAt(n, top.multiplyMatrices(m, hinge.makeRotationX(-GAPE * open * breath)));
      // the pearl sits in the lips, swelling into sight as they part, its halo breathing round it
      const glow = open * own, pulse = glow * (0.85 + 0.25 * Math.sin(time * 2.4 + turn * 7));
      this.pearls.setMatrixAt(n, top.multiplyMatrices(m, dot.makeTranslation(0, 0.12, 1.05).scale(x.set(glow, glow, glow))));
      this.halos.setMatrixAt(n, top.multiplyMatrices(m, dot.makeTranslation(0, 0.3, 1.05).scale(x.set(pulse, pulse, pulse))));
      n++;
    }
    for (const mesh of [this.lower, this.upper, this.pearls, this.halos]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = n > 0;
    }
    this.pearls.visible = this.halos.visible = open > 0.02;
  }

  /** The bed round spot k: clams scattered over it, on water deep enough to float them, the first at the spot. */
  private lay(k: number): Clam[] {
    const spot = REGION_EVENTS[SPICE].spots[k], out: Clam[] = [], p = v3(), t = v3();
    for (let i = 0; i < CLAMS * 6 && out.length < CLAMS; i++) {
      const j = (q: number) => jitter(k * 131 + i, q), d = i === 0 ? 0 : 4 + Math.sqrt(j(1)) * (BED - 4);
      along(spot, tangentAt(spot, j(2) * Math.PI * 2, t), d, p);
      if (heightAt(p) > -1.5) continue;
      // too close to one already laid: a clam is 2.6 m across
      if (out.some((o) => o.up.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) * R < 3.6)) continue;
      const fwd = tangentAt(p, j(3) * Math.PI * 2, v3());
      out.push({ up: new THREE.Vector3(p.x, p.y, p.z), fwd: new THREE.Vector3(fwd.x, fwd.y, fwd.z), s: 0.8 + 0.5 * j(4), turn: out.length / CLAMS });
    }
    return out;
  }
}
