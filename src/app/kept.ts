import { LIVERY, PATTERNS, type Livery } from '../world/livery.ts';
import type { Settings } from '../ui/base/screens.ts';

export type Store = Pick<Storage, 'getItem' | 'setItem'>;

const KEYS = { settings: 'portolan.settings', livery: 'portolan.livery' };

const SETTINGS: Settings = { sound: 0.8, look: 0.5, stats: false };

function fields(store: Store | null, key: string): Map<string, unknown> {
  try {
    const k: unknown = JSON.parse(store?.getItem(key) ?? 'null');
    return new Map(k && typeof k === 'object' ? Object.entries(k) : []);
  } catch {
    return new Map();
  }
}
function keep(store: Store | null, key: string, value: object) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {}
}

const share = (v: unknown, or: number) =>
  typeof v === 'number' && v >= 0 && v <= 1 ? v : or;

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
export const keepLivery = (
  store: Store | null,
  l: Livery,
  dyes: readonly string[]
) =>
  keep(store, KEYS.livery, {
    dye: dyes[l.dye] ?? dyes[LIVERY.dye],
    pattern: PATTERNS[l.pattern] ?? PATTERNS[LIVERY.pattern],
  });
