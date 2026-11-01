// Thumbs, mouse and keys, folded into one set of intents each frame. Ported from the rewrite's Controls (src/ui.ts):
// a floating stick under the left thumb, a drag on the right to look, pointer lock and the left button for the
// mouse, and keys. The HUD's buttons press through `press`. The session turns these intents into the ship's input.
import { el } from '../ui/parts/index.ts';

/** One frame's intents. The look is the turn since the last read; the edges are true once, on the read after the press. */
export interface Intents {
  /** x right, y forward, each -1 to 1. */
  stick: { x: number; y: number };
  /** Radians: yaw right, pitch down. */
  look: { x: number; y: number };
  /** Seconds since the player last looked about. */
  idle: number;
  fire: boolean;
  dive: boolean;
  gust: boolean;
  reload: boolean;
  ability: boolean;
  drop: boolean;
  take: boolean;
  select: number;
  hail: number;
}

export type Press = 'fire' | 'dive' | 'gust' | 'reload' | 'ability' | 'drop' | 'take' | 'hail';

const STICK_RADIUS = 62;
const KEYS_SELECT = ['1', '2', '3', '4', '5'];

export class Controls {
  enabled = false;
  /** Look sensitivity and an inverted pitch, from the settings. */
  sens = 1;
  invert = false;
  /** Left-handed: the stick under the right thumb and the look on the left. */
  lefty = false;
  private readonly keys = new Set<string>();
  private readonly held = new Set<Press>();
  private readonly edges = new Set<Press>();
  private select = -1;
  private readonly stick = { x: 0, y: 0 };
  private readonly look = { x: 0, y: 0 };
  private lastLook = -99;
  private mouseFire = false;
  private stickId = -1;
  private lookId = -1;
  private readonly last = new Map<number, { x: number; y: number }>();
  private origin = { x: 0, y: 0 };
  private readonly layer: HTMLElement;
  private readonly stickEl: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly out: Intents = {
    stick: { x: 0, y: 0 }, look: { x: 0, y: 0 }, idle: 99, fire: false, dive: false, gust: false, reload: false, ability: false,
    drop: false, take: false, select: -1, hail: -1,
  };

