// The lobby (issue #54): her ship, live, at anchor on her home water, and six things on the view, each an instrument
// of the HUD's family (paper laid on the world, inked in iron, a woodcut where one is wanted) and nothing else. Top
// left, the career plate: her level's figure inside a ring that fills with gold leaf as her XP comes toward the next
// level, and beside it her rank's tier as a small wax seal in its illumination; pressed, it opens the rank folio. Top
// right, a ship's wheel on a round paper button: the settings. Bottom left, four tabs in a row, each a slip of paper
// with a rounded crown and a woodcut: a burst (abilities), a chest (locker), a staff of pennants (rank) and two ships
// bow to bow (rivals); each unrolls its folio (folio.ts) over her, her ship live beside it. Bottom right, under the thumb, PLAY: the one word on the screen, gilt
// capitals on a drawn ribbon, the largest thing here. The ship herself answers a finger anywhere else: one finger
// orbits the camera round her and tilts it a little, two fingers pinch it closer or farther, and let go she drifts
// back to her resting view over a few seconds.
//
// Entering, the instruments are laid one after another (from the right, behind the title's sheet as it rolls off that
// way) and ink in; the title's rose lands on the plate, where the level's ring inks in over it as it dries. PLAY
// springs under the finger with a flash of light on its gold, and the Gale's planet chart unrolls over her ship from
// the right; under it the match begins, the camera is put over the Gale's course, and the sheet thins in its window to
// the planet, where the Gale's own sheet lies under it. Leaving for anything else, the ink dries away.
//
// Everything here can be pressed, so everything is drawn on the live plane: each instrument drawn with the pen while it
// inks in, then baked once to a sprite and drawn as one image with its press look; only the ring's gold is drawn with
// the pen each frame. Everything runs off the time it is given, so a capture's frozen clock shows the same instants.
import type { Prim } from '../icons/draw.ts';
import {
  Press, arcPts, bakeSeal, drawSeal, drawSprite, dryAlpha, ease, figure, part, pressLook, prims, shape, stagger, stamp, unroll, woodcut, word,
  type Baked, type ChartLayer, type DragSurface, type Illumination, type Pen, type Pressable, type Pts, type Rect, type Seal, type Sprite,
} from '../chart/index.ts';
import { clamp, noise1 } from '../chart/noise.ts';
import { effect } from '../ui/parts/feedback.ts';
import { Sheets, type Folio, type SheetHost, type SheetName } from './folio.ts';
import { paper, roundButton, slipPath } from './instruments.ts';
import { BLEED, PlanetChart, type PlanetHost } from './planet.ts';
import { TITLE_LANDS, cornerRose } from './title.ts';

/** The career as the plate draws it. */
export interface CareerMarks {
  level: number;
  /** XP into the level, and what the level takes. */
  into: number;
  need: number;
  /** The rank's tier as the seal's illumination. */
  illumination: Illumination;
  /** Kept for the rank folio; the plate does not draw them. */
  matches: number;
  wins: number;
}

export interface LobbyHost extends PlanetHost {
  career(): CareerMarks;
  /** Makes the next match ready, and returns the Gale's course as a bearing from north (radians, clockwise). */
  prepare(): number;
  /** Begins the match made ready, under the Gale's chart. */
  begin(): void;
  /** Opens the settings. */
  settings(): void;
  /** Opens the rank folio: the career plate was pressed. */
  rank(): void;
  /** Unrolls a folio: its tab was pressed. */
  open(folio: Folio): void;
  /** Rolls the sheet back. */
  close(): void;
  /** What the folios and settings read and change. */
  readonly sheets: SheetHost;
  /** Where a finger has taken the camera. The app's: it goes on easing home after the lobby has gone to a folio. */
  readonly boom: Orbit;
}

export interface LobbyOptions {
  /** Entering from the title: the rose is flying to the plate, and lands there. */
  roseLanded?: boolean;
}

/** Where a finger has taken the camera off its resting view: a turn round her (radians), a tilt of the boom (radians,
 *  up positive) and the boom's length as a share of its rest. */
export interface Orbit {
  yaw: number;
  pitch: number;
  zoom: number;
}

/** How far a finger can take the camera (the tilt either way, the pinch in and out, the near end keeping 18 m of boom
 *  so it stands clear of her bowsprit's tip, 14.6 m out), how far a swipe across the screen turns her (radians), and how
 *  fast she drifts back once let go (the share of the way left closed a second). */
