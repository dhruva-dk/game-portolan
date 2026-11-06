// Wreckage: what shot knocks out of a hull and what a sinking ship leaves on the water, generated here and kept
// afloat. Splintered planks (a board whose ends are torn into ragged fingers), squared timbers broken at one end,
// barrels with their iron hoops and crates with their slats; planks knocked out of a hull carry her paint on their
// outer face.
//
// Every piece flies on its own (thrown out along the hull's normal, tumbling), meets the sea with a splash, and
// from then on floats: held at the swell's height under it and laid over to the slope of the water (from the swell
// sampled either side of it, so it pitches and rolls as the waves pass), spun down by the water, and drifting a
// little to leeward. After its time it takes on water and goes down. What a sinking ship gives up comes partly from
// below: barrels and crates break the surface over the seconds after she goes, as they would coming free of her.
//
// Wreckage stays: the sea round a long fight fills with it (Nijman's permanence), up to a cap where the oldest goes.
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, float, mix, texture } from 'three/tsl';
import { P } from '../gpu/uniforms.ts';
import { TAU, rand, seaRadius, tangents } from './common.ts';

export type DebrisKind = 'plank' | 'timber' | 'barrel' | 'crate';
const KINDS: DebrisKind[] = ['plank', 'timber', 'barrel', 'crate'];
/** Pieces of each kind afloat at once; the oldest goes when a new one needs its place. */
const CAP = 140;

interface Piece {
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  /** Spin, radians a second about the world's axes. */
  w: THREE.Vector3;
  life: number;
  scale: number;
  colour: THREE.Color;
  /** Seconds since it first touched the water (−1 still in the air), and a phase for its bobbing. */
  wet: number;
  phase: number;
  /** For what rises from a wreck: seconds still to wait below. */
  delay: number;
}

// ---------------------------------------------------------------- the shapes

/** A face's look: the bare wood's (or iron's) tint, and whether it takes the piece's paint instead. */
type Look = [number, number, number, number];

/** Vertex colours, a paint mask and a box-mapped uv, for a mesh built from raw positions. */
function finish(g: THREE.BufferGeometry, look: (p: THREE.Vector3, n: THREE.Vector3) => Look): THREE.BufferGeometry {
  g = g.index ? g.toNonIndexed() : g;
  g.computeVertexNormals();
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  const cols = new Float32Array(pos.count * 3), paint = new Float32Array(pos.count), uvs = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const [r, gr, b, painted] = look(p, n);
    cols.set([r, gr, b], i * 3);
    paint[i] = painted;
    // the grain runs along z
    const ax = Math.abs(n.x), ay = Math.abs(n.y);
    uvs[i * 2] = (ax > ay ? p.y : p.x) * 0.6;
    uvs[i * 2 + 1] = p.z * 0.25;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('aPaint', new THREE.BufferAttribute(paint, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

/** A board `len` long, its ends torn into ragged fingers; the outer face (+y) takes the instance's paint. */
function plankGeometry(): THREE.BufferGeometry {
  const len = 2.2, w = 0.32, t = 0.07, across = 6, along = 10;
  const g = new THREE.BoxGeometry(w, t, len, across, 1, along);
  const pos = g.getAttribute('position');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // the fingers: each column across the board torn off at its own length, the ends jagged
  const tear = Array.from({ length: across + 1 }, () => [rnd() * 0.45, rnd() * 0.3]);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const col = Math.round((x / w + 0.5) * across), [a, b] = tear[col];
    const end = z / (len / 2);
    if (end > 0.6) pos.setZ(i, z - a * ((end - 0.6) / 0.4) * len * 0.5);
    else if (end < -0.6) pos.setZ(i, z + b * ((-end - 0.6) / 0.4) * len * 0.5);
  }
  return finish(g, (_p, n) => (n.y > 0.7 ? [1, 1, 1, 1] : [0.3, 0.19, 0.1, 0]));
}

/** A squared timber, sound at one end and broken off at the other in long splinters. */
function timberGeometry(): THREE.BufferGeometry {
  const len = 3, s = 0.26, g = new THREE.BoxGeometry(s, s, len, 4, 4, 12);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (z > len * 0.2) {
      const k = (z - len * 0.2) / (len * 0.3);
      // splinters: the corners run on, the heart broke short
      const reach = 0.25 + 0.75 * Math.abs(Math.sin(x * 37 + y * 23)) * (Math.abs(x) + Math.abs(y)) / s;
      pos.setZ(i, len * 0.2 + k * len * 0.3 * reach);
      pos.setX(i, x * (1 - k * 0.5));
      pos.setY(i, y * (1 - k * 0.5));
    }
  }
  return finish(g, () => [0.2, 0.13, 0.07, 0]);
}

/** A cask: staves bulging at the middle, iron hoops near each head and at the bilge. */
function barrelGeometry(): THREE.BufferGeometry {
  const h = 1.1, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const y = (i / 12 - 0.5) * h, r = 0.34 + 0.08 * Math.cos((y / h) * Math.PI);
    pts.push(new THREE.Vector2(r, y));
  }
  const side = new THREE.LatheGeometry(pts, 14);
  const cap = (y: number, flip: boolean) => {
    const c = new THREE.CircleGeometry(0.33, 14).rotateX(flip ? Math.PI / 2 : -Math.PI / 2).translate(0, y, 0);
    return c.toNonIndexed();
  };
  const parts = [side.toNonIndexed(), cap(h / 2 - 0.02, false), cap(-h / 2 + 0.02, true)];
  const g = mergeRaw(parts).rotateX(Math.PI / 2);
  return finish(g, (p) => {
    const y = Math.abs(p.z) / (h / 2);
    const hoop = (y > 0.78 && y < 0.88) || (y > 0.3 && y < 0.38);
    return hoop ? [0.02, 0.02, 0.022, 0] : [0.3, 0.18, 0.09, 0];
  });
}

