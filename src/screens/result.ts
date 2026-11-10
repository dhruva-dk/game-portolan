// The result sheet (issue #54): a full folio comes down over the end of the match, and the lobby is laid out of sight
// under it. On it, top to bottom: where she came, one large numeral in a laurel (gold for the first, silver for the top
// five, red for the top ten, ink below); what she did, three woodcuts with their numerals (ships sunk, damage dealt,
// time afloat); and what she earned, the career plate drawn large, its ring's gold filling, its level ticking up
// through every level crossed, and its rank's seal struck anew if the colour changed, each with its sound and haptic.
// A tap anywhere lifts the sheet, and home is under it.
//
// Each thing is drawn with the pen while it inks in, then baked once to a sprite; only the ring's gold is drawn with
// the pen each frame. Everything runs off the time it is given, so a capture's frozen clock shows the same instants.
import {
  Press, bakeSeal, drawBaked, drawSprite, ease, everywhere, figure, figureWidth, laurel, part, prims, ring, stamp, woodcut,
  type Baked, type ChartLayer, type Circle, type Illumination, type InkName, type Pen, type Seal, type Sprite,
} from '../chart/index.ts';
import { clamp } from '../chart/noise.ts';
import { effect, type UiHaptic, type UiSound } from '../ui/parts/feedback.ts';
import type { LevelView, ResultsModel } from '../ui/model.ts';
import { TIER_ILLUMINATION } from './cards.ts';
import { careerPlate, ringFill, type PlateGeo } from './lobby.ts';

const BLEED = 40;
/** Room round a baked drawing for its shadow and the wobble of its ink. */
const PAD = 12;
/** The beats of the sheet, in seconds from its coming down. */
const AT = {
  /** It comes down over the sea. */
  sheet: [0, 0.45],
  /** Before this a tap is still the tap that skipped here. */
  taps: 0.8,
  /** It goes up off the lobby. */
  lift: 0.42,
  laurel: [0.55, 1.15],
  /** The first figure's start, the gap between them, and how long each takes. */
  stats: 1.2,
  stat: 0.32,
  statInk: 0.42,
  plate: [2.3, 2.7],
  /** The gold starts up the ring, a level at most this long. */
  ring: 2.85,
  level: 0.7,
  /** The gold's whole climb, however many levels it crosses, no longer than this. */
  climb: 2.4,
  /** The new seal is struck this long after the gold stops, and takes this long. */
  seal: 0.25,
  strike: 0.45,
  /** The small stamp a level leaves on the ring as it ticks up. */
  tick: 0.35,
} as const;

const span = (s: number, [a, b]: readonly [number, number]) => clamp((s - a) / (b - a));

/** The ink of a place: gold for the first, silver for the top five, red for the top ten, iron below. */
function placeInk(place: number): InkName {
  return place === 1 ? 'gold' : place <= 5 ? 'silver' : place <= 10 ? 'rubric' : 'iron';
}

const mmss = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** One level's stretch of the ring's gold. */
interface Climb {
  level: number;
  from: number;
  to: number;
}

const share = (v: LevelView): number => (v.need > 0 ? clamp(v.into / v.need) : 1);

/** The gold's way up: from where she stood to the top of the ring, once round for each level whole, and on to where she stands. */
function climbs(before: LevelView, after: LevelView): Climb[] {
  if (after.level <= before.level) return [{ level: after.level, from: share(before), to: share(after) }];
  const out: Climb[] = [{ level: before.level, from: share(before), to: 1 }];
  for (let level = before.level + 1; level < after.level; level++) out.push({ level, from: 0, to: 1 });
  out.push({ level: after.level, from: 0, to: share(after) });
  return out;
}

interface Geo {
  wreath: Circle;
  /** The little chart of the water she held. */
  chart: Circle;
  /** The numeral's size. */
  place: number;
  stats: { x: number; y: number; art: number; size: number; gap: number; text: string; drawing: string }[];
  plate: PlateGeo;
}

export interface ResultHost {
  /** The sheet is down and nothing shows through it: the match can go, and the lobby be laid under it. */
  covered(): void;
  /** The sheet has lifted. */
  done(): void;
}

