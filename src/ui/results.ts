// WP27: the results (PROMPT.md, The results): the end of the match explained on one parchment page so the player always
// understands why it won or lost. The place in the hand's swash capitals and how it ended; the tallies counting up (sea
// claimed, ships sunk, doubloons banked, treasure brought home); the timeline of the moments that decided it (where it
// broke off, the loops it closed, the trails it lost and broke, the chests it chose, the ships it sank, how it sank or
// won) written in one by one with the quill; the nine rivals' fates as roundels in their captains' pigments; the rank
// points inking onto the portolan wind rose (Greco to Tramontana) with a promotion lettered in vermilion; the league
// table sliding to its new order; the seas first named and, on the first voyage, the lessons learned. A tap finishes
// the writing; "The next voyage" turns the page to the nine captains the player will face next, each with its card
// (part B), and "To harbour" goes on. Everything is read from MatchResult, the career before and after, and the Voyage.
// While the player's ship is gone and the match plays out on the chart, the skip card (part B) says how she sank and
// how many sail on, and goes straight to the results.
import * as THREE from 'three';
import { RANK, tierOf, type Career } from '../career/state.ts';
import { toLetter, type Voyage } from '../career/voyage.ts';
import { drop, emblemSheet, sheet, sheetMesh, type Sheet } from '../render/harbourScene.ts';
import type { MatchResult } from '../sim/end.ts';
import { EVENT, SHIPS, TICK, type Entry } from '../sim/state.ts';
import { REGIONS } from '../sim/world/regions.ts';
import { NAMED_PIGMENTS } from '../style/palette.ts';
import { captainCard, leagueRows, nineCards, type Card } from './cards.ts';
import { itemName } from './chestChoice.ts';
import { INK, nib, pouch, ring, shipGlyph, strongbox, wash } from './icons.ts';
import {
  GOLD, GOLD_DARK, MIN_TARGET, OCHRE, ORDINALS, PAPER, SEPIA, VERDIGRIS, VERMILION, clamp01, ease, goldLeaf, inkButton, inkRect, inset, inside, kite, letter, rgba, safeOf, scrap,
  type G,
} from './inkpage.ts';
import type { Rect, View } from './safeArea.ts';
import type { Touch } from './shell.ts';

