// The lobby: her ship, live, at anchor on her home water, and the chart only at the margins, on torn scraps pinned over
// the view, which is never covered. The rose keeps the top left corner on a scrap of its own (the title's rose lands
// there); beside it the career is a strapwork cartouche on a scrap, drawn flat because it cannot be pressed: her level
// as rings inked round a roundel bearing the level's figure, her rank as that roundel's illumination, her matches as
// tally marks and her wins as gilt stars. What can be pressed is a wax seal, and nothing else is: a small red seal
// bearing the dividers, top right, for the settings; and Play, the one gold seal and the largest thing on the screen,
// under the right thumb. The bottom edge left of Play is kept clear for the folios' seals. Nothing is written.
//
// Entering, the scraps are laid one after another (from the right, behind the title's sheet as it rolls off that way)
// and what is on them inks in. Play stamps its seal and the Gale's planet chart unrolls over her ship from the right;
// under it the match begins, the camera is put over the Gale's course, and the sheet thins in its window to the planet,
// where the Gale's own sheet lies under it. Leaving for anything else, the ink dries away.
//
// Each scrap and what is on it is drawn on the live plane while it inks in, then painted once on the sheet plane; the
// live plane keeps only the two seals, which answer a press, and Play's sheen. Everything runs off the time it is
// given, so a capture's frozen clock shows the same instants.
import {
  Press, arcPts, bakeSeal, cartouche, drawBaked, drawSeal, drawSprite, ease, figure, needle, pressLook, rings, rose, stamp,
  star, stagger, tally, unroll, type Baked, type ChartLayer, type Illumination, type Pen, type Rect, type Seal,
} from '../chart/index.ts';
import { effect } from '../ui/parts/feedback.ts';
import { BLEED, PlanetChart, type PlanetHost } from './planet.ts';
import { ROSE, TITLE_LANDS, cornerRose } from './title.ts';

/** The career as the cartouche draws it. */
export interface CareerMarks {
  level: number;
  /** XP into the level, and what the level takes. */
  into: number;
  need: number;
  /** The rank's tier as the roundel's illumination. */
  illumination: Illumination;
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
}

export interface LobbyOptions {
  /** Entering from the title: the rose is flying to its corner, and lands there. */
  roseLanded?: boolean;
}

/** When each thing happens, seconds: from the lobby's coming for entering, from the press for Play, from the leave for
 *  drying. */
const AT = {
  /** Each scrap is laid in this long, in turn from the right, each as soon as the title's sheet rolling off that way
   *  has uncovered its place. */
  lay: 0.24,
  scraps: { settings: 0.42, play: 0.48, career: 0.68, rose: 0.78 },
  /** The rose inks itself in on its scrap (unless the title's lands there), its needle last. */
  rose: [0.85, 1.6],
  needle: [1.3, 1.6],
  /** The cartouche, then the career in it: the roundel, its rings, the tallies and the stars. */
  cartouche: [0.8, 1.4],
  career: [1.15, 1.5],
  rings: [1.35, 1.85],
  tally: [1.45, 1.95],
  stars: [1.65, 2.1],
  /** The seals are pressed onto their scraps: the settings', then Play's, which stamps. */
  settings: [0.6, 0.85],
  play: [0.9, 1.2],
  done: 2.15,
  /** After Play's press: the stamp, the Gale's chart unrolling from the right, and its window opening on the planet. */
  stamp: 0.5,
  unroll: [0.3, 1.1],
  open: 0.55,
  /** Leaving for anything but the Gale. */
  dry: 0.3,
} as const;

/** Seconds the window takes to open on the planet once the lobby's chart is down and the match begun: the Gale inks
 *  in after it. */
export const LOBBY_OPENS = AT.open;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const span = (s: number, [a, b]: readonly [number, number]): number => clamp((s - a) / (b - a));
const TAU = Math.PI * 2;

