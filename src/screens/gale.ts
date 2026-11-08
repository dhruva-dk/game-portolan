// The drop, on the chart, while the fleet is carried on the Gale. Nothing covers the world: the camera rides behind and
// above the fleet with the planet's curve under it, and the chart keeps to its edges: how many seconds the Gale has
// left to carry her, top centre, the disc in its corner, showing the Gale's course dotted, the fleet, the Storm's first
// circle and my marker, and DIVE at the right hand, faint while the Gale is taking her up, inked in when she may go.
// Once she has gone the stick comes up under the thumb for the glide and her marker stands on the water, an inked
// pennant on a staff, where she has set it. The disc's own press opens the full map. Nothing but DIVE is written.
import {
  Press, drawSprite, dryAlpha, ease, figure, figureWidth, pennant, pressLook, staff, word, wordWidth, WASH, type Box, type ChartLayer,
  type Circle, type Pressable, type Pen,
} from '../chart/index.ts';
import { GALE } from '../sim/tables.ts';
import { R } from '../sim/sphere.ts';
import { PHASE } from '../sim/state.ts';
import type { V3 } from '../sim/math.ts';
import type { Controls } from '../app/controls.ts';
import type { MapView } from '../ui/model.ts';
import { paper, slipPath } from './instruments.ts';
import { Minimap, Plate, drawStick, mapFace } from './minimap.ts';
import { SCRAP, SCRAP_TOTAL, handSprite, scrapAlpha, slipSprite } from './scraps.ts';

/** What the drop needs of the game. */
export interface GaleHost {
  readonly controls: Pick<Controls, 'press' | 'stickView'>;
  /** Left-handed: the stick and DIVE change sides. */
  lefty(): boolean;
  /** Seconds the Gale has blown, to the frame. */
  time(): number;
  /** Her ship's phase. */
  phase(): number;
  /** What the disc shows, and the sea's level. */
  map(): { view: MapView; tide: number };
  /** Her marker on the planet (a unit vector), if she has set one. */
  marker(): V3 | null;
  /** Where a world point (metres) falls on the screen, or null if behind the eye. */
  project(p: V3): { x: number; y: number } | null;
  /** The camera's position (metres). */
  eye(): V3;
  /** Opens the full map, or shuts it. */
  openMap(): void;
}

export interface GaleOptions {
  /** The first Gale: a drawn hand is pinned to the edge over DIVE, pointing at it. */
  teach?: boolean;
}

/** Seconds: the chart coming up, DIVE inking in, the countdown drying when she goes, the stick coming up, everything
 *  drying away for anything but the sea. */
const AT = { lay: 0.4, ink: 0.5, count: 0.35, stick: 0.3, dry: 0.3 } as const;
/** Seconds into the Gale before she may leave it: the Gale takes her up, and DIVE is inked in as it sets her at its
 *  height. */
export const DIVE_ALLOWED = 2.8;
/** The camera's dive with her as she leaves the Gale, seconds: the chase camera comes down from over the fleet onto
 *  her, in `descent` (the view swinging down) and `settle` (the boom shortening). */
export const DIVE = { descent: 1.4, settle: 1.4 } as const;
/** The camera on the Gale: how far down it looks (radians below the horizontal) and how long the boom is, metres. The
 *  planet's horizon from this height lies a few degrees above the centre of the screen. */
export const RIDE = { pitch: 1.05, dist: 80 } as const;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** How far along its course the Gale has carried the fleet at t seconds, radians. */
const carried = (t: number): number => (GALE.arc * Math.min(t, GALE.time)) / GALE.time;

/** The fleet's middle on the Gale at t seconds, into `out`, and the way on there, into `head`. The fleet rides four
 *  ranks deep behind the head of the course, so its middle is a little short of it. */
export function fleetAt(from: V3, dir: V3, t: number, out: V3, head: V3): void {
  const a = carried(t) - 13.5 / R, c = Math.cos(a), s = Math.sin(a);
  out.x = from.x * c + dir.x * s; out.y = from.y * c + dir.y * s; out.z = from.z * c + dir.z * s;
  head.x = dir.x * c - from.x * s; head.y = dir.y * c - from.y * s; head.z = dir.z * c - from.z * s;
}

export class Gale {
  readonly #h: GaleHost;
  readonly #teach: boolean;
  #layer: ChartLayer | null = null;
  #off: (() => void) | null = null;
  #born = -1;
  /** When she left the Gale; when the screen left, for anything but the sea (ms; -1 not yet). */
  #diveAt = -1;
  #leftAt = -1;
  readonly #press = new Press();
  #dive: Pressable | null = null;
  #diveBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  #stick: Circle = { x: 0, y: 0, r: 72 };
  /** The first drop's scrap: its place over DIVE, when it went up (ms; -1 not yet), and whether it has gone. */
  #scrap: Box = { x: 0, y: 0, w: 0, h: 0 };
  #scrapAt = -1;
  #scrapDone = false;
  #plate: Plate | null = null;
  readonly #map = new Minimap();
  #model: { view: MapView; tide: number } | null = null;
  #modelAt = -Infinity;
  #mapKey = 0;
  /** The full map is open: only the disc shows, and takes a press. */
  #covered = false;
  /** Called once the chart has gone. */
  onGone?: () => void;

