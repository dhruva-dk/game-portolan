// The lobby: a chart laid over the live planet, which turns slowly under it with the real sun. The planet is the
// stage's own, from orbit; on the chart over it the coasts are inked where its land meets the sea, every sea has its
// sign, and her ship lies at anchor on her home water as her galleon mark, gilt-rimmed. A finger turns the planet.
// The rose keeps its corner (the title's rose lands there), the career is a cartouche in the opposite one (level as
// rings inked round a seal pressed with the figure, rank as the seal's illumination, matches as tally marks, wins as
// gilt stars), a pair of dividers stands for the settings, and one gold seal under the right thumb is Play. Nothing is
// written.
//
// Entering, it inks in: the web from the middle, the coasts, then each thing in turn. Play stamps the seal, swings the
// chart's rhumb lines to the Gale's course, turns the vellum opaque over the world while the match is made under it,
// and rolls the sheet up into the Gale. Leaving for anything else, the ink dries away.
//
// The vellum is the folio baked once for the screen with a window cut round the planet's limb (planet.ts), shown as
// its own canvas under the chart layer. What holds still once inked (the web, the cartouche) is painted on the layer's sheet plane; what moves
// with the planet (coasts, signs, her mark) and what answers a press is drawn on the live plane each frame. Everything
// runs off the time it is given, so a capture's frozen clock shows the same instants.
import type { PerspectiveCamera } from 'three';
import {
  Pen, Press, arcPts, bakeSeal, canvas, cartouche, coasts, ctx, dividers, drawGalleon, drawSeal, drawSprite, ease, figure,
  galleon, galleonSprite, needle, pressLook, prims, rings, rose, stamp, star, stagger, tally, unroll, woodcut, type Baked,
  type ChartLayer, type Coasts, type Colours, type Globe, type Illumination, type Seal, type Sprite,
} from '../chart/index.ts';
import { REGION_COLOURS } from '../icons/sets/regions.ts';
import { CENTRES, REGIONS } from '../sim/world/index.ts';
import { R } from '../sim/sphere.ts';
import type { V3 } from '../sim/math.ts';
import { effect } from '../ui/parts/feedback.ts';
import { BLEED, cutSheet, facing, globeOf, web, windowOf, type Window } from './planet.ts';
import { ROSE, cornerRose } from './title.ts';

/** The career as the cartouche draws it. */
export interface CareerMarks {
  level: number;
  /** XP into the level, and what the level takes. */
  into: number;
  need: number;
  /** The rank's tier as the seal's illumination. */
  illumination: Illumination;
  matches: number;
  wins: number;
}

/** Where the planet is turned to: the point under the camera (radians) and how fast it is turning (radians a second). */
export interface Turn {
  lat: number;
  lon: number;
  vLat: number;
  vLon: number;
}

export interface LobbyHost {
  /** The camera the planet is drawn with this frame, or null before the stage. */
  camera(): PerspectiveCamera | null;
  /** The orbit view the lobby stands in: its distance from the planet's centre in radii, and its field of view. */
  orbit(): { distance: number; fov: number };
  /** The planet's coasts. */
  coasts(): Coasts;
  /** Her home water, where her ship lies at anchor: a unit vector. */
  home(): V3;
  mark(): Colours;
  career(): CareerMarks;
  /** Makes the next match ready, and returns the Gale's course as a bearing from north (radians, clockwise). */
  prepare(): number;
  /** Begins the match made ready: the world under the sheet is the Gale's. */
  begin(): void;
  /** Opens the settings. */
  settings(): void;
}

export interface LobbyOptions {
  /** Seconds before the ink begins (the title's sheet still rolling off it). */
  delay?: number;
  /** The rose is already in its corner (the title's landed there). */
  roseLanded?: boolean;
}

/** When each thing happens, seconds: from the ink's start for entering, from the press for Play, from the leave for
 *  drying. */
