import * as THREE from 'three';
import { drop, sheet, sheetMesh, type Sheet } from '../render/harbourScene.ts';
import { OFFERS, bestPick, canTake, isConsumable, worth, type Item } from '../sim/items.ts';
import type { Ship } from '../sim/state.ts';
import { CONSUMABLE, FITTING, FITTING_SLOT, LOOT, SLOT, TIERS } from '../sim/tables.ts';
import { INK, TIER, consumableIcon, mortarIcon, nib, ring, wash } from './icons.ts';
import {
  GOLD_DARK, MIN_LETTER, MIN_TARGET, OCHRE, fitSize, layoutOf, PAPER, SEPIA, VERMILION, clamp01, ease, goldLeaf, inkButton, inkRect, inset, inside, letter, quad, rgba, safeOf, scrap, type G, type Pt,
} from './inkpage.ts';
import { hudLayout, type HudButton, type HudLayout } from './hud.ts';
import type { TextOptions } from '../lettering/text.ts';
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

export const itemName = (kind: number): string => NAME_OF[KEY_OF[kind] ?? '']?.[0] ?? 'Nothing';
export const itemDoes = (kind: number): string => NAME_OF[KEY_OF[kind] ?? '']?.[1] ?? '';
export const SLOT_WORDS = ['Bow', 'Broadside', 'Stern', 'Rig', 'Hull', 'Lookout'] as const;
export const TIER_WORDS = ['Iron gall', 'Verdigris', 'Ultramarine', 'Vermilion', 'Gold leaf'] as const;
export const chestWords = (tier: number): string => {
  const w = TIER_WORDS[Math.max(0, Math.min(TIERS - 1, tier))];
  return `${/^[AEIOU]/.test(w) ? 'An' : 'A'} ${w.toLowerCase()} chest`;
};

export interface Offer {
  index: number;
  item: Item;
  name: string;
  does: string;
  consumable: boolean;
  slot: number;
  pigment: string;
  tierWord: string;
  gold: boolean;
  takeable: boolean;
  replaces: Item | null;
  count: number;
  worth: number;
  best: boolean;
}

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

export const uses = (n: number): string => (n === 1 ? '1 use' : `${n} uses`);

export function consequence(o: Offer): string {
  if (!o.takeable) return 'Your stores are full';
  if (o.consumable) return `${o.count} to your stores`;
  return o.replaces ? `In place of ${itemName(o.replaces.kind)}` : `Fills the ${SLOT_WORDS[o.slot].toLowerCase()}`;
}

export const chestPick = (offers: readonly Offer[], k: number): number => (offers[k]?.takeable ? k : -1);

export interface ChestLayout {
  view: View;
  sheet: Rect;
  panel: Rect;
  cards: Rect[];
  later: Rect;
  k: number;
  column: boolean;
  left: boolean;
}

