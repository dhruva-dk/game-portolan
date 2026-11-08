// The match's HUD on the chart: every reading, control and combat mark over the sea, in the instruments' hand
// (src/screens/instruments.ts). It inks in as she comes to sea and dries away when the match's screens leave it. What
// holds still is baked once as a sprite; what a number or state changes is a plate re-inked when it changes; only what
// moves (the rings, the arcs, the figures, the stick) is placed each frame. The chart takes only touches on its
// pressables here; everything else falls through to the controls layer, which keeps the floating stick and the look.
// Once she has sunk the same HUD spectates: only the disc and the Storm's clock stay, the disc gilt over the ship
// watched, and a tap anywhere skips to the result.
import {
  Press, arcPts, canvas, cross, ctx, drawSprite, dryAlpha, ease, everywhere, figure, figureWidth, hand, part, pressLook, prims,
  woodcut, WASH, type Box, type ChartLayer, type ChartLayout, type Circle, type InkName, type Pen, type Pressable, type Pts, type Rect, type Sprite,
} from '../chart/index.ts';
import { clamp } from '../chart/noise.ts';
import type { Prim } from '../icons/draw.ts';
import { stormSpiral } from '../icons/sets/hud.ts';
import type { HurtId } from '../icons/sets/hurts.ts';
import { SAILS, type Controls } from '../app/controls.ts';
import type { Moment } from '../app/events.ts';
import type { V3 } from '../sim/math.ts';
import type { RegionId } from '../sim/world/index.ts';
import type { HudModel, PartsModel, Slot } from '../ui/model.ts';
import { feedback } from '../ui/parts/feedback.ts';
import { LOOT_INKS } from '../render/actors/loot.ts';
import { badge, bar, discPath, drainRing, paper, reticle, roundButton, sailsArc, slipPath, slot, type SlotOptions } from './instruments.ts';
import { Minimap, Plate, drawStick, mapFace } from './minimap.ts';

/** Room round a baked instrument for its shadow. */
const PAD = 16;
const TAU = Math.PI * 2;
/** Seconds: the HUD laid down, its ink drying away, a region's sign inking in, standing and drying out. */
const TIME = { lay: 0.5, dry: 0.3, sign: [0.5, 3.2, 0.9] as const } as const;
/** The plates a frame may re-ink: no more of them than the frame can afford, the rest waiting for the next. */
const BAKES = 3;
/** Seconds a slot is held before what is in it goes over the side; the share of that a finger rests before it shows. */
const HOLD = 0.6;
const HOLD_SHOWS = 0.18;
/** Seconds: the cross at the reticle on a hit, a damage figure's rise, an arc toward whoever struck her. */
const MARK = { cross: 0.22, figure: 0.9, arc: 1.1 } as const;
/** Hits on one ship this close together (ms) add to one figure, and from one shooter to one arc. */
const MERGE = 350;
/** The most figures and arcs kept at once: a broadside must not cost the frame. */
const MOST = { figures: 12, arcs: 6 } as const;
/** Half an incoming arc's sweep, radians; the ellipse it runs on, as shares of the screen. */
const ARC = { half: 0.22, w: 0.46, h: 0.4 } as const;

/** A hurt to the ship as the HUD shows it, 0 (whole or mended) to 1. */
const hurtShown = (k: number): number => clamp((k - 0.08) / 0.22);
function hurtsOf(p: PartsModel): Record<HurtId, number> {
  return {
    sail: hurtShown(p.sail), mast: p.down > 0 ? 1 : p.jury ? 0.7 : hurtShown(p.mast), rudder: hurtShown(p.rudder),
    leak: hurtShown(p.flood / p.sinks), fire: p.burning ? 1 : 0, ice: hurtShown(p.ice),
  };
}

/** The Storm's clock: minutes and seconds. */
const clockText = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Woodcuts in the order the eye reads them. */
const HURTS: readonly HurtId[] = ['sail', 'mast', 'rudder', 'leak', 'fire', 'ice'];

/** What the HUD needs of the game. */
export interface HudHost {
  /** The stick's place for the chart to draw, and what the HUD's controls press. */
  readonly controls: Pick<Controls, 'press' | 'pick' | 'stickView'> & { throttle: number };
  /** Where the camera sees from, for the marks pinned to the world. */
  readonly sight: { readonly me: number; readonly spectating: boolean; project(p: V3): { x: number; y: number } | null; bearing(p: V3): number };
  /** Where ship i is now, for an arc turned toward her; null if she is not to be shown. */
  shipAt(i: number): V3 | null;
  /** Left-handed: the controls change sides. */
  lefty(): boolean;
  /** Opens the full map. While nothing is given the disc takes no press. */
  openMap?(): void;
}

