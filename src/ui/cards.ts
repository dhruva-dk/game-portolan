// WP26 the harbour's model, pure (no three.js, no DOM), so it can be tested in Node: the harbour's pages and how they
// connect, where every touch target lies on each device, the league table, the nine captains' cards, the forms and the
// gull's traits as the shipwright and the gull's page show them, and the harbour's actions on the career (WP10 API).
import { cardLine, recordLine } from '../career/learn.ts';
import { CAPTAINS, TEMPERAMENT, captainForm, draw, TRAITS, type Trait } from '../career/league.ts';
import { GULL_PRICES, buyGull, chooseForm, gullPrice } from '../career/progress.ts';
import { LEAGUE, RANK, tierOf, unlockedForms, type Career } from '../career/state.ts';
import { FORM } from '../sim/tables.ts';
import { safeRect, type Rect, type View } from './safeArea.ts';

// ——— pages ———

export type Page = 'home' | 'shipwright' | 'gull' | 'league' | 'captains' | 'chart' | 'settings' | 'credits' | 'reset';
export const PAGES: readonly Page[] = ['home', 'shipwright', 'gull', 'league', 'captains', 'chart', 'settings', 'credits', 'reset'];
/** Where each page leads besides back. */
export const LINKS: Readonly<Record<Page, readonly Page[]>> = {
  home: ['shipwright', 'gull', 'league', 'captains', 'chart', 'settings'],
  shipwright: [], gull: [], league: ['captains'], captains: [], chart: [], settings: ['credits', 'reset'], credits: [], reset: [],
};
/** Where back goes. */
export const PARENT: Readonly<Record<Page, Page | null>> = {
  home: null, shipwright: 'home', gull: 'home', league: 'home', captains: 'home', chart: 'home', settings: 'home', credits: 'settings', reset: 'settings',
};
/** The ledger's heading (swash) and the label on a link to the page. */
export const TITLES: Readonly<Record<Page, string>> = {
  home: 'Harbour', shipwright: 'The Shipwright', gull: 'The Gull', league: 'The League', captains: 'The Nine',
  chart: 'The Career Chart', settings: 'Settings', credits: 'Credits', reset: 'Begin anew',
};
export const LABELS: Readonly<Record<Page, string>> = {
  home: 'Harbour', shipwright: 'Shipwright', gull: 'The gull', league: 'The league', captains: 'The nine',
  chart: 'Career chart', settings: 'Settings', credits: 'Credits', reset: 'Begin anew',
};

// ——— layout ———

/** The least side of a touch target, CSS px (= pt). */
export const MIN_TARGET = 44;

export type TargetKind = 'sail' | 'link' | 'back' | 'form' | 'trait' | 'level' | 'toggle' | 'confirm';
export interface Target extends Rect {
  readonly id: string;
  readonly kind: TargetKind;
  /** link: the page; level/toggle: the setting; trait: the trait; confirm: yes/no. */
  readonly key?: string;
  /** form: the form; level: the step. */
  readonly value?: number;
}

export interface HarbourLayout {
  readonly page: Page;
  readonly safe: Rect;
  /** Lettering and spacing scale: 1 on the iPhone, up to 1.5 on the iPad. */
  readonly s: number;
  /** The unrolled ledger page (null on the harbour itself) and its body below the heading. */
  readonly ledger: Rect | null;
  readonly body: Rect | null;
  readonly heading: { x: number; y: number; size: number } | null;
  /** The harbour: the set-sail seal and the rank line. */
  readonly seal: { x: number; y: number; r: number } | null;
  readonly status: { x: number; y: number; size: number } | null;
  /** Card rectangles (the shipwright's forms, the nine) and row slots (gull, settings). */
  readonly cells: Rect[];
  readonly targets: Target[];
}

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const SETTING_ROWS = ['sound', 'music', 'haptics', 'reducedMotion', 'leftHanded'] as const;
export const SETTING_WORDS: Readonly<Record<(typeof SETTING_ROWS)[number], string>> = {
  sound: 'Sound', music: 'Music', haptics: 'Haptics', reducedMotion: 'Reduced motion', leftHanded: 'Left-handed',
};
export { SETTING_ROWS };

