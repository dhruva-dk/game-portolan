import { apply, type Applied } from '../career/apply.ts';
import type { Command } from '../career/commands.ts';
import { VERSION, YOURS, type CareerState } from '../career/state.ts';

export type Entries = Readonly<Record<string, string>>;

export type Store = {
  read(key: string): Promise<string | null>;
  write(entries: Entries): Promise<void>;
};

export const CAREER_KEY = 'career';
export const BACKUP_KEY = 'career.bak';

const DATABASE = 'portolan';
const DATABASE_VERSION = 1;
const OBJECTS = 'saves';

export function memoryStore(initial: Entries = {}): Store {
  const kept = new Map(Object.entries(initial));
  return {
    read: async (key) => kept.get(key) ?? null,
    async write(entries) {
      for (const [key, value] of Object.entries(entries)) kept.set(key, value);
    },
  };
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(OBJECTS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function indexedStore(name: string = DATABASE): Store {
  let database: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    database ??= openDatabase(name).catch((error: unknown) => {
      database = null;
      throw error;
    });
    return database;
  };
  return {
    async read(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction(OBJECTS, 'readonly')
          .objectStore(OBJECTS)
          .get(key);
        request.onsuccess = () =>
          resolve(typeof request.result === 'string' ? request.result : null);
        request.onerror = () => reject(request.error);
      });
    },
    async write(entries) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(OBJECTS, 'readwrite');
        const objects = transaction.objectStore(OBJECTS);
        for (const [key, value] of Object.entries(entries))
          objects.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
  };
}

export type SaveQueue = {
  save(previous: CareerState, next: CareerState): Promise<void>;
  settled(): Promise<void>;
};

export function saveQueue(store: Store): SaveQueue {
  let last: Promise<void> = Promise.resolve();
  const enqueue = (entries: Entries): Promise<void> => {
    const written = last.then(() => store.write(entries));
    last = written.then(
      () => undefined,
      () => undefined
    );
    return written;
  };
  return {
    save: (previous, next) =>
      enqueue({
        [BACKUP_KEY]: JSON.stringify(previous),
        [CAREER_KEY]: JSON.stringify(next),
      }),
    async settled() {
      let awaited: Promise<void> | null = null;
      while (awaited !== last) {
        awaited = last;
        await awaited;
      }
    },
  };
}

export type Sent = { applied: Applied; saved: Promise<void> };

export function sendAndSave(
  queue: SaveQueue,
  state: CareerState,
  command: Command
): Sent {
  const applied = apply(state, command);
  const saved =
    applied.ok && command.team === YOURS
      ? queue.save(state, applied.state)
      : Promise.resolve();
  return { applied, saved };
}

type Parsed = { value: object };

async function parsedAt(store: Store, key: string): Promise<Parsed | null> {
  let text: string | null;
  try {
    text = await store.read(key);
  } catch {
    return null;
  }
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { value }
      : null;
  } catch {
    return null;
  }
}

const isCurrent = (value: object): value is CareerState =>
  'version' in value && value.version === VERSION;

export async function loadCareer(store: Store): Promise<CareerState | null> {
  const saved =
    (await parsedAt(store, CAREER_KEY)) ?? (await parsedAt(store, BACKUP_KEY));
  return saved !== null && isCurrent(saved.value) ? saved.value : null;
}
