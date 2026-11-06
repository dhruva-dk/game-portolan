// The ocean: the waves, the surface drawn from them, and the swell the hulls ride, kept in step. The stage owns one,
// sets its sea state from the weather and calls update() once a frame before drawing.
import { Quaternion, Vector2, Vector3, type Mesh, type Node, type WebGPURenderer } from 'three/webgpu';
import type { V3 } from '../../sim/math.ts';
import { R } from '../../sim/sphere.ts';
import { CALM_SEA, LongWaves, spectrumParams, type SeaState } from './spectrum.ts';
import { SEA, Waves, setSpectrum } from './waves.ts';
import { FRAME, WATER, oceanSurface } from './surface.ts';
import { beneath } from './beneath.ts';
import { Coast } from './coast.ts';
import { Territory } from './territory.ts';
import { sharedNoise } from '../gpu/noise.ts';

/** How far the eye sails from the waves' anchor, radians of the planet, before a new one is laid under it: 277 m,
 *  where the map stretches the sea 4% across. */
const REANCHOR = 0.5;
/** How long the sea takes to cross from one anchor to the next, seconds. */
const CROSSFADE = 5;

const _q = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();

interface Anchor { at: Vector3; axis: Vector3 }

export class Ocean {
  readonly waves = new Waves();
  readonly long = new LongWaves();
  readonly mesh: Mesh;
  /** The coastline's distance field, which the surf is drawn from: built in a worker as the game starts. */
  readonly coast = new Coast();
  /** The captains' water and trails, inked on the sea. */
  readonly territory = new Territory();
  readonly #seed: number;
  #state: SeaState = { ...CALM_SEA };
  #built = '';
  #from: Anchor | null = null;
  #to: Anchor | null = null;
  #fade = 0;
  #time = 0;

  /** What the sea does to the light of anything under it: give it to the atmosphere's haze. */
  readonly beneath: (colour: Node<'vec3'>, p: Node<'vec3'>) => Node<'vec3'>;

  constructor(seed = 1) {
    this.#seed = seed;
    this.mesh = oceanSurface(this.waves, this.coast, sharedNoise(), this.territory);
    this.beneath = beneath(this.waves.field);
  }

  /** The sea now: the spectrum is rebuilt before the next frame when it has changed. */
  set sea(s: SeaState) {
    this.#state = { ...s };
  }

  get sea(): SeaState {
    return this.#state;
  }

  /** Points the wind sea along a direction in the world at the eye (any length; only its lie along the sea counts). */
  windToward(eye: Vector3, wind: Vector3): void {
    const a = this.#from;
    if (!a) return;
    const up = _v.copy(eye).normalize();
    const e1 = _w.copy(a.axis).addScaledVector(up, -a.axis.dot(up)).normalize();
    const e2 = new Vector3().crossVectors(up, e1);
    this.#state.heading = Math.atan2(wind.dot(e2), wind.dot(e1));
  }