export const LOBBY_ORBIT = { pitch: [-0.07, 0.42], zoom: [0.6, 1.8], swipe: Math.PI * 1.5, back: 0.9 } as const;

/** No finger on her: the camera drifts back to its resting view. */
export function relaxOrbit(o: Orbit, dt: number): void {
  const k = 1 - Math.exp(-LOBBY_ORBIT.back * dt);
  o.yaw -= o.yaw * k;
  o.pitch -= o.pitch * k;
  o.zoom += (1 - o.zoom) * k;
}

/** When each thing happens, seconds: from the lobby's coming for entering, from the press for Play, from the leave for
 *  drying. */
const AT = {
  /** Each instrument is laid and inks in, in turn from the right, each as soon as the title's sheet rolling off that
   *  way has uncovered its place. */
  wheel: [0.4, 0.95],
  banner: [0.46, 1.15],
  letters: [0.9, 1.5],
  plate: [0.66, 1.3],
  badge: [1.0, 1.35],
  fill: [1.15, 1.75],
  tabs: [0.72, 1.8],
  /** The title's rose, landed on the plate, dries away under the ring in this long. */
  rose: 0.5,
  done: 1.85,
  /** After Play's press: the flash on its gold, the Gale's chart unrolling from the right, and its window opening on
   *  the planet. */
  flash: 0.45,
  unroll: [0.3, 1.1],
  open: 0.55,
  /** Leaving for anything but the Gale. */
  dry: 0.3,
} as const;

/** Seconds the window takes to open on the planet once the lobby's chart is down and the match begun: the Gale inks
 *  in after it. */
export const LOBBY_OPENS = AT.open;

const span = (s: number, [a, b]: readonly [number, number]): number => clamp((s - a) / (b - a));
const TAU = Math.PI * 2;
/** Room round a baked instrument for its shadow. */
const PAD = 20;

/** The tabs' folios, left to right, and their woodcuts. */
const TABS: readonly { folio: Folio; cut: string }[] = [
  { folio: 'abilities', cut: 'menu.burst' },
  { folio: 'locker', cut: 'menu.chest' },
  { folio: 'rank', cut: 'menu.pennants' },
  { folio: 'rivals', cut: 'menu.ships' },
];

// ── the instruments ──

/** The level's ring, radius r at (x, y), as the instruments' rim: a bold ring with a hairline inside it, the level's
 *  figure in the middle. The gold between the two is `ringFill`'s. */
function levelRing(pen: Pen, x: number, y: number, r: number, level: number, alpha: number, t: number): void {
  if (t <= 0) return;
  pen.stroke(arcPts(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * part(t, 0, 0.6), Math.max(48, Math.ceil(r * 1.5))),
    { w: 'bold', nib: 0.15, pool: 0.3, wobble: 0.3, drift: 0.2, seed: 41, alpha: 0.92 * alpha }, 1);
  pen.rule([arcPts(x, y, r * 0.76, 0, TAU * part(t, 0.1, 0.7), 56)], { w: 'hair', alpha: 0.6 * alpha, seed: 42 });
  const text = String(level), size = r * (text.length > 1 ? 0.76 : 0.92);
  figure(pen, text, x, y + size * 0.5, size, { align: 'center', seed: 5, alpha }, part(t, 0.35, 1));
}

/** The ring's gold: leaf laid between the ring and its hairline from north, clockwise, as far round as the XP has come,
 *  its leading edge ruled in ink. */
function ringFill(pen: Pen, x: number, y: number, r: number, f: number, alpha: number): void {
  if (f <= 0.003 || alpha <= 0.003) return;
  const r0 = r * 0.79, r1 = r * 0.96, a0 = -Math.PI / 2, a1 = a0 + TAU * Math.min(1, f);
  const p = new Path2D();
  p.arc(x, y, r1, a0, a1);
  p.arc(x, y, r0, a1, a0, true);
  p.closePath();
  pen.gilt(p, 'gold', x, y, r, alpha);
  if (f < 0.995) pen.rule([[x + Math.cos(a1) * r0, y + Math.sin(a1) * r0, x + Math.cos(a1) * r1, y + Math.sin(a1) * r1]], { w: 'fine', alpha: 0.85 * alpha, seed: 43 });
}

/** A tab's outline: a slip w × h with its top corners rounded to rr, cut by hand, from its top left; `inset` draws
 *  it that much inside. */
