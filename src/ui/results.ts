// WP27: the results (PROMPT.md, The results): the end of the match explained on one parchment page so the player always
// understands why it won or lost. The place in the hand's swash capitals and how it ended; the tallies counting up (sea
// claimed, ships sunk, doubloons banked, treasure brought home); the timeline of the moments that decided it (where it
// broke off, the loops it closed, the trails it lost and broke, the chests it chose, the ships it sank, how it sank or
// won) written in one by one with the quill; the nine rivals' fates as roundels in their captains' pigments; the rank
// points inking onto the portolan wind rose (Greco to Tramontana) with a promotion lettered in vermilion; the league
// table sliding to its new order; the seas first named and, on the first voyage, the lessons learned. A tap finishes
// the writing; "To harbour" goes on. Everything is read from MatchResult, the career before and after, and the Voyage.
import * as THREE from 'three';
import { RANK, tierOf, type Career } from '../career/state.ts';
import { toLetter, type Voyage } from '../career/voyage.ts';
import { drop, sheet, sheetMesh, type Sheet } from '../render/harbourScene.ts';
import type { MatchResult } from '../sim/end.ts';
import { EVENT, SHIPS, TICK, type Entry } from '../sim/state.ts';
import { REGIONS } from '../sim/world/regions.ts';
import { NAMED_PIGMENTS } from '../style/palette.ts';
import { captainCard, leagueRows } from './cards.ts';
import { kite } from './careerChart.ts';
import { itemName } from './chestChoice.ts';
import { INK, nib, pouch, ring, shipGlyph, strongbox, wash } from './icons.ts';
import {
  GOLD, GOLD_DARK, MIN_TARGET, OCHRE, ORDINALS, PAPER, SEPIA, VERDIGRIS, VERMILION, clamp01, ease, goldLeaf, inkButton, inkRect, inset, inside, letter, rgba, safeOf, scrap,
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
}

