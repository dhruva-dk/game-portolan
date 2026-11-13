// The guns, a shape for each kind, as a ship carries one on her plinth (mount.ts GUN_MOUNT, ship/arms.ts) and as one
// floats as loot (loot/loot.ts). Each tells its kind at a glance, by its outline:
//   cannon    a bronze swivel gun (a verso): a turned barrel, breech knob to swelled muzzle, ringed with mouldings;
//   scatter   a short bronze blunderbuss, its mouth flared wide into a bell;
//   repeater  an organ gun: five slim iron barrels in a ring, bound by bands to a drum, a crank at its side;
//   harpoon   a bow-gun: an oak stock, a bow across its head drawn back by its cable, and the barbed bolt laid on it;
//   mortar    a squat bronze tube, as wide as it is long, cocked steeply up in an oak bed.
// Each sits in a forked yoke on its trunnions, the yoke on a short post that drops into the plinth.
//
// Real metres, in the gun's own frame: the barrel along +z (the muzzle forward), +y up, its trunnions' axis along x
// through the origin, the post's foot at y = −FOOT. Each vertex says what it is made of (METAL: bronze, oak or iron),
// for the shaders. Built with the ship's kit (kit.ts), so it runs in node.

import type { GunKind } from '../snapshot.ts';
import { Acc, V, beam, box, lathe, rod, trs } from './kit.ts';

/** How far below the trunnions the post's foot stands, m; how long the cannon's barrel is, breech knob to muzzle. */
export const FOOT = 0.62, LENGTH = 1.62;

/** How far along its bore from the trunnions each kind's mouth stands, m (the bolt's point, the mortar's lip): where
 *  its flash is drawn. */
export const MUZZLE: Record<GunKind, number> = { cannon: 0.98, scatter: 0.535, repeater: 0.9, harpoon: 1.2, mortar: 0.44 };

/** What a gun's part is made of. */
export const METAL = { bronze: 0, oak: 1, iron: 2 } as const;

/** The kinds, in sim/handling.ts KINDS's order. */
export const KINDS: readonly GunKind[] = ['cannon', 'scatter', 'repeater', 'harpoon', 'mortar'];

/** The cannon's barrel: [radius, distance along it from the trunnions], breech to muzzle, m. */
const BARREL: [number, number][] = [
  [0, -0.64], [0.05, -0.63], [0.075, -0.6], [0.06, -0.56], [0.045, -0.54], // the cascabel's knob and its neck
  [0.12, -0.52], [0.15, -0.49], [0.15, -0.43], [0.135, -0.41], // the base ring
  [0.135, -0.12], [0.152, -0.1], [0.152, -0.05], [0.128, -0.03], // the reinforce and its ring
  [0.118, 0.58], [0.134, 0.6], [0.134, 0.64], [0.112, 0.66], // the chase, ringed
  [0.104, 0.84], [0.128, 0.9], [0.138, 0.96], [0.138, 0.98], // the muzzle's swell
  [0.072, 0.98], [0.072, 0.9], // and its bore
];

/** The blunderbuss's: short, its mouth a bell. */
const BELL: [number, number][] = [
  [0, -0.5], [0.05, -0.49], [0.068, -0.46], [0.045, -0.42], // its knob
  [0.12, -0.4], [0.14, -0.37], [0.14, -0.31], [0.118, -0.29], // the base ring
  [0.105, 0.1], [0.112, 0.2], [0.13, 0.32], [0.17, 0.43], [0.225, 0.5], [0.245, 0.53], // flaring
  [0.205, 0.535], [0.17, 0.47], [0.1, 0.3], // and its throat
];

/** The mortar's: as wide as it is long, a ring at its middle and its lip. */
const TUBE: [number, number][] = [
  [0, -0.32], [0.16, -0.32], [0.22, -0.28], [0.24, -0.2], [0.24, 0.02], [0.27, 0.04], [0.27, 0.1], [0.235, 0.12],
  [0.215, 0.36], [0.255, 0.38], [0.255, 0.43], [0.19, 0.44], [0.17, 0.4], [0.17, 0.0], [0, 0.0],
];

/** The yoke on its post, the trunnions through its forks `half` m out. */
function yoke(acc: Acc, half = 0.19) {
  acc.with({ kind: METAL.iron }, () => {
    rod(acc, V(-half - 0.02, 0, 0), V(half + 0.02, 0, 0), 0.042, 0.042, 6);
    for (const x of [-half, half]) beam(acc, V(x, 0.07, 0), V(x, -0.2, 0), 0.05, 0.1);
    beam(acc, V(-half - 0.025, -0.22, 0), V(half + 0.025, -0.22, 0), 0.06, 0.1, V(0, 1, 0));
    rod(acc, V(0, -0.24, 0), V(0, -FOOT, 0), 0.05, 0.045, 6);
  });
}

/** A barrel's profile turned about +z (the lathe spins round +y), cocked `up` radians, at `at`. */
const barrel = (acc: Acc, profile: [number, number][], sides: number, up = 0, at = V()) => lathe(acc, profile, sides, trs(at, Math.PI / 2 - up, 0, 0));

