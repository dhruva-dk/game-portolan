// Every region's beacon at its site: the beacon library's look where it has one, and a placeholder light (a slim
// natural spire with a glow at the beacon's height) for the regions still waiting on theirs.
import * as THREE from 'three';
import { R } from '../../sim/sphere.ts';
import { BEACONS, REGIONS, heightAt } from '../../sim/world/index.ts';
import { BEACON_LOOKS, placeBeacon, type BeaconLook } from '../beacons/index.ts';
import { patch, patchAll } from '../engine.ts';
import { stand } from './landmarks.ts';

interface Placed {
  obj: THREE.Object3D;
  look: BeaconLook | null;
  glow: THREE.MeshBasicMaterial | null;
  color: THREE.Color;
}

export class Beacons {
  readonly group = new THREE.Group();
  private readonly placed: Placed[] = [];

  constructor(seed = 1) {
    this.group.name = 'beacons';
    const stone = patch(new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.9, flatShading: true }), 'beacon-stone');
    BEACONS.forEach((b, i) => {
      const id = REGIONS[b.region].id, look = BEACON_LOOKS[id] ?? null, ground = Math.max(0, heightAt(b.pos));
      if (look) {
        const obj = look.build(seed + i);
        placeBeacon(obj, b.pos, b.facing, R, look.ground === 'shore' ? ground : 0);
        this.group.add(obj);
        this.placed.push({ obj, look, glow: null, color: new THREE.Color(look.color) });
        return;
      }
      const color = new THREE.Color().setHSL(i / BEACONS.length, 0.7, 0.62);
      const obj = new THREE.Group();
      const top = Math.max(b.height, ground + 8);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.4, top + 6, 7), stone);
      spire.position.y = (top - 6) / 2;
      const glow = new THREE.MeshBasicMaterial({ color: color.clone(), fog: false, toneMapped: false });
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 2), glow);
      ball.position.y = top + 1.5;
      obj.add(spire, ball);
      stand(obj, b.pos, b.facing, R);
      this.group.add(obj);
      this.placed.push({ obj, look: null, glow, color });
    });
    // the beacon library's own materials get the planet's light and air too
    patchAll(this.group);
  }

  /** t: seconds; night: 0 day to 1 night where the camera is. */
  update(t: number, night: number): void {
    for (const p of this.placed) {
      if (p.look) p.look.update(p.obj, t, night);
      else p.glow!.color.copy(p.color).multiplyScalar(0.3 + night * 7 * (0.85 + 0.15 * Math.sin(t * 1.7)));
    }
  }
}