const AT = {
  vellum: 0.35,
  web: [0.05, 1.1],
  coasts: [0.15, 1.35],
  rose: [0.1, 1.2],
  needle: [0.8, 1.2],
  cartouche: [0.3, 1.1],
  /** The career's seal is pressed in, its rings inked round it, then the tallies and the stars. */
  career: [1.0, 1.3],
  rings: [1.2, 1.75],
  tally: [1.35, 1.9],
  stars: [1.6, 2.1],
  divs: [0.7, 1.2],
  /** The signs, one sea after another, and her mark. */
  signs: [0.45, 1.6],
  mark: [1.0, 1.65],
  /** The Play seal is pressed onto the sheet, and stamps. */
  play: [1.25, 1.5],
  done: 2.1,
  /** After Play's press: the stamp, the web's swing, the vellum turning opaque, and the sheet rolling up. */
  stamp: 0.5,
  swing: [0.12, 0.75],
  lift: [0.75, 0.9],
  roll: [0.9, 1.65],
  /** Leaving for anything but the Gale. */
  dry: 0.3,
} as const;

/** Seconds the lobby's sheet takes to roll up off the Gale, from the match's beginning. */
export const LOBBY_ROLL = AT.roll[1] - AT.roll[0];

const span = (s: number, [a, b]: readonly [number, number]): number => Math.min(1, Math.max(0, (s - a) / (b - a)));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

/** The planet turns west under the chart a degree and a fifth a second: once round in five minutes. */
const TURN = (1.2 * Math.PI) / 180;
/** How far north or south a finger can turn it. */
const MOST_LAT = 1.1;

interface Geo {
  w: number;
  h: number;
  phone: boolean;
  /** The window cut in the sheet over the planet, round its limb. */
  win: Window;
  rose: { x: number; y: number; r: number };
  /** The Play seal, under the right thumb. */
  play: { x: number; y: number; r: number };
  /** The dividers, in the top right corner. */
  divs: { x: number; y: number; size: number };
  /** The cartouche in the bottom left corner. */
  cart: { x: number; y: number; w: number; h: number };
  /** A sea's sign, across; her mark's length. */
  sign: number;
  mark: number;
}

function geo(layer: ChartLayer, orbit: { distance: number; fov: number }): Geo {
  const l = layer.layout, { w, h, safe } = l, phone = l.cls === 'iphone', m = l.margin;
  const cw = phone ? 204 : 310, ch = phone ? 114 : 174, ds = phone ? 52 : 72;
  return {
    w, h, phone, win: windowOf(layer, orbit), rose: l.rose,
    play: { x: l.thumbs.right.x, y: l.thumbs.right.y, r: phone ? 46 : 66 },
    divs: { x: w - safe.right - m - ds * 0.5, y: safe.top + m + ds * 0.55, size: ds },
    cart: { x: safe.left + m + cw / 2, y: h - safe.bottom - m - ch / 2, w: cw, h: ch },
    sign: phone ? 34 : 46,
    mark: l.mark.chart,
  };
}

/** The Play seal's device: a ship under sail, white on the matrix, pressed into the leaf. */
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

export class Lobby {
  readonly #host: HTMLElement;
  readonly #h: LobbyHost;
  readonly #turn: Turn;
  #layer: ChartLayer | null = null;
  #g: Geo | null = null;
  #vellum: HTMLCanvasElement | null = null;
  #cover: Baked | null = null;
  #coverEl: HTMLCanvasElement | null = null;
  #rolling: Baked | null = null;
  #rollT = 1;
  #mark: Colours;
  #career: CareerMarks;
  #coasts: Coasts;
  #careerSeal: Seal | null = null;
  #playSeal: Seal | null = null;
  #signs: Sprite[] = [];
  #divs: Sprite | null = null;
  /** When it was made, when the ink began, when Play was pressed and when it left (ms; -1 not yet). */
  #born = -1;
  #t0 = -1;
  #playAt = -1;
  #leftAt = -1;
  /** Play's course: the bearing the web swings to. */
  #course = 0;
  #begun = false;
  #inked = { web: false, cart: false };
  #roseLanded: boolean;
  readonly #delay: number;
  readonly #play = new Press();
  readonly #set = new Press();
  /** The finger turning the planet: its id, where it was, when, and the turn it is giving. */
  #finger: { id: number; x: number; y: number; at: number; vLat: number; vLon: number } | null = null;
  #lastTurn = -1;
  #off: (() => void) | null = null;
  readonly #mat = new Float64Array(16);
  readonly #eye = { x: 0, y: 0, z: 1 };
  #globe: Globe | null = null;
  /** Called once the lobby has gone. */
  onGone?: () => void;

