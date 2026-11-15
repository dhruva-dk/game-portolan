// The page side of tools/indexed.ts: loaded into headless Chromium by Vite, it runs the store suite
// (tests/store-suite.ts) on the IndexedDB adapter (src/store/indexed.ts), each test on a database of its own,
// reopened as after a restart, and reports each test's outcome.

import type { Command } from '../src/office';
import { indexedStore, openDatabase } from '../src/store/indexed';
import { STORE_TESTS, type Rig } from '../tests/store-suite';

export interface Outcome { name: string; ok: boolean; ms: number; error: string | null }

const gone = (name: string): Promise<void> => new Promise((ok, no) => {
  const r = indexedDB.deleteDatabase(name);
  r.onsuccess = () => ok();
  // a connection closed with a transaction still finishing blocks the delete until it has finished: then it goes on
  r.onerror = () => no(r.error);
});

/** A rig over a database of a name: closed and opened again on each reopen. */
function rig(name: string): Rig & { close(): void } {
  let db: IDBDatabase | null = null;
  const close = () => {
    db?.close();
    db = null;
  };
  const reopen = async () => {
    close();
    db = await openDatabase(name);
    return indexedStore(db);
  };
  return {
    close,
    reopen,
    empty: async () => {
      close();
      await gone(name);
      return reopen();
    },
    corrupt: async (i) => {
      const d = db ?? (db = await openDatabase(name));
      const t = d.transaction('entries', 'readwrite'), lines = t.objectStore('entries');
      const all = await new Promise<{ seq: number; text: string }[]>((ok) => { const r = lines.getAll(); r.onsuccess = () => ok(r.result); });
      const line = all.sort((a, b) => a.seq - b.seq)[i], at = Math.floor(line.text.length / 2);
      lines.put({ seq: line.seq, text: line.text.slice(0, at) + (line.text[at] === '1' ? '2' : '1') + line.text.slice(at + 1) });
      await new Promise((ok) => { t.oncomplete = ok; });
    },
  };
}

/** Every test of the suite, on IndexedDB, with the scripted commands. */
export async function run(commands: readonly Command[]): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const [i, [name, test]] of Object.entries(STORE_TESTS).entries()) {
    const r = rig(`portolan-suite-${i}`), t0 = performance.now();
    try {
      await test(r, commands);
      out.push({ name, ok: true, ms: performance.now() - t0, error: null });
    } catch (e) {
      out.push({ name, ok: false, ms: performance.now() - t0, error: e instanceof Error ? e.message : String(e) });
    } finally {
      r.close();
    }
  }
  return out;
}