export const centreOf = (s: Rect): Rect => ({ x: s.x + s.width * 0.3, y: s.y + s.height * 0.3, width: s.width * 0.4, height: s.height * 0.4 });
const hitBox = (b: HudButton): Rect => (b.w !== undefined && b.h !== undefined ? { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h } : { x: b.x - b.hit, y: b.y - b.hit, width: 2 * b.hit, height: 2 * b.hit });
const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function chestLayout(view: View, n: number = OFFERS, hud: HudLayout = hudLayout(view, false)): ChestLayout {
  const s = safeOf(view), left = hud.left === true, k = Math.max(1, Math.min(1.45, hud.u)), c = centreOf(s), m = 6 * k, gap = 8 * k;
  const fan = hud.buttons.filter((b) => b.kind !== 'chart').map(hitBox);
  const fanTop = Math.min(s.y + s.height, ...fan.map((b) => b.y));
  const edge = left ? s.x + m : s.x + s.width - m, inner = left ? c.x - gap : c.x + c.width + gap;
  const top = hud.chart.y + hud.chart.height + gap, bottom = fanTop - gap, head = Math.max(MIN_TARGET, 44 * k), cardMin = 90 * k;
  if (bottom - top >= head + gap + n * cardMin + (n - 1) * gap + 2 * m) {
    const w = Math.min(Math.abs(edge - inner), 310 * k), x = left ? edge : edge - w, h = bottom - top;
    const ch = (h - 2 * m - head - gap - (n - 1) * gap) / n, y0 = top + m + head + gap;
    const cards = Array.from({ length: n }, (_, i) => ({ x: x + m, y: y0 + i * (ch + gap), width: w - 2 * m, height: ch }));
    const bw = Math.max(MIN_TARGET, 104 * k), later = { x: left ? x + m : x + w - m - bw, y: top + m, width: bw, height: head };
    const sheet = { x, y: top, width: w, height: h };
    return { view, sheet, panel: sheet, cards, later, k, column: true, left };
  }
  const from = left ? hud.top.x - gap : hud.top.x + hud.top.width + gap, w = Math.abs(edge - from), x = left ? edge : from;
  const y = s.y + m, h = Math.min(c.y, fanTop) - gap - y, mc = 4 * k, gc = 5 * k, cw = (w - 2 * mc - (n - 1) * gc) / n;
  const cards = Array.from({ length: n }, (_, i) => ({ x: x + mc + i * (cw + gc), y: y + mc, width: cw, height: h - 2 * mc }));
  const ty = y + h + 2 * k, th = MIN_TARGET;
  let later = { x: left ? x : x + w - MIN_TARGET, y: ty, width: MIN_TARGET, height: th };
  for (const tw of [72 * k, 60 * k, 52 * k]) {
    const r = { x: left ? x : x + w - tw, y: ty, width: tw, height: th };
    if (!fan.some((b) => meets(b, r))) { later = r; break; }
  }
  const panel = { x, y, width: w, height: h };
  return { view, sheet: { x, y, width: w, height: ty + th - y }, panel, cards, later, k, column: false, left };
}

export const laterSize = (l: ChestLayout): number => Math.max(MIN_LETTER, 21 * (l.column ? l.k * 0.85 : Math.min(l.k * 0.72, l.later.width / 64)));
export const headerOf = (l: ChestLayout): { size: number; w: number } => ({ size: 17 * l.k, w: l.panel.width - l.later.width - 30 * l.k });

export function pickAt(l: ChestLayout, x: number, y: number): number {
  if (inside(l.later, x, y)) return -2;
  return l.cards.findIndex((c) => inside(c, x, y));
}

export function drawChestChoice(g: G, offers: readonly Offer[], l: ChestLayout, t: number, chosen = -1, hint = false): void {
  const { panel: s, k } = l, top = offers.reduce((m, o) => Math.max(m, o.item.tier), 0);
  const open = ease(t / 0.3);
  if (open <= 0) return;
  scrap(g, s, 7001, { alpha: open });
  inkRect(g, inset(s, 4 * k), 7002, clamp01(t / 0.6), top >= TIERS - 1 ? GOLD_DARK : TIER[top] ?? SEPIA, 1.2 * k);
  if (top >= TIERS - 1) goldLeaf(g, inset(s, 1.5 * k), 7003, clamp01((t - 0.2) / 0.8), 3 * k);
  if (l.column) {
    const tx = l.left ? l.later.x + l.later.width + 12 * k : s.x + 14 * k, ty = l.later.y + l.later.height / 2;
    const hd = headerOf(l);
    letter(g, chestWords(top), tx, ty, { size: hd.size, valign: 'middle', swash: true, maxWidth: hd.w }, top >= TIERS - 1 ? GOLD_DARK : TIER[top] ?? SEPIA, clamp01((t - 0.2) / 0.6));
  }
  offers.forEach((o, i) => { if (l.cards[i]) drawCard(g, o, l.cards[i], t - 0.15 - i * 0.14, chosen, k, hint); });
  inkButton(g, l.later, 'Later', laterSize(l) / 21, chosen >= 0 ? 0 : clamp01((t - 0.6) / 0.4));
}

