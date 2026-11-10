// The cameras on the sphere: the chase camera from the rewrite's Rig (src/scene.ts), now keeping the local up where
// it stands, an eye-level and a high view for captures, and an orbit view of the whole planet for the Gale that puts
// the line between day and night across the globe. Switching modes flies between them.
import * as THREE from 'three';
import { R } from '../sim/sphere.ts';
import { heightAt } from '../sim/world/index.ts';
import { v3, type V3 } from '../sim/math.ts';

export type CameraMode = 'chase' | 'eye' | 'high' | 'orbit';

/** The orbit view's field of view, degrees: the planet chart cuts its window to the planet it frames. */
export const ORBIT_FOV = 40;

/** What the camera follows: a point on the sea (a unit vector), the way it faces (a unit tangent there). */
export interface CameraTarget {
  pos: V3;
  heading: V3;
  /** Height of the point followed above sea level, in metres (a ship's deck is about 2.5). */
  height?: number;
  /** Orbit: how far the view is pulled from the point onto the line between day and night (0.8 unless given; the
   *  Gale looks straight down on its course). */
  pull?: number;
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** How the chase camera clears the land: the most it adds to the boom's pitch, by what steps, and the metres it leaves
 *  over the land while it rises. */
const RISE = { most: 1.2, step: 0.1, room: 1.5 } as const;
const PITCH_MOST = 1.35;
/** The shortest boom it comes in to, metres, and how many points along the line of sight are tested. */
const CLOSEST = 6, SIGHT_STEPS = 12;

export class CameraRig {
  mode: CameraMode = 'chase';
  /** The sea's level against the mean, metres: the tide, which the target and the camera ride. */
  sea = 0;
  /** Chase: the boom's length and pitch, a sideways offset, and a turn of the camera about the target (radians). */
  dist = 27;
  pitch = 0.2;
  shoulder = 0;
  yaw = 0;
  /** How fast the chase camera swings round behind the heading (per second). */
  follow = 2.2;
  /** Orbit: distance from the planet's centre in radii, and a slow turn about the planet (radians per second). */
  orbitDistance = 3.2;
  orbitSpin = 0;
  fov = 58;
  /** Seconds a switch between modes takes. */
  flight = 2.2;
  /** Seconds the flight under way takes: a mode switch's, or a glide's. */
  private span = 2.2;
  private gliding = 0;
  trauma = 0;
  private kickFov = 0;
  private kickPitch = 0;
  private spun = 0;
  private seeded = false;
  private blend = 1;
  private lastMode: CameraMode = 'chase';
  private readonly fromPos = new THREE.Vector3();
  private readonly fromQuat = new THREE.Quaternion();
  private fromFov = 58;
  private readonly pivot = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3(0, 0, 1);
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly m = new THREE.Matrix4();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly p = v3();
  private readonly x = new THREE.Vector3();
  private readonly deck = new THREE.Vector3();
  /** The pitch the land has added to the boom's, radians. */
  private lift = 0;

  /** Adds trauma: the camera shakes by its square, and it fades over about half a second per 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** A punch: the field of view widens by `fov` degrees and the camera nods by `pitch` radians, then springs back. */
  kick(fov: number, pitch = 0): void {
    this.kickFov += fov;
    this.kickPitch += pitch;
  }

  /** Puts the camera where it should be at once, with no flight or smoothing. */
  snap(): void {
    this.seeded = false;
    this.blend = 1;
  }

  /** Flies from where the camera is now to its next pose over `seconds`, as when the camera moves to another ship. */
  glide(seconds = 1.6): void {
    this.gliding = seconds;
  }

  /** Whether land, and `room` metres over it, cuts the line between two points. */
  #blocked(a: THREE.Vector3, b: THREE.Vector3, room: number): boolean {
    for (let i = 1; i < SIGHT_STEPS; i++) {
      this.x.lerpVectors(a, b, i / SIGHT_STEPS);
      if (this.ground(this.x) + room > this.x.length() - R) return true;
    }
    return false;
  }

  /** The ground's height at a point in metres, never below the sea. */
  private ground(x: THREE.Vector3): number {
    const l = x.length();
    this.p.x = x.x / l; this.p.y = x.y / l; this.p.z = x.z / l;
    return Math.max(this.sea, heightAt(this.p));
  }

