// The coconut palms (scatter.ts says where). A few shapes, from nearly upright to leaning far, each drawn once for
// every palm of about its lean on the islands in view (site.ts), turned to its heading and scaled to its height.
//
// The trunk: a tapering tube up a curve that leans from the foot and recurves toward the vertical, flared at the
// foot, ambientCG Bark015 scaled to the grey-brown of a palm's trunk and ringed by the scars of fallen fronds. Under
// the crown, a cluster of nuts.
//
// The crown: sixteen fronds in every direction from the young, pointing up, to the old, drooping, each a rachis
// that arches out and bends under its own weight with leaflets down both sides — every leaflet its own few
// triangles, so the leaves need no cut-out texture (an alpha test would cost the phone's GPU its hidden-surface
// removal). Lit on both sides, and glowing through from behind as leaves do.

import { BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { Fn, attribute, faceDirection, float, fract, mix, normalWorld, normalize, positionWorld, smoothstep, texture, uv, vec3 } from 'three/tsl';
import { loadTexture } from '../textures';
import { random } from '../world/random';
import type { Palm } from '../world/scatter';
import type { Chart } from '../world/sphere';
import { type Light, leafLight } from '../sky/light';
import { createInstances, standing, type Placed } from './site';

type N = any;

/** The shapes' leans at the foot, radians: each palm is drawn as the nearest. */
const LEANS = [0.08, 0.2, 0.32, 0.46];
/** A shape's height, metres: each palm is scaled from it to its own. */
const HEIGHT = 10;
const TRUNK_ALONG = 28, TRUNK_AROUND = 9;
const FRONDS = 16, LEAFLETS = 28, RACHIS = 10;
/** The bark texture's mean colour, linear (measured), and the trunk's mean albedo it is scaled to. */
const BARK_MEAN = [0.271, 0.206, 0.094];
const BARK_ALBEDO = [0.3, 0.27, 0.22];
/** Leaf scars ring the trunk every this many metres. */
const RING = 0.09;
/** Leaves' albedo: young fronds' olive green, old ones' yellowing, and the nuts'. */
const LEAF = [0.04, 0.06, 0.018];
const OLD_LEAF = [0.12, 0.1, 0.035];
const NUT = [0.16, 0.14, 0.04];
/** How much of the light falling on a leaf's far side comes through it. */
const THROUGH = 0.3;
/** Of the sky's light, the share that reaches a leaflet at a frond's base, in the crown's heart (all reaches its tip). */
const HEART = 0.4;

interface Shape { trunk: BufferGeometry; crown: BufferGeometry }

function shape(lean: number, seed: number): Shape {
  const rand = random(seed);
  // ---- the trunk, in the plane x–y, leaning toward +x
  const pos: number[] = [], nrm: number[] = [], uvs: number[] = [], nut: number[] = [];
  const centres: Vector3[] = [], tangents: Vector3[] = [];
  const c = new Vector3();
  for (let i = 0; i <= TRUNK_ALONG; i++) {
    const s = i / TRUNK_ALONG, a = lean * (1 - 0.75 * s);
    centres.push(c.clone());
    tangents.push(new Vector3(Math.sin(a), Math.cos(a), 0));
    c.addScaledVector(tangents[i], HEIGHT / TRUNK_ALONG);
  }
  const radius = (s: number) => 0.16 + 0.06 * (1 - s) + 0.18 * Math.exp(-s * 30);
  for (let i = 0; i <= TRUNK_ALONG; i++) {
    const s = i / TRUNK_ALONG, t = tangents[i], u = new Vector3(t.y, -t.x, 0), v = new Vector3(0, 0, 1);
    for (let j = 0; j <= TRUNK_AROUND; j++) {
      const f = (j / TRUNK_AROUND) * 2 * Math.PI, out = u.clone().multiplyScalar(Math.cos(f)).addScaledVector(v, Math.sin(f));
      pos.push(...centres[i].clone().addScaledVector(out, radius(s)).toArray());
      nrm.push(...out.toArray());
      // twice round per repeat, and the same scale along: the bark's arc length, metres, rides along v
      uvs.push((j / TRUNK_AROUND) * 2, s * HEIGHT);
      nut.push(0);
    }
  }
  const index: number[] = [];
  const row = TRUNK_AROUND + 1;
  for (let i = 0; i < TRUNK_ALONG; i++) for (let j = 0; j < TRUNK_AROUND; j++) {
    const a = i * row + j, b = a + 1, d = a + row, e = d + 1;
    index.push(a, d, b, b, d, e);
  }
  // the nuts: little spheres just under the crown
  const top = centres[TRUNK_ALONG], up = tangents[TRUNK_ALONG];
  for (let k = 0; k < 7; k++) {
    const f = rand() * 2 * Math.PI;
    const at = top.clone().addScaledVector(up, -0.35 - rand() * 0.25).add(new Vector3(Math.cos(f) * 0.24, 0, Math.sin(f) * 0.24));
    const base = pos.length / 3, R = 0.12, n = 5;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const th = (i / n) * Math.PI, ph = (j / n) * 2 * Math.PI;
      const o = new Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      pos.push(...at.clone().addScaledVector(o, R).toArray());
      nrm.push(...o.toArray());
      uvs.push(0, 0);
      nut.push(1);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = base + i * (n + 1) + j, b = a + 1, d = a + n + 1, e = d + 1;
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
  const cp: number[] = [], cn: number[] = [], ca: number[] = [];
  const world = new Vector3(0, 1, 0);
  const tri = (a: Vector3, b: Vector3, d: Vector3, lift: Vector3, age: number, shade: number) => {
    const n = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    if (n.dot(lift) < 0) n.negate();
    for (const p of [a, b, d]) { cp.push(p.x, p.y, p.z); cn.push(n.x, n.y, n.z); ca.push(age, shade); }
  };
  for (let i = 0; i < FRONDS; i++) {
    const azimuth = i * 2.39996 + rand() * 0.4;
    const age = Math.min(1, (i + rand() * 2) / FRONDS);
    // young fronds point up; old ones out and down, and bend more under their weight
    const rise = (1 - age) * 1.2 - 0.25, droop = 0.5 + 1.1 * age, length = 5.2 * (0.7 + 0.3 * Math.min(age * 3, 1)) * (0.9 + rand() * 0.2);
    const out = new Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const spine: Vector3[] = [], along: Vector3[] = [];
    const p = top.clone().addScaledVector(out, 0.15);
    for (let k = 0; k <= RACHIS; k++) {
      const u = k / RACHIS, e = rise - droop * u * u;
      const t = out.clone().multiplyScalar(Math.cos(e)).addScaledVector(world, Math.sin(e));
      spine.push(p.clone());
      along.push(t);
      p.addScaledVector(t, length / RACHIS);
    }
    // each leaflet a little lighter or darker than the next, and darker toward the crown's heart
    const shadeOf = (u: number) => (0.85 + rand() * 0.3) * (HEART + (1 - HEART) * u);
    for (let k = 0; k < RACHIS; k++) {
      // the rachis: a narrow strip
      const side = along[k].clone().cross(world).normalize().multiplyScalar(0.025 * (1 - k / RACHIS) + 0.008);
      const lift = side.clone().cross(along[k]).normalize();
      const a = spine[k].clone().add(side), b = spine[k].clone().sub(side), d = spine[k + 1].clone().add(side), e = spine[k + 1].clone().sub(side);
      tri(a, b, d, lift, age, 0.8 * shadeOf(k / RACHIS));
      tri(b, e, d, lift, age, 0.8 * shadeOf(k / RACHIS));
    }
    for (let l = 0; l < LEAFLETS; l++) {
      const u = 0.1 + (0.9 * (l + 0.5)) / LEAFLETS, k = Math.min(Math.floor(u * RACHIS), RACHIS - 1), f = u * RACHIS - k;
      const at = spine[k].clone().lerp(spine[k + 1], f), t = along[k];
      const side = t.clone().cross(world).normalize(), lift = side.clone().cross(t).normalize();
      // longest mid-frond, short at the base and the tip
      const len = 1.15 * Math.sin(Math.PI * (0.06 + 0.9 * u)) * (1 - 0.35 * u), w = 0.11 * (1 - 0.4 * u);
      for (const sign of [-1, 1]) {
        const dir = side.clone().multiplyScalar(sign * 0.8).addScaledVector(t, 0.45).addScaledVector(lift, -0.15 - 0.25 * age).normalize();
        const across = t.clone().multiplyScalar(w / 2);
        const sag = (0.15 + 0.35 * age) * len;
        const mid = at.clone().addScaledVector(dir, len * 0.5).addScaledVector(lift, -sag * 0.3);
        const tip = at.clone().addScaledVector(dir, len).addScaledVector(lift, -sag);
        const s = shadeOf(u);
        tri(at.clone().sub(across), at.clone().add(across), mid.clone().add(across.clone().multiplyScalar(0.8)), lift, age, s);
        tri(at.clone().sub(across), mid.clone().add(across.clone().multiplyScalar(0.8)), mid.clone().sub(across.clone().multiplyScalar(0.8)), lift, age, s);
        tri(mid.clone().sub(across.clone().multiplyScalar(0.8)), mid.clone().add(across.clone().multiplyScalar(0.8)), tip, lift, age, s);
      }
    }
  }
  const crown = new BufferGeometry();
  crown.setAttribute('position', new Float32BufferAttribute(cp, 3));
  crown.setAttribute('normal', new Float32BufferAttribute(cn, 3));
  crown.setAttribute('leaf', new Float32BufferAttribute(ca, 2));
  return { trunk, crown };
}

/** palms[i]: those on island i, whose chart is charts[i]. */
export function createPalms(palms: Palm[][], charts: Chart[], light: Light) {
  const bark = loadTexture('bark.jpg', true);

  const trunkMaterial = new MeshBasicNodeMaterial();
  trunkMaterial.colorNode = Fn(() => {
    const p = positionWorld, n = normalize(normalWorld);
    const grain = texture(bark, uv()).rgb;
    let albedo: N = grain.div(vec3(...BARK_MEAN)).mul(vec3(...BARK_ALBEDO));
    // the scars of fallen fronds: a narrow dark ring every RING metres up the trunk
    const scar = smoothstep(0.75, 0.95, fract(uv().y.div(RING)));
    albedo = albedo.mul(float(1).sub(scar.mul(0.35)));
    albedo = mix(albedo, vec3(...NUT), attribute('nut', 'float'));
    return albedo.mul(light(p, n));
  })();

  const crownMaterial = new MeshBasicNodeMaterial({ side: DoubleSide });
  crownMaterial.colorNode = Fn(() => {
    const p = positionWorld, leaf: N = attribute('leaf', 'vec2');
    // the side facing the eye
    const n = normalize(normalWorld).mul(faceDirection);
    const albedo = mix(vec3(...LEAF), vec3(...OLD_LEAF), smoothstep(0.55, 1, leaf.x)).mul(leaf.y);
    return albedo.mul(leafLight(light, p, n, THROUGH));
  })();

  const shapes = LEANS.map((lean, k) => shape(lean, k + 11));
  const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), zero = new Vector3(), up = new Vector3(0, 1, 0);
  const nearest = (p: Palm) => LEANS.reduce((best, l, j) => (Math.abs(l - p.lean) < Math.abs(LEANS[best] - p.lean) ? j : best), 0);
  return shapes.flatMap((sh, k) => {
    // the shape leans toward +x; turn it to the palm's heading, and stand it on the sphere
    const placed = palms.map((on, i) => on.filter((p) => nearest(p) === k).map((p): Placed => {
      q.setFromAxisAngle(up, -p.heading);
      return { matrix: standing(charts[i], p.x, p.y, p.z, m.compose(zero, q, s.setScalar(p.height / HEIGHT)), new Matrix4()) };
    }));
    return [createInstances(sh.trunk, trunkMaterial, placed), createInstances(sh.crown, crownMaterial, placed)];
  });
}