/** Every touch target and frame of `page` on `view`, inside the safe area. */
export function harbourLayout(view: View, page: Page): HarbourLayout {
  const r = safeRect(view);
  const s = Math.max(1, Math.min(1.5, r.height / 420, r.width / 832));
  const targets: Target[] = [];
  const cells: Rect[] = [];
  const tH = Math.max(48, 52 * s);
  if (page === 'home') {
    const radius = Math.max(36, Math.min(80, Math.min(r.width, r.height) * 0.1));
    const seal = { x: r.x + r.width / 2, y: r.y + r.height * 0.42, r: radius };
    targets.push({ id: 'sail', kind: 'sail', ...rect(seal.x - radius, seal.y - radius, radius * 2, radius * 2) });
    const links = LINKS.home, w = 176 * s, gap = 10 * s, n = links.length;
    const th = Math.max(MIN_TARGET + 4, Math.min(tH, (r.height - 16 - (n - 1) * gap) / n)), total = n * th + (n - 1) * gap;
    const x = r.x + r.width - w - 12 * s;
    let y = r.y + Math.max(8, (r.height - total) / 2);
    for (const p of links) {
      targets.push({ id: `link:${p}`, kind: 'link', key: p, ...rect(x, y, w, th) });
      y += th + gap;
    }
    return { page, safe: r, s, ledger: null, body: null, heading: null, seal, status: { x: r.x + 18 * s, y: r.y + 30 * s, size: 17 * s }, cells, targets };
  }
  const mx = 10 * s, my = 8 * s;
  const lw = Math.min(r.width - 2 * mx, 1180), lh = Math.min(r.height - 2 * my, 860);
  const L = rect(r.x + (r.width - lw) / 2, r.y + (r.height - lh) / 2, lw, lh);
  const heading = { x: L.x + L.width / 2, y: L.y + 38 * s, size: 30 * s };
  targets.push({ id: 'back', kind: 'back', ...rect(L.x + 14 * s, L.y + 12 * s, 104 * s, tH) });
  const B = rect(L.x + 24 * s, L.y + 18 * s + tH + 8 * s, L.width - 48 * s, L.height - (18 * s + tH + 8 * s) - 16 * s);
  const side = (id: string, kind: TargetKind, key: string) =>
    targets.push({ id, kind, key, ...rect(L.x + L.width - 14 * s - 150 * s, L.y + 12 * s, 150 * s, tH) });
  if (page === 'shipwright') {
    const gap = 12 * s, cw = (B.width - 3 * gap) / 4;
    for (let f = 0; f < 4; f++) {
      const c = rect(B.x + f * (cw + gap), B.y, cw, B.height);
      cells.push(c);
      targets.push({ id: `form:${f}`, kind: 'form', value: f, ...c });
    }
  } else if (page === 'gull') {
    const left = B.width * 0.34, rh = B.height / TRAITS.length, bw = 132 * s, bh = Math.max(MIN_TARGET, Math.min(rh - 4, tH));
    cells.push(rect(B.x, B.y, left - 12 * s, B.height));
    TRAITS.forEach((t, i) => {
      const row = rect(B.x + left, B.y + i * rh, B.width - left, rh);
      cells.push(row);
      targets.push({ id: `trait:${t}`, kind: 'trait', key: t, ...rect(row.x + row.width - bw, row.y + (rh - bh) / 2, bw, bh) });
    });
  } else if (page === 'league') {
    side('link:captains', 'link', 'captains');
    const cols = 3, per = Math.ceil((LEAGUE + 1) / cols), cw = B.width / cols, rh = B.height / per;
    for (let i = 0; i <= LEAGUE; i++) cells.push(rect(B.x + Math.floor(i / per) * cw, B.y + (i % per) * rh, cw, rh));
  } else if (page === 'captains') {
    const cols = B.width / B.height > 1.9 ? 5 : 3, rows = Math.ceil(9 / cols), gap = 10 * s;
    const cw = (B.width - (cols - 1) * gap) / cols, ch = (B.height - (rows - 1) * gap) / rows;
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / cols), inRow = row < rows - 1 ? cols : 9 - cols * (rows - 1);
      const x0 = B.x + (B.width - (inRow * cw + (inRow - 1) * gap)) / 2;
      cells.push(rect(x0 + (i % cols) * (cw + gap), B.y + row * (ch + gap), cw, ch));
    }
  } else if (page === 'settings') {
    // the volumes a row each, the switches two to a row (so WP25's left-handed switch fits the smallest iPhone)
    const lines = 2 + Math.ceil((SETTING_ROWS.length - 2) / 2), half = B.width / 2;
    const rh = B.height / (lines + 1), bh = Math.max(MIN_TARGET, Math.min(rh - 3, tH)), dot = Math.max(MIN_TARGET, 50 * s), x0 = B.x + B.width * 0.4;
    SETTING_ROWS.forEach((k, i) => {
      const level = k === 'sound' || k === 'music', j = i - 2;
      const row = level ? rect(B.x, B.y + i * rh, B.width, rh) : rect(B.x + (j % 2) * half, B.y + (2 + Math.floor(j / 2)) * rh, half, rh);
      cells.push(row);
      const y = row.y + (rh - bh) / 2;
      if (level) {
        for (let v = 0; v < 5; v++) targets.push({ id: `level:${k}:${v}`, kind: 'level', key: k, value: v, ...rect(x0 + v * (dot + 6 * s), y, dot, bh) });
      } else {
        const tw = Math.max(MIN_TARGET, Math.min(132 * s, half * 0.36));
        targets.push({ id: `toggle:${k}`, kind: 'toggle', key: k, ...rect(row.x + half - tw - 10 * s, y, tw, bh) });
      }
    });
    const y = B.y + lines * rh + (rh - bh) / 2, w = 156 * s, gap = 14 * s, mid = B.x + B.width / 2;
    targets.push({ id: 'toggle:quality', kind: 'toggle', key: 'quality', ...rect(mid - 1.5 * w - gap, y, w, bh) }); // WP26b graphics, cycled
    targets.push({ id: 'link:credits', kind: 'link', key: 'credits', ...rect(mid - w / 2, y, w, bh) });
    targets.push({ id: 'link:reset', kind: 'link', key: 'reset', ...rect(mid + w / 2 + gap, y, w, bh) });
  } else if (page === 'reset') {
    const w = 190 * s, h = Math.max(52, 56 * s), y = B.y + B.height * 0.62;
    targets.push({ id: 'confirm:yes', kind: 'confirm', key: 'yes', ...rect(B.x + B.width / 2 - w - 16 * s, y, w, h) });
    targets.push({ id: 'confirm:no', kind: 'confirm', key: 'no', ...rect(B.x + B.width / 2 + 16 * s, y, w, h) });
  }
  return { page, safe: r, s, ledger: L, body: B, heading, seal: null, status: null, cells, targets };
}

