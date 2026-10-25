// WP27: the chest choice (PROMPT.md, Chests and loot): a chest opened on deck offers three items and the player
// chooses one. The offers come up as three inked cards on a parchment sheet, each the item's icon in its tier's
// pigment (iron gall, verdigris, ultramarine, vermilion; the top tier framed in burnished gold leaf) glowing as the
// chest did, its name lettered in the hand, what it does, and what it means for this ship: the fitting it would replace
// in its slot, or the stack a consumable joins. A touch on a card chooses it as ShipInput.chestPick, the very index a
// captain's bestPick() would give for that card; an offer the ship cannot take (its three stores full of other kinds) is
// struck through and will not take a touch. The match never stops for the choice (the offers wait on deck until one is
// chosen, items.ts), so "Later" folds the sheet away and the chest stays on deck until the player opens it again.
import * as THREE from 'three';
import { drop, sheet, sheetMesh, type Sheet } from '../render/harbourScene.ts';
import { OFFERS, bestPick, canTake, isConsumable, worth, type Item } from '../sim/items.ts';
import type { Ship } from '../sim/state.ts';
import { CONSUMABLE, FITTING, FITTING_SLOT, LOOT, TIERS } from '../sim/tables.ts';
import { INK, TIER, consumableIcon, fittingIcon, nib, ring, wash } from './icons.ts';
import {
  GOLD_DARK, MIN_TARGET, SEPIA, VERMILION, clamp01, ease, goldLeaf, inkButton, inkRect, inset, inside, letter, rgba, safeOf, scrap, type G,
} from './inkpage.ts';
import type { Rect, View } from './safeArea.ts';
import type { Touch } from './shell.ts';

const NAME_OF: Record<string, [string, string]> = {
  stemPost: ['Stem Post', 'A ram at the bow'], ironRam: ['Iron Ram', 'A heavy ram'], cutwater: ['Cutwater', 'Cuts through trails'],
  lightGuns: ['Light Guns', 'Quick broadsides'], longGuns: ['Long Guns', 'Broadsides that reach'], swivelGuns: ['Swivel Guns', 'Close and quick'],
  chainShot: ['Chain Shot', 'Tears canvas'], heatedShot: ['Heated Shot', 'Sets fires'], sternChasers: ['Stern Chasers', 'Fire astern'],
  powderKegs: ['Powder Kegs', 'Kegs left astern'], mortar: ['Mortar', 'Lobs shells far'], spareCanvas: ['Spare Canvas', 'More sail'],
  lateenMizzen: ['Lateen Mizzen', 'Closer to the wind'], stormSails: ['Storm Sails', 'Holds in a blow'], copperSheathing: ['Copper Sheathing', 'A faster hull'],
  doubledPlanking: ['Doubled Planking', 'A stouter hull'], pumps: ['Pumps', 'Mends as it sails'], sternGlass: ['Stern Glass', 'Watches astern'],
  crowsNest: ["Crow's Nest", 'Sees farther'], lookout: ['Lookout', 'A sharp watch'], patchKit: ['Patch Kit', 'Mends the hull'],
  ward: ['Ward', 'Holds your waters'], gust: ['Gust', 'A burst of wind'], fogFlask: ['Fog Flask', 'Hides you in fog'], flare: ['Flare', 'Shows the rivals'],
};
const KEY_OF: string[] = [];
for (const [k, v] of Object.entries(FITTING)) KEY_OF[v] = k;
for (const [k, v] of Object.entries(CONSUMABLE)) KEY_OF[v] = k;

/** An item's name as lettered (FITTING or CONSUMABLE kind). */
export const itemName = (kind: number): string => NAME_OF[KEY_OF[kind] ?? '']?.[0] ?? 'Nothing';
export const itemDoes = (kind: number): string => NAME_OF[KEY_OF[kind] ?? '']?.[1] ?? '';
export const SLOT_WORDS = ['Bow', 'Broadside', 'Stern', 'Rig', 'Hull', 'Lookout'] as const;
/** By pigment tier (tables.ts), the illuminator's pigment. */
export const TIER_WORDS = ['Iron gall', 'Verdigris', 'Ultramarine', 'Vermilion', 'Gold leaf'] as const;
export const chestWords = (tier: number): string => {
  const w = TIER_WORDS[Math.max(0, Math.min(TIERS - 1, tier))];
  return `${/^[AEIOU]/.test(w) ? 'An' : 'A'} ${w.toLowerCase()} chest`;
};

