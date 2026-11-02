// Every region's beacon at its site, in the beacon library's look for that region.
import * as THREE from 'three';
import { R } from '../../sim/sphere.ts';
import { BEACONS, REGIONS, heightAt } from '../../sim/world/index.ts';
import { BEACON_LOOKS, placeBeacon, type BeaconLook } from '../beacons/index.ts';
import { patchAll } from '../engine.ts';

interface Placed {
  obj: THREE.Object3D;
  look: BeaconLook;
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
      this.placed.push({ obj, look });
    });
    // the beacon library's own materials get the planet's light and air too
    patchAll(this.group);
  }

  /** t: seconds; night: 0 day to 1 night where the camera is. */
  update(t: number, night: number): void {
    for (const p of this.placed) p.look.update(p.obj, t, night);
  }
}