export interface Words { text: string; x: number; y: number; o: TextOptions; colour: string }
export function cardFace(o: Offer, c: Rect, k: number): { icon: { x: number; y: number; r: number }; words: Words[]; wide: boolean } {
  const wide = c.width > c.height * 1.6, pad = 7 * k, cons = consequence(o), consInk = o.takeable ? INK : VERMILION;
  const tall = (text: string, w: TextOptions): number => { const b = layoutOf(text, w).box; return b.bottom - b.top; };
  if (wide) {
    const r = c.height * 0.384, x = c.x + 12 * k + r, tx = x + r + 14 * k, wmax = c.x + c.width - 10 * k - tx, lh = c.height / 4.6, y0 = c.y + c.height / 2 - 1.5 * lh;
    const tierLine = o.consumable ? `${o.tierWord}, ${uses(o.count)}` : `${o.tierWord}, the ${SLOT_WORDS[o.slot].toLowerCase()}`;
    const line = (text: string, size: number, i: number, colour: string): Words => ({ text, x: tx, y: y0 + i * lh, o: { size: fitSize(text, size, wmax), valign: 'middle', maxWidth: wmax }, colour });
    return { icon: { x, y: c.y + c.height / 2, r }, wide, words: [line(o.name, 19 * k, 0, INK), line(tierLine, 12.5 * k, 1, o.gold ? GOLD_DARK : o.item.tier === 0 ? SEPIA : o.pigment), line(o.does, 12.5 * k, 2, SEPIA), line(cons, 12.5 * k, 3, consInk)] };
  }
  const w = c.width - 2 * pad, x = c.x + c.width / 2;
  const no: TextOptions = { size: fitSize(o.name, 14 * k, w), align: 'center', valign: 'top', maxWidth: w, lineHeight: 1.08 };
  const co: TextOptions = { size: fitSize(cons, 12.5 * k, w), align: 'center', valign: 'top', maxWidth: w, lineHeight: 1.08 };
  const cy = c.y + c.height - pad - tall(cons, co), ny = cy - 1.5 * k - tall(o.name, no), room = ny - 2 * k - (c.y + pad);
  const r = Math.max(7 * k, Math.min(c.width * 0.31, room / 2));
  return { icon: { x, y: c.y + pad + room / 2, r }, wide, words: [{ text: o.name, x, y: ny, o: no, colour: INK }, { text: cons, x, y: cy, o: co, colour: consInk }] };
}

function drawCard(g: G, o: Offer, r: Rect, t: number, chosen: number, k: number, hint: boolean): void {
  if (t <= 0) return;
  const a = ease(t / 0.5), mine = chosen === o.index, dim = chosen >= 0 && !mine ? 0.3 : 1;
  const c = { x: r.x, y: r.y + (mine ? -5 * k : (1 - a) * 10 * k), width: r.width, height: r.height };
  const f = cardFace(o, c, k), cx = f.icon.x, iy = f.icon.y, rr = f.icon.r;
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
  wash(g, o.pigment, 0.16, (gg) => { gg.beginPath(); gg.arc(cx, iy, rr, 0, Math.PI * 2); });
  nib(g, ring(cx, iy, rr, 31 + o.item.kind), 1.2 * k, clamp01((t - 0.1) / 0.6), o.gold ? GOLD_DARK : o.pigment);
  const pi = clamp01((t - 0.15) / 0.6);
  if (o.consumable) consumableIcon(g, o.item.kind, cx, iy, rr * 0.68, pi);
  else cardIcon(g, o.item.kind, o.item.tier, cx, iy, rr * 0.68, pi);
  const pt = clamp01((t - 0.3) / 0.8);
  for (const w of f.words) letter(g, w.text, w.x, w.y, w.o, w.colour, pt);
  const nm = f.words[0], nb = layoutOf(nm.text, nm.o).box, ny = nm.y + (nb.top + nb.bottom) / 2, nx0 = nm.x + nb.left - 3 * k, nx1 = nm.x + nb.right + 3 * k;
  if (!o.takeable) nib(g, [[nx0, ny + 2 * k], [(nx0 + nx1) / 2, ny - 3 * k], [nx1, ny + 1 * k]], 2 * k, pt, VERMILION);
  if (hint && o.best && chosen < 0) {
    const fx = c.x + c.width - 12 * k, fy = c.y + 12 * k;
    for (let i = 0; i < 4; i++) {
      const an = (i * Math.PI) / 4;
      nib(g, [[fx - Math.cos(an) * 9 * k, fy - Math.sin(an) * 9 * k], [fx + Math.cos(an) * 9 * k, fy + Math.sin(an) * 9 * k]], 1.6 * k, pt, GOLD_DARK);
    }
  }
  g.restore();
}

