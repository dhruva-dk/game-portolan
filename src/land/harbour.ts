// The harbour's buildings (world/harbour.ts says where each stands): her
// team's headquarters on the shore she lies off, a modern campus (white
// cladding, standing-seam roofs, curtain walls, the team's colour in a stripe
// round each), built once of flat-sided solids and drawn as one mesh. The
// factory is the showpiece: its composites hall under a ribbed barrel roof, its
// office wing glazed full height, a timber hull half out of its doors on the
// cradle that runs her down the slipway, a car park, trees, flags and the
// team's pylon before it. Each other is the one thing that tells it from its
// neighbours: the design centre's three glazed floors, the tank's long basin
// and gantry, the composites plant's sawtooth and stack, the simulator's dome,
// the pit crew's hangar door, the scouting department's tower, the commercial
// centre's canopy, the hospitality suite's pavilion on the jetty. Each stands
// on a footing of concrete carried down into the ground, so a slope under it
// shows as a terrace's wall.
//
// Each face one tone in the sun and one out of it (palette.ts), lit like
// everything else (sky/light.ts), and casting on the land as the palms do
// (shadow.ts). Some 4,000 triangles, one draw.

import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshBasicNodeMaterial,
  Vector3,
} from 'three/webgpu';
import { attribute, normalWorld, positionWorld } from 'three/tsl';
import {
  ASPHALT,
  AWNING,
  CLADDING,
  CONCRETE,
  DECK,
  GLAZING,
  INTERIOR,
  IRON,
  LINE_PAINT,
  PALM_TRUNK,
  ROOF_METAL,
  SEA_MIDDLE,
  SEA_SHALLOW,
  SHRUB,
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
/** Still water: nearly the same in the sun and out of it. */
const WATER: Tones = { lit: SEA_SHALLOW, shadow: SEA_MIDDLE };
/** The team's colour, in the stripe round each building, its pylon, its flags. */
const ACCENT = AWNING;

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
  /** The footing under a building w by d: concrete, from its foot down, its top the building's apron. */
  const footing = (w: number, d: number, x = 0, z = 0) =>
    box(x, -DEEP, z, w, DEEP, d, CONCRETE);
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

/** A barrel roof over w (along x) by d, rising `rise` at its crown in `n` facets, its gables of `gable`; a rib of `rib` each `every` metres along it. */
function vault(
  s: Shaper,
  [x, y, z]: P,
  [w, d, rise]: readonly [number, number, number],
  n: number,
  t: Tones,
  gable: Tones,
  rib: Tones,
  every: number
) {
  const arc = (i: number, out = 0): [number, number] => {
    const u = i / n;
    return [
      z - d / 2 - out + (d + 2 * out) * u,
      y + (rise + out) * Math.sin(Math.PI * u),
    ];
  };
  const x0 = x - w / 2,
    x1 = x + w / 2,
    from: P = [x, y + rise / 3, z];
  for (let i = 0; i < n; i++) {
    const [za, ya] = arc(i),
      [zb, yb] = arc(i + 1);
    s.quad([x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za], t, from);
    s.tri([x0, y, z], [x0, ya, za], [x0, yb, zb], gable, from);
    s.tri([x1, y, z], [x1, ya, za], [x1, yb, zb], gable, from);
  }
  // (each rib a band standing a little proud of the roof)
  for (let rx = x0 + every / 2; rx < x1; rx += every)
    for (let i = 0; i < n; i++) {
      const [za, ya] = arc(i, 0.08),
        [zb, yb] = arc(i + 1, 0.08);
      s.quad(
        [rx - 0.1, ya, za],
        [rx - 0.1, yb, zb],
        [rx + 0.1, yb, zb],
        [rx + 0.1, ya, za],
        rib,
        from
      );
    }
}

/** A glazed wall w across and h high on the face z = zf (looking toward +z), its foot at y: the glass, a mullion each `bay` metres, and `rows` rows between transoms. */
function curtain(
  s: Shaper,
  x: number,
  y: number,
  zf: number,
  w: number,
  h: number,
  bay: number,
  rows: number
) {
  s.box(x, y, zf + 0.04, w, h, 0.08, GLAZING);
  const n = Math.max(1, Math.round(w / bay));
  for (let i = 0; i <= n; i++)
    s.box(x - w / 2 + (i * w) / n, y, zf + 0.11, 0.14, h, 0.1, IRON);
  for (let j = 0; j <= rows; j++)
    s.box(x, y + (j * h) / rows - 0.07, zf + 0.11, w, 0.14, 0.1, IRON);
}

/** A strip between (x0, y0, z0) and (x1, y1, z1), `lift` thick: a ramp's rail, a slope's kerb. */
const strip = (
  s: Shaper,
  [x0, y0, z0]: P,
  [x1, y1, z1]: P,
  lift: number,
  t: Tones
) =>
  s.slab(
    [
      [x0, y0, z0],
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y0, z0],
    ],
    [
      [x0, y0 + lift, z0],
      [x0, y1 + lift, z1],
      [x1, y1 + lift, z1],
      [x1, y0 + lift, z0],
    ],
    t
  );