/** A scrap's middle, size and tilt. */
interface Scrap {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  seed: number;
}

interface Geo {
  phone: boolean;
  rose: { x: number; y: number; r: number };
  scraps: { rose: Scrap; career: Scrap; settings: Scrap; play: Scrap };
  /** The cartouche on the career's scrap, and where the career's marks go in its field. */
  cart: { x: number; y: number; w: number; h: number };
  field: { sx: number; sy: number; sr: number; gap: number; tx: number; ty: number; th: number; st: number };
  settings: { x: number; y: number; r: number };
  /** Play, under the right thumb. */
  play: { x: number; y: number; r: number };
}

function geo(layer: ChartLayer): Geo {
  const l = layer.layout, { w, safe } = l, phone = l.cls === 'iphone', m = l.margin, rose = l.rose;
  // the rose's scrap round the corner's rose, the career's beside it
  const rs = rose.r * 2 + (phone ? 20 : 28);
  const cw = phone ? 186 : 268, ch = phone ? 104 : 148, gap = phone ? 8 : 12;
  const career: Scrap = { x: rose.x + rs / 2 + gap + cw / 2, y: rose.y + (phone ? 2 : 4), w: cw, h: ch, rot: 0.018, seed: 5 };
  const cart = { x: career.x, y: career.y + 1, w: cw - (phone ? 14 : 22), h: ch - (phone ? 14 : 20) };
  const rx = cart.w * 0.3, sr = phone ? 11 : 15;
  // the seals: the settings' small in the top right corner, Play's the largest thing on the screen
  const setR = phone ? 24 : 30, ss = setR * 2 + (phone ? 20 : 26);
  const settings = { x: w - safe.right - m - ss / 2, y: safe.top + m + ss / 2, r: setR };
  const play = { x: l.thumbs.right.x, y: l.thumbs.right.y, r: phone ? 60 : 88 }, ps = play.r * 2 + (phone ? 22 : 30);
  return {
    phone, rose,
    scraps: {
      rose: { x: rose.x, y: rose.y, w: rs, h: rs - 4, rot: -0.022, seed: 3 },
      career,
      settings: { x: settings.x, y: settings.y, w: ss, h: ss - 2, rot: 0.03, seed: 11 },
      play: { x: play.x, y: play.y, w: ps, h: ps - 6, rot: -0.02, seed: 17 },
    },
    cart,
    field: {
      sx: cart.x - rx * 0.46, sy: cart.y, sr, gap: phone ? 2.2 : 3,
      tx: cart.x + rx * 0.08, ty: cart.y - cart.h * 0.02, th: phone ? 14 : 20, st: cart.y + cart.h * 0.19,
    },
    settings, play,
  };
}

/** Play's device: a ship under sail, white on the matrix, pressed into the leaf. */
function shipDevice(g: CanvasRenderingContext2D, r: number): void {
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.beginPath();
  g.moveTo(-0.8 * r, 0.16 * r);
  g.lineTo(0.84 * r, 0.12 * r);
  g.quadraticCurveTo(0.62 * r, 0.52 * r, 0.04 * r, 0.54 * r);
  g.quadraticCurveTo(-0.6 * r, 0.52 * r, -0.8 * r, 0.16 * r);
  g.fill();
  g.lineWidth = r * 0.06;
  g.lineCap = 'round';
  for (const [x, top, sw, sh] of [[-0.4, -0.5, 0.36, 0.5], [0.06, -0.74, 0.44, 0.68], [0.5, -0.42, 0.3, 0.42]]) {
    g.beginPath();
    g.moveTo(x * r, 0.14 * r);
    g.lineTo(x * r, (top - 0.12) * r);
    g.stroke();
    // a square sail, bellied forward
    const x0 = (x - sw / 2) * r, x1 = (x + sw / 2) * r, y0 = top * r, y1 = (top + sh) * r;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y0);
    g.quadraticCurveTo(x1 + sw * 0.18 * r, (y0 + y1) / 2, x1, y1);
    g.lineTo(x0, y1);
    g.quadraticCurveTo(x0 + sw * 0.18 * r, (y0 + y1) / 2, x0, y0);
    g.fill();
  }
}

