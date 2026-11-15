// The journal, snapshots and the store (Phase B section 1, D23, D24, D36): kill at every write of a scripted session
// and reload; corrupt each byte class and reload; replay equals state; failed appends change nothing; migrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, fnv, hex, sumOf } from '../src/career/canon.ts';
import { ORIGIN, chained, entry, intact, snapshotOf, unpacked } from '../src/career/journal.ts';
import { EVERY, backupNow, fresh, lostSentence, open, send, type Kept } from '../src/career/session.ts';
import type { Entry, Store } from '../src/career/store.ts';
import { TUNING_VERSION } from '../src/career/tuning.ts';
import { emptyDisk, memoryStore, type Disk } from '../src/store/memory.ts';
import { faultyStore, type Fault } from '../src/store/faulty.ts';
import type { Command } from '../src/office.ts';
import { script } from './career-kit.ts';

/** Runs commands through `send` until the store dies; what the player was last told was saved. */
async function run(store: Store, commands: readonly Command[], from: Kept = fresh(true)): Promise<{ kept: Kept; refusedSaves: number }> {
  let kept = from, refusedSaves = 0;
  for (const c of commands) {
    const r = await send(store, kept, c);
    if (r.ok) kept = r.kept;
    else if (r.reason.code === 'unsaved') refusedSaves++;
  }
  return { kept, refusedSaves };
}

const same = (a: Kept, b: Kept) => {
  assert.equal(canonical(a.state), canonical(b.state));
  assert.equal(a.seq, b.seq);
  assert.equal(a.tip, b.tip);
};

const SESSION = script(11, 130);

test('canonical JSON: keys sorted, no whitespace, nothing JSON cannot carry', () => {
  assert.equal(canonical({ b: 1, a: [true, null, 'x'], c: { z: 0, y: -1.5 } }), '{"a":[true,null,"x"],"b":1,"c":{"y":-1.5,"z":0}}');
  assert.equal(canonical({ a: undefined, b: 2 }), '{"b":2}');
  assert.throws(() => canonical({ a: NaN }));
  assert.throws(() => canonical({ a: () => 1 }));
  assert.equal(hex(fnv('')), '811c9dc5', 'FNV-1a\'s offset');
  assert.notEqual(sumOf('{"a":1}'), sumOf('{"a":2}'));
});

test('the chain: each entry\'s sum follows from the one before; a changed, missing or torn entry ends the good run', () => {
  const e1 = entry(ORIGIN, 1, 1, { kind: 'Advance' });
  const e2 = entry(e1.sum, 2, 1, { kind: 'Snapshot' });
  const e3 = entry(e2.sum, 3, 1, { kind: 'Advance' });
  assert.notEqual(entry('00000000', 1, 1, { kind: 'Advance' }).sum, e1.sum, 'chained from the previous sum');
  assert.deepEqual(chained([e1, e2, e3], 0, ORIGIN), { good: [e1, e2, e3], dropped: 0 });
  assert.deepEqual(chained([e1, e2, e3], 1, e1.sum), { good: [e2, e3], dropped: 0 });
  assert.equal(chained([e1, { ...e2, tuning: 2 }, e3], 0, ORIGIN).good.length, 1);
  assert.equal(chained([e1, e3], 0, ORIGIN).dropped, 1);
  assert.equal(chained([e1, e2, { torn: 1 }], 0, ORIGIN).dropped, 1);
  assert.equal(chained([e1, { ...e2, sum: 'zz' }], 0, ORIGIN).good.length, 1);
});

test('a snapshot carries the state and the journal\'s tip, checked by its sum', () => {
  const kept = fresh();
  const snap = snapshotOf(kept.state, 0, ORIGIN);
  assert.ok(intact(snap));
  assert.deepEqual(unpacked(snap)?.tip, ORIGIN);
  assert.equal(intact({ ...snap, state: snap.state.replace('"day":0', '"day":1') }), false);
  assert.equal(unpacked({ ...snap, state: '{"state":' }), null);
});

test('a session saves and reloads to the same state; snapshots every 50 entries; the store keeps three', async () => {
  const store = memoryStore();
  const { kept } = await run(store, SESSION);
  assert.ok(kept.seq > EVERY, `${kept.seq} entries`);
  assert.equal(store.disk.entries.length, kept.seq);
  assert.ok(store.disk.snapshots.length >= 1 && store.disk.snapshots.length <= 3);
  // without Snapshot requests, one at each race's end and never more than EVERY entries apart
  const quiet = memoryStore();
  const q = await run(quiet, SESSION.filter((c) => c.kind !== 'Snapshot'));
  const at = quiet.disk.snapshots.map((s) => s.at);
  assert.ok(at.length >= 1 && at.length <= 3 && q.kept.seq - at[0] < EVERY, `snapshots at ${at.join(', ')} of ${q.kept.seq}`);
  for (let i = 1; i < at.length; i++) assert.ok(at[i - 1] - at[i] > 0 && at[i - 1] - at[i] <= EVERY, `snapshots at ${at.join(', ')}`);
  const opened = await open(store, true);
  assert.ok(opened.ok);
  if (!opened.ok) return;
  assert.equal(opened.from, 'snapshot');
  assert.equal(opened.lost, null);
  same(opened.kept, kept);
});

