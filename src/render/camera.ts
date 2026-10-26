import * as THREE from 'three';
import { R } from '../sim/sphere.ts';
import { EVENT, PHASE, SHIPS, type MatchState } from '../sim/state.ts';
import { crowsNest } from '../sim/items.ts';
import type { Net } from './chart.ts';

interface XYZ { x: number; y: number; z: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface RigView { width: number; height: number; safe: Insets }

export const DECK_LOW = { up: 2.6, back: 8.5, raise: 1.4, ahead: 9 } as const;
export const DECK_HIGH = { up: 12, back: 25, raise: 2.4, ahead: 15 } as const;
export const ORBIT_DIST = 380;
export const LIFT_DECK = 1, LIFT_CHART = 2;
export const SEA_CLEAR = 1.2, GROUND_CLEAR = 1.6;
export const PLAY_SPAN = 90, PLAY_PAD = 14, PLAY_REACH = 40;
export const PLAY_TURN = 1.2;
export const CINE = { openSwing: 0, openLow: 0, openBack: 0, settle: 0.3, pullArea: 160, pullRate: 0.18, crowRate: 1.2, pullBack: 26, pullUp: 16, pullHold: 3.5, sinkUp: 4.2, sinkBack: 11.4, sinkFov: 32, sinkSwing: 1.25, sinkAim: 1.6, rise: 3.2, liftAt: 11, lift: 2.6, liftUp: 41, liftBack: 22, hold: 11.2, holdRM: 12.5, crow: 0.5 } as const;
export const REDUCED_VEIL = 0.3;
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const PLAYER = 0;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const easeIO = (x: number) => { const t = clamp(x, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function zoomPhases(z: number): { rise: number; flat: number; unfold: number } {
  return { rise: easeIO(z / 0.5), flat: ease((z - 0.5) / 0.16), unfold: easeIO((z - 0.66) / 0.34) };
}

export const ZOOM_LOG_RATE = 5.6;
export const ZOOM_LOG_ACCEL = 55;
export const ZOOM_DECK_PACE = 0.6;
export const ZOOM_DOWN_PACE = 0.8;
const ZOOM_SLOPE: readonly number[] = [
  3.78, 3.66, 3.45, 3.26, 3.09, 2.94, 2.8, 2.68, 2.56, 2.46, 2.36, 2.27, 2.18, 2.11, 2.03, 1.97, 1.9, 1.84, 1.79, 1.73,
  1.69, 1.64, 1.59, 1.55, 1.51, 1.47, 1.44, 1.4, 1.37, 1.34, 1.31, 1.28, 1.25, 1.23, 1.2, 1.18, 1.15, 1.13, 1.11, 1.09,
  1.07, 0.79, 2.23, 4.3, 6.83, 9.57, 12.24, 14.61, 16.65, 18.65, 19.76, 17.28, 13.56, 10.47, 7.78, 5.49, 3.61, 2.15, 1.08, 0.5,
  1.19, 3.2, 4.32, 4.54, 4.45, 3.59, 1.95, 0.5, 1.23, 2.69, 4.6, 6.82, 9.13, 10.72, 9.5, 6.44, 4.17, 2.47, 1.24, 0.5,
  0.5,
];
const KNOT = 40;
const ZOOM_S: readonly number[] = ZOOM_SLOPE.reduce<number[]>((s, v, i) => (i ? [...s, s[i - 1] + (ZOOM_SLOPE[i - 1] + v) / (2 * KNOT)] : [0]), []);
function slopeAt(lift: number): number {
  const x = clamp(lift, 0, LIFT_CHART) * KNOT, i = Math.min(ZOOM_SLOPE.length - 2, Math.floor(x));
  return ZOOM_SLOPE[i] + (ZOOM_SLOPE[i + 1] - ZOOM_SLOPE[i]) * (x - i);
}
export function zoomS(lift: number): number {
  const x = clamp(lift, 0, LIFT_CHART) * KNOT, i = Math.min(ZOOM_SLOPE.length - 2, Math.floor(x)), t = x - i;
  const a = ZOOM_SLOPE[i], b = ZOOM_SLOPE[i + 1];
  return ZOOM_S[i] + (a * t + ((b - a) * t * t) / 2) / KNOT;
}
export function zoomLift(s: number): number {
  let lo = 0, hi = LIFT_CHART;
  for (let k = 0; k < 48; k++) { const m = (lo + hi) / 2; if (zoomS(m) < s) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export class Zoom {
  lift = 0.35;
  target = 0.35;
  vel = 0;
  reducedMotion = false;
  veil = 0;
  private held = false;
  private base = 0;
  private deck = 0.35;
  private lastT = 0;
  private lastRaw = 0;
  private rate = 0;
  private sv = 0;

  get z(): number { return clamp(this.lift - LIFT_DECK, 0, 1); }
  get deckLift(): number { return clamp(this.lift, 0, LIFT_DECK); }
  get chartOpen(): boolean { return this.lift > LIFT_DECK + 1e-4 || this.target > LIFT_DECK; }
  get holding(): boolean { return this.held; }

  grab(t: number): void {
    this.held = true;
    this.base = this.target = this.lift;
    this.lastT = t;
    this.lastRaw = this.lift;
    this.rate = 0;
  }
  pinch(ratio: number, t: number): void {
    if (!this.held || !(ratio > 0)) return;
    const raw = this.base - Math.log(ratio) * 1.15;
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
  private turn(): void { if ((this.target - this.lift) * this.vel < 0) { this.vel *= 0.2; this.sv = 0; } }
  set(lift: number): void { this.lift = this.target = clamp(lift, 0, LIFT_CHART); this.vel = 0; this.sv = 0; if (lift <= LIFT_DECK) this.deck = this.lift; }

  step(dt: number): void {
    const h = Math.min(dt, 1 / 30), prev = this.lift;
    if (!(h > 0)) return;
    if (this.reducedMotion && !this.held) {
      if (this.lift !== this.target) { this.lift = this.target; this.vel = this.sv = 0; this.veil = 1; }
      else this.veil = Math.max(0, this.veil - h / REDUCED_VEIL);
      return;
    }
    if (this.held) {
      const w = 22, x0 = this.lift - this.target, e = Math.exp(-w * h), v0 = this.vel;
      this.lift = this.target + (x0 + (v0 + w * x0) * h) * e;
      this.vel = (v0 - (v0 + w * x0) * w * h) * e;
      const cap = (ZOOM_LOG_RATE * (prev < LIFT_DECK ? ZOOM_DECK_PACE : 1) * h) / slopeAt(prev), dl = this.lift - prev;
      if (Math.abs(dl) > cap) { this.lift = prev + Math.sign(dl) * cap; this.vel = (Math.sign(dl) * cap) / h; }
      this.sv = (zoomS(this.lift) - zoomS(prev)) / h;
    } else {
      const s = zoomS(this.lift), goal = zoomS(this.target), r = goal - s;
      if (Math.abs(r) < 1e-9) { this.lift = this.target; this.vel = this.sv = 0; return; }
      const pace = ZOOM_LOG_RATE * (r > 0 ? 1 : this.lift < LIFT_DECK + 0.05 ? ZOOM_DECK_PACE : ZOOM_DOWN_PACE);
      const want = Math.sign(r) * Math.min(pace, Math.sqrt(2 * ZOOM_LOG_ACCEL * Math.abs(r)));
      this.sv += clamp(want - this.sv, -ZOOM_LOG_ACCEL * h, ZOOM_LOG_ACCEL * h);
      const next = s + this.sv * h;
      if ((goal - next) * r <= 0) { this.lift = this.target; this.sv = 0; } else this.lift = zoomLift(next);
      this.vel = (this.lift - prev) / h;
    }
    if (Math.abs(this.lift - this.target) < 1e-5 && Math.abs(this.vel) < 1e-4) { this.lift = this.target; this.vel = 0; this.sv = 0; }
  }
}

interface Finger { readonly phase: 'down' | 'move' | 'up' | 'cancel'; readonly id: number; readonly x: number; readonly y: number }

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

function turn(h: THREE.Vector3, s: THREE.Vector3, a: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(a), sn = Math.sin(a), sx = s.y * h.z - s.z * h.y, sy = s.z * h.x - s.x * h.z, sz = s.x * h.y - s.y * h.x;
  return out.set(h.x * c + sx * sn, h.y * c + sy * sn, h.z * c + sz * sn);
}
function signedAngle(a: THREE.Vector3, b: THREE.Vector3, s: THREE.Vector3): number {
  const cx = a.y * b.z - a.z * b.y, cy = a.z * b.x - a.x * b.z, cz = a.x * b.y - a.y * b.x;
  return Math.atan2(cx * s.x + cy * s.y + cz * s.z, a.dot(b));
}
const finite = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

export class CameraRig {
  readonly zoom = new Zoom();
  readonly pinch = new Pinch(this.zoom);
  focus: THREE.Vector3 | null = null;
  seen = 0;
  raise = 0;
  readonly cine = { open: 0, sink: 0, pull: 0, want: 0, crow: 0, sunkFor: 0, opened: false, tick: -1, hold: false };
  private fov0: number | undefined;
  playOut: { toward: THREE.Vector3; ring: readonly THREE.Vector3[]; ships: readonly THREE.Vector3[] } | null = null;
  private readonly pfC = V(); private pfD = 0; private pfPrimed = false; private pfDt = 0;
  private turned = 0; private turnAngle = -1;
  private readonly sw = V(); private readonly hw = V(); private readonly qa = new THREE.Quaternion(); private readonly qb = new THREE.Quaternion();
  get reducedMotion(): boolean { return this.zoom.reducedMotion; }
  set reducedMotion(v: boolean) { this.zoom.reducedMotion = v; }
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
    this.zoom.reducedMotion = prefersReducedMotion();
  }

  layout(view: RigView): void { this.view = view; }
  get z(): number { return this.zoom.z; }
  get chartOpen(): boolean { return this.zoom.chartOpen; }

  private unitsPerPx(d: number): number {
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(1, this.view.height);
  }

  private ship(state: MatchState, alpha: number): void {
    const p = state.ships[PLAYER];
    const s = this.s.set(lerp(p.was.x, p.pos.x, alpha), lerp(p.was.y, p.pos.y, alpha), lerp(p.was.z, p.pos.z, alpha)).normalize();
    const h = this.h.set(lerp(p.wasHead.x, p.head.x, alpha), lerp(p.wasHead.y, p.head.y, alpha), lerp(p.wasHead.z, p.head.z, alpha));
    h.addScaledVector(s, -h.dot(s));
    if (h.lengthSq() < 1e-10) h.set(1, 0, 0).addScaledVector(s, -s.x);
    h.normalize();
  }

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

  frame(state: MatchState, alpha: number, clock: number, dt: number, zoomDt = dt): void {
    this.zoom.step(zoomDt);
    this.pfDt = zoomDt;
    this.ship(state, alpha);
    this.cineStep(state, zoomDt);
    const s = this.s, h = this.h;
    if (!this.primed || !finite(this.hCam)) { this.hCam.copy(h); this.hPrev.copy(h); this.yawVel = 0; this.omega = 0; this.primed = true; }
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

  private cineStep(state: MatchState, real: number): void {
    const c = this.cine, me = state.ships[PLAYER], rm = this.zoom.reducedMotion, h = Math.min(Math.max(real, 0), 1 / 30);
    if (c.hold) return;
    const first = c.tick < 0;
    const open = !rm && me.phase === PHASE.riding ? 1 : 0;
    c.open = first || rm ? open : c.open + clamp((open - c.open) * (1 - Math.exp(-h * 1.5)), -CINE.settle * h, CINE.settle * h);
    if (state.tick !== c.tick) {
      c.tick = state.tick;
      for (const e of state.events) if (e.kind === EVENT.loop && e.ship === PLAYER) c.want = Math.max(c.want, clamp(Math.sqrt(Math.max(0, e.amount)) / CINE.pullArea, 0.12, 1));
    }
    if (rm) c.want = c.pull = 0;
    else { c.pull += clamp((c.want - c.pull) * (1 - Math.exp(-h * 2.2)), -CINE.pullRate * h, CINE.pullRate * h); c.want *= Math.exp(-h / CINE.pullHold); }
    const crow = crowsNest(me) * CINE.crow;
    c.crow = rm || first ? crow : c.crow + clamp((crow - c.crow) * (1 - Math.exp(-h * 1.5)), -CINE.crowRate * h, CINE.crowRate * h);
    if (me.phase === PHASE.sunk) {
      c.sunkFor += h;
      c.sink = rm ? 0 : ease(c.sunkFor / CINE.rise);
      if (!c.opened && c.sunkFor >= (rm ? CINE.holdRM : CINE.rise + CINE.hold)) { c.opened = true; this.zoom.open(); }
      const po = this.playOut, zoom = this.zoom;
      if (po && c.opened && this.turned < 1) {
        if (this.turnAngle < 0) this.turnAngle = Math.acos(clamp(this.s.dot(po.toward), -1, 1));
        if (rm || this.turnAngle < 0.02) this.turned = 1;
        else {
          if (zoom.target > LIFT_DECK + 0.5) zoom.target = LIFT_DECK + 0.5;
          if (zoom.z >= 0.5 - 1e-3) this.turned = Math.min(1, this.turned + h / Math.max(0.8, this.turnAngle / PLAY_TURN));
        }
        if (this.turned >= 1) zoom.open();
      }
    } else { c.sunkFor = 0; c.sink = 0; c.opened = false; }
    if (!this.playOut) { this.turned = 0; this.turnAngle = -1; }
  }

  private pose(clock: number): void {
    const zoom = this.zoom, z = zoom.z, ph = zoomPhases(z);
    const po = this.playOut, ws = po ? easeIO(this.turned) : 0;
    const s = this.sw.copy(this.s), hCam = this.hw.copy(this.hCam);
    if (!po) this.pfPrimed = false;
    if (po && ws > 0 && z > 0) {
      this.qb.identity().slerp(this.qa.setFromUnitVectors(this.s, po.toward), ws);
      s.applyQuaternion(this.qb).normalize();
      hCam.applyQuaternion(this.qb).addScaledVector(s, -hCam.dot(s)).normalize();
    }
    const d = clamp(zoom.deckLift, 0, 1), rm = zoom.reducedMotion;
    const c = this.cine, cw = 1 - ph.rise;
    const ks = c.sink * cw, kl = (c.sink > 0 && !c.hold ? ease((c.sunkFor - CINE.liftAt) / CINE.lift) : 0) * cw;
    this.fov0 ??= this.camera.fov;
    const fov = lerp(this.fov0, CINE.sinkFov, ks * (1 - kl));
    if (Math.abs(this.camera.fov - fov) > 1e-4) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const up = lerp(lerp(DECK_LOW.up, DECK_HIGH.up, d) * (1 - CINE.openLow * c.open) + (c.crow + c.pull * CINE.pullUp) * cw, CINE.sinkUp, ks) + kl * CINE.liftUp;
    const back = lerp(lerp(DECK_LOW.back, DECK_HIGH.back, d) + this.stand + (c.open * CINE.openBack + c.pull * CINE.pullBack) * cw, CINE.sinkBack, ks) + kl * CINE.liftBack;
    const raise = lerp(DECK_LOW.raise, DECK_HIGH.raise, d), ahead = lerp(DECK_LOW.ahead, DECK_HIGH.ahead, d);
    const dist0 = Math.hypot(up, back), th0 = Math.atan2(up, back);
    const north = this.north.copy(AXIS_N).addScaledVector(s, -AXIS_N.dot(s));
    if (north.lengthSq() < 1e-8) north.copy(hCam); else north.normalize();
    let sw = signedAngle(hCam, north, s);
    if (z <= 0 || !Number.isFinite(this.swingPrev)) this.swingPrev = sw;
    else { while (sw - this.swingPrev > Math.PI) sw -= 2 * Math.PI; while (sw - this.swingPrev < -Math.PI) sw += 2 * Math.PI; this.swingPrev = sw; }
    const swing = sw * ease((z - 0.22) / 0.28);
    const hv = turn(hCam, s, swing + (c.open * CINE.openSwing + c.sink * CINE.sinkSwing) * cw, this.hv);
    if (z < 0.5 || !this.net) {
      const r = ph.rise, dist = dist0 * Math.pow(ORBIT_DIST / dist0, r), th = lerp(th0, Math.PI / 2, r);
      const bob = rm ? 0 : (0.14 * Math.sin(clock * 1.13) + 0.07 * Math.sin(clock * 0.61 + 2)) * (1 - r);
      const onto = 1 - c.sink * cw;
      const t = this.t.copy(s).multiplyScalar(R + raise * (1 - r) * onto + Math.max(0, ks - kl) * CINE.sinkAim + bob * 0.4).addScaledVector(hv, ahead * (1 - r) * onto);
      const eye = this.eye.copy(t).addScaledVector(hv, -dist * Math.cos(th)).addScaledVector(s, dist * Math.sin(th) + bob);
      if (z < 0.2) this.collide(t, eye, r);
      const u = this.up.copy(s).multiplyScalar(Math.cos(th)).addScaledVector(hv, Math.sin(th));
      const roll = rm ? 0 : (-this.omega * 0.07 + 0.018 * Math.sin(clock * 0.71 + 1)) * (1 - r);
      this.place(eye, t, u, roll);
      this.setFar(dist + R * 2.2);
      return;
    }
    const net = this.net, fit = net.fit(this.camera, this.view);
    net.pose(ph.unfold);
    const fr = po ? this.playFrame(po, fit) : fit;
    const t = net.toNet(s, ph.flat, this.t).lerp(fr.centre, ph.unfold);
    const b = this.tmp.copy(s).lerp(net.normal, ph.flat).normalize();
    const u = this.up.copy(north).lerp(fit.up, ph.unfold);
    u.addScaledVector(b, -u.dot(b)).normalize();
    const dist = ORBIT_DIST * Math.pow(fr.dist / ORBIT_DIST, ph.unfold);
    const sx = (this.view.safe.left - this.view.safe.right) / 2, sy = (this.view.safe.bottom - this.view.safe.top) / 2, k = this.unitsPerPx(dist) * ph.unfold;
    const right = this.tmp2.crossVectors(u, b);
    t.addScaledVector(right, -sx * k).addScaledVector(u, -sy * k);
    const eye = this.eye.copy(t).addScaledVector(b, dist);
    this.place(eye, t, u, 0);
    this.setFar(dist + R * 2.5);
  }

  private playFrame(po: NonNullable<CameraRig['playOut']>, fit: ReturnType<Net['fit']>): { centre: THREE.Vector3; dist: number } {
    const net = this.net!, p = this.tmp, cx = fit.centre.dot(fit.right), cy = fit.centre.dot(fit.up);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    if (po.ring.length > 0) {
      net.toFlat(po.toward, p);
      const ox = p.dot(fit.right) - cx, oy = p.dot(fit.up) - cy, at: [number, number, number][] = [];
      for (const d of po.ring) { net.toFlat(d, p); const x = p.dot(fit.right) - cx, y = p.dot(fit.up) - cy; at.push([x, y, Math.hypot(x - ox, y - oy)]); }
      const reach = 1.5 * [...at].sort((a, b) => a[2] - b[2])[at.length >> 1][2];
      const add = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
      for (const [x, y, d] of at) if (d <= reach) add(x, y);
      for (const d of po.ships) {
        net.toFlat(d, p);
        const x = p.dot(fit.right) - cx, y = p.dot(fit.up) - cy;
        if (Math.hypot(x - ox, y - oy) <= reach + PLAY_REACH) add(x, y);
      }
    }
    const hw = fit.width / 2, hh = fit.height / 2;
    if (!(x1 >= x0)) { x0 = -hw; x1 = hw; y0 = -hh; y1 = hh; }
    const grow = (a: number, b: number, half: number): [number, number] => {
      const m = (a + b) / 2, r = Math.max((b - a) / 2 + PLAY_PAD, PLAY_SPAN / 2);
      return [clamp(m - r, -half, half), clamp(m + r, -half, half)];
    };
    [x0, x1] = grow(x0, x1, hw); [y0, y1] = grow(y0, y1, hh);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2), W = Math.max(1, this.view.width), H = Math.max(1, this.view.height), sf = this.view.safe;
    const sw = (W - sf.left - sf.right) / W, sh = (H - sf.top - sf.bottom) / H;
    let dist = Math.max((y1 - y0) / 2 / (tanV * sh), (x1 - x0) / 2 / (tanV * (W / H) * sw));
    const c = this.tmp2.copy(fit.centre).addScaledVector(fit.right, (x0 + x1) / 2).addScaledVector(fit.up, (y0 + y1) / 2);
    if (dist >= fit.dist) { dist = fit.dist; c.copy(fit.centre); }
    const k = this.pfPrimed && !this.zoom.reducedMotion ? 1 - Math.exp(-this.pfDt * 1.2) : 1;
    this.pfC.lerp(c, k);
    this.pfD = this.pfPrimed ? Math.exp(lerp(Math.log(this.pfD), Math.log(dist), k)) : dist;
    if (!this.pfPrimed) this.pfC.copy(c);
    this.pfPrimed = true;
    return { centre: this.pfC, dist: this.pfD };
  }

  private setFar(far: number): void {
    const cam = this.camera, f = Math.max(2000, far), n = this.zoom.z > 0.05 ? 1 : 0.1;
    if (Math.abs(cam.far - f) > 1 || cam.near !== n) { cam.far = f; cam.near = n; cam.updateProjectionMatrix(); }
  }

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
    this.raise = want > this.raise ? want : Math.max(want, this.raise - 0.12);
    if (this.raise > 0) eye.addScaledVector(dir.copy(eye).normalize(), this.raise);
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

  preset(name: 'deckLow' | 'deckHigh' | 'midPull' | 'orbit' | 'chart'): void {
    const lift = { deckLow: 0, deckHigh: 1, midPull: 1.24, orbit: 1.5, chart: 2 }[name];
    this.zoom.set(lift);
  }
}