/** One offer as the card shows it. */
export interface Offer {
  index: number;
  item: Item;
  name: string;
  does: string;
  consumable: boolean;
  /** SLOT for a fitting, −1 for a consumable. */
  slot: number;
  pigment: string;
  tierWord: string;
  gold: boolean;
  takeable: boolean;
  /** The fitting it would displace (dropped astern in a chest), null for an empty slot or a consumable. */
  replaces: Item | null;
  /** Consumables it brings (LOOT.count), 0 for a fitting. */
  count: number;
  worth: number;
  /** The offer a captain would take (bestPick): the first voyage marks it. */
  best: boolean;
}

/** The ship's deck offers as cards (empty when no chest is open). */
export function chestOffers(ship: Ship): Offer[] {
  const best = bestPick(ship);
  return ship.offer.map((item, index) => {
    const consumable = isConsumable(item.kind), slot = consumable ? -1 : FITTING_SLOT[item.kind], held = consumable ? null : ship.fittings[slot];
    return {
      index, item: { kind: item.kind, tier: item.tier }, name: itemName(item.kind), does: itemDoes(item.kind), consumable, slot,
      pigment: TIER[item.tier] ?? INK, tierWord: TIER_WORDS[item.tier] ?? '', gold: item.tier >= TIERS - 1, takeable: canTake(ship, item),
      replaces: held && held.kind !== FITTING.none ? { kind: held.kind, tier: held.tier } : null,
      count: consumable ? LOOT.count[item.tier] : 0, worth: worth(ship, item), best: index === best,
    };
  });
}

/** What taking it means for this ship, in a few words. */
export function consequence(o: Offer): string {
  if (!o.takeable) return 'Your stores are full';
  if (o.consumable) return `${o.count} to your stores`;
  return o.replaces ? `In place of ${itemName(o.replaces.kind)}` : `Fills the ${SLOT_WORDS[o.slot].toLowerCase()}`;
}

/** The touch on card k as ShipInput.chestPick: k when the ship can take it, else −1 (no choice). */
export const chestPick = (offers: readonly Offer[], k: number): number => (offers[k]?.takeable ? k : -1);

export interface ChestLayout {
  view: View;
  sheet: Rect;
  cards: Rect[];
  later: Rect;
  /** Scale of the lettering and rules, 1 on the iPhone. */
  k: number;
}

/** The sheet centred in the safe area, the cards side by side, "Later" beneath. */
export function chestLayout(view: View, n: number = OFFERS): ChestLayout {
  const s = safeOf(view), w = Math.min(s.width - 16, Math.max(560, s.height * 1.9), 940), h = Math.min(s.height - 12, w * 0.55);
  const k = Math.max(1, Math.min(1.5, h / 408)), x = s.x + (s.width - w) / 2, y = s.y + (s.height - h) / 2;
  const top = 64 * k, bottom = 66 * k, gap = 16 * k, pad = 22 * k, cw = (w - 2 * pad - (n - 1) * gap) / n, ch = h - top - bottom;
  const cards = Array.from({ length: n }, (_, i) => ({ x: x + pad + i * (cw + gap), y: y + top, width: cw, height: ch }));
  const bw = 180 * k, bh = Math.max(MIN_TARGET, 48 * k);
  return { view, sheet: { x, y, width: w, height: h }, cards, later: { x: x + (w - bw) / 2, y: y + h - bottom + (bottom - bh) / 2, width: bw, height: bh }, k };
}

/** What a touch at (x, y) lands on: a card's index, −2 "Later", −1 nothing. */
export function pickAt(l: ChestLayout, x: number, y: number): number {
  if (inside(l.later, x, y)) return -2;
  return l.cards.findIndex((c) => inside(c, x, y));
}

/** The whole choice as it stands `t` s after the chest opened: the sheet unfolds, the cards ink in one by one. */
export function drawChestChoice(g: G, offers: readonly Offer[], l: ChestLayout, t: number, chosen = -1, hint = false): void {
  const { sheet: s, k } = l, top = offers.reduce((m, o) => Math.max(m, o.item.tier), 0);
  const open = ease(t / 0.4);
  if (open <= 0) return;
  scrap(g, s, 7001, { alpha: open });
  inkRect(g, inset(s, 8 * k), 7002, clamp01(t / 0.7), SEPIA, 1.3 * k);
  if (top >= TIERS - 1) goldLeaf(g, inset(s, 2 * k), 7003, clamp01((t - 0.2) / 0.8), 4 * k);
  letter(g, 'Choose one', s.x + s.width / 2, s.y + 30 * k, { size: 32 * k, align: 'center', valign: 'middle', swash: true }, INK, clamp01((t - 0.1) / 0.8));
  letter(g, chestWords(top), s.x + s.width / 2, s.y + 54 * k, { size: 14 * k, align: 'center', valign: 'middle' }, top >= TIERS - 1 ? GOLD_DARK : TIER[top] ?? SEPIA, clamp01((t - 0.5) / 0.6));
  offers.forEach((o, i) => { if (l.cards[i]) drawCard(g, o, l.cards[i], t - 0.25 - i * 0.18, chosen, k, hint); });
  inkButton(g, l.later, 'Later', k, chosen >= 0 ? 0 : clamp01((t - 0.9) / 0.5));
}

