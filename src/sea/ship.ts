// The player's ship: the caravel as the old game built her, sailed over the sphere along great circles and riding the
// swell the sea's longest waves make (summed on the CPU, so she rises with exactly the waves that are drawn).
import { Matrix4, Vector3, type WebGPURenderer } from 'three/webgpu';
import { Kit, ShipModel, type Pose } from '../render/actors/caravel.ts';
import { TEX_BASE, loadTextures } from '../render/actors/common.ts';
import { lookOf } from '../render/actors/cosmetics.ts';
import { R, eastAt, sail, turn } from './world.ts';
import type { Ocean } from './ocean.ts';

/** Her top speed, m/s, how fast she gathers way, and how fast she can turn at speed, rad/s. */
const TOP = 14, ACCEL = 2.2, DRAG = 0.35, TURN = 0.42;

export class Ship {
  readonly model: ShipModel;
  readonly kit: Kit;
  readonly ready: Promise<void>;
  /** Where she is (unit up) and where her bow points (a unit tangent there). */
  readonly up = new Vector3(0, 1, 0);
  readonly fwd = new Vector3(0, 0, 1);
  speed = 0;
  turnRate = 0;
  /** What the helm asks: throttle 0–1 and rudder -1 (starboard) to 1 (port). */
  throttle = 0;
  rudder = 0;
  readonly #pose: Pose = {
    speed: 0, turn: 0, aimYaw: 0, aimPitch: 0, hp: 1, sink: 0, boost: 0, hit: 0, alt: 0, dive: 0, wind: 0, windSpeed: 7, night: 0, flip: 0,
    torn: 0, mast: 'up', flood: 0, listTo: 1, irons: 0, lurch: 0, roll: 0, ice: 0,
  };
  readonly #side = new Vector3();
  readonly #at = new Vector3();
  readonly #m = new Matrix4();

  constructor(start: Vector3) {
    const tex = loadTextures(TEX_BASE);
    this.kit = new Kit(tex);
    this.model = new ShipModel(this.kit, lookOf({ colour: '#9c2f2a', pattern: 'bands', figurehead: 'gull', emblem: 'gull' }));
    this.ready = tex.ready;
    this.up.copy(start).normalize();
    eastAt(this.up, this.fwd);
  }

  async prepare(renderer: WebGPURenderer): Promise<void> {
    await this.kit.cloth.prepare(renderer);
  }

  /** The world point under her local (x to port, z to the bow), on the sphere's level. */
  #local(lx: number, lz: number, out: Vector3): Vector3 {
    this.#side.crossVectors(this.up, this.fwd);
    return out.copy(this.up).multiplyScalar(R).addScaledVector(this.#side, lx).addScaledVector(this.fwd, lz);
  }

  update(dt: number, t: number, ocean: Ocean, wind: Vector3, night: number): void {
    // the helm: way gathered and lost, the rudder biting harder the faster she goes
    const want = this.throttle * TOP;
    this.speed += (want - this.speed) * Math.min(1, dt * (want > this.speed ? ACCEL / TOP * 3 : DRAG));
    const bite = Math.min(1, 0.25 + this.speed / 6);
    this.turnRate += (this.rudder * TURN * bite - this.turnRate) * Math.min(1, dt * 2.5);
    turn(this.up, this.fwd, this.turnRate * dt);
    sail(this.up, this.fwd, this.speed * dt);

    // her frame: x to port, y up, z to the bow
    const side = this.#side.crossVectors(this.up, this.fwd);
    const m = this.model.root.matrix;
    this.#m.makeBasis(side, this.up, this.fwd).setPosition(this.up.x * R, this.up.y * R, this.up.z * R);
    m.copy(this.#m);
    this.model.root.matrixWorldNeedsUpdate = true;

    const p = this.#pose;
    p.speed = this.speed;
    p.turn = this.turnRate;
    // the wind as an angle off her bow, 0 from dead astern
    const wa = wind.dot(this.fwd), wb = wind.dot(side);
    p.wind = Math.atan2(wb, wa);
    p.windSpeed = Math.hypot(wa, wb);
    p.night = night;
    p.roll = 0;
    const at = this.#at;
    this.model.update(p, t, dt, (lx, lz) => ocean.heightAt(this.#local(lx, lz, at).normalize()));
  }
}