  constructor(host: HTMLElement, h: LobbyHost, turn: Turn, o: LobbyOptions = {}) {
    this.#host = host;
    this.#h = h;
    this.#turn = turn;
    this.#mark = h.mark();
    this.#career = h.career();
    this.#coasts = h.coasts();
    this.#delay = o.delay ?? 0;
    this.#roseLanded = !!o.roseLanded;
  }

  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = now;
    this.#t0 = now + this.#delay * 1000;
    this.#lay();
    const off = layer.addLive((g, t) => this.#frame(g, t));
    const offSheet = layer.addSheet((g, pen) => this.#sheet(g, pen));
    layer.presses.add({ id: 'lobby:play', hit: { x: 0, y: 0, r: 1 }, press: this.#play, sound: 'play', haptic: 'heavy', act: () => this.#pressPlay() });
    layer.presses.add({ id: 'lobby:settings', hit: { x: 0, y: 0, r: 1 }, press: this.#set, sound: 'open', haptic: 'light', act: () => this.#h.settings() });
    this.#placePresses();
    const drag = {
      down: (id: number, x: number, y: number) => this.#down(id, x, y),
      move: (id: number, x: number, y: number) => this.#move(id, x, y),
      up: (id: number) => this.#up(id),
    };
    layer.drag = drag;
    this.#off = () => {
      off();
      offSheet();
      layer.presses.remove('lobby:play');
      layer.presses.remove('lobby:settings');
      if (layer.drag === drag) layer.drag = null;
    };
  }

  /** The screen changed size: laid out and baked again. */
  resize(): void {
    if (!this.#layer) return;
    this.#lay();
    this.#placePresses();
    this.#layer.invalidate();
  }

  /** Where the planet is turned to at `now`: the point under the camera, a unit vector. */
  turned(now: number): V3 {
    const t = this.#turn, dt = this.#lastTurn < 0 ? 0 : Math.min(0.1, Math.max(0, (now - this.#lastTurn) / 1000));
    this.#lastTurn = now;
    // held still once Play is pressed, so the chart over it holds still as it is baked
    if (!this.#finger && this.#playAt < 0) {
      const k = Math.exp(-3 * dt);
      t.lon += (t.vLon - TURN) * dt;
      t.lat += t.vLat * dt;
      t.vLon *= k;
      t.vLat *= k;
    }
    t.lat = Math.max(-MOST_LAT, Math.min(MOST_LAT, t.lat));
    const c = Math.cos(t.lat);
    return { x: c * Math.cos(t.lon), y: Math.sin(t.lat), z: -c * Math.sin(t.lon) };
  }

  /** Leaves for `to` at `now`: the Gale's sheet rolls up (if Play did not already start it); anything else, it dries. */
  leave(now: number, to: string): void {
    if (this.#leftAt >= 0 || this.#playAt >= 0) return;
    if (!this.#layer) {
      this.dispose();
      return;
    }
    this.#layer.presses.remove('lobby:play');
    this.#layer.presses.remove('lobby:settings');
    this.#finger = null;
    if (to === 'gale') {
      // the match was made elsewhere (the hook): no stamp, no swing, only the sheet taken up as it stands (the layer
      // still holds the last frame's ink) and rolled
      this.#playAt = now - AT.roll[0] * 1000;
      this.#begun = true;
      this.#rolling = this.#takeUp();
      return;
    }
    this.#leftAt = now;
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#vellum?.remove();
    this.#coverEl?.remove();
    this.#vellum = null;
    this.#coverEl = null;
  }

  // ── layout and bakes ──

  #lay(): void {
    const layer = this.#layer!, g = (this.#g = geo(layer, this.#h.orbit())), dpr = layer.dpr;
    // the sheet: the folio with a window cut round the planet's limb, its cut edge shadowing the world under it
    this.#vellum?.remove();
    const { el, folio } = cutSheet(layer, this.#host, g.win);
    this.#vellum = el;
    this.#cover = folio;
    // the seals, the signs and the dividers, baked once at this size
    const c = this.#career;
    this.#careerSeal = bakeSeal(layer.paper, layer.layout.widths, c.illumination, { size: this.#careerR() * 2, dpr, device: { figure: String(c.level) }, seed: 7 });
    this.#playSeal = bakeSeal(layer.paper, layer.layout.widths, 'gold', { size: g.play.r * 2, dpr, device: shipDevice, seed: 23 });
    const d = Math.ceil(g.sign + 6);
    this.#signs = REGIONS.map((reg) => layer.sprite(`lobby-sign|${reg.id}|${g.sign}`, d, d, d / 2, d / 2, (pen) => {
      const r = g.sign / 2, c0 = d / 2;
      const disc = new Path2D();
      disc.arc(c0, c0, r, 0, TAU);
      pen.paperFill(disc, 0.94);
      const band = new Path2D();
      band.arc(c0, c0, r, 0, TAU);
      band.arc(c0, c0, r * 0.8, 0, TAU, true);
      pen.wash(band, REGION_COLOURS[reg.id], { alpha: 0.7, edge: 0.5, gran: 0.6, shift: [0, 0] });
      pen.stroke(arcPts(c0, c0, r, 0, TAU, 40), { w: 'fine', nib: 0.2, pool: 0.2, seed: reg.lat | 0 });
      pen.rule([arcPts(c0, c0, r * 0.8, 0, TAU, 36)], { w: 'hair', alpha: 0.6, seed: (reg.lon | 0) + 3 });
      woodcut(pen, prims(`region.${reg.id}`), c0, c0, r * 1.25);
    }));
    const ds = g.divs.size;
    this.#divs = layer.sprite(`lobby-divs|${ds}`, ds + 8, ds + 8, ds / 2 + 4, ds / 2 + 4, (pen) => dividers(pen, ds / 2 + 4, ds / 2 + 4, ds));
  }

  #placePresses(): void {
    const layer = this.#layer!, g = this.#g!;
    const play = layer.presses.list.find((p) => p.id === 'lobby:play');
    if (play) play.hit = { x: g.play.x, y: g.play.y, r: g.play.r };
    const set = layer.presses.list.find((p) => p.id === 'lobby:settings');
    if (set) set.hit = { x: g.divs.x, y: g.divs.y, r: g.divs.size * 0.5 };
  }

  /** The career's seal's radius, and the cartouche's field laid out: the seal and its rings to the left, the tallies
   *  and the stars to the right. */
  #careerR(): number {
    return this.#g!.phone ? 16 : 23;
  }

  #fieldOf(): { sx: number; sy: number; tx: number; ty: number; th: number; st: number; sr: number } {
    const g = this.#g!, c = g.cart, fx = c.w * 0.3, sr = this.#careerR();
    return {
      sx: c.x - fx * 0.55, sy: c.y, tx: c.x + fx * 0.02, ty: c.y - c.h * 0.02, th: g.phone ? 17 : 25,
      st: c.y + c.h * 0.17, sr,
    };
  }