function tabPts(x0: number, y0: number, w: number, h: number, rr: number, inset: number, seed: number, wobble: number): Pts {
  const out: Pts = [], L = x0 + inset, R = x0 + w - inset, T = y0 + inset, B = y0 + h - inset, r = Math.max(1, rr - inset);
  const put = (x: number, y: number, s: number) => {
    const d = wobble * (0.7 * noise1(s / 11, seed) + 0.35 * noise1(s / 3.5, seed + 1));
    out.push(x + d, y + d * 0.6);
  };
  let s = 0;
  put(L, B, s);
  for (let y = B; y > T + r; y -= 3) put(L, y, s += 3);
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI + (k / 8) * (Math.PI / 2);
    put(L + r + Math.cos(a) * r, T + r + Math.sin(a) * r, s += 1);
  }
  for (let x = L + r; x < R - r; x += 3) put(x, T, s += 3);
  for (let k = 0; k <= 8; k++) {
    const a = -Math.PI / 2 + (k / 8) * (Math.PI / 2);
    put(R - r + Math.cos(a) * r, T + r + Math.sin(a) * r, s += 1);
  }
  for (let y = T + r; y < B; y += 3) put(R, y, s += 3);
  put(R, B, s);
  return out;
}

/**
 * A folio's tab, r the half-width of its slip, centred at (x, y): a slip of paper with a rounded crown and a square
 * foot, the crown ruled in a bold line with a hairline under it as the round button's rim is, and its woodcut on the
 * face. The row of them along the bottom edge reads as the tabs of folios stacked under the view.
 */
function tab(pen: Pen, x: number, y: number, r: number, drawing: readonly Prim[], o: { press?: number; alpha?: number; seed?: number } = {}, t = 1): void {
  if (t <= 0) return;
  const g = pen.g, look = pressLook(o.press ?? 0), alpha = (o.alpha ?? 1), seed = o.seed ?? 3;
  const w = r * 2, h = r * 1.9, x0 = x - r, y0 = y - h / 2, rr = r * 0.5;
  g.save();
  g.translate(x, y + look.dy);
  g.scale(look.scale, look.scale);
  g.translate(-x, -y);
  const outline: Pts = tabPts(x0, y0, w, h, rr, 0, seed, 1);
  outline.push(outline[0], outline[1]);
  paper(pen, shape(outline), { alpha: alpha * ease.out(part(t, 0, 0.3)), burn: Math.max(3, r * 0.1) });
  pen.mood({ dark: look.dark }, () => {
    // the crown's rule from one foot round to the other, and the hairline inside it
    const rim = tabPts(x0, y0, w, h, rr, r * 0.09, seed, 0), hair = tabPts(x0, y0, w, h, rr, r * 0.2, seed, 0);
    pen.stroke(rim, { w: 'bold', nib: 0.15, pool: 0.3, wobble: 0.3, drift: 0.2, seed, alpha: 0.92 * alpha }, part(t, 0.1, 0.7));
    pen.rule([hair], { w: 'hair', alpha: 0.6 * alpha, seed: seed + 1 }, part(t, 0.2, 0.8));
    const wt = part(t, 0.4, 1);
    if (wt > 0) woodcut(pen, drawing, x, y + r * 0.08, r * 1.12, 'iron', alpha * wt);
  });
  g.restore();
}

/** The ribbon's outline, w × h centred at (x, y): a banderole with its ends cut in swallowtails and its long edges
 *  waving a little, as a chart's title ribbon flies. `inset` draws it that much inside. */
function ribbonPts(x: number, y: number, w: number, h: number, inset: number): Pts {
  const x0 = x - w / 2 + inset, x1 = x + w / 2 - inset, y0 = y - h / 2 + inset, y1 = y + h / 2 - inset;
  const tail = h * 0.4 - inset * 0.6, amp = h * 0.045, n = 36, out: Pts = [];
  const wave = (u: number, sgn: number) => sgn * amp * Math.sin(u * Math.PI * 2.1 + 0.6) + sgn * amp * 0.4 * Math.sin(u * Math.PI * 4.7 + 2);
  out.push(x0 + tail, y);
  out.push(x0, y0 + wave(0, 1));
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    out.push(x0 + (x1 - x0) * u, y0 + wave(u, 1));
  }
  out.push(x1 - tail, y);
  out.push(x1, y1 + wave(1, -1));
  for (let i = n - 1; i >= 0; i--) {
    const u = i / n;
    out.push(x0 + (x1 - x0) * u, y1 + wave(u, -1));
  }
  out.push(x0 + tail, y);
  return out;
}