test('replay equals state: the whole journal from the world seed gives the state the session kept', async () => {
  const store = memoryStore();
  const { kept } = await run(store, SESSION);
  store.disk.snapshots = [];
  const opened = await open(store, true);
  assert.ok(opened.ok && opened.from === 'journal');
  if (opened.ok) same(opened.kept, kept);
});

test('a refused command is not journaled; a failed append changes nothing and says so; a retry saves it', async () => {
  const store = faultyStore(2, 'fail');
  const first = await send(store, fresh(), SESSION[0]);
  assert.ok(first.ok);
  if (!first.ok) return;
  const refused = await send(store, first.kept, { kind: 'MoveFlightJob', gull: -1, job: 'mend' });
  assert.ok(!refused.ok && refused.reason.code === 'notFlight');
  assert.equal(store.writes(), 1, 'a refused command writes nothing');
  const failed = await send(store, first.kept, { kind: 'Advance' });
  assert.ok(!failed.ok && failed.reason.code === 'unsaved');
  assert.match(failed.ok ? '' : failed.reason.sentence, /save failed/);
  const retry = await send(store, first.kept, { kind: 'Advance' });
  assert.ok(retry.ok);
  if (retry.ok) assert.equal(retry.kept.state.day, 14);
  const opened = await open(memoryStore(store.disk), true);
  assert.ok(opened.ok && retry.ok);
  if (opened.ok && retry.ok) same(opened.kept, retry.kept);
});

/** How many writes the scripted session makes on a store that never fails. */
async function writesOf(commands: readonly Command[]): Promise<number> {
  const store = faultyStore(Infinity, 'fail');
  await run(store, commands);
  return store.writes();
}

const SHORT = script(23, 80);

for (const fault of ['kill', 'tear', 'fail'] as Fault[]) {
  test(`${fault} at every write of a scripted session, then reload: the state the player was last told was saved, never more lost`, async () => {
    const total = await writesOf(SHORT);
    assert.ok(total > 30, `${total} writes`);
    for (let at = 1; at <= total; at++) {
      const store = faultyStore(at, fault);
      const { kept } = await run(store, SHORT);
      const opened = await open(memoryStore(store.disk), true);
      assert.ok(opened.ok, `${fault} at write ${at}: ${opened.ok ? '' : opened.sentence}`);
      if (!opened.ok) continue;
      // the game never went on past an unsaved command, so what loads is exactly what it last showed
      same(opened.kept, kept);
      if (opened.lost) {
        assert.equal(fault, 'tear', `only a torn write loses anything (write ${at})`);
        assert.ok(opened.lost.actions <= 1, `a tear loses at most the torn action (write ${at})`);
      }
    }
  });
}

test('a torn tail is dropped, the player told what was lost, and the store cut back so the career goes on', async () => {
  const disk = emptyDisk();
  const { kept } = await run(memoryStore(disk), SHORT.slice(0, 10));
  const extra = entry(kept.tip, kept.seq + 1, TUNING_VERSION, { kind: 'MoveFlightJob', gull: 0, job: 'mend' });
  disk.entries.push(JSON.stringify(extra).slice(0, 30));
  const opened = await open(memoryStore(disk), true);
  assert.ok(opened.ok);
  if (!opened.ok) return;
  same(opened.kept, kept);
  assert.deepEqual(opened.lost, { actions: 1, since: kept.state.day });
  assert.equal(lostSentence({ actions: 3, since: 41 }), 'The last 3 actions since Day 41 could not be read and were lost.');
  assert.equal(disk.entries.length, kept.seq, 'the torn entry is gone from the store');
  const more = await run(memoryStore(disk), SHORT.slice(10, 20), opened.kept);
  const again = await open(memoryStore(disk), true);
  assert.ok(again.ok && again.lost === null);
  if (again.ok) same(again.kept, more.kept);
});

/** A disk after the long session, and what it kept. */
async function saved(): Promise<{ disk: Disk; kept: Kept }> {
  const disk = emptyDisk();
  const { kept } = await run(memoryStore(disk), SESSION);
  return { disk, kept };
}
const flip = (text: string, at: number) => text.slice(0, at) + (text[at] === '1' ? '2' : '1') + text.slice(at + 1);