/** The settings' device: a pair of dividers, white on the matrix: the handle's knob, the round hinge, and the two legs
 *  spread wide and filed to points. */
function dividersDevice(g: CanvasRenderingContext2D, r: number): void {
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  const hy = -0.5 * r, L = 1.3 * r, spread = 0.5;
  for (const side of [-1, 1]) {
    const a = side * spread, dx = Math.sin(a), dy = Math.cos(a), nx = dy * 0.11 * r, ny = -dx * 0.11 * r;
    g.beginPath();
    g.moveTo(nx, hy + ny);
    g.quadraticCurveTo(dx * L * 0.5 + nx * 0.8, hy + dy * L * 0.5 + ny * 0.8, dx * L, hy + dy * L);
    g.quadraticCurveTo(dx * L * 0.5 - nx * 0.8, hy + dy * L * 0.5 - ny * 0.8, -nx, hy - ny);
    g.fill();
  }
  g.beginPath();
  g.arc(0, hy, r * 0.2, 0, TAU);
  g.fill();
  g.lineWidth = r * 0.12;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, hy - r * 0.2);
  g.lineTo(0, hy - r * 0.42);
  g.stroke();
  g.beginPath();
  g.arc(0, hy - r * 0.5, r * 0.11, 0, TAU);
  g.fill();
}

/** The career's roundel: an impression in ink, not wax (it cannot be pressed), the rank's illumination laid in it and
 *  the level's figure written over: plain ink, red rubric, red in a blue ring, silver leaf or gold leaf. */
function roundel(pen: Pen, x: number, y: number, r: number, ill: Illumination, level: number, t: number): void {
  if (t <= 0) return;
  const lt = clamp(t / 0.55), ft = clamp((t - 0.4) / 0.6), disc = new Path2D();
  disc.arc(x, y, r, 0, TAU);
  if (ill === 'gold' || ill === 'silver') pen.gilt(disc, ill, x, y, r, ease.out(lt));
  const ring = ill === 'rubric' ? 'rubric' : ill === 'redBlue' ? 'blue' : 'iron';
  pen.stroke(arcPts(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * lt, 48), { w: 'fine', ink: ring, nib: 0.2, pool: 0.3, seed: 61 }, 1);
  if (lt >= 1) pen.rule([arcPts(x, y, r * 0.8, 0, TAU, 40)], { w: 'hair', ink: ring, alpha: 0.7, seed: 62 });
  const text = String(level), size = r * (text.length > 1 ? 0.92 : 1.1);
  figure(pen, text, x, y + size / 2, size, { align: 'center', ink: ill === 'rubric' || ill === 'redBlue' ? 'rubric' : 'iron', seed: 5 }, ft);
}

export class Lobby {
  readonly #host: HTMLElement;
  readonly #h: LobbyHost;
  #layer: ChartLayer | null = null;
  #g: Geo | null = null;
  #career: CareerMarks;
  #paper: Record<keyof Geo['scraps'], Baked> | null = null;
  #setSeal: Seal | null = null;
  #playSeal: Seal | null = null;
  /** When it came, Play was pressed, it left, and the window began to open (ms; -1 not yet). */
  #born = -1;
  #playAt = -1;
  #leftAt = -1;
  #openAt = -1;
  /** Everything is inked, and held on the sheet plane; and the Gale's chart is down over it. */
  #inked = false;
  #covered = false;
  readonly #roseLanded: boolean;
  /** The Gale's chart, whole, unrolling over her ship; then laid in the page under the Gale's. */
  #planet: PlanetChart | null = null;
  #chart: Baked | null = null;
  #chartEl: HTMLCanvasElement | null = null;
  readonly #play = new Press();
  readonly #set = new Press();
  #off: (() => void) | null = null;
  /** The chart's time at the last frame: a press acts between frames. */
  #lastNow = 0;
  /** Called once the lobby has gone. */
  onGone?: () => void;

