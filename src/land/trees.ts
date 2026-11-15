// The trees of the biomes that grow them (world/biome.ts Growth.trees; scatter.ts says where): a conifer's tiers, a
// broadleaf's rounded crown, a mangrove's broad crown over its arching prop roots. A few shapes of the biome's form,
// each drawn once for all its trees on the islands in view (site.ts), turned and scaled to each tree's height.
//
// Drawn as the toon look draws everything solid: each mass of leaves a closed, rounded body whose normals are its
// mass's (so the light falls across a crown in one clean edge, as across a shrub), its underside kept in the shadow
// tone; bark and roots tubes of a few sides. One geometry a shape, its parts told apart by an 'ink' attribute.

import { BufferGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { Fn, attribute, mix, normalWorld, normalize, positionWorld, vec3 } from 'three/tsl';
import { BARK, BROADLEAF, CONIFER, MANGROVE, ROOTS, type Tones } from '../palette';
import { random } from '../world/random';
import type { Tree, Trees } from '../world/scatter';
import type { Chart } from '../world/sphere';
import type { Light } from '../sky/light';
import { createInstances, standing, type Placed } from './site';
import { cut } from '../tsl';

/** How many shapes each form comes in. */
export const SHAPES = 3;
/** How much one tree's green differs from the next's; under this share of the way up its mass a leaf keeps its shadow
 *  tone. */
const VARIED = 0.25, SHADED = 0.32;
/** The parts' inks: bark, leaves, roots. */
const BARKED = 0, LEAVED = 1, ROOTED = 2;

/** A shape being built: 1 high, standing on y = 0. */
class Build {
  pos: number[] = []; nrm: number[] = []; ink: number[] = []; up: number[] = [];
  vertex(p: Vector3, n: Vector3, ink: number, up: number) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.ink.push(ink);
    this.up.push(up);
  }
  /** A tube along `path`, `radius(s)` across at s (0 foot … 1 tip), `sides` round. */
  tube(path: Vector3[], radius: (s: number) => number, sides: number, ink: number) {
    const ring = (i: number) => {
      const t = path[Math.min(i + 1, path.length - 1)].clone().sub(path[Math.max(i - 1, 0)]).normalize();
      const u = new Vector3(0, 0, 1).cross(t);
      if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
      u.normalize();
      const v = t.clone().cross(u);
      return Array.from({ length: sides }, (_, j) => {
        const a = (j / sides) * 2 * Math.PI, out = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
        return { p: path[i].clone().addScaledVector(out, radius(i / (path.length - 1))), n: out };
      });
    };
    const rings = path.map((_, i) => ring(i));
    for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < sides; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % sides], c = rings[i + 1][j], d = rings[i + 1][(j + 1) % sides];
      for (const v of [a, b, d, a, d, c]) this.vertex(v.p, v.n, ink, 0.5);
    }
  }
  /** A rounded mass of leaves about `c`, `size` its half-widths, its surface shaken by `rough`: normals the mass's. */
  mass(c: Vector3, size: Vector3, rough: number, rand: () => number, ink = LEAVED) {
    // (three's polyhedra are built non-indexed: each face its own three corners)
    const ico = new IcosahedronGeometry(1, 1), p = ico.getAttribute('position');
    // each corner shaken the same wherever it appears, so the mass stays closed
    const shake = new Map<string, number>();
    const at = new Vector3(), dir = new Vector3(), n = new Vector3();
    for (let i = 0; i < p.count; i++) {
      dir.fromBufferAttribute(p, i).normalize();
      const key = dir.toArray().map((x) => x.toFixed(4)).join();
      if (!shake.has(key)) shake.set(key, 1 + (rand() * 2 - 1) * rough);
      at.copy(dir).multiplyScalar(shake.get(key)!).multiply(size).add(c);
      // an ellipsoid's normal, a little toward straight up: crowns catch the sky on top
      n.set(dir.x / size.x, dir.y / size.y, dir.z / size.z).normalize().addScaledVector(new Vector3(0, 1, 0), 0.25).normalize();
      this.vertex(at, n, ink, 0.5 + 0.5 * dir.y);
    }
    ico.dispose();
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('ink', new Float32BufferAttribute(this.ink, 1));
    g.setAttribute('up', new Float32BufferAttribute(this.up, 1));
    return g;
  }
}

