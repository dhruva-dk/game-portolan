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
 * How finely a palm is drawn: the trunk's rings along and sides around, a
 * nut's, each frond's rachis segments and leaflets down each side. Past DETAIL
 * metres off (site.ts) the same palm, every frond where it was, is drawn
 * coarser: fewer, broader leaflets covering as much, about a third of the
 * triangles.
 */
interface Detail {
  along: number;
  around: number;
  nut: number;
  rachis: number;
  leaflets: number;
}
const NEAR: Detail = { along: 28, around: 9, nut: 5, rachis: 10, leaflets: 28 };
const COARSE: Detail = { along: 7, around: 5, nut: 2, rachis: 4, leaflets: 9 };
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

interface Shape {
  trunk: BufferGeometry;
  crown: BufferGeometry;
}

function shape(lean: number, seed: number, detail: Detail): Shape {
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
  for (let k = 0; k < 7; k++) {
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
  const trunk = new BufferGeometry();
  trunk.setAttribute('position', new Float32BufferAttribute(pos, 3));
  trunk.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  trunk.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  trunk.setAttribute('nut', new Float32BufferAttribute(nut, 1));
  trunk.setIndex(index);

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
    for (let k = 0; k < RACHIS; k++) {
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
  const crown = new BufferGeometry();
  crown.setAttribute('position', new Float32BufferAttribute(cp, 3));
  crown.setAttribute('normal', new Float32BufferAttribute(cn, 3));
  crown.setAttribute('leaf', new Float32BufferAttribute(ca, 2));
  return { trunk, crown };
}

/**
 * palms[i]: those on tile i, whose chart is charts[i]; the instances of each
 * shape's trunk and crown, near and coarse.
 */
export function createPalms(
  palms: Palm[][],
  charts: Chart[],
  light: Light
): { near: Instances[]; coarse: Instances[] } {
  const trunkMaterial = new MeshBasicNodeMaterial();
  trunkMaterial.colorNode = Fn(() => {
    const p = positionWorld,
      n = normalize(normalWorld),
      nut = attribute('nut', 'float');
    // the scars of fallen fronds: a thin dark ring every RING metres up the
    // trunk
    const scar = float(1)
      .sub(line(uv().y, 1 / RING).mul(SCAR))
      .mul(float(1).sub(nut))
      .add(nut);
    const tone = (of: (t: Tones) => Rgb): Vec3Node =>
      mix(vec3(...of(PALM_TRUNK)).mul(scar), vec3(...of(PALM_NUT)), nut);
    return light.toon(
      p,
      n,
      tone((t) => t.lit),
      tone((t) => t.shadow)
    );
  })();

  const crownMaterial = new MeshBasicNodeMaterial({ side: DoubleSide });
  crownMaterial.colorNode = Fn(() => {
    const p = positionWorld,
      leaf = attribute('leaf', 'vec2');
    // the side facing the eye
    const n = normalize(normalWorld).mul(faceDirection);
    // old fronds yellowed; and in the crown's heart, where little light
    // reaches, a leaflet keeps its shadow tone
    const old = cut(leaf.x, OLD);
    const tone = (of: (t: Tones) => Rgb): Vec3Node =>
      mix(vec3(...of(PALM_LEAF)), vec3(...of(PALM_LEAF_OLD)), old);
    const shadow = tone((t) => t.shadow);
    return light.leaf(
      p,
      n,
      mix(
        shadow,
        tone((t) => t.lit),
        cut(leaf.y, SHADED)
      ),
      shadow
    );
  })();

  const m = new Matrix4(),
    q = new Quaternion(),
    s = new Vector3(),
    zero = new Vector3(),
    up = new Vector3(0, 1, 0);
  const nearest = (p: Palm) =>
    LEANS.reduce(
      (best, l, j) =>
        Math.abs(l - p.lean) < Math.abs(LEANS[best] - p.lean) ? j : best,
      0
    );
  // the shape leans toward +x; turn it to the palm's heading, and stand it on
  // the sphere
  const placed = LEANS.map((_, k) =>
    palms.map((on, i) =>
      on
        .filter((p) => nearest(p) === k)
        .map((p): Placed => {
          q.setFromAxisAngle(up, -p.heading);
          return {
            matrix: standing(
              charts[i],
              p.x,
              p.y,
              p.z,
              m.compose(zero, q, s.setScalar(p.height / HEIGHT)),
              new Matrix4()
            ),
          };
        })
    )
  );
  const at = (detail: Detail, name: string) =>
    LEANS.flatMap((lean, k) => {
      const sh = shape(lean, k + 11, detail);
      return [
        createInstances(`${name} ${2 * k}`, sh.trunk, trunkMaterial, placed[k]),
        createInstances(
          `${name} ${2 * k + 1}`,
          sh.crown,
          crownMaterial,
          placed[k]
        ),
      ];
    });
  return { near: at(NEAR, 'palms'), coarse: at(COARSE, 'palms coarse') };
}
