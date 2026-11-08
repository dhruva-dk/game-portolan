// The folios and the settings (issue #54): one sheet of parchment, docked on the right of the lobby, its top under the
// settings' wheel and everything it covers but PLAY left showing. It unrolls from the right over the lobby and rolls
// back by a tap on its tab or anywhere outside it; a tab pressed while another folio is open changes what is on the
// sheet, which stays. Behind it the ship stays live, and a card pressed is worn at once.
//
// What a folio holds is a tall strip of items, each baked once to a sprite the first time it shows, drawn inside a
// window on the sheet and dragged up and down by a finger with a little momentum. Only what shows is drawn; only what
// shows far enough to be pressed is offered to be pressed, its hit clipped to the window, so a finger on a card
// half-rolled under the frame still drags. The worn seal and the settings' bars are the only things drawn on top each
// frame.
import {
  Press, bakeSeal, drawSeal, drawSprite, ease, figure, pressLook, prims, unroll, woodcut,
  type Baked, type ChartLayer, type Illumination, type InkName, type Pen, type Pressable, type Rect, type Seal, type Sprite,
} from '../chart/index.ts';
import { clamp } from '../chart/noise.ts';
import type { AbilityId } from '../sim/abilities.ts';
import type { AbilitiesModel, CosmeticView, LockerModel, RankModel, RivalsModel, Settings } from '../ui/model.ts';
import { effect } from '../ui/parts/feedback.ts';
import { TIER_ILLUMINATION, card, cosmeticArt, kindArt, rarityInk, type Art } from './cards.ts';

/** The folios the tabs unroll. */
export type Folio = 'abilities' | 'locker' | 'rank' | 'rivals';
/** What the sheet can hold. */
export type SheetName = Folio | 'settings';

/** What a sheet asks of the game: the career as its models draw it, and the changes it makes. */
export interface SheetHost {
  abilities(): AbilitiesModel;
  locker(): LockerModel;
  rank(): RankModel;
  rivals(): RivalsModel;
  settings(): Settings;
  equipAbility(id: AbilityId): void;
  equipCosmetic(id: string): void;
  setSettings(s: Partial<Settings>): void;
}

/** One thing in a folio's strip. */
interface Item {
  id: string;
  /** Top left on the strip, and its size. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bakes its image, the first time it shows. */
  bake?: () => Sprite;
  sprite?: Sprite;
  /** How it takes a finger, if it does: the press and what it does with it. */
  take?: Omit<Pressable, 'id' | 'hit'>;
  /** Drawn every frame over the sprite, at (x, y) its top left on the screen. */
  live?: (g: CanvasRenderingContext2D, pen: Pen, x: number, y: number, alpha: number) => void;
}

interface Body {
  items: Item[];
  height: number;
  /** The ids worn now, for the corner seals. */
  worn?: () => readonly string[];
}

interface Frame {
  /** The sheet, and the window the strip shows through, by their top left. */
  S: Rect;
  W: Rect;
  paper: Baked;
}

/** How long the sheet takes to unroll or roll back, how long a change of folio takes to ink in. */
const ROLL = 0.4;
const INK_IN = 0.16;
/** The window's inset from the sheet's edge: inside the ruled frame. */
const IN = 40;
/** Room round a card's bake for its shadow. */
const PAD = 12;
/** The cards' gaps and the smallest a card may be. */
const GAP = 12;
const CARD_MIN = 104;
/** The worn seal's size. */
const WORN = 26;
/** How much of a press's touch target has to show before it can be pressed. */
const TARGET = 56;

export class Sheets {
  readonly #layer: ChartLayer;
  readonly #h: SheetHost;
  /** The lobby's pressables are put back over the backdrop. */
  readonly #raise: () => void;
  readonly #close: () => void;
  #g: Frame | null = null;
  #name: SheetName | null = null;
  #body: Body | null = null;
  /** How far it is unrolled, 0..1. */
  #t = 0;
  /** The last frame, and when a change of folio began to ink in (ms; -1 none). */
  #last = -1;
  #bodyAt = -1;
  #scroll = 0;
  #was = 0;
  #vel = 0;
  #finger = -1;
  #fy = 0;
  /** What is worn, and the card just stamped and when. */
  #worn = new Set<string>();
  #stampId = '';
  #stampAt = -1e9;
  /** The press for the outside of the sheet, and what each item that shows has offered. */
  readonly #backdrop: Pressable;
  readonly #placed = new Map<string, Pressable>();
  readonly #seals = new Map<string, Seal>();