  /** `layer` sits under the interface and takes the touches the interface lets through. */
  constructor(layer: HTMLElement) {
    this.layer = layer;
    layer.style.touchAction = 'none';
    this.stickEl = el('app-stick', layer);
    this.stickEl.style.cssText = 'position:absolute;width:124px;height:124px;margin:-62px 0 0 -62px;border-radius:50%;'
      + 'border:2px solid rgba(255,248,230,0.35);background:rgba(20,16,10,0.18);opacity:0;transition:opacity .2s;pointer-events:none;';
    this.knob = el('app-stick__knob', this.stickEl);
    this.knob.style.cssText = 'position:absolute;left:37px;top:37px;width:50px;height:50px;border-radius:50%;'
      + 'background:rgba(255,248,230,0.55);box-shadow:0 2px 6px rgba(0,0,0,0.35);';
    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.move(e));
    layer.addEventListener('pointerup', (e) => this.up(e));
    layer.addEventListener('pointercancel', (e) => this.up(e));
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== layer || !this.enabled) return;
      this.turn(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('blur', () => this.release());
  }

  /** Turns the controls on for a match, or off (letting go of everything held). */
  set on(v: boolean) {
    this.enabled = v;
    this.layer.style.pointerEvents = v ? 'auto' : 'none';
    if (!v) {
      this.release();
      if (document.pointerLockElement === this.layer) document.exitPointerLock();
    }
  }

  /** A HUD button pressed (down) or let go. */
  press(what: Press, down = true): void {
    if (down) {
      this.held.add(what);
      this.edges.add(what);
    } else this.held.delete(what);
  }

  /** A hotbar slot tapped. */
  pick(slot: number): void {
    this.select = slot;
  }

  release(): void {
    this.keys.clear();
    this.held.clear();
    this.mouseFire = false;
    this.stickId = this.lookId = -1;
    this.stick.x = this.stick.y = 0;
    this.last.clear();
    this.stickEl.style.opacity = '0';
  }

  /** This frame's intents; the look and the edges are spent by reading them. */
  read(): Intents {
    const o = this.out, k = this.keys;
    o.stick.x = this.stick.x;
    o.stick.y = this.stick.y;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      o.stick.x = kx / l;
      o.stick.y = ky / l;
    }
    o.look.x = this.look.x;
    o.look.y = this.look.y;
    this.look.x = this.look.y = 0;
    o.idle = performance.now() / 1000 - this.lastLook;
    const e = this.edges;
    o.fire = this.mouseFire || this.held.has('fire') || k.has(' ') || e.has('fire');
    o.dive = this.held.has('dive') || k.has('shift') || e.has('dive');
    o.gust = e.has('gust');
    o.reload = e.has('reload');
    o.ability = e.has('ability');
    o.drop = e.has('drop');
    o.take = e.has('take');
    o.hail = e.has('hail') ? 0 : -1;
    o.select = this.select;
    this.select = -1;
    e.clear();
    return o;
  }

  private turn(dx: number, dy: number): void {
    this.look.x += dx * this.sens;
    this.look.y += dy * this.sens * (this.invert ? -1 : 1);
    this.lastLook = performance.now() / 1000;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'tab') e.preventDefault();
    if (!down) {
      this.keys.delete(k);
      return;
    }
    if (e.repeat) return;
    this.keys.add(k);
    const slot = KEYS_SELECT.indexOf(k);
    if (slot >= 0) this.select = slot;
    else if (k === 'r') this.edges.add('reload');
    else if (k === 'e') this.edges.add('ability');
    else if (k === 'f' || k === 'q') this.edges.add('gust');
    else if (k === 'g') this.edges.add('drop');
    else if (k === 't') this.edges.add('take');
    else if (k === 'h') this.edges.add('hail');
    else if (k === ' ') this.edges.add('dive');
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      if (document.pointerLockElement !== this.layer) {
        try {
          (this.layer.requestPointerLock as () => Promise<void> | void)()?.catch?.(() => {});
        } catch {
          // no lock: drag to look
        }
        this.last.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.lookId = e.pointerId;
      }
      if (e.button === 0 && document.pointerLockElement === this.layer) this.mouseFire = true;
      return;
    }
    this.layer.setPointerCapture(e.pointerId);
    if ((this.lefty ? e.clientX > innerWidth * 0.58 : e.clientX < innerWidth * 0.42) && this.stickId < 0) {
      this.stickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.place(e.clientX, e.clientY, 0, 0);
      this.stickEl.style.opacity = '1';
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.last.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      const r = STICK_RADIUS;
      let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
      const d = Math.hypot(dx, dy);
      // past the rim the base follows the thumb
      if (d > r) {
        this.origin.x += dx * (1 - r / d);
        this.origin.y += dy * (1 - r / d);
        dx *= r / d;
        dy *= r / d;
      }
      this.stick.x = dx / r;
      this.stick.y = -dy / r;
      this.place(this.origin.x, this.origin.y, dx, dy);
    } else if (e.pointerId === this.lookId) {
      if (e.pointerType === 'mouse' && document.pointerLockElement === this.layer) return;
      const l = this.last.get(e.pointerId);
      if (!l) return;
      this.turn((e.clientX - l.x) * 0.0056, (e.clientY - l.y) * 0.0046);
      l.x = e.clientX;
      l.y = e.clientY;
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button === 0) this.mouseFire = false;
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.stick.x = this.stick.y = 0;
      this.stickEl.style.opacity = '0';
    }
    if (e.pointerId === this.lookId) {
      this.lookId = -1;
      this.last.delete(e.pointerId);
    }
  }

  private place(x: number, y: number, kx: number, ky: number): void {
    this.stickEl.style.left = `${x}px`;
    this.stickEl.style.top = `${y}px`;
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }
}
