// The Ice Crown's floes: flat slabs of pack ice riding their rings round the pole, drawn where the simulation has
// them, so the lanes a ship sees open and close are the ones she sails. Each slab turns with its ring.
import * as THREE from 'three';
import { R } from '../../sim/sphere.ts';
import { v3 } from '../../sim/math.ts';
import { FLOES, floePos } from '../../sim/world/index.ts';
import { patch } from '../engine.ts';

/** Top and bottom of a slab against the sea, metres. */
const TOP = 0.7, BOTTOM = -1.6;

/** A slab of unit radius with a ragged rim, its top at TOP. */
function slab(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1.08, TOP - BOTTOM, 11, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    // the same ragged rim top and bottom, so the sides stay closed
    const k = 0.95 + 0.06 * Math.sin(a * 3 + 0.7) + 0.04 * Math.sin(a * 7 + 2.1);
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  g.translate(0, (TOP + BOTTOM) / 2, 0);
  g.computeVertexNormals();
  return g;
}

export class Floes {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly p = v3();
  private readonly turn = new THREE.Quaternion();
  private static readonly Y = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.group.name = 'floes';
    const ice = patch(new THREE.MeshStandardMaterial({ color: 0xe6f0f5, roughness: 0.55, flatShading: true }), 'landmark-rock');
    this.mesh = new THREE.InstancedMesh(slab(), ice, FLOES.length);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  /** t: how far round their rings the floes have ridden, in seconds; tide: sea level against the mean. */
  update(t: number, tide: number): void {
    const Y = Floes.Y, turn = this.turn;
    FLOES.forEach((f, i) => {
      const p = floePos(f, t, this.p);
      this.up.set(p.x, p.y, p.z);
      this.q.setFromUnitVectors(Y, this.up);
      turn.setFromAxisAngle(Y, -(f.angle + f.speed * t) + i * 1.7);
      this.q.multiply(turn);
      this.s.set(f.size, 1, f.size);
      this.m.compose(this.at.copy(this.up).multiplyScalar(R + tide), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