/** A crate of slats on a frame: the seams between the slats are dark. */
function crateGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.85, 0.7, 0.85, 1, 6, 1);
  return finish(g, (p) => {
    const seam = Math.abs(((p.y + 0.35) / 0.7) * 6 - Math.round(((p.y + 0.35) / 0.7) * 6)) < 0.08;
    const edge = Math.max(Math.abs(p.x), Math.abs(p.z)) > 0.41 && Math.min(Math.abs(p.x), Math.abs(p.z)) > 0.36;
    return seam ? [0.03, 0.02, 0.012, 0] : edge ? [0.16, 0.1, 0.055, 0] : [0.36, 0.24, 0.13, 0];
  });
}

function mergeRaw(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const g of gs) pos.push(...(g.getAttribute('position').array as Float32Array));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

// ---------------------------------------------------------------- the wreckage

export class Debris {
  readonly group = new THREE.Group();
  readonly #meshes = new Map<DebrisKind, THREE.InstancedMesh>();
  readonly #pieces = new Map<DebrisKind, Piece[]>();
  /** Told when a piece meets the water hard enough to throw spray: where, and how big. */
  onSplash: ((at: THREE.Vector3, big: number) => void) | null = null;
  readonly #tmp = new THREE.Object3D();
  readonly #up = new THREE.Vector3();
  readonly #a = new THREE.Vector3();
  readonly #b = new THREE.Vector3();
  readonly #n = new THREE.Vector3();
  readonly #q = new THREE.Quaternion();
  readonly #level = new THREE.Quaternion();
  readonly #axis = new THREE.Vector3();
  /** Bare wood, linear: what a plank not off a painted side shows on its face. */
  readonly #raw = new THREE.Color(0.3, 0.19, 0.1);