/**
 * PLAY: a ribbon w × h centred at (x, y), paper laid on the world, its outline inked bold with a hairline inside, its
 * ends shaded where they turn back, and the word lettered across it in gold leaf over an iron shadow, its cap height
 * half the ribbon's. `letters` is the word's own ink-in.
 */
function banner(pen: Pen, x: number, y: number, w: number, h: number, o: { press?: number; alpha?: number; seed?: number } = {}, t = 1, letters = t): void {
  if (t <= 0) return;
  const g = pen.g, look = pressLook(o.press ?? 0), alpha = o.alpha ?? 1, seed = o.seed ?? 23;
  g.save();
  g.translate(x, y + look.dy);
  g.scale(look.scale, look.scale);
  g.translate(-x, -y);
  const outline = ribbonPts(x, y, w, h, 0), p = shape(outline);
  paper(pen, shape(outline.map((v, i) => v + (0.7 * noise1(i / 5, seed) * (i & 1 ? 1 : 0.5)))), { alpha: alpha * ease.out(part(t, 0, 0.3)), burn: 6 });
  pen.mood({ dark: look.dark }, () => {
    // the ends, hatched where the ribbon turns from the light
    const tail = h * 0.4, ht = part(t, 0.3, 0.8);
    g.save();
    g.clip(p);
    pen.hatch(p, x - w / 2, y - h / 2, tail * 1.9, h, 0.95, 3.2, { alpha: 0.38 * alpha, seed: seed + 1 }, ht);
    pen.hatch(p, x + w / 2 - tail * 1.9, y - h / 2, tail * 1.9, h, 0.95, 3.2, { alpha: 0.38 * alpha, seed: seed + 2 }, ht);
    g.restore();
    pen.stroke(outline, { w: 'bold', nib: 0.15, pool: 0.3, wobble: 0.3, drift: 0.3, seed, alpha: 0.92 * alpha }, part(t, 0.05, 0.75));
    pen.rule([ribbonPts(x, y, w, h, h * 0.11)], { w: 'hair', alpha: 0.6 * alpha, seed: seed + 3 }, part(t, 0.15, 0.85));
    const cap = h * 0.5;
    word(pen, 'PLAY', x, y + cap * 0.5, cap, { align: 'center', gilt: true, seed: 3, alpha }, letters);
  });
  g.restore();
}

// ── the lobby ──

interface Geo {
  plate: { x: number; y: number; w: number; h: number };
  ring: { x: number; y: number; r: number };
  badge: { x: number; y: number; r: number };
  wheel: { x: number; y: number; r: number };
  tabs: { x: number; y: number; r: number }[];
  play: { x: number; y: number; w: number; h: number };
}

export class Lobby {
  readonly #host: HTMLElement;
  readonly #h: LobbyHost;
  #layer: ChartLayer | null = null;
  #g: Geo | null = null;
  #career: CareerMarks;
  #badge: Seal | null = null;
  /** The instruments at rest, baked. */
  #sprites: { plate: Sprite; wheel: Sprite; tabs: Sprite[]; play: Sprite } | null = null;
  /** When it came, Play was pressed, it left, and the window began to open (ms; -1 not yet). */
  #born = -1;
  #playAt = -1;
  #leftAt = -1;
  #openAt = -1;
  /** Everything is inked. */
  #inked = false;
  readonly #roseLanded: boolean;
  /** The Gale's chart, whole, unrolling over her ship; then laid in the page under the Gale's. */
  #planet: PlanetChart | null = null;
  #chart: Baked | null = null;
  #chartEl: HTMLCanvasElement | null = null;
  readonly #press = { play: new Press(), wheel: new Press(), plate: new Press(), tabs: TABS.map(() => new Press()) };
  #off: (() => void) | null = null;
  /** The chart's time at the last frame: a press acts between frames. */
  #lastNow = 0;
  /** The fingers on the view. */
  readonly #fingers = new Map<number, { x: number; y: number }>();
  readonly #drag: DragSurface;
  /** The fingers dragging the sheet, not the camera. */
  readonly #scrolling = new Set<number>();
  /** The folios' sheet, and what wants to be on it before the chart has come. */
  #sheets: Sheets | null = null;
  #want: SheetName | null = null;
  /** PLAY's press, which goes while the sheet covers it, and the presses that stay over the sheet's backdrop. */
  #playPress: Pressable | null = null;
  #over: Pressable[] = [];
  /** Called once the lobby has gone. */
  onGone?: () => void;

