// The harbour's buildings (world/harbour.ts says where each stands): her
// team's headquarters on the shore she lies off, a modern campus on one level
// terrace, built once of flat-sided solids and drawn as one mesh. The terrace
// (laid in tiles, each square to the planet where it lies, so the whole of it
// keeps its height over the curving sea): its lawn mown in stripes, the
// avenues and streets between the rows, the promenade along its quay, the
// hedge round it with its gates, and its walls down to the ground. On it,
// square to the shore and each on its paved apron, the nine buildings, near
// white with charcoal roofs, dark glass and the team's colour in a stripe. The
// factory is the showpiece: its composites hall under a ribbed barrel roof, its
// great door open on the lit works, its office wing glazed full height, the
// team's mark on a totem by its door, and the slipway from the door over the
// quay into the sea. Each other is the one thing that tells it from its
// neighbours: the design centre's three glazed floors, the tank's long basin,
// the composites plant's sawtooth, the simulator's dome, the pit crew's hangar
// and its slipway, the scouting department's tower, the commercial centre's
// canopy, the hospitality suite's pavilion and its jetty out over the water.
//
// Each face one tone in the sun and one out of it (palette.ts), lit like
// everything else (sky/light.ts), and casting on the land as the palms do
// (shadow.ts). Some 6,000 triangles, one draw.

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
  HEDGE,
  INTERIOR,
  IRON,
  LAWN,
  LAWN_MOWN,
  PAVING,
  ROOF_METAL,
  SEA_MIDDLE,
  SEA_SHALLOW,
  WORKSHOP,
  type Tones,
} from '../palette.ts';
import type { Light } from '../sky/light.ts';
import { fromChart, place } from '../world/sphere.ts';
import {
  PLACES,
  PLOTS,
  SITE,
  type Harbour,
  type Plot,
} from '../world/harbour.ts';
import { createInstances, standing, type Instances } from './site.ts';

/** A point of a building, metres: x along the shore, y up from its foot, z toward the sea. */
type P = readonly [number, number, number];
/** Four points round a level or a slope, anticlockwise seen from above. */
type Ring = readonly [P, P, P, P];

/** The buildings are drawn this many times their measures here. */
const LARGER = 1.25;
/** Still water: nearly the same in the sun and out of it. */
const WATER: Tones = { lit: SEA_SHALLOW, shadow: SEA_MIDDLE };
/** The team's colour, in the stripe round each building, its totem, its canopies. */
const ACCENT = AWNING;
/**
 * The terrace: laid in tiles `tile` metres square; its promenade `quay` deep
 * along the quay; its hedge `hedge` across and high; a building's apron `apron`
 * deep under its foot (down past the sphere's fall under its corners).
 */
const TERRACE = { tile: 4, quay: 4, hedge: [1.2, 1.1], apron: 0.8 } as const;

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
  /** A building's apron, w by d about (x, z): paving, its top a little over the terrace, down past the sphere's fall. */
  const apron = (w: number, d: number, x = 0, z = 0) =>
    box(x, -TERRACE.apron, z, w, TERRACE.apron + 0.04, d, PAVING);

  return {
    /** What follows is built through `m`. */
    at(m: Matrix4) {
      matrix.copy(m);
    },
    tri,
    quad,
    slab,
    ring,
    box,
    round,
    apron,
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

/** A glazed wall w across and h high on the face z = zf (looking toward +z), its foot at y: dark glass, a light mullion each `bay` metres, and `rows` rows between transoms. */
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
    s.box(x - w / 2 + (i * w) / n, y, zf + 0.1, 0.1, h, 0.08, CLADDING);
  for (let j = 0; j <= rows; j++)
    s.box(x, y + (j * h) / rows - 0.05, zf + 0.1, w, 0.1, 0.08, CLADDING);
}

/**
 * A slipway w across at x: paved from its door at z0 to the quay at zq, a rail
 * each side of it, then down past the quay's edge `down` metres into the sea.
 */
function slipway(
  s: Shaper,
  x: number,
  w: number,
  [z0, zq]: readonly [number, number],
  down: number
) {
  s.box(x, 0, (z0 + zq) / 2, w, 0.06, zq - z0, CONCRETE);
  s.slab(
    s.ring(x, -down - 1, zq + down, w, 2 * down),
    [
      [x - w / 2, 0.06, zq],
      [x - w / 2, -down, zq + 2 * down],
      [x + w / 2, -down, zq + 2 * down],
      [x + w / 2, 0.06, zq],
    ],
    CONCRETE
  );
  for (const r of [x - w / 3, x + w / 3])
    s.box(r, 0.06, (z0 + zq) / 2, 0.16, 0.08, zq - z0, IRON);
}

