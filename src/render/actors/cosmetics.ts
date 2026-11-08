// The cosmetics a ship wears, from the id record the career hands over to the colours and shapes the model draws.
// The career's catalogue (src/career/cosmetics.ts) gives each sail colour, hull paint and wake its colour, and the ids
// below map its patterns and figureheads onto the shapes the model has so far. The tables here are placeholders: an
// id they know gets its entry, any other id one picked by its hash, so new cosmetics never break the renderer.
import { cosmetic } from '../../career/cosmetics.ts';
import { EMBLEMS, LEGACY_EMBLEMS } from '../cosmetics/emblems.ts';
import type { CosmeticIds } from './view.ts';

/** The career's sail patterns and figureheads, onto the shader's six patterns and the model's seven heads. */
const CAREER_PATTERNS: Record<string, number> = { plain: 0, twinBands: 1, laurelEdge: 2, singleStripe: 3, quartered: 4, chevron: 5 };
const CAREER_HEADS: Record<string, Figurehead> = {
  plainStem: 'none', heron: 'gull', greatWhale: 'whale', coralAntler: 'star', ammonite: 'orb', narwhalTusk: 'ram', sunburst: 'sun',
};

const hex = (s: string | undefined): number | null => (s && /^#[0-9a-f]{6}$/i.test(s) ? parseInt(s.slice(1), 16) : null);
const lum = (c: number) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
const mixHex = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
};

export const FIGUREHEADS = ['gull', 'whale', 'star', 'orb', 'ram', 'sun', 'none'] as const;
export type Figurehead = (typeof FIGUREHEADS)[number];

export interface WakeLook { color: number; glow: number; sparkle: boolean }

export interface Look {
  hull: number; // lacquer
  accent: number; // the gun deck's band, the castles' bulkheads, the port lids
  trim: number; // metal and gilding
  roundel?: number; // the field round the sails' charge, where it is not the trim
  sail: number;
  sail2: number;
  pattern: number; // 0 plain, 1 bands, 2 leech band, 3 centre stripe, 4 quarters, 5 chevrons
  emblem: string | null; // a charge id from src/render/cosmetics/emblems.ts (sigil, emblem cosmetic or spare), null for none
  figurehead: Figurehead;
  wisp: number; // the spirit lantern's light, shared with the wake's glow
  wake: WakeLook;
}

export const SAIL_COLOURS: Record<string, [number, number]> = {
  canvas: [0xe4d7bb, 0xa82b21], crimson: [0xa82b21, 0xe4d7bb], ivory: [0xf1ece0, 0x2b3f86], night: [0x1d1d22, 0xe0a136],
  royal: [0x2b3f86, 0xf1ece0], saffron: [0xe0a136, 0x1d1d22], jade: [0x2f6b55, 0xf1ece0], violet: [0x7a3c8f, 0xe0a136],
  rose: [0xe7a5b8, 0x7a3c8f], storm: [0x55606e, 0xd9dde2],
};

/** Iron-gall ink, and the gilding of a captain's trim. */
const INK = 0x1d1a17, GILT = 0xd8a64a;

export const PATTERNS: Record<string, number> = { plain: 0, bands: 1, leech: 2, stripe: 3, quarters: 4, chevrons: 5 };

export const HULL_PAINTS: Record<string, { hull: number; accent: number; trim: number }> = {
  oxblood: { hull: 0x6e1712, accent: 0x141416, trim: 0xd8a64a },
  ebony: { hull: 0x141416, accent: 0x6e1712, trim: 0xd8a64a },
  verdigris: { hull: 0x0f4237, accent: 0xb38a3a, trim: 0xc0703f },
  navy: { hull: 0x1b2856, accent: 0xe6dccb, trim: 0xd8a64a },
  bone: { hull: 0xcdbf9f, accent: 0x24427a, trim: 0xc9ccd2 },
  walnut: { hull: 0x4a2a1a, accent: 0x0f4237, trim: 0xd8a64a },
  plum: { hull: 0x5a1640, accent: 0x141416, trim: 0xc9ccd2 },
  ash: { hull: 0x3a3c40, accent: 0xb38a3a, trim: 0xc0703f },
};