/** The result sheet: `attach` brings it down, a tap (or `lift`) takes it up again. */
export class Result {
  /** It has lifted and is off the chart. */
  onGone?: () => void;
  #host: ResultHost;
  #m: ResultsModel;
  #climbs: Climb[];
  #each: number;
  #wasIll: Illumination;
  #newIll: Illumination;
  #layer: ChartLayer | null = null;
  #off: (() => void) | null = null;
  #press = new Press();
  #g: Geo | null = null;
  #sheet: Baked | null = null;
  #seals: { before: Seal; after: Seal } | null = null;
  #born = 0;
  #last = 0;
  #liftAt = -1;
  #covered = false;
  #fired = new Set<string>();

  constructor(host: ResultHost, model: ResultsModel) {
    this.#host = host;
    this.#m = model;
    this.#climbs = climbs(model.level.before, model.level.after);
    this.#each = Math.min(AT.level, AT.climb / this.#climbs.length);
    this.#wasIll = TIER_ILLUMINATION[model.rank.before.tier] ?? 'ink';
    this.#newIll = TIER_ILLUMINATION[model.rank.after.tier] ?? 'ink';
  }

  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = this.#last = now;
    this.#lay();
    this.raise();
  }

  /** Back on top of everything laid since it came down: the painter last, the press first to be asked. */
  raise(): void {
    const layer = this.#layer;
    if (!layer) return;
    this.#off?.();
    this.#off = layer.addLive((g, now) => this.#frame(g, now));
    if (this.#liftAt < 0) this.#addPress();
  }

  resize(): void {
    if (!this.#layer) return;
    this.#lay();
    if (this.#liftAt < 0) this.#addPress();
  }

  /** Takes the sheet up; the lobby is under it. */
  lift(now: number): void {
    if (this.#liftAt >= 0 || !this.#layer) return;
    this.#cover();
    this.#liftAt = now;
    this.#layer.presses.remove('result:tap');
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#layer?.presses.remove('result:tap');
    this.#layer = null;
  }

  #addPress(): void {
    const layer = this.#layer!;
    layer.presses.add({ id: 'result:tap', hit: everywhere(layer.layout), press: this.#press, sound: 'none', haptic: 'none', act: () => this.#tap() });
  }

  #tap(): void {
    if ((this.#last - this.#born) / 1000 < AT.taps) return;
    effect('result:lift', 'close', 'selection');
    this.lift(this.#last);
  }

  #cover(): void {
    if (this.#covered) return;
    this.#covered = true;
    this.#host.covered();
  }

  // ── layout ──

  #lay(): void {
    const layer = this.#layer!, l = layer.layout, H = l.h, m = this.#m, dpr = layer.dpr;
    this.#sheet = layer.sheet('folio', l.w + BLEED * 2, l.h + BLEED * 2, 9, { folds: false });
    const cx = l.w / 2, y = H * 0.82, k = (1.35 * H) / 820, f = l.lobby;
    const at = (c: Circle): Circle => ({ x: cx + (c.x - f.plate.x) * k, y: y + (c.y - f.plate.y) * k, r: c.r * k });
    const place = String(m.place);
    this.#g = {
      wreath: { x: cx, y: H * 0.3, r: H * 0.215 },
      chart: { x: cx - H * 0.47, y: H * 0.3, r: H * 0.17 },
      place: H * (place.length > 1 ? 0.17 : 0.2),
      stats: [['hud.kills', String(m.kills)], ['hud.damage', String(Math.round(m.damage))], ['hud.afloat', mmss(m.survived)]].map(([drawing, text], i) => (
        { x: cx + (i - 1) * H * 0.36, y: H * 0.62, art: H * 0.085, size: H * 0.05, gap: H * 0.012, text, drawing }
      )),
      plate: { plate: { x: cx, y, w: f.plate.w * k, h: f.plate.h * k }, ring: at(f.ring), badge: at(f.badge) },
    };
    const size = this.#g.plate.badge.r * 2, seal = (ill: Illumination) => bakeSeal(layer.paper, l.widths, ill, { size, dpr, device: 'star', seed: 13 });
    const before = seal(this.#wasIll);
    this.#seals = { before, after: this.#newIll === this.#wasIll ? before : seal(this.#newIll) };
  }

  /** A drawing baked once, w × h plus its room, anchored at its centre. */
  #bake(key: string, w: number, h: number, draw: (p: Pen, gc: CanvasRenderingContext2D, cx: number, cy: number) => void): Sprite {
    const c = `result|${this.#layer!.layout.h}|${key}`;
    return this.#layer!.sprite(c, Math.ceil(w + PAD * 2), Math.ceil(h + PAD * 2), w / 2 + PAD, h / 2 + PAD, (p, gc) => draw(p, gc, w / 2 + PAD, h / 2 + PAD));
  }

  // ── drawing ──

  #frame(gc: CanvasRenderingContext2D, now: number): void {
    this.#last = now;
    const layer = this.#layer!, s = (now - this.#born) / 1000, H = layer.layout.h + BLEED * 2;
    const up = this.#liftAt < 0 ? 0 : ease.in(clamp((now - this.#liftAt) / 1000 / AT.lift));
    if (up >= 1) {
      this.dispose();
      this.onGone?.();
      this.#host.done();
      return;
    }
    gc.save();
    gc.translate(0, -H * (1 - ease.out(span(s, AT.sheet))) - H * up);
    drawBaked(gc, this.#sheet!, -BLEED, -BLEED);
    this.#crest(gc, layer.pen, s);
    this.#water(gc, s);
    this.#stats(gc, layer.pen, s);
    this.#plate(gc, layer.pen, s);
    gc.restore();
    if (this.#liftAt < 0) this.#beats(s);
    // (once it is drawn, so what the match gives way to is laid under this frame's sheet, not over it)
    if (s >= AT.sheet[1]) this.#cover();
  }

  /** The place in its laurel. */
  #crest(gc: CanvasRenderingContext2D, pen: Pen, s: number): void {
    const t = span(s, AT.laurel);
    if (t <= 0) return;
    const g = this.#g!, ink = placeInk(this.#m.place), W = g.wreath, text = String(this.#m.place);
    const draw = (p: Pen, x: number, y: number, k: number) => {
      laurel(p, x, y, W.r, ink, part(k, 0, 0.75));
      figure(p, text, x, y + g.place * 0.42, g.place, { align: 'center', ink, seed: 21 }, part(k, 0.5, 1));
    };
    if (t < 1) return draw(pen, W.x, W.y, t);
    const d = W.r * 2.7;
    drawSprite(gc, this.#bake(`crest|${text}`, d, d, (p, _g, x, y) => draw(p, x, y, 1)), W.x, W.y);
  }

  /** The water she held at the end, inked in her colour on a small round chart beside the laurel. */
  #water(gc: CanvasRenderingContext2D, s: number): void {
    const held = this.#m.held, C = this.#g!.chart, t = span(s, AT.laurel);
    if (!held || t <= 0) return;
    const d = C.r * 2.3;
    const sprite = this.#bake('water', d, d, (p, g, x, y) => {
      g.save();
      g.beginPath();
      g.arc(x, y, C.r, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = held.ink;
      g.globalAlpha = 0.72;
      const half = Math.max(held.half * C.r, 0.8);
      g.beginPath();
      for (let i = 0; i < held.pts.length; i += 2) g.rect(x + held.pts[i] * C.r - half, y - held.pts[i + 1] * C.r - half, half * 2, half * 2);
      g.fill();
      g.restore();
      ring(p, x, y, C.r * 0.96, C.r * 1.08, { ticks: 128 }, 1);
    });
    drawSprite(gc, sprite, C.x, C.y, { alpha: t });
  }

  /** The time the i-th figure has finished landing. */
  #statAt(i: number): number {
    return AT.stats + i * AT.stat + AT.statInk;
  }

  /** What she did: a woodcut and its numeral for the ships she sank, the damage she dealt and the time she stayed afloat. */
  #stats(gc: CanvasRenderingContext2D, pen: Pen, s: number): void {
    this.#g!.stats.forEach((q, i) => {
      const t = clamp((s - (this.#statAt(i) - AT.statInk)) / AT.statInk);
      if (t <= 0) return;
      const w = q.art + q.gap + figureWidth(q.text, q.size), drawing = prims(q.drawing);
      const draw = (p: Pen, x: number, y: number, k: number) => {
        woodcut(p, drawing, x - w / 2 + q.art / 2, y, q.art, 'iron', ease.out(part(k, 0, 0.4)));
        figure(p, q.text, x - w / 2 + q.art + q.gap, y + q.size * 0.38, q.size, { seed: 30 + i }, part(k, 0.3, 1));
      };
      if (t < 1) return draw(pen, q.x, q.y, t);
      drawSprite(gc, this.#bake(`stat|${i}|${q.text}`, w, q.art * 1.2, (p, _g, x, y) => draw(p, x, y, 1)), q.x, q.y);
    });
  }

  /** Where the gold is at s seconds: which level it is filling, the share of it, and the moment it came to this level. */
  #gold(s: number): { level: number; f: number; since: number } {
    const list = this.#climbs, d = this.#each;
    if (s < AT.ring) return { level: list[0].level, f: list[0].from, since: -Infinity };
    const i = Math.min(list.length - 1, Math.floor((s - AT.ring) / d)), q = list[i], at = AT.ring + i * d;
    return { level: q.level, f: q.from + (q.to - q.from) * ease.inOut((s - at) / d), since: i > 0 ? at : -Infinity };
  }

  /** The time the gold stops. */
  get #stops(): number {
    return AT.ring + this.#climbs.length * this.#each;
  }

  /** What she earned: the plate, the gold going up its ring, and the seal struck anew if the rank's colour changed. */
  #plate(gc: CanvasRenderingContext2D, pen: Pen, s: number): void {
    const pt = span(s, AT.plate);
    if (pt <= 0) return;
    const g = this.#g!.plate, seals = this.#seals!, { level, f, since } = this.#gold(s), changed = this.#newIll !== this.#wasIll;
    const strikeT = changed ? clamp((s - this.#stops - AT.seal) / AT.strike) : 0, struck = strikeT > 0;
    const seal = struck ? seals.after : seals.before, ill = struck ? this.#newIll : this.#wasIll;
    const { x, y, w, h } = g.plate, sealR = g.badge.r;
    if (pt < 1 || (struck && strikeT < 1)) careerPlate(pen, gc, x, y, g, level, seal, 1, pt, pt < 1 ? pt : strikeT);
    else drawSprite(gc, this.#bake(`plate|${level}|${ill}`, w, h + sealR * 2, (p, c, cx, cy) => careerPlate(p, c, cx, cy - sealR, g, level, seal, 1, 1)), x, y + sealR);
    ringFill(pen, g.ring.x, g.ring.y, g.ring.r, f, ease.out(part(pt, 0.6, 1)));
    const tick = clamp((s - since) / AT.tick);
    if (tick < 1) stamp(pen, g.ring.x, g.ring.y, g.ring.r, tick, 11);
  }

  /** Each landing's sound and haptic, once, as its moment comes. */
  #beats(s: number): void {
    const once = (key: string, at: number, sound: UiSound, haptic: UiHaptic) => {
      if (s < at || this.#fired.has(key)) return;
      this.#fired.add(key);
      effect(`result:${key}`, sound, haptic);
    };
    once('place', AT.laurel[1], 'reward', 'medium');
    this.#g!.stats.forEach((_q, i) => once(`stat${i}`, this.#statAt(i), 'count', 'light'));
    this.#climbs.forEach((_c, i) => {
      if (i > 0) once(`level${i}`, AT.ring + i * this.#each, 'levelUp', 'success');
    });
    once('earned', this.#stops, 'reward', 'medium');
    if (this.#newIll !== this.#wasIll) {
      const rose = this.#m.rank.after.tier > this.#m.rank.before.tier;
      once('seal', this.#stops + AT.seal + AT.strike, rose ? 'rankUp' : 'deny', rose ? 'success' : 'warning');
    }
  }
}
