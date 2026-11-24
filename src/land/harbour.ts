// The harbour's buildings (world/harbour.ts says where each stands): her
// team's headquarters on the shore she lies off, built once of flat-sided
// solids and drawn as one mesh. Each is the one thing that tells it from its
// neighbours: the factory's shed and the hull on its slip, the loft's great
// window, the tank's long basin, the foundry's stack, the school's dinghy, the
// pit house's boat door, the crow's nest's tower, the market's striped awning,
// the landing's jetty. Each stands on a footing of the quay's stone carried
// down into the ground, so a slope under it shows as a terrace's wall.
//
// Each face one tone in the sun and one out of it (palette.ts), lit like
// everything else (sky/light.ts), and casting on the land as the palms do
// (shadow.ts). Some 1,500 triangles, one draw.

import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshBasicNodeMaterial,
  Vector3,
} from 'three/webgpu';
import { attribute, normalWorld, positionWorld } from 'three/tsl';
import {
  AWNING,
  BRICK,
  CANVAS,
  DECK,
  FIRE,
  GLASS,
  IRON,
  PLASTER,
  QUAY,
  ROOF_TILE,
  SEA_MIDDLE,
  SEA_SHALLOW,
  TAR,
  TIMBER,
  type Tones,
} from '../palette.ts';
import type { Light } from '../sky/light.ts';
import { PLOTS, type Harbour, type Plot } from '../world/harbour.ts';
import { createInstances, standing, type Instances } from './site.ts';

/** A point of a building, metres: x along the shore, y up from its foot, z toward the sea. */
type P = readonly [number, number, number];
/** Four points round a level or a slope, anticlockwise seen from above. */
type Ring = readonly [P, P, P, P];

/** How far under its foot a building's footing goes, metres. */
const DEEP = 9;
/** The buildings are drawn this many times their measures here. */
const LARGER = 1.25;
/** A fire's glow, and still water: the same in the sun and out of it, or nearly. */
const GLOW: Tones = { lit: FIRE, shadow: FIRE },
  WATER: Tones = { lit: SEA_SHALLOW, shadow: SEA_MIDDLE };