export const WAKES: Record<string, WakeLook & { wisp: number }> = {
  foam: { color: 0x7fe7ff, glow: 0.6, sparkle: false, wisp: 0x7fe7ff },
  spirit: { color: 0x5fd8ff, glow: 1.4, sparkle: true, wisp: 0x7fe7ff },
  ember: { color: 0xff8a3a, glow: 1.3, sparkle: true, wisp: 0xffb35c },
  aurora: { color: 0x6dff9a, glow: 1.3, sparkle: true, wisp: 0x9dff7a },
  petal: { color: 0xff8fc0, glow: 1.1, sparkle: true, wisp: 0xff6aa8 },
  gold: { color: 0xffcf5a, glow: 1.4, sparkle: true, wisp: 0xfff0a0 },
  violet: { color: 0xb68cff, glow: 1.3, sparkle: true, wisp: 0xc7a6ff },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The table's entry for an id: its own if known, one chosen by the id's hash if not, the first if there is no id. */
export function pick<T>(table: Record<string, T>, id: string | undefined): T {
  if (id && id in table) return table[id];
  const keys = Object.keys(table);
  return table[keys[id ? hash(id) % keys.length : 0]];
}

export function lookOf(c: CosmeticIds): Look {
  let [sail, sail2] = pick(SAIL_COLOURS, c.sail);
  const paint = { ...pick(HULL_PAINTS, c.hull) };
  const wake = { ...pick(WAKES, c.wake) };
  // the career's own colours, where it has them: a contrasting second colour for the sail's pattern and charge
  const sc = hex(c.sail ? cosmetic(c.sail)?.colour : undefined);
  if (sc !== null) { sail = sc; sail2 = lum(sc) > 0.55 ? mixHex(sc, 0x1b2233, 0.8) : mixHex(sc, 0xf3ead8, 0.85); }
  const hc = hex(c.hull ? cosmetic(c.hull)?.colour : undefined);
  if (hc !== null) { paint.hull = hc; paint.accent = lum(hc) > 0.5 ? 0x24324a : mixHex(hc, 0xe6dccb, 0.55); }
  // a captain's own colour: the sail and the planks' lacquer both, a darker shade of it on the gun deck's band, gilt
  // trim, and her charge in ink on her colour, ringed in ink, as her chart mark and her seal draw it
  const cc = hex(c.colour);
  const roundel = cc ?? undefined;
  if (cc !== null) {
    sail = paint.hull = cc;
    sail2 = INK;
    paint.accent = mixHex(cc, INK, 0.55);
    paint.trim = GILT;
  }
  const wc = hex(c.wake ? cosmetic(c.wake)?.colour : undefined);
  if (wc !== null) {
    const plain = c.wake === 'foam';
    Object.assign(wake, { color: plain ? 0x7fe7ff : wc, glow: plain ? 0.6 : 1.3, sparkle: !plain, wisp: plain ? 0x7fe7ff : mixHex(wc, 0xffffff, 0.25) });
  }
  const emblem = c.emblem === 'none' ? null : !c.emblem ? 'gull' : c.emblem in EMBLEMS ? c.emblem : LEGACY_EMBLEMS[c.emblem] ?? 'gull';
  const pattern = c.pattern && c.pattern in CAREER_PATTERNS ? CAREER_PATTERNS[c.pattern] : pick(PATTERNS, c.pattern);
  const f = c.figurehead ?? '';
  const fig = (FIGUREHEADS as readonly string[]).includes(f) ? (f as Figurehead) : CAREER_HEADS[f] ?? FIGUREHEADS[f ? hash(f) % (FIGUREHEADS.length - 1) : 0];
  return {
    ...paint, roundel, sail, sail2, pattern, emblem, figurehead: fig,
    wisp: wake.wisp, wake: { color: wake.color, glow: wake.glow, sparkle: wake.sparkle },
  };
}

/** A key that changes when the look does, so a ship rebuilds only what changed. */
export const lookKey = (c: CosmeticIds): string => `${c.colour}|${c.sail}|${c.pattern}|${c.hull}|${c.figurehead}|${c.emblem}|${c.wake}`;