const CAUSE_WORDS = ['guns', 'ram', 'fire', 'the rocks', 'the hot springs', 'the storm'];
const EVENT_KEY: string[] = [];
for (const [k, v] of Object.entries(EVENT)) EVENT_KEY[v] = k;
const clock = (tick: number): string => { const s = Math.max(0, Math.round(tick * TICK)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const lower = (name: string): string => name.replace(/^The /, 'the ');
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const FALLBACK: Record<string, string> = {
  vermilion: '#d9472b', ultramarine: '#4566b0', verdigris: '#5aa394', ochre: '#d4a656', indigo: '#3e4d72', sepia: '#6b4f36', gold: '#d4a64a', black: '#2a211c',
  white: '#f4ecd8', lead: '#8a8178', umber: '#7a5532', malachite: '#3f8f6a', azurite: '#3d5f9e', orpiment: '#d9b24a', saffron: '#d9a03a', carmine: '#a8323a', rose: '#c46a6a',
};
/** A captain's pigment (NAMED_PIGMENTS name) as a CSS colour. */
export function pigmentHex(name: string): string {
  if (name.startsWith('#')) return name;
  const v = (NAMED_PIGMENTS as unknown as Record<string, unknown>)[name];
  if (typeof v === 'string' && v.startsWith('#')) return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const f of ['hex', 'css', 'colour', 'color']) if (typeof o[f] === 'string' && (o[f] as string).startsWith('#')) return o[f] as string;
    const c = (Array.isArray(o.rgb) ? o.rgb : Array.isArray(o.srgb) ? o.srgb : typeof o.r === 'number' ? [o.r, o.g, o.b] : null) as number[] | null;
    if (c && c.length >= 3) {
      const s = c.some((x) => x > 1) ? 1 : 255;
      return `#${c.slice(0, 3).map((x) => Math.round(Math.min(255, Math.max(0, x * s))).toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return FALLBACK[name] ?? SEPIA;
}

export interface TimelineLine { tick: number; clock: string; text: string; tone: 'good' | 'bad' | 'plain' }
export interface Fate { ship: number; name: string; pigments: [string, string]; place: number; fate: string; byYou: boolean }
export interface LeagueMove { key: number; name: string; from: number; to: number; points: number; player: boolean }
export interface ResultsModel {
  place: number;
  won: boolean;
  ending: string;
  claimed: number;
  sank: number;
  bank: number;
  treasure: number;
  timeline: TimelineLine[];
  fates: Fate[];
  rank: { before: number; after: number; tierBefore: number; tierAfter: number; wind: string; promoted: boolean; perTier: number };
  league: LeagueMove[];
  /** Regions whose names the chart letters for the first time. */
  named: string[];
  /** LESSONs done this match (the first voyage). */
  lessons: number[];
  firstVoyage: boolean;
  /** The nine captains of the next voyage, nearest the new rank first, each with its card. */
  next: Card[];
}

/** Ship `ship`'s captain as the page names it: `drawn` are the league ids of ships 1–9 (toSetup). */
const shipName = (c: Career, drawn: readonly number[], ship: number): string =>
  ship === 0 ? 'you' : ship > 0 && ship < SHIPS && drawn[ship - 1] !== undefined ? captainCard(c, drawn[ship - 1]).name : 'the sea';

/** How a ship went down, `by` the ship that sank it (−1 none) of a CAUSE (end.ts sink). */
export function fateWords(c: Career, drawn: readonly number[], by: number, cause: number): string {
  const by_ = lower(shipName(c, drawn, by));
  return by === 0 ? 'Sunk by you' : by > 0 && cause >= 0 && cause <= 2 ? `Sunk by ${by_}'s ${CAUSE_WORDS[cause]}` : by > 0 ? `Sunk by ${by_}` : `Lost to ${CAUSE_WORDS[cause] ?? 'the sea'}`;
}

/** The page's content: `drawn` are the league ids of ships 1–9 (toSetup), `after` = applyResult(before, result, voyage). */
export function resultsModel(before: Career, after: Career, result: MatchResult, drawn: readonly number[], voyage?: Voyage): ResultsModel {
  const me = result.ships[0];
  const nameOf = (ship: number): string => shipName(before, drawn, ship);
  const sunkBy = (by: number, cause: number): string => fateWords(before, drawn, by, cause);
  const won = me.place === 1, ending = won ? 'Last afloat as the storm closed' : sunkBy(me.by, me.cause);
  const lineOf = (e: Entry): TimelineLine | null => {
    const key = EVENT_KEY[e.kind] ?? '', mine = e.ship === 0;
    let text: string, tone: TimelineLine['tone'] = 'plain';
    switch (key) {
      case 'breakOff': text = REGIONS[e.by] ? `Broke off into ${lower(REGIONS[e.by].name)}` : 'Broke off the Great Current'; tone = 'good'; break;
      case 'thrown': text = 'Thrown off the end of the Great Current'; break;
      case 'home': text = `Inked a home, ${Math.round(e.amount)} of sea`; tone = 'good'; break;
      case 'lead': if (mine) { text = 'Took the gold pennant'; tone = 'good'; } else { text = e.ship > 0 ? `${cap(lower(nameOf(e.ship)))} took the pennant from you` : 'The pennant came down'; tone = 'bad'; } break;
      case 'engage': text = `A fight with ${lower(nameOf(e.by))}`; break;
      case 'loop': text = `Closed a loop, ${Math.round(e.amount)} of sea`; tone = 'good'; break;
      case 'broken': if (mine) { text = `${cap(lower(nameOf(e.by)))} broke your trail`; tone = 'bad'; } else { text = `Broke ${lower(nameOf(e.ship))}'s trail`; tone = 'good'; } break;
      case 'chosen': text = `Chose the ${itemName(e.by)}`; break;
      case 'bank': text = `Banked ${Math.round(e.amount)} doubloons`; tone = 'good'; break;
      case 'sunk': if (mine) { text = sunkBy(e.by, Math.round(e.amount)); tone = 'bad'; } else { text = `Sank ${lower(nameOf(e.ship))}`; tone = 'good'; } break;
      default:
        if (!key) return null;
        text = /find|found|treasure|scoop/i.test(key) ? 'Took a find' : cap(key.replace(/([A-Z])/g, ' $1').toLowerCase());
        tone = mine ? 'good' : 'plain';
    }
    return { tick: e.tick, clock: clock(e.tick), text, tone };
  };
  const timeline: TimelineLine[] = [];
  for (const e of result.timeline) { const l = lineOf(e); if (l) timeline.push(l); }
  if (won) timeline.push({ tick: result.ticks, clock: clock(result.ticks), text: 'Last afloat: the sea is yours', tone: 'good' });
  else if (!result.timeline.some((e) => EVENT_KEY[e.kind] === 'sunk' && e.ship === 0)) timeline.push({ tick: me.tick, clock: clock(me.tick), text: ending, tone: 'bad' });
  const fates: Fate[] = [];
  for (let i = 1; i < SHIPS; i++) {
    const f = result.ships[i], id = drawn[i - 1];
    if (!f || id === undefined) continue;
    const card = captainCard(before, id);
    fates.push({ ship: i, name: card.name, pigments: [pigmentHex(card.pigments[0]), pigmentHex(card.pigments[1])], place: f.place, fate: f.place === 1 ? 'Last afloat' : sunkBy(f.by, f.cause), byYou: f.by === 0 });
  }
  fates.sort((a, b) => a.place - b.place);
  const pb = before.player.points, pa = after.player.points, ta = tierOf(pa);
  const was = new Map(leagueRows(before).map((r) => [r.player ? -1 : r.id, r.place]));
  const league = leagueRows(after).map((r) => ({ key: r.player ? -1 : r.id, name: r.player ? 'You' : r.name, from: was.get(r.player ? -1 : r.id) ?? r.place, to: r.place, points: r.points, player: r.player }));
  return {
    place: me.place, won, ending, claimed: Math.round(me.claimed), sank: me.sank, bank: Math.round(me.bank), treasure: Math.round(me.treasure), timeline, fates,
    rank: { before: pb, after: pa, tierBefore: tierOf(pb), tierAfter: ta, wind: RANK.winds[ta - 1], promoted: after.player.tier > before.player.tier, perTier: RANK.tier },
    league, named: voyage ? toLetter(before, voyage).map((n) => REGIONS[n.region].name) : [],
    lessons: voyage ? voyage.lessons.flatMap((t, k) => (t >= 0 ? [k] : [])) : [], firstVoyage: before.match === 0, next: nineCards(after),
  };
}

export interface ResultsLayout { view: View; page: Rect; left: Rect; mid: Rect; right: Rect; rose: { x: number; y: number; r: number }; cont: Rect; k: number }

/** Three columns on the page: the place and the rose, the voyage, the league; "The next voyage" at the foot of the third. */
export function resultsLayout(view: View): ResultsLayout {
  const page = inset(safeOf(view), 6), k = Math.max(1, Math.min(1.45, page.height / 408)), pad = 16 * k, gap = 14 * k;
  const iw = page.width - 2 * pad - 2 * gap, ih = page.height - 2 * pad, x0 = page.x + pad, y0 = page.y + pad, lw = iw * 0.27, mw = iw * 0.4, rw = iw - lw - mw;
  const left = { x: x0, y: y0, width: lw, height: ih }, mid = { x: x0 + lw + gap, y: y0, width: mw, height: ih }, right = { x: mid.x + mw + gap, y: y0, width: rw, height: ih };
  const r = Math.min(lw * 0.36, ih * 0.2), bw = Math.min(rw, 200 * k), bh = Math.max(MIN_TARGET, 50 * k);
  return { view, page, left, mid, right, rose: { x: x0 + lw / 2, y: y0 + 106 * k + r, r }, cont: { x: right.x + rw - bw, y: y0 + ih - bh, width: bw, height: bh }, k };
}

/** Seconds until everything is written: the results, the next voyage's page. */
export const RESULTS_END = 6.4;
export const NEXT_END = 2.6;

export function drawResults(g: G, m: ResultsModel, l: ResultsLayout, t: number): void {
  const { page, k } = l;
  scrap(g, page, 5101, { alpha: ease(t / 0.4) });
  inkRect(g, inset(page, 7 * k), 5102, clamp01(t / 0.9), SEPIA, 1.3 * k);
  if (m.won) goldLeaf(g, inset(page, 2), 5103, clamp01((t - 0.4) / 1), 4 * k);
  for (const x of [l.mid.x - 7 * k, l.right.x - 7 * k]) nib(g, [[x, page.y + 26 * k], [x + 1, page.y + page.height / 2], [x, page.y + page.height - 26 * k]], 0.8 * k, clamp01((t - 0.3) / 0.8), rgba(SEPIA, 0.6));
  drawPlace(g, m, l, t);
  drawRose(g, m, l, t - 1.6);
  drawTallies(g, m, l, t - 0.6);
  drawTimeline(g, m, l, t - 1.2);
  drawFates(g, m, l, t - 3.4);
  drawLeague(g, m, l, t - 3.6);
  inkButton(g, l.cont, 'The next voyage', k, clamp01((t - 1.4) / 0.6));
}

export interface NextLayout { view: View; page: Rect; cells: Rect[]; cont: Rect; k: number }

/** The next voyage's page: the heading and "To harbour" across the top, the nine cards three by three beneath. */
export function nextLayout(view: View): NextLayout {
  const page = inset(safeOf(view), 6), k = Math.max(1, Math.min(1.45, page.height / 408)), pad = 14 * k, gap = 8 * k;
  const bh = Math.max(MIN_TARGET, 46 * k), bw = Math.min(190 * k, page.width * 0.3), head = bh + 12 * k;
  const x0 = page.x + pad, y0 = page.y + pad + head, cw = (page.width - 2 * pad - 2 * gap) / 3, ch = (page.y + page.height - pad - y0 - 2 * gap) / 3;
  const cells = Array.from({ length: 9 }, (_, i) => ({ x: x0 + (i % 3) * (cw + gap), y: y0 + Math.floor(i / 3) * (ch + gap), width: cw, height: ch }));
  return { view, page, cells, cont: { x: page.x + page.width - pad - bw, y: page.y + pad, width: bw, height: bh }, k };
}

/** The nine captains of the next voyage written in, `t` s after the page turned; `emblems` by card, drawn by the caller. */
export function drawNextNine(g: G, m: ResultsModel, l: NextLayout, t: number, emblems: readonly (CanvasImageSource | null)[] = []): void {
  const { page, k } = l;
  scrap(g, page, 5201, { alpha: ease(t / 0.3) });
  inkRect(g, inset(page, 7 * k), 5202, clamp01(t / 0.7), SEPIA, 1.3 * k);
  const hy = l.cont.y + l.cont.height / 2, x = page.x + 16 * k;
  letter(g, 'The next voyage', x, hy - 6 * k, { size: 26 * k, valign: 'middle', swash: true }, INK, clamp01(t / 0.8));
  letter(g, `The nine captains nearest your rank, ${m.rank.wind}`, x + 4 * k, hy + 16 * k, { size: 13 * k, valign: 'middle' }, SEPIA, clamp01((t - 0.3) / 0.6));
  m.next.forEach((c, i) => { if (l.cells[i]) drawCaptain(g, c, l.cells[i], k, clamp01((t - 0.35 - i * 0.12) / 0.6), emblems[i] ?? null, 5300 + i * 7); });
  inkButton(g, l.cont, 'To harbour', k, clamp01((t - 1) / 0.6));
}

/** One captain's card: its emblem, name and meaning, temperament, form and wind, what it remembers of you. */
function drawCaptain(g: G, c: Card, r: Rect, k: number, p: number, emblem: CanvasImageSource | null, seed: number): void {
  if (p <= 0) return;
  const u = Math.min(12 * k, r.height / 8.6), pad = 7 * k, ew = u * 2.3, eh = u * 2.8, x = r.x + pad + 2 * k, mw = r.width - 2 * pad - ew - 6 * k;
  g.save();
  g.globalAlpha *= ease(p / 0.5);
  scrap(g, r, seed, { tint: '#f4e9d0', shadow: false });
  g.restore();
  inkRect(g, inset(r, 3 * k), seed + 1, p, pigmentHex(c.pigments[0]), 1.1 * k);
  if (emblem) {
    g.save();
    g.globalAlpha *= p;
    g.drawImage(emblem, r.x + r.width - pad - ew, r.y + pad, ew, eh);
    g.restore();
  }
  let y = r.y + pad + u * 0.85;
  letter(g, c.name, x, y, { size: u * 1.5, valign: 'middle', swash: true, maxWidth: mw }, INK, p);
  y += u * 1.45;
  letter(g, `“${c.meaning}”`, x, y, { size: u * 0.95, valign: 'middle', maxWidth: mw }, SEPIA, p);
  y += u * 1.3;
  letter(g, `${c.temperament} · ${c.form} · ${c.wind}`, x, y, { size: u, valign: 'middle', maxWidth: r.width - 2 * pad }, INK, p);
  y += u * 0.75;
  letter(g, c.line, x, y, { size: u * 0.95, valign: 'top', maxWidth: r.width - 2 * pad, lineHeight: 1.12 }, c.record === c.line ? SEPIA : VERMILION, p);
  if (c.record !== c.line) letter(g, c.record, x, r.y + r.height - pad, { size: u * 0.9, valign: 'bottom', maxWidth: r.width - 2 * pad }, SEPIA, p);
}

function drawPlace(g: G, m: ResultsModel, l: ResultsLayout, t: number): void {
  const L = l.left, k = l.k, cx = L.x + L.width / 2;
  letter(g, ORDINALS[m.place - 1] ?? String(m.place), cx, L.y + 24 * k, { size: 42 * k, align: 'center', valign: 'middle', swash: true }, m.won ? GOLD_DARK : INK, clamp01(t / 1.2));
  letter(g, 'of ten', cx, L.y + 54 * k, { size: 15 * k, align: 'center', valign: 'middle' }, SEPIA, clamp01((t - 0.6) / 0.6));
  letter(g, m.ending, cx, L.y + 76 * k, { size: 13.5 * k, align: 'center', valign: 'middle', maxWidth: L.width }, m.won ? GOLD_DARK : VERMILION, clamp01((t - 0.9) / 0.9));
}

function drawRose(g: G, m: ResultsModel, l: ResultsLayout, t: number): void {
  if (t <= 0) return;
  const { x, y, r } = l.rose, k = l.k, R = m.rank;
  g.save();
  g.globalAlpha *= ease(t / 0.8);
  nib(g, ring(x, y, r, 51), 1.4 * k, clamp01(t / 0.8), INK);
  nib(g, ring(x, y, r * 0.86, 52), 0.9 * k, clamp01(t / 0.8), SEPIA);
  for (let i = 0; i < 8; i++) kite(g, x, y, (i + 0.5) * (Math.PI / 4), r * 0.5, r * 0.07, rgba(VERDIGRIS, 0.85), PAPER, k);
  const v = R.before / R.perTier + (R.after / R.perTier - R.before / R.perTier) * ease((t - 0.6) / 1.4);
  const now = Math.max(1, Math.min(8, Math.floor(v) + 1));
  for (let i = 1; i <= 8; i++) {
    const reached = i <= now;
    kite(g, x, y, i * (Math.PI / 4), r * 0.84, r * 0.12, reached ? rgba(VERMILION, 0.9) : rgba(INK, 0.75), reached ? rgba(VERMILION, 0.3) : PAPER, k);
    letter(g, RANK.winds[i - 1][0], x + Math.sin((i * Math.PI) / 4) * r * 1.15, y - Math.cos((i * Math.PI) / 4) * r * 1.15, { size: 13 * k, align: 'center', valign: 'middle' }, i === now ? VERMILION : SEPIA, clamp01(t));
  }
  const frac = now >= 8 ? 1 : v - Math.floor(v), a0 = now * (Math.PI / 4) - Math.PI / 2;
  g.beginPath();
  g.arc(x, y, r * 0.93, a0, a0 + Math.max(0.001, frac * (Math.PI / 4)));
  g.strokeStyle = VERMILION;
  g.lineWidth = 4 * k;
  g.lineCap = 'round';
  g.stroke();
  wash(g, PAPER, 0.95, (gg) => gg.arc(x, y, r * 0.3, 0, Math.PI * 2));
  nib(g, ring(x, y, r * 0.3, 53), 0.9 * k, 1, GOLD_DARK);
  const d = R.after - R.before;
  letter(g, String(Math.abs(d)), x, y, { size: 19 * k, align: 'center', valign: 'middle' }, d >= 0 ? INK : VERMILION, clamp01((t - 1.4) / 0.6));
  const ty = y + r + 26 * k;
  letter(g, R.wind, x, ty, { size: 19 * k, align: 'center', valign: 'middle', swash: true }, INK, clamp01((t - 1) / 0.8));
  letter(g, `${R.after} points, ${d >= 0 ? 'gained' : 'lost'} ${Math.abs(d)}`, x, ty + 22 * k, { size: 13 * k, align: 'center', valign: 'middle' }, SEPIA, clamp01((t - 1.2) / 0.8));
  if (R.promoted) letter(g, `Raised to ${R.wind}`, x, ty + 44 * k, { size: 16 * k, align: 'center', valign: 'middle', swash: true }, VERMILION, clamp01((t - 2) / 0.8));
  g.restore();
}

function drawTallies(g: G, m: ResultsModel, l: ResultsLayout, t: number): void {
  if (t <= 0) return;
  const M = l.mid, k = l.k, cw = M.width / 4, y = M.y + 20 * k, s = 30 * k;
  const cells: [number, string][] = [[m.claimed, 'sea claimed'], [m.sank, 'ships sunk'], [m.bank, 'banked'], [m.treasure, 'brought home']];
  cells.forEach(([n, label], i) => {
    const p = clamp01((t - i * 0.25) / 0.6), cx = M.x + cw * (i + 0.5);
    if (p <= 0) return;
    if (i === 0) { // a patch of sea claimed, as the chart draws one: washed, hatched inside its line
      const edge = ring(cx, y, s * 0.6, 23, -Math.PI / 2, Math.PI * 2, 18).map(([x, yy], j): [number, number] => { const f = 1 + 0.12 * Math.sin(j * 2.3); return [cx + (x - cx) * f, y + (yy - y) * f * 0.8]; });
      const patch = (gg: G): void => { gg.moveTo(...edge[0]); for (const q of edge) gg.lineTo(...q); gg.closePath(); };
      wash(g, VERDIGRIS, 0.4 * p, patch);
      g.save();
      g.beginPath();
      patch(g);
      g.clip();
      for (let j = -3; j <= 3; j++) nib(g, [[cx + j * s * 0.17 - s * 0.35, y + s * 0.5], [cx + j * s * 0.17 + s * 0.35, y - s * 0.5]], 0.7 * k, p, INK, 0.6);
      g.restore();
      nib(g, edge, 1.3 * k, p, INK);
    } else if (i === 1) shipGlyph(g, cx, y, s, p);
    else if (i === 2) strongbox(g, cx, y, s, p);
    else pouch(g, cx, y - 0.12 * s, s * 0.82, 200, p); // a full purse's size, clear of its figure
    const q = Math.min(1, Math.round(ease((t - i * 0.25) / 1.2) * 12) / 12);
    letter(g, String(Math.round(n * q)), cx, y + 30 * k, { size: 21 * k, align: 'center', valign: 'middle' }, INK, 1, p);
    letter(g, label, cx, y + 50 * k, { size: 12 * k, align: 'center', valign: 'middle' }, SEPIA, p);
  });
}

function drawTimeline(g: G, m: ResultsModel, l: ResultsLayout, t: number): void {
  if (t <= 0) return;
  const M = l.mid, k = l.k, top = M.y + 108 * k, row = 21 * k, foot = (m.named.length || (m.firstVoyage && m.lessons.length) ? 22 * k : 0);
  const bottom = M.y + M.height - 62 * k - foot;
  letter(g, 'The voyage', M.x, top - 18 * k, { size: 18 * k, valign: 'middle', swash: true }, INK, clamp01(t / 0.8));
  const fit = Math.max(2, Math.floor((bottom - top) / row));
  const lines = m.timeline.length <= fit ? m.timeline : [...m.timeline.slice(0, fit - 2), null, m.timeline[m.timeline.length - 1]];
  const rx = M.x + 44 * k;
  nib(g, [[rx, top - 4 * k], [rx, top + row * Math.max(0.5, lines.length - 0.6)]], 1 * k, clamp01(t / 2), SEPIA);
  lines.forEach((e, i) => {
    const p = clamp01((t - 0.3 - i * 0.32) / 0.6), y = top + row * (i + 0.2);
    if (p <= 0) return;
    if (e === null) { letter(g, '...', rx + 12 * k, y, { size: 14 * k, valign: 'middle' }, SEPIA, p); return; }
    letter(g, e.clock, rx - 8 * k, y, { size: 12 * k, align: 'right', valign: 'middle' }, SEPIA, p);
    g.save();
    g.globalAlpha *= p;
    g.beginPath();
    g.arc(rx, y, 3.4 * k, 0, Math.PI * 2);
    g.fillStyle = e.tone === 'good' ? VERDIGRIS : e.tone === 'bad' ? VERMILION : SEPIA;
    g.fill();
    g.restore();
    letter(g, e.text, rx + 12 * k, y, { size: 14.5 * k, valign: 'middle', maxWidth: M.width - 58 * k }, e.tone === 'bad' ? VERMILION : INK, p);
  });
  const fy = M.y + M.height - 60 * k, pf = clamp01((t - 2.6) / 0.8);
  if (m.named.length) letter(g, `First named: ${m.named.map(lower).join(', ')}`, M.x, fy, { size: 13 * k, valign: 'middle', maxWidth: M.width }, VERDIGRIS, pf);
  else if (m.firstVoyage && m.lessons.length) letter(g, `Learned ${m.lessons.length} of the seven ways of the sea`, M.x, fy, { size: 13 * k, valign: 'middle', maxWidth: M.width }, VERDIGRIS, pf);
}

function drawFates(g: G, m: ResultsModel, l: ResultsLayout, t: number): void {
  if (t <= 0 || m.fates.length === 0) return;
  const M = l.mid, k = l.k, gap = M.width / m.fates.length, r = Math.min(13 * k, gap / 2 - 3), y = M.y + M.height - 16 * k;
  m.fates.forEach((f, i) => {
    const p = clamp01((t - i * 0.08) / 0.5), x = M.x + gap * (i + 0.5);
    if (p <= 0) return;
    g.save();
    g.globalAlpha *= p;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = rgba(f.pigments[0], 0.85); g.fill();
    g.beginPath(); g.arc(x, y, r, -Math.PI / 2, Math.PI / 2); g.fillStyle = rgba(f.pigments[1], 0.85); g.fill();
    nib(g, ring(x, y, r, 70 + i), 1.1 * k, 1, f.place === 1 ? GOLD_DARK : INK);
    letter(g, String(f.place), x, y - r - 9 * k, { size: 12 * k, align: 'center', valign: 'middle' }, f.place === 1 ? GOLD_DARK : SEPIA);
    if (f.byYou) {
      nib(g, [[x - r * 0.7, y - r * 0.7], [x + r * 0.7, y + r * 0.7]], 2 * k, 1, VERMILION);
      nib(g, [[x + r * 0.7, y - r * 0.7], [x - r * 0.7, y + r * 0.7]], 2 * k, 1, VERMILION);
    }
    g.restore();
  });
}

function drawLeague(g: G, m: ResultsModel, l: ResultsLayout, t: number): void {
  const Rr = l.right, k = l.k, top = Rr.y + 30 * k, rows = Math.min(9, m.league.length), row = Math.min(28 * k, (l.cont.y - 14 * k - top) / Math.max(1, rows));
  const pa = clamp01((t + 1.6) / 0.8);
  if (pa <= 0) return;
  letter(g, 'The league', Rr.x, Rr.y + 8 * k, { size: 18 * k, valign: 'middle', swash: true }, INK, pa);
  const me = m.league.find((r) => r.player), centre = me ? Math.min(me.to, me.from) : 1;
  const first = Math.max(1, Math.min(centre - 4, m.league.length - rows + 1)), mv = ease((t - 0.4) / 1.4);
  g.save();
  g.globalAlpha *= pa;
  g.beginPath();
  g.rect(Rr.x - 4, top - 2, Rr.width + 8, row * rows + 4);
  g.clip();
  for (const r of m.league) {
    const place = r.from + (r.to - r.from) * mv, slot = place - first;
    if (slot < -1 || slot > rows) continue;
    const y = top + row * (slot + 0.5);
    if (r.player) wash(g, OCHRE, 0.32, (gg) => gg.rect(Rr.x - 2, y - row * 0.45, Rr.width + 4, row * 0.9));
    letter(g, String(Math.round(place)), Rr.x + 20 * k, y, { size: 13 * k, align: 'right', valign: 'middle' }, SEPIA);
    letter(g, r.name, Rr.x + 28 * k, y, { size: 14.5 * k, valign: 'middle', maxWidth: Rr.width - 84 * k }, INK);
    letter(g, String(r.points), Rr.x + Rr.width - 4 * k, y, { size: 13 * k, align: 'right', valign: 'middle' }, SEPIA);
    if (r.to !== r.from && mv > 0) {
      const up = r.to < r.from, ax = Rr.x + Rr.width - 44 * k, d = (up ? -1 : 1) * 5 * k;
      nib(g, [[ax - 4 * k, y - d], [ax, y + d], [ax + 4 * k, y - d]], 1.4 * k, mv, up ? VERDIGRIS : VERMILION);
    }
  }
  g.restore();
}

export type ResultsCue = 'page' | 'quill' | 'confirm' | 'tap';

/** The results page as interface: layout, frames (the writing), touches (finish the writing, then go on). */
export class ResultsSheet {
  readonly group = new THREE.Group();
  private sheet: Sheet | null = null;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private l: ResultsLayout | null = null;
  private t = 0;
  private acc = 0;
  private line = -1;
  private raised = false;
  /** The leaf up: 0 the results, 1 the next voyage (written in from `t` = 0 again). */
  private leaf = 0;
  private nl: NextLayout | null = null;
  private emblems: HTMLCanvasElement[] = [];

  readonly model: ResultsModel;
  private readonly onContinue: () => void;
  private readonly cue: (c: ResultsCue) => void;

  constructor(model: ResultsModel, onContinue: () => void, cue: (c: ResultsCue) => void = () => {}) {
    this.model = model;
    this.onContinue = onContinue;
    this.cue = cue;
    cue('page');
  }

  /** The leaf up (0 the results, 1 the next voyage) and where its button is. */
  get page(): number { return this.leaf; }
  get button(): Rect | null { return this.leaf === 0 ? this.l?.cont ?? null : this.nl?.cont ?? null; }

  layout(view: View): void {
    drop(this.group);
    this.nl = nextLayout(view);
    const u = Math.min(12 * this.nl.k, this.nl.cells[0].height / 8.6);
    this.emblems = this.model.next.map((c) => emblemSheet(u * 2.3, u * 2.8, c.pigments, c.emblem, view.dpr).canvas);
    const l = this.l = resultsLayout(view);
    this.sheet = sheet(l.page.width, l.page.height, 3_000_000, view.dpr);
    this.mesh = sheetMesh(this.sheet);
    this.mesh.position.set(l.page.x + l.page.width / 2, l.page.y + l.page.height / 2, 0);
    this.mesh.renderOrder = 20;
    this.group.add(this.mesh);
    this.redraw();
  }

  touch(t: Touch): boolean {
    if (t.phase !== 'up' || this.l === null) return true;
    const end = this.leaf === 0 ? RESULTS_END : NEXT_END, b = this.button;
    if (this.t < end) {
      this.t = end;
      this.cue('tap');
      this.redraw();
    } else if (b && inside(b, t.x, t.y)) {
      if (this.leaf === 1) {
        this.cue('confirm');
        this.onContinue();
        return true;
      }
      this.leaf = 1;
      this.t = this.acc = 0;
      this.cue('page');
      this.redraw();
    }
    return true;
  }

  frame(dt: number): void {
    if (this.leaf === 1) {
      if (this.t >= NEXT_END + 0.5) return;
      this.t += dt;
      this.acc += dt;
      if (this.acc >= 1 / 30 || this.t >= NEXT_END) { this.acc = 0; this.redraw(); }
      return;
    }
    if (this.t >= RESULTS_END + 0.5) return;
    this.t += dt;
    const line = Math.floor((this.t - 1.5) / 0.32);
    if (line > this.line && line < this.model.timeline.length) {
      this.line = line;
      this.cue('quill');
    }
    if (this.model.rank.promoted && !this.raised && this.t > 3.6) {
      this.raised = true;
      this.cue('confirm');
    }
    this.acc += dt;
    if (this.acc >= 1 / 30 || this.t >= RESULTS_END) {
      this.acc = 0;
      this.redraw();
    }
  }

  dispose(): void { drop(this.group); }

  private redraw(): void {
    const s = this.sheet, l = this.l, m = this.mesh;
    if (!s || !l || !m) return;
    s.g.clearRect(0, 0, s.w, s.h);
    s.g.save();
    s.g.translate(-l.page.x, -l.page.y);
    if (this.leaf === 1 && this.nl) drawNextNine(s.g, this.model, this.nl, this.t, this.emblems);
    else drawResults(s.g, this.model, l, this.t);
    s.g.restore();
    if (m.material.map) m.material.map.needsUpdate = true;
  }
}

export const RESULTS_GOLD = GOLD;

/** `band`: CSS px from the card's top (and a margin) to the screen's foot, which the chart keeps clear (S-019: the
 *  match plays out on the chart framed whole above the card, never under it). */
export interface SkipLayout { card: Rect; button: Rect; k: number; band: number }

/** The skip card on the foot of the safe area, a slim strip; its button at the right. */
export function skipLayout(view: View): SkipLayout {
  const s = safeOf(view), k = Math.max(1, Math.min(1.45, s.height / 420)), w = Math.min(s.width - 16, 470 * k), h = Math.max(MIN_TARGET + 12, 56 * k);
  const card = { x: s.x + (s.width - w) / 2, y: s.y + s.height - h - 2 * k, width: w, height: h };
  const bw = 176 * k, bh = Math.max(MIN_TARGET, 44 * k);
  return { card, button: { x: card.x + w - bw - 8 * k, y: card.y + (h - bh) / 2, width: bw, height: bh }, k, band: view.height - card.y + 6 * k };
}

/** How she sank, how many sail on while the match plays out on the chart, and the way straight to the results. */
export function drawSkip(g: G, l: SkipLayout, ending: string, afloat: number, rushing: boolean, t: number): void {
  const { card: c, k } = l, p = clamp01(t / 0.6), x = c.x + 16 * k, mw = l.button.x - x - 10 * k;
  if (p <= 0) return;
  g.save();
  g.globalAlpha *= ease(p);
  scrap(g, c, 5401, { tint: '#f4e9d0' });
  g.restore();
  inkRect(g, inset(c, 5 * k), 5402, p, SEPIA, 1.2 * k);
  letter(g, ending, x, c.y + c.height * 0.36, { size: 17 * k, valign: 'middle', swash: true, maxWidth: mw }, VERMILION, p);
  const sail = afloat === 1 ? 'One ship sails on' : `${afloat} ships sail on`;
  letter(g, rushing ? 'The rest of the match is resolved' : `${sail}; the match plays out on the chart`, x, c.y + c.height * 0.7, { size: 12.5 * k, valign: 'middle', maxWidth: mw }, SEPIA, clamp01((t - 0.3) / 0.6));
  inkButton(g, l.button, rushing ? 'Resolving' : 'To the results', k, clamp01((t - 0.4) / 0.5), rushing ? SEPIA : INK);
}

/** The sinking flow's card (PROMPT.md, Sinking and the end): up once the player's ship is gone; its button skips. */
export class SkipCard {
  readonly group = new THREE.Group();
  private sheet: Sheet | null = null;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private l: SkipLayout | null = null;
  private view: View | null = null;
  private t = 0;
  private finger = -1;
  private words = { ending: '', afloat: 0, rushing: false };
  private readonly onSkip: () => void;
  private readonly cue: (c: ResultsCue) => void;

  constructor(onSkip: () => void, cue: (c: ResultsCue) => void = () => {}) {
    this.onSkip = onSkip;
    this.cue = cue;
  }

  /** Where the button is (null until laid out). */
  get button(): Rect | null { return this.l?.button ?? null; }

  layout(view: View): void {
    this.view = view;
    drop(this.group);
    const l = this.l = skipLayout(view);
    this.sheet = sheet(l.card.width, l.card.height, 600_000, view.dpr);
    this.mesh = sheetMesh(this.sheet);
    this.mesh.position.set(l.card.x + l.card.width / 2, l.card.y + l.card.height / 2, 0);
    this.mesh.renderOrder = 30;
    this.group.add(this.mesh);
    this.redraw();
  }

  /** What the card says; redrawn when it changes. */
  set(ending: string, afloat: number, rushing: boolean): void {
    const w = this.words;
    if (w.ending === ending && w.afloat === afloat && w.rushing === rushing) return;
    this.words = { ending, afloat, rushing };
    this.redraw();
  }

  touch(t: Touch): boolean {
    const b = this.l?.button;
    if (!b) return false;
    if (t.phase === 'down') {
      if (this.finger >= 0 || !inside(b, t.x, t.y)) return false;
      this.finger = t.id;
      return true;
    }
    if (t.id !== this.finger) return false;
    if (t.phase === 'up' || t.phase === 'cancel') {
      this.finger = -1;
      if (t.phase === 'up' && inside(b, t.x, t.y) && !this.words.rushing) {
        this.cue('confirm');
        this.onSkip();
      }
    }
    return true;
  }

  frame(dt: number): void {
    if (this.t > 1) return;
    this.t += dt;
    this.redraw();
  }

  dispose(): void { drop(this.group); }

  private redraw(): void {
    const s = this.sheet, l = this.l, m = this.mesh;
    if (!s || !l || !m || !this.view) return;
    s.g.clearRect(0, 0, s.w, s.h);
    s.g.save();
    s.g.translate(-l.card.x, -l.card.y);
    drawSkip(s.g, l, this.words.ending, this.words.afloat, this.words.rushing, this.t);
    s.g.restore();
    if (m.material.map) m.material.map.needsUpdate = true;
  }
}