const BUILD: Record<GunKind, (acc: Acc, sides: number) => void> = {
  cannon(acc, sides) {
    barrel(acc, BARREL, sides);
    yoke(acc);
    // the tiller from the breech, back and a little down
    acc.with({ kind: METAL.oak }, () => rod(acc, V(0, -0.02, -0.6), V(0, -0.16, -1.02), 0.024, 0.02, 5));
  },
  scatter(acc, sides) {
    barrel(acc, BELL, sides);
    yoke(acc);
    acc.with({ kind: METAL.oak }, () => rod(acc, V(0, -0.02, -0.46), V(0, -0.15, -0.86), 0.026, 0.022, 5));
  },
  repeater(acc, sides) {
    acc.with({ kind: METAL.iron }, () => {
      // five barrels in a ring, bound by three bands, into the drum
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * 2 * Math.PI, x = 0.1 * Math.cos(a), y = 0.1 * Math.sin(a);
        rod(acc, V(x, y, -0.22), V(x, y, 0.9), 0.036, 0.03, 6, true);
      }
      for (const z of [0.12, 0.5, 0.84]) barrel(acc, [[0.13, z - 0.03], [0.15, z - 0.02], [0.15, z + 0.02], [0.13, z + 0.03]], sides);
      // the crank at its starboard side
      rod(acc, V(-0.17, 0, -0.34), V(-0.3, 0, -0.34), 0.02, 0.02, 5);
      rod(acc, V(-0.3, 0, -0.34), V(-0.3, -0.16, -0.38), 0.018, 0.018, 5);
    });
    acc.with({ kind: METAL.bronze }, () => barrel(acc, [[0, -0.48], [0.15, -0.48], [0.17, -0.45], [0.17, -0.24], [0.15, -0.21], [0, -0.21]], sides));
    acc.with({ kind: METAL.oak }, () => rod(acc, V(-0.3, -0.16, -0.38), V(-0.3, -0.16, -0.48), 0.024, 0.024, 5));
    yoke(acc, 0.2);
  },
  harpoon(acc, sides) {
    acc.with({ kind: METAL.oak }, () => {
      // the stock, and the bow's arms swept back from its head
      beam(acc, V(0, 0, -0.75), V(0, 0, 0.62), 0.13, 0.12, V(0, 1, 0));
      for (const s of [-1, 1]) {
        rod(acc, V(0.05 * s, 0.03, 0.52), V(0.42 * s, 0.03, 0.44), 0.04, 0.032, 5);
        rod(acc, V(0.42 * s, 0.03, 0.44), V(0.74 * s, 0.03, 0.22), 0.032, 0.022, 5);
      }
      // the bolt laid in its groove
      rod(acc, V(0, 0.1, -0.3), V(0, 0.1, 0.92), 0.024, 0.024, 5);
    });
    acc.with({ kind: METAL.iron }, () => {
      // the cable drawn back to the nut
      for (const s of [-1, 1]) rod(acc, V(0.74 * s, 0.03, 0.22), V(0.02 * s, 0.08, -0.3), 0.009, 0.009, 3, false);
      box(acc, trs(V(0, 0.09, -0.32)), 0.12, 0.06, 0.08);
      // the bolt's head and its barbs
      lathe(acc, [[0, 0.88], [0.05, 0.9], [0.045, 1.0], [0, 1.2]], 6, trs(V(0, 0.1, 0), Math.PI / 2, 0, 0));
      for (const s of [-1, 1]) beam(acc, V(0, 0.1, 0.96), V(0.09 * s, 0.1, 0.88), 0.03, 0.012, V(0, 1, 0));
    });
    yoke(acc, 0.12);
  },
  mortar(acc, sides) {
    // cocked up steeply in its bed, the bed's cheeks either side on the trunnions
    barrel(acc, TUBE, sides + 2, 0.85, V(0, 0.04, 0.02));
    acc.with({ kind: METAL.oak }, () => {
      for (const x of [-0.31, 0.31]) box(acc, trs(V(x, -0.04, -0.02)), 0.08, 0.32, 0.6);
      box(acc, trs(V(0, -0.22, -0.02)), 0.7, 0.08, 0.64);
    });
    acc.with({ kind: METAL.iron }, () => rod(acc, V(-0.36, 0, 0), V(0.36, 0, 0), 0.045, 0.045, 6));
    acc.with({ kind: METAL.iron }, () => rod(acc, V(0, -0.26, 0), V(0, -FOOT, 0), 0.05, 0.045, 6));
  },
};

/** The gun of `kind` drawn into `acc` with `sides` round its barrel. */
export function buildGun(acc: Acc, kind: GunKind = 'cannon', sides = 10): void {
  acc.with({ kind: METAL.bronze }, () => BUILD[kind](acc, sides));
}

/** The gun of `kind` as plain arrays: positions and normals (xyz each), what each vertex is made of, and the
 *  triangles' indices. */
export function gunShape(kind: GunKind = 'cannon', sides = 10): { position: Float32Array; normal: Float32Array; metal: Float32Array; index: Uint16Array } {
  const acc = new Acc();
  buildGun(acc, kind, sides);
  const metal = new Float32Array(acc.count);
  for (let v = 0; v < acc.count; v++) metal[v] = acc.a[v * 6];
  return { position: new Float32Array(acc.p), normal: new Float32Array(acc.n), metal, index: new Uint16Array(acc.i) };
}