/** The vitals' slip: the bars' boxes and the slip round them, centred at (x, y). */
interface VitalsPlace {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Plates {
  vitals: Plate;
  clock: Plate;
  afloat: Plate;
  map: Plate;
  sails: Plate;
  gust: Plate;
  slots: Plate[];
}

/** A damage figure rising from the ship struck. */
interface HitFigure {
  ship: number;
  pos: V3;
  value: number;
  at: number;
  /** She sank: the figure is gold and largest. */
  sunk: boolean;
}

/** An arc at the screen's edge toward a ship that hit me. */
interface FireArc {
  ship: number;
  at: number;
}

/** The controls' places: the layout's, the thumbs changed about for the left hand. */
interface ControlPlaces {
  stick: Circle;
  fire: Circle;
  gust: Circle;
  ability: Circle;
  reload: Circle;
  sails: Circle;
}

interface HudPresses {
  fire: Pressable;
  reload: Pressable;
  ability: Pressable;
  gust: Pressable;
  sails: Pressable;
  slots: Pressable[];
  map: Pressable | null;
}

/** A slot's woodcut and what stands in its corner. */
function slotOf(s: Slot, chosen: boolean, seed: number): SlotOptions {
  if (s.kind === 'empty') return { seed };
  if (s.kind === 'weapon') return { drawing: prims(`weapon.${s.weapon}`), count: String(s.ammo), chosen, edge: LOOT_INKS[s.rarity], seed };
  return { drawing: prims(`item.${s.item}`), count: String(s.count), chosen, seed };
}

const slotKey = (s: Slot, chosen: boolean): string =>
  s.kind === 'empty' ? 'e' : s.kind === 'weapon' ? `w${s.weapon}|${s.rarity}|${s.ammo}|${chosen}` : `c${s.item}|${s.count}|${chosen}`;

export class Hud {
  readonly #host: HudHost;
  #layer: ChartLayer | null = null;
  #layout: ChartLayout | null = null;
  #m: HudModel | null = null;
  #born = -1;
  #leftAt = -1;
  #off: (() => void) | null = null;
  /** The full map is open over the sea: only the disc shows, and takes a press. */
  #covered = false;
  /** She has sunk and the HUD spectates, or null: what a tap anywhere does then (skips to the result). */
  #skip: (() => void) | null = null;
  /** Called once the HUD has gone. */
  onGone?: () => void;
  /** What this frame draws with: the whole HUD's opacity, the time, the regions it drew into, what it may re-ink. */
  #a = 1;
  #now = 0;
  #rects: Rect[] = [];
  #bakes = BAKES;
  #plates: Plates | null = null;
  #vitals: VitalsPlace = { x: 0, y: 0, w: 0, h: 0 };
  /** How far each hurt shows, easing as the part mends or breaks. */
  readonly #hurts: Record<HurtId, number> = { sail: 0, mast: 0, rudder: 0, leak: 0, fire: 0, ice: 0 };
  /** What is on the sea in the disc, and the land under it, sampled round the ship as she sails. */
  readonly #map = new Minimap();
  /** The map's plate is re-inked every other model refresh: the sea round her does not change at twelve hertz. */
  #mapKey = 0;
  #refresh = 0;
  /** The screen's rim, a small canvas stretched, and how deep it shows, easing as she comes and goes from the Storm. */
  #rimC: HTMLCanvasElement | null = null;
  #rim = 0;
  /** The region's sign: which region's, and when it inked in. */
  #region: RegionId | null | undefined = undefined;
  #sign: RegionId | null = null;
  #signAt = -1;
  #signDue = false;
  #c: ControlPlaces | null = null;
  #p: HudPresses | null = null;
  /** Whether the pressables are on the chart: they come off once, when she leaves, while the press springs still draw. */
  #pressing = false;
  /** The sails' needle as drawn, swinging to the notch set, and the notch. */
  #at = 2;
  #wantAt = 2;
  /** The rings as drawn, easing between the model's refreshes. */
  #reloadLeft = 0;
  #abilityLeft = 0;
  /** A slot held: which, since when (ms), whether it was the chosen one, and whether the hold has dropped what's in it. */
  #hold: { k: number; at: number; was: boolean; spent: boolean } | null = null;
  /** When the last hit of mine landed (ms), and whether it sank her. */
  #markAt = -1;
  #markSunk = false;
  readonly #figures: HitFigure[] = [];
  readonly #arcs: FireArc[] = [];

  constructor(host: HudHost) {
    this.#host = host;
  }

  /** Lays the HUD on the chart at `now`. */
  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = now;
    this.#off = layer.addLive((g, t, dt) => this.#frame(g, t, dt, layer));
  }

