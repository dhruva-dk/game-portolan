// The store's tests that every adapter must pass (career/store.ts): the memory and faulty adapters run them in node
// (tests/career-store.test.ts), the IndexedDB adapter in headless Chromium (tools/indexed.ts). Not a test file itself:
// it imports nothing of node's, so the browser can load it, and it is handed the scripted commands rather than
// making them (tests/career-kit.ts is node's).

import { canonical } from '../src/career/canon.ts';
import { entry, ORIGIN } from '../src/career/journal.ts';
import { fresh, open, send, type Kept } from '../src/career/session.ts';
import { KEEP, type Store } from '../src/career/store.ts';
import type { Command } from '../src/office.ts';

/** How an adapter is made for the suite: a new empty store, the same store opened again (as after a restart), and the
 *  journal's entry at an index altered on disk (one byte of its text changed). */
export interface Rig {
  empty(): Promise<Store>;
  reopen(): Promise<Store>;
  corrupt(index: number): Promise<void>;
}

class Killed extends Error {}

/** A store whose writes from the `at`-th on are refused and leave nothing (the app was killed before them). */
export function killedAt(
  inner: Store,
  at: number
): Store & { writes(): number } {
  let count = 0;
  const write =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      count++;
      if (count >= at) throw new Killed(`write ${count}: killed`);
      return f(...a);
    };
  return {
    writes: () => count,
    append: write(inner.append),
    snapshot: write(inner.snapshot),
    backup: write(inner.backup),
    restore: write(inner.restore),
    compact: write(inner.compact),
    truncate: write(inner.truncate),
    load: () => inner.load(),
  };
}

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

/** Runs commands through `send` until the store dies; what the player was last told was saved. */
async function run(
  store: Store,
  commands: readonly Command[],
  from: Kept = fresh(true)
): Promise<Kept> {
  let kept = from;
  for (const c of commands) {
    const r = await send(store, kept, c);
    if (r.ok) kept = r.kept;
  }
  return kept;
}

function same(a: Kept, b: Kept, what: string): void {
  check(a.seq === b.seq && a.tip === b.tip, `${what}: seq ${a.seq} / ${b.seq}`);
  check(
    canonical(a.state) === canonical(b.state),
    `${what}: the states differ`
  );
}

/** The suite's tests by name, each run on a rig with the scripted commands. */
export const STORE_TESTS: Readonly<
  Record<string, (rig: Rig, commands: readonly Command[]) => Promise<void>>
> = {
  'append, load, compact and truncate keep the journal in seq order, whole':
    async (rig) => {
      const store = await rig.empty();
      const a = entry(ORIGIN, 1, 1, { kind: 'Advance' }),
        b = entry(a.sum, 2, 1, { kind: 'Snapshot' }),
        c = entry(b.sum, 3, 1, { kind: 'Advance' });
      await store.append([a, b]);
      await store.append([c]);
      // a store is not used after its reopening (the IndexedDB adapter's connection is closed)
      const again = await rig.reopen();
      check(
        JSON.stringify((await again.load()).entries) ===
          JSON.stringify([a, b, c]),
        'the entries come back as written, in order'
      );
      await again.compact(2);
      check(
        (await again.load()).entries.map((e) => e.seq).join() === '2,3',
        'compact drops the entries before a seq'
      );
      await again.truncate(3);
      check(
        (await again.load()).entries.map((e) => e.seq).join() === '2',
        'truncate drops the entries at and after a seq'
      );
    },
  'snapshots come back newest first, three kept; a backup restores the newest and its tail':
    async (rig) => {
      const store = await rig.empty();
      check(!(await store.restore()), 'no backup: restore says so');
      const a = entry(ORIGIN, 1, 1, { kind: 'Advance' }),
        b = entry(a.sum, 2, 1, { kind: 'Advance' }),
        c = entry(b.sum, 3, 1, { kind: 'Advance' });
      await store.append([a, b, c]);
      for (const at of [0, 1, 2, 3])
        await store.snapshot(at, `{"at":${at}}`, `s${at}`);
      const again = await rig.reopen();
      const snaps = (await again.load()).snapshots;
      check(
        snaps.length === KEEP && snaps.map((s) => s.at).join() === '3,2,1',
        `snapshots ${snaps.map((s) => s.at).join()}`
      );
      await again.backup();
      await again.truncate(1);
      check(await again.restore(), 'the backup restores');
      const back = await (await rig.reopen()).load();
      check(
        back.snapshots.length === 1 &&
          back.snapshots[0].at === 3 &&
          back.entries.length === 0,
        'the newest snapshot, no tail after it'
      );
    },
  'a session saves and opens again to the same state': async (
    rig,
    commands
  ) => {
    const kept = await run(await rig.empty(), commands);
    const opened = await open(await rig.reopen(), true);
    check(
      opened.ok && opened.lost === null,
      opened.ok ? 'something was lost' : opened.sentence
    );
    same(opened.kept, kept, 'reopened');
  },
  'killed at every write of the session, then opened: exactly the state the player was last told was saved':
    async (rig, commands) => {
      const probe = killedAt(await rig.empty(), Infinity);
      await run(probe, commands);
      const total = probe.writes();
      check(total > 10, `${total} writes`);
      for (let at = 1; at <= total; at++) {
        const kept = await run(killedAt(await rig.empty(), at), commands);
        const opened = await open(await rig.reopen(), true);
        check(
          opened.ok,
          `killed at write ${at}: ${opened.ok ? '' : opened.sentence}`
        );
        same(opened.kept, kept, `killed at write ${at}`);
      }
    },
  'a corrupt entry ends the good run: the entries before it load and the rest are reported lost':
    async (rig, commands) => {
      await run(
        await rig.empty(),
        commands.filter((c) => c.kind !== 'Snapshot').slice(0, 30)
      );
      const all = (await (await rig.reopen()).load()).entries.length;
      check(all >= 6, `${all} entries`);
      await rig.corrupt(all - 3);
      const opened = await open(await rig.reopen(), true);
      check(opened.ok, opened.ok ? '' : opened.sentence);
      check(
        opened.kept.seq <= all - 3 &&
          opened.lost !== null &&
          opened.lost.actions >= 3,
        `kept ${opened.kept.seq} of ${all}, lost ${JSON.stringify(opened.lost)}`
      );
    },
};
