import { apply, type Applied } from '../career/apply.ts';
import type { Command } from '../career/commands.ts';
import { YOURS, type CareerState } from '../career/state.ts';

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

type Persist = {
  retry(attempt: number): Promise<void>;
  failing(on: boolean): void;
};

async function persisted(
  store: Store,
  entries: Entries,
  persist: Persist
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await store.write(entries);
      if (attempt > 1) persist.failing(false);
      return;
    } catch {
      if (attempt === 1) persist.failing(true);
      await persist.retry(attempt);
    }
  }
}

export function saveQueue(store: Store, persist?: Persist): SaveQueue {
  let last: Promise<void> = Promise.resolve();
  const enqueue = (entries: Entries): Promise<void> => {
    const written = last.then(() =>
      persist ? persisted(store, entries, persist) : store.write(entries)
    );
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

const isCareer = (value: unknown): value is CareerState =>
  typeof value === 'object' &&
  value !== null &&
  'teams' in value &&
  Array.isArray(value.teams);

async function careerAt(
  store: Store,
  key: string
): Promise<CareerState | null> {
  try {
    const text = await store.read(key);
    const value: unknown = text === null ? null : JSON.parse(text);
    return isCareer(value) ? value : null;
  } catch {
    return null;
  }
}

export async function loadCareer(store: Store): Promise<CareerState | null> {
  return (
    (await careerAt(store, CAREER_KEY)) ?? (await careerAt(store, BACKUP_KEY))
  );
}
