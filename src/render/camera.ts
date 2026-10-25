// WP24: the camera. One parameter, the lift, drives the whole view: 0..1 is the deck range (low over the deck to high
// behind the masts, the pinch), 1..2 is the chart zoom z = lift − 1 (A8): z 0→0.5 the camera rises from the chase to
// orbit over the player's ship, z 0.5→1 the chart globe flattens and unrolls onto parchment (chart.ts Net) while the
// camera settles square over it. Every pose is a continuous function of (lift, ship, heading, the smoothed follow
// state), so the zoom can be stopped, reversed or grabbed again at any point with no cut.
//
// The deck camera follows the player's ship with weight: a critically damped yaw spring trails the heading, looks
// ahead into turns and leans toward a focus (a rival in sight closing, or one gameplay names), stands back to frame a
// fight, banks a little into turns and breathes with the swell (both stop with the render clock, so the pause
// freezes them). It never goes inside terrain or below the sea: the eye is held over the ground and raised when land
// would block its line to the ship.
import * as THREE from 'three';
import { R } from '../sim/sphere.ts';
import { PHASE, SHIPS, type MatchState } from '../sim/state.ts';
import type { Net } from './chart.ts';

interface XYZ { x: number; y: number; z: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface RigView { width: number; height: number; safe: Insets }

/** The two ends of the deck pinch: eye height and stand-back (u), target raise and look-ahead (u). */
export const DECK_LOW = { up: 2.6, back: 8.5, raise: 1.4, ahead: 9 } as const;
export const DECK_HIGH = { up: 12, back: 25, raise: 2.4, ahead: 15 } as const;
/** Orbit: the eye's distance over the ship's sea point when z = 0.5, u (the globe fills ~85 % of the view). */
export const ORBIT_DIST = 380;
/** Lift values: where the deck range ends (the chart starts) and the chart is fully open. */
export const LIFT_DECK = 1, LIFT_CHART = 2;
/** Eye clearance over the sea and the ground, u. */
export const SEA_CLEAR = 1.2, GROUND_CLEAR = 1.6;

const PLAYER = 0;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const easeIO = (x: number) => { const t = clamp(x, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The zoom's two halves of z (A8): the lift to orbit, then the flatten and the unroll. */
export function zoomPhases(z: number): { rise: number; flat: number; unfold: number } {
  return { rise: easeIO(z / 0.5), flat: ease((z - 0.5) / 0.16), unfold: easeIO((z - 0.66) / 0.34) };
}

/**
 * The lift with its gesture and spring. While fingers hold it, it follows the pinch closely; let go above the deck
 * range and it settles open or shut by where and how fast it was moving; open()/close() run the whole move (the
 * compact chart's tap, the chart edge's tap). Critically damped, so a move from rest never overshoots: monotonic.
 */
export class Zoom {
  lift = 0.35;
  target = 0.35;
  vel = 0;
  reducedMotion = false;
  private held = false;
  private base = 0;
  private deck = 0.35;
  private lastT = 0;
  private lastRaw = 0;
  private rate = 0;

  get z(): number { return clamp(this.lift - LIFT_DECK, 0, 1); }
  get deckLift(): number { return clamp(this.lift, 0, LIFT_DECK); }
  /** The chart is open (or opening): the match pauses (WP5 Loop.paused) while this holds. */
  get chartOpen(): boolean { return this.lift > LIFT_DECK + 1e-4 || this.target > LIFT_DECK; }
  get holding(): boolean { return this.held; }

  grab(t: number): void {
    this.held = true;
    this.base = this.target = this.lift;
    this.lastT = t;
    this.lastRaw = this.lift;
    this.rate = 0;
  }
  /** `ratio` = the fingers' spread now / at the grab: closing them (< 1) lifts toward the chart, spreading lowers. */
  pinch(ratio: number, t: number): void {
    if (!this.held || !(ratio > 0)) return;
    const raw = this.base - Math.log(ratio) * 1.15;
    // a detent where the deck range meets the chart: the deck's top holds a moment before the sea lets go
    const d = raw > LIFT_DECK ? Math.max(LIFT_DECK, raw - 0.08 * Math.min(1, (raw - LIFT_DECK) / 0.08)) : raw;
    this.target = clamp(d, 0, LIFT_CHART);
    const dt = t - this.lastT;
    if (dt > 1e-3) { this.rate = lerp(this.rate, (raw - this.lastRaw) / dt, 0.5); this.lastT = t; this.lastRaw = raw; }
  }
  release(): void {
    if (!this.held) return;
    this.held = false;
    if (this.target > LIFT_DECK) {
      const open = this.rate > 0.6 || (this.rate > -0.6 && this.target > LIFT_DECK + 0.22);
      if (open) this.open(); else this.close();
    } else this.deck = this.target;
  }
  open(): void { if (this.target <= LIFT_DECK) this.deck = Math.min(this.target, LIFT_DECK); this.target = LIFT_CHART; this.turn(); }
  close(): void { this.target = this.deck; this.turn(); }
  /** A reversal mid-move turns at once: momentum against the new way is mostly shed. */
  private turn(): void { if ((this.target - this.lift) * this.vel < 0) this.vel *= 0.2; }
  /** Sets the deck pinch directly (camera presets, tests). */
  set(lift: number): void { this.lift = this.target = clamp(lift, 0, LIFT_CHART); this.vel = 0; if (lift <= LIFT_DECK) this.deck = this.lift; }

  step(dt: number): void {
    const w = this.held ? 22 : this.reducedMotion ? 14 : 5.2, h = Math.min(dt, 1 / 30);
    // exact critically damped step: no overshoot at any frame rate
    const x0 = this.lift - this.target, e = Math.exp(-w * h);
    const v0 = this.vel;
    this.lift = this.target + (x0 + (v0 + w * x0) * h) * e;
    this.vel = (v0 - (v0 + w * x0) * w * h) * e;
    if (Math.abs(this.lift - this.target) < 1e-5 && Math.abs(this.vel) < 1e-4) { this.lift = this.target; this.vel = 0; }
  }
}

/** A finger on the screen (ui/shell.ts Touch). */
interface Finger { readonly phase: 'down' | 'move' | 'up' | 'cancel'; readonly id: number; readonly x: number; readonly y: number }

/** Two fingers drive the zoom; one finger is left to the controls (WP25). touch() returns true when it took it. */
export class Pinch {
  private readonly at = new Map<number, { x: number; y: number }>();
  private d0 = 0;
  private readonly zoom: Zoom;
  private readonly now: () => number;
  constructor(zoom: Zoom, now: () => number = () => performance.now() / 1000) { this.zoom = zoom; this.now = now; }
  private spread(): number {
    const [a, b] = [...this.at.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  touch(t: Finger): boolean {
    if (t.phase === 'down') {
      if (this.at.size >= 2) return false;
      this.at.set(t.id, { x: t.x, y: t.y });
      if (this.at.size === 2) { this.d0 = Math.max(8, this.spread()); this.zoom.grab(this.now()); }
      return this.at.size === 2;
    }
    const p = this.at.get(t.id);
    if (!p) return false;
    const two = this.at.size === 2;
    if (t.phase === 'move') {
      p.x = t.x; p.y = t.y;
      if (two) this.zoom.pinch(this.spread() / this.d0, this.now());
      return two;
    }
    this.at.delete(t.id);
    if (two) this.zoom.release();
    return two;
  }
}

const V = () => new THREE.Vector3();
const AXIS_N = new THREE.Vector3(0, 1, 0);

/** Rotates tangent `h` about the radial `s` by `a` (right-handed, s outward). */
function turn(h: THREE.Vector3, s: THREE.Vector3, a: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(a), sn = Math.sin(a), sx = s.y * h.z - s.z * h.y, sy = s.z * h.x - s.x * h.z, sz = s.x * h.y - s.y * h.x;
  return out.set(h.x * c + sx * sn, h.y * c + sy * sn, h.z * c + sz * sn);
}
/** Signed angle from tangent a to tangent b about radial s. */
function signedAngle(a: THREE.Vector3, b: THREE.Vector3, s: THREE.Vector3): number {
  const cx = a.y * b.z - a.z * b.y, cy = a.z * b.x - a.x * b.z, cz = a.x * b.y - a.y * b.x;
  return Math.atan2(cx * s.x + cy * s.y + cz * s.z, a.dot(b));
}
const finite = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * The camera rig: drives a PerspectiveCamera from the match state, the zoom and (past orbit) the chart's net.
 * `heightAt(dir)` is the ground's height (u above mean sea level) under a unit direction.
 */
export class CameraRig {
  readonly zoom = new Zoom();
  readonly pinch = new Pinch(this.zoom);
  /** A point gameplay wants framed (a target, an attacker); null lets the rig choose the nearest rival in sight. */
  focus: THREE.Vector3 | null = null;
  /** The player's sight (Sight.ships bits) from the chart module, for the automatic focus. */
  seen = 0;
  /** Eye raise held for terrain, u (rises at once, eases back). */
  raise = 0;
  private view: RigView = { width: 1, height: 1, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  private readonly s = V(); private readonly h = V(); private readonly hCam = V(); private readonly hPrev = V();
  private swingPrev = NaN;
  private yawVel = 0; private omega = 0; private bias = 0; private stand = 0; private primed = false;
  private readonly t = V(); private readonly eye = V(); private readonly up = V(); private readonly tmp = V();
  private readonly tmp2 = V(); private readonly north = V(); private readonly hv = V(); private readonly f = V();

  readonly camera: THREE.PerspectiveCamera;
  readonly heightAt: (dir: XYZ) => number;
  readonly net: Net | null;
  constructor(camera: THREE.PerspectiveCamera, heightAt: (dir: XYZ) => number, net: Net | null = null) {
    this.camera = camera; this.heightAt = heightAt; this.net = net;
  }

  layout(view: RigView): void { this.view = view; }
  get z(): number { return this.zoom.z; }
  get chartOpen(): boolean { return this.zoom.chartOpen; }

  /** World units per CSS px at distance d (vertical). */
  private unitsPerPx(d: number): number {
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(1, this.view.height);
  }

  /** The player's interpolated position and heading into s, h. */
  private ship(state: MatchState, alpha: number): void {
    const p = state.ships[PLAYER];
    const s = this.s.set(lerp(p.was.x, p.pos.x, alpha), lerp(p.was.y, p.pos.y, alpha), lerp(p.was.z, p.pos.z, alpha)).normalize();
    const h = this.h.set(lerp(p.wasHead.x, p.head.x, alpha), lerp(p.wasHead.y, p.head.y, alpha), lerp(p.wasHead.z, p.head.z, alpha));
    h.addScaledVector(s, -h.dot(s));
    if (h.lengthSq() < 1e-10) h.set(1, 0, 0).addScaledVector(s, -s.x);
    h.normalize();
  }

  /** The automatic focus: the nearest rival in sight within 70 u, else none. Into tmp2; returns its distance or −1. */
  private autoFocus(state: MatchState): number {
    if (this.focus) { this.tmp2.copy(this.focus).normalize(); return Math.acos(clamp(this.tmp2.dot(this.s), -1, 1)) * R; }
    let best = 70, k = -1;
    for (let i = 0; i < SHIPS && i < state.ships.length; i++) {
      if (i === PLAYER || !(this.seen & (1 << i)) || state.ships[i].phase === PHASE.sunk) continue;
      const q = state.ships[i].pos, d = Math.acos(clamp(q.x * this.s.x + q.y * this.s.y + q.z * this.s.z, -1, 1)) * R;
      if (d < best) { best = d; k = i; }
    }
    if (k < 0) return -1;
    const q = state.ships[k].pos;
    this.tmp2.set(q.x, q.y, q.z);
    return best;
  }

  /** One frame: dt the render step (0 while paused), clock the render clock (stops on pause). */
  frame(state: MatchState, alpha: number, clock: number, dt: number, zoomDt = dt): void {
    this.zoom.step(zoomDt);
    this.ship(state, alpha);
    const s = this.s, h = this.h;
    if (!this.primed || !finite(this.hCam)) { this.hCam.copy(h); this.hPrev.copy(h); this.yawVel = 0; this.omega = 0; this.primed = true; }
    // carry the follow heading over the curve, then spring it after the heading, ahead into the turn, toward the focus
    this.hCam.addScaledVector(s, -this.hCam.dot(s)).normalize();
    this.hPrev.addScaledVector(s, -this.hPrev.dot(s)).normalize();
    if (dt > 0) {
      const w = signedAngle(this.hPrev, h, s) / dt;
      this.omega = lerp(this.omega, clamp(w, -1.5, 1.5), 1 - Math.exp(-dt * 3));
      const fd = this.autoFocus(state);
      let bias = 0, stand = 0;
      if (fd >= 0) {
        const to = this.tmp.copy(this.tmp2).addScaledVector(s, -this.tmp2.dot(s));
        if (to.lengthSq() > 1e-12) {
          const a = signedAngle(h, to.normalize(), s), near = clamp((70 - fd) / 50, 0, 1);
          bias = clamp(a * 0.35, -0.5, 0.5) * near;
          stand = near * 7;
        }
      }
      this.bias = lerp(this.bias, bias, 1 - Math.exp(-dt * 1.5));
      this.stand = lerp(this.stand, stand, 1 - Math.exp(-dt * 1.2));
      const want = turn(h, s, clamp(this.omega * 0.8, -0.42, 0.42) + this.bias, this.tmp);
      const err = signedAngle(this.hCam, want, s), k = 9, c = 2 * Math.sqrt(k);
      this.yawVel += (k * err - c * this.yawVel) * Math.min(dt, 1 / 30);
      turn(this.hCam, s, this.yawVel * Math.min(dt, 1 / 30), this.tmp2);
      this.hCam.copy(this.tmp2).addScaledVector(s, -this.tmp2.dot(s)).normalize();
    }
    this.hPrev.copy(h);
    this.pose(clock);
  }

  /** Places the camera for the current lift (no smoothing here: a pure function of the follow state). */
  private pose(clock: number): void {
    const s = this.s, zoom = this.zoom, z = zoom.z, ph = zoomPhases(z);
    const d = clamp(zoom.deckLift, 0, 1), rm = zoom.reducedMotion;
    const up = lerp(DECK_LOW.up, DECK_HIGH.up, d), back = lerp(DECK_LOW.back, DECK_HIGH.back, d) + this.stand;
    const raise = lerp(DECK_LOW.raise, DECK_HIGH.raise, d), ahead = lerp(DECK_LOW.ahead, DECK_HIGH.ahead, d);
    const dist0 = Math.hypot(up, back), th0 = Math.atan2(up, back);
    // north in the ship's tangent plane: the chart is drawn north-up, so the view swings to it near orbit
    const north = this.north.copy(AXIS_N).addScaledVector(s, -AXIS_N.dot(s));
    if (north.lengthSq() < 1e-8) north.copy(this.hCam); else north.normalize();
    // unwrapped while the zoom is under way, so a heading near south never flips the swing's side
    let sw = signedAngle(this.hCam, north, s);
    if (z <= 0 || !Number.isFinite(this.swingPrev)) this.swingPrev = sw;
    else { while (sw - this.swingPrev > Math.PI) sw -= 2 * Math.PI; while (sw - this.swingPrev < -Math.PI) sw += 2 * Math.PI; this.swingPrev = sw; }
    const swing = sw * ease((z - 0.22) / 0.28);
    const hv = turn(this.hCam, s, swing, this.hv);
    if (z < 0.5 || !this.net) {
      const r = ph.rise, dist = dist0 * Math.pow(ORBIT_DIST / dist0, r), th = lerp(th0, Math.PI / 2, r);
      const bob = rm ? 0 : (0.14 * Math.sin(clock * 1.13) + 0.07 * Math.sin(clock * 0.61 + 2)) * (1 - r);
      const t = this.t.copy(s).multiplyScalar(R + raise * (1 - r) + bob * 0.4).addScaledVector(hv, ahead * (1 - r));
      const eye = this.eye.copy(t).addScaledVector(hv, -dist * Math.cos(th)).addScaledVector(s, dist * Math.sin(th) + bob);
      if (z < 0.2) this.collide(t, eye, r);
      const u = this.up.copy(s).multiplyScalar(Math.cos(th)).addScaledVector(hv, Math.sin(th));
      const roll = rm ? 0 : (-this.omega * 0.07 + 0.018 * Math.sin(clock * 0.71 + 1)) * (1 - r);
      this.place(eye, t, u, roll);
      this.setFar(dist + R * 2.2);
      return;
    }
    // past orbit: square over the flattening, unrolling net, its root (the player's region) fixed
    const net = this.net, fit = net.fit(this.camera, this.view);
    net.pose(ph.unfold);
    const t = net.toNet(s, ph.flat, this.t).lerp(fit.centre, ph.unfold);
    const b = this.tmp.copy(s).lerp(net.normal, ph.flat).normalize();
    const u = this.up.copy(north).lerp(fit.up, ph.unfold);
    u.addScaledVector(b, -u.dot(b)).normalize();
    const dist = ORBIT_DIST * Math.pow(fit.dist / ORBIT_DIST, ph.unfold);
    // the safe area: centre the net in the safe rect
    const sx = (this.view.safe.left - this.view.safe.right) / 2, sy = (this.view.safe.bottom - this.view.safe.top) / 2, k = this.unitsPerPx(dist) * ph.unfold;
    const right = this.tmp2.crossVectors(u, b);
    t.addScaledVector(right, -sx * k).addScaledVector(u, -sy * k);
    const eye = this.eye.copy(t).addScaledVector(b, dist);
    this.place(eye, t, u, 0);
    this.setFar(dist + R * 2.5);
  }

  private setFar(far: number): void {
    const cam = this.camera, f = Math.max(2000, far), n = this.zoom.z > 0.05 ? 1 : 0.1;
    if (Math.abs(cam.far - f) > 1 || cam.near !== n) { cam.far = f; cam.near = n; cam.updateProjectionMatrix(); }
  }

  /** Holds the eye over the sea and the ground and clear of land between it and the ship (raises, never pushes in). */
  private collide(t: THREE.Vector3, eye: THREE.Vector3, r: number): void {
    const dir = this.f, need = (p: THREE.Vector3, clear: number) => {
      dir.copy(p).normalize();
      return Math.max(0, this.heightAt(dir)) + clear - (p.length() - R);
    };
    let want = need(eye, Math.max(SEA_CLEAR, GROUND_CLEAR));
    for (let k = 1; k < 8; k++) {
      const f = k / 8, p = this.tmp.copy(t).lerp(eye, f);
      want = Math.max(want, need(p, 0.6) / f);
      const m = this.tmp.copy(this.s).multiplyScalar(R + 1.5).lerp(eye, f);
      want = Math.max(want, need(m, 0.6) / f);
    }
    want = Math.max(0, want) * (1 - r);
    // rise at once when the ground or the line to the ship needs it; ease back down only when descending
    this.raise = want > this.raise ? want : Math.max(want, this.raise - 0.12);
    if (this.raise > 0) eye.addScaledVector(dir.copy(eye).normalize(), this.raise);
    // last guard: never below the floor at the eye itself
    const floor = R + Math.max(0, this.heightAt(dir.copy(eye).normalize())) + SEA_CLEAR;
    if (eye.length() < floor) eye.setLength(floor);
  }

  private place(eye: THREE.Vector3, t: THREE.Vector3, u: THREE.Vector3, roll: number): void {
    const cam = this.camera;
    if (!finite(eye) || !finite(t) || !finite(u)) { this.primed = false; return; }
    cam.position.copy(eye);
    cam.up.copy(u);
    cam.lookAt(t);
    if (roll) cam.rotateZ(roll);
    cam.updateMatrixWorld();
  }

  /** Camera presets for captures (WP27 store shots, WP31 trailer): a deck pinch and a zoom, held still. */
  preset(name: 'deckLow' | 'deckHigh' | 'midPull' | 'orbit' | 'chart'): void {
    const lift = { deckLow: 0, deckHigh: 1, midPull: 1.24, orbit: 1.5, chart: 2 }[name];
    this.zoom.set(lift);
  }
}