/** The page's content: `drawn` are the league ids of ships 1–9 (toSetup), `after` = applyResult(before, result, voyage). */
export function resultsModel(before: Career, after: Career, result: MatchResult, drawn: readonly number[], voyage?: Voyage): ResultsModel {
  const me = result.ships[0];
  const nameOf = (ship: number): string => (ship === 0 ? 'you' : ship > 0 && ship < SHIPS && drawn[ship - 1] !== undefined ? captainCard(before, drawn[ship - 1]).name : 'the sea');
  const sunkBy = (by: number, cause: number): string =>
    by === 0 ? 'Sunk by you' : by > 0 && cause >= 0 && cause <= 2 ? `Sunk by ${lower(nameOf(by))}'s ${CAUSE_WORDS[cause]}` : by > 0 ? `Sunk by ${lower(nameOf(by))}` : `Lost to ${CAUSE_WORDS[cause] ?? 'the sea'}`;
  const won = me.place === 1, ending = won ? 'Last afloat as the storm closed' : sunkBy(me.by, me.cause);
  const lineOf = (e: Entry): TimelineLine | null => {
    const key = EVENT_KEY[e.kind] ?? '', mine = e.ship === 0;
    let text: string, tone: TimelineLine['tone'] = 'plain';
    switch (key) {
      case 'home': text = voyage && voyage.breakOff >= 0 ? `Broke off into ${lower(REGIONS[voyage.breakOff].name)}` : 'Broke off and inked a home'; tone = 'good'; break;
      case 'loop': text = `Closed a loop, ${Math.round(e.amount)} of sea`; tone = 'good'; break;
      case 'broken': if (mine) { text = `${cap(lower(nameOf(e.by)))} broke your trail`; tone = 'bad'; } else { text = `Broke ${lower(nameOf(e.ship))}'s trail`; tone = 'good'; } break;
      case 'chosen': text = `Chose the ${itemName(e.by)}`; break;
      case 'bank': text = `Banked ${Math.round(e.amount)} doubloons`; tone = 'good'; break;
      case 'sunk': if (mine) { text = sunkBy(e.by, Math.round(e.amount)); tone = 'bad'; } else { text = `Sank ${lower(nameOf(e.ship))}`; tone = 'good'; } break;
      default:
        if (!key) return null;
        text = /pennant/i.test(key) ? (mine ? 'Took the gold pennant' : `${cap(lower(nameOf(e.ship)))} took the pennant`) : /find|found|treasure|scoop/i.test(key) ? 'Took a find' : cap(key.replace(/([A-Z])/g, ' $1').toLowerCase());
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
    lessons: voyage ? voyage.lessons.flatMap((t, k) => (t >= 0 ? [k] : [])) : [], firstVoyage: before.match === 0,
  };
}

export interface ResultsLayout { view: View; page: Rect; left: Rect; mid: Rect; right: Rect; rose: { x: number; y: number; r: number }; cont: Rect; k: number }

/** Three columns on the page: the place and the rose, the voyage, the league; "To harbour" at the foot of the third. */
export function resultsLayout(view: View): ResultsLayout {
  const page = inset(safeOf(view), 6), k = Math.max(1, Math.min(1.45, page.height / 408)), pad = 16 * k, gap = 14 * k;
  const iw = page.width - 2 * pad - 2 * gap, ih = page.height - 2 * pad, x0 = page.x + pad, y0 = page.y + pad, lw = iw * 0.27, mw = iw * 0.4, rw = iw - lw - mw;
  const left = { x: x0, y: y0, width: lw, height: ih }, mid = { x: x0 + lw + gap, y: y0, width: mw, height: ih }, right = { x: mid.x + mw + gap, y: y0, width: rw, height: ih };
  const r = Math.min(lw * 0.36, ih * 0.2), bw = Math.min(rw, 200 * k), bh = Math.max(MIN_TARGET, 50 * k);
  return { view, page, left, mid, right, rose: { x: x0 + lw / 2, y: y0 + 106 * k + r, r }, cont: { x: right.x + rw - bw, y: y0 + ih - bh, width: bw, height: bh }, k };
}

/** Seconds until everything is written. */
export const RESULTS_END = 6.4;

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
  inkButton(g, l.cont, 'To harbour', k, clamp01((t - 1.4) / 0.6));
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
    if (i === 0) {
      wash(g, VERDIGRIS, 0.35 * p, (gg) => gg.rect(cx - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8));
      for (let j = 0; j < 5; j++) nib(g, [[cx - s * 0.4 + j * s * 0.2, y + s * 0.4], [cx - s * 0.4 + j * s * 0.2 + s * 0.2, y - s * 0.4]], 0.8 * k, p, INK);
    } else if (i === 1) shipGlyph(g, cx, y, s, p);
    else if (i === 2) strongbox(g, cx, y, s, p);
    else pouch(g, cx, y, s, Math.max(1, n), p);
    const q = Math.min(1, Math.round(ease((t - i * 0.25) / 1.2) * 12) / 12);
    letter(g, String(Math.round(n * q)), cx, y + 30 * k, { size: 21 * k, align: 'center', valign: 'middle' }, INK, 1, p);
    letter(g, label, cx, y + 50 * k, { size: 12 * k, align: 'center', valign: 'middle' }, SEPIA, p);
  });
}

function drawTimeline(g: G, m: ResultsModel, l: ResultsLayout, t: number): void {
  if (t <= 0) return;
  const M = l.mid, k = l.k, top = M.y + 98 * k, row = 21 * k, foot = (m.named.length || (m.firstVoyage && m.lessons.length) ? 22 * k : 0);
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

  readonly model: ResultsModel;
  private readonly onContinue: () => void;
  private readonly cue: (c: ResultsCue) => void;

  constructor(model: ResultsModel, onContinue: () => void, cue: (c: ResultsCue) => void = () => {}) {
    this.model = model;
    this.onContinue = onContinue;
    this.cue = cue;
    cue('page');
  }

  layout(view: View): void {
    drop(this.group);
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
    if (this.t < RESULTS_END) {
      this.t = RESULTS_END;
      this.cue('tap');
      this.redraw();
    } else if (inside(this.l.cont, t.x, t.y)) {
      this.cue('confirm');
      this.onContinue();
    }
    return true;
  }

  frame(dt: number): void {
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
    drawResults(s.g, this.model, l, this.t);
    s.g.restore();
    if (m.material.map) m.material.map.needsUpdate = true;
  }
}

export const RESULTS_GOLD = GOLD;
