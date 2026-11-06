// Saving: the career goes to a small key-value store (localStorage in the browser) as one string:
//   PTLC.<format version>.<checksum>.<hex of the encoded career>
// Loading never crashes. A missing save starts a fresh career. A save that fails its checksum or won't decode
// starts a fresh career too, and is kept aside under BACKUP_KEY so nothing is lost for good. A save from a
// version with no migration is kept aside the same way. A save that decodes but holds stale ids or numbers
// out of range is repaired field by field.
import { ABILITIES, STARTER_ACTIVE, STARTER_PASSIVE } from '../sim/abilities.ts';
import { REGION_COUNT } from '../sim/world/index.ts';
import { CAPTAINS } from './captains.ts';
import { CAREER_FORMAT, decodeCareer, encodeCareer, newCaptainRecord, newCareer, wornLook, type Career } from './career.ts';
import { fromHex, hash64, toHex, versionOf } from './codec.ts';
import { newLearned, type Learned } from './habits.ts';
import { abilityUnlocked, levelOf } from './levels.ts';
import { TIERS } from './ranks.ts';
import { SKILL, clampRating } from './rating.ts';

/** The storage the career saves to. In the browser, webStore(localStorage). */
export interface SaveStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export const SAVE_KEY = 'portolan.career';
export const BACKUP_KEY = 'portolan.career.unreadable';

/** A store that lives in memory: for tests, and the fallback when the browser refuses storage. */
export function memoryStore(): SaveStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    read: (key) => (key in data ? data[key] : null),
    write: (key, value) => {
      data[key] = value;
    },
  };
}

/** Wraps the browser's localStorage (pass it in). Reads and writes that throw (private mode, quota) are swallowed. */
export function webStore(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void }): SaveStore {
  return {
    read: (key) => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (key, value) => {
      try {
        storage.setItem(key, value);
      } catch {
        // Nothing to do: the career carries on in memory.
      }
    },
  };
}

export function serializeCareer(c: Career): string {
  const bytes = encodeCareer(c);
  return `${CAREER_FORMAT.magic}.${CAREER_FORMAT.version}.${hash64(bytes)}.${toHex(bytes)}`;
}

export type LoadStatus = 'loaded' | 'repaired' | 'missing' | 'corrupt' | 'unknownVersion';

/**
 * Migrations from older format versions to the current one, by version. Each takes the old payload and
 * returns a career, or throws. Empty for now: version 3 is the first of Portolan's career.
 */
const MIGRATIONS: Readonly<Record<number, (bytes: Uint8Array) => Career>> = {};

/** Reads a saved string. Returns null with a reason when it can't be used. */
export function parseCareer(s: string): { career: Career; status: 'loaded' | 'repaired' } | { career: null; status: 'corrupt' | 'unknownVersion' } {
  const parts = s.split('.');
  if (parts.length !== 4 || parts[0] !== CAREER_FORMAT.magic) return { career: null, status: 'corrupt' };
  const bytes = fromHex(parts[3]);
  if (bytes === null || hash64(bytes) !== parts[2]) return { career: null, status: 'corrupt' };
  const version = versionOf(CAREER_FORMAT.magic, bytes);
  if (version < 0 || `${version}` !== parts[1]) return { career: null, status: 'corrupt' };
  try {
    const raw = version === CAREER_FORMAT.version ? decodeCareer(bytes) : version in MIGRATIONS ? MIGRATIONS[version](bytes) : null;
    if (raw === null) return { career: null, status: 'unknownVersion' };
    const before = serializeCareer(raw), career = repairCareer(raw);
    return { career, status: serializeCareer(career) === before ? 'loaded' : 'repaired' };
  } catch {
    return { career: null, status: 'corrupt' };
  }
}

export function saveCareer(store: SaveStore, c: Career): void {
  store.write(SAVE_KEY, serializeCareer(c));
}

/** Loads the career, or starts a fresh one from `seed` when there is none or it can't be read. Never throws. */
export function loadCareer(store: SaveStore, seed: number): { career: Career; status: LoadStatus } {
  let saved: string | null = null;
  try {
    saved = store.read(SAVE_KEY);
  } catch {
    saved = null;
  }
  if (saved === null) return { career: newCareer(seed), status: 'missing' };
  const got = parseCareer(saved);
  if (got.career !== null) return { career: got.career, status: got.status };
  try {
    store.write(BACKUP_KEY, saved);
  } catch {
    // Keeping the old save aside is a courtesy; carry on without it.
  }
  return { career: newCareer(seed), status: got.status };
}

const count = (x: number): number => (Number.isInteger(x) && x > 0 ? x : 0);

const sized = (w: number[], n: number): boolean => w.length === n && w.every((x) => Number.isInteger(x) && x >= 0 && x <= 1000);

function repairLearned(h: Learned): Learned {
  const fresh = newLearned();
  // classes added since the save was made start unlearnt
  if (Array.isArray(h.weapon) && h.weapon.length < fresh.weapon.length) h.weapon = [...h.weapon, ...fresh.weapon.slice(h.weapon.length)];
  const ok = sized(h.drop, fresh.drop.length) && sized(h.run, fresh.run.length) && sized(h.storm, fresh.storm.length)
    && sized(h.range, fresh.range.length) && sized(h.weapon, fresh.weapon.length);
  return ok ? h : fresh;
}

/** Fixes what a decoded save may have wrong: unknown or locked ids, missing captains, numbers out of range. */
export function repairCareer(c: Career): Career {
  const start = newCareer(c.seed);
  c.matches = count(c.matches);
  c.wins = Math.min(count(c.wins), c.matches);
  c.top5 = Math.min(count(c.top5), c.matches);
  c.kills = count(c.kills);
  c.damage = count(c.damage);
  c.survived = count(c.survived);
  c.bestPlace = count(c.bestPlace);
  c.xp = count(c.xp);
  c.rating = Math.round(clampRating(Number.isInteger(c.rating) ? c.rating : 0));
  c.bestTier = Math.min(TIERS.length - 1, count(c.bestTier));
  const level = levelOf(c.xp).level, owned = (id: string, kind: 'active' | 'passive'): boolean =>
    ABILITIES.some((a) => a.id === id && a.kind === kind && abilityUnlocked(a.id, level));
  if (!owned(c.active, 'active')) c.active = STARTER_ACTIVE;
  if (!owned(c.passive, 'passive')) c.passive = STARTER_PASSIVE;
  c.look = wornLook(c);
  c.chart = Array.from({ length: REGION_COUNT }, (_, r) => count(c.chart[r] ?? 0));
  c.captains = CAPTAINS.map((cap, i) => {
    const r = c.captains.find((x) => x.id === cap.id);
    if (!r) return newCaptainRecord(cap.id, start.captains[i].rating);
    const rating = Math.round(Math.max(SKILL.min, Math.min(SKILL.max, r.rating)));
    return {
      id: cap.id, rating, home: Math.round(clampRating(r.home)),
      met: count(r.met), ahead: count(r.ahead), behind: count(r.behind), sank: count(r.sank), sunk: count(r.sunk),
      grudge: Math.min(3, count(r.grudge)), habits: repairLearned(r.habits),
    };
  });
  c.profile = repairLearned(c.profile);
  return c;
}
