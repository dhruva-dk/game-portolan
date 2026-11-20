// The coconut palms (world/terrain-scatter.ts says where). A few shapes, from
// nearly upright to leaning far, each drawn once for every palm of about its
// lean on the tiles in view (site.ts), turned to its heading and scaled to its
// height.
//
// The trunk: a tapering tube up a curve that leans from the foot and recurves
// toward the vertical, flared at the foot, in the trunk's two tones
// (palette.ts) and ringed by the scars of fallen fronds, drawn as thin lines.
// Under the crown, a cluster of nuts.
//
// The crown: sixteen fronds in every direction from the young, pointing up, to
// the old, drooping, each a rachis that arches out and bends under its own
// weight with leaflets down both sides — every leaflet its own few triangles,
// so the leaves need no cut-out texture (an alpha test would cost the iPad's
// GPU its hidden-surface removal). Lit on both sides, and from behind as leaves
// are (sky/light.ts leaf), in two flat greens.
//
// Trunk and crown are one geometry and one material, so a shape is one draw:
// a vertex's `crown` says which it is, and the trunk takes no light through
// from behind (lit as toon is).

import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  MeshBasicNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  attribute,
  faceDirection,
  float,
  mix,
  normalWorld,
  normalize,
  positionWorld,
  select,
  uv,
  vec3,
} from 'three/tsl';
import {
  PALM_LEAF,
  PALM_LEAF_OLD,
  PALM_NUT,
  PALM_TRUNK,
  type Rgb,
  type Tones,
} from '../palette.ts';
import { random } from '../world/random.ts';
import type { Palm } from '../world/terrain-scatter.ts';
import type { Chart } from '../world/sphere.ts';
import type { Light } from '../sky/light.ts';
import {
  createInstances,
  standing,
  type Instances,
  type Placed,
} from './site.ts';
import { cut, line, type Vec3Node } from '../tsl.ts';

/**
 * The shapes' leans at the foot, radians: each palm is drawn as the nearest.
 */
const LEANS = [0.08, 0.2, 0.32, 0.46];
/** A shape's height, metres: each palm is scaled from it to its own. */
const HEIGHT = 10;
/**
 * How much stouter a trunk is than a slender palm's (about 0.3 m across at the
 * crown).
 */
const STOUT = 1.3;
/** Its fronds; a nut's radius, metres. */
const FRONDS = 16,
  NUT = 0.12;
/**
 * How finely a palm is drawn: the trunk's rings along (a divisor of NEAR's) and
 * sides around, a nut's (0: no nuts), each frond's rachis segments, whether its
 * rachis is drawn, and its leaflets down each side (0: the frond one blade).
 */
interface Detail {
  along: number;
  around: number;
  nut: number;
  rachis: number;
  stalk: boolean;
  leaflets: number;
}
const NEAR: Detail = {
  along: 28,
  around: 9,
  nut: 5,
  rachis: 10,
  stalk: true,
  leaflets: 28,
};
/**
 * Each level of detail, nearest first (groves.ts says how far off each is
 * drawn), and the leans its shapes are drawn at. Each is the same palm, every
 * frond where it was: coarse, fewer, broader leaflets covering as much (about
 * 1100 triangles, a third of near's); far (a palm some 30 pixels tall), three a
 * side and no rachis or nuts (320); distant (a few pixels, from space), each
 * frond one blade (44). Far off, fewer leans: the crown stands no more than a
 * pixel or two off where its own lean would put it.
 */
const LEVELS: { name: string; detail: Detail; leans: readonly number[] }[] = [
  { name: 'palms', detail: NEAR, leans: LEANS },
  {
    name: 'palms coarse',
    detail: {
      along: 7,
      around: 5,
      nut: 2,
      rachis: 4,
      stalk: true,
      leaflets: 9,
    },
    leans: LEANS,
  },
  {
    name: 'palms far',
    detail: {
      along: 4,
      around: 4,
      nut: 0,
      rachis: 3,
      stalk: false,
      leaflets: 3,
    },
    leans: [0.14, 0.39],
  },
  {
    name: 'palms distant',
    detail: {
      along: 2,
      around: 3,
      nut: 0,
      rachis: 2,
      stalk: false,
      leaflets: 0,
    },
    leans: [0.27],
  },
];
/** Leaf scars ring the trunk every this many metres, each drawn this dark. */
const RING = 0.45,
  SCAR = 0.35;