function drawCard(g: G, o: Offer, r: Rect, t: number, chosen: number, k: number, hint: boolean): void {
  if (t <= 0) return;
  const a = ease(t / 0.5), mine = chosen === o.index, dim = chosen >= 0 && !mine ? 0.3 : 1;
  const c = { x: r.x, y: r.y + (mine ? -8 * k : (1 - a) * 14 * k), width: r.width, height: r.height };
  const cx = c.x + c.width / 2, s = Math.min(c.width * 0.42, c.height * 0.36), iy = c.y + 18 * k + s * 0.62;
  g.save();
  g.globalAlpha *= a * dim * (o.takeable ? 1 : 0.62);
  const glow = g.createRadialGradient(cx, iy, 4, cx, iy, c.width * (mine ? 0.9 : 0.7));
  glow.addColorStop(0, rgba(o.pigment, o.item.tier === 0 ? 0.12 : 0.38));
  glow.addColorStop(1, rgba(o.pigment, 0));
  g.fillStyle = glow;
  g.fillRect(c.x - c.width * 0.3, c.y - 20 * k, c.width * 1.6, c.height * 0.9);
  scrap(g, c, 9100 + o.index * 37 + o.item.kind, { tint: '#f4e9d0' });
  if (o.gold) goldLeaf(g, c, 9200 + o.index, clamp01(t / 0.8));
  else inkRect(g, inset(c, 5 * k), 9300 + o.index, clamp01(t / 0.8), o.pigment, 1.8 * k);
  wash(g, o.pigment, 0.16, (gg) => { gg.beginPath(); gg.arc(cx, iy, s * 0.62, 0, Math.PI * 2); });
  nib(g, ring(cx, iy, s * 0.62, 31 + o.item.kind), 1.2 * k, clamp01((t - 0.1) / 0.6), o.gold ? GOLD_DARK : o.pigment);
  const pi = clamp01((t - 0.15) / 0.6);
  if (o.consumable) consumableIcon(g, o.item.kind, cx, iy, s * 0.42, pi); // icons.ts sizes are half-extents
  else fittingIcon(g, o.slot, o.item.kind, o.item.tier, cx, iy, s * 0.42, pi);
  const ny = iy + s * 0.55 + 20 * k, pt = clamp01((t - 0.3) / 0.8), wmax = c.width - 24 * k;
  letter(g, o.name, cx, ny, { size: 23 * k, align: 'center', valign: 'middle', maxWidth: wmax }, INK, pt);
  letter(g, o.consumable ? `${o.tierWord}, ${o.count} uses` : `${o.tierWord}, the ${SLOT_WORDS[o.slot].toLowerCase()}`, cx, ny + 24 * k,
    { size: 14 * k, align: 'center', valign: 'middle', maxWidth: wmax }, o.gold ? GOLD_DARK : o.item.tier === 0 ? SEPIA : o.pigment, pt);
  letter(g, o.does, cx, ny + 46 * k, { size: 14.5 * k, align: 'center', valign: 'middle', maxWidth: wmax }, SEPIA, pt);
  letter(g, consequence(o), cx, c.y + c.height - 22 * k, { size: 13.5 * k, align: 'center', valign: 'middle', maxWidth: wmax }, o.takeable ? INK : VERMILION, pt);
  if (!o.takeable) nib(g, [[c.x + 16 * k, ny + 2 * k], [cx, ny - 3 * k], [c.x + c.width - 16 * k, ny + 1 * k]], 2 * k, pt, VERMILION);
  if (hint && o.best && chosen < 0) {
    const fx = c.x + c.width - 22 * k, fy = c.y + 22 * k; // the gull's mark: a small eight-point star in gold
    for (let i = 0; i < 4; i++) {
      const an = (i * Math.PI) / 4;
      nib(g, [[fx - Math.cos(an) * 9 * k, fy - Math.sin(an) * 9 * k], [fx + Math.cos(an) * 9 * k, fy + Math.sin(an) * 9 * k]], 1.6 * k, pt, GOLD_DARK);
    }
  }
  g.restore();
}