/** A tree in a planter at (x, z): a stem and a round crown. */
function tree(s: Shaper, x: number, z: number, y = 0) {
  s.box(x, y, z, 1.5, 0.6, 1.5, CONCRETE);
  s.box(x, y + 0.6, z, 0.22, 1.5, 0.22, PALM_TRUNK);
  s.round(x, y + 1.7, z, 0.7, 1, 1.9, 7, SHRUB);
  s.round(x, y + 2.7, z, 1.33, 1.9, 0.12, 7, SHRUB);
}

/** A car parked at (x, z), nose toward +z, painted t. */
function car(s: Shaper, x: number, z: number, t: Tones) {
  s.box(x, 0, z, 1.5, 0.3, 3.4, INTERIOR);
  s.box(x, 0.3, z, 1.8, 0.55, 4.2, t);
  s.box(x, 0.85, z - 0.25, 1.6, 0.5, 2.2, GLAZING);
  s.box(x, 1.35, z - 0.25, 1.5, 0.06, 1.9, t);
}

/** A lamp standard at (x, z), its head reaching toward +x. */
function lamp(s: Shaper, x: number, z: number) {
  s.box(x, 0, z, 0.16, 4.6, 0.16, IRON);
  s.box(x + 0.45, 4.5, z, 1, 0.16, 0.34, IRON);
}

/** A flag of tone t on a pole h high at (x, z), flown toward +x. */
function flag(s: Shaper, x: number, z: number, h: number, t: Tones) {
  s.box(x, 0, z, 0.14, h, 0.14, ROOF_METAL);
  s.sheet(
    [x, h - 0.1, z],
    [x + 2.2, h - 0.25, z + 0.1],
    [x + 2.2, h - 1.45, z + 0.1],
    [x, h - 1.4, z],
    t
  );
}

/** Each building, built about its foot's middle; and how far it is turned from square to the shore, radians. */
const BUILT: Readonly<
  Record<Plot, { turn: number; build: (s: Shaper) => void }>
