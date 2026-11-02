// The cameras on the sphere: the chase camera from the rewrite's Rig (src/scene.ts), now keeping the local up where
// it stands, an eye-level and a high view for captures, and an orbit view of the whole planet for the Gale and the
// lobby that puts the line between day and night across the globe. Switching modes flies between them.
import * as THREE from 'three';
import { R } from '../sim/sphere.ts';
import { heightAt } from '../sim/world/index.ts';
import { v3, type V3 } from '../sim/math.ts';

export type CameraMode = 'chase' | 'eye' | 'high' | 'orbit';

/** What the camera follows: a point on the sea (a unit vector), the way it faces (a unit tangent there). */
export interface CameraTarget {
  pos: V3;
  heading: V3;
  /** Height of the point followed above sea level, in metres (a ship's deck is about 2.5). */
  height?: number;
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class CameraRig {
  mode: CameraMode = 'chase';
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

  /** The ground's height at a point in metres, never below the sea. */
  private ground(x: THREE.Vector3): number {
    const l = x.length();
    this.p.x = x.x / l; this.p.y = x.y / l; this.p.z = x.z / l;
    return Math.max(0, heightAt(this.p));
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
    const pivot = this.b.copy(up).multiplyScalar(R + (target.height ?? 2.5));
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

    if (mode === 'orbit') this.orbitPose(pu, sun, dt);
    else this.groundPose(mode, pu);

    // the flight between modes: round the planet, not through it
    let pos = this.pos, quat = this.quat, fov = mode === 'orbit' ? 40 : this.fov;
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
      quat = new THREE.Quaternion().copy(this.fromQuat).slerp(this.quat, s);
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
  private groundPose(mode: CameraMode, up: THREE.Vector3): void {
    const f = this.a.copy(this.fwd).applyAxisAngle(up, this.yaw);
    const right = this.c.crossVectors(f, up).normalize();
    const pitch = mode === 'high' ? 0.5 : mode === 'eye' ? 0.02 : this.pitch;
    const dist = mode === 'high' ? 90 : mode === 'eye' ? 0.01 : this.dist;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // the look: down the boom
    const look = new THREE.Vector3().copy(f).multiplyScalar(cp).addScaledVector(up, -sp);
    const pos = this.pos.copy(this.pivot).addScaledVector(look, -dist).addScaledVector(right, this.shoulder);
    // hold the height over the sea the boom gives, round the curve
    const want = (this.pivot.length() - R) + dist * sp + (mode === 'eye' ? 0.8 : 0);
    // a hillside behind: rise over it
    let lift = 0;
    for (let s = 4; s < dist; s += 3) {
      const x = new THREE.Vector3().copy(this.pivot).addScaledVector(look, -s);
      lift = Math.max(lift, this.ground(x) + 2 - (x.length() - R));
    }
    pos.normalize().multiplyScalar(R + want + Math.max(0, lift));
    const aim = new THREE.Vector3().copy(this.pivot).addScaledVector(look, 60);
    const camUp = new THREE.Vector3().copy(pos).normalize();
    this.m.lookAt(pos, aim, camUp);
    this.quat.setFromRotationMatrix(this.m);
  }

  /** The whole planet, turned so the line between day and night runs across it. */
  private orbitPose(up: THREE.Vector3, sun: THREE.Vector3, dt: number): void {
    this.spun += this.orbitSpin * dt;
    // the target pulled most of the way onto the terminator, a little into the day
    const dir = new THREE.Vector3().copy(up).addScaledVector(sun, -up.dot(sun) * 0.8);
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
