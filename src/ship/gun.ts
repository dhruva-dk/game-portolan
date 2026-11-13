// The gun: a bronze swivel gun (a verso) as a ship carries one on her plinth (mount.ts GUN_MOUNT) and as one floats as
// loot (loot/loot.ts), its one shape. A turned barrel, breech to muzzle: the cascabel's knob, the base ring, the
// reinforce, the chase and the swell of the muzzle, each ringed with a moulding; the trunnions across it in a forked
// yoke, the yoke on a short post that drops into the plinth; and the tiller at its breech the gun is laid by.
//
// Real metres, in the gun's own frame: the barrel along +z (the muzzle forward), +y up, its trunnions' axis along x
// through the origin, the post's foot at y = −FOOT. Built with the ship's kit (kit.ts), so it runs in node.

import { Acc, V, lathe, rod, beam, trs } from './kit.ts';

/** How far below the trunnions the post's foot stands, m; how long the barrel is, breech knob to muzzle. */
export const FOOT = 0.62, LENGTH = 1.62;

/** The barrel's profile: [radius, distance along it from the trunnions], breech to muzzle, m. */
const BARREL: [number, number][] = [
  [0, -0.64], [0.05, -0.63], [0.075, -0.6], [0.06, -0.56], [0.045, -0.54], // the cascabel's knob and its neck
  [0.12, -0.52], [0.15, -0.49], [0.15, -0.43], [0.135, -0.41], // the base ring
  [0.135, -0.12], [0.152, -0.1], [0.152, -0.05], [0.128, -0.03], // the reinforce and its ring
  [0.118, 0.58], [0.134, 0.6], [0.134, 0.64], [0.112, 0.66], // the chase, ringed
  [0.104, 0.84], [0.128, 0.9], [0.138, 0.96], [0.138, 0.98], // the muzzle's swell
  [0.072, 0.98], [0.072, 0.9], // and its bore
];

/** The gun drawn into `acc` with `sides` round its barrel. */
export function buildGun(acc: Acc, sides = 10): void {
  // the barrel: the lathe spins its profile round +y, turned here to run along +z
  lathe(acc, BARREL, sides, trs(V(), Math.PI / 2, 0, 0));
  // the trunnions through the yoke's forks
  rod(acc, V(-0.21, 0, 0), V(0.21, 0, 0), 0.042, 0.042, 6);
  // the yoke: two forks and the crosspiece under the barrel
  for (const x of [-0.19, 0.19]) beam(acc, V(x, 0.07, 0), V(x, -0.2, 0), 0.05, 0.1);
  beam(acc, V(-0.215, -0.22, 0), V(0.215, -0.22, 0), 0.06, 0.1, V(0, 1, 0));
  // the post down into the plinth
  rod(acc, V(0, -0.24, 0), V(0, -FOOT, 0), 0.05, 0.045, 6);
  // the tiller from the breech, back and a little down
  rod(acc, V(0, -0.02, -0.6), V(0, -0.16, -1.02), 0.024, 0.02, 5);
}

/** The gun as plain arrays: positions and normals (xyz each) and the triangles' indices. */
export function gunShape(sides = 10): { position: Float32Array; normal: Float32Array; index: Uint16Array } {
  const acc = new Acc();
  buildGun(acc, sides);
  return { position: new Float32Array(acc.p), normal: new Float32Array(acc.n), index: new Uint16Array(acc.i) };
}