  constructor(h: GaleHost, o: GaleOptions = {}) {
    this.#h = h;
    this.#teach = !!o.teach;
  }

  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = now;
    this.#lay();
    this.#off = layer.addLive((g, t, dt) => this.#frame(g, t, dt));
  }

  resize(): void {
    if (this.#layer) this.#lay();
  }

  /** Leaves at `now`: everything dries away, for anything but the sea. */
  leave(now: number): void {
    if (this.#leftAt >= 0) return;
    this.#leftAt = now;
    this.#unpress();
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#unpress();
  }

  /** The full map is open over the drop: only the disc shows, and takes a press. */
  cover(on: boolean): void {
    if (this.#covered === on) return;
    this.#covered = on;
    this.#lay();
  }

  /** Lays out DIVE, the stick and the disc's press for this screen, or takes off what the moment has no use for. */
  #lay(): void {
    const layer = this.#layer!, l = layer.layout, c = l.controls, s = l.safe;
    const mirror = (p: Circle): Circle => (this.#h.lefty() ? { ...p, x: l.w - p.x } : p);
    this.#stick = mirror(c.stick);
    const size = l.figure.large, w = Math.ceil(wordWidth('DIVE', size) + size * 0.85), h = Math.ceil(size * 1.7), f = mirror(c.fire);
    const margin = 14 + w / 2, x = Math.min(l.w - s.right - margin, Math.max(s.left + margin, f.x));
    const y = Math.min(l.h - s.bottom - 14 - h / 2, f.y);
    this.#diveBox = { x, y, w, h };
    // the first drop's scrap, pinned to the edge on DIVE's side and over it
    const sw = 118, sh = 128, sx = f.x > l.w / 2 ? l.w - s.right - 14 - sw / 2 : s.left + 14 + sw / 2;
    this.#scrap = { x: sx, y: Math.max(s.top + 14 + sh / 2, y - h / 2 - 12 - sh / 2), w: sw, h: sh };
    this.#plate = new Plate(layer, l.hud.r * 2, l.hud.r * 2);
    this.#unpress();
    if (this.#leftAt >= 0) return;
    layer.presses.add({ id: 'gale:map', hit: l.hud, press: new Press(), act: () => this.#h.openMap() });
    this.#dive = this.#covered || this.#diveAt >= 0 ? null : layer.presses.add({ id: 'gale:dive', hit: this.#diveBox, press: this.#press, sound: 'dive', haptic: 'heavy', act: () => this.#leap() });
  }

  #unpress(): void {
    const presses = this.#layer?.presses;
    presses?.remove('gale:map');
    presses?.remove('gale:dive');
    this.#dive = null;
  }

  /** Leaving the Gale: the same press the sim would take from the keyboard. */
  #leap(): void {
    const c = this.#h.controls;
    c.press('dive');
    c.press('dive', false);
  }

  #frame(g: CanvasRenderingContext2D, now: number, dt: number): void {
    const layer = this.#layer!, h = this.#h, phase = h.phase();
    if (phase === PHASE.sea || phase === PHASE.sunk) {
      // she is down; the HUD takes the disc and the stick from here
      this.dispose();
      this.onGone?.();
      return;
    }
    if (phase !== PHASE.gale && this.#diveAt < 0) {
      this.#diveAt = now;
      this.#layer?.presses.remove('gale:dive');
      this.#dive = null;
    }
    const dry = this.#leftAt < 0 ? 0 : clamp((now - this.#leftAt) / 1000 / AT.dry);
    if (dry >= 1) {
      this.dispose();
      this.onGone?.();
      return;
    }
    const a = ease.out(clamp((now - this.#born) / 1000 / AT.lay)) * dryAlpha(dry), t = h.time();
    if (now - this.#modelAt > 150) {
      this.#modelAt = now;
      this.#model = h.map();
      this.#mapKey++;
    }
    this.#disc(g, layer, a);
    if (this.#covered) {
      // the scrap waits behind the full map
      if (this.#scrapAt >= 0) this.#scrapAt += dt * 1000;
      return;
    }
    const down = this.#diveAt >= 0;
    const went = down ? clamp((now - this.#diveAt) / 1000 / AT.count) : 0;
    if (went < 1) this.#countdown(g, layer, t, a * (1 - went));
    if (!down) this.#diveButton(g, layer, t, a);
    else {
      drawStick(g, layer, this.#stick, h.controls.stickView, a * ease.out(clamp((now - this.#diveAt) / 1000 / AT.stick)));
      this.#pennant(layer.pen, now, dry);
    }
    this.#teaching(g, layer, t, now, a, down);
  }

  /** The first drop's scrap: a hand on a slip pinned to the edge over DIVE, tapping down at the letters, for a few seconds
   *  once she may go; it dries out at once if she goes first. It is drawn only, and takes no touch. */
  #teaching(g: CanvasRenderingContext2D, layer: ChartLayer, t: number, now: number, a: number, down: boolean): void {
    if (!this.#teach || this.#scrapDone || t < DIVE_ALLOWED) return;
    if (this.#scrapAt < 0) {
      // she went before it came up: it never shows
      if (down) { this.#scrapDone = true; return; }
      this.#scrapAt = now;
    }
    if (down && now - this.#scrapAt < SCRAP.stand * 1000) this.#scrapAt = now - SCRAP.stand * 1000;
    const s = (now - this.#scrapAt) / 1000;
    if (s >= SCRAP_TOTAL) {
      this.#scrapDone = true;
      return;
    }
    const box = this.#scrap, dive = this.#diveBox, alpha = a * scrapAlpha(s);
    drawSprite(g, slipSprite(layer, 'gale', box.w, box.h, 21), box.x, box.y, { alpha });
    const tap = Math.abs(Math.sin(s * Math.PI * 1.1)), tip = dive.y - dive.h / 2 + 12 - (10 + 12 * tap);
    drawSprite(g, handSprite(layer, 84), box.x, tip, { rot: Math.PI / 2, alpha });
  }

  /** The disc, its contents re-inked some six times a second. */
  #disc(g: CanvasRenderingContext2D, layer: ChartLayer, a: number): void {
    const D = layer.layout.hud, m = this.#model, plate = this.#plate;
    if (!m || !plate) return;
    mapFace(g, layer, D, a, m.view.heading, () => {
      const key = String(this.#mapKey);
      if (plate.key !== key) plate.ink(key, (p, cx, cy) => this.#map.ink(p, cx, cy, layer, m.view, m.tide));
      drawSprite(g, plate.sprite, D.x, D.y, { alpha: a });
    });
  }

  /** The seconds until the Gale throws her off, a numeral on a slip top centre. */
  #countdown(g: CanvasRenderingContext2D, layer: ChartLayer, t: number, a: number): void {
    const l = layer.layout, n = Math.ceil(Math.max(0, GALE.time - t)), size = Math.round(l.figure.large * 0.72);
    const text = String(n), w = Math.ceil(figureWidth(text, size) + size * 1.1), h = Math.ceil(size * 1.5);
    const sprite = layer.sprite(`gale|count|${text}|${size}`, w + 16, h + 16, (w + 16) / 2, (h + 16) / 2, (p) => {
      const cx = (w + 16) / 2, cy = (h + 16) / 2;
      paper(p, slipPath(cx, cy, w, h, 9), { burn: 4 });
      figure(p, text, cx, cy + size * 0.42, size, { align: 'center', weight: 0.17, seed: 11 });
    });
    drawSprite(g, sprite, l.w / 2, l.safe.top + 26 + h / 2, { alpha: a });
  }

  /** DIVE: faint while the Gale is taking her up, inked in when she may go, sinking under a finger. */
  #diveButton(g: CanvasRenderingContext2D, layer: ChartLayer, t: number, a: number): void {
    const b = this.#diveBox, ready = t >= DIVE_ALLOWED, inked = clamp((t - DIVE_ALLOWED) / AT.ink);
    if (this.#dive) this.#dive.disabled = !ready;
    const size = layer.layout.figure.large, W = b.w + 16, H = b.h + 16;
    const faint = this.#diveSprite(layer, size, b, W, H, 0.42), full = this.#diveSprite(layer, size, b, W, H, 1);
    const look = pressLook(this.#press.sink);
    drawSprite(g, faint, b.x, b.y + look.dy, { alpha: a * (1 - inked), scale: look.scale, dark: look.dark });
    if (inked > 0) drawSprite(g, full, b.x, b.y + look.dy, { alpha: a * inked, scale: look.scale, dark: look.dark });
  }

  #diveSprite(layer: ChartLayer, size: number, b: Box, W: number, H: number, ink: number) {
    return layer.sprite(`gale|dive|${size}|${ink}`, W, H, W / 2, H / 2, (p) => {
      const cx = W / 2, cy = H / 2;
      paper(p, slipPath(cx, cy, b.w, b.h, 13), { alpha: ink < 1 ? 0.5 : 1, burn: 5 });
      word(p, 'DIVE', cx, cy + size * 0.37, size, { align: 'center', seed: 19, alpha: ink }, 1);
    });
  }

  /** Her marker during the glide: a pennant on a staff, standing on the water where it is, if it faces the eye. */
  #pennant(pen: Pen, now: number, dry: number): void {
    const h = this.#h, m = h.marker();
    if (!m) return;
    const eye = h.eye(), s = h.project({ x: m.x * R, y: m.y * R, z: m.z * R });
    if (!s || m.x * eye.x + m.y * eye.y + m.z * eye.z <= R) return;
    const tall = 62, len = 42, hoist = 17;
    pen.mood({ dry }, () => {
      pen.rule([[s.x, s.y, s.x, s.y - tall]], { w: 'bold', ink: 'white', alpha: 0.5, wobble: 0.15, seed: 7 });
      staff(pen, s.x, s.y - tall, s.y, 1, 3.4);
      pennant(pen, { x: s.x, y: s.y - tall + 3, length: len, height: hoist, colour: WASH.vermilion, seed: 41, phase: now / 260 });
    });
  }
}
