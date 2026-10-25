// WP25: the match controls, touch → ShipInput, the only way the player acts on a match (sim/input.ts; the
// validator stays the arbiter). Landscape, a thumb each side (PROMPT.md, Controls). The left thumb lands anywhere on
// the left half and a floating stick appears beneath it: left/right is the helm (dead zone with hysteresis, an expo
// curve: fine near the centre, hard over at the rim, the origin trailing a thumb that overshoots), a flick up or down
// steps the sails (reefed/plain/full; while riding the Great Current a flick up breaks off). The right thumb has the
// aimed fitting (tap auto-aims, drag aims by hand, drag back onto it to cancel), the gull (tap calls it for its
// price, drag from it onto a rival dives), three consumables, head home (held), a swipe up on open sea to break off,
// and the compact chart (tap opens it, WP24 part D). Two fingers on open sea are the camera's pinch: touch() hands
// back every touch the camera should see, and a second finger that lands within STICK.pinchMs of the stick's turns
// both into the pinch, so the gestures never fight. Hit targets are forgiving (hud.ts layout: ≥ 44 pt, nearest wins).
import { FLAG, STEER_MAX, idleInput, type ShipInput } from '../sim/input.ts';
import type { ButtonKind, HudButton, HudLayout } from './hud.ts';
import type { Touch } from './shell.ts';

export const STICK = {
  dead: 7, // px of thumb travel before the helm answers…
  release: 4, // …and back inside which it centres again (hysteresis)
  full: 54, // px for hard over; beyond it the origin trails the thumb, so reversing is instant
  expo: 1.55, // response: n^expo
  flick: 30, // px of vertical travel…
  flickMs: 160, // …within this, mostly vertical, is a flick
  flickRest: 220, // ms before another flick counts
  pinchMs: 150, // a second finger this soon after the stick's makes both the camera's pinch
} as const;
export const SWIPE = { up: 64, ms: 380, slope: 1.8 } as const;
export const PRESS = { slop: 14, homeArm: 160, queue: 4 } as const;

interface Sample { t: number; x: number; y: number }
interface Stick { id: number; ox: number; oy: number; x: number; y: number; t0: number; samples: Sample[]; rest: number; engaged: boolean }
interface Press { id: number; button: HudButton; x: number; y: number; t0: number; dragged: boolean }
interface Free { id: number; x0: number; y0: number; t0: number; x: number; y: number; swiped: boolean; pinch: boolean }
interface Act { flags: number; consumable: number; aim: number }

export type ControlAct = ButtonKind | 'sail' | 'breakOff' | 'dive' | 'aim';

/** What the HUD draws of the controls this frame. */
export interface ControlsView {
  stick: { ox: number; oy: number; x: number; y: number; steer: number } | null;
  pressed: ReadonlySet<ButtonKind>;
  aiming: { kind: 'aimed' | 'gull'; x: number; y: number; cell: number; cancel: boolean } | null;
  /** Head home's arming, 0–1 (held once 1). */
  home: number;
}

/** The helm for a thumb `dx` px off the stick's origin: integer −STEER_MAX…STEER_MAX, continuous from the dead zone. */
export function steerOf(dx: number): number {
  const n = Math.min(1, Math.max(0, (Math.abs(dx) - STICK.release) / (STICK.full - STICK.release)));
  return Math.sign(dx) * Math.max(1, Math.min(STEER_MAX, Math.round(STEER_MAX * n ** STICK.expo)));
}

const inside = (b: HudButton, x: number, y: number, slop: number): boolean =>
  b.w !== undefined && b.h !== undefined
    ? Math.abs(x - b.x) <= b.w / 2 + slop && Math.abs(y - b.y) <= b.h / 2 + slop
    : Math.hypot(x - b.x, y - b.y) <= b.hit + slop;

