import { settled, type Settings } from '../ui/base/settings.ts';

export type Store = Pick<Storage, 'getItem' | 'setItem'>;

const KEYS = { settings: 'portolan.settings' };

export type Kept = Settings & { stats: boolean };

export function deviceStore(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

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

export function keptSettings(store: Store | null): Kept {
  const f = fields(store, KEYS.settings),
    stats = f.get('stats');
  return { ...settled(f), stats: typeof stats === 'boolean' ? stats : false };
}
export const keepSettings = (store: Store | null, s: Settings | Kept) =>
  keep(store, KEYS.settings, { ...keptSettings(store), ...s });
