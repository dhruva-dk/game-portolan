// What the device keeps for her between pages: her settings and her livery,
// each a record of JSON under its own key. Never required: a private window may
// refuse the store, or throw as it is reached, and what was kept may be from an
// older game or not JSON at all; whatever cannot be read is hers by default.
// The store is given (the page's localStorage, or a stand-in), so this runs
// without a page.

import { LIVERY, PATTERNS, type Livery } from '../player.ts';
import type { Settings } from './screens.ts';

/** What of a Storage is used: a record read and written by its key. */
export type Store = Pick<Storage, 'getItem' | 'setItem'>;

const KEYS = { settings: 'portolan.settings', livery: 'portolan.livery' };

/** Her settings until she sets them. */
const SETTINGS: Settings = { sound: 0.8, look: 0.5, stats: false };

/** The fields of what is kept at `key` (none if nothing is, it is not JSON, or the store refuses). */
function fields(store: Store | null, key: string): Map<string, unknown> {
  try {
    const k: unknown = JSON.parse(store?.getItem(key) ?? 'null');
    return new Map(k && typeof k === 'object' ? Object.entries(k) : []);
  } catch {
    return new Map();
  }
}
/** Keeps `value` at `key`; for this page only if the store refuses. */
function keep(store: Store | null, key: string, value: object) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // kept for this page only
  }
}

/** A share kept, if it is one (0…1); else `or`. */
const share = (v: unknown, or: number) =>
  typeof v === 'number' && v >= 0 && v <= 1 ? v : or;

/** Her settings as kept, each that cannot be read hers by default. */
export function keptSettings(store: Store | null): Settings {
  const f = fields(store, KEYS.settings),
    stats = f.get('stats');
  return {
    sound: share(f.get('sound'), SETTINGS.sound),
    look: share(f.get('look'), SETTINGS.look),
    stats: typeof stats === 'boolean' ? stats : SETTINGS.stats,
  };
}
export const keepSettings = (store: Store | null, s: Settings) =>
  keep(store, KEYS.settings, s);

/**
 * Her livery as kept: its dye by name, one of `dyes` (the set's names, in its
 * order), and its pattern by name; either not in the set hers by default.
 */
export function keptLivery(
  store: Store | null,
  dyes: readonly string[]
): Livery {
  const f = fields(store, KEYS.livery),
    dye = dyes.findIndex((d) => d === f.get('dye')),
    pattern = PATTERNS.findIndex((p) => p === f.get('pattern'));
  return {
    dye: dye < 0 ? LIVERY.dye : dye,
    pattern: pattern < 0 ? LIVERY.pattern : pattern,
  };
}
/** Keeps her livery by its dye's name (of `dyes`) and its pattern's. */
export const keepLivery = (
  store: Store | null,
  l: Livery,
  dyes: readonly string[]
) =>
  keep(store, KEYS.livery, {
    dye: dyes[l.dye] ?? dyes[LIVERY.dye],
    pattern: PATTERNS[l.pattern] ?? PATTERNS[LIVERY.pattern],
  });