/** The control under a touch: the nearest whose forgiving hit area holds it, or null. */
export function hitButton(layout: HudLayout, x: number, y: number): HudButton | null {
  let best: HudButton | null = null, bestD = Infinity;
  for (const b of layout.buttons) {
    if (!inside(b, x, y, 0)) continue;
    const d = Math.hypot(x - b.x, y - b.y) / (b.hit || 1);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

export class Controls {
  layout: HudLayout | null = null;
  /** The territory cell under a screen point (the camera's ray onto the sea), or −1. */
  pick: (x: number, y: number) => number = () => -1;
  /** The ship rides the Great Current: a flick up on the stick breaks off too. */
  riding: () => boolean = () => false;
  onChart: () => void = () => {};
  /** Heard on every act, the frame it happens (the ui sound and a selection tick). */
  onAct: (what: ControlAct) => void = () => {};
  private readonly now: () => number;
  private stick: Stick | null = null;
  private readonly presses = new Map<number, Press>();
  private readonly free = new Map<number, Free>();
  private readonly acts: Act[] = [];
  private readonly sails: number[] = [];
  private steer = 0;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  /** Feed a touch; returns the touches the camera's pinch should see (WP24), synthesised downs included. */
  touch(t: Touch): Touch[] {
    const L = this.layout;
    if (!L) return [t];
    const now = this.now();
    if (t.phase === 'down') return this.down(t, now, L);
    const end = t.phase === 'up' || t.phase === 'cancel';
    if (this.stick?.id === t.id) {
      if (end) { this.stick = null; this.steer = 0; } else this.moveStick(this.stick, t, now);
      return [];
    }
    const p = this.presses.get(t.id);
    if (p) {
      p.x = t.x; p.y = t.y;
      if (!inside(p.button, t.x, t.y, PRESS.slop)) p.dragged = true;
      if (end) { this.presses.delete(t.id); if (t.phase === 'up') this.release(p); }
      return [];
    }
    const f = this.free.get(t.id);
    if (f) {
      f.x = t.x; f.y = t.y;
      if (end) this.free.delete(t.id);
      else if (!f.pinch && !f.swiped && this.free.size === 1) {
        const dy = f.y0 - t.y, dx = Math.abs(t.x - f.x0);
        if (dy >= SWIPE.up && dy > SWIPE.slope * dx && now - f.t0 <= SWIPE.ms) {
          f.swiped = true;
          this.act(FLAG.breakOff, -1, -1, 'breakOff');
        }
      }
    }
    return [t];
  }

  private down(t: Touch, now: number, L: HudLayout): Touch[] {
    const s = this.stick;
    // a second finger right after the stick's: both were a pinch all along
    if (s && !s.engaged && now - s.t0 <= STICK.pinchMs && !hitButton(L, t.x, t.y)) {
      this.stick = null;
      this.steer = 0;
      this.free.set(s.id, { id: s.id, x0: s.x, y0: s.y, t0: s.t0, x: s.x, y: s.y, swiped: false, pinch: true });
      this.free.set(t.id, { id: t.id, x0: t.x, y0: t.y, t0: now, x: t.x, y: t.y, swiped: false, pinch: true });
      return [{ phase: 'down', id: s.id, x: s.x, y: s.y }, t];
    }
    const b = hitButton(L, t.x, t.y);
    if (b) {
      this.presses.set(t.id, { id: t.id, button: b, x: t.x, y: t.y, t0: now, dragged: false });
      return [];
    }
    const z = L.stick;
    if (!s && t.x >= z.x && t.x <= z.x + z.width && t.y >= z.y && t.y <= z.y + z.height) {
      this.stick = { id: t.id, ox: t.x, oy: t.y, x: t.x, y: t.y, t0: now, samples: [{ t: now, x: t.x, y: t.y }], rest: 0, engaged: false };
      return [];
    }
    const pinch = this.free.size > 0;
    for (const f of this.free.values()) f.pinch ||= pinch;
    this.free.set(t.id, { id: t.id, x0: t.x, y0: t.y, t0: now, x: t.x, y: t.y, swiped: false, pinch });
    return [t];
  }

  private moveStick(s: Stick, t: Touch, now: number): void {
    s.x = t.x; s.y = t.y;
    let dx = s.x - s.ox;
    if (Math.abs(dx) > STICK.full) { s.ox = s.x - Math.sign(dx) * STICK.full; dx = s.x - s.ox; }
    if (Math.abs(s.y - s.oy) > STICK.full * 1.5) s.oy = s.y - Math.sign(s.y - s.oy) * STICK.full * 1.5;
    const d = Math.abs(dx);
    if (!s.engaged && d > STICK.dead) s.engaged = true;
    else if (s.engaged && d < STICK.release) s.engaged = false;
    this.steer = s.engaged ? steerOf(dx) : 0;
    s.samples.push({ t: now, x: t.x, y: t.y });
    while (s.samples.length > 1 && now - s.samples[0].t > STICK.flickMs) s.samples.shift();
    if (now < s.rest) return;
    for (const q of s.samples) {
      const dy = t.y - q.y;
      if (Math.abs(dy) < STICK.flick || Math.abs(dy) <= 1.5 * Math.abs(t.x - q.x)) continue;
      s.rest = now + STICK.flickRest;
      s.samples.length = 0;
      if (dy < 0 && this.riding()) this.act(FLAG.breakOff, -1, -1, 'breakOff');
      else if (this.sails.length < PRESS.queue) { this.sails.push(dy < 0 ? 1 : -1); this.onAct('sail'); }
      break;
    }
  }

  private release(p: Press): void {
    const back = inside(p.button, p.x, p.y, PRESS.slop);
    const k = p.button.kind;
    if (k === 'aimed' || k === 'gull') {
      if (!p.dragged) this.act(k === 'aimed' ? FLAG.useAimed : FLAG.callGull, -1, -1, k);
      else if (!back) {
        const cell = this.pick(p.x, p.y);
        if (cell >= 0) this.act(k === 'aimed' ? FLAG.useAimed : FLAG.dive, -1, cell, k === 'aimed' ? 'aim' : 'dive');
      }
    } else if (k === 'chart') {
      if (back) { this.onChart(); this.onAct('chart'); }
    } else if (k !== 'home' && back) {
      this.act(0, k === 'c0' ? 0 : k === 'c1' ? 1 : 2, -1, k);
    }
  }

  private act(flags: number, consumable: number, aim: number, what: ControlAct): void {
    if (this.acts.length >= PRESS.queue) return;
    this.acts.push({ flags, consumable, aim });
    this.onAct(what);
  }

  private homeArming(now: number): number {
    for (const p of this.presses.values()) {
      if (p.button.kind === 'home' && !p.dragged) return Math.min(1, (now - p.t0) / PRESS.homeArm);
    }
    return 0;
  }

  /** The player's input for the next tick: the helm held, one queued sail step and one queued act, head home held. */
  input(): ShipInput {
    const out = idleInput();
    out.steer = this.steer;
    out.sail = this.sails.shift() ?? 0;
    const a = this.acts.shift();
    if (a) { out.flags = a.flags; out.consumable = a.consumable; out.aim = a.aim; }
    if (this.homeArming(this.now()) >= 1) out.flags |= FLAG.headHome;
    return out;
  }

  view(): ControlsView {
    const s = this.stick, pressed = new Set<ButtonKind>();
    let aiming: ControlsView['aiming'] = null;
    for (const p of this.presses.values()) {
      pressed.add(p.button.kind);
      if (p.dragged && (p.button.kind === 'aimed' || p.button.kind === 'gull')) {
        aiming = { kind: p.button.kind, x: p.x, y: p.y, cell: this.pick(p.x, p.y), cancel: inside(p.button, p.x, p.y, PRESS.slop) };
      }
    }
    return {
      stick: s && { ox: s.ox, oy: s.oy, x: s.x, y: s.y, steer: this.steer },
      pressed,
      aiming,
      home: this.homeArming(this.now()),
    };
  }

  /** Drop every finger and anything queued (a relayout, the chart opening, the match pausing). */
  reset(): void {
    this.stick = null;
    this.presses.clear();
    this.free.clear();
    this.acts.length = 0;
    this.sails.length = 0;
    this.steer = 0;
  }
}
