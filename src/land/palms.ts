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

const LEANS = [0.08, 0.2, 0.32, 0.46];
const HEIGHT = 10;
const STOUT = 1.3;
const FRONDS = 16,
  NUT = 0.12;
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
const RING = 0.45,
  SCAR = 0.35;
const OLD = 0.8;
const HEART = 0.4,
  SHADED = 0.62;

function shape(lean: number, seed: number, detail: Detail): BufferGeometry {
  const {
    along: ALONG,
    around: AROUND,
    rachis: RACHIS,
    leaflets: LEAFLETS,
  } = detail;
  const pos: number[] = [],
    nrm: number[] = [],
    uvs: number[] = [],
    nut: number[] = [];
  const centres: Vector3[] = [],
    tangents: Vector3[] = [];
  const c = new Vector3();
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
    const rand = random(seed * 131 + i + 1);
    const azimuth = i * 2.39996 + rand() * 0.4;
    const age = Math.min(1, (i + rand() * 2) / FRONDS);
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
    const shadeOf = (u: number) =>
      (0.85 + rand() * 0.3) * (HEART + (1 - HEART) * u);
    for (let k = 0; detail.stalk && k < RACHIS; k++) {
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

export function createPalms(
  palms: Palm[][],
  charts: Chart[],
  light: Light
): Instances[][] {
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  material.colorNode = Fn(() => {
    const p = positionWorld,
      crown = attribute('crown', 'float');
    const n = normalize(normalWorld).mul(faceDirection);

    const nut = attribute('nut', 'float');
    const scar = float(1)
      .sub(line(uv().y, 1 / RING).mul(SCAR))
      .mul(float(1).sub(nut))
      .add(nut);
    const bark = (of: (t: Tones) => Rgb): Vec3Node =>
      mix(vec3(...of(PALM_TRUNK)).mul(scar), vec3(...of(PALM_NUT)), nut);

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
