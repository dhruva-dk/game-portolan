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
  /** Toward the middle of all of it, the angle it spans either side of that over the planet, and how far over the
   *  sea its highest reaches, metres: what decides whether it shows over the horizon. */
  dir: THREE.Vector3;
  half: number;
  top: number;
}

const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _eye = new THREE.Vector3();

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
      _box.setFromObject(obj).getBoundingSphere(_sphere);
      const middle = _sphere.center.length();
      this.placed.push({
        obj, look, up: new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z).normalize(), dir: _sphere.center.clone().normalize(),
        half: Math.asin(Math.min(1, _sphere.radius / middle)), top: middle + _sphere.radius - R,
      });
    });
  }

  /** t: seconds; night: 0 day to 1 night where the camera is. Given the sun, each beacon is lit by the night where
   *  it stands instead, so from high over the planet those on its dark side shine and those in the day are quiet.
   *  Given the eye, those under its horizon are neither drawn nor moved: from a ship's deck most of them are, and
   *  they were a third of what the scene drew. */
  update(t: number, night: number, sun?: THREE.Vector3, eye?: THREE.Vector3): void {
    const camR = eye ? eye.length() : 0, cam = eye ? _eye.copy(eye).divideScalar(camR) : null;
    const hc = Math.acos(R / Math.max(camR, R + 0.5));
    for (const p of this.placed) {
      if (cam) {
        // as the terrain's chunks are tested (terrain.ts)
        const edge = Math.max(0, Math.acos(Math.min(1, Math.max(-1, cam.dot(p.dir)))) - p.half);
        p.obj.visible = edge <= hc + (p.top > 0 ? Math.acos(R / (R + p.top)) : 0) + 0.003;
        if (!p.obj.visible) continue;
      }
      const n = sun ? Math.min(1, Math.max(0, (0.08 - p.up.dot(sun)) / 0.16)) : night;
      p.look.update(p.obj, t, n);
    }
  }
}