/** A path up from `foot` to `top`, bowed `bow` sideways (along x) at its middle, in `steps`. */
const bowed = (foot: Vector3, top: Vector3, bow: Vector3, steps: number) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const s = i / steps;
    return foot.clone().lerp(top, s).addScaledVector(bow, Math.sin(Math.PI * s));
  });

/** A conifer: a short trunk under four or five drooping tiers of boughs, each narrower than the one below. */
function conifer(seed: number): BufferGeometry {
  const rand = random(seed), b = new Build();
  b.tube(bowed(new Vector3(0, -0.1, 0), new Vector3(0, 0.4, 0), new Vector3(), 3), (s) => 0.04 - 0.012 * s, 6, BARKED);
  const tiers = 4 + Math.floor(rand() * 2), sides = 9;
  for (let k = 0; k < tiers; k++) {
    const s = k / tiers, base = 0.16 + 0.72 * s, wide = 0.27 * (1 - 0.72 * s) * (0.9 + 0.2 * rand()), tall = 0.3 - 0.1 * s;
    const apex = new Vector3(0, base + tall, 0), turn = rand() * 2 * Math.PI;
    // the skirt: its boughs' tips out and drooping, the notches between them in and higher
    const rim = Array.from({ length: sides * 2 }, (_, j) => {
      const a = turn + (j / (sides * 2)) * 2 * Math.PI, tip = j % 2 === 0, r = wide * (tip ? 1 : 0.72);
      return new Vector3(Math.cos(a) * r, base + (tip ? -0.04 : 0.02) * (1 - s), Math.sin(a) * r);
    });
    const under = new Vector3(0, base + 0.05, 0), down = new Vector3(0, -1, 0);
    const depth = 0.15 + 0.85 * s;
    for (let j = 0; j < rim.length; j++) {
      const p = rim[j], q = rim[(j + 1) % rim.length];
      // the outside: the cone's normal at each rim point, so it shades round
      const out = (r: Vector3) => new Vector3(r.x, 0, r.z).normalize().multiplyScalar(tall).add(new Vector3(0, wide, 0)).normalize();
      const top = out(p).add(out(q)).normalize();
      b.vertex(p, out(p), LEAVED, depth * 0.6);
      b.vertex(apex, top, LEAVED, 1);
      b.vertex(q, out(q), LEAVED, depth * 0.6);
      // the underside, in shade
      for (const v of [p, q, under]) b.vertex(v, down, LEAVED, 0);
    }
  }
  return b.geometry();
}

/** A broadleaf: a trunk forking under a rounded crown of a few heaped masses. */
function broadleaf(seed: number): BufferGeometry {
  const rand = random(seed), b = new Build();
  const lean = new Vector3(rand() * 0.08 - 0.04, 0, rand() * 0.08 - 0.04);
  const fork = new Vector3(lean.x, 0.42, lean.z);
  b.tube(bowed(new Vector3(0, -0.1, 0), fork, new Vector3(0.02, 0, 0), 4), (s) => 0.055 - 0.02 * s, 6, BARKED);
  const heart = new Vector3(lean.x * 2, 0.66, lean.z * 2);
  const masses = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < masses; i++) {
    const a = (i / masses) * 2 * Math.PI + rand() * 0.6, r = i === 0 ? 0 : 0.14 + rand() * 0.08;
    const c = heart.clone().add(new Vector3(Math.cos(a) * r, i === 0 ? 0.06 : (rand() - 0.5) * 0.14, Math.sin(a) * r));
    const w = i === 0 ? 0.24 : 0.15 + rand() * 0.07;
    if (i > 0) b.tube(bowed(fork, c, new Vector3(0, 0.03, 0), 2), (s) => 0.03 - 0.015 * s, 5, BARKED);
    b.mass(c, new Vector3(w, w * (0.75 + 0.15 * rand()), w), 0.12, rand);
  }
  return b.geometry();
}

