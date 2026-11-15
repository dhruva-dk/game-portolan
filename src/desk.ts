// The desk: the career's session on its store, as the office (ui/office/) asks for it (office.ts Desk). Loaded and
// verified on launch; each command applied and journaled before the office redraws; a refusal or a failed save
// returned as the sentence the office's notice says. main.ts makes one on IndexedDB; a fixture (fixtures.ts) on memory.

import type { Colours } from './race';
import type { Command, Desk } from './office';
import { backupNow, lostSentence, open, send, type Kept, type Opened } from './career/session';
import type { Store } from './career/store';
import { foundErrors, foundView, homeView, recoverView, settingsView, topBar } from './career/views';
import { indexedStore, openDatabase } from './store/indexed';

/** Where the career is kept: a store opened, and wiped for a new career. */
export interface Shelf { open(): Promise<Store>; wipe(): Promise<void>; backupDay: { get(): { day: number; season: number } | null; set(v: { day: number; season: number }): void } }

/** A desk on `shelf`, the career loaded (and verified) from it. */
export async function createDesk(shelf: Shelf, debug = false): Promise<Desk> {
  let store = await shelf.open(), opened: Opened = await open(store, debug), kept: Kept | null = opened.ok ? opened.kept : null;
  /** Whether the load lost or replaced anything the player should hear about before going on. */
  let troubled = !opened.ok || opened.from === 'older' || opened.from === 'journal' || opened.from === 'backup' || opened.lost !== null;
  const must = () => kept as Kept;
  const desk: Desk = {
    changed: null,
    where: () => (troubled ? 'recover' : must().state.player === null ? 'found' : 'home'),
    home: () => homeView(must().state),
    top: () => topBar(must().state),
    found: (seed: number, colours: Colours) => foundView(seed, colours),
    foundErrors,
    recover: () => recoverView({
      from: opened.ok ? opened.from : 'new', lost: opened.ok && opened.lost ? lostSentence(opened.lost, opened.kept.state.calendar?.start) : 'Nothing was lost.', failed: opened.ok ? null : opened.sentence,
    }),
    settings: () => settingsView(shelf.backupDay.get()),
    async send(c: Command) {
      const r = await send(store, must(), c);
      if (!r.ok) return r.reason.sentence;
      kept = r.kept;
      desk.changed?.();
      return r.snapshotFailed ? 'The game is saved, but its snapshot failed; it will try again.' : null;
    },
    async recoverBy(way) {
      if (way === 'carry' && kept) troubled = false;
      else if (way === 'new') {
        await shelf.wipe();
        store = await shelf.open();
        opened = await open(store, debug);
        kept = opened.ok ? opened.kept : null;
        troubled = !opened.ok;
      } else {
        if (way === 'restore' && !(await store.restore().catch(() => false))) return 'There is no backup to restore.';
        opened = await open(store, debug);
        kept = opened.ok ? opened.kept : null;
        troubled = !opened.ok || opened.lost !== null;
        if (!opened.ok) return opened.sentence;
      }
      desk.changed?.();
      return null;
    },
    async backup() {
      const r = await backupNow(store, must());
      if (!r.ok) return r.reason.sentence;
      kept = r.kept;
      shelf.backupDay.set({ day: kept.state.day - (kept.state.calendar?.start ?? 0) + 1, season: kept.state.season });
      desk.changed?.();
      return null;
    },
  };
  return desk;
}

const NAME = 'portolan', BACKUP_DAY = 'portolan.backup';

/** The career's shelf on this device: IndexedDB, and the last backup's day beside the settings. */
export function deviceShelf(): Shelf {
  let db: IDBDatabase | null = null;
  return {
    async open() {
      db = await openDatabase(NAME);
      return indexedStore(db);
    },
    async wipe() {
      db?.close();
      db = null;
      await new Promise<void>((done) => {
        const r = indexedDB.deleteDatabase(NAME);
        r.onsuccess = r.onerror = r.onblocked = () => done();
      });
      try {
        localStorage.removeItem(BACKUP_DAY);
      } catch {
        // nothing kept to forget
      }
    },
    backupDay: {
      get() {
        try {
          return JSON.parse(localStorage.getItem(BACKUP_DAY) ?? 'null');
        } catch {
          return null;
        }
      },
      set(v) {
        try {
          localStorage.setItem(BACKUP_DAY, JSON.stringify(v));
        } catch {
          // shown this session only
        }
      },
    },
  };
}
