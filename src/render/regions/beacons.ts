// Every region's beacon at its site, in the beacon library's look for that region.
import * as THREE from 'three';
import { R } from '../../sim/sphere.ts';
import { BEACONS, REGIONS, heightAt } from '../../sim/world/index.ts';
import { BEACON_LOOKS, placeBeacon, type BeaconLook } from '../beacons/index.ts';

interface Placed {
  obj: THREE.Object3D;
  look: BeaconLook;
  /** The outward normal where it stands. */
  up: THREE.Vector3;
}

export class Beacons {
  readonly group = new THREE.Group();
  private readonly placed: Placed[] = [];

  constructor(seed = 1) {
    this.group.name = 'beacons';
    BEACONS.forEach((b, i) => {
      const look = BEACON_LOOKS[REGIONS[b.region].id], ground = Math.max(0, heightAt(b.pos));
      const obj = look.build(seed + i);
      placeBeacon(obj, b.pos, b.facing, R, look.ground === 'shore' ? ground : 0);
      this.group.add(obj);
      this.placed.push({ obj, look, up: new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z).normalize() });
    });
  }

  /** t: seconds; night: 0 day to 1 night where the camera is. Given the sun, each beacon is lit by the night where
   *  it stands instead, so from high over the planet those on its dark side shine and those in the day are quiet. */
  update(t: number, night: number, sun?: THREE.Vector3): void {
    for (const p of this.placed) {
      const n = sun ? Math.min(1, Math.max(0, (0.08 - p.up.dot(sun)) / 0.16)) : night;
      p.look.update(p.obj, t, n);
    }
  }
}