/** Where the quay is in a waterside building's own measures, standing at chart z: its distance toward the sea. */
const quayFrom = (z: number) => (SITE.z[1] - z) / LARGER;

/**
 * Each building, built about its foot's middle on the terrace; `down` the
 * metres (in its own measures) from the terrace to under the sea.
 */
const BUILT: Readonly<Record<Plot, (s: Shaper, down: number) => void>> = {
  // the composites hall under its ribbed barrel roof, its great door open on
  // the lit works within, its office wing glazed full height, the team's mark
  // on a totem by the door, and the slipway from the door over the quay
  factory(s, down) {
    s.apron(27, 17, -1, -1);
    // the hall: its walls on a dark plinth, the team's stripe round it, the
    // roof and its skylight along the crown
    s.box(2, 0, -1.5, 16, 6, 11, CLADDING);
    s.box(2, 0, -1.5, 16.06, 0.5, 11.06, ROOF_METAL);
    s.box(2, 4.6, -1.5, 16.06, 0.45, 11.06, ACCENT);
    vault(
      s,
      [2, 6, -1.5],
      [16.4, 11.4, 2.6],
      8,
      ROOF_METAL,
      CLADDING,
      CLADDING,
      2
    );
    s.box(2, 8.52, -1.5, 13, 0.2, 1.3, GLAZING);
    // its face to the sea: a glazed bay and the great door, open on the lit
    // works, a frame round it and a canopy over it
    curtain(s, -2.6, 0.5, 4, 5.8, 3.8, 1.45, 2);
    s.box(5, 0, 3.6, 7, 5.2, 0.08, WORKSHOP);
    s.box(5, 0, 3.6, 7, 0.06, 0.9, WORKSHOP);
    s.box(5, 5.2, 4.08, 7.6, 0.4, 0.22, ROOF_METAL);
    for (const x of [1.35, 8.65]) s.box(x, 0, 4.08, 0.3, 5.2, 0.22, ROOF_METAL);
    s.box(5, 5.62, 4.6, 8, 0.3, 1.4, ACCENT, true);
    // the office wing: glazed full height across two floors, a floor's edge
    // across it, a dark coping, the plant on its roof, a cantilevered canopy
    s.box(-8.5, 0, 0, 7, 8.4, 9, CLADDING);
    curtain(s, -8.5, 0.3, 4.5, 6.2, 7.7, 1.25, 4);
    s.box(-8.5, 3.95, 4.7, 7, 0.3, 0.3, CLADDING);
    s.box(-8.5, 8.4, 0, 7.2, 0.5, 9.2, ROOF_METAL);
    for (const y of [1, 4.8]) s.box(-12.03, y, 0, 0.08, 2.4, 7, GLAZING);
    s.box(-9.6, 8.9, -2, 3, 1.2, 2.6, CONCRETE);
    s.box(-8.5, 3.3, 6.3, 5.2, 0.24, 3.6, CLADDING, true);
    // the team's totem by the door, its mark on it
    s.box(10.2, 0, 5.6, 1.2, 4, 0.5, ACCENT);
    s.box(10.2, 2.6, 5.86, 0.7, 0.7, 0.04, CLADDING);
    slipway(s, 5, 5, [4, quayFrom(PLACES.factory[1])], down);
  },
  // a glass pavilion by the quay under a floating roof, the jetty out over the
  // water
  hospitality(s, down) {
    s.apron(11, 9, 0, -4.4);
    s.box(0, -0.3, 11, 4.4, 0.34, 22, DECK, true);
    for (let z = 2; z <= 22; z += 5)
      for (const x of [-1.9, 1.9])
        s.box(x, -down, z, 0.4, down - 0.3, 0.4, ROOF_METAL);
    s.box(0, 0, -4.4, 6, 3.2, 4.6, GLAZING);
    for (const [x, z] of [
      [-3.6, -7.3],
      [3.6, -7.3],
      [3.6, -1.5],
      [-3.6, -1.5],
    ] as const)
      s.box(x, 0, z, 0.2, 3.2, 0.2, CLADDING);
    s.box(0, 3.05, -4.4, 8.02, 0.14, 6.42, ACCENT);
    s.box(0, 3.2, -4.4, 8, 0.36, 6.4, CLADDING, true);
  },
  // a hangar, its door open on its slipway to the water
  pitCentre(s, down) {
    s.apron(14, 13, -1, -1);
    s.box(-1, 0, -1, 10.5, 5.2, 10, CLADDING);
    s.box(-1, 0, -1, 10.56, 0.5, 10.06, ROOF_METAL);
    s.box(-1, 3.9, -1, 10.56, 0.4, 10.06, ACCENT);
    s.box(-1, 5.2, -1, 10.7, 0.4, 10.2, ROOF_METAL);
    s.box(-1, 0, 4.02, 7, 4.2, 0.08, INTERIOR);
    s.box(-1, 4.2, 4.08, 7.5, 0.3, 0.2, ROOF_METAL);
    slipway(s, -1, 6, [4, quayFrom(PLACES.pitCentre[1])], down);
  },
  // a shop under the team's canopy, glazed along its front, its name on the roof
  commercialCentre(s) {
    s.apron(14, 10, 0, 0);
    s.box(0, 0, -1.5, 11, 3.8, 6, CLADDING);
    curtain(s, 0, 0.2, 1.5, 9, 3, 1.5, 1);
    s.box(0, 3.1, 2.7, 11.4, 0.25, 2.6, ACCENT, true);
    s.box(0, 3.8, 0.9, 5.4, 1, 0.3, ACCENT);
    s.box(0, 3.8, -1.5, 11.2, 0.3, 6.2, ROOF_METAL);
  },
  // a long low hall with a ribbon of glass, and the still basin before it a
  // hull is towed down under the carriage's gantry
  towingTank(s) {
    s.apron(21, 13, 0, -0.5);
    s.box(0, 0, -3.8, 18, 3.8, 5, CLADDING);
    s.box(0, 0, -3.8, 18.06, 0.5, 5.06, ROOF_METAL);
    s.box(0, 3.8, -3.8, 18.2, 0.35, 5.2, ROOF_METAL);
    s.box(0, 1.2, -1.24, 16, 1.4, 0.08, GLAZING);
    s.box(0, 0, 2.8, 18.6, 0.9, 6.4, CONCRETE);
    s.box(0, 0.9, 2.8, 17.2, 0.06, 5, WATER);
    for (const x of [-9, 9]) s.box(x, 0, 2.8, 0.36, 3.2, 0.36, ROOF_METAL);
    s.box(0, 3.2, 2.8, 18.4, 0.36, 0.36, ROOF_METAL);
    s.box(-3, 2.6, 2.8, 1.6, 0.6, 1.2, ACCENT);
  },
  // a white cube banded in dark glass, the simulator's white dome on its roof
  simulator(s) {
    s.apron(12, 11, -1.5, -0.5);
    s.box(-1.5, 0, -1, 8, 5.2, 7, CLADDING);
    s.box(-1.5, 2, -1, 8.06, 1.6, 7.06, GLAZING);
    s.box(-1.5, 4.5, -1, 8.06, 0.3, 7.06, ACCENT);
    s.round(-1.5, 5.2, -1, 2.4, 1.2, 0.72, 12, CLADDING);
    s.round(-1.5, 6.4, -1, 1.73, 0.7, 0.3, 12, CLADDING);
    s.round(-1.5, 5.9, -1, 2.1, 0.14, 1, 12, ACCENT);
    s.box(-1.5, 0, 2.54, 1.6, 2, 0.08, INTERIOR);
  },
  // a sawtooth hall, glass in each tooth's face
  compositesPlant(s) {
    s.apron(15, 12, -1.8, 0);
    s.box(-1.8, 0, 0, 11, 6, 9, CLADDING);
    s.box(-1.8, 0, 0, 11.06, 0.5, 9.06, ROOF_METAL);
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
  },
  // three floors glazed full height, a lower wing beside it, plant on its roof
  designCentre(s) {
    s.apron(16, 11, 1, 0);
    s.box(-1, 0, 0, 9, 10.2, 8, CLADDING);
    curtain(s, -1, 0.4, 4, 8, 9.4, 1.33, 3);
    s.box(-1, 10.2, 0, 9.2, 0.5, 8.2, ROOF_METAL);
    s.box(-2, 10.7, -1.5, 3, 1.2, 2.4, CONCRETE);
    s.box(5.4, 0, -0.6, 3.8, 4, 5.6, CLADDING);
    s.box(5.4, 1.2, 2.24, 3, 1.6, 0.08, GLAZING);
    s.box(5.4, 3.6, -0.6, 3.86, 0.4, 5.66, ACCENT);
  },
  // a slender tower, a slot of glass up it, a glazed lookout and a mast on top
  scoutingCentre(s) {
    s.apron(8, 8, 0, 0);
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
      s.box(x, 14, z, 0.18, 2.6, 0.18, CLADDING);
    s.box(0, 16.6, 0, 6.4, 0.36, 6.4, CLADDING, true);
    s.box(0, 16.4, 0, 6.42, 0.2, 6.42, ACCENT);
    s.box(0, 16.96, 0, 0.16, 4, 0.16, ROOF_METAL);
  },
};