  update(cam: THREE.PerspectiveCamera, mode: CameraMode, target: CameraTarget, sun: THREE.Vector3, dt: number, t: number): void {
    if (mode !== this.lastMode) {
      // fly from wherever the camera is now
      this.fromPos.copy(cam.position);
      this.fromQuat.copy(cam.quaternion);
      this.fromFov = cam.fov;
      this.blend = this.seeded ? 0 : 1;
      this.span = this.flight;
      this.lastMode = mode;
    } else if (this.gliding > 0 && this.seeded) {
      this.fromPos.copy(cam.position);
      this.fromQuat.copy(cam.quaternion);
      this.fromFov = cam.fov;
      this.blend = 0;
      this.span = this.gliding;
    }
    this.gliding = 0;
    this.mode = mode;
    const up = this.a.set(target.pos.x, target.pos.y, target.pos.z).normalize();
    const pivot = this.b.copy(up).multiplyScalar(R + this.sea + (target.height ?? 2.5));
    const snapped = !this.seeded;
    const k = this.seeded ? 1 - Math.exp(-dt * 12) : 1;
    this.pivot.lerp(pivot, k);
    // the heading, swung toward the target's and kept along the ground
    const h = this.c.set(target.heading.x, target.heading.y, target.heading.z);
    const pu = pivot.copy(this.pivot).normalize();
    this.fwd.addScaledVector(pu, -this.fwd.dot(pu));
    if (!this.seeded || this.fwd.lengthSq() < 1e-6) this.fwd.copy(h);
    else this.fwd.lerp(h, 1 - Math.exp(-dt * (mode === 'chase' ? this.follow : 8)));
    this.fwd.addScaledVector(pu, -this.fwd.dot(pu)).normalize();
    this.seeded = true;

    if (mode === 'orbit') this.orbitPose(pu, sun, dt, target.pull ?? 0.8);
    else this.groundPose(mode, pu, dt, snapped);

    // the flight between modes: round the planet, not through it
    let pos = this.pos, quat = this.quat, fov = mode === 'orbit' ? ORBIT_FOV : this.fov;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.span);
      const s = smoother(this.blend);
      const r0 = this.fromPos.length(), r1 = this.pos.length();
      const d0 = this.a.copy(this.fromPos).divideScalar(r0), d1 = this.c.copy(this.pos).divideScalar(r1);
      const ang = Math.acos(Math.min(1, Math.max(-1, d0.dot(d1))));
      const dir = ang < 1e-4 ? d1 : d0.clone().multiplyScalar(Math.sin((1 - s) * ang)).addScaledVector(d1, Math.sin(s * ang)).divideScalar(Math.sin(ang));
      // climb out early, settle in late
      const lift = Math.sin(s * Math.PI) * Math.min(ang * R * 0.5, 600);
      pos = new THREE.Vector3().copy(dir).multiplyScalar(Math.exp(Math.log(r0) * (1 - s) + Math.log(r1) * s) + lift);
      // the look is carried round the planet with the camera, so through a long flight it keeps its place against the
      // horizon rather than swinging out to the stars
      const carried = new THREE.Quaternion().setFromUnitVectors(d0, d1).multiply(this.fromQuat);
      // a flight that climbs out of the air looks down at the planet early, so it never swings across the sun or the dark
      const peak = Math.max(r0, r1) + Math.min(ang * R * 0.5, 600) - R, early = Math.min(1, Math.max(0, (peak - 150) / 200));
      quat = carried.slerp(this.quat, s + (Math.min(1, s * 6) - s) * early).premultiply(new THREE.Quaternion().setFromUnitVectors(d1, dir));
      fov = this.fromFov + (fov - this.fromFov) * s;
    }

    // shake: trauma squared, smooth noise; the kick springs back
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.kickFov *= Math.exp(-dt * 6);
    this.kickPitch *= Math.exp(-dt * 7);
    const s2 = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.3 + o * 1.7) * 0.4;
    cam.position.copy(pos);
    cam.quaternion.copy(quat);
    if (s2 > 0 && mode !== 'orbit') {
      cam.translateX(n(31, 1) * s2 * 0.9);
      cam.translateY(n(29, 2) * s2 * 0.7);
      cam.rotateZ(n(23, 3) * s2 * 0.05);
    }
    if (this.kickPitch) cam.rotateX(this.kickPitch);
    cam.fov = fov + this.kickFov;
    // keep out of the ground
    const g = this.ground(cam.position) + 1.2, alt = cam.position.length() - R;
    if (alt < g) cam.position.multiplyScalar((R + g) / cam.position.length());
    this.clip(cam);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Chase, eye and high: a boom behind the target, the camera's up the local up where it stands. */
  private groundPose(mode: CameraMode, up: THREE.Vector3, dt: number, snapped: boolean): void {
    const f = this.a.copy(this.fwd).applyAxisAngle(up, this.yaw);
    const right = this.c.crossVectors(f, up).normalize();
    const pitch = mode === 'high' ? 0.5 : mode === 'eye' ? 0.02 : this.pitch;
    const dist = mode === 'high' ? 90 : mode === 'eye' ? 0.01 : this.dist;
    const raised = mode === 'eye' ? 0.8 : 0;
    /** The eye for a pitch and a boom's length, its height over the sea kept round the curve. */
    const eyeAt = (p: number, d: number, out: THREE.Vector3): THREE.Vector3 => {
      out.copy(this.pivot).addScaledVector(f, -d * Math.cos(p)).addScaledVector(up, d * Math.sin(p)).addScaledVector(right, this.shoulder);
      return out.normalize().multiplyScalar(this.pivot.length() + d * Math.sin(p) + raised);
    };
    // keep the land out of the line of sight: rise early, with room to spare, and settle back slowly
    const deck = this.deck.copy(this.pivot).addScaledVector(up, 2), pos = this.pos;
    let need = 0;
    if (dist > CLOSEST) while (need < RISE.most && this.#blocked(deck, eyeAt(pitch + need, dist, pos), RISE.room)) need += RISE.step;
    this.lift = snapped ? need : this.lift + (need - this.lift) * (1 - Math.exp(-dt * (need > this.lift ? 6 : 0.8)));
    const climb = Math.min(pitch + this.lift, PITCH_MOST);
    eyeAt(climb, dist, pos);
    // and while the climb is under way, or if it was not enough, come in until the ship is clear
    if (dist > CLOSEST) for (let d = dist * 0.85; d > CLOSEST && this.#blocked(deck, pos, 0.2); d *= 0.85) eyeAt(climb, d, pos);
    // the look: down the boom
    const look = new THREE.Vector3().copy(f).multiplyScalar(Math.cos(climb)).addScaledVector(up, -Math.sin(climb));
    const aim = new THREE.Vector3().copy(this.pivot).addScaledVector(look, 60);
    const camUp = new THREE.Vector3().copy(pos).normalize();
    this.m.lookAt(pos, aim, camUp);
    this.quat.setFromRotationMatrix(this.m);
  }

  /** The whole planet, turned so the line between day and night runs across it. */
  private orbitPose(up: THREE.Vector3, sun: THREE.Vector3, dt: number, pull: number): void {
    this.spun += this.orbitSpin * dt;
    // the target pulled most of the way onto the terminator, a little into the day
    const dir = new THREE.Vector3().copy(up).addScaledVector(sun, -up.dot(sun) * pull);
    if (dir.lengthSq() < 1e-4) dir.copy(this.fwd);
    dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.spun);
    const pos = this.pos.copy(dir).multiplyScalar(R * this.orbitDistance);
    // north up the screen, unless the camera sits over a pole
    const north = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.y) > 0.95) north.copy(this.fwd);
    this.m.lookAt(pos, new THREE.Vector3(0, 0, 0), north);
    this.quat.setFromRotationMatrix(this.m);
  }

  /** Near and far planes from the height: close in at sea, wide from orbit. */
  private clip(cam: THREE.PerspectiveCamera): void {
    const d = cam.position.length(), alt = d - R;
    // the farthest anything can show: the sea's horizon plus that of the tallest land beyond it
    const horizon = Math.sqrt(Math.max(0, d * d - R * R)) + Math.sqrt(2 * R * 400 + 400 * 400);
    cam.near = alt < 60 ? 0.25 : Math.max(0.25, Math.min(alt * 0.05, (alt - 420) * 0.6));
    cam.far = Math.max(600, horizon * 1.1);
  }
}
