// The effect log and the juice. Every sound played, every haptic, and every screen or camera effect fired goes through
// here, so the reviewer's capture tools can read exactly what a moment did and when. The camera's kick, shake and zoom
// live here too: events raise them, and each frame they decay into an offset the stage applies.

export type EffectKind = 'sound' | 'haptic' | 'camera' | 'screen' | 'actor' | 'hud' | 'flow';

export interface EffectEntry {
  /** The loop's clock in seconds when it fired. */
  t: number;
  /** The simulation tick it came from, or -1 outside a match. */
  tick: number;
  kind: EffectKind;
  name: string;
  data?: Record<string, unknown>;
}

const LOG_CAP = 5000;

export class EffectLog {
  readonly entries: EffectEntry[] = [];
  clock = 0;
  tick = -1;

  add(kind: EffectKind, name: string, data?: Record<string, unknown>): void {
    const e: EffectEntry = { t: Math.round(this.clock * 1000) / 1000, tick: this.tick, kind, name };
    if (data) e.data = data;
    this.entries.push(e);
    if (this.entries.length > LOG_CAP) this.entries.splice(0, this.entries.length - LOG_CAP);
  }

  since(t: number): EffectEntry[] {
    return this.entries.filter((e) => e.t >= t);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

/** Camera juice: a kick (a sharp push that springs back), trauma-squared shake, and a zoom punch. */
export class CameraJuice {
  kick = 0;
  trauma = 0;
  zoom = 0;
  private t = 0;
  /** The offset this frame, in the camera's own frame: right, up, back, and a field-of-view change in degrees. */
  readonly offset = { x: 0, y: 0, z: 0, roll: 0, fov: 0 };

  private readonly log: EffectLog;

  constructor(log: EffectLog) {
    this.log = log;
  }

  /** A sharp push back from the screen, `amount` 0…1. */
  punch(amount: number, why: string): void {
    this.kick = Math.min(1, this.kick + amount);
    this.log.add('camera', 'kick', { amount, why });
  }

  shake(amount: number, why: string): void {
    this.trauma = Math.min(1, this.trauma + amount);
    this.log.add('camera', 'shake', { amount, why });
  }

  /** A field-of-view punch, positive widens. */
  zoomPunch(degrees: number, why: string): void {
    this.zoom += degrees;
    this.log.add('camera', 'zoom', { degrees, why });
  }

  update(dt: number): void {
    this.t += dt;
    this.kick = Math.max(0, this.kick - dt * 5);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.zoom *= Math.max(0, 1 - dt * 6);
    const s = this.trauma * this.trauma, t = this.t;
    const n = (f: number, o: number) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.3 + o * 1.7) * 0.4;
    const o = this.offset;
    o.x = n(31, 0) * s * 0.9;
    o.y = n(27, 2) * s * 0.7;
    o.roll = n(23, 4) * s * 0.05;
    // the kick eases out: a fast push, a slower return
    o.z = this.kick * this.kick * 2.2;
    o.fov = this.zoom + this.kick * 3;
  }
}

/** Screen flashes: a colour that fades out over the canvas. */
export class Flash {
  color = '#ffffff';
  alpha = 0;
  private fade = 4;
  private readonly log: EffectLog;

  constructor(log: EffectLog) {
    this.log = log;
  }

  fire(color: string, strength: number, seconds: number, why: string): void {
    this.color = color;
    this.alpha = Math.min(1, Math.max(this.alpha, strength));
    this.fade = 1 / Math.max(0.05, seconds);
    this.log.add('screen', 'flash', { color, strength, why });
  }

  update(dt: number): void {
    this.alpha = Math.max(0, this.alpha - dt * this.fade);
  }
}