  constructor(layer: ChartLayer, h: SheetHost, raise: () => void, close: () => void) {
    this.#layer = layer;
    this.#h = h;
    this.#raise = raise;
    this.#close = close;
    this.#backdrop = {
      id: 'folio:outside', hit: { x: 0, y: 0, w: 1, h: 1 }, press: new Press(), sound: 'none', haptic: 'none', scrolls: true,
      act: (x, y) => {
        if (this.takes(x, y) || !this.#name) return;
        effect('folio:close', 'close', 'none');
        this.#close();
      },
    };
  }

  /** What is on the sheet now. */
  get name(): SheetName | null {
    return this.#name;
  }

  /** Whether (x, y) is on the sheet, unrolled or going. */
  takes(x: number, y: number): boolean {
    const g = this.#g;
    return !!g && !!this.#body && x >= g.S.x && x <= g.S.x + g.S.w && y >= g.S.y && y <= g.S.y + g.S.h;
  }

  /** Laid out for the screen, and the sheet baked; whatever was on it, drawn again to fit. */
  lay(): void {
    const b = this.#layer.layout.lobby.sheet, S = { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h };
    this.#g = { S, W: { x: S.x + IN, y: S.y + IN, w: S.w - IN * 2, h: S.h - IN * 2 }, paper: this.#layer.sheet('folio', S.w, S.h, 31) };
    const hit = this.#backdrop.hit as { x: number; y: number; w: number; h: number }, l = this.#layer.layout;
    hit.x = l.w / 2;
    hit.y = l.h / 2;
    hit.w = l.w;
    hit.h = l.h;
    if (this.#name) this.#fill(this.#name);
  }

  /** Puts `name` on the sheet, unrolling it if it was rolled up; null rolls it back. */
  show(name: SheetName | null, now: number): void {
    if (name === this.#name) return;
    this.#unpress();
    if (!name) {
      this.#name = null;
      return;
    }
    const was = this.#body && this.#t > 0.2;
    this.#name = name;
    this.#last = this.#last < 0 ? now : this.#last;
    this.#layer.presses.add(this.#backdrop);
    this.#raise();
    this.#fill(name);
    this.#scroll = this.#was = 0;
    this.#vel = 0;
    this.#finger = -1;
    this.#bodyAt = was ? now : -1;
    this.#place();
  }

  /** Takes everything back at once (the lobby has gone). */
  dispose(): void {
    this.#unpress();
    this.#name = null;
    this.#body = null;
    this.#t = 0;
    this.#last = -1;
  }

  // ── the finger on the sheet ──

  down(id: number, _x: number, y: number): void {
    if (this.#finger >= 0) return;
    this.#finger = id;
    this.#fy = y;
    this.#vel = 0;
  }

  move(id: number, _x: number, y: number): void {
    if (id !== this.#finger) return;
    this.#scrollTo(this.#scroll - (y - this.#fy));
    this.#fy = y;
  }

  up(id: number): void {
    if (id === this.#finger) this.#finger = -1;
  }

  #scrollTo(v: number): void {
    const b = this.#body, g = this.#g;
    if (!b || !g) return;
    const max = Math.max(0, b.height - g.W.h);
    const s = clamp(v / (max || 1)) * max;
    if (s === this.#scroll) return;
    this.#scroll = s;
    this.#place();
  }

  // ── what is on it ──

  /** Builds the sheet's strip for what is on it now. */
  #fill(name: SheetName): void {
    this.#body = name === 'abilities' ? this.#abilities() : name === 'locker' ? this.#locker() : { items: [], height: 0 };
    this.#refresh();
  }

  /** Reads what is worn after a change. */
  #refresh(): void {
    this.#worn = new Set(this.#body?.worn?.() ?? []);
  }

  /** A press on a card: wears it, stamps its seal, and the ship behind has changed. */
  #wear(id: string, change: () => void): void {
    change();
    this.#refresh();
    if (this.#worn.has(id)) {
      this.#stampId = id;
      this.#stampAt = this.#last;
    }
  }

  #seal(ill: Illumination, size: number, device: 'star' | 'rose' = 'star', seed = 13): Seal {
    const key = `${ill}|${size}|${device}|${seed}`;
    let s = this.#seals.get(key);
    if (!s) {
      s = bakeSeal(this.#layer.paper, this.#layer.layout.widths, ill, { size, dpr: this.#layer.dpr, device, seed });
      this.#seals.set(key, s);
    }
    return s;
  }

  /** A sprite of size w × h, plus room for a shadow, anchored at its centre. */
  #bake(key: string, w: number, h: number, draw: (pen: Pen, gc: CanvasRenderingContext2D, cx: number, cy: number) => void): Sprite {
    const cx = w / 2 + PAD, cy = h / 2 + PAD;
    return this.#layer.sprite(`folio|${this.#layer.layout.cls}|${key}|${w}|${h}`, Math.ceil(w + PAD * 2), Math.ceil(h + PAD * 2), cx, cy, (pen, gc) => draw(pen, gc, cx, cy));
  }

  /** A card on the strip. */
  #card(id: string, x: number, y: number, w: number, h: number, o: {
    edge: InkName; locked: boolean; key: string; art: Art; seed: number; act: () => void;
    unlock?: (pen: Pen, gc: CanvasRenderingContext2D, x: number, y: number) => void;
  }): Item {
    const unlock = o.unlock ?? (() => {});
    return {
      id, x, y, w, h,
      bake: () => this.#bake(`card|${o.key}|${o.locked}`, w, h, (pen, gc, cx, cy) => card(pen, gc, cx, cy, { w, h, edge: o.edge, locked: o.locked, art: o.art, seed: o.seed, unlock })),
      take: { press: new Press(), sound: 'equip', haptic: 'medium', scrolls: true, disabled: o.locked, act: o.act },
    };
  }

  /** Lays `list` in a grid of cards `cols` across from strip height `y`; returns the height below it. */
  #grid<T>(items: Item[], list: readonly T[], cols: number, y: number, ratio: number, make: (v: T, x: number, y: number, w: number, h: number) => Item): number {
    const W = this.#g!.W.w, cw = Math.floor((W - GAP * (cols - 1)) / cols), ch = Math.round(cw * ratio);
    list.forEach((v, i) => items.push(make(v, (cw + GAP) * (i % cols), y + (ch + GAP) * Math.floor(i / cols), cw, ch)));
    return list.length ? y + (ch + GAP) * Math.ceil(list.length / cols) : y;
  }

  /** How many cards fit across at their smallest. */
  #cols(min = CARD_MIN): number {
    return Math.max(2, Math.floor((this.#g!.W.w + GAP) / (min + GAP)));
  }

  /** A section's head: its mark and a hairline running from it across the strip. */
  #head(items: Item[], id: string, y: number, mark: Art): number {
    const W = this.#g!.W.w, h = 34;
    items.push({
      id: `head:${id}`, x: 0, y, w: W, h,
      bake: () => this.#bake(`head|${id}`, W, h, (pen, _gc, cx, cy) => {
        mark(pen, cx - W / 2 + 16, cy, 30, 0.95);
        pen.rule([[cx - W / 2 + 40, cy + 8, cx + W / 2, cy + 8]], { w: 'hair', alpha: 0.5, seed: 91 });
      }),
    });
    return y + h + 6;
  }

  // ── abilities ──

  /** Two rows, actives over passives, each worn one with its seal. */
  #abilities(): Body {
    const m = this.#h.abilities(), items: Item[] = [], cols = this.#cols(150);
    let y = 0;
    const row = (kind: 'active' | 'passive', head: string) => {
      y = this.#head(items, `ability-${kind}`, y, (pen, x, yy, s, a) => woodcut(pen, prims(head), x, yy, s, 'iron', a));
      y = this.#grid(items, m.abilities.filter((v) => v.kind === kind), cols, y, 1.08, (v, x, ky, w, h) => this.#card(v.id, x, ky, w, h, {
        edge: 'iron', locked: !v.unlocked, key: `ability-${v.id}`, seed: 201 + items.length,
        art: (pen, cx, cy, s, a) => woodcut(pen, prims(`ability.${v.id}`), cx, cy, s, 'iron', a),
        unlock: (pen, _gc, cx, uy) => this.#levelMark(pen, cx, uy, v.level, h),
        act: () => this.#wear(v.id, () => this.#h.equipAbility(v.id)),
      })) + 14;
    };
    row('active', 'menu.burst');
    row('passive', 'hud.lantern');
    return { items, height: y, worn: () => { const n = this.#h.abilities(); return [n.active, n.passive]; } };
  }

  /** A locked card's level: its numeral. */
  #levelMark(pen: Pen, x: number, y: number, level: number, cardH: number): void {
    figure(pen, String(level), x, y + cardH * 0.09, cardH * 0.18, { align: 'center', alpha: 0.72, seed: level });
  }

  // ── the locker ──

  /** A card from the locker's model, for the locker and the rank folio's rewards. */
  #cosmetic(v: CosmeticView, x: number, y: number, w: number, h: number, seed: number): Item {
    return this.#card(v.id, x, y, w, h, {
      edge: rarityInk(v.rarity), locked: !v.unlocked, key: `cos-${v.id}`, seed, art: cosmeticArt(v),
      unlock: (pen, gc, cx, uy) => {
        if (v.unlock.by === 'level') this.#levelMark(pen, cx, uy, v.unlock.level, h);
        else drawSeal(gc, this.#seal(TIER_ILLUMINATION[v.unlock.tier], 26), cx, uy, { phase: 0.5 });
      },
      act: () => this.#wear(v.id, () => this.#h.equipCosmetic(v.id)),
    });
  }

  #locker(): Body {
    const m = this.#h.locker(), items: Item[] = [], cols = this.#cols();
    let y = 0;
    for (const kind of ['sailColour', 'sailPattern', 'hullPaint', 'figurehead', 'emblem', 'wake'] as const) {
      y = this.#head(items, kind, y, kindArt[kind]);
      y = this.#grid(items, m.cosmetics.filter((c) => c.kind === kind), cols, y, 1.2, (v, x, ky, w, h) => this.#cosmetic(v, x, ky, w, h, 301 + items.length)) + 14;
    }
    return { items, height: y, worn: () => Object.values(this.#h.locker().look) };
  }

  // ── what shows ──

  /** Offers what shows to be pressed, each hit clipped to the window; takes back what has gone. */
  #place(): void {
    const b = this.#body, g = this.#g;
    if (!b || !g || !this.#name) return;
    const { W } = g, presses = this.#layer.presses, scroll = this.#scroll;
    for (const it of b.items) {
      if (!it.take) continue;
      const pid = `folio:${it.id}`, placed = this.#placed.get(pid);
      const y0 = Math.max(W.y, W.y + it.y - scroll), y1 = Math.min(W.y + W.h, W.y + it.y + it.h - scroll);
      if (y1 - y0 < Math.min(TARGET, it.h - 1)) {
        if (placed) {
          presses.remove(pid);
          this.#placed.delete(pid);
        }
        continue;
      }
      const hit = { x: W.x + it.x + it.w / 2, y: (y0 + y1) / 2, w: it.w, h: y1 - y0 };
      if (placed) placed.hit = hit;
      else this.#placed.set(pid, presses.add({ id: pid, hit, ...it.take }));
    }
  }

  #unpress(): void {
    const presses = this.#layer.presses;
    for (const id of this.#placed.keys()) presses.remove(id);
    this.#placed.clear();
    presses.remove(this.#backdrop.id);
  }

  /** One frame of the sheet, over the lobby: returns where it drew, or null if it is rolled up. */
  frame(gc: CanvasRenderingContext2D, now: number): Rect | null {
    const g = this.#g, body = this.#body;
    if (!g || !body) return null;
    const dt = this.#last < 0 ? 1 / 30 : clamp((now - this.#last) / 1000, 0, 0.1);
    this.#last = now;
    const target = this.#name ? 1 : 0;
    this.#t = target > this.#t ? Math.min(target, this.#t + dt / ROLL) : Math.max(target, this.#t - dt / ROLL);
    if (this.#t <= 0 && !this.#name) {
      this.#body = null;
      this.#last = -1;
      return null;
    }
    const layer = this.#layer, pen = layer.pen, { S, W, paper } = g;
    unroll(gc, pen.paper, paper, S.x, S.y, this.#t, 'left', layer.dpr);
    // the finger's speed, and what it left behind it when it let go
    if (this.#finger >= 0) this.#vel += ((this.#scroll - this.#was) / Math.max(dt, 1e-3) - this.#vel) * 0.4;
    else if (Math.abs(this.#vel) > 4) {
      this.#scrollTo(this.#scroll + this.#vel * dt);
      this.#vel *= Math.exp(-5 * dt);
    } else this.#vel = 0;
    this.#was = this.#scroll;
    const edge = S.x + S.w - S.w * ease.out(this.#t) + 16, x0 = Math.max(W.x, edge);
    gc.save();
    gc.beginPath();
    gc.rect(x0, W.y, W.x + W.w - x0, W.h);
    gc.clip();
    const fade = this.#bodyAt < 0 ? 1 : ease.out(clamp((now - this.#bodyAt) / 1000 / INK_IN));
    let budget = 8;
    for (const it of body.items) {
      const y = W.y + it.y - this.#scroll;
      if (y + it.h < W.y - 4 || y > W.y + W.h + 4) continue;
      if (!it.sprite && it.bake && budget-- > 0) it.sprite = it.bake();
      const x = W.x + it.x, look = pressLook(it.take?.press.sink ?? 0);
      if (it.sprite) drawSprite(gc, it.sprite, x + it.w / 2, y + it.h / 2 + look.dy, { scale: look.scale, dark: look.dark, alpha: fade });
      it.live?.(gc, pen, x, y, fade);
      if (this.#worn.has(it.id)) {
        const k = it.id === this.#stampId ? clamp((now - this.#stampAt) / 250) : 1;
        drawSeal(gc, this.#seal('gold', WORN), x + it.w - WORN * 0.72, y + WORN * 0.72, { phase: 0.5, scale: 1 + 0.5 * (1 - ease.back(k)), alpha: fade * clamp(k * 3) });
      }
    }
    gc.restore();
    return { x: S.x - paper.pad, y: S.y - paper.pad, w: S.w + paper.pad * 2, h: S.h + paper.pad * 2 };
  }
}