  constructor(host: HTMLElement, h: LobbyHost, o: LobbyOptions = {}) {
    this.#host = host;
    this.#h = h;
    this.#career = h.career();
    this.#roseLanded = !!o.roseLanded;
  }

  /** Whether Play unrolled the Gale's chart over her ship, and the match began under it. */
  get unrolled(): boolean {
    return this.#openAt >= 0;
  }

  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = now;
    this.#lastNow = now;
    this.#lay();
    const off = layer.addLive((g, t) => this.#frame(g, t));
    const offSheet = layer.addSheet((g, pen) => {
      if (this.#inked && !this.#covered && this.#leftAt < 0) this.#scrapsAt(g, pen, Infinity);
    });
    layer.presses.add({ id: 'lobby:play', hit: { x: 0, y: 0, r: 1 }, press: this.#play, sound: 'play', haptic: 'heavy', act: () => this.#pressPlay() });
    layer.presses.add({ id: 'lobby:settings', hit: { x: 0, y: 0, r: 1 }, press: this.#set, sound: 'open', haptic: 'light', act: () => this.#h.settings() });
    this.#placePresses();
    this.#off = () => {
      off();
      offSheet();
      this.#unpress();
    };
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
    this.#unpress();
    this.#leftAt = now;
    this.#inked = false;
    layer.invalidate();
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#chartEl?.remove();
    this.#chartEl = null;
  }

  // ── layout and bakes ──

  #lay(): void {
    const layer = this.#layer!, g = (this.#g = geo(layer)), dpr = layer.dpr, s = g.scraps;
    const scrap = (c: Scrap) => layer.sheet('scrap', Math.round(c.w), Math.round(c.h), c.seed);
    this.#paper = { rose: scrap(s.rose), career: scrap(s.career), settings: scrap(s.settings), play: scrap(s.play) };
    this.#setSeal = bakeSeal(layer.paper, layer.layout.widths, 'rubric', { size: g.settings.r * 2, dpr, device: dividersDevice, seed: 13 });
    this.#playSeal = bakeSeal(layer.paper, layer.layout.widths, 'gold', { size: g.play.r * 2, dpr, device: shipDevice, seed: 23 });
  }

  #placePresses(): void {
    const layer = this.#layer!, g = this.#g!;
    const play = layer.presses.list.find((p) => p.id === 'lobby:play');
    if (play) play.hit = { x: g.play.x, y: g.play.y, r: g.play.r };
    const set = layer.presses.list.find((p) => p.id === 'lobby:settings');
    if (set) set.hit = { x: g.settings.x, y: g.settings.y, r: g.settings.r };
  }

  #unpress(): void {
    this.#layer?.presses.remove('lobby:play');
    this.#layer?.presses.remove('lobby:settings');
  }

  // ── Play ──

  #pressPlay(): void {
    const s = (this.#lastNow - this.#born) / 1000;
    if (this.#playAt >= 0 || this.#leftAt >= 0 || s < AT.play[0]) return;
    const layer = this.#layer!;
    this.#playAt = this.#lastNow;
    this.#unpress();
    // whatever was still inking is laid as it ends
    if (!this.#inked) {
      this.#inked = true;
      layer.invalidate();
    }
    // the match made ready, and the Gale's chart, whole, its web and needle swung to the course, to unroll over her
    let c = this.#h.prepare() % TAU;
    if (c > Math.PI) c -= TAU;
    if (c < -Math.PI) c += TAU;
    this.#planet = new PlanetChart(layer, this.#h);
    this.#chart = this.#planet.sheet(c, true);
    effect('lobby:unroll', 'whoosh', 'none');
  }

  // ── drawing ──

  /** One frame of the live plane: everything while it inks in or dries, then only the seals. */
  #frame(gc: CanvasRenderingContext2D, now: number): Rect[] | void {
    this.#lastNow = now;
    const layer = this.#layer!, pen = layer.pen, s = (now - this.#born) / 1000;
    if (this.#playAt >= 0) return this.#playing(gc, now);
    const dry = this.#leftAt < 0 ? 0 : clamp((now - this.#leftAt) / 1000 / AT.dry);
    if (dry >= 1) {
      this.dispose();
      this.onGone?.();
      return;
    }
    if (!this.#inked && this.#leftAt < 0 && s >= AT.done) {
      this.#inked = true;
      layer.invalidate();
    }
    if (this.#inked) return this.#seals(gc, now, s, 1);
    pen.mood({ dry }, () => this.#scrapsAt(gc, pen, s));
    this.#seals(gc, now, s, 1 - dry);
  }

  /** A scrap laid at its place by t: it drops onto the view, a little large and faint at first. */
  #scrap(gc: CanvasRenderingContext2D, b: Baked, c: Scrap, t: number, alpha: number): void {
    if (t <= 0 || alpha <= 0) return;
    const k = 1 + 0.06 * (1 - ease.out(t));
    gc.save();
    gc.translate(c.x, c.y);
    gc.rotate(c.rot);
    gc.scale(k, k);
    drawBaked(gc, b, -b.w / 2, -b.h / 2, alpha * ease.out(clamp(t * 1.6)));
    gc.restore();
  }

  /** The scraps and what is inked on them at s seconds (not the seals). */
  #scrapsAt(gc: CanvasRenderingContext2D, pen: Pen, s: number): void {
    const g = this.#g!, p = this.#paper!, a = 1 - pen.dry, layer = this.#layer!;
    const laid = (at: number) => clamp((s - at) / AT.lay);
    this.#scrap(gc, p.play, g.scraps.play, laid(AT.scraps.play), a);
    this.#scrap(gc, p.settings, g.scraps.settings, laid(AT.scraps.settings), a);
    this.#scrap(gc, p.career, g.scraps.career, laid(AT.scraps.career), a);
    this.#scrap(gc, p.rose, g.scraps.rose, laid(AT.scraps.rose), a);
    // the rose in its corner, its needle at north: the title's lands there, or it inks itself in
    if (this.#roseLanded) {
      if (s >= TITLE_LANDS) {
        drawSprite(gc, cornerRose(layer), g.rose.x, g.rose.y, { alpha: a });
        needle(pen, g.rose.x, g.rose.y, g.rose.r * 0.52, 0, 1);
      }
    } else {
      const rt = span(s, AT.rose);
      if (rt >= 1) drawSprite(gc, cornerRose(layer), g.rose.x, g.rose.y, { alpha: a });
      else if (rt > 0) rose(pen, g.rose.x, g.rose.y, g.rose.r, ROSE, rt);
      needle(pen, g.rose.x, g.rose.y, g.rose.r * 0.52, 0, span(s, AT.needle));
    }
    this.#drawCareer(pen, s);
  }

  /** The cartouche, flat, and the career in it, as inked at s seconds. */
  #drawCareer(pen: Pen, s: number): void {
    const g = this.#g!, c = this.#career, f = g.field, cart = g.cart;
    cartouche(pen, cart.x, cart.y, cart.w, cart.h, { field: '#d8c39a', seed: 31, flat: true }, span(s, AT.cartouche));
    // the level: rings round the roundel, one for each level up to six, the newest closing as the level fills
    const rt = span(s, AT.rings);
    if (rt > 0) rings(pen, f.sx, f.sy, f.sr + (g.phone ? 3 : 4), f.gap, Math.min(6, c.level), rt * Math.max(0.04, c.need > 0 ? c.into / c.need : 1));
    roundel(pen, f.sx, f.sy, f.sr, c.illumination, c.level, span(s, AT.career));
    // matches: tally marks, a figure once they are more than marks read at a glance
    const tt = span(s, AT.tally);
    if (tt > 0) {
      if (c.matches <= 10) tally(pen, c.matches, f.tx, f.ty, f.th, tt, 'iron', 13);
      else {
        const w = figure(pen, String(c.matches), f.tx, f.ty, f.th, { seed: 5 }, tt);
        tally(pen, 5, f.tx + w + f.th * 0.4, f.ty, f.th * 0.7, tt, 'iron', 13);
      }
    }
    // wins: gilt stars, and past three a star and its figure
    const wt = span(s, AT.stars), sr = f.th * 0.42, gap = sr * 2.4;
    if (wt > 0) {
      if (c.wins <= 3) for (let i = 0; i < c.wins; i++) star(pen, f.tx + sr + i * gap, f.st, sr, stagger(wt, i, Math.max(1, c.wins), 0.6));
      else {
        star(pen, f.tx + sr, f.st, sr, wt);
        figure(pen, String(c.wins), f.tx + sr * 2.5, f.st + f.th * 0.42, f.th * 0.9, { seed: 9 }, wt);
      }
    }
  }

  /** The two seals, pressed onto their scraps and answering a press; Play's leaf catching the light. Returns where
   *  they drew. */
  #seals(gc: CanvasRenderingContext2D, now: number, s: number, alpha: number): Rect[] {
    const g = this.#g!, pen = this.#layer!.pen, out: Rect[] = [];
    const box = (c: { x: number; y: number; r: number }, k: number) => out.push({ x: c.x - c.r * k, y: c.y - c.r * k, w: c.r * k * 2, h: c.r * k * 2 });
    const st = span(s, AT.settings);
    if (st > 0 && this.#setSeal) {
      const look = pressLook(this.#set.sink);
      drawSeal(gc, this.#setSeal, g.settings.x, g.settings.y + look.dy, { phase: 0.5, press: this.#set.sink, scale: 1 + 0.3 * (1 - ease.back(st)), alpha: alpha * clamp(st * 3) });
      if (st < 1) stamp(pen, g.settings.x, g.settings.y, g.settings.r, st, 7);
    }
    box(g.settings, 1.6);
    const pt = span(s, AT.play);
    if (pt > 0 && this.#playSeal) {
      drawSeal(gc, this.#playSeal, g.play.x, g.play.y, { phase: 0.5 + 0.5 * Math.sin(now / 1400), press: this.#play.sink, scale: 1 + 0.3 * (1 - ease.back(pt)), alpha: alpha * clamp(pt * 3) });
      const sk = (s - AT.play[1]) / 0.45;
      if (sk > 0 && sk < 1) stamp(pen, g.play.x, g.play.y, g.play.r, sk, 5);
    }
    box(g.play, 1.6);
    return out;
  }

  /** Play: the seal stamps, the Gale's chart unrolls over her ship from the right, the match begins under it, and its
   *  window opens on the planet. */
  #playing(gc: CanvasRenderingContext2D, now: number): void {
    const layer = this.#layer!, g = this.#g!, pen = layer.pen, s = (now - this.#playAt) / 1000;
    if (this.#openAt < 0) {
      this.#seals(gc, now, Infinity, 1);
      if (s < AT.stamp) stamp(pen, g.play.x, g.play.y, g.play.r * 1.05, s / AT.stamp, 11);
      const u = span(s, AT.unroll);
      if (u < 1) {
        unroll(gc, pen.paper, this.#chart!, -BLEED, -BLEED, u, 'left', layer.dpr);
        return;
      }
      // down over her: laid in the page under the Gale's, the scraps taken off, and the match begun under it
      this.#chartEl = this.#planet!.place(this.#host, this.#chart!, 1);
      this.#covered = true;
      layer.invalidate();
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