/** The part of `[a0, a1]` within `[b0, b1]`, or null. */
const within = (
  a0: number,
  a1: number,
  b0: number,
  b1: number
): [number, number] | null =>
  Math.max(a0, b0) < Math.min(a1, b1)
    ? [Math.max(a0, b0), Math.min(a1, b1)]
    : null;

const unturned = new Matrix4(),
  tileAt = new Matrix4();

/**
 * The terrace of the harbour `h`, tile by tile: its lawn in mown stripes, the
 * roads and the quay's promenade laid over it, the walls round its edge down
 * past the sea's level, the quay's coping, and the hedge along the rest but
 * where an avenue leaves it by its gate. Its faces' corners are each put on the
 * sphere where they lie (so tiles meet without a seam); the coping and the
 * hedge are built square to their tile.
 */
function terrace(s: Shaper, h: Harbour) {
  const { tile, quay, hedge } = TERRACE,
    [x0, x1] = SITE.x,
    [z0, z1] = SITE.z,
    depth = h.ground + 3,
    laid: readonly (readonly [readonly number[], number, Tones])[] = [
      [[x0, x1, z1 - quay, z1], 0.03, PAVING],
      ...SITE.roads.map((r) => [r, 0.05, ASPHALT] as const),
    ];
  /** The world point `y` over the terrace at chart (x, z). */
  const on = (x: number, y: number, z: number): P =>
    place(fromChart(h.chart, x, z), h.ground + y);
  /** A level face of tone t from (xa, za) to (xb, zb), y over the terrace. */
  const level = (
    [xa, xb]: readonly [number, number],
    [za, zb]: readonly [number, number],
    y: number,
    t: Tones
  ) =>
    s.quad(
      on(xa, y, za),
      on(xa, y, zb),
      on(xb, y, zb),
      on(xb, y, za),
      t,
      on((xa + xb) / 2, y - 1, (za + zb) / 2)
    );
  /** A wall from (xa, za) to (xb, zb) down from the terrace, faced away from (xi, zi). */
  const wall = (
    xa: number,
    za: number,
    xb: number,
    zb: number,
    xi: number,
    zi: number
  ) =>
    s.quad(
      on(xa, 0, za),
      on(xb, 0, zb),
      on(xb, -depth, zb),
      on(xa, -depth, za),
      CONCRETE,
      on(xi, -1, zi)
    );
  for (let tx = x0, i = 0; tx < x1 - 1e-9; tx += tile, i++)
    for (let tz = z0, j = 0; tz < z1 - 1e-9; tz += tile, j++) {
      const xs = [tx, tx + tile] as const,
        zs = [tz, tz + tile] as const,
        cx = tx + tile / 2,
        cz = tz + tile / 2,
        e = tile / 2;
      s.at(unturned);
      level(xs, zs, 0, j % 2 ? LAWN_MOWN : LAWN);
      for (const [[a0, a1, b0, b1], y, t] of laid) {
        const x = within(tx, tx + tile, a0, a1),
          z = within(tz, tz + tile, b0, b1);
        if (x && z) level(x, z, y, t);
      }
      // its edges: the wall down, the coping on the quay, the hedge on the rest
      const gate = SITE.roads.some(
          ([a0, a1, b0]) => b0 === z0 && within(tx, tx + tile, a0, a1)
        ),
        back = j === 0,
        front = tz + tile >= z1 - 1e-9,
        left = i === 0,
        right = tx + tile >= x1 - 1e-9;
      if (back) wall(xs[0], tz, xs[1], tz, cx, cz);
      if (front) wall(xs[0], zs[1], xs[1], zs[1], cx, cz);
      if (left) wall(tx, zs[0], tx, zs[1], cx, cz);
      if (right) wall(xs[1], zs[0], xs[1], zs[1], cx, cz);
      s.at(standing(h.chart, cx, h.ground, cz, unturned, tileAt));
      if (front) s.box(0, 0, e - 0.3, tile, 0.3, 0.6, CONCRETE);
      if (back && !gate)
        s.box(0, 0, -e + hedge[0] / 2, tile, hedge[1], hedge[0], HEDGE);
      if (left && !front)
        s.box(-e + hedge[0] / 2, 0, 0, hedge[0], hedge[1], tile, HEDGE);
      if (right && !front)
        s.box(e - hedge[0] / 2, 0, 0, hedge[0], hedge[1], tile, HEDGE);
    }
}

const local = new Matrix4();

/** The harbour `h`, lit by `light`: its one mesh, as a thing that stands on the land (site.ts), drawn and casting. */
export function createHarbour(h: Harbour, light: Light): Instances {
  const s = createShaper();
  terrace(s, h);
  local.makeScale(LARGER, LARGER, LARGER);
  for (const id of PLOTS) {
    const { x, z, foot } = h.plots[id];
    s.at(standing(h.chart, x, foot, z, local, new Matrix4()));
    BUILT[id](s, (foot + 2) / LARGER);
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