/** A mangrove: a short trunk on a cage of prop roots arching down into the water, under a broad, low crown. */
function mangrove(seed: number): BufferGeometry {
  const rand = random(seed), b = new Build();
  const top = new Vector3(0, 0.55, 0);
  b.tube(bowed(new Vector3(0, 0.22, 0), top, new Vector3(0.03, 0, 0), 3), (s) => 0.045 - 0.015 * s, 6, BARKED);
  const roots = 7 + Math.floor(rand() * 3);
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * 2 * Math.PI + rand() * 0.5, out = new Vector3(Math.cos(a), 0, Math.sin(a));
    const from = new Vector3(0, 0.2 + 0.12 * rand(), 0).addScaledVector(out, 0.03);
    const to = out.clone().multiplyScalar(0.22 + 0.16 * rand()).setY(-0.2);
    // each root arches out and up before it plunges
    b.tube(bowed(from, to, out.clone().multiplyScalar(0.05).setY(0.1), 5), (s) => 0.018 - 0.006 * s, 4, ROOTED);
  }
  const masses = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < masses; i++) {
    const a = (i / masses) * 2 * Math.PI + rand() * 0.5, r = i === 0 ? 0 : 0.2 + rand() * 0.1;
    const c = new Vector3(Math.cos(a) * r, 0.72 + (rand() - 0.5) * 0.08, Math.sin(a) * r);
    const w = i === 0 ? 0.26 : 0.17 + rand() * 0.07;
    if (i > 0) b.tube(bowed(top, c, new Vector3(0, 0.04, 0), 2), (s) => 0.025 - 0.01 * s, 4, BARKED);
    b.mass(c, new Vector3(w, w * 0.55, w), 0.1, rand);
  }
  return b.geometry();
}

const FORMS = { conifer: [conifer, CONIFER], broadleaf: [broadleaf, BROADLEAF], mangrove: [mangrove, MANGROVE] } as const;

/** trees[i]: those on island i, whose chart is charts[i]; each one of SHAPES shapes of the biome's form. */
export function createTrees(trees: Tree[][], charts: Chart[], light: Light, form: Trees['form']) {
  const [make, leaf] = FORMS[form];
  // (both sides: the bodies are closed, so a back face is never seen, and the tubes' and tiers' windings need no care)
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  material.colorNode = Fn(() => {
    const p = positionWorld, n = normalize(normalWorld), ink = attribute('ink', 'float');
    const own = attribute('tint', 'float').sub(0.5).mul(VARIED).add(1);
    const tone = (t: Tones, of: 'lit' | 'shadow') => vec3(...t[of]);
    const pick = (of: 'lit' | 'shadow') =>
      mix(mix(tone(BARK, of), tone(leaf, of).mul(own), cut(ink, 0.5)), tone(ROOTS, of), cut(ink, 1.5));
    const shadow = pick('shadow');
    // a mass's underside keeps its shadow tone, whatever the light (bark and roots are drawn at 'up' ½: as lit)
    return light.toon(p, n, mix(shadow, pick('lit'), cut(attribute('up', 'float'), SHADED)), shadow);
  })();

  const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), zero = new Vector3(), up = new Vector3(0, 1, 0);
  return Array.from({ length: SHAPES }, (_, k) => createInstances(make(k + 211), material,
    trees.map((on, i) => on.filter((t) => t.shape === k).map((t): Placed => {
      m.compose(zero, q.setFromAxisAngle(up, t.yaw), s.setScalar(t.height));
      return { matrix: standing(charts[i], t.x, t.y, t.z, m, new Matrix4()), tint: t.tint };
    })), true));
}