  /** Follows the eye, rebuilds the spectrum if the sea has changed and moves the waves on. */
  update(renderer: WebGPURenderer, eye: Vector3, time: number, dt: number): void {
    this.#time = time;
    const nadir = _v.copy(eye).normalize();
    this.#follow(nadir, dt);

    const s = this.#state;
    const key = [s.wind, s.heading, s.fetch, s.swell, s.swellLength, s.swellHeading].map((x) => x.toFixed(3)).join();
    if (key !== this.#built) {
      const p = spectrumParams(s);
      setSpectrum(p, this.#seed);
      this.long.update(p, this.#seed);
      renderer.compute(this.waves.build);
      this.#built = key;
    }
    SEA.chop.value = s.chop;
    SEA.time.value = time;
    SEA.dt.value = Math.min(dt, 0.1);
    renderer.compute(this.waves.frame);
  }

  #follow(nadir: Vector3, dt: number): void {
    // the grid's centre and axes, its first axis carried over from the last frame so the rings never spin
    (FRAME.nadir.value as Vector3).copy(nadir);
    const e1 = FRAME.gridE1.value as Vector3;
    e1.addScaledVector(nadir, -e1.dot(nadir));
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0).addScaledVector(nadir, -nadir.x);
    e1.normalize();
    (FRAME.gridE2.value as Vector3).crossVectors(e1, nadir);

    if (!this.#from) this.#from = anchorAt(nadir, null);
    const from = this.#from;
    if (!this.#to) {
      const off = from.at.angleTo(nadir);
      if (off > REANCHOR * 2.5) this.#from = anchorAt(nadir, from);
      else if (off > REANCHOR) { this.#to = anchorAt(nadir, from); this.#fade = 0; }
    } else {
      this.#fade += dt / CROSSFADE;
      if (this.#fade >= 1) { this.#from = this.#to; this.#to = null; this.#fade = 0; }
    }
    const a = this.#from!, b = this.#to ?? this.#from!;
    (FRAME.anchor0.value as Vector3).copy(a.at);
    (FRAME.axis0.value as Vector3).copy(a.axis);
    (FRAME.anchor1.value as Vector3).copy(b.at);
    (FRAME.axis1.value as Vector3).copy(b.axis);
    const t = this.#to ? (this.#fade * Math.PI) / 2 : 0;
    (FRAME.weight.value as Vector2).set(Math.cos(t), this.#to ? Math.sin(t) : 0);
  }

  /** The swell's height (m) over sea level at p, a point in the planet's frame, and if asked its slope: a vector
   *  along the ground pointing uphill whose length is the rise per metre (a hull's up is normalize(up - slope)). */
  heightAt(p: V3, slope?: V3): number {
    const w = FRAME.weight.value as Vector2;
    const up = _v.set(p.x, p.y, p.z).normalize();
    if (slope) { slope.x = 0; slope.y = 0; slope.z = 0; }
    let h = 0;
    const frames: [Anchor | null, number][] = [[this.#from, w.x], [this.#to, w.y]];
    for (const [f, weight] of frames) {
      if (!f || weight <= 0) continue;
      const { qx, qz, e1, e2 } = inFrame(up, f);
      h += this.long.at(qx, qz, this.#time, _s) * weight;
      if (slope) {
        slope.x += (e1.x * _s[0] + e2.x * _s[1]) * weight;
        slope.y += (e1.y * _s[0] + e2.y * _s[1]) * weight;
        slope.z += (e1.z * _s[0] + e2.z * _s[1]) * weight;
      }
    }
    return h;
  }
}

const _s: [number, number] = [0, 0];

/** A new anchor at a point, its axis carried there from the last one along the great circle between them. */
function anchorAt(at: Vector3, last: Anchor | null): Anchor {
  const axis = new Vector3();
  if (last) {
    _q.setFromUnitVectors(last.at, at);
    axis.copy(last.axis).applyQuaternion(_q);
  } else {
    axis.set(1, 0, 0).addScaledVector(at, -at.x);
    if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1).addScaledVector(at, -at.z);
  }
  axis.addScaledVector(at, -axis.dot(at)).normalize();
  return { at: at.clone(), axis };
}

const _e1 = new Vector3(), _e2 = new Vector3(), _d = new Vector3(), _a2 = new Vector3(), _g = new Vector3(), _t = new Vector3();

/** As surface.ts inFrame: where up lies in an anchor's plane (metres) and the plane's axes carried to up. */
function inFrame(up: Vector3, f: Anchor): { qx: number; qz: number; e1: Vector3; e2: Vector3 } {
  const A = f.at, a1 = f.axis;
  _a2.crossVectors(A, a1);
  const c = up.dot(A);
  _d.copy(up).addScaledVector(A, -c);
  const s = _d.length();
  if (s > 1e-7) _d.divideScalar(s); else _d.copy(a1);
  const theta = Math.atan2(s, c);
  const cp = _d.dot(a1), sp = _d.dot(_a2);
  _g.copy(_d).multiplyScalar(Math.cos(theta)).addScaledVector(A, -Math.sin(theta));
  _t.crossVectors(A, _d);
  _e1.copy(_g).multiplyScalar(cp).addScaledVector(_t, -sp);
  _e2.copy(_g).multiplyScalar(sp).addScaledVector(_t, cp);
  return { qx: cp * theta * R, qz: sp * theta * R, e1: _e1, e2: _e2 };
}

export { WATER, CALM_SEA, type SeaState };