/** What the buildings are built with: solids added to one mesh's triangles, each through the matrix last set. */
function createShaper() {
  const position: number[] = [],
    normal: number[] = [],
    lit: number[] = [],
    shade: number[] = [];
  const matrix = new Matrix4(),
    a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    n = new Vector3(),
    e = new Vector3();

  /** A triangle of tone t, faced away from `from` (a point inside the solid it is a side of), or as it is wound. */
  function tri(p: P, q: P, r: P, t: Tones, from?: P) {
    a.set(...p);
    b.set(...q);
    c.set(...r);
    n.copy(b).sub(a).cross(e.copy(c).sub(a));
    if (n.lengthSq() < 1e-12) return;
    if (from && n.dot(e.set(...from).sub(a)) > 0) {
      n.negate();
      e.copy(b);
      b.copy(c);
      c.copy(e);
    }
    n.transformDirection(matrix);
    for (const v of [a, b, c]) {
      v.applyMatrix4(matrix);
      position.push(v.x, v.y, v.z);
      normal.push(n.x, n.y, n.z);
      lit.push(...t.lit);
      shade.push(...t.shadow);
    }
  }
  const quad = (p: P, q: P, r: P, s: P, t: Tones, from?: P) => {
    tri(p, q, r, t, from);
    tri(p, r, s, t, from);
  };
  /** A thin thing seen from both sides: canvas, a pennant. */
  const sheet = (p: P, q: P, r: P, s: P | null, t: Tones) => {
    if (s) {
      quad(p, q, r, s, t);
      quad(s, r, q, p, t);
    } else {
      tri(p, q, r, t);
      tri(r, q, p, t);
    }
  };
  const middle = (...of: readonly P[]): P => [
    of.reduce((m, p) => m + p[0], 0) / of.length,
    of.reduce((m, p) => m + p[1], 0) / of.length,
    of.reduce((m, p) => m + p[2], 0) / of.length,
  ];
  /** The solid between two rings: its four sides, its top, and its underside if `under`. */
  function slab(low: Ring, high: Ring, t: Tones, under = false) {
    const from = middle(...low, ...high);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(low[i], low[j], high[j], high[i], t, from);
    }
    quad(high[0], high[1], high[2], high[3], t, from);
    if (under) quad(low[0], low[1], low[2], low[3], t, from);
  }
  const ring = (
    x: number,
    y: number,
    z: number,
    w: number,
    d: number
  ): Ring => [
    [x - w / 2, y, z - d / 2],
    [x - w / 2, y, z + d / 2],
    [x + w / 2, y, z + d / 2],
    [x + w / 2, y, z - d / 2],
  ];
  /** A box w across, h high and d deep, its foot's middle at (x, y, z). */
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    t: Tones,
    under = false
  ) => slab(ring(x, y, z, w, d), ring(x, y + h, z, w, d), t, under);
  /** A box whose top narrows to `k` of its foot: a tower, a stack, a heap. */
  const taper = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    k: number,
    t: Tones
  ) => slab(ring(x, y, z, w, d), ring(x, y + h, z, w * k, d * k), t);
  /**
   * A pitched roof over w by d, its ridge h up and running along x or z; the
   * gables under it of tone `gable`.
   */
  function roof(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    along: 'x' | 'z',
    t: Tones,
    gable: Tones
  ) {
    const [e0, e1, e2, e3] = ring(x, y, z, w, d),
      from: P = [x, y + h / 4, z];
    if (along === 'x') {
      const r0: P = [x - w / 2, y + h, z],
        r1: P = [x + w / 2, y + h, z];
      quad(e1, e2, r1, r0, t, from);
      quad(e3, e0, r0, r1, t, from);
      tri(e0, e1, r0, gable, from);
      tri(e2, e3, r1, gable, from);
    } else {
      const r0: P = [x, y + h, z - d / 2],
        r1: P = [x, y + h, z + d / 2];
      quad(e0, e1, r1, r0, t, from);
      quad(e2, e3, r0, r1, t, from);
      tri(e3, e0, r0, gable, from);
      tri(e1, e2, r1, gable, from);
    }
    quad(e0, e1, e2, e3, gable, [x, y + h, z]);
  }
  /** A roof to a point over w by d. */
  function spire(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    t: Tones
  ) {
    const r = ring(x, y, z, w, d),
      top: P = [x, y + h, z],
      from: P = [x, y + h / 4, z];
    for (let i = 0; i < 4; i++) tri(r[i], r[(i + 1) % 4], top, t, from);
    quad(r[0], r[1], r[2], r[3], t, [x, y + h, z]);
  }
  /** A round of `sides` sides: r at its foot, r·k at its top. */
  function round(
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    k: number,
    sides: number,
    t: Tones
  ) {
    const from: P = [x, y + h / 2, z],
      at = (i: number, up: number, by: number): P => [
        x + Math.cos((i / sides) * 2 * Math.PI) * r * by,
        y + up,
        z + Math.sin((i / sides) * 2 * Math.PI) * r * by,
      ];
    for (let i = 0; i < sides; i++) {
      quad(at(i, 0, 1), at(i + 1, 0, 1), at(i + 1, h, k), at(i, h, k), t, from);
      tri(at(i, h, k), at(i + 1, h, k), [x, y + h, z], t, from);
    }
  }
  /** The footing under a building w by d: the quay's stone, from its foot down. */
  const footing = (w: number, d: number, x = 0, z = 0) =>
    box(x, -DEEP, z, w, DEEP, d, QUAY);
  /** A pole h high at (x, z), and a pennant flown from its head toward +x. */
  function pennant(x: number, y: number, z: number, h: number) {
    box(x, y, z, 0.22, h, 0.22, TIMBER);
    sheet(
      [x, y + h, z],
      [x + 3, y + h - 0.6, z],
      [x, y + h - 1.2, z],
      null,
      AWNING
    );
  }

  return {
    /** What follows is built through `m`. */
    at(m: Matrix4) {
      matrix.copy(m);
    },
    tri,
    quad,
    sheet,
    slab,
    ring,
    box,
    taper,
    roof,
    spire,
    round,
    footing,
    pennant,
    geometry() {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(position, 3));
      g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
      g.setAttribute('lit', new Float32BufferAttribute(lit, 3));
      g.setAttribute('shade', new Float32BufferAttribute(shade, 3));
      g.computeBoundingSphere();
      return g;
    },
  };
}
type Shaper = ReturnType<typeof createShaper>;

/** Each building, built about its foot's middle; and how far it is turned from square to the shore, radians. */
const BUILT: Readonly<
  Record<Plot, { turn: number; build: (s: Shaper) => void }>
