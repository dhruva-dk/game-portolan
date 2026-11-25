import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_KEY,
  CAREER_KEY,
  loadCareer,
  memoryStore,
  saveQueue,
  sendAndSave,
  type Entries,
  type Store,
} from '../src/app/save.ts';
import { apply, newCareer } from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import type { CareerState } from '../src/career/state.ts';

const FIRST = newCareer({
  seed: 'save',
  name: 'Gull Racing',
  livery: { dye: 3, pattern: 1 },
  emblem: 2,
});

function accepted(state: CareerState, command: Command) {
  const applied = apply(state, command);
  assert.ok(applied.ok);
  return applied.state;
}

const SECOND = accepted(FIRST, { type: 'StartRace', team: 0 });

type Held = {
  store: Store;
  writes: Entries[];
  started: Entries[];
  finish(failed?: boolean): void;
};

function heldStore(): Held {
  const writes: Entries[] = [];
  const started: Entries[] = [];
  const open: { entries: Entries; done: (failed: boolean) => void }[] = [];
  return {
    store: {
      read: async (key) => {
        const last = writes.findLast((entries) => key in entries);
        return last?.[key] ?? null;
      },
      write: (entries) =>
        new Promise((resolve, reject) => {
          started.push(entries);
          open.push({
            entries,
            done: (failed) => {
              if (failed) return reject(new Error('the disk is full'));
              writes.push(entries);
              resolve();
            },
          });
        }),
    },
    writes,
    started,
    finish(failed = false) {
      const next = open.shift();
      assert.ok(next, 'a write is waiting');
      next.done(failed);
    },
  };
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

function storeOf(read: (key: string) => Promise<string | null>): Store {
  return { read, write: async () => {} };
}

test('the memory store reads what it wrote, and nothing for a key never written', async () => {
  const store = memoryStore();
  assert.equal(await store.read(CAREER_KEY), null);
  await store.write({ a: '1', b: '2' });
  await store.write({ b: '3' });
  assert.equal(await store.read('a'), '1');
  assert.equal(await store.read('b'), '3');
  assert.equal(await memoryStore({ c: '4' }).read('c'), '4');
});

test('a save writes the previous state to the backup and the new state to the career, in one write', async () => {
  const held = heldStore();
  const queue = saveQueue(held.store);
  const saved = queue.save(FIRST, SECOND);
  await turn();
  assert.equal(held.started.length, 1);
  assert.deepEqual(Object.keys(held.started[0]).sort(), [
    CAREER_KEY,
    BACKUP_KEY,
  ]);
  assert.deepEqual(JSON.parse(held.started[0][BACKUP_KEY]), FIRST);
  assert.deepEqual(JSON.parse(held.started[0][CAREER_KEY]), SECOND);
  held.finish();
  await saved;
  assert.deepEqual(await loadCareer(held.store), SECOND);
});

test('queued writes land in order: each starts only when the one before it has finished', async () => {
  const held = heldStore();
  const queue = saveQueue(held.store);
  const third = { ...SECOND, unread: true };
  const saves = [queue.save(FIRST, SECOND), queue.save(SECOND, third)];
  await turn();
  assert.equal(held.started.length, 1);
  held.finish();
  await saves[0];
  await turn();
  assert.equal(held.started.length, 2);
  held.finish();
  await saves[1];
  assert.deepEqual(
    held.writes.map((entries) => JSON.parse(entries[CAREER_KEY])),
    [SECOND, third]
  );
});

test('a failed write rejects its own save and the queue carries on', async () => {
  const held = heldStore();
  const queue = saveQueue(held.store);
  const failed = queue.save(FIRST, SECOND);
  const next = queue.save(SECOND, FIRST);
  await turn();
  held.finish(true);
  await assert.rejects(failed, /the disk is full/);
  await turn();
  held.finish();
  await next;
  assert.equal(held.writes.length, 1);
  await queue.settled();
});

test('with a way to persist, a failed write is retried until it lands, in order, and the trouble is surfaced while it lasts', async () => {
  const held = heldStore();
  const said: boolean[] = [];
  let again: () => void = () => undefined;
  const queue = saveQueue(held.store, {
    retry: () => new Promise((go) => (again = go)),
    failing: (on) => said.push(on),
  });
  const third = { ...SECOND, unread: true };
  let landed = false;
  const saved = queue.save(FIRST, SECOND).then(() => (landed = true));
  const next = queue.save(SECOND, third);
  let settled = false;
  void queue.settled().then(() => (settled = true));
  await turn();
  held.finish(true);
  await turn();
  assert.deepEqual(said, [true]);
  assert.equal(held.started.length, 1);
  again();
  await turn();
  held.finish(true);
  await turn();
  again();
  await turn();
  held.finish();
  await saved;
  assert.equal(landed, true);
  assert.deepEqual(said, [true, false]);
  assert.equal(settled, false);
  await turn();
  held.finish();
  await next;
  await queue.settled();
  assert.deepEqual(
    held.writes.map((entries) => JSON.parse(entries[CAREER_KEY])),
    [SECOND, third]
  );
});

test('settled waits for every queued write, including those queued while it waits', async () => {
  const held = heldStore();
  const queue = saveQueue(held.store);
  await queue.settled();
  void queue.save(FIRST, SECOND);
  let done = false;
  const settled = queue.settled().then(() => {
    done = true;
  });
  void queue.save(SECOND, FIRST);
  await turn();
  held.finish();
  await turn();
  assert.equal(done, false);
  held.finish();
  await settled;
  assert.equal(done, true);
  assert.equal(held.writes.length, 2);
});

test('an accepted command from team 0 is saved; a refused one is not', async () => {
  const held = heldStore();
  const queue = saveQueue(held.store);
  const sent = sendAndSave(queue, FIRST, { type: 'StartRace', team: 0 });
  assert.ok(sent.applied.ok);
  await turn();
  held.finish();
  await sent.saved;
  assert.deepEqual(JSON.parse(held.writes[0][BACKUP_KEY]), FIRST);
  assert.deepEqual(JSON.parse(held.writes[0][CAREER_KEY]), SECOND);
  const refused = sendAndSave(queue, SECOND, { type: 'StartRace', team: 0 });
  assert.deepEqual(refused.applied, { ok: false, reason: 'phase' });
  await refused.saved;
  await queue.settled();
  assert.equal(held.started.length, 1);
});

const GARBAGE = ['', '{"seed":', 'not json', '42', 'null', '[1, 2]', '{}'];

test('load falls back to the backup when the career is missing or does not parse', async () => {
  const backup = JSON.stringify(FIRST);
  assert.deepEqual(
    await loadCareer(memoryStore({ [BACKUP_KEY]: backup })),
    FIRST
  );
  for (const garbage of GARBAGE)
    assert.deepEqual(
      await loadCareer(
        memoryStore({ [CAREER_KEY]: garbage, [BACKUP_KEY]: backup })
      ),
      FIRST,
      garbage
    );
  const failing = storeOf(async (key) => {
    if (key === CAREER_KEY) throw new Error('unreadable');
    return backup;
  });
  assert.deepEqual(await loadCareer(failing), FIRST);
  assert.deepEqual(
    await loadCareer(
      memoryStore({
        [CAREER_KEY]: JSON.stringify(SECOND),
        [BACKUP_KEY]: backup,
      })
    ),
    SECOND
  );
});

test('load finds no career when both keys are bad', async () => {
  assert.equal(await loadCareer(memoryStore()), null);
  for (const garbage of GARBAGE)
    assert.equal(
      await loadCareer(
        memoryStore({ [CAREER_KEY]: garbage, [BACKUP_KEY]: garbage })
      ),
      null,
      garbage
    );
  assert.equal(
    await loadCareer(
      storeOf(async () => {
        throw new Error('unreadable');
      })
    ),
    null
  );
});