  // ── the finger on the planet ──

  /** The planet's radius on the screen, pixels: how far a finger moves it a radian. */
  #radiusPx(): number {
    const cam = this.#h.camera();
    if (!cam) return 300;
    const d = cam.position.length(), focal = this.#g!.h / 2 / Math.tan((cam.fov * Math.PI) / 360);
    return (focal * R) / Math.sqrt(Math.max(1, d * d - R * R));
  }

  #down(id: number, x: number, y: number): void {
    if (this.#finger || this.#playAt >= 0 || this.#leftAt >= 0) return;
    this.#finger = { id, x, y, at: performance.now(), vLat: 0, vLon: 0 };
    this.#turn.vLat = this.#turn.vLon = 0;
  }

  #move(id: number, x: number, y: number): void {
    const f = this.#finger;
    if (!f || f.id !== id) return;
    const rp = this.#radiusPx(), now = performance.now(), dt = Math.max(1, now - f.at) / 1000;
    // what is under the finger follows it: dragged right, the planet turns east to west under the camera
    const dLon = -(x - f.x) / rp, dLat = (y - f.y) / rp;
    this.#turn.lon += dLon;
    this.#turn.lat = Math.max(-MOST_LAT, Math.min(MOST_LAT, this.#turn.lat + dLat));
    const k = Math.min(1, dt * 12);
    f.vLon += (dLon / dt - f.vLon) * k;
    f.vLat += (dLat / dt - f.vLat) * k;
    f.x = x;
    f.y = y;
    f.at = now;
  }

  #up(id: number): void {
    const f = this.#finger;
    if (!f || f.id !== id) return;
    this.#finger = null;
    // let go, it runs on and slows; a finger that stopped before lifting leaves it still
    const still = performance.now() - f.at > 90;
    this.#turn.vLon = still ? 0 : Math.max(-1.5, Math.min(1.5, f.vLon + TURN));
    this.#turn.vLat = still ? 0 : Math.max(-1.5, Math.min(1.5, f.vLat));
  }

  // ── Play ──

  #pressPlay(): void {
    if (this.#playAt >= 0 || this.#leftAt >= 0) return;
    // a press acts between frames: Play starts on the chart's clock as the last frame had it
    this.#playAt = this.#lastNow;
    this.#finger = null;
    this.#turn.vLat = this.#turn.vLon = 0;
    let c = this.#h.prepare() % TAU;
    if (c > Math.PI) c -= TAU;
    if (c < -Math.PI) c += TAU;
    this.#course = c;
    effect('lobby:swing', 'whoosh', 'none');
  }

  /** The chart's time at the last frame. */
  #lastNow = 0;

  // ── drawing ──

  /** The planet as the camera sees it this frame. */
  #globeNow(): Globe | null {
    const cam = this.#h.camera();
    return cam ? globeOf(cam, this.#g!.w, this.#g!.h, this.#mat, this.#eye) : null;
  }

  /** The sheet plane: the web and the career, once each is inked and while they hold still. */
  #sheet(gc: CanvasRenderingContext2D, pen: Pen): void {
    const g = this.#g;
    if (!g || this.#t0 < 0) return;
    if (this.#rolling) {
      // rolling up toward the top: the roll climbs off the sheet into the Gale
      unroll(gc, pen.paper, this.#rolling, -BLEED, -BLEED, this.#rollT, 'down', this.#layer!.dpr);
      return;
    }
    if (this.#begun) return;
    const dry = this.#dry();
    pen.mood({ dry }, () => {
      if (this.#inked.web && this.#playAt < 0) web(pen, gc, this.#layer!, g.win, 1, 0);
      if (this.#inked.cart) this.#drawCareer(pen, gc, 99);
    });
  }

  /** How far the ink has dried, leaving for anything but the Gale. */
  #dry(): number {
    return this.#leftAt < 0 ? 0 : Math.min(1, (this.#lastNow - this.#leftAt) / 1000 / AT.dry);
  }

  /** The cartouche and the career in it, as inked at s seconds. */
  #drawCareer(pen: Pen, gc: CanvasRenderingContext2D, s: number): void {
    const g = this.#g!, c = this.#career, f = this.#fieldOf();
    cartouche(pen, g.cart.x, g.cart.y, g.cart.w, g.cart.h, { field: '#d8c39a', seed: 31 }, span(s, AT.cartouche));
    // the level: rings round the seal, one for each level up to six, the newest closing as the level fills
    const rt = span(s, AT.rings);
    if (rt > 0) {
      const n = Math.min(6, c.level), gap = g.phone ? 2.6 : 3.6;
      rings(pen, f.sx, f.sy, f.sr + (g.phone ? 4 : 6), gap, n, rt * Math.max(0.04, c.need > 0 ? c.into / c.need : 1));
    }
    const st = span(s, AT.career);
    if (st > 0 && this.#careerSeal) {
      const k = 1 + 0.25 * (1 - ease.back(st));
      drawSeal(gc, this.#careerSeal, f.sx, f.sy, { phase: 0.5, scale: k, alpha: Math.min(1, st * 2.5) * (1 - pen.dry) });
      if (st < 1) stamp(pen, f.sx, f.sy, f.sr, st);
    }
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

  /** One frame of the live plane. */
  #frame(gc: CanvasRenderingContext2D, now: number): void {
    this.#lastNow = now;
    const layer = this.#layer!, pen = layer.pen;
    // the vellum comes up as the lobby is laid (under the title's sheet if it is still rolling off)
    const born = (now - this.#born) / 1000;
    if (this.#vellum && this.#leftAt < 0) this.#vellum.style.opacity = String(ease.out(born / AT.vellum));
    if (this.#playAt >= 0) {
      this.#playing(gc, now);
      return;
    }
    const dry = this.#dry();
    if (this.#leftAt >= 0) {
      if (this.#vellum) this.#vellum.style.opacity = String(1 - ease.out(dry));
      layer.invalidate();
      if (dry >= 1) {
        this.dispose();
        this.onGone?.();
        return;
      }
    }
    const s = (now - this.#t0) / 1000;
    if (s < 0) return;
    this.#globe = this.#globeNow();
    pen.mood({ dry }, () => this.#ink(gc, pen, s, now));
  }

  /** Everything on the live plane at s seconds into the ink, the rose's needle at `north` (radians). */
  #ink(gc: CanvasRenderingContext2D, pen: Pen, s: number, now: number, north = 0): void {
    const layer = this.#layer!, g = this.#g!, alpha = 1 - pen.dry;
    // the web, then the coasts over it
    const webT = span(s, AT.web);
    if (webT >= 1 && !this.#inked.web) {
      this.#inked.web = true;
      layer.invalidate();
    } else if (webT < 1) web(pen, gc, layer, g.win, webT, 0);
    const globe = this.#globe;
    if (globe) {
      // what is inked on the planet stays in the window over it, wherever the camera is on its way there
      const w = g.win, clip = new Path2D();
      clip.arc(w.x, w.y, w.r, 0, TAU);
      gc.save();
      gc.clip(clip);
      coasts(pen, this.#coasts, globe, {}, span(s, AT.coasts));
      // a sign for every sea on the near side, one after another; her mark over them
      const P = { x: 0, y: 0 }, st = span(s, AT.signs);
      for (let i = 0; i < REGIONS.length; i++) {
        const t = stagger(st, i, REGIONS.length, 0.3), f = facing(globe, CENTRES[i]);
        if (t <= 0 || f <= 0.12) continue;
        const c = CENTRES[i];
        globe.project(c.x, c.y, c.z, P);
        drawSprite(gc, this.#signs[i], P.x, P.y, { alpha: alpha * ease.out(t) * smooth(0.12, 0.3, f), scale: 0.85 + 0.15 * ease.back(t) });
      }
      const home = this.#h.home(), hf = facing(globe, home), mt = span(s, AT.mark);
      if (mt > 0 && hf > 0.1) {
        globe.project(home.x, home.y, home.z, P);
        const a = smooth(0.1, 0.28, hf);
        if (mt < 1) pen.mood({ dry: 1 - a * alpha }, () => galleon(pen, this.#mark, P.x, P.y, { size: g.mark, gilt: true }, mt));
        else drawGalleon(gc, galleonSprite(pen, this.#mark, { size: g.mark, gilt: true }), P.x, P.y, a * alpha);
      }
      gc.restore();
    }
    // the rose in its corner, its needle at north
    const rs = this.#roseLanded ? 1 : span(s, AT.rose);
    if (rs >= 1) drawSprite(gc, cornerRose(layer), g.rose.x, g.rose.y, { alpha });
    else if (rs > 0) rose(pen, g.rose.x, g.rose.y, g.rose.r, ROSE, rs);
    const nt = this.#roseLanded ? 1 : span(s, AT.needle);
    needle(pen, g.rose.x, g.rose.y, g.rose.r * 0.52, north, nt);
    // the cartouche and the career, inked here until they are done, then held on the sheet
    if (s >= AT.done && !this.#inked.cart) {
      this.#inked.cart = true;
      layer.invalidate();
    } else if (!this.#inked.cart) this.#drawCareer(pen, gc, s);
    // the dividers, and the Play seal pressed on last, both answering a press
    const dt = span(s, AT.divs), dl = pressLook(this.#set.sink);
    if (dt > 0) drawSprite(gc, this.#divs!, g.divs.x, g.divs.y + dl.dy, { alpha: alpha * ease.out(dt), scale: dl.scale, dark: dl.dark });
    const pt = span(s, AT.play);
    if (pt > 0 && this.#playSeal) {
      const k = 1 + 0.3 * (1 - ease.back(pt));
      drawSeal(gc, this.#playSeal, g.play.x, g.play.y, { phase: 0.5 + 0.5 * Math.sin(now / 1400), press: this.#play.sink, scale: k, alpha: alpha * Math.min(1, pt * 3) });
      const sk = (s - AT.play[1]) / 0.45;
      if (sk > 0 && sk < 1) stamp(pen, g.play.x, g.play.y, g.play.r, sk, 5);
    }
  }

  /** Play: the seal stamps, the web swings to the course, the vellum turns opaque, and the sheet rolls up into the
   *  Gale. */
  #playing(gc: CanvasRenderingContext2D, now: number): void {
    const layer = this.#layer!, g = this.#g!, pen = layer.pen, s = (now - this.#playAt) / 1000;
    if (!this.#begun) {
      this.#globe = this.#globeNow();
      const si = Math.max(AT.done, (now - this.#t0) / 1000);
      // the web, swung from north to the Gale's course about the chart's middle
      const sw = ease.inOut(span(s, AT.swing));
      web(pen, gc, layer, g.win, 1, this.#course * sw, 0.2 * Math.sin(Math.PI * Math.min(1, s / AT.swing[1])));
      // the needle over the rose swings with it, and the seal stamps
      this.#ink(gc, pen, si, now, this.#course * sw);
      if (s < AT.stamp) stamp(pen, g.play.x, g.play.y, g.play.r * 1.05, s / AT.stamp, 11);
      // the vellum turns opaque under the ink: the sheet, ink and all, laid over the world
      const lt = span(s, AT.lift);
      if (lt > 0) {
        if (!this.#coverEl) this.#coverEl = this.#lift();
        this.#coverEl.style.opacity = String(ease.out(lt));
      }
      if (lt >= 1) {
        // under the opaque sheet the match is begun, and the sheet is taken up
        this.#begun = true;
        this.#rolling = this.#takeUp();
        this.#h.begin();
      }
      return;
    }
    if (!this.#rolling) this.#rolling = this.#takeUp();
    this.#coverEl?.remove();
    this.#coverEl = null;
    this.#vellum?.remove();
    this.#vellum = null;
    const u = span(s, AT.roll), open = 1 - ease.inOut(u);
    this.#rollT = open <= 0 ? 0 : 1 - Math.cbrt(1 - open);
    layer.invalidate();
    if (u >= 1) {
      this.#rolling = null;
      layer.invalidate();
      this.dispose();
      this.onGone?.();
    }
  }

  /** The opaque sheet that rises under the ink as Play lifts the chart off the world. */
  #lift(): HTMLCanvasElement {
    const b = this.#cover!, el = canvas(b.canvas.width, b.canvas.height);
    ctx(el).drawImage(b.canvas, 0, 0);
    el.style.cssText = `position:absolute;left:${-BLEED - b.pad}px;top:${-BLEED - b.pad}px;width:${b.w + b.pad * 2}px;height:${b.h + b.pad * 2}px;pointer-events:none;opacity:0`;
    this.#host.insertBefore(el, this.#layer!.el);
    return el;
  }

  /** The sheet as it stands, its ink and all (both planes of the layer laid on the folio), for rolling up. */
  #takeUp(): Baked {
    const layer = this.#layer!, b = this.#cover!, dpr = layer.dpr, o = (b.pad + BLEED) * dpr;
    const c = canvas(b.canvas.width, b.canvas.height), x = ctx(c);
    x.drawImage(b.canvas, 0, 0);
    x.drawImage(layer.sheetCanvas, o, o);
    x.drawImage(layer.liveCanvas, o, o);
    return { ...b, canvas: c };
  }
}