> = {
  // the composites hall under its ribbed barrel roof, its office wing glazed
  // full height, and a hull half out of its doors on the cradle that runs her
  // down the slipway to the sea; a car park, trees, flags and the team's pylon
  // before it
  factory: {
    turn: 0.06,
    build(s) {
      s.footing(26, 18, -0.5, 0.5);
      // the hall: its walls on a dark plinth, the team's stripe round it, the
      // roof and its skylight along the crown
      s.box(2, 0, -1.5, 16, 6, 11, CLADDING);
      s.box(2, 0, -1.5, 16.06, 0.7, 11.06, IRON);
      s.box(2, 4.6, -1.5, 16.06, 0.45, 11.06, ACCENT);
      vault(
        s,
        [2, 6, -1.5],
        [16.4, 11.4, 2.6],
        8,
        ROOF_METAL,
        CLADDING,
        IRON,
        2
      );
      s.box(2, 8.52, -1.5, 13, 0.2, 1.3, GLAZING);
      for (const x of [-2.5, 6.5])
        s.round(x, 8.1, -4.6, 0.45, 1.6, 1, 8, ROOF_METAL);
      // its face to the sea: a glazed bay and the great door, open
      curtain(s, -2.6, 0.7, 4, 5.8, 3.7, 1.45, 2);
      s.box(5, 0, 4.02, 7, 5.2, 0.08, INTERIOR);
      s.box(5, 5.2, 4.08, 7.6, 0.4, 0.22, IRON);
      for (const x of [1.35, 8.65]) s.box(x, 0, 4.08, 0.3, 5.2, 0.22, IRON);
      s.box(5, 5.62, 4.2, 7.4, 0.5, 0.4, ROOF_METAL);
      // the office wing: glazed full height across two floors, a floor's edge
      // across it, a dark coping, the plant on its roof, a cantilevered canopy
      s.box(-8.5, 0, 0, 7, 8.4, 9, CLADDING);
      curtain(s, -8.5, 0.3, 4.5, 6.2, 7.7, 1.25, 4);
      s.box(-8.5, 3.95, 4.7, 7, 0.4, 0.3, CLADDING);
      s.box(-8.5, 8.4, 0, 7.2, 0.5, 9.2, IRON);
      for (const y of [1, 4.8]) s.box(-12.03, y, 0, 0.08, 2.4, 7, GLAZING);
      s.box(-9.6, 8.9, -2, 3, 1.2, 2.6, ROOF_METAL);
      s.box(-6.8, 8.9, -2.6, 1.4, 0.9, 1.4, ROOF_METAL);
      s.box(-8.5, 3.3, 6.3, 5.2, 0.24, 3.6, CLADDING, true);
      // the team's pylon at the forecourt's corner, its mark on it
      s.box(-12.4, 0, 8.4, 2.4, 9.6, 0.6, ACCENT);
      s.box(-12.4, 6.2, 8.72, 1.4, 1.4, 0.06, CLADDING);
      s.box(-12.4, 1.2, 8.72, 1.7, 0.24, 0.06, CLADDING);
      // the hull, a timber ship's in the modern works, half out of the door
      // on her cradle; the rails it runs on, out and down the slipway
      s.slab(
        s.ring(5, 1.4, 4.6, 1.5, 7),
        s.ring(5, 3.1, 4.6, 2.9, 7.6),
        DECK,
        true
      );
      s.slab(
        [
          [4.25, 1.4, 8.1],
          [5, 1.9, 11],
          [5, 1.9, 11],
          [5.75, 1.4, 8.1],
        ],
        [
          [3.55, 3.1, 8.4],
          [5, 3.3, 11.6],
          [5, 3.3, 11.6],
          [6.45, 3.1, 8.4],
        ],
        DECK,
        true
      );
      s.box(5, 2.55, 4.6, 2.95, 0.22, 7.65, TAR);
      for (const z of [2.6, 5.2, 7.8]) {
        s.box(5, 0.1, z, 3.4, 0.3, 0.6, IRON);
        for (const x of [3.9, 6.1]) s.box(x, 0.4, z, 0.3, 1.1, 0.4, IRON);
      }
      s.slab(
        s.ring(5, -DEEP, 13, 6, 7),
        [
          [2, 0, 9.5],
          [2, -2.6, 16.5],
          [8, -2.6, 16.5],
          [8, 0, 9.5],
        ],
        CONCRETE
      );
      for (const x of [3.8, 6.2]) {
        s.box(x, 0, 4.5, 0.2, 0.1, 10, IRON);
        strip(s, [x - 0.1, 0, 9.5], [x + 0.1, -2.6, 16.5], 0.1, IRON);
      }
      // the car park before the glazed bay: its asphalt, its lines, two cars
      s.box(-1.9, 0, 7.3, 8, 0.03, 4.4, ASPHALT);
      for (const x of [-5.8, -3.2, -0.6, 2])
        s.box(x, 0.03, 7.3, 0.14, 0.02, 4, LINE_PAINT);
      car(s, -4.5, 7.2, CLADDING);
      car(s, 0.7, 7.4, ACCENT);
      // trees, lamps and flags round the forecourt
      for (const [x, z] of [
        [11.2, -6],
        [11.2, 0],
        [-12.6, -6.4],
      ] as const)
        tree(s, x, z);
      for (const x of [-6.2, 2.8]) lamp(s, x, 9.3);
      flag(s, 9.4, 8.8, 8, ACCENT);
      flag(s, 10.4, 8.8, 8, CLADDING);
      flag(s, 11.4, 8.8, 8, ACCENT);
    },
  },
  // a glass pavilion at the jetty's head under a floating roof, the jetty out
  // over the water
  hospitality: {
    turn: 0,
    build(s) {
      s.footing(9, 7, 0, -4);
      s.box(0, -0.5, 4, 6, 0.5, 18, DECK, true);
      for (const z of [-2, 3, 8, 12.5])
        for (const x of [-2.6, 2.6])
          s.box(x, -DEEP, z, 0.5, DEEP - 0.5, 0.5, IRON);
      for (const z of [2, 7, 12])
        for (const x of [-2.7, 2.7]) s.round(x, 0, z, 0.3, 0.9, 0.8, 6, IRON);
      s.box(0, 0, -4.4, 6, 3.2, 4.6, GLAZING);
      for (const [x, z] of [
        [-3.6, -7.3],
        [3.6, -7.3],
        [3.6, -1.5],
        [-3.6, -1.5],
      ] as const)
        s.box(x, 0, z, 0.2, 3.2, 0.2, IRON);
      s.box(0, 3.05, -4.4, 8.02, 0.14, 6.42, ACCENT);
      s.box(0, 3.2, -4.4, 8, 0.36, 6.4, CLADDING, true);
      flag(s, 0, -1, 7, ACCENT);
    },
  },
  // a hangar, its door open on a ramp to the water, spars racked by it
  pitCentre: {
    turn: -0.05,
    build(s) {
      s.footing(16, 14);
      s.box(-1, 0, -1, 10.5, 5.2, 10, CLADDING);
      s.box(-1, 0, -1, 10.56, 0.6, 10.06, IRON);
      s.box(-1, 3.9, -1, 10.56, 0.4, 10.06, ACCENT);
      s.box(-1, 5.2, -1, 10.7, 0.4, 10.2, ROOF_METAL);
      s.box(-1, 0, 4.02, 7, 4.2, 0.08, INTERIOR);
      s.box(-1, 4.2, 4.08, 7.5, 0.3, 0.2, IRON);
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
        CONCRETE
      );
      for (const [x, y] of [
        [5.4, 0],
        [6, 0],
        [5.7, 0.42],
      ] as const)
        s.box(x, y, 0, 0.4, 0.4, 9, DECK);
      s.box(5.7, 0, -4, 1.6, 1.2, 1.6, ROOF_METAL);
    },
  },
  // a shop under the team's canopy, glazed along its front, its name on the roof
  commercialCentre: {
    turn: 0.08,
    build(s) {
      s.footing(15, 11);
      s.box(0, 0, -1.5, 11, 3.8, 6, CLADDING);
      curtain(s, 0, 0.2, 1.5, 9, 3, 1.5, 1);
      s.box(0, 3.1, 2.7, 11.4, 0.25, 2.6, ACCENT, true);
      s.box(0, 3.8, 0.9, 5.4, 1, 0.3, ACCENT);
      s.box(0, 3.8, -1.5, 11.2, 0.3, 6.2, ROOF_METAL);
      for (const x of [-4, 4]) tree(s, x, 4.6);
    },
  },
  // a long low hall with a ribbon of glass, and the still basin before it a
  // hull is towed down under the carriage's gantry
  towingTank: {
    turn: 0,
    build(s) {
      s.footing(21, 14);
      s.box(0, 0, -3.8, 18, 3.8, 5, CLADDING);
      s.box(0, 0, -3.8, 18.06, 0.5, 5.06, IRON);
      s.box(0, 3.8, -3.8, 18.2, 0.35, 5.2, ROOF_METAL);
      s.box(0, 1.2, -1.24, 16, 1.4, 0.08, GLAZING);
      s.box(0, 0, 2.8, 18.6, 0.9, 6.4, CONCRETE);
      s.box(0, 0.9, 2.8, 17.2, 0.06, 5, WATER);
      for (const x of [-9, 9]) s.box(x, 0, 2.8, 0.36, 3.2, 0.36, IRON);
      s.box(0, 3.2, 2.8, 18.4, 0.36, 0.36, IRON);
      s.box(-3, 2.6, 2.8, 1.6, 0.6, 1.2, ACCENT);
      s.slab(
        s.ring(-3, 0.96, 2.8, 2.6, 0.7),
        s.ring(-3, 1.4, 2.8, 3.2, 1),
        DECK
      );
      s.box(-3, 1.4, 2.8, 0.1, 1.2, 0.1, IRON);
    },
  },
  // a white cube banded in dark glass, the simulator's dome on its roof
  simulator: {
    turn: -0.1,
    build(s) {
      s.footing(15, 12);
      s.box(-1.5, 0, -1, 8, 5.2, 7, CLADDING);
      s.box(-1.5, 2, -1, 8.06, 1.6, 7.06, GLAZING);
      s.box(-1.5, 4.5, -1, 8.06, 0.3, 7.06, ACCENT);
      s.round(-1.5, 5.2, -1, 2.4, 1.2, 0.72, 10, ROOF_METAL);
      s.round(-1.5, 6.4, -1, 1.73, 0.7, 0.3, 10, ROOF_METAL);
      s.box(-1.5, 0, 2.54, 1.6, 2, 0.08, INTERIOR);
      tree(s, 4.6, 2);
      tree(s, 4.6, -3);
    },
  },
  // a sawtooth hall, glass in each tooth's face, the extract's stack by it
  compositesPlant: {
    turn: 0.04,
    build(s) {
      s.footing(17, 13);
      s.box(-1.8, 0, 0, 11, 6, 9, CLADDING);
      s.box(-1.8, 0, 0, 11.06, 0.6, 9.06, IRON);
      s.box(-1.8, 4.9, 0, 11.06, 0.4, 9.06, ACCENT);
      for (let i = 0; i < 3; i++) {
        const w = 11 / 3,
          x = -1.8 - 11 / 2 + (i + 0.5) * w;
        s.slab(
          s.ring(x, 6, 0, w, 9),
          [
            [x - w / 2, 8.4, -4.5],
            [x - w / 2, 8.4, 4.5],
            [x + w / 2, 6.05, 4.5],
            [x + w / 2, 6.05, -4.5],
          ],
          ROOF_METAL
        );
        s.box(x - w / 2 - 0.03, 6.2, 0, 0.06, 2, 8.4, GLAZING);
      }
      s.box(-1.8, 0, 4.52, 4, 3.6, 0.08, INTERIOR);
      s.round(5.9, 0, -2, 1, 14, 0.8, 8, ROOF_METAL);
      s.round(5.9, 11.5, -2, 0.85, 0.8, 1, 8, ACCENT);
    },
  },
  // three floors glazed full height, a lower wing beside it, plant on its roof
  designCentre: {
    turn: -0.03,
    build(s) {
      s.footing(15, 12);
      s.box(-1, 0, 0, 9, 10.2, 8, CLADDING);
      curtain(s, -1, 0.4, 4, 8, 9.4, 1.33, 3);
      s.box(-1, 10.2, 0, 9.2, 0.5, 8.2, IRON);
      s.box(-2, 10.7, -1.5, 3, 1.2, 2.4, ROOF_METAL);
      s.box(5.4, 0, -0.6, 3.8, 4, 5.6, CLADDING);
      s.box(5.4, 1.2, 2.24, 3, 1.6, 0.08, GLAZING);
      s.box(5.4, 3.6, -0.6, 3.86, 0.4, 5.66, ACCENT);
    },
  },
  // a slender tower, a slot of glass up it, a glazed lookout and a mast on top
  scoutingCentre: {
    turn: 0.3,
    build(s) {
      s.footing(9, 9);
      s.box(0, 0, 0, 4, 14, 4, CLADDING);
      s.box(0, 1, 2.02, 1.1, 12, 0.08, GLAZING);
      s.box(0, 0, 2.02, 1.6, 2.4, 0.1, INTERIOR);
      s.box(0, 14, 0, 5.6, 2.6, 5.6, GLAZING);
      for (const [x, z] of [
        [-2.8, -2.8],
        [2.8, -2.8],
        [2.8, 2.8],
        [-2.8, 2.8],
      ] as const)
        s.box(x, 14, z, 0.18, 2.6, 0.18, IRON);
      s.box(0, 16.6, 0, 6.4, 0.36, 6.4, CLADDING, true);
      s.box(0, 16.4, 0, 6.42, 0.2, 6.42, ACCENT);
      s.box(0, 16.96, 0, 0.16, 4, 0.16, IRON);
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
