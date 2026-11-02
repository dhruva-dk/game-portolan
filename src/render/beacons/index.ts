// Each region's natural beacon: its light at night. Never built, always natural, and unmistakable for its region.
//
// Use: const obj = BEACON_LOOKS[id].build(seed); place it with placeBeacon() at the region's BEACONS site, and call
// BEACON_LOOKS[id].update(obj, seconds, night) every frame (night: 0 full day .. 1 full night).
import * as THREE from 'three';
import type { RegionId } from '../../sim/world/index.ts';
import type { BeaconLook } from './look.ts';
import type { BeaconState } from './kit.ts';
import { iceCrown } from './looks/iceCrown.ts';
import { fjords } from './looks/fjords.ts';
import { mistwood } from './looks/mistwood.ts';
import { spires } from './looks/spires.ts';
import { narrows } from './looks/narrows.ts';
import { basaltStacks } from './looks/basaltStacks.ts';
import { kelpShallows } from './looks/kelpShallows.ts';
import { blossomRun } from './looks/blossomRun.ts';
import { glassSea } from './looks/glassSea.ts';
import { jadeShoals } from './looks/jadeShoals.ts';
import { coralAtolls } from './looks/coralAtolls.ts';
import { spiceIsles } from './looks/spiceIsles.ts';
import { fireArchipelago } from './looks/fireArchipelago.ts';
import { weepingIsle } from './looks/weepingIsle.ts';
import { mangroveLabyrinth } from './looks/mangroveLabyrinth.ts';
import { maelstrom } from './looks/maelstrom.ts';

export type { BeaconLook } from './look.ts';

export const BEACON_LOOKS: Record<RegionId, BeaconLook> = {
  iceCrown, fjords, mistwood, spires, narrows, basaltStacks, kelpShallows, blossomRun,
  glassSea, jadeShoals, coralAtolls, spiceIsles, fireArchipelago, weepingIsle, mangroveLabyrinth, maelstrom,
};

/**
 * Stands a built beacon on the sphere: its base at `pos` (a unit vector from the planet's centre) times `radius`
 * plus `lift` metres, its +Y along the outward normal and its front (+Z) toward the unit tangent `facing`.
 */
export function placeBeacon(obj: THREE.Object3D, pos: THREE.Vector3Like, facing: THREE.Vector3Like, radius: number, lift = 0): void {
  const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
  const fwd = new THREE.Vector3(facing.x, facing.y, facing.z);
  fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
  obj.position.copy(up).multiplyScalar(radius + lift);
}

/** How bright a beacon's light is right now, 0..1 of full: for a point light that follows its pulse. */
export function beaconLight(obj: THREE.Object3D): number {
  return (obj.userData.beacon as BeaconState | undefined)?.light ?? 0;
}