/** A frond past this age (0 the youngest … 1 the oldest) has yellowed. */
const OLD = 0.8;
/**
 * Of the sky's light, the share that reaches a leaflet at a frond's base, in
 * the crown's heart (all reaches its tip); and the share under which a leaflet
 * is drawn in its shadow tone.
 */
const HEART = 0.4,
  SHADED = 0.62;

/** A palm of the given lean, trunk and crown in one geometry. */
function shape(lean: number, seed: number, detail: Detail): BufferGeometry {
  const {
    along: ALONG,
    around: AROUND,
    rachis: RACHIS,
    leaflets: LEAFLETS,
  } = detail;
  // ---- the trunk, in the plane x–y, leaning toward +x
  const pos: number[] = [],
    nrm: number[] = [],
    uvs: number[] = [],
    nut: number[] = [];
  const centres: Vector3[] = [],
    tangents: Vector3[] = [];
  const c = new Vector3();
  // (the trunk's curve worked out finely whatever the detail, so a coarse
  // trunk's crown sits where the near one's does)
  const fine = NEAR.along,
    step = fine / ALONG;
  for (let i = 0; i <= fine; i++) {
    const s = i / fine,
      a = lean * (1 - 0.75 * s);
    if (i % step === 0) {
      centres.push(c.clone());
      tangents.push(new Vector3(Math.sin(a), Math.cos(a), 0));
    }
    c.addScaledVector(new Vector3(Math.sin(a), Math.cos(a), 0), HEIGHT / fine);
  }
  const radius = (s: number) =>
    STOUT * (0.16 + 0.06 * (1 - s) + 0.18 * Math.exp(-s * 30));
  for (let i = 0; i <= ALONG; i++) {
    const s = i / ALONG,
      t = tangents[i],
      u = new Vector3(t.y, -t.x, 0),
      v = new Vector3(0, 0, 1);
    for (let j = 0; j <= AROUND; j++) {
      const f = (j / AROUND) * 2 * Math.PI,
        out = u
          .clone()
          .multiplyScalar(Math.cos(f))
          .addScaledVector(v, Math.sin(f));
      pos.push(...centres[i].clone().addScaledVector(out, radius(s)).toArray());
      nrm.push(...out.toArray());
      // twice round per repeat, and the same scale along: the bark's arc
      // length, metres, rides along v
      uvs.push((j / AROUND) * 2, s * HEIGHT);
      nut.push(0);
    }
  }
  const index: number[] = [];
  const row = AROUND + 1;
  for (let i = 0; i < ALONG; i++)
    for (let j = 0; j < AROUND; j++) {
      const a = i * row + j,
        b = a + 1,
        d = a + row,
        e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  // the nuts: little spheres just under the crown
  const top = centres[ALONG],
    up = tangents[ALONG];
  const nuts = random(seed);
  for (let k = 0; k < (detail.nut > 0 ? 7 : 0); k++) {
    const f = nuts() * 2 * Math.PI;
    const ring = 0.24 * STOUT;
    const at = top
      .clone()
      .addScaledVector(up, -0.35 - nuts() * 0.25)
      .add(new Vector3(Math.cos(f) * ring, 0, Math.sin(f) * ring));
    const base = pos.length / 3,
      n = detail.nut;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const th = (i / n) * Math.PI,
          ph = (j / n) * 2 * Math.PI;
        const o = new Vector3(
          Math.sin(th) * Math.cos(ph),
          Math.cos(th),
          Math.sin(th) * Math.sin(ph)
        );
        pos.push(...at.clone().addScaledVector(o, NUT).toArray());
        nrm.push(...o.toArray());
        uvs.push(0, 0);
        nut.push(1);
      }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const a = base + i * (n + 1) + j,
          b = a + 1,
          d = a + n + 1,
          e = d + 1;
        index.push(a, b, d, b, e, d);
      }
  }
  // ---- the crown
  const cp: number[] = [],
    cn: number[] = [],
    ca: number[] = [];
  const world = new Vector3(0, 1, 0);
  const tri = (
    a: Vector3,
    b: Vector3,
    d: Vector3,
    lift: Vector3,
    age: number,
    shade: number
  ) => {
    const n = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    if (n.dot(lift) < 0) n.negate();
    for (const p of [a, b, d]) {
      cp.push(p.x, p.y, p.z);
      cn.push(n.x, n.y, n.z);
      ca.push(age, shade);
    }
  };
  for (let i = 0; i < FRONDS; i++) {
    // (each frond its own draws, so it lies the same at every detail)
    const rand = random(seed * 131 + i + 1);
    const azimuth = i * 2.39996 + rand() * 0.4;
    const age = Math.min(1, (i + rand() * 2) / FRONDS);
    // young fronds point up; old ones out and down, and bend more under their
    // weight
    const rise = (1 - age) * 1.2 - 0.25,
      droop = 0.5 + 1.1 * age,
      length = 5.2 * (0.7 + 0.3 * Math.min(age * 3, 1)) * (0.9 + rand() * 0.2);
    const out = new Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const spine: Vector3[] = [],
      along: Vector3[] = [];
    const p = top.clone().addScaledVector(out, 0.15);
    for (let k = 0; k <= RACHIS; k++) {
      const u = k / RACHIS,
        e = rise - droop * u * u;
      const t = out
        .clone()
        .multiplyScalar(Math.cos(e))
        .addScaledVector(world, Math.sin(e));
      spine.push(p.clone());
      along.push(t);
      p.addScaledVector(t, length / RACHIS);
    }
    // each leaflet a little lighter or darker than the next, and darker toward
    // the crown's heart
    const shadeOf = (u: number) =>
      (0.85 + rand() * 0.3) * (HEART + (1 - HEART) * u);
    for (let k = 0; detail.stalk && k < RACHIS; k++) {
      // the rachis: a narrow strip
      const side = along[k]
        .clone()
        .cross(world)
        .normalize()
        .multiplyScalar(0.025 * (1 - k / RACHIS) + 0.008);
      const lift = side.clone().cross(along[k]).normalize();
      const a = spine[k].clone().add(side),
        b = spine[k].clone().sub(side);
      const d = spine[k + 1].clone().add(side),
        e = spine[k + 1].clone().sub(side);
      tri(a, b, d, lift, age, 0.8 * shadeOf(k / RACHIS));
      tri(b, e, d, lift, age, 0.8 * shadeOf(k / RACHIS));
    }
    if (LEAFLETS === 0) {
      // one blade: from the frond's foot out to its tip, sagging as its
      // leaflets do, as wide as they cover (with the gaps between them, some
      // two thirds of how far they reach)
      const m = spine[RACHIS >> 1],
        t = along[RACHIS >> 1];
      const side = t.clone().cross(world).normalize(),
        lift = side.clone().cross(t).normalize();
      const reach = 0.55,
        sag = 0.3 + 0.3 * age;
      const l = m
          .clone()
          .addScaledVector(side, reach)
          .addScaledVector(lift, -sag),
        r = m.clone().addScaledVector(side, -reach).addScaledVector(lift, -sag);
      // (shaded as its leaflets nearer the heart: about half the blades in
      // their shadow tone, as half a full crown's leaflets are)
      const s = shadeOf(0.35);
      tri(spine[0], r, spine[RACHIS], lift, age, s);
      tri(spine[0], spine[RACHIS], l, lift, age, s);
    }
    for (let l = 0; l < LEAFLETS; l++) {
      const u = 0.1 + (0.9 * (l + 0.5)) / LEAFLETS,
        k = Math.min(Math.floor(u * RACHIS), RACHIS - 1),
        f = u * RACHIS - k;
      const at = spine[k].clone().lerp(spine[k + 1], f),
        t = along[k];
      const side = t.clone().cross(world).normalize(),
        lift = side.clone().cross(t).normalize();
      // longest mid-frond, short at the base and the tip
      // (fewer leaflets are broader, so a frond is as full)
      const len = 1.15 * Math.sin(Math.PI * (0.06 + 0.9 * u)) * (1 - 0.35 * u),
        w = 0.11 * (NEAR.leaflets / LEAFLETS) * (1 - 0.4 * u);
      for (const sign of [-1, 1]) {
        const dir = side
          .clone()
          .multiplyScalar(sign * 0.8)
          .addScaledVector(t, 0.45)
          .addScaledVector(lift, -0.15 - 0.25 * age)
          .normalize();
        const across = t.clone().multiplyScalar(w / 2);
        const sag = (0.15 + 0.35 * age) * len;
        const mid = at
          .clone()
          .addScaledVector(dir, len * 0.5)
          .addScaledVector(lift, -sag * 0.3);
        const tip = at
          .clone()
          .addScaledVector(dir, len)
          .addScaledVector(lift, -sag);
        const s = shadeOf(u),
          narrow = across.clone().multiplyScalar(0.8);
        const foot = at.clone().sub(across),
          midL = mid.clone().sub(narrow),
          midR = mid.clone().add(narrow);
        tri(foot, at.clone().add(across), midR, lift, age, s);
        tri(foot, midR, midL, lift, age, s);
        tri(midL, midR, tip, lift, age, s);
      }
    }
  }
  // ---- one geometry, the trunk's vertices then the crown's: each part's own
  // attributes nought on the other's, and `crown` 1 on the crown's
  const trunks = pos.length / 3,
    leaves = cp.length / 3;
  const none = (n: number): number[] => new Array<number>(n).fill(0);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos.concat(cp), 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm.concat(cn), 3));
  g.setAttribute(
    'uv',
    new Float32BufferAttribute(uvs.concat(none(2 * leaves)), 2)
  );
  g.setAttribute(
    'nut',
    new Float32BufferAttribute(nut.concat(none(leaves)), 1)
  );
  g.setAttribute(
    'leaf',
    new Float32BufferAttribute(none(2 * trunks).concat(ca), 2)
  );
  g.setAttribute(
    'crown',
    new Float32BufferAttribute(none(trunks).concat(none(leaves).fill(1)), 1)
  );
  g.setIndex(
    index.concat(Array.from({ length: leaves }, (_, i) => trunks + i))
  );
  return g;
}