export type ChestCue = 'page' | 'tap' | 'confirm' | 'back';

/**
 * The choice in the match: watches the player's ship each tick and unfolds the sheet when a chest opens on its deck;
 * the chosen offer goes out once through take() as ShipInput.chestPick. Never pauses the match.
 */
export class ChestChoice {
  readonly group = new THREE.Group();
  private sheet: Sheet | null = null;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private offers: Offer[] = [];
  private view: View | null = null;
  private l: ChestLayout | null = null;
  private t = 0;
  private since = 0;
  private chosen = -1;
  private pick = -1;
  private shown = false;
  private stowed = false;

  private readonly cue: (c: ChestCue) => void;
  private readonly hint: boolean;

  constructor(cue: (c: ChestCue) => void = () => {}, hint = false) {
    this.cue = cue;
    this.hint = hint;
  }

  get open(): boolean { return this.shown; }
  /** A chest waits on deck, folded away by "Later" (the HUD shows it; reopen() unfolds it). */
  get waiting(): boolean { return this.stowed; }

  watch(ship: Ship): void {
    const has = ship.offer.length > 0;
    if (has && !this.shown && !this.stowed && this.chosen < 0) this.show(ship);
    else if (!has && this.shown && this.chosen < 0) this.hide();
    if (!has && !this.shown) {
      this.chosen = -1;
      this.stowed = false;
    }
  }

  reopen(): void {
    if (!this.stowed || this.offers.length === 0) return;
    this.stowed = false;
    this.shown = true;
    this.t = 1;
    this.cue('page');
    this.rebuild();
  }

  layout(view: View): void {
    this.view = view;
    this.rebuild();
  }

  /** True when the sheet took the touch. */
  touch(t: Touch): boolean {
    if (!this.shown || this.l === null) return false;
    if (t.phase !== 'up') return true;
    const k = pickAt(this.l, t.x, t.y);
    if (k === -2 && this.chosen < 0) {
      this.stowed = true;
      this.hide();
      this.cue('back');
    } else if (k >= 0 && this.chosen < 0) {
      const p = chestPick(this.offers, k);
      if (p >= 0) {
        this.chosen = this.pick = p;
        this.since = 0;
        this.cue('confirm');
      } else this.cue('tap');
    }
    return true;
  }

  /** The chosen offer as ShipInput.chestPick, once; −1 when none waits. */
  take(): number {
    const p = this.pick;
    this.pick = -1;
    return p;
  }

  frame(dt: number): void {
    if (!this.shown) return;
    this.t += dt;
    this.since += dt;
    if (this.chosen >= 0 && this.since > 0.7) this.hide();
    else if (this.t < 2.4 || this.chosen >= 0) this.redraw();
  }

  dispose(): void { this.hide(); }

  private show(ship: Ship): void {
    this.offers = chestOffers(ship);
    this.t = 0;
    this.chosen = -1;
    this.shown = true;
    this.cue('page');
    this.rebuild();
  }

  private rebuild(): void {
    drop(this.group);
    this.mesh = this.sheet = null;
    if (!this.shown || this.view === null) return;
    const l = this.l = chestLayout(this.view, Math.max(1, this.offers.length));
    this.sheet = sheet(l.sheet.width, l.sheet.height, 2_000_000, this.view.dpr);
    this.mesh = sheetMesh(this.sheet);
    this.mesh.position.set(l.sheet.x + l.sheet.width / 2, l.sheet.y + l.sheet.height / 2, 0);
    this.mesh.renderOrder = 30;
    this.group.add(this.mesh);
    this.redraw();
  }

  private redraw(): void {
    const s = this.sheet, l = this.l, m = this.mesh;
    if (!s || !l || !m) return;
    s.g.clearRect(0, 0, s.w, s.h);
    s.g.save();
    s.g.translate(-l.sheet.x, -l.sheet.y);
    drawChestChoice(s.g, this.offers, l, this.t, this.chosen, this.hint);
    s.g.restore();
    if (m.material.map) m.material.map.needsUpdate = true;
  }

  private hide(): void {
    this.shown = false;
    drop(this.group);
    this.mesh = this.sheet = null;
  }
}