  /** What the HUD shows: the model is refreshed a few times a second; the plates redraw when what they show changes. */
  set(m: HudModel): void {
    this.#m = m;
    this.#wantAt = m.throttle < 0.25 ? 0 : m.throttle < 0.75 ? 1 : 2;
    if (m.regionId !== this.#region) {
      this.#region = m.regionId;
      if (m.regionId) { this.#sign = m.regionId; this.#signDue = true; }
    }
    if (this.#refresh++ % 2 === 0) this.#mapKey++;
  }

  /** A moment of the match: what is hit, and who hit her. The marks are for the player's own ship, never a spectator's. */
  moment(e: Moment): void {
    const s = this.#host.sight;
    if (s.spectating) return;
    if (e.k === 'sink' && e.by === s.me && e.ship !== s.me) {
      for (let i = this.#figures.length - 1; i >= 0; i--) {
        const f = this.#figures[i];
        if (f.ship === e.ship) { f.sunk = true; f.at = this.#now; break; }
      }
      this.#markAt = this.#now;
      this.#markSunk = true;
    }
    if (e.k !== 'hit' || e.steady) return;
    const value = Math.round(e.shield + e.hull);
    if (value <= 0) return;
    if (e.by === s.me && e.ship !== s.me) {
      this.#markAt = this.#now;
      this.#markSunk = false;
      const last = this.#figures.find((f) => f.ship === e.ship && this.#now - f.at < MERGE && !f.sunk);
      if (last) { last.value += value; last.pos = { ...e.pos }; }
      else {
        if (this.#figures.length >= MOST.figures) this.#figures.shift();
        this.#figures.push({ ship: e.ship, pos: { ...e.pos }, value, at: this.#now, sunk: false });
      }
    } else if (e.ship === s.me && e.by >= 0 && e.by !== s.me) {
      const arc = this.#arcs.find((a) => a.ship === e.by);
      if (arc) arc.at = this.#now;
      else {
        if (this.#arcs.length >= MOST.arcs) this.#arcs.shift();
        this.#arcs.push({ ship: e.by, at: this.#now });
      }
    }
  }

  /** The ink dries away from `now`; the HUD takes no more touches. */
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

  /** The full map is open: only the disc shows, and only it takes a press. */
  cover(on: boolean): void {
    if (this.#covered === on) return;
    this.#covered = on;
    const layer = this.#layer;
    if (!layer || !this.#p) return;
    if (on) this.#bare(layer);
    else this.#place(layer);
  }

  /** She has sunk: the controls and the vitals go, the disc and the Storm's clock stay over the ship watched, and a tap
   *  anywhere is `skip`. */
  spectate(skip: () => void): void {
    if (this.#skip) return;
    this.#skip = skip;
    const layer = this.#layer;
    if (layer && this.#p) this.#watchOnly(layer);
  }

  /** Every press off the chart, and the one over the whole screen that skips to the result. */
  #watchOnly(layer: ChartLayer): void {
    this.#bare(layer);
    layer.presses.remove('hud:map');
    const skip = this.#skip!;
    layer.presses.add({ id: 'hud:skip', hit: everywhere(layer.layout), press: new Press(), sound: 'none', haptic: 'light', act: () => skip() });
  }

  /** Every press off the chart but the disc's. */
  #bare(layer: ChartLayer): void {
    const p = this.#p!;
    for (const q of [p.fire, p.reload, p.ability, p.gust, p.sails, ...p.slots]) layer.presses.remove(q.id);
  }

  /** No more touches: a held Fire is still let go when its finger lifts, Presses keeping the finger's pressable. */
  #unpress(): void {
    const p = this.#p, layer = this.#layer;
    if (!p || !layer || !this.#pressing) return;
    this.#pressing = false;
    for (const q of [p.fire, p.reload, p.ability, p.gust, p.sails, ...p.slots, ...(p.map ? [p.map] : [])]) layer.presses.remove(q.id);
    layer.presses.remove('hud:skip');
  }

  /** The places, the plates and the pressables for this screen size. */
  #place(layer: ChartLayer): void {
    const l = layer.layout, sb = l.bars.shield, hb = l.bars.hull;
    this.#layout = l;
    const w = sb.w + 20, h = hb.y + hb.h / 2 - (sb.y - sb.h / 2) + 20;
    this.#vitals = { x: sb.x, y: (sb.y + hb.y) / 2, w, h };
    this.#plates = {
      vitals: new Plate(layer, w + PAD * 2, h + PAD * 2),
      clock: new Plate(layer, l.clock.w + PAD * 2, l.clock.h + PAD * 2),
      afloat: new Plate(layer, l.afloat.w + PAD * 2, l.afloat.h + PAD * 2),
      map: new Plate(layer, l.hud.r * 2, l.hud.r * 2),
      sails: new Plate(layer, (l.controls.sails.r + PAD) * 2, (l.controls.sails.r + PAD) * 2),
      gust: new Plate(layer, (l.controls.gust.r + PAD) * 2, (l.controls.gust.r + PAD) * 2),
      slots: l.slots.map((b) => new Plate(layer, b.w + PAD * 2, b.h + PAD * 2)),
    };
    const mirror = (c: Circle): Circle => (this.#host.lefty() ? { ...c, x: l.w - c.x } : c);
    const cs = l.controls, c: ControlPlaces = {
      stick: mirror(cs.stick), fire: mirror(cs.fire), gust: mirror(cs.gust), ability: mirror(cs.ability), reload: mirror(cs.reload), sails: mirror(cs.sails),
    };
    this.#c = c;
    this.#unpress();
    const a = this.#host.controls, tap = (w: Parameters<typeof a.press>[0]) => { a.press(w); a.press(w, false); };
    const add = (q: Omit<Pressable, 'press'>) => layer.presses.add({ press: new Press(), ...q });
    this.#p = {
      fire: add({ id: 'hud:fire', hit: c.fire, on: 'down', sound: 'none', haptic: 'medium', act: () => a.press('fire'), release: () => a.press('fire', false) }),
      reload: add({ id: 'hud:reload', hit: c.reload, on: 'down', act: () => tap('reload') }),
      ability: add({ id: 'hud:ability', hit: c.ability, on: 'down', sound: 'none', haptic: 'medium', act: () => tap('ability') }),
      gust: add({ id: 'hud:gust', hit: c.gust, on: 'down', sound: 'none', haptic: 'light', act: () => tap('gust') }),
      sails: add({ id: 'hud:sails', hit: { ...c.sails, r: c.sails.r * 1.2 }, on: 'down', sound: 'tick', haptic: 'selection', act: (x) => this.#setSails(x, c.sails) }),
      slots: l.slots.map((b, k) => add({ id: `hud:slot${k + 1}`, hit: b, on: 'down', sound: 'slot', haptic: 'selection', act: () => this.#slotDown(k), release: () => this.#slotUp(k) })),
      map: this.#host.openMap ? add({ id: 'hud:map', hit: l.hud, on: 'up', act: () => this.#host.openMap?.() }) : null,
    };
    this.#pressing = true;
    if (this.#covered) this.#bare(layer);
    if (this.#skip) this.#watchOnly(layer);
    if (this.#leftAt >= 0) this.#unpress();
  }

  /** A notch of the sails tapped: left, middle or right of the instrument. */
  #setSails(x: number, c: Circle): void {
    const k = x < c.x - c.r * 0.33 ? 0 : x > c.x + c.r * 0.33 ? 2 : 1;
    this.#host.controls.throttle = SAILS[k];
    this.#wantAt = k;
  }

  /** The chosen slot's own press: a tap on it uses a consumable; with the hold full and loot in reach, it swaps instead. */
  #slotDown(k: number): void {
    const m = this.#m;
    if (!m) return;
    const was = m.selected === k;
    this.#hold = { k, at: this.#now, was, spent: false };
    if (!was) this.#host.controls.pick(k);
  }

  #slotUp(k: number): void {
    const h = this.#hold, m = this.#m;
    if (!h || h.k !== k || !m) return;
    this.#hold = null;
    if (h.spent || !h.was) return;
    const a = this.#host.controls, s = m.slots[k];
    if (m.pickup !== null && m.slots.every((q) => q.kind !== 'empty')) { a.press('take'); a.press('take', false); }
    else if (s?.kind === 'consumable') { a.press('fire'); a.press('fire', false); }
  }

  /** A slot held long enough goes over the side. */
  #dropHeld(m: HudModel): void {
    const h = this.#hold;
    if (!h || h.spent || (this.#now - h.at) / 1000 < HOLD) return;
    h.spent = true;
    if (m.slots[h.k]?.kind === 'empty') return;
    const a = this.#host.controls;
    a.press('drop');
    a.press('drop', false);
    feedback('slot', 'medium', 'hud:drop');
  }

  #frame(g: CanvasRenderingContext2D, now: number, dt: number, layer: ChartLayer): Rect[] | void {
    const m = this.#m;
    if (!m) return [];
    if (layer.layout !== this.#layout) this.#place(layer);
    const dry = this.#leftAt < 0 ? 0 : clamp((now - this.#leftAt) / 1000 / TIME.dry);
    if (dry >= 1) {
      this.dispose();
      this.onGone?.();
      return;
    }
    this.#a = ease.out((now - this.#born) / 1000 / TIME.lay) * dryAlpha(dry);
    this.#now = now;
    this.#rects.length = 0;
    this.#bakes = BAKES;
    if (this.#signDue) { this.#signAt = now; this.#signDue = false; }
    const plates = this.#plates!;
    if (this.#covered) {
      this.#minimap(g, layer, m, plates.map);
      return this.#rects;
    }
    if (this.#skip) {
      // spectating: the disc and the Storm's clock, over the ship watched
      this.#stormClock(g, layer.layout, m, plates);
      this.#minimap(g, layer, m, plates.map, true);
      return this.#rects;
    }
    this.#stormRim(g, layer, m, dt);
    this.#incoming(layer, m);
    this.#vitalsAndHurts(g, layer, m, plates.vitals, dt);
    this.#stormClock(g, layer.layout, m, plates);
    this.#afloat(g, layer.layout, m, plates);
    this.#minimap(g, layer, m, plates.map);
    this.#controls(g, layer, m, plates, dt);
    this.#combat(g, layer, m);
    return this.#rects;
  }

  /** Marks a region drawn into. */
  #touch(x: number, y: number, w: number, h: number): void {
    this.#rects.push({ x: x - w / 2, y: y - h / 2, w, h });
  }

  /** Draws a plate, re-inking it first if what it shows has changed and the frame can afford it (always, the first time). */
  #plate(g: CanvasRenderingContext2D, p: Plate, key: string, x: number, y: number, draw: (pen: Pen, cx: number, cy: number) => void, o: { alpha?: number; scale?: number; dark?: number } = {}): void {
    if (p.key !== key && (p.key === '' || this.#bakes-- > 0)) p.ink(key, draw);
    drawSprite(g, p.sprite, x, y, { ...o, alpha: this.#a * (o.alpha ?? 1) });
    this.#touch(x, y, p.sprite.w + 4, p.sprite.h + 4);
  }

  /** A figure baked once, for the numerals that change often and come back. */
  #numeral(layer: ChartLayer, text: string, ink: InkName, size: number, halo = false): Sprite {
    const s = Math.round(size), w = Math.ceil(figureWidth(text, s) + s * 1.4), h = Math.ceil(s * 2.6);
    return layer.sprite(`hud|n|${text}|${ink}|${s}|${halo ? 1 : 0}`, w, h, w / 2, h / 2, (p) => {
      const y = h / 2 + s * 0.42;
      if (halo) figure(p, text, w / 2 + 0.8, y + 0.8, s, { ink: 'white', align: 'center', weight: 0.24, seed: 11, alpha: 0.75 });
      figure(p, text, w / 2, y, s, { ink, align: 'center', weight: 0.17, seed: 11 });
    });
  }

  /** Draws a sprite with its press look, and marks the region. */
  #pressed(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, sink: number, alpha = 1): void {
    const look = pressLook(sink);
    drawSprite(g, s, x, y + look.dy, { scale: look.scale, dark: look.dark, alpha: this.#a * alpha });
    this.#touch(x, y, s.w + 6, s.h + 6);
  }

  // ── readings ──

  /** The screen's rim tinted red while she is out in the Storm, deeper the farther out: a small canvas stretched. */
  #stormRim(g: CanvasRenderingContext2D, layer: ChartLayer, m: HudModel, dt: number): void {
    const want = m.storm.outside ? 0.35 + 0.65 * clamp(m.storm.depth) : 0;
    this.#rim += (want - this.#rim) * (1 - Math.exp(-dt * 5));
    if (this.#rim < 0.01) return;
    if (!this.#rimC) {
      const c = canvas(120, 80), gc = ctx(c);
      gc.setTransform(60, 0, 0, 40, 60, 40);
      const rg = gc.createRadialGradient(0, 0, 0.62, 0, 0, 1.2);
      rg.addColorStop(0, 'rgba(176,40,22,0)');
      rg.addColorStop(1, 'rgba(176,40,22,0.8)');
      gc.fillStyle = rg;
      gc.fillRect(-1, -1, 2, 2);
      this.#rimC = c;
    }
    const l = layer.layout;
    g.save();
    g.globalAlpha = this.#a * this.#rim;
    g.drawImage(this.#rimC, 0, 0, l.w, l.h);
    g.restore();
    this.#rects.push({ x: 0, y: 0, w: l.w, h: l.h });
  }

  /** The shield's bar over the hull's on one slip, the hurts in a row under it, only while each lasts. */
  #vitalsAndHurts(g: CanvasRenderingContext2D, layer: ChartLayer, m: HudModel, plate: Plate, dt: number): void {
    const l = layer.layout, v = this.#vitals, sb = l.bars.shield, hb = l.bars.hull;
    const key = `${m.shield}|${m.hull}|${m.colour}`;
    this.#plate(g, plate, key, v.x, v.y, (p, cx, cy) => {
      paper(p, slipPath(cx, cy, v.w, v.h, 3), { burn: 4 });
      bar(p, { ...sb, x: cx, y: cy - (v.y - sb.y) }, m.shield / m.shieldMax, { colour: WASH.azure, figure: String(m.shield), seed: 5 });
      bar(p, { ...hb, x: cx, y: cy + (hb.y - v.y) }, m.hull / m.hullMax, { colour: m.colour, figure: String(m.hull), low: m.hull < 35, seed: 6 });
    });
    const k = 1 - Math.exp(-dt * 6), want = hurtsOf(m.parts), r = Math.round(hb.h * 0.72), step = r * 2 + 6;
    let x = v.x - v.w / 2 + r + 2;
    const y = v.y + v.h / 2 + r + 6;
    for (const id of HURTS) {
      this.#hurts[id] += (want[id] - this.#hurts[id]) * k;
      const a = this.#hurts[id];
      if (a < 0.03) continue;
      const size = (r + 8) * 2;
      const s = layer.sprite(`hud|hurt|${id}|${size}`, size, size, size / 2, size / 2, (p) => {
        paper(p, discPath(size / 2, size / 2, r, 7), { burn: 3 });
        woodcut(p, prims(`hurt.${id}`), size / 2, size / 2, r * 1.55);
      });
      drawSprite(g, s, x, y, { alpha: this.#a * a });
      this.#touch(x, y, size, size);
      x += step;
    }
  }

  /** The Storm's clock, top centre. No clock for the second before the first phase, or once the Storm is done closing. */
  #stormClock(g: CanvasRenderingContext2D, l: ChartLayout, m: HudModel, plates: Plates): void {
    const st = m.storm;
    if (!st.grace && (st.seconds > 0 || st.shrinking)) {
      const text = clockText(st.seconds), tight = st.shrinking ? Math.round(clamp(st.progress) * 4) : -1;
      this.#plate(g, plates.clock, `${text}|${tight}`, l.clock.x, l.clock.y, (p, cx, cy) => {
        // the spiral winds tighter as the circle closes
        const drawing = tight < 0 ? prims('hud.spiral') : stormSpiral(2.5 + tight * 0.5);
        badge(p, { ...l.clock, x: cx, y: cy }, drawing, text, { figureInk: st.shrinking ? 'rubric' : 'iron', seed: 9 });
      });
    }
  }

  /** The ships afloat, beside the clock. */
  #afloat(g: CanvasRenderingContext2D, l: ChartLayout, m: HudModel, plates: Plates): void {
    this.#plate(g, plates.afloat, String(m.ships), l.afloat.x, l.afloat.y, (p, cx, cy) => {
      badge(p, { ...l.afloat, x: cx, y: cy }, prims('hud.shipsLeft'), String(m.ships), { seed: 10 });
    });
  }

  /** The minimap disc: the paper, the sea round her north up, her arrow, and the region's sign when she enters one;
   *  watching another ship (`gilt`), her arrow gilt and no sign. */
  #minimap(g: CanvasRenderingContext2D, layer: ChartLayer, m: HudModel, plate: Plate, gilt = false): void {
    const D = layer.layout.hud;
    const size = mapFace(g, layer, D, this.#a, m.map.heading, () => {
      this.#plate(g, plate, String(this.#mapKey), D.x, D.y, (p, cx, cy) => this.#map.ink(p, cx, cy, layer, m.map, m.tide.level));
    }, gilt);
    this.#touch(D.x, D.y, size, size);
    if (!gilt) this.#regionSign(g, layer, D);
  }

  /** The region's woodcut, inked in at the top of the disc on entering it, standing a few seconds, drying out. */
  #regionSign(g: CanvasRenderingContext2D, layer: ChartLayer, D: Circle): void {
    if (!this.#sign || this.#signAt < 0) return;
    const [a, b, c] = TIME.sign, s = (this.#now - this.#signAt) / 1000;
    if (s >= b + c) { this.#sign = null; return; }
    const r = Math.round(D.r * 0.3), size = (r + 6) * 2, h = size / 2;
    const sign = layer.sprite(`hud|sign|${this.#sign}|${size}`, size, size, h, h, (p) => {
      paper(p, discPath(h, h, r, 11), { burn: 3 });
      woodcut(p, prims(`region.${this.#sign}`), h, h, r * 1.5);
    });
    const alpha = s < a ? ease.out(s / a) : s < b ? 1 : dryAlpha((s - b) / c), k = 1 + 0.12 * (1 - ease.out(s / a));
    const y = D.y - D.r * 0.56;
    drawSprite(g, sign, D.x, y, { alpha: this.#a * alpha, scale: k });
    this.#touch(D.x, y, size, size);
  }

  // ── the controls ──

  /** The stick, the sails, the hotbar and the right thumb's cluster. */
  #controls(g: CanvasRenderingContext2D, layer: ChartLayer, m: HudModel, plates: Plates, dt: number): void {
    const c = this.#c!, p = this.#p!, l = layer.layout, pen = layer.pen, a = this.#a;
    const gun = m.slots[m.selected]?.kind === 'weapon';
    p.gust.disabled = m.gust.charges === 0;
    p.ability.disabled = m.ability.ready < 1;
    p.reload.disabled = !gun;
    this.#dropHeld(m);
    drawStick(g, layer, c.stick, this.#host.controls.stickView, this.#a, (x, y, w, h) => this.#touch(x, y, w, h));
    // the sails: the needle swings to the notch set
    this.#at += (this.#wantAt - this.#at) * (1 - Math.exp(-dt * 14));
    if (Math.abs(this.#wantAt - this.#at) < 0.01) this.#at = this.#wantAt;
    const sc = c.sails, sailsLook = pressLook(p.sails.press.sink);
    this.#plate(g, plates.sails, this.#at.toFixed(2), sc.x, sc.y + sailsLook.dy, (q, cx, cy) => sailsArc(q, cx, cy, sc.r, this.#at, { seed: 17 }), { scale: sailsLook.scale, dark: sailsLook.dark });
    this.#hotbar(g, layer, m, plates, l);
    // Fire, and the ring round it filling as her deck steadies in a swell
    const f = c.fire;
    const fireS = layer.sprite(`hud|fire|${f.r}`, (f.r + PAD) * 2, (f.r + PAD) * 2, f.r + PAD, f.r + PAD, (q) => roundButton(q, f.r + PAD, f.r + PAD, f.r, prims('weapon.cannon'), { seed: 21, icon: 1.2 }));
    this.#pressed(g, fireS, f.x, f.y, p.fire.press.sink);
    if (m.steady !== null) {
      const steady = clamp(m.steady);
      pen.rule([arcPts(f.x, f.y, f.r * 1.1, -Math.PI / 2, -Math.PI / 2 + TAU * steady, 56)], { w: 'fine', ink: steady > 0.92 ? 'gold' : 'white', alpha: 0.85 * a, wobble: 0.2, seed: 141 });
      this.#touch(f.x, f.y, f.r * 2.4, f.r * 2.4);
    }
    // Reload, a ring draining while she reloads
    const rc = c.reload, reloadSlot = m.slots[m.selected];
    const reloadS = this.#button(layer, 'reload', rc.r, prims('hud.reload'), !gun, 22);
    this.#pressed(g, reloadS, rc.x, rc.y, p.reload.press.sink);
    const rl = reloadSlot?.kind === 'weapon' && reloadSlot.reload > 0 ? 1 - reloadSlot.reload : 0;
    this.#reloadLeft = rl > this.#reloadLeft ? rl : this.#reloadLeft + (rl - this.#reloadLeft) * (1 - Math.exp(-dt * 24));
    if (this.#reloadLeft > 0.005) drainRing(pen, rc.x, rc.y, rc.r * 0.93, this.#reloadLeft, 'rubric', a);
    // the ability: while cooling, faint, its ring draining and its seconds on its face
    const ac = c.ability, ready = m.ability.ready >= 1;
    const abilityS = this.#button(layer, `ability|${m.ability.id}`, ac.r, prims(`ability.${m.ability.id}`), !ready, 23);
    this.#pressed(g, abilityS, ac.x, ac.y, p.ability.press.sink);
    const al = ready ? 0 : 1 - m.ability.ready;
    this.#abilityLeft = al > this.#abilityLeft ? al : this.#abilityLeft + (al - this.#abilityLeft) * (1 - Math.exp(-dt * 24));
    if (!ready) {
      drainRing(pen, ac.x, ac.y, ac.r * 0.93, this.#abilityLeft, 'rubric', a);
      const n = this.#numeral(layer, String(Math.ceil(m.ability.seconds)), 'iron', l.figure.hit * 0.8);
      drawSprite(g, n, ac.x, ac.y, { alpha: a });
    }
    // Gust: its pips filling as a charge returns
    const gc = c.gust, full = m.gust.charges + (m.gust.charges < m.gust.max ? m.gust.recharge : 0), gustKey = `${m.gust.charges}|${Math.round(m.gust.recharge * 6)}`;
    const gustLook = pressLook(p.gust.press.sink);
    this.#plate(g, plates.gust, gustKey, gc.x, gc.y + gustLook.dy, (q, cx, cy) => {
      roundButton(q, cx, cy, gc.r, prims('hud.gust'), { seed: 24, pips: { n: m.gust.max, full }, faint: m.gust.charges === 0 });
    }, { scale: gustLook.scale, dark: gustLook.dark });
  }

  /** A round button baked once; `faint` (nothing to do) is its own bake. */
  #button(layer: ChartLayer, name: string, r: number, drawing: readonly Prim[], faint: boolean, seed: number): Sprite {
    const size = (r + PAD) * 2, h = size / 2;
    return layer.sprite(`hud|${name}|${r}|${faint ? 1 : 0}`, size, size, h, h, (p) => roundButton(p, h, h, r, drawing, { seed, faint }));
  }

  /** The hotbar's five slots along the bottom: each baked with what is in it; a hold shows as a line running round its square. */
  #hotbar(g: CanvasRenderingContext2D, layer: ChartLayer, m: HudModel, plates: Plates, l: ChartLayout): void {
    const p = this.#p!, pen = layer.pen, a = this.#a;
    l.slots.forEach((b, k) => {
      const s = m.slots[k] ?? { kind: 'empty' as const }, chosen = k === m.selected, look = pressLook(p.slots[k].press.sink);
      this.#plate(g, plates.slots[k], slotKey(s, chosen), b.x, b.y + look.dy, (q, cx, cy) => slot(q, { ...b, x: cx, y: cy }, slotOf(s, chosen, 31 + k)), { scale: look.scale, dark: look.dark });
      if (chosen && m.using) {
        // a shield or repair being used: a gold line along the slot's top, running as it takes
        const i = b.w * 0.14, x0 = b.x - b.w / 2 + i, w = b.w - i * 2, y0 = b.y - b.h / 2 + i;
        pen.rule([[x0, y0 - 3, x0 + w * clamp(m.using.progress), y0 - 3]], { w: 'bold', ink: 'gold', alpha: 0.95 * a, seed: 97 });
      }
    });
    const h = this.#hold;
    if (h && !h.spent) {
      const f = clamp(((this.#now - h.at) / 1000 / HOLD - HOLD_SHOWS) / (1 - HOLD_SHOWS));
      if (f > 0) {
        const b = l.slots[h.k];
        pen.rule([squareRun(b, f)], { w: 'bold', ink: 'rubric', alpha: 0.95 * a, seed: 98 });
        this.#touch(b.x, b.y, b.w + 12, b.h + 12);
      }
    }
  }

  // ── combat ──

  /** Red arcs at the screen's edge: toward each ship that has just hit me, and, pulsing, toward a heavy gun winding up. */
  #incoming(layer: ChartLayer, m: HudModel): void {
    const now = this.#now, arcs = this.#arcs;
    for (let i = arcs.length - 1; i >= 0; i--) {
      const f = (now - arcs[i].at) / 1000 / MARK.arc;
      if (f >= 1) { arcs.splice(i, 1); continue; }
      const at = this.#host.shipAt(arcs[i].ship);
      if (at) this.#arc(layer, this.#host.sight.bearing(at), 1 - ease.in(f), 5);
    }
    if (m.aimed) {
      const w = clamp(m.aimed.wound), beat = 0.5 + 0.5 * Math.sin((now / 1000) * TAU * (1.4 + w * 2.6));
      this.#arc(layer, m.aimed.bearing, (0.35 + 0.65 * w) * (0.45 + 0.55 * beat), 7);
    }
  }

  /** One arc of red on an ellipse just inside the screen's edge, centred on a bearing (radians clockwise from ahead). */
  #arc(layer: ChartLayer, bearing: number, alpha: number, w: number): void {
    const l = layer.layout, cx = l.w / 2, cy = l.h / 2, ex = l.w * ARC.w, ey = l.h * ARC.h, pts: Pts = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i <= 8; i++) {
      const a = bearing + (i / 8 - 0.5) * ARC.half * 2, x = cx + Math.sin(a) * ex, y = cy - Math.cos(a) * ey;
      pts.push(x, y);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    layer.pen.rule([pts], { w, ink: 'rubric', alpha: alpha * this.#a, wobble: 0.2, seed: 121 });
    this.#rects.push({ x: x0 - w, y: y0 - w, w: x1 - x0 + w * 2, h: y1 - y0 + w * 2 });
  }

  /** What lies over the sea at the centre: the reticle, a hit's cross, the damage rising; and the hand offering a swap. */
  #combat(g: CanvasRenderingContext2D, layer: ChartLayer, m: HudModel): void {
    const l = layer.layout, c = l.reticle, a = this.#a, now = this.#now;
    if (m.slots[m.selected]?.kind === 'weapon') {
      const h = c.r + PAD, s = layer.sprite(`hud|reticle|${c.r}`, h * 2, h * 2, h, h, (p) => reticle(p, h, h, c.r));
      drawSprite(g, s, c.x, c.y, { alpha: a });
      this.#touch(c.x, c.y, h * 2, h * 2);
    }
    const f = (now - this.#markAt) / 1000 / MARK.cross;
    if (this.#markAt >= 0 && f < 1) {
      const ink = this.#markSunk ? 'gold' : 'white', r = c.r * 1.3, h = Math.ceil(r + PAD);
      const s = layer.sprite(`hud|hit|${ink}|${r}`, h * 2, h * 2, h, h, (p) => {
        cross(p, h + 0.8, h + 0.8, r, 1, 'iron');
        cross(p, h, h, r, 1, ink);
      });
      drawSprite(g, s, c.x, c.y, { alpha: a * (1 - ease.in(f)), scale: 1.2 - 0.2 * ease.out(f * 2) });
      this.#touch(c.x, c.y, h * 2.5, h * 2.5);
    }
    this.#hitFigures(g, layer);
    if (m.pickup !== null && m.slots.every((q) => q.kind !== 'empty')) this.#offer(g, layer, m);
  }

  /** The damage each hit of mine did, rising from the ship struck in red, larger for larger; gold when it sinks her. */
  #hitFigures(g: CanvasRenderingContext2D, layer: ChartLayer): void {
    const H = layer.layout.figure.hit, figs = this.#figures, now = this.#now;
    for (let i = figs.length - 1; i >= 0; i--) {
      const f = figs[i], s = (now - f.at) / 1000 / MARK.figure;
      if (s >= 1) { figs.splice(i, 1); continue; }
      const at = this.#host.sight.project(f.pos);
      if (!at) continue;
      const size = f.sunk ? H * 1.6 : H * (f.value < 15 ? 0.85 : f.value < 40 ? 1.1 : 1.45);
      const n = this.#numeral(layer, String(f.value), f.sunk ? 'gold' : 'rubric', size, true);
      const y = at.y - ease.out(s * 1.6) * size * 1.6;
      drawSprite(g, n, at.x, y, { alpha: this.#a * (1 - part(s, 0.65, 1)), scale: 1 + 0.25 * (1 - ease.out(s * 6)) });
      this.#touch(at.x, y, n.w * 1.3, n.h * 1.3);
    }
  }

  /** Loot in reach and the hold full: the hand points down at the chosen slot, the one a tap on it would give up. */
  #offer(g: CanvasRenderingContext2D, layer: ChartLayer, m: HudModel): void {
    const b = layer.layout.slots[m.selected];
    if (!b) return;
    const size = 40, w = 40, h = size + 8, tip = h - 4;
    const s = layer.sprite(`hud|hand|${size}`, w, h, w / 2, tip, (p) => hand(p, w / 2, tip, size, Math.PI / 2));
    const y = b.y - b.h / 2 - 6 - (0.5 + 0.5 * Math.sin((this.#now / 1000) * TAU * 1.2)) * 4;
    drawSprite(g, s, b.x, y, { alpha: this.#a });
    this.#rects.push({ x: b.x - w / 2 - 2, y: y - tip - 6, w: w + 4, h: h + 12 });
  }
}

/** The way round a slot's square from its top left, clockwise, `f` of the whole. */
function squareRun(b: Box, f: number): Pts {
  const d = -2, x0 = b.x - b.w / 2 - d, y0 = b.y - b.h / 2 - d, x1 = b.x + b.w / 2 + d, y1 = b.y + b.h / 2 + d;
  const corners = [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0], side = x1 - x0, out: Pts = [x0, y0];
  let left = f * (side * 2 + (y1 - y0) * 2);
  for (let i = 0; i < 8 && left > 0; i += 2) {
    const ax = corners[i], ay = corners[i + 1], bx = corners[i + 2], by = corners[i + 3], L = Math.hypot(bx - ax, by - ay);
    if (left >= L) { out.push(bx, by); left -= L; }
    else { out.push(ax + ((bx - ax) * left) / L, ay + ((by - ay) * left) / L); left = 0; }
  }
  return out;
}