// Blossom Run's petals: drifts of blossom ride the river round the camera, a scatter at any time and streaming thick
// down it in the Spring Flood, carried by the current as the simulation has it, so the faster the water the faster
// they go. Each drift is a few petals lying on the swell, turning slowly as it goes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, along, tangentAt } from '../../sim/sphere.ts';
import { REGIONS, currentAt, heightAt, regionShare, type RegionId } from '../../sim/world/index.ts';
import { v3, type V3 } from '../../sim/math.ts';
import { patch } from '../engine.ts';
import { waveHeight, waveSlope } from '../swell.ts';
import type { EventPhase } from './eventRocks.ts';

const BLOSSOM = REGIONS.findIndex((r) => r.id === 'blossomRun');
/** Drifts at most, and how many new ones are tried each frame. */
const N = 420, TRIES = 24;
/** Metres round the focus they are set loose in and followed to. */
const REACH = 120;
/** The share of the drifts afloat when the river runs as it always does; the Flood fills the rest. */
const CALM = 0.22;
/** Metres a second the water must run to carry them: the river, not the still bays. */
const RUNNING = 1.2;

const jitter = (i: number, k: number) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** A drift about 2 m across: five cupped petals, each a little oval curling up at its tip, lying round its middle. */
function drift(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const j = (k: number) => jitter(i, k), g = new THREE.CircleGeometry(0.3, 7), p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v);
      // flat on the water (its face up), longer than wide, and cupped: its edge and tip curl up
      p.setXYZ(v, x * 0.7, 0.05 * (x * x + y * y) / 0.09 + 0.06 * Math.max(0, y / 0.3), -y);
    }
    g.rotateY(j(1) * Math.PI * 2);
    g.translate((j(2) - 0.5) * 1.6, 0.02 * i, (j(3) - 0.5) * 1.6);
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export class EventPetals {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  /** Each drift's place (a unit vector), its velocity (metres a second, refreshed in turn), age, lifetime (0 for a
   *  free slot), turn and spin. */
  private readonly at = new Float64Array(N * 3);
  private readonly vel = new Float32Array(N * 3);
  private readonly age = new Float32Array(N);
  private readonly life = new Float32Array(N);
  private readonly yaw = new Float32Array(N);
  private readonly spin = new Float32Array(N);
  private frame = 0;
  private readonly p = v3();
  private readonly v = v3();
  private readonly f = v3();
  private readonly t = v3();
  private readonly m = new THREE.Matrix4();
  private readonly up = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly slope = { x: 0, y: 0, z: 0 };

  constructor() {
    this.group.name = 'eventPetals';
    const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x3a1a26, side: THREE.DoubleSide }), 'event-petals');
    this.mesh = new THREE.InstancedMesh(drift(), mat, N);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // blossom pinks, a few near white
    const tones = [0xf4b8cf, 0xf8cfdd, 0xfbe4ec, 0xec9fbd, 0xfff4f7].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) this.mesh.setColorAt(i, tones[Math.floor(jitter(i, 5) * tones.length)]);
    this.group.add(this.mesh);
  }

  /** Moves the drifts on by `dt` seconds round `focus` (metres) with the currents as the events drive them, thick
   *  in Blossom Run's Spring Flood, and lays them on the sea at `tide`, riding the swell at `time`. */
  update(focus: V3, events: Partial<Record<RegionId, EventPhase>> | undefined, currents: { lanes: readonly number[]; vortex: number } | undefined,
    time: number, tide: number, dt: number): void {
    const { at, vel, age, life, yaw, spin, p, v, m, up, x, z, w, slope } = this, f = this.unit(focus, this.f), far = Math.cos(REACH / R);
    const e = events?.blossomRun;
    const flood = e?.phase === 'running' ? e.strength ?? 1 : e?.phase === 'over' ? Math.max(0, 1 - e.since / 8) : 0;
    const want = Math.round(N * (CALM + (1 - CALM) * flood));
    const lanes = currents?.lanes ?? null, vortex = currents?.vortex ?? 1, turn = this.frame++ % 3;
    let alive = 0, n = 0;
    for (let i = 0; i < N; i++) {
      if (life[i] === 0) continue;
      const o = i * 3;
      p.x = at[o]; p.y = at[o + 1]; p.z = at[o + 2];
      // a third of them look up the current each frame
      if (i % 3 === turn) {
        currentAt(p, v, lanes, vortex);
        vel[o] = v.x; vel[o + 1] = v.y; vel[o + 2] = v.z;
      }
      age[i] += dt;
      p.x += (vel[o] * dt) / R;
      p.y += (vel[o + 1] * dt) / R;
      p.z += (vel[o + 2] * dt) / R;
      this.unit(p, p);
      // gone once its time is up, it runs aground or it drifts out of reach
      if (age[i] >= life[i] || p.x * f.x + p.y * f.y + p.z * f.z < far || heightAt(p) > tide - 0.4) {
        life[i] = 0;
        continue;
      }
      at[o] = p.x; at[o + 1] = p.y; at[o + 2] = p.z;
      alive++;
      // grown in as it's set loose and shrunk away at its end, so none pops
      const s = Math.min(1, age[i] / 0.8, (life[i] - age[i]) / 1.2);
      up.set(p.x, p.y, p.z).multiplyScalar(R + tide);
      const h = waveHeight(up, time);
      waveSlope(up, time, slope);
      up.set(p.x - slope.x, p.y - slope.y, p.z - slope.z).normalize();
      tangentAt(p, yaw[i] + spin[i] * age[i], this.t);
      z.set(this.t.x, this.t.y, this.t.z).addScaledVector(up, -(this.t.x * up.x + this.t.y * up.y + this.t.z * up.z)).normalize();
      x.crossVectors(up, z);
      w.set(p.x, p.y, p.z).multiplyScalar(R + tide + h + 0.06);
      m.makeBasis(x.multiplyScalar(s), up.multiplyScalar(s), z.multiplyScalar(s)).setPosition(w);
      this.mesh.setMatrixAt(n, m);
      n++;
    }
    // new ones set loose at random over the river round the focus, while fewer than the Flood wants are afloat
    for (let t = 0, i = 0; t < TRIES && alive < want; t++) {
      along(f, tangentAt(f, Math.random() * 2 * Math.PI, this.t), Math.sqrt(Math.random()) * REACH, p);
      if (regionShare(BLOSSOM, p) < 0.5 || heightAt(p) > tide - 0.6) continue;
      currentAt(p, v, lanes, vortex);
      if (Math.hypot(v.x, v.y, v.z) < RUNNING) continue;
      while (i < N && life[i] !== 0) i++;
      if (i === N) break;
      at[i * 3] = p.x; at[i * 3 + 1] = p.y; at[i * 3 + 2] = p.z;
      vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
      age[i] = 0;
      life[i] = 18 + 20 * Math.random();
      yaw[i] = Math.random() * 2 * Math.PI;
      spin[i] = (Math.random() - 0.5) * 0.6;
      alive++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  private unit(q: V3, out: V3): V3 {
    const l = Math.hypot(q.x, q.y, q.z) || 1;
    out.x = q.x / l;
    out.y = q.y / l;
    out.z = q.z / l;
    return out;
  }
}
