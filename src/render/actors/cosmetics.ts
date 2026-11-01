// The cosmetics a ship wears, from the id record the career hands over to the colours and shapes the model draws.
// Every table here is a placeholder set: an id the table knows gets its entry, any other id gets one picked by its
// hash, so a catalogue of about 100 cosmetics can be wired in without the renderer knowing each one.
import { EMBLEMS } from '../../career/emblems.ts';
import type { CosmeticIds } from './view.ts';

export const FIGUREHEADS = ['gull', 'whale', 'star', 'orb', 'ram', 'sun', 'none'] as const;
export type Figurehead = (typeof FIGUREHEADS)[number];

export interface WakeLook { color: number; glow: number; sparkle: boolean }

export interface Look {
  hull: number; // lacquer
  accent: number; // the gun deck's band, the castles' bulkheads, the port lids
  trim: number; // metal and gilding
  sail: number;
  sail2: number;
  pattern: number; // 0 plain, 1 bands, 2 leech band, 3 centre stripe, 4 quarters, 5 chevrons
  emblem: number; // index into the league's EMBLEMS, -1 for none
  figurehead: Figurehead;
  wisp: number; // the spirit lantern's light, shared with the wake's glow
  wake: WakeLook;
}

export const SAIL_COLOURS: Record<string, [number, number]> = {
  canvas: [0xe4d7bb, 0xa82b21], crimson: [0xa82b21, 0xe4d7bb], ivory: [0xf1ece0, 0x2b3f86], night: [0x1d1d22, 0xe0a136],
  royal: [0x2b3f86, 0xf1ece0], saffron: [0xe0a136, 0x1d1d22], jade: [0x2f6b55, 0xf1ece0], violet: [0x7a3c8f, 0xe0a136],
  rose: [0xe7a5b8, 0x7a3c8f], storm: [0x55606e, 0xd9dde2],
};

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
  const [sail, sail2] = pick(SAIL_COLOURS, c.sail);
  const paint = pick(HULL_PAINTS, c.hull);
  const wake = pick(WAKES, c.wake);
  const emblem = c.emblem === 'none' ? -1 : c.emblem ? ((EMBLEMS as readonly string[]).indexOf(c.emblem) + EMBLEMS.length) % EMBLEMS.length : 0;
  const fig = (FIGUREHEADS as readonly string[]).includes(c.figurehead ?? '') ? (c.figurehead as Figurehead) : FIGUREHEADS[c.figurehead ? hash(c.figurehead) % (FIGUREHEADS.length - 1) : 0];
  return {
    ...paint, sail, sail2, pattern: pick(PATTERNS, c.pattern), emblem, figurehead: fig,
    wisp: wake.wisp, wake: { color: wake.color, glow: wake.glow, sparkle: wake.sparkle },
  };
}

/** A key that changes when the look does, so a ship rebuilds only what changed. */
export const lookKey = (c: CosmeticIds): string => `${c.sail}|${c.pattern}|${c.hull}|${c.figurehead}|${c.emblem}|${c.wake}`;