function cardIcon(g: G, kind: number, tier: number, x: number, y: number, h: number, p: number): void {
  if (p <= 0) return;
  const slot = FITTING_SLOT[kind] ?? -1;
  const w = 0.07 * h, P = (u: number, v: number): Pt => [x + u * h, y + v * h], line = (pts: Pt[], k = 1): void => nib(g, pts, w * k, p);
  const shade = (path: (q: G) => void, n = 7): void => {
    g.save();
    g.beginPath();
    path(g);
    g.clip();
    for (let i = 0; i < n * 2; i++) { const u = -1 + i / n; nib(g, [P(u - 0.4, 1), P(u + 0.4, -1)], w * 0.45, p, INK, 0.5); }
    g.restore();
  };
  wash(g, tier === 0 ? '#8a8178' : TIER[tier], 0.28 * p, (q) => q.arc(x, y, 0.95 * h, 0, Math.PI * 2));
  const fill = (pts: Pt[]) => (q: G): void => { q.moveTo(...pts[0]); for (const pt of pts) q.lineTo(...pt); q.closePath(); };
  const ring2 = (u: number, v: number, r: number, seed: number, k = 1): void => line(ring(x + u * h, y + v * h, r * h, seed), k);
  switch (kind) {
    case FITTING.stemPost: {
      const post = [P(-0.3, -0.85), P(0.1, -0.85), P(0.4, 0.85), P(0, 0.85)];
      wash(g, OCHRE, 0.5 * p, fill(post));
      shade(fill([P(-0.1, -0.85), P(0.1, -0.85), P(0.4, 0.85), P(0.2, 0.85)]), 6);
      line([...post, post[0]], 1.3);
      for (const v of [-0.45, 0.05, 0.55]) ring2(-0.1 + (v + 0.85) * 0.18, v, 0.07, 41 + v * 10, 0.9);
      line([P(-0.75, 0.85), P(0.75, 0.85)], 0.8);
      return;
    }
    case FITTING.cutwater: {
      const blade = [...quad(P(-0.85, 0.15), P(0, -0.85), P(0.9, -0.35), 10), ...quad(P(0.9, -0.35), P(0.05, -0.35), P(-0.85, 0.15), 10)];
      wash(g, tier === 0 ? '#8a8178' : TIER[tier], 0.5 * p, fill(blade));
      line(blade, 1.2);
      for (const [a, b] of [[-0.9, -0.55], [-0.4, -0.1], [0.25, 0.5], [0.65, 0.9]]) line(quad(P(a, 0.55), P((a + b) / 2, 0.42), P(b, 0.55), 4), 0.9);
      line([P(-0.05, 0.3), P(0.12, 0.75)], 0.6);
      return;
    }
    case FITTING.lightGuns: case FITTING.swivelGuns: {
      const swivel = kind === FITTING.swivelGuns, L0 = swivel ? -0.55 : -0.6, L1 = swivel ? 0.6 : 0.45, b0 = swivel ? -0.25 : -0.05;
      const barrel = [P(L0, b0), P(L1, b0 - 0.16), P(L1 + 0.02, b0 - 0.02), P(L0 + 0.02, b0 + 0.2)];
      wash(g, INK, 0.25 * p, fill(barrel));
      shade(fill(barrel), 5);
      line([...barrel, barrel[0]], 1.2);
      ring2(L0 - 0.06, b0 + 0.1, 0.1, 3);
      if (swivel) { line([P(-0.25, b0 + 0.05), P(-0.1, b0 + 0.3), P(0.08, b0 - 0.02)], 1.1); line([P(-0.1, b0 + 0.3), P(-0.1, 0.85)], 1.6); line([P(-0.4, 0.85), P(0.2, 0.85)], 1); }
      else { line([P(-0.55, 0.18), P(-0.5, 0.45), P(0.35, 0.45), P(0.3, 0.05)], 1); for (const u of [-0.35, 0.18]) ring2(u, 0.52, 0.16, 5, 1.1); }
      return;
    }
    case FITTING.chainShot: {
      for (const u of [-0.55, 0.55]) { wash(g, INK, 0.45 * p, (q) => q.arc(x + u * h, y, 0.28 * h, 0, Math.PI * 2)); ring2(u, 0, 0.28, 7 + u * 10, 1.2); }
      for (let i = 0; i < 4; i++) { const u = -0.3 + i * 0.2; line(ring(x + (u + 0.05) * h, y + (i % 2 ? 0.06 : -0.06) * h, 0.08 * h, 11 + i), 0.8); }
      return;
    }
    case FITTING.heatedShot: {
      wash(g, VERMILION, 0.4 * p, (q) => q.arc(x, y + 0.3 * h, 0.4 * h, 0, Math.PI * 2));
      ring2(0, 0.3, 0.4, 13, 1.2);
      for (const [u, t] of [[-0.25, -0.55], [0.05, -0.85], [0.3, -0.5]]) line(quad(P(u - 0.1, -0.05), P(u + 0.15, (t - 0.05) / 2), P(u, t), 6), 1);
      return;
    }
    case FITTING.sternChasers: {
      const barrel = [P(0.7, -0.2), P(-0.85, -0.42), P(-0.86, -0.25), P(0.68, 0.05)];
      wash(g, INK, 0.25 * p, fill(barrel));
      shade(fill(barrel), 5);
      line([...barrel, barrel[0]], 1.2);
      line([P(0.9, 0.1), P(-0.3, 0.1)], 1.3);
      line(quad(P(0.9, 0.1), P(0.95, 0.55), P(0.6, 0.85), 6), 1.2);
      for (const u of [-0.1, 0.25, 0.6]) line([P(u, 0.1), P(u, 0.3)], 0.7);
      return;
    }
    case FITTING.powderKegs: {
      const keg = [...quad(P(-0.45, -0.6), P(-0.65, 0), P(-0.45, 0.6), 8), ...quad(P(0.45, 0.6), P(0.65, 0), P(0.45, -0.6), 8)];
      wash(g, OCHRE, 0.5 * p, fill(keg));
      shade(fill(keg), 6);
      line([...keg, keg[0]], 1.2);
      for (const v of [-0.35, 0.35]) line(quad(P(-0.56, v), P(0, v + 0.08), P(0.56, v), 6), 1);
      line(quad(P(0.1, -0.6), P(0.35, -0.85), P(0.6, -0.75), 5), 0.8);
      wash(g, VERMILION, 0.8 * p, (q) => q.arc(x + 0.62 * h, y - 0.76 * h, 0.07 * h, 0, Math.PI * 2));
      return;
    }
    case FITTING.lateenMizzen: case FITTING.stormSails: {
      if (kind === FITTING.lateenMizzen) {
        const sail = [P(-0.7, 0.55), ...quad(P(-0.7, 0.55), P(0.35, 0.2), P(0.75, -0.85), 8).slice(1), P(-0.7, 0.55)];
        wash(g, PAPER, 0.85 * p, fill(sail));
        shade(fill([P(-0.1, 0.4), ...quad(P(-0.1, 0.4), P(0.4, 0.15), P(0.75, -0.85), 6).slice(1)]), 5);
        line(sail, 1);
        line([P(-0.85, 0.75), P(0.85, -1)], 1.4);
        line([P(0, -0.9), P(0, 0.9)], 1.5);
      } else {
        const sail = [...quad(P(-0.45, -0.3), P(-0.25, 0), P(-0.4, 0.3), 6), ...quad(P(0.4, 0.3), P(0.6, 0), P(0.45, -0.3), 6)];
        wash(g, PAPER, 0.85 * p, fill(sail));
        line([...sail, sail[0]], 1);
        line([P(0, -0.9), P(0, 0.85)], 1.5);
        line([P(-0.52, -0.31), P(0.52, -0.31)], 1.2);
        for (let i = 0; i < 5; i++) line([P(-0.32 + i * 0.16, -0.12), P(-0.32 + i * 0.16, -0.04)], 0.6);
        for (const v of [-0.7, -0.5]) line(quad(P(-0.9, v), P(-0.6, v - 0.1), P(-0.3, v), 4), 0.7);
        for (const v of [0.55, 0.75]) line(quad(P(0.3, v), P(0.6, v - 0.1), P(0.9, v), 4), 0.7);
      }
      return;
    }
    case FITTING.doubledPlanking: {
      for (const [v, off] of [[-0.45, 0], [-0.1, 0.25], [0.25, 0], [0.6, 0.25]] as const) {
        const r = [P(-0.85 + off * 0.3, v), P(0.85, v), P(0.85, v + 0.3), P(-0.85 + off * 0.3, v + 0.3)];
        wash(g, OCHRE, (off ? 0.55 : 0.35) * p, fill(r));
        if (off) shade(fill(r), 5);
        line([...r, r[0]], 1);
        for (const u of [-0.45, 0.15, 0.6]) ring2(u + off * 0.2, v + 0.15, 0.04, 17, 0.7);
      }
      return;
    }
    case FITTING.pumps: {
      const barrel = [P(-0.2, -0.7), P(0.2, -0.7), P(0.2, 0.85), P(-0.2, 0.85)];
      wash(g, OCHRE, 0.5 * p, fill(barrel));
      shade(fill(barrel), 5);
      line([...barrel, barrel[0]], 1.2);
      line([P(0, -0.7), P(0, -0.85), P(-0.75, -0.55)], 1.2);
      line([P(0.2, -0.2), P(0.55, -0.2), P(0.6, -0.1)], 1.1);
      for (const [u, v] of [[0.62, 0.1], [0.66, 0.35], [0.7, 0.6]]) wash(g, TIER[2], 0.7 * p, (q) => q.arc(x + u * h, y + v * h, 0.06 * h, 0, Math.PI * 2));
      return;
    }
    case FITTING.sternGlass: {
      const arch = [P(-0.6, 0.75), P(-0.6, -0.2), ...quad(P(-0.6, -0.2), P(0, -0.95), P(0.6, -0.2), 10).slice(1), P(0.6, 0.75)];
      wash(g, TIER[2], 0.25 * p, fill(arch));
      line([...arch, arch[0]], 1.3);
      line([P(0, -0.55), P(0, 0.75)], 0.8);
      for (const v of [-0.1, 0.3]) line([P(-0.6, v), P(0.6, v)], 0.8);
      line([P(-0.8, 0.85), P(0.8, 0.85)], 1.3);
      return;
    }
    case FITTING.crowsNest: {
      line([P(0, -0.95), P(0, 0.95)], 1.5);
      const nest = [P(-0.42, -0.35), P(0.42, -0.35), P(0.32, 0.05), P(-0.32, 0.05)];
      wash(g, OCHRE, 0.55 * p, fill(nest));
      shade(fill(nest), 5);
      line([...nest, nest[0]], 1.2);
      for (const u of [-0.2, 0.2]) line([P(u, -0.35), P(u * 0.8, 0.05)], 0.6);
      line([P(-0.6, 0.45), P(0.6, 0.45)], 1.1);
      for (const s2 of [-1, 1]) line([P(0, 0.05), P(0.6 * s2, 0.95)], 0.6);
      wash(g, VERMILION, 0.8 * p, fill([P(0, -0.95), P(0.42, -0.85), P(0, -0.75)]));
      return;
    }
  }
  switch (slot) {
    case SLOT.hull: {
      const keel = [...quad(P(0.85, -0.32), P(0.6, 0.5), P(0.05, 0.48), 10), ...quad(P(0.05, 0.48), P(-0.55, 0.48), P(-0.82, -0.18), 10)];
      wash(g, OCHRE, 0.5 * p, fill(keel));
      shade(fill([P(-0.75, 0.08), P(0.8, 0.02), ...keel.slice(4, 18)]), 8);
      line(keel, 1.4);
      line([P(-0.82, -0.18), P(0.85, -0.32)], 1.4);
      line(quad(P(-0.8, -0.04), P(0.1, 0.0), P(0.8, -0.14), 8), 0.7);
      line(quad(P(-0.75, 0.08), P(0.1, 0.12), P(0.78, 0.02), 8), 1);
      for (let i = 0; i < 6; i++) { const u = -0.5 + i * 0.2; line([P(u, 0.12), P(u + 0.02, 0.4)], 0.55); }
      for (const v of [0.22, 0.34]) line(quad(P(-0.6, v), P(0.1, v + 0.06), P(0.68, v - 0.08), 8), 0.45);
      break;
    }
    case SLOT.broadside: {
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
    case SLOT.bow: {
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
    case SLOT.rig: {
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
    default: {
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

export type ChestCue = 'page' | 'tap' | 'confirm' | 'back' | 'open';

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
  for (let i = 0; i < 5; i++) { const x = cx + s * (0.32 + i * 0.15); nib(g, [[x, y0 + 0.12 * s], [x - 0.18 * s, y1 - 0.08 * s]], 0.7 * k, 1, SEPIA, 0.55); }
  nib(g, [[cx - s, y0 + 0.42 * s], [cx + s, y0 + 0.42 * s]], 0.8 * k, 1, SEPIA, 0.7);
  nib(g, [[cx - s, y0], [cx + s, y0], [cx + s, y1], [cx - s, y1], [cx - s, y0]], 1.5 * k);
  nib(g, dome, 1.5 * k);
  for (const f of [-0.62, 0.62]) nib(g, [[cx + f * s, y0 - 0.43 * s], [cx + f * s, y1]], 2.2 * k, 1, band, 0.95);
  nib(g, [[cx - 0.17 * s, y0 - 0.05 * s], [cx + 0.17 * s, y0 - 0.05 * s], [cx + 0.17 * s, y0 + 0.32 * s], [cx - 0.17 * s, y0 + 0.32 * s], [cx - 0.17 * s, y0 - 0.05 * s]], 1.3 * k, 1, top ? GOLD_DARK : INK);
  letter(g, 'Chest', cx, r.y + r.height - 9 * k, { size: 12 * k, align: 'center', valign: 'middle' }, top ? GOLD_DARK : INK);
}

export class ChestChoice {
  readonly group = new THREE.Group();
  private readonly paper = new THREE.Group();
  private sheet: Sheet | null = null;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private offers: Offer[] = [];
  private view: View | null = null;
  private hud: HudLayout | null = null;
  private l: ChestLayout | null = null;
  private t = 0;
  private since = 0;
  private chosen = -1;
  private pick = -1;
  private shown = false;
  private stowed = false;
  private finger = -1;
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
  get waiting(): boolean { return this.stowed; }
  get sheetLayout(): ChestLayout | null { return this.shown ? this.l : null; }
  get chipRect(): Rect | null { return this.stowed ? this.chip : null; }
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

  layout(view: View, chip: Rect | null = null, hud: HudLayout | null = null): void {
    this.view = view;
    this.chip = chip;
    this.hud = hud;
    this.rebuild();
    this.stow();
  }

  touch(t: Touch): boolean {
    if (t.phase === 'down') {
      if (this.finger >= 0) return false;
      const onChip = this.stowed && this.chip !== null && inside(this.chip, t.x, t.y);
      if (!onChip && !(this.shown && this.l !== null && (pickAt(this.l, t.x, t.y) !== -1 || inside(this.l.panel, t.x, t.y)))) return false;
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

  take(): number {
    const p = this.pick;
    this.pick = -1;
    return p;
  }

  frame(dt: number): void {
    this.clock += dt;
    if (this.chipMesh) this.chipMesh.scale.setScalar(1 + 0.05 * Math.sin(this.clock * 4));
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
    const l = this.l = chestLayout(this.view, Math.max(1, this.offers.length), this.hud ?? undefined);
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