test('corrupt an entry: the chain ends there; the entries before it load, the rest are reported lost', async () => {
  const { disk, kept } = await saved();
  // an entry after the newest snapshot (one before it would be passed over by loading from the snapshot)
  const k = Math.max(Math.max(...disk.snapshots.map((x) => x.at)), disk.entries.length - 5);
  assert.ok(k < disk.entries.length);
  const e: Entry = JSON.parse(disk.entries[k]);
  disk.entries[k] = JSON.stringify({ ...e, command: { ...e.command, kind: 'Advance' === e.command.kind ? 'Snapshot' : 'Advance' } });
  const opened = await open(memoryStore(disk), true);
  assert.ok(opened.ok);
  if (!opened.ok) return;
  assert.equal(opened.kept.seq, e.seq - 1);
  assert.equal(opened.lost?.actions, kept.seq - e.seq + 1);
});

test('corrupt each byte class of a snapshot (its text, its sum): the next snapshot back, or the whole journal, loads it all', async () => {
  for (const where of ['text', 'sum', 'every'] as const) {
    const { disk, kept } = await saved();
    const n = where === 'every' ? disk.snapshots.length : 1;
    for (let i = 0; i < n; i++) {
      const s = disk.snapshots[i];
      disk.snapshots[i] = where === 'sum' ? { ...s, sum: flip(s.sum, 3) } : { ...s, state: flip(s.state, Math.floor(s.state.length / 2)) };
    }
    const opened = await open(memoryStore(disk), true);
    assert.ok(opened.ok, where);
    if (!opened.ok) continue;
    assert.equal(opened.from, where === 'every' || disk.snapshots.length === 1 ? 'journal' : 'older', where);
    assert.equal(opened.lost, null);
    same(opened.kept, kept);
  }
});

test('every snapshot corrupt and the journal compacted or under other tuning: the backup; nothing at all: said plainly, never a silent new career', async () => {
  // compacted: a backup taken after two snapshots drops the entries before the previous one
  const { disk, kept } = await saved();
  const store = memoryStore(disk);
  const b = await backupNow(store, kept);
  assert.ok(b.ok);
  assert.ok(JSON.parse(disk.entries[0]).seq > 1, 'compaction dropped the journal\'s start');
  for (const s of disk.snapshots) s.sum = '00000000';
  const opened = await open(store, true);
  assert.ok(opened.ok && opened.from === 'backup', opened.ok ? opened.from : opened.sentence);
  if (opened.ok) same(opened.kept, kept);
  // other tuning, no backup
  const other = await saved();
  other.disk.snapshots = [];
  other.disk.entries = other.disk.entries.map((t) => JSON.stringify({ ...JSON.parse(t), tuning: TUNING_VERSION + 1 }));
  const lost = await open(memoryStore(other.disk), true);
  assert.equal(lost.ok, false);
  if (!lost.ok) assert.match(lost.sentence, /could not be read/);
  // an empty store is a new career, said so
  const blank = await open(memoryStore(), true);
  assert.ok(blank.ok && blank.from === 'new');
});

test('the Snapshot request writes one now; a backup copies the newest snapshot and its tail', async () => {
  const store = memoryStore();
  const { kept } = await run(store, SESSION.filter((c) => c.kind !== 'Snapshot').slice(0, 12));
  assert.equal(store.disk.snapshots.length, 0);
  const r = await send(store, kept, { kind: 'Snapshot' });
  assert.ok(r.ok);
  assert.equal(store.disk.snapshots[0].at, kept.seq);
  assert.equal(store.disk.entries.length, kept.seq, 'Snapshot is not journaled');
  await store.backup();
  assert.equal(store.disk.backup?.snapshots[0].at, kept.seq);
  assert.equal(store.disk.backup?.entries.length, 0);
});

test('a save of schema 1 (the fixture) loads; a save from a newer schema is not read as this one', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/career-schema-1.json', import.meta.url), 'utf8'));
  const disk: Disk = { snapshots: fixture.snapshots, entries: fixture.entries.map((e: Entry) => JSON.stringify(e)), backup: null };
  const opened = await open(memoryStore(disk), true);
  assert.ok(opened.ok, opened.ok ? '' : opened.sentence);
  if (!opened.ok) return;
  assert.equal(opened.kept.seq, 2);
  assert.equal(opened.kept.state.day, 14);
  assert.equal(opened.lost, null);
  assert.equal(opened.kept.state.crews[opened.kept.state.player!.crew].name, 'Inkwell Quillers');
  assert.equal(opened.migratedFrom, null);
  // a newer schema's snapshot is skipped; the journal still holds
  const newer = snapshotOf({ ...fresh().state, schema: 99 }, 0, ORIGIN);
  const d2: Disk = { snapshots: [newer], entries: [...disk.entries], backup: null };
  const o2 = await open(memoryStore(d2), true);
  // the fixture's entries were written under tuning 1: once the tuning moves on, its journal is never replayed whole (D36)
  if (fixture.entries.every((e: Entry) => e.tuning === TUNING_VERSION)) assert.ok(o2.ok && o2.from === 'journal');
  else assert.equal(o2.ok, false, 'a journal of an older tuning is not replayed whole');
});
