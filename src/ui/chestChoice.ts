// WP27: the chest choice (PROMPT.md, Chests and loot): a chest opened on deck offers three items and the player
// chooses one. The offers come up as three inked cards on a parchment sheet, each the item's icon in its tier's
// pigment (iron gall, verdigris, ultramarine, vermilion; the top tier framed in burnished gold leaf) glowing as the
// chest did, its name lettered in the hand, what it does, and what it means for this ship: the fitting it would replace
// in its slot, or the stack a consumable joins. A touch on a card chooses it as ShipInput.chestPick, the very index a
// captain's bestPick() would give for that card; an offer the ship cannot take (its three stores full of other kinds) is
// struck through and will not take a touch. The match never stops for the choice (the offers wait on deck until one is
// chosen, items.ts), so "Later" folds the sheet away and the chest stays on deck until the player opens it again from
// a chip beside the compact chart: the chest in its tier's pigment, glowing (part B). The sheet takes only the touches
// that land on its cards or "Later"; a thumb on the stick steers on beneath it.
import * as THREE from 'three';
import { drop, sheet, sheetMesh, type Sheet } from '../render/harbourScene.ts';
import { OFFERS, bestPick, canTake, isConsumable, worth, type Item } from '../sim/items.ts';
import type { Ship } from '../sim/state.ts';
import { CONSUMABLE, FITTING, FITTING_SLOT, LOOT, SLOT, TIERS } from '../sim/tables.ts';
import { INK, TIER, consumableIcon, mortarIcon, nib, ring, wash } from './icons.ts';
import {
  GOLD_DARK, MIN_TARGET, OCHRE, PAPER, SEPIA, VERMILION, clamp01, ease, goldLeaf, inkButton, inkRect, inset, inside, letter, quad, rgba, safeOf, scrap, type G, type Pt,
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
  else cardIcon(g, o.slot, o.item.tier, cx, iy, s * 0.42, pi);
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

/** A fitting as the card engraves it, `h` its half-extent: the slot's thing drawn in fine line over a light wash of the
 *  tier's pigment, its shade hatched (the HUD's small glyphs, icons.ts, would read as flat signs at this size). */
function cardIcon(g: G, slot: number, tier: number, x: number, y: number, h: number, p: number): void {
  if (p <= 0) return;
  const w = 0.07 * h, P = (u: number, v: number): Pt => [x + u * h, y + v * h], line = (pts: Pt[], k = 1): void => nib(g, pts, w * k, p);
  const shade = (path: (q: G) => void, n = 7): void => { // diagonal hatching inside a shape
    g.save();
    g.beginPath();
    path(g);
    g.clip();
    for (let i = 0; i < n * 2; i++) { const u = -1 + i / n; nib(g, [P(u - 0.4, 1), P(u + 0.4, -1)], w * 0.45, p, INK, 0.5); }
    g.restore();
  };
  wash(g, tier === 0 ? '#8a8178' : TIER[tier], 0.28 * p, (q) => q.arc(x, y, 0.95 * h, 0, Math.PI * 2));
  const fill = (pts: Pt[]) => (q: G): void => { q.moveTo(...pts[0]); for (const pt of pts) q.lineTo(...pt); q.closePath(); };
  switch (slot) {
    case SLOT.hull: { // the hull in profile, planked, its sheathing plated below the waterline
      const keel = [...quad(P(0.85, -0.32), P(0.6, 0.5), P(0.05, 0.48), 10), ...quad(P(0.05, 0.48), P(-0.55, 0.48), P(-0.82, -0.18), 10)];
      wash(g, OCHRE, 0.5 * p, fill(keel));
      shade(fill([P(-0.75, 0.08), P(0.8, 0.02), ...keel.slice(4, 18)]), 8);
      line(keel, 1.4);
      line([P(-0.82, -0.18), P(0.85, -0.32)], 1.4);
      line(quad(P(-0.8, -0.04), P(0.1, 0.0), P(0.8, -0.14), 8), 0.7);
      line(quad(P(-0.75, 0.08), P(0.1, 0.12), P(0.78, 0.02), 8), 1);
      for (let i = 0; i < 6; i++) { const u = -0.5 + i * 0.2; line([P(u, 0.12), P(u + 0.02, 0.4)], 0.55); }
      line([P(-0.1, -0.24), P(-0.1, -0.9)], 0.9);
      break;
    }
    case SLOT.broadside: { // a long gun on its carriage
      const barrel = [P(-0.75, -0.05), P(0.82, -0.3), P(0.84, -0.12), P(-0.72, 0.2)];
      wash(g, INK, 0.25 * p, fill(barrel));
      shade(fill([P(-0.73, 0.08), P(0.83, -0.21), P(0.84, -0.12), P(-0.72, 0.2)]), 6);
      line([...barrel, barrel[0]], 1.2);
      line(ring(x - 0.8 * h, y + 0.07 * h, 0.11 * h, 3), 1);
      for (const u of [-0.25, 0.35]) line([P(u, -0.02 - (u + 0.75) * 0.16), P(u + 0.01, 0.12 - (u + 0.75) * 0.17)], 1.3);
      line([P(-0.62, 0.22), P(-0.55, 0.5), P(0.4, 0.5), P(0.35, 0.05)], 1);
      for (const u of [-0.42, 0.24]) { line(ring(x + u * h, y + 0.55 * h, 0.2 * h, 5), 1.1); line([P(u - 0.2, 0.55), P(u + 0.2, 0.55)], 0.5); }
      break;
    }
    case SLOT.bow: { // a ram's beak, banded
      const beak = [P(-0.8, -0.42), P(0.88, 0.02), P(-0.8, 0.44)];
      wash(g, tier === 0 ? '#8a8178' : TIER[tier], 0.45 * p, fill(beak));
      shade(fill([P(-0.8, 0.02), P(0.88, 0.02), P(-0.8, 0.44)]), 6);
      line([...beak], 1.3);
      line([P(-0.8, 0.02), P(0.88, 0.02)], 0.6);
      for (const u of [-0.45, -0.1]) line([P(u, -0.42 + (u + 0.8) * 0.25 + 0.01), P(u, 0.44 - (u + 0.8) * 0.25 - 0.01)], 1.2);
      line([P(-0.8, -0.6), P(-0.8, 0.62)], 1.4);
      break;
    }
    case SLOT.stern: mortarIcon(g, x, y, h * 0.8, p, tier); break;
    case SLOT.rig: { // a mast and its course, bellied by the wind
      const sail = [...quad(P(-0.55, -0.55), P(-0.2, -0.15), P(-0.5, 0.3), 8), ...quad(P(0.5, 0.3), P(0.85, -0.15), P(0.55, -0.55), 8)];
      wash(g, PAPER, 0.85 * p, fill(sail));
      shade(fill([P(0.15, -0.55), ...quad(P(0.55, -0.55), P(0.85, -0.15), P(0.5, 0.3), 8), P(0.15, 0.3)]), 6);
      line([...sail, sail[0]], 1);
      line([P(0, -0.9), P(0, 0.85)], 1.5);
      line([P(-0.62, -0.56), P(0.62, -0.56)], 1.2);
      line([P(-0.56, 0.31), P(0.56, 0.31)], 1.2);
      wash(g, VERMILION, 0.8 * p, fill([P(0, -0.9), P(0.42, -0.8), P(0, -0.72)]));
      break;
    }
    default: { // the lookout's glass, drawn out
      const tube = (a: number, b: number, r0: number, r1: number): Pt[] => [P(a, 0.4 - (a + 0.8) * 0.5 - r0), P(b, 0.4 - (b + 0.8) * 0.5 - r1), P(b, 0.4 - (b + 0.8) * 0.5 + r1), P(a, 0.4 - (a + 0.8) * 0.5 + r0)];
      for (const [a, b, r0, r1] of [[-0.8, -0.25, 0.1, 0.12], [-0.25, 0.25, 0.14, 0.16], [0.25, 0.8, 0.19, 0.24]] as const) {
        const t = tube(a, b, r0, r1);
        wash(g, OCHRE, 0.45 * p, fill(t));
        shade(fill([t[3], t[2], P(b, 0.4 - (b + 0.8) * 0.5), P(a, 0.4 - (a + 0.8) * 0.5)]), 5);
        line([...t, t[0]], 1.1);
      }
      break;
    }
  }
}

/** What the choice sounds: the sheet unfolding, a refused touch, the pick, "Later", and a stowed chest opened again
 *  (the chest's own sound, engine.chestOpen(tier)). */
export type ChestCue = 'page' | 'tap' | 'confirm' | 'back' | 'open';

/** The stowed chest's chip: a small scrap with a drawn chest (oak washed in ochre, planked and hatched, its iron bands
 *  and the scrap's rule in the tier's pigment) in a glow, lettered "Chest". */
export function drawChestChip(g: G, r: Rect, tier: number): void {
  const k = r.height / 52, cx = r.x + r.width / 2, cy = r.y + r.height * 0.4, s = 15 * k, pig = TIER[Math.max(0, Math.min(TIERS - 1, tier))], top = tier >= TIERS - 1;
  const band = top ? GOLD_DARK : pig;
  scrap(g, inset(r, 2), 7101, { tint: '#f4e9d0' });
  if (top) goldLeaf(g, inset(r, 2), 7102, 1, 3 * k);
  else inkRect(g, inset(r, 5 * k), 7103, 1, pig, 1.4 * k);
  const glow = g.createRadialGradient(cx, cy, 2, cx, cy, s * 2);
  glow.addColorStop(0, rgba(tier === 0 ? OCHRE : pig, tier === 0 ? 0.3 : 0.5));
  glow.addColorStop(1, rgba(tier === 0 ? OCHRE : pig, 0));
  g.fillStyle = glow;
  g.fillRect(cx - s * 2, cy - s * 2, s * 4, s * 4);
  const y0 = cy - 0.1 * s, y1 = y0 + 0.85 * s, dome = ring(cx, y0, s, 7, -Math.PI, Math.PI, 16).map(([x, y]): [number, number] => [x, y0 + (y - y0) * 0.55]);
  wash(g, OCHRE, 0.62, (q) => { q.rect(cx - s, y0, 2 * s, 0.85 * s); });
  wash(g, OCHRE, 0.38, (q) => { q.moveTo(...dome[0]); for (const pt of dome) q.lineTo(...pt); q.closePath(); });
  for (let i = 0; i < 5; i++) { const x = cx + s * (0.32 + i * 0.15); nib(g, [[x, y0 + 0.12 * s], [x - 0.18 * s, y1 - 0.08 * s]], 0.7 * k, 1, SEPIA, 0.55); } // the shade
  nib(g, [[cx - s, y0 + 0.42 * s], [cx + s, y0 + 0.42 * s]], 0.8 * k, 1, SEPIA, 0.7); // a plank's seam
  nib(g, [[cx - s, y0], [cx + s, y0], [cx + s, y1], [cx - s, y1], [cx - s, y0]], 1.5 * k);
  nib(g, dome, 1.5 * k);
  for (const f of [-0.62, 0.62]) nib(g, [[cx + f * s, y0 - 0.43 * s], [cx + f * s, y1]], 2.2 * k, 1, band, 0.95); // the iron bands
  nib(g, [[cx - 0.17 * s, y0 - 0.05 * s], [cx + 0.17 * s, y0 - 0.05 * s], [cx + 0.17 * s, y0 + 0.32 * s], [cx - 0.17 * s, y0 + 0.32 * s], [cx - 0.17 * s, y0 - 0.05 * s]], 1.3 * k, 1, top ? GOLD_DARK : INK); // the hasp
  letter(g, 'Chest', cx, r.y + r.height - 9 * k, { size: 12 * k, align: 'center', valign: 'middle' }, top ? GOLD_DARK : INK);
}

/**
 * The choice in the match: watches the player's ship each tick and unfolds the sheet when a chest opens on its deck;
 * the chosen offer goes out once through take() as ShipInput.chestPick. Never pauses the match.
 */
export class ChestChoice {
  readonly group = new THREE.Group();
  private readonly paper = new THREE.Group(); // the sheet, when it is up
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
  private finger = -1; // the finger that landed on a card, "Later" or the chip
  private chip: Rect | null = null;
  private chipMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private clock = 0;

  private readonly cue: (c: ChestCue) => void;
  private readonly hint: boolean;

  constructor(cue: (c: ChestCue) => void = () => {}, hint = false) {
    this.cue = cue;
    this.hint = hint;
    this.group.add(this.paper);
  }

  get open(): boolean { return this.shown; }
  /** A chest waits on deck, folded away by "Later" (the HUD shows it; reopen() unfolds it). */
  get waiting(): boolean { return this.stowed; }
  /** The sheet's layout while it is up, and the chip's place while a chest is stowed (null otherwise). */
  get sheetLayout(): ChestLayout | null { return this.shown ? this.l : null; }
  get chipRect(): Rect | null { return this.stowed ? this.chip : null; }
  /** The chest's tier: its richest offer's. */
  get tier(): number { return this.offers.reduce((m, o) => Math.max(m, o.item.tier), 0); }

  watch(ship: Ship): void {
    const has = ship.offer.length > 0;
    if (has && !this.shown && !this.stowed && this.chosen < 0) this.show(ship);
    else if (!has && this.shown && this.chosen < 0) this.hide();
    if (!has && !this.shown && (this.chosen >= 0 || this.stowed)) {
      this.chosen = -1;
      this.stowed = false;
      this.stow();
    }
  }

  reopen(): void {
    if (!this.stowed || this.offers.length === 0) return;
    this.stowed = false;
    this.shown = true;
    this.t = 1;
    this.cue('open');
    this.stow();
    this.rebuild();
  }

  /** The view, and where the chip for a stowed chest goes (beside the compact chart; null: none). */
  layout(view: View, chip: Rect | null = null): void {
    this.view = view;
    this.chip = chip;
    this.rebuild();
    this.stow();
  }

  /** True when the choice took the touch: one that landed on a card, "Later" or the chip, to its end. */
  touch(t: Touch): boolean {
    if (t.phase === 'down') {
      if (this.finger >= 0) return false;
      const onChip = this.stowed && this.chip !== null && inside(this.chip, t.x, t.y);
      if (!onChip && !(this.shown && this.l !== null && pickAt(this.l, t.x, t.y) !== -1)) return false;
      this.finger = t.id;
      return true;
    }
    if (t.id !== this.finger) return false;
    if (t.phase === 'move') return true;
    this.finger = -1;
    if (t.phase === 'cancel') return true;
    if (this.stowed) {
      if (this.chip !== null && inside(this.chip, t.x, t.y)) this.reopen();
      return true;
    }
    if (!this.shown || this.l === null) return true;
    const k = pickAt(this.l, t.x, t.y);
    if (k === -2 && this.chosen < 0) {
      this.stowed = true;
      this.hide();
      this.stow();
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
    this.clock += dt;
    if (this.chipMesh) this.chipMesh.scale.setScalar(1 + 0.05 * Math.sin(this.clock * 4)); // the stowed chest breathes
    if (!this.shown) return;
    this.t += dt;
    this.since += dt;
    if (this.chosen >= 0 && this.since > 0.7) this.hide();
    else if (this.t < 2.4 || this.chosen >= 0) this.redraw();
  }

  dispose(): void {
    this.hide();
    this.stowed = false;
    this.stow();
  }

  /** The chip, up while a chest is stowed. */
  private stow(): void {
    if (this.chipMesh) {
      drop(this.chipMesh);
      this.group.remove(this.chipMesh);
      this.chipMesh = null;
    }
    const r = this.chip;
    if (!this.stowed || r === null || this.view === null) return;
    const s = sheet(r.width, r.height, 200_000, this.view.dpr);
    s.g.translate(-r.x, -r.y);
    drawChestChip(s.g, r, this.tier);
    this.chipMesh = sheetMesh(s);
    this.chipMesh.position.set(r.x + r.width / 2, r.y + r.height / 2, 0);
    this.chipMesh.renderOrder = 30;
    this.group.add(this.chipMesh);
  }

  private show(ship: Ship): void {
    this.offers = chestOffers(ship);
    this.t = 0;
    this.chosen = -1;
    this.shown = true;
    this.cue('page');
    this.rebuild();
  }

  private rebuild(): void {
    drop(this.paper);
    this.mesh = this.sheet = null;
    if (!this.shown || this.view === null) return;
    const l = this.l = chestLayout(this.view, Math.max(1, this.offers.length));
    this.sheet = sheet(l.sheet.width, l.sheet.height, 2_000_000, this.view.dpr);
    this.mesh = sheetMesh(this.sheet);
    this.mesh.position.set(l.sheet.x + l.sheet.width / 2, l.sheet.y + l.sheet.height / 2, 0);
    this.mesh.renderOrder = 30;
    this.paper.add(this.mesh);
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
    drop(this.paper);
    this.mesh = this.sheet = null;
  }
}