export const inside = (t: Rect, x: number, y: number): boolean => x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height;
/** The target under a finger, or null. */
export const hit = (l: HarbourLayout, x: number, y: number): Target | null => l.targets.find((t) => inside(t, x, y)) ?? null;

// ——— what the pages show ———

export const FORM_NAMES = Object.keys(FORM) as (keyof typeof FORM)[];
const TEMPERAMENT_NAMES = Object.keys(TEMPERAMENT);
const cap = (w: string): string => w[0].toUpperCase() + w.slice(1);

/** The player's wind (its highest tier, never lost), rank points and treasure, for the harbour's rank line. */
export function statusLine(c: Career): string {
  return `${RANK.winds[c.player.tier - 1]} · ${c.player.points} points · ${c.player.treasure} treasure`;
}

export interface LeagueRow { place: number; id: number; name: string; points: number; wind: string; player: boolean; drawn: boolean }
/** The thirty captains and the player by rank points (ties: the player first, then the lower index), the nine drawn
 * for the next voyage marked. */
export function leagueRows(c: Career): LeagueRow[] {
  const drawn = new Set(draw(c));
  const rows = c.captains.map((k, id) => ({ id, name: CAPTAINS[id].name, points: k.points, player: false, drawn: drawn.has(id), wind: RANK.winds[tierOf(k.points) - 1] }));
  rows.push({ id: LEAGUE, name: 'You', points: c.player.points, player: true, drawn: false, wind: RANK.winds[c.player.tier - 1] });
  rows.sort((a, b) => b.points - a.points || (a.player ? -1 : b.player ? 1 : a.id - b.id));
  return rows.map((r, i) => ({ ...r, place: i + 1 }));
}