  constructor(host: HTMLElement, h: LobbyHost, o: LobbyOptions = {}) {
    this.#host = host;
    this.#h = h;
    this.#career = h.career();
    this.#roseLanded = !!o.roseLanded;
    this.#drag = {
      down: (id, x, y) => {
        if (this.#sheets?.takes(x, y)) {
          this.#scrolling.add(id);
          this.#sheets.down(id, x, y);
          return;
        }
        if (this.#fingers.size >= 2 || this.#playAt >= 0 || this.#leftAt >= 0) return;
        this.#fingers.set(id, { x, y });
      },
      move: (id, x, y) => {
        if (this.#scrolling.has(id)) this.#sheets?.move(id, x, y);
        else this.#finger(id, x, y);
      },
      up: (id) => {
        if (this.#scrolling.delete(id)) {
          this.#sheets?.up(id);
          return;
        }
        this.#fingers.delete(id);
        // let go, she comes back the short way round
        const o = this.#h.boom;
        o.yaw = Math.atan2(Math.sin(o.yaw), Math.cos(o.yaw));
      },
    };
  }

  /** Whether a finger is on her: the camera is the finger's, and does not drift back. */
  get held(): boolean {
    return this.#fingers.size > 0;
  }

  /** Whether Play unrolled the Gale's chart over her ship, and the match began under it. */
  get unrolled(): boolean {
    return this.#openAt >= 0;
  }

  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = now;
    this.#lastNow = now;
    this.#sheets = new Sheets(layer, this.#h.sheets, () => {
      for (const p of this.#over) layer.presses.add(p);
    }, () => this.#h.close());
    this.#lay();
    const off = layer.addLive((g, t) => this.#frame(g, t));
    const p = this.#press;
    const add = (id: string, press: Press, sound: 'play' | 'open', haptic: 'heavy' | 'light', act: () => void) =>
      layer.presses.add({ id: `lobby:${id}`, hit: { x: 0, y: 0, r: 1 }, press, sound, haptic, act });
    this.#playPress = add('play', p.play, 'play', 'heavy', () => this.#pressPlay());
    this.#over = [
      add('settings', p.wheel, 'open', 'light', () => this.#toggle('settings')),
      add('career', p.plate, 'open', 'light', () => this.#toggle('rank')),
      ...TABS.map((tb, i) => add(tb.folio, p.tabs[i], 'open', 'light', () => this.#toggle(tb.folio))),
    ];
    this.#placePresses();
    layer.drag = this.#drag;
    if (this.#want) this.show(this.#want, now);
    this.#off = () => {
      off();
      this.#unpress();
    };
  }

  /** Unrolls a folio or the settings, or (null) rolls the sheet back. */
  show(name: SheetName | null, now: number): void {
    const layer = this.#layer, sheets = this.#sheets;
    if (!layer || !sheets || this.#playAt >= 0 || this.#leftAt >= 0) {
      this.#want = name;
      return;
    }
    if (name) layer.presses.remove('lobby:play');
    sheets.show(name, now);
    if (!name && this.#playPress) {
      layer.presses.add(this.#playPress);
      this.#placePresses();
    }
  }

  /** A tab, the plate or the wheel: its sheet unrolls, or rolls back if it was the one down. */
  #toggle(name: SheetName): void {
    if (this.#sheets?.name === name) this.#h.close();
    else if (name === 'settings') this.#h.settings();
    else if (name === 'rank') this.#h.rank();
    else this.#h.open(name);
  }

  /** The screen changed size: laid out and baked again. */
  resize(): void {
    if (!this.#layer) return;
    this.#lay();
    this.#placePresses();
    this.#layer.invalidate();
  }

  /** Leaves for anything but the Gale Play unrolled: the ink dries away. */
  leave(now: number): void {
    if (this.#leftAt >= 0 || this.#playAt >= 0) return;
    const layer = this.#layer;
    if (!layer) {
      this.dispose();
      return;
    }
    this.#sheets?.show(null, now);
    this.#unpress();
    this.#leftAt = now;
    this.#inked = false;
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#unpress();
    this.#sheets?.dispose();
    this.#chartEl?.remove();
    this.#chartEl = null;
  }

  // ── layout and bakes ──

  #lay(): void {
    const layer = this.#layer!, l = layer.layout.lobby, dpr = layer.dpr, c = this.#career;
    const g: Geo = (this.#g = { plate: l.plate, ring: l.ring, badge: l.badge, wheel: l.wheel, tabs: l.tabs, play: l.play });
    this.#badge = bakeSeal(layer.paper, layer.layout.widths, c.illumination, { size: g.badge.r * 2, dpr, device: 'star', seed: 13 });
    const badge = this.#badge;
    /** A drawing baked once, w × h plus room for its shadow, anchored at its centre. */
    const bake = (key: string, w: number, h: number, draw: (p: Pen, gc: CanvasRenderingContext2D, cx: number, cy: number) => void) =>
      layer.sprite(key, Math.ceil(w + PAD * 2), Math.ceil(h + PAD * 2), w / 2 + PAD, h / 2 + PAD, (p, gc) => draw(p, gc, w / 2 + PAD, h / 2 + PAD));
    const size = `${layer.layout.cls}|${g.plate.w}`;
    this.#sprites = {
      plate: bake(`lobby-plate|${size}|${c.level}|${c.illumination}`, g.plate.w, g.plate.h + g.badge.r * 2, (p, gc, cx, cy) =>
        this.#plate(p, gc, cx, cy - g.badge.r, badge, 1, 1)),
      wheel: bake(`lobby-wheel|${size}`, g.wheel.r * 2, g.wheel.r * 2, (p, _gc, cx, cy) => roundButton(p, cx, cy, g.wheel.r, prims('menu.wheel'), { seed: 7 })),
      tabs: TABS.map((tb, i) => bake(`lobby-tab|${size}|${tb.folio}`, g.tabs[i].r * 2, g.tabs[i].r * 2, (p, _gc, cx, cy) => tab(p, cx, cy, g.tabs[i].r, prims(tb.cut), { seed: 11 + i }))),
      play: bake(`lobby-play|${size}`, g.play.w, g.play.h, (p, _gc, cx, cy) => banner(p, cx, cy, g.play.w, g.play.h, { seed: 23 })),
    };
    this.#sheets?.lay();
  }

  #placePresses(): void {
    const layer = this.#layer!, g = this.#g!, find = (id: string) => layer.presses.list.find((p) => p.id === id);
    const play = find('lobby:play');
    if (play) play.hit = { ...g.play };
    const set = find('lobby:settings');
    if (set) set.hit = { ...g.wheel };
    const plate = find('lobby:career');
    if (plate) plate.hit = { ...g.plate };
    TABS.forEach((tb, i) => {
      const t = find(`lobby:${tb.folio}`);
      if (t) t.hit = { ...g.tabs[i] };
    });
  }

  #unpress(): void {
    const layer = this.#layer;
    if (!layer) return;
    for (const id of ['lobby:play', 'lobby:settings', 'lobby:career', ...TABS.map((t) => `lobby:${t.folio}`)]) layer.presses.remove(id);
    if (layer.drag === this.#drag) layer.drag = null;
    this.#fingers.clear();
    this.#scrolling.clear();
  }

  // ── the ship: orbit and pinch ──

  /** A finger moved: one finger turns and tilts the camera, two pinch it closer or farther. */
  #finger(id: number, x: number, y: number): void {
    const f = this.#fingers.get(id), layer = this.#layer, o = this.#h.boom;
    if (!f || !layer) return;
    if (this.#fingers.size === 1) {
      const l = layer.layout, [p0, p1] = LOBBY_ORBIT.pitch;
      o.yaw -= ((x - f.x) / l.w) * LOBBY_ORBIT.swipe;
      o.pitch = clamp(o.pitch + ((y - f.y) / l.h) * 1.2, p0, p1);
    } else {
      let other = f;
      for (const [k, q] of this.#fingers) if (k !== id) other = q;
      const d0 = Math.hypot(f.x - other.x, f.y - other.y), d1 = Math.hypot(x - other.x, y - other.y), [z0, z1] = LOBBY_ORBIT.zoom;
      if (d0 > 8 && d1 > 8) o.zoom = clamp((o.zoom * d0) / d1, z0, z1);
    }
    f.x = x;
    f.y = y;
  }

  // ── Play ──

  #pressPlay(): void {
    const s = (this.#lastNow - this.#born) / 1000;
    if (this.#playAt >= 0 || this.#leftAt >= 0 || s < AT.banner[0]) return;
    const layer = this.#layer!;
    this.#playAt = this.#lastNow;
    this.#unpress();
    this.#inked = true;
    // the match made ready, and the Gale's chart, whole, its web and needle swung to the course, to unroll over her
    let c = this.#h.prepare() % TAU;
    if (c > Math.PI) c -= TAU;
    if (c < -Math.PI) c += TAU;
    this.#planet = new PlanetChart(layer, this.#h);
    this.#chart = this.#planet.sheet(c, true);
    effect('lobby:unroll', 'whoosh', 'none');
  }

  // ── drawing ──

  /** One frame of the live plane: the instruments inking in or drying, or at rest with their press looks. */
  #frame(gc: CanvasRenderingContext2D, now: number): Rect[] | void {
    this.#lastNow = now;
    const layer = this.#layer!, pen = layer.pen;
    if (this.#playAt >= 0) return this.#playing(gc, now);
    const s = (now - this.#born) / 1000;
    const dry = this.#leftAt < 0 ? 0 : clamp((now - this.#leftAt) / 1000 / AT.dry);
    if (dry >= 1) {
      this.dispose();
      this.onGone?.();
      return;
    }
    if (!this.#inked && this.#leftAt < 0 && s >= AT.done) this.#inked = true;
    pen.mood({ dry }, () => this.#draw(gc, pen, this.#inked ? Infinity : s, dryAlpha(dry), now));
    const sheet = this.#sheets?.frame(gc, now);
    return this.#inked && dry === 0 ? (sheet ? [...this.#rects(), sheet] : this.#rects()) : undefined;
  }

  /** The career plate at (x, y): its slip, the level's ring and figure, and the rank's seal pressed beside it; the
   *  ring's gold is drawn apart, over it. */
  #plate(pen: Pen, gc: CanvasRenderingContext2D, x: number, y: number, badge: Seal, alpha: number, t: number, bt = t): void {
    const g = this.#g!, c = this.#career, ring = { x: x + (g.ring.x - g.plate.x), y: y + (g.ring.y - g.plate.y), r: g.ring.r };
    const bx = x + (g.badge.x - g.plate.x), by = y + (g.badge.y - g.plate.y);
    paper(pen, slipPath(x, y, g.plate.w, g.plate.h, 5), { alpha: alpha * ease.out(part(t, 0, 0.3)), burn: 5 });
    if (this.#roseLanded && t < 1) {
      // the title's rose, landed here, dries away as the ring inks in over it
      const s = (this.#lastNow - this.#born) / 1000, rt = s < TITLE_LANDS ? -1 : clamp((s - TITLE_LANDS) / AT.rose);
      if (rt >= 0 && rt < 1) drawSprite(gc, cornerRose(this.#layer!), ring.x, ring.y, { scale: ring.r / this.#layer!.layout.rose.r, alpha: alpha * dryAlpha(rt) });
    }
    levelRing(pen, ring.x, ring.y, ring.r, c.level, alpha, part(t, 0.25, 1));
    if (bt > 0) {
      drawSeal(gc, badge, bx, by, { phase: 0.5, scale: 1 + 0.3 * (1 - ease.back(bt)), alpha: alpha * clamp(bt * 3) });
      if (bt < 1) stamp(pen, bx, by, g.badge.r, bt, 7);
    }
  }

  /** The XP as a share of the level, and how far the ring's gold has come at s seconds. */
  #fill(s: number): number {
    const c = this.#career, f = c.need > 0 ? clamp(c.into / c.need) : 1;
    return f * ease.out(span(s, AT.fill));
  }

  /** Every instrument as inked at s seconds (Infinity: at rest), at `alpha`, with its press look. */
  #draw(gc: CanvasRenderingContext2D, pen: Pen, s: number, alpha: number, now: number): void {
    const g = this.#g!, sp = this.#sprites!, p = this.#press, rest = s === Infinity;
    /** A sprite with its press look, or nothing while the pen still draws it. */
    const pressed = (sprite: Sprite, x: number, y: number, sink: number, a = alpha) => {
      const look = pressLook(sink);
      drawSprite(gc, sprite, x, y + look.dy, { scale: look.scale, dark: look.dark, alpha: a });
      return look;
    };
    // the wheel
    const wt = span(s, AT.wheel);
    if (rest || wt >= 1) pressed(sp.wheel, g.wheel.x, g.wheel.y, p.wheel.sink);
    else roundButton(pen, g.wheel.x, g.wheel.y, g.wheel.r, prims('menu.wheel'), { alpha: alpha * ease.out(part(wt, 0, 0.3)), seed: 7 }, wt);
    // PLAY, with the flash of light on its gold after the press
    const bt = span(s, AT.banner), lt = span(s, AT.letters);
    if (rest || (bt >= 1 && lt >= 1)) {
      const fk = this.#playAt < 0 ? 1 : clamp((now - this.#playAt) / 1000 / AT.flash);
      const k = 1 + 0.07 * Math.sin(Math.PI * fk), look = pressLook(p.play.sink);
      drawSprite(gc, sp.play, g.play.x, g.play.y + look.dy, { scale: look.scale * k, dark: look.dark, alpha });
      if (fk < 1) {
        const cap = g.play.h * 0.5 * k;
        word(pen, 'PLAY', g.play.x, g.play.y + look.dy + cap * 0.5, cap, { align: 'center', ink: 'white', seed: 3, alpha: alpha * 0.9 * (1 - ease.in(fk)) });
      }
    } else banner(pen, g.play.x, g.play.y, g.play.w, g.play.h, { alpha, seed: 23 }, bt, lt);
    // the career plate, and the ring's gold over it, which moves with its press
    const pt = span(s, AT.plate), kt = span(s, AT.badge);
    let look = pressLook(0);
    if (rest || (pt >= 1 && kt >= 1 && !(this.#roseLanded && s < TITLE_LANDS + AT.rose))) look = pressed(sp.plate, g.plate.x, g.plate.y + g.badge.r, p.plate.sink);
    else this.#plate(pen, gc, g.plate.x, g.plate.y, this.#badge!, alpha, pt, kt);
    const f = this.#fill(s);
    if (f > 0) {
      gc.save();
      gc.translate(g.plate.x, g.plate.y + look.dy);
      gc.scale(look.scale, look.scale);
      gc.translate(-g.plate.x, -g.plate.y);
      pen.mood({ dark: look.dark }, () => ringFill(pen, g.ring.x, g.ring.y, g.ring.r, f, alpha));
      gc.restore();
    }
    // the tabs, one after another
    const tt = span(s, AT.tabs);
    TABS.forEach((tb, i) => {
      const t = rest ? 1 : stagger(tt, i, TABS.length, 0.5), c = g.tabs[i];
      // the open folio's tab stands proud of its fellows
      if (t >= 1) pressed(sp.tabs[i], c.x, c.y - (tb.folio === this.#sheets?.name ? 10 : 0), p.tabs[i].sink);
      else tab(pen, c.x, c.y, c.r, prims(tb.cut), { alpha, seed: 11 + i }, t);
    });
  }

  /** Where the instruments draw, with room for their shadows and press looks. */
  #rects(): Rect[] {
    const g = this.#g!, P = PAD + 6, box = (x: number, y: number, w: number, h: number): Rect => ({ x: x - w / 2 - P, y: y - h / 2 - P, w: w + P * 2, h: h + P * 2 });
    return [
      box(g.plate.x, g.plate.y + g.badge.r, g.plate.w, g.plate.h + g.badge.r * 2),
      box(g.wheel.x, g.wheel.y, g.wheel.r * 2, g.wheel.r * 2),
      ...g.tabs.map((c) => box(c.x, c.y, c.r * 2, c.r * 2)),
      box(g.play.x, g.play.y, g.play.w * 1.08, g.play.h * 1.1),
    ];
  }

  /** Play: the gold flashes, the Gale's chart unrolls over her ship from the right, the match begins under it, and its
   *  window opens on the planet. */
  #playing(gc: CanvasRenderingContext2D, now: number): void {
    const layer = this.#layer!, pen = layer.pen, s = (now - this.#playAt) / 1000;
    if (this.#openAt < 0) {
      // the press, no longer routed, still springs back under the lettering
      this.#press.play.step(Math.min(0.1, Math.max(0, (now - this.#lastNow) / 1000) || 1 / 30));
      this.#draw(gc, pen, Infinity, 1, now);
      const u = span(s, AT.unroll);
      if (u < 1) {
        unroll(gc, pen.paper, this.#chart!, -BLEED, -BLEED, u, 'left', layer.dpr);
        return;
      }
      // down over her: laid in the page under the Gale's, the instruments taken off, and the match begun under it
      this.#chartEl = this.#planet!.place(this.#host, this.#chart!, 1);
      this.#openAt = now;
      this.#h.begin();
      return;
    }
    // the window opens: this sheet thins away over the Gale's, which is cut there
    const o = clamp((now - this.#openAt) / 1000 / AT.open);
    if (this.#chartEl) this.#chartEl.style.opacity = String(1 - ease.inOut(o));
    if (o >= 1) {
      this.dispose();
      this.onGone?.();
    }
  }
}