  constructor(wood: THREE.Texture) {
    const shapes: Record<DebrisKind, THREE.BufferGeometry> = {
      plank: plankGeometry(), timber: timberGeometry(), barrel: barrelGeometry(), crate: crateGeometry(),
    };
    // the scanned grain under every face: bare faces take their own tint, painted ones the piece's paint
    const m = new MeshStandardNodeMaterial({ roughness: 0.82 });
    const grain = texture(wood).rgb.mul(1.3);
    m.colorNode = grain.mul(mix(attribute<'vec3'>('color'), attribute<'vec3'>('aTint'), attribute<'float'>('aPaint')));
    m.roughnessNode = mix(float(0.88), float(0.72), attribute<'float'>('aPaint'));
    for (const k of KINDS) {
      const g = shapes[k];
      g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage));
      const mesh = new THREE.InstancedMesh(g, m, CAP);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#meshes.set(k, mesh);
      this.#pieces.set(k, []);
      this.group.add(mesh);
    }
  }

  /** Pieces afloat or in the air. */
  get count(): number {
    let n = 0;
    for (const l of this.#pieces.values()) n += l.length;
    return n;
  }

  clear(): void {
    for (const l of this.#pieces.values()) l.length = 0;
  }

  /** Shot through a hull at `at` (outward normal `out`): planks of her side in `paint`, and a timber when it is big. */
  shatter(at: THREE.Vector3, out: THREE.Vector3, paint: THREE.Color, big: number): void {
    const up = this.#up.copy(at).normalize();
    const n = Math.round(1 + big * 1.6 + Math.random());
    for (let i = 0; i < n; i++) {
      const v = this.#a.copy(out).multiplyScalar(rand(3, 8)).addScaledVector(up, rand(2, 7));
      tangents(up, this.#b, this.#n);
      v.addScaledVector(this.#b, rand(-3, 3)).addScaledVector(this.#n, rand(-3, 3));
      this.#add('plank', at, v, paint, rand(0.5, 1) * (0.7 + big * 0.2), rand(40, 70), 0);
    }
    if (big > 0.9 && Math.random() < 0.5) {
      const v = this.#a.copy(out).multiplyScalar(rand(2, 5)).addScaledVector(up, rand(3, 6));
      this.#add('timber', at, v, this.#raw, rand(0.6, 0.9), rand(50, 80), 0);
    }
  }

  /** A mast broken off at `foot` (its head at `top`): a timber or two of the partners and the step, and planks. */
  splinter(foot: THREE.Vector3, top: THREE.Vector3): void {
    const up = this.#up.copy(foot).normalize();
    tangents(up, this.#b, this.#n);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU, out = rand(3, 7);
      const v = new THREE.Vector3().copy(this.#b).multiplyScalar(Math.cos(a) * out).addScaledVector(this.#n, Math.sin(a) * out).addScaledVector(up, rand(4, 9));
      const p = new THREE.Vector3().lerpVectors(foot, top, rand(0, 0.15));
      this.#add(i < 2 ? 'timber' : 'plank', p, v, this.#raw, rand(0.5, 0.8), rand(50, 80), 0);
    }
  }

  /** A ship gone down at `at`: her planking and spars thrown up and out, then her stores rising after her. */
  wreck(at: THREE.Vector3, fwd: THREE.Vector3, paint: THREE.Color): void {
    const up = this.#up.copy(at).normalize();
    tangents(up, this.#b, this.#n);
    const side = this.#axis.crossVectors(up, fwd).normalize();
    const spot = (along: number, across: number, lift: number) =>
      new THREE.Vector3().copy(at).addScaledVector(fwd, along).addScaledVector(side, across).addScaledVector(up, lift);
    for (let i = 0; i < 16; i++) {
      const p = spot(rand(-7, 7), rand(-2, 2), rand(0.5, 2.5));
      const v = new THREE.Vector3().copy(side).multiplyScalar(rand(-8, 8)).addScaledVector(fwd, rand(-4, 4)).addScaledVector(up, rand(5, 13));
      this.#add('plank', p, v, Math.random() < 0.6 ? paint : this.#raw, rand(0.7, 1.3), rand(60, 100), 0);
    }
    for (let i = 0; i < 4; i++) {
      const p = spot(rand(-6, 6), rand(-1.5, 1.5), 1);
      const v = new THREE.Vector3().copy(side).multiplyScalar(rand(-5, 5)).addScaledVector(up, rand(4, 9));
      this.#add('timber', p, v, this.#raw, rand(0.9, 1.4), rand(70, 110), 0);
    }
    // her stores come free of her as she goes, and bob up through the following seconds
    for (let i = 0; i < 7; i++) {
      const p = spot(rand(-6, 6), rand(-2.5, 2.5), -rand(2, 4));
      const v = new THREE.Vector3().copy(up).multiplyScalar(rand(2, 4));
      this.#add(Math.random() < 0.55 ? 'barrel' : 'crate', p, v, this.#raw, rand(0.85, 1.15), rand(80, 120), rand(1, 7));
    }
  }

  #add(kind: DebrisKind, at: THREE.Vector3, v: THREE.Vector3, colour: THREE.Color, scale: number, life: number, delay: number): void {
    const list = this.#pieces.get(kind)!;
    if (list.length >= CAP) list.shift();
    list.push({
      p: at.clone(), v: v.clone(), q: new THREE.Quaternion().random(),
      w: new THREE.Vector3(rand(-7, 7), rand(-7, 7), rand(-7, 7)), life, scale, colour: colour.clone(),
      wet: delay > 0 ? 0 : -1, phase: Math.random() * TAU, delay,
    });
  }

  update(dt: number): void {
    const up = this.#up, a = this.#a, b = this.#b, n = this.#n, q = this.#q, level = this.#level;
    const wind = P.wind.value as THREE.Vector3;
    for (const kind of KINDS) {
      const list = this.#pieces.get(kind)!, mesh = this.#meshes.get(kind)!;
      const tint = mesh.geometry.getAttribute('aTint') as THREE.InstancedBufferAttribute;
      // its centre over the swell: the swell known here is the long waves only (ocean/index.ts heightAt), and the
      // chop drawn over them runs a quarter metre higher in places, where its foam would wash over the whole of a
      // piece lying under it, so everything rides that much clear of the long waves and the chop runs about it
      const ride = kind === 'barrel' ? 0.34 : kind === 'crate' ? 0.32 : kind === 'timber' ? 0.26 : 0.26;
      let count = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        d.life -= dt;
        if (d.life <= 0) { list.splice(i, 1); continue; }
        if (d.delay > 0) { d.delay -= dt; continue; }
        up.copy(d.p).normalize();
        const r = d.p.length();
        // the last seconds: waterlogged, it settles under
        const sinking = d.life < 6 ? (6 - d.life) * 0.25 : 0;
        const sea = seaRadius(d.p) + ride * d.scale - sinking;
        const vr = d.v.dot(up);
        if (d.wet < 0 && r > sea) {
          // in the air: falling, tumbling
          d.v.addScaledVector(up, -16 * dt);
        } else {
          if (d.wet < 0) {
            d.wet = 0;
            if (vr < -4) this.onSplash?.(d.p, Math.min(0.6, -vr * 0.04) * d.scale);
            // the water takes most of the fall and the spin
            d.v.addScaledVector(up, -vr * 0.7);
            d.w.multiplyScalar(0.3);
          }
          d.wet += dt;
          // held at the swell's height, springy and damped, and swept a little down the wind
          d.v.addScaledVector(up, (sea - r) * 9 * dt - vr * 3 * dt);
          a.copy(wind).addScaledVector(up, -wind.dot(up)).multiplyScalar(0.04);
          d.v.lerp(a.addScaledVector(up, d.v.dot(up)), Math.min(1, dt * 0.8));
          d.w.multiplyScalar(Math.max(0, 1 - dt * 2.5));
          // laid over to the slope of the water: the swell a metre either side gives its normal
          tangents(up, a, b);
          const h = seaRadius(d.p);
          const hx = seaRadius(n.copy(d.p).addScaledVector(a, 1)) - h, hz = seaRadius(n.copy(d.p).addScaledVector(b, 1)) - h;
          n.copy(up).addScaledVector(a, -hx).addScaledVector(b, -hz).normalize();
          // its own up (or, for a cask, its side) turned toward the water's, keeping its heading
          const own = this.#axis.set(0, 1, 0).applyQuaternion(d.q);
          if (own.dot(n) < 0) own.negate();
          level.setFromUnitVectors(own, n);
          q.identity().slerp(level, Math.min(1, dt * 3));
          d.q.premultiply(q);
          // a slow bob of its own
          d.p.addScaledVector(up, Math.sin(d.wet * 1.7 + d.phase) * 0.02 * dt);
        }
        d.p.addScaledVector(d.v, dt);
        const spin = d.w.length();
        if (spin > 1e-4) d.q.premultiply(q.setFromAxisAngle(this.#axis.copy(d.w).divideScalar(spin), spin * dt));
        d.q.normalize();
        const t = this.#tmp;
        t.position.copy(d.p);
        t.quaternion.copy(d.q);
        t.scale.setScalar(d.scale);
        t.updateMatrix();
        mesh.setMatrixAt(count, t.matrix);
        tint.setXYZ(count, d.colour.r, d.colour.g, d.colour.b);
        count++;
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      tint.needsUpdate = true;
    }
  }
}