export interface Card { id: number; name: string; meaning: string; temperament: string; form: string; pigments: [string, string]; emblem: string; line: string; record: string; wind: string }
export function captainCard(c: Career, id: number): Card {
  const k = CAPTAINS[id], tier = tierOf(c.captains[id].points);
  return {
    id, name: k.name, meaning: k.meaning, temperament: cap(TEMPERAMENT_NAMES[k.temperament]), form: cap(FORM_NAMES[captainForm(id, tier)]),
    pigments: [k.pigments[0], k.pigments[1]], emblem: k.emblem, line: cardLine(c, id), record: recordLine(c, id), wind: RANK.winds[tier - 1],
  };
}
/** The nine captains drawn for the next voyage, nearest the player's rank first as draw() gives them. */
export const nineCards = (c: Career): Card[] => draw(c).map((id) => captainCard(c, id));

export interface FormChoice { form: number; name: string; unlocked: boolean; chosen: boolean; unlocksAt: string }
export function formChoices(c: Career): FormChoice[] {
  const open = unlockedForms(c.player.tier);
  return FORM_NAMES.map((n, form) => ({ form, name: cap(n), unlocked: open.includes(form), chosen: c.player.form === form, unlocksAt: RANK.winds[RANK.forms[form] - 1] }));
}

export const TRAIT_WORDS: Readonly<Record<Trait, readonly [string, string]>> = {
  talons: ['Talons', 'carries rarer pigments'],
  wings: ['Wings', 'a called chest comes sooner'],
  eye: ['Eye', 'scouts farther ahead'],
  beak: ['Beak', 'snatches back your spilled purse'],
  dive: ['Dive', 'dives at the nearest rival'],
};
export interface TraitRow { trait: Trait; name: string; does: string; level: number; max: number; price: number | null; affordable: boolean }
export function gullRows(c: Career): TraitRow[] {
  return TRAITS.map((t) => {
    const price = gullPrice(c, t);
    return { trait: t, name: TRAIT_WORDS[t][0], does: TRAIT_WORDS[t][1], level: c.player.gull[t], max: GULL_PRICES[t].length, price, affordable: price !== null && price <= c.player.treasure };
  });
}

// ——— actions ———

export type HarbourAct = { kind: 'form'; form: number } | { kind: 'gull'; trait: Trait };
export interface ActResult { career: Career; ok: boolean; why?: 'locked' | 'chosen' | 'top' | 'short' }
/** Choose a form or train the gull through the career API, refusing what it would refuse (the career unchanged). */
export function harbourAct(c: Career, a: HarbourAct): ActResult {
  if (a.kind === 'form') {
    if (!unlockedForms(c.player.tier).includes(a.form)) return { career: c, ok: false, why: 'locked' };
    if (c.player.form === a.form) return { career: c, ok: false, why: 'chosen' };
    return { career: chooseForm(c, a.form), ok: true };
  }
  const price = gullPrice(c, a.trait);
  if (price === null) return { career: c, ok: false, why: 'top' };
  if (price > c.player.treasure) return { career: c, ok: false, why: 'short' };
  return { career: buyGull(c, a.trait), ok: true };
}
