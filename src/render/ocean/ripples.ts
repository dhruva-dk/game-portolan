// Wakes, bow waves and splashes that ships ride: wave particles (Yuksel, House and Keyser, "Wave Particles",
// SIGGRAPH 2007).
//
// A wave front is a row of particles running across the sea, each carrying a little hump of water: a crest with a
// trough either side, so the sea is lifted and let down by the same amount. Neighbouring humps overlap, and a front
// stands as high as one hump times its width over the gap between them, so a particle is given the front's height
// scaled by that gap: a front keeps the height it was given however many particles carry it. A splash lets go a ring of them; a hull
// under way lets go a fan off each side of her bow every time she has sailed a little more than a hump's width,
// and the fans, overtaken one after another, draw her wake out into a V. A particle runs at a third of the ship's
// speed, so the V opens at asin(1/3), Kelvin's 19.5°, at any speed; a splash's runs at the deep-water speed of its
// own wavelength. As a ring grows its particles draw apart; once the gap between two would show (half a hump's
// width), each splits into three spread over its share of the arc, each a third as high, so the front stays whole.
// Between splits each grows as the square root of how far it has run, so a spreading front keeps its energy and
// falls as 1/√d, as a real ring does, not as 1/d as the bare gap would have it. Viscosity and breaking take the rest.
//
// The particles live here, on the CPU, moving along great circles from where they were let go. Anything riding the
// sea (hulls, wreckage, the wake's foam) adds their height and slope to the swell's through a spatial hash, so a
// ship crossing another's wake pitches over it. Each frame they are drawn, additively, as soft quads into a field
// laid on the sea round the point under the eye (its height and the two slopes, in the ocean grid's own map), and
// the sea's surface reads it: the vertices rise and fall with it, the normals tilt with it, and crests catch foam.
import {
  AddEquation, BufferAttribute, Color, CustomBlending, DynamicDrawUsage, HalfFloatType, InstancedBufferAttribute, InstancedBufferGeometry,
  LinearFilter, Mesh, MeshBasicNodeMaterial, OneFactor, OrthographicCamera, RGBAFormat, RenderTarget, Scene, Vector3, type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import { Discard, Fn, If, abs, attribute, cos, dot, length, max, positionGeometry, sin, varying, vec3, vec4 } from 'three/tsl';
import type { V3 } from '../../sim/math.ts';
import { R } from '../../sim/sphere.ts';

/** Particles at once. */
const MAX = 16384;
/** The field: metres from the point under the eye to its edge, and texels across it, 0.6 m each: a splash's humps
 *  are 0.8 m across and a wake's twice that, and read bilinearly their crests and foam hold. */
export const RIPPLE_SPAN = 160;
const TEXELS = 512;
/** The spatial hash: cells this many metres on a side (no hump is wider), buckets in its table. */
const CELL = 8;
const TABLE = 4096;
/** A particle lower than this (m) is gone; one that would split into three lower than twice it stops splitting. */
const FAINT = 0.006;
/** Times a ring's particles may split (1 → 3 → 9 → 27), and a wake's: its fans come so thick along her track that
 *  they need it less, and a ship under way lets go thousands otherwise. */
const RING_SPLITS = 3;
const WAKE_SPLITS = 1;
/** Seconds over which a wave loses 1/e of its height. */
const DAMP = 3.2;
/** How far (m) a particle runs before it is let go whatever its height. */
const RUN = 140;
/** The hump's carrier: crest at its middle, a trough either side (cos(KAPPA·s/r) under the cosine bell). */
const KAPPA = 1.5 * Math.PI;
const G = 9.81;

interface Hull { at: Vector3; seen: number }

const _p = new Vector3(), _d = new Vector3(), _o = new Vector3(), _a = new Vector3(), _t = new Vector3();

export class Ripples {
  // where each was let go (unit), the way it set off (unit, along the ground there), how far it has run (m), how fast
  // (m/s), its height (m, signed), its hump's radius (m) and the angle to its neighbours (rad)
  readonly #o = new Float32Array(MAX * 3);
  readonly #d0 = new Float32Array(MAX * 3);
  readonly #run = new Float32Array(MAX);
  readonly #speed = new Float32Array(MAX);
  readonly #amp = new Float32Array(MAX);
  readonly #rad = new Float32Array(MAX);
  readonly #spread = new Float32Array(MAX);
  /** Splits it may still make. */
  readonly #splits = new Uint8Array(MAX);
  // this frame: where it is (m, on the sphere of the sea), the way it is heading, and its hash cell
  readonly #pos = new Float32Array(MAX * 3);
  readonly #dir = new Float32Array(MAX * 3);
  readonly #cell = new Int32Array(MAX * 3);
  readonly #start = new Int32Array(TABLE + 1);
  readonly #items = new Int32Array(MAX);
  #n = 0;
  readonly #hulls = new Map<number, Hull>();
  #frame = 0;

  // the field
  readonly #scene = new Scene();
  readonly #camera = new OrthographicCamera(-RIPPLE_SPAN, RIPPLE_SPAN, RIPPLE_SPAN, -RIPPLE_SPAN, -10, 10);
  readonly #target = new RenderTarget(TEXELS, TEXELS, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
  readonly #geo = new InstancedBufferGeometry();
  readonly #splat = new Float32Array(MAX * 4);
  readonly #heading = new Float32Array(MAX * 2);
  readonly #splatAttr = new InstancedBufferAttribute(this.#splat, 4);
  readonly #headingAttr = new InstancedBufferAttribute(this.#heading, 2);
  readonly #was = new Color();

  constructor() {
    this.#geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    this.#geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.#splatAttr.setUsage(DynamicDrawUsage);
    this.#headingAttr.setUsage(DynamicDrawUsage);
    this.#geo.setAttribute('aSplat', this.#splatAttr);
    this.#geo.setAttribute('aHeading', this.#headingAttr);
    this.#geo.instanceCount = 0;
    const mesh = new Mesh(this.#geo, splatMaterial());
    mesh.frustumCulled = false;
    this.#scene.add(mesh);
    this.#target.texture.name = 'ripples';
  }

  /** The field the sea reads: height (m), its slope along the grid's two axes (m/m), and how much wave stands there
   *  (the humps' bells by their heights, for the crests' foam). */
  get field(): Texture {
    return this.#target.texture;
  }

  get count(): number {
    return this.#n;
  }

  clear(): void {
    this.#n = 0;
    this.#hulls.clear();
    this.#start.fill(0);
  }

  /**
   * A ring of waves run out from a splash at `at`: `amp` metres high, humps `radius` metres across, the deep-water
   * speed of their wavelength, `n` particles round it (enough that the first split comes once it has spread a little).
   */
  ring(at: V3, amp: number, radius: number, n = 0): void {
    const r = Math.min(Math.max(radius, 0.4), CELL / 2);
    // let go half a hump out from the middle, close enough together that the first split comes as it spreads
    const count = n || 10, from = r * 0.5, spread = (Math.PI * 2) / count;
    const height = (amp * spread * from) / r;
    const up = _o.set(at.x, at.y, at.z).normalize();
    const e1 = _a.set(1, 0, 0).addScaledVector(up, -up.x);
    if (e1.lengthSq() < 1e-4) e1.set(0, 0, 1).addScaledVector(up, -up.z);
    e1.normalize();
    const e2 = _t.crossVectors(up, e1);
    const c = deepSpeed(r);
    for (let i = 0; i < count; i++) {
      const a = i * spread;
      _d.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
      this.#add(up, _d, from, c, height, r, spread, RING_SPLITS);
    }
  }

  /**
   * A hull under way, every frame: `bow` where her stem meets the water, `fwd` her heading, `speed` m/s, `beam` her
   * breadth at the bow (m). Each time she has sailed most of a hump's width she lets go a fan off each bow.
   */
  sail(id: number, bow: V3, fwd: V3, speed: number, beam: number, scale = 1): void {
    let h = this.#hulls.get(id);
    if (!h) this.#hulls.set(id, (h = { at: new Vector3(bow.x, bow.y, bow.z), seen: this.#frame }));
    h.seen = this.#frame;
    if (speed < 1.2) { h.at.set(bow.x, bow.y, bow.z); return; }
    const r = Math.min(CELL / 2, (0.8 + speed * 0.2) * scale);
    const gone = Math.hypot(bow.x - h.at.x, bow.y - h.at.y, bow.z - h.at.z);
    if (gone < r * 0.9) return;
    h.at.set(bow.x, bow.y, bow.z);
    const amp = Math.min(0.9, 0.06 + speed * 0.05) * scale;
    const up = _o.set(bow.x, bow.y, bow.z).normalize();
    const f = _a.set(fwd.x, fwd.y, fwd.z).addScaledVector(up, -(fwd.x * up.x + fwd.y * up.y + fwd.z * up.z)).normalize();
    const side = _t.crossVectors(f, up);
    // a fan off each bow, from fine on it to abeam, at a third of her speed
    const FAN = [25, 52, 79].map((x) => (x * Math.PI) / 180);
    const spread = FAN[1] - FAN[0], from = r * 0.5, height = (amp * spread * from) / r;
    for (const s of [-1, 1]) {
      // let go from her side, a hump's width out, so she does not ride her own bow wave over her stem
      _p.copy(up).multiplyScalar(R).addScaledVector(side, s * (beam / 2 + r * 0.4));
      const start = _p.normalize().clone();
      for (const a of FAN) {
        _d.copy(f).multiplyScalar(Math.cos(a)).addScaledVector(side, s * Math.sin(a));
        _d.addScaledVector(start, -_d.dot(start)).normalize();
        this.#add(start, _d, from, speed / 3, height, r, spread, WAKE_SPLITS);
      }
    }
  }

  /** Moves every wave on by dt, splits those spread too thin, lets go the spent, and hashes them for riding. */
  step(dt: number): void {
    const decay = Math.exp(-dt / DAMP);
    for (let i = 0; i < this.#n; i++) {
      const was = this.#run[i], run = was + this.#speed[i] * dt;
      this.#run[i] = run;
      this.#amp[i] *= this.#spread[i] > 0 && was > 0 ? decay * Math.sqrt(run / was) : decay;
    }
    // split where the gap to the neighbours has grown past half a hump: three, a third as high, over its share
    const n0 = this.#n;
    for (let i = 0; i < n0; i++) {
      const spread = this.#spread[i];
      if (spread <= 0 || spread * this.#run[i] < this.#rad[i] * 0.5) continue;
      const amp = this.#amp[i] / 3;
      if (this.#splits[i] === 0 || Math.abs(amp) < FAINT * 2 || this.#n + 2 > MAX) { this.#spread[i] = 0; continue; }
      const left = this.#splits[i] - 1;
      const third = spread / 3;
      const o = _o.fromArray(this.#o, i * 3), d = _d.fromArray(this.#d0, i * 3);
      for (const turn of [-third, third]) {
        // the way it set off, turned about where it was let go
        _a.copy(d).multiplyScalar(Math.cos(turn)).addScaledVector(_t.crossVectors(o, d), Math.sin(turn));
        this.#add(o, _a, this.#run[i], this.#speed[i], amp, this.#rad[i], third, left);
      }
      this.#amp[i] = amp;
      this.#spread[i] = third;
      this.#splits[i] = left;
    }
    // the spent
    for (let i = this.#n - 1; i >= 0; i--) if (Math.abs(this.#amp[i]) < FAINT || this.#run[i] > RUN) this.#drop(i);
    // where each is now, along the great circle from where it was let go
    for (let i = 0; i < this.#n; i++) {
      const th = this.#run[i] / R, c = Math.cos(th), s = Math.sin(th), k = i * 3;
      const ox = this.#o[k], oy = this.#o[k + 1], oz = this.#o[k + 2], dx = this.#d0[k], dy = this.#d0[k + 1], dz = this.#d0[k + 2];
      this.#pos[k] = (ox * c + dx * s) * R;
      this.#pos[k + 1] = (oy * c + dy * s) * R;
      this.#pos[k + 2] = (oz * c + dz * s) * R;
      this.#dir[k] = dx * c - ox * s;
      this.#dir[k + 1] = dy * c - oy * s;
      this.#dir[k + 2] = dz * c - oz * s;
    }
    this.#hash();
    // hulls not seen for a while have sunk or sailed out of sight
    for (const [id, h] of this.#hulls) if (this.#frame - h.seen > 30) this.#hulls.delete(id);
    this.#frame++;
  }

  /**
   * The waves' height (m) at p (a point in the planet's frame, metres) and, if asked, their slope added into `slope`
   * (a vector along the ground pointing uphill, whose length is the rise per metre).
   */
  heightAt(p: V3, slope?: V3): number {
    if (this.#n === 0) return 0;
    const l = Math.hypot(p.x, p.y, p.z) || 1, k = R / l;
    const x = p.x * k, y = p.y * k, z = p.z * k;
    const h = CELL / 2;
    const cx = Math.floor((x - h) / CELL), cy = Math.floor((y - h) / CELL), cz = Math.floor((z - h) / CELL);
    let sum = 0, gx = 0, gy = 0, gz = 0;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let m = 0; m < 2; m++) {
      const ix = cx + i, iy = cy + j, iz = cz + m, b = bucket(ix, iy, iz);
      for (let q = this.#start[b]; q < this.#start[b + 1]; q++) {
        const n = this.#items[q], c = n * 3;
        if (this.#cell[c] !== ix || this.#cell[c + 1] !== iy || this.#cell[c + 2] !== iz) continue;
        const ox = x - this.#pos[c], oy = y - this.#pos[c + 1], oz = z - this.#pos[c + 2];
        const d2 = ox * ox + oy * oy + oz * oz, r = this.#rad[n];
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2), rho = d / r, A = this.#amp[n];
        const bell = 0.5 + 0.5 * Math.cos(Math.PI * rho);
        const s = ox * this.#dir[c] + oy * this.#dir[c + 1] + oz * this.#dir[c + 2];
        const wave = Math.cos((KAPPA * s) / r);
        sum += A * bell * wave;
        if (slope) {
          const dBell = (-0.5 * Math.PI * Math.sin(Math.PI * rho)) / (r * Math.max(d, 1e-4));
          const dWave = (-KAPPA / r) * Math.sin((KAPPA * s) / r) * bell;
          gx += A * (dBell * ox * wave + dWave * this.#dir[c]);
          gy += A * (dBell * oy * wave + dWave * this.#dir[c + 1]);
          gz += A * (dBell * oz * wave + dWave * this.#dir[c + 2]);
        }
      }
    }
    if (slope) {
      const ux = x / R, uy = y / R, uz = z / R, along = gx * ux + gy * uy + gz * uz;
      slope.x += gx - along * ux;
      slope.y += gy - along * uy;
      slope.z += gz - along * uz;
    }
    return sum;
  }

  /**
   * Draws the field round the point under the eye, in the ocean grid's map there: `nadir` and `e1` are the grid's
   * centre and first axis (surface.ts FRAME), the second axis nadir × e1 as the grid has it.
   */
  draw(renderer: WebGPURenderer, nadir: Vector3, e1: Vector3, e2: Vector3): void {
    let m = 0;
    const reach = RIPPLE_SPAN + CELL;
    for (let i = 0; i < this.#n; i++) {
      const k = i * 3;
      _p.set(this.#pos[k] / R, this.#pos[k + 1] / R, this.#pos[k + 2] / R);
      const q = mapAt(_p, nadir, e1, e2, _a, _t);
      if (Math.abs(q.x) > reach || Math.abs(q.y) > reach) continue;
      // the heading in the map: along the axes carried to where it is
      const hx = this.#dir[k] * _a.x + this.#dir[k + 1] * _a.y + this.#dir[k + 2] * _a.z;
      const hz = this.#dir[k] * _t.x + this.#dir[k + 1] * _t.y + this.#dir[k + 2] * _t.z;
      const hl = Math.hypot(hx, hz) || 1;
      this.#splat[m * 4] = q.x;
      this.#splat[m * 4 + 1] = q.y;
      this.#splat[m * 4 + 2] = this.#amp[i];
      this.#splat[m * 4 + 3] = this.#rad[i];
      this.#heading[m * 2] = hx / hl;
      this.#heading[m * 2 + 1] = hz / hl;
      m++;
    }
    this.#geo.instanceCount = m;
    this.#splatAttr.clearUpdateRanges();
    this.#splatAttr.addUpdateRange(0, Math.max(4, m * 4));
    this.#splatAttr.needsUpdate = true;
    this.#headingAttr.clearUpdateRanges();
    this.#headingAttr.addUpdateRange(0, Math.max(2, m * 2));
    this.#headingAttr.needsUpdate = true;
    const target = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), auto = renderer.autoClear;
    renderer.getClearColor(this.#was);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.#target);
    renderer.clear(true, false, false);
    renderer.autoClear = false;
    if (m > 0) renderer.render(this.#scene, this.#camera);
    renderer.autoClear = auto;
    renderer.setRenderTarget(target);
    renderer.setClearColor(this.#was, alpha);
  }

  #add(o: Vector3, d: Vector3, run: number, speed: number, amp: number, rad: number, spread: number, splits: number): void {
    if (this.#n >= MAX) return;
    const i = this.#n++, k = i * 3;
    this.#o[k] = o.x; this.#o[k + 1] = o.y; this.#o[k + 2] = o.z;
    this.#d0[k] = d.x; this.#d0[k + 1] = d.y; this.#d0[k + 2] = d.z;
    this.#run[i] = run;
    this.#speed[i] = speed;
    this.#amp[i] = amp;
    this.#rad[i] = rad;
    this.#spread[i] = spread;
    this.#splits[i] = splits;
  }

  #drop(i: number): void {
    const last = --this.#n;
    if (i === last) return;
    const k = i * 3, l = last * 3;
    for (let j = 0; j < 3; j++) { this.#o[k + j] = this.#o[l + j]; this.#d0[k + j] = this.#d0[l + j]; }
    this.#run[i] = this.#run[last];
    this.#speed[i] = this.#speed[last];
    this.#amp[i] = this.#amp[last];
    this.#rad[i] = this.#rad[last];
    this.#spread[i] = this.#spread[last];
    this.#splits[i] = this.#splits[last];
  }

  /** Counting sort into the table by cell, each particle's own cell kept so a query counts it once. */
  #hash(): void {
    const start = this.#start, cell = this.#cell, pos = this.#pos;
    start.fill(0);
    for (let i = 0; i < this.#n; i++) {
      const k = i * 3;
      cell[k] = Math.floor(pos[k] / CELL);
      cell[k + 1] = Math.floor(pos[k + 1] / CELL);
      cell[k + 2] = Math.floor(pos[k + 2] / CELL);
      start[bucket(cell[k], cell[k + 1], cell[k + 2]) + 1]++;
    }
    for (let b = 0; b < TABLE; b++) start[b + 1] += start[b];
    const fill = this.#fill;
    fill.set(start.subarray(0, TABLE));
    for (let i = 0; i < this.#n; i++) {
      const k = i * 3, b = bucket(cell[k], cell[k + 1], cell[k + 2]);
      this.#items[fill[b]++] = i;
    }
  }
  readonly #fill = new Int32Array(TABLE);
}

function bucket(x: number, y: number, z: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (TABLE - 1);
}

/** The deep-water phase speed of the hump's carrier wavelength (2r/1.5). */
function deepSpeed(r: number): number {
  return Math.sqrt((G * ((2 * r) / 1.5)) / (2 * Math.PI));
}

/**
 * Where a point of the unit sphere lies in the ocean grid's map round `nadir` (azimuthal equidistant: metres from
 * the centre along the bearing), and the map's axes carried to it, into `e1` and `e2` (as surface.ts inFrame).
 */
function mapAt(up: Vector3, nadir: Vector3, a1: Vector3, a2: Vector3, e1: Vector3, e2: Vector3): { x: number; y: number } {
  const c = up.dot(nadir);
  const d = e1.copy(up).addScaledVector(nadir, -c);
  const s = d.length();
  if (s > 1e-7) d.divideScalar(s); else d.copy(a1);
  const theta = Math.atan2(s, c);
  const cp = d.dot(a1), sp = d.dot(a2);
  // g: the bearing's direction carried to up; t: across it
  const gx = d.x * Math.cos(theta) - nadir.x * Math.sin(theta);
  const gy = d.y * Math.cos(theta) - nadir.y * Math.sin(theta);
  const gz = d.z * Math.cos(theta) - nadir.z * Math.sin(theta);
  const tx = nadir.y * d.z - nadir.z * d.y, ty = nadir.z * d.x - nadir.x * d.z, tz = nadir.x * d.y - nadir.y * d.x;
  const out = { x: cp * theta * R, y: sp * theta * R };
  e1.set(gx * cp - tx * sp, gy * cp - ty * sp, gz * cp - tz * sp);
  e2.set(gx * sp + tx * cp, gy * sp + ty * cp, gz * sp + tz * cp);
  return out;
}

/** Each particle's hump, added into the field: its height, its slope along the map's axes, and its bell. */
function splatMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.transparent = true;
  m.depthTest = false;
  m.depthWrite = false;
  m.fog = false;
  m.toneMapped = false;
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneFactor;
  m.blendEquationAlpha = AddEquation;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneFactor;
  const splat = attribute('aSplat', 'vec4');
  const heading = attribute('aHeading', 'vec2');
  // the map's second axis runs up the target, and WebGPU's first row is its top
  m.positionNode = vec3(splat.xy.add(positionGeometry.xy.mul(splat.w)), 0);
  const off = varying(positionGeometry.xy.mul(splat.w), 'vRippleOff');
  const amp = varying(splat.z, 'vRippleAmp'), rad = varying(splat.w, 'vRippleRad');
  const dir = varying(heading, 'vRippleDir');
  m.fragmentNode = Fn(() => {
    const d = length(off), rho = d.div(rad);
    If(rho.greaterThanEqual(1), () => { Discard(); });
    const bell = cos(rho.mul(Math.PI)).mul(0.5).add(0.5);
    const s = dot(off, dir), ks = s.mul(KAPPA).div(rad);
    const wave = cos(ks);
    const dBell = sin(rho.mul(Math.PI)).mul(-0.5 * Math.PI).div(rad.mul(max(d, 1e-4)));
    const dWave = sin(ks).mul(-KAPPA).div(rad).mul(bell);
    const slope = off.mul(dBell.mul(wave)).add(dir.mul(dWave)).mul(amp);
    return vec4(amp.mul(bell).mul(wave), slope.x, slope.y, abs(amp).mul(bell));
  })();
  return m;
}

/** The waves on the sea now: the ocean draws them, and anything that makes or rides them reaches them here. */
export const RIPPLES = new Ripples();