/**
 * palms[i]: those on tile i, whose chart is charts[i]; for each level of
 * detail (LEVELS, nearest first), the instances of each of its shapes (trunk
 * and crown one draw).
 */
export function createPalms(
  palms: Palm[][],
  charts: Chart[],
  light: Light
): Instances[][] {
  // the trunk and the crown in one draw: both sides drawn, for the leaves (the
  // trunk's far side is hidden behind its near one)
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  material.colorNode = Fn(() => {
    const p = positionWorld,
      crown = attribute('crown', 'float');
    // the side facing the eye
    const n = normalize(normalWorld).mul(faceDirection);

    // the trunk: the scars of fallen fronds, a thin dark ring every RING
    // metres up it
    const nut = attribute('nut', 'float');
    const scar = float(1)
      .sub(line(uv().y, 1 / RING).mul(SCAR))
      .mul(float(1).sub(nut))
      .add(nut);
    const bark = (of: (t: Tones) => Rgb): Vec3Node =>
      mix(vec3(...of(PALM_TRUNK)).mul(scar), vec3(...of(PALM_NUT)), nut);

    // the crown: old fronds yellowed; and in the crown's heart, where little
    // light reaches, a leaflet keeps its shadow tone
    const leaf = attribute('leaf', 'vec2');
    const old = cut(leaf.x, OLD);
    const green = (of: (t: Tones) => Rgb): Vec3Node =>
      mix(vec3(...of(PALM_LEAF)), vec3(...of(PALM_LEAF_OLD)), old);
    const leafShadow = green((t) => t.shadow);
    const leafLit = mix(
      leafShadow,
      green((t) => t.lit),
      cut(leaf.y, SHADED)
    );

    const isCrown = crown.greaterThan(0.5);
    // lit through from behind only on the crown: the trunk is solid
    return light.leaf(
      p,
      n,
      select(
        isCrown,
        leafLit,
        bark((t) => t.lit)
      ),
      select(
        isCrown,
        leafShadow,
        bark((t) => t.shadow)
      ),
      crown
    );
  })();

  const m = new Matrix4(),
    q = new Quaternion(),
    s = new Vector3(),
    zero = new Vector3(),
    up = new Vector3(0, 1, 0);
  // the shape leans toward +x; turn it to the palm's heading, and stand it on
  // the sphere
  const matrices = palms.map((on, i) =>
    on.map((p) => {
      q.setFromAxisAngle(up, -p.heading);
      return standing(
        charts[i],
        p.x,
        p.y,
        p.z,
        m.compose(zero, q, s.setScalar(p.height / HEIGHT)),
        new Matrix4()
      );
    })
  );
  /** Each palm on its tile drawn as the nearest of `leans`: theirs, by lean. */
  const placed = (leans: readonly number[]) => {
    const nearest = (p: Palm) =>
      leans.reduce(
        (best, l, j) =>
          Math.abs(l - p.lean) < Math.abs(leans[best] - p.lean) ? j : best,
        0
      );
    return leans.map((_, k) =>
      palms.map((on, i) =>
        on.flatMap((p, j): Placed[] =>
          nearest(p) === k ? [{ matrix: matrices[i][j] }] : []
        )
      )
    );
  };
  return LEVELS.map(({ name, detail, leans }) => {
    const by = placed(leans);
    return leans.map((lean, k) =>
      createInstances(
        `${name} ${k}`,
        shape(lean, k + 11, detail),
        material,
        by[k]
      )
    );
  });
}