> = {
  // a shed with its doors open on the sea, and a hull on the slip beside it
  factory: {
    turn: 0.06,
    build(s) {
      s.footing(21, 15);
      s.box(-3.5, 0, -1, 11, 5.6, 10, TIMBER);
      s.roof(-3.5, 5.6, -1, 12.4, 3.6, 11.4, 'z', TAR, TIMBER);
      s.box(-3.5, 0, 4.02, 5.6, 4.2, 0.12, TAR);
      s.box(-3.5, 6.2, 4.02, 1.6, 1.3, 0.12, GLASS);
      // the slip, falling to the sea, and the hull's cradle on it
      s.slab(
        s.ring(6.2, 0, 1.5, 5.4, 11),
        s.ring(6.2, 0.9, 1.5, 5.4, 11),
        QUAY
      );
      for (const z of [-2, 1, 4]) s.box(6.2, 0.9, z, 3.6, 0.5, 0.5, TIMBER);
      // her hull: the run of it, and the bow drawn in
      s.slab(
        s.ring(6.2, 1.4, 0, 1.5, 7),
        s.ring(6.2, 3.1, 0, 2.9, 7.6),
        DECK,
        true
      );
      s.slab(
        [
          [5.45, 1.4, 3.5],
          [6.2, 1.9, 6.4],
          [6.2, 1.9, 6.4],
          [6.95, 1.4, 3.5],
        ],
        [
          [4.75, 3.1, 3.8],
          [6.2, 3.3, 7],
          [6.2, 3.3, 7],
          [7.65, 3.1, 3.8],
        ],
        DECK,
        true
      );
      for (const z of [-3, -1.5, 0, 1.5, 3])
        s.box(6.2, 3.1, z, 3, 0.16, 0.24, TIMBER);
    },
  },
  // a jetty out over the water, a pavilion at its head
  hospitality: {
    turn: 0,
    build(s) {
      s.footing(9, 7, 0, -4);
      s.box(0, -0.5, 4, 6, 0.5, 18, DECK, true);
      for (const z of [-2, 3, 8, 12.5])
        for (const x of [-2.6, 2.6])
          s.box(x, -DEEP, z, 0.5, DEEP - 0.5, 0.5, TAR);
      for (const z of [2, 7, 12])
        for (const x of [-2.7, 2.7]) s.round(x, 0, z, 0.3, 0.9, 0.8, 6, IRON);
      s.box(0, 0, -4.4, 6, 3.3, 4.6, PLASTER);
      s.spire(0, 3.3, -4.4, 7.4, 2.6, 6, ROOF_TILE);
      s.box(0, 0, -2.08, 1.5, 2.3, 0.12, TIMBER);
      s.box(-2, 1.2, -2.08, 1, 1.1, 0.12, GLASS);
      s.box(2, 1.2, -2.08, 1, 1.1, 0.12, GLASS);
      s.pennant(0, 5.9, -4.4, 4);
      // what was landed: a crate or two
      s.box(-1.8, 0, 9, 1.2, 1, 1.2, TIMBER);
      s.box(-1.5, 0, 10.5, 0.9, 0.8, 0.9, DECK);
    },
  },
  // a boathouse, its door open on a ramp to the water, spars stacked by it
  pitCentre: {
    turn: -0.05,
    build(s) {
      s.footing(16, 14);
      s.box(-1, 0, -1, 10.5, 4.6, 10, PLASTER);
      s.roof(-1, 4.6, -1, 12, 4, 11.4, 'z', ROOF_TILE, PLASTER);
      s.box(-1, 0, 4.02, 6.4, 3.6, 0.12, TAR);
      s.box(-1, 5.6, 4.02, 1.4, 1.4, 0.12, GLASS);
      s.slab(
        [
          [-4.2, -0.6, 4],
          [-4.2, -0.6, 7],
          [2.2, -0.6, 7],
          [2.2, -0.6, 4],
        ],
        [
          [-4.2, 0.02, 4],
          [-4.2, -0.5, 7],
          [2.2, -0.5, 7],
          [2.2, 0.02, 4],
        ],
        QUAY
      );
      for (const [x, y] of [
        [5.4, 0],
        [6, 0],
        [5.7, 0.42],
      ] as const)
        s.box(x, y, 0, 0.4, 0.4, 9, DECK);
      s.box(5.7, 0, -4, 1.6, 1.2, 1.6, TIMBER);
    },
  },
  // a stall under a striped awning, the catch laid out on its counter
  commercialCentre: {
    turn: 0.08,
    build(s) {
      s.footing(15, 11);
      s.box(0, 0, -3.4, 11, 3.2, 0.5, PLASTER);
      for (const x of [-5.2, 5.2]) {
        s.box(x, 0, 3.4, 0.3, 3.1, 0.3, TIMBER);
        s.box(x, 0, -3, 0.3, 4.2, 0.3, TIMBER);
      }
      for (let i = 0; i < 7; i++) {
        const x0 = -5.6 + i * 1.6,
          x1 = x0 + 1.6;
        s.sheet(
          [x0, 4.3, -3.4],
          [x0, 3.1, 3.9],
          [x1, 3.1, 3.9],
          [x1, 4.3, -3.4],
          i % 2 ? CANVAS : AWNING
        );
      }
      s.box(0, 0, 2, 9, 1, 1.5, TIMBER);
      s.box(0, 1, 2, 9.3, 0.12, 1.8, DECK);
      for (const x of [-3.2, -1, 1.2, 3.3])
        s.box(x, 1.12, 2, 1.3, 0.22, 1, { lit: SEA_SHALLOW, shadow: IRON.lit });
      for (const x of [-4, -2.9]) s.round(x, 0, -1.6, 0.6, 1.3, 0.9, 8, TIMBER);
      s.box(3.6, 0, -1.6, 1.4, 0.9, 1.4, DECK);
      s.box(3.8, 0.9, -1.6, 1, 0.7, 1, DECK);
    },
  },
  // a long low shed, and the still basin before it a hull is towed down
  towingTank: {
    turn: 0,
    build(s) {
      s.footing(21, 14);
      s.box(0, 0, -3.8, 18, 3.4, 5, PLASTER);
      s.roof(0, 3.4, -3.8, 19.2, 2.2, 6.2, 'x', ROOF_TILE, PLASTER);
      for (const x of [-6.6, -3.3, 0, 3.3, 6.6])
        s.box(x, 0.9, -1.28, 1.5, 1.7, 0.12, GLASS);
      s.box(0, 0, 2.8, 18.6, 0.9, 6.4, QUAY);
      s.box(0, 0.9, 2.8, 17.2, 0.06, 5, WATER);
      // the gantry she is towed under, and the model in the water
      for (const x of [-9, 9]) s.box(x, 0, 2.8, 0.36, 3.2, 0.36, TIMBER);
      s.box(0, 3.2, 2.8, 18.4, 0.36, 0.36, TIMBER);
      s.slab(
        s.ring(-3, 0.96, 2.8, 2.6, 0.7),
        s.ring(-3, 1.4, 2.8, 3.2, 1),
        DECK
      );
      s.box(-3, 1.4, 2.8, 0.1, 1.8, 0.1, TAR);
    },
  },
  // a small house under its pennant, a dinghy for the learning drawn up by it
  simulator: {
    turn: -0.1,
    build(s) {
      s.footing(15, 12);
      s.box(-2.8, 0, -1, 7.4, 4, 6.6, PLASTER);
      s.roof(-2.8, 4, -1, 8.6, 2.8, 7.8, 'x', ROOF_TILE, PLASTER);
      s.box(-2.8, 0, 2.32, 1.5, 2.4, 0.12, TIMBER);
      s.box(-5, 1.3, 2.32, 1.1, 1.2, 0.12, GLASS);
      s.box(-0.6, 1.3, 2.32, 1.1, 1.2, 0.12, GLASS);
      s.pennant(-2.8, 6.8, -1, 4.2);
      // the dinghy on her chocks, her sail set to dry
      s.slab(
        s.ring(4.2, 0.3, 1, 1, 4.4),
        s.ring(4.2, 1.1, 1, 1.9, 5.2),
        DECK,
        true
      );
      s.box(4.2, 1.1, 1.8, 0.14, 6.2, 0.14, TIMBER);
      s.sheet([4.2, 7, 1.8], [4.2, 1.9, 1.8], [4.2, 1.9, -1.8], null, CANVAS);
      s.box(4.2, 0, 2.6, 1.6, 0.3, 0.3, TIMBER);
      s.box(4.2, 0, -0.6, 1.6, 0.3, 0.3, TIMBER);
    },
  },
  // a saw-toothed roof, a stack, the fire in its door
  compositesPlant: {
    turn: 0.04,
    build(s) {
      s.footing(17, 13);
      s.box(-1.8, 0, 0, 11, 6, 9, BRICK);
      for (let i = 0; i < 3; i++) {
        const x = -1.8 - 11 / 2 + (i + 0.5) * (11 / 3),
          w = 11 / 3;
        s.slab(
          s.ring(x, 6, 0, w, 9),
          [
            [x - w / 2, 8.4, -4.5],
            [x - w / 2, 8.4, 4.5],
            [x + w / 2, 6.05, 4.5],
            [x + w / 2, 6.05, -4.5],
          ],
          TAR
        );
      }
      s.box(-1.8, 0, 4.52, 3, 3, 0.12, GLOW);
      s.box(-1.8, 3, 4.52, 3.6, 0.4, 0.2, IRON);
      for (const x of [-5.6, 2]) s.box(x, 2.4, 4.52, 1.2, 1.6, 0.12, GLASS);
      s.taper(5.9, 0, -2, 2.6, 16, 2.6, 0.62, BRICK);
      s.box(5.9, 16, -2, 2, 0.6, 2, IRON);
      s.taper(6, 0, 3.4, 3.4, 1.7, 3.4, 0.25, TAR);
    },
  },
  // a tall house, a great window in its gable for the light
  designCentre: {
    turn: -0.03,
    build(s) {
      s.footing(14, 12);
      s.box(-1, 0, 0, 8, 8.4, 8, PLASTER);
      s.roof(-1, 8.4, 0, 9.2, 5, 9.2, 'z', ROOF_TILE, PLASTER);
      s.box(-1, 3.8, 4.02, 3.6, 3.8, 0.12, GLASS);
      s.box(-1, 9.6, 4.02, 1.5, 1.5, 0.12, GLASS);
      s.box(-1, 0, 4.02, 1.6, 2.6, 0.12, TIMBER);
      for (const x of [-3.6, 1.6]) s.box(x, 1.2, 4.02, 1, 1.4, 0.12, GLASS);
      s.box(4.9, 0, -0.6, 3.8, 3.8, 5.6, PLASTER);
      s.slab(
        s.ring(4.9, 3.8, -0.6, 4.4, 6.2),
        [
          [2.7, 5.6, -3.7],
          [2.7, 5.6, 2.5],
          [7.1, 3.85, 2.5],
          [7.1, 3.85, -3.7],
        ],
        ROOF_TILE
      );
      s.box(-3.2, 9.4, -2, 1, 4.4, 1, BRICK);
    },
  },
  // a watch tower, its gallery and its pennant
  scoutingCentre: {
    turn: 0.3,
    build(s) {
      s.footing(9, 9);
      s.taper(0, 0, 0, 5.2, 14, 5.2, 0.66, QUAY);
      s.box(0, 0, 2.62, 1.3, 2.4, 0.12, TIMBER);
      for (const y of [5, 9.5]) s.box(0, y, 2.2, 0.7, 1.1, 0.5, GLASS);
      s.box(0, 14, 0, 6.4, 0.4, 6.4, TIMBER, true);
      for (const [x, z] of [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
      ] as const)
        s.box(x, 14.4, z, 0.2, 1.2, 0.2, TIMBER);
      for (const z of [-3, 3]) s.box(0, 15.5, z, 6.2, 0.14, 0.14, TIMBER);
      for (const x of [-3, 3]) s.box(x, 15.5, 0, 0.14, 0.14, 6.2, TIMBER);
      s.box(0, 14.4, 0, 3, 2.6, 3, PLASTER);
      s.spire(0, 17, 0, 4.4, 2.6, 4.4, ROOF_TILE);
      s.pennant(0, 19.6, 0, 4.6);
    },
  },
};

const local = new Matrix4(),
  turned = new Matrix4();

/** The harbour `h`, lit by `light`: its one mesh, as a thing that stands on the land (site.ts), drawn and casting. */
export function createHarbour(h: Harbour, light: Light): Instances {
  const s = createShaper();
  for (const id of PLOTS) {
    const { x, z, foot } = h.plots[id],
      { turn, build } = BUILT[id];
    local
      .makeScale(LARGER, LARGER, LARGER)
      .multiply(turned.makeRotationY(turn));
    s.at(standing(h.chart, x, foot, z, local, new Matrix4()));
    build(s);
  }
  const material = new MeshBasicNodeMaterial();
  material.colorNode = light.toon(
    positionWorld,
    normalWorld,
    attribute('lit', 'vec3'),
    attribute('shade', 'vec3')
  );
  // (its triangles are the world's own: it is its one instance, where it lies)
  const made = createInstances('harbour', s.geometry(), material, [
    [{ matrix: new Matrix4() }],
  ]);
  made.show([0], 0, 1);
  made.cast([0], 0, 1);
  return made;
}
