// The Ice Crown's floes: flat slabs of pack ice riding their rings round the pole, drawn where the simulation has
// them, so the lanes a ship sees open and close are the ones she sails. Each slab turns with its ring.
import * as THREE from 'three';
import { R } from '../../sim/sphere.ts';
import { v3 } from '../../sim/math.ts';
import { FLOES, floePos } from '../../sim/world/index.ts';
import { ROCK_UNIFORMS, rockById, rockMaterial, setRockTextureBase } from '../rocks/index.ts';
import { TEX_BASE, patchAll } from '../engine.ts';
import { GPU } from '../actors/common.ts';

/** How many shapes of floe there are, each shared by every fourth floe; and the radius they are built at, metres. */
const SHAPES = 4, MID = 9.5;
/** A built floe's outline runs 0.72–1.05 of its radius: built this much wider, it covers the water the simulation's
 *  floe does. */
const COVER = 1.08;

export class Floes {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
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
    // the rock library's broken floes in its blue-white sea ice: a ragged rim, a snow-crusted top, rafted slabs
    // pushed up onto it
    setRockTextureBase(`${TEX_BASE}rocks/`);
    const form = rockById('iceFloe')!;
    for (let k = 0; k < SHAPES; k++) {
      const n = FLOES.filter((_, i) => i % SHAPES === k).length;
      for (const part of form.parts(0x1ce0 + 17 * k, 2 * MID * COVER, 0)) {
        const mesh = new THREE.InstancedMesh(part.geo, rockMaterial(part.skin ?? 'floe'), n);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.userData.shape = k;
        this.meshes.push(mesh);
        this.group.add(mesh);
      }
    }
    if (!GPU.on) patchAll(this.group);
  }

  /** t: how far round their rings the floes have ridden, in seconds; tide: sea level against the mean; night: 0 by
   *  day to 1 at night. */
  update(t: number, tide: number, night: number): void {
    const Y = Floes.Y, turn = this.turn;
    // the rocks' sea is the planet's, at the tide of the moment; the ice holds less light as the day goes
    ROCK_UNIFORMS.uSea.value.set(0, 0, 0, R + tide);
    ROCK_UNIFORMS.uDaylight.value = 1 - night;
    FLOES.forEach((f, i) => {
      const p = floePos(f, t, this.p);
      this.up.set(p.x, p.y, p.z);
      this.q.setFromUnitVectors(Y, this.up);
      turn.setFromAxisAngle(Y, -(f.angle + f.speed * t) + i * 1.7);
      this.q.multiply(turn);
      this.s.setScalar(f.size / MID);
      this.m.compose(this.at.copy(this.up).multiplyScalar(R + tide), this.q, this.s);
      for (const mesh of this.meshes) if (mesh.userData.shape === i % SHAPES) mesh.setMatrixAt(Math.floor(i / SHAPES), this.m);
    });
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}
