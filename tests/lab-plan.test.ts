// A batch's plan (tools/fleet/plan.ts): its sharding over the hosts' slots,
// its retry policy (tools/fleet/limits.ts RETRY), and verifying, where every
// shard runs on two different hosts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Kind, Seat } from '../tools/fleet/hosts.ts';
import { RETRY } from '../tools/fleet/limits.ts';
import { createPlan, type Job, type Plan } from '../tools/fleet/plan.ts';

const seat = (host: string, kind: Kind = 'gem', slots = 2): Seat => ({
  host,
  kind,
  slots,
});
const shards = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

/** Every host filled to its slots: what each was given. */
function fill(plan: Plan, seats: readonly Seat[]) {
  const given: { host: string; job: Job }[] = [];
  for (const s of seats)
    for (let job = plan.next(s.host); job; job = plan.next(s.host))
      given.push({ host: s.host, job });
  return given;
}

/** The plan run to its end, every run coming back with `hash(job, host)`. */
function sail(
  plan: Plan,
  seats: readonly Seat[],
  hash: (job: Job, host: string) => string = (job) => job.shard
) {
  const ran: { host: string; job: Job }[] = [];
  for (let given = fill(plan, seats); given.length; given = fill(plan, seats))
    for (const g of given) {
      plan.done(g.job.id, hash(g.job, g.host), 1);
      ran.push(g);
    }
  return ran;
}

test('plan: every shard is run once, and no host holds more than its slots', () => {
  const seats = [seat('a', 'gem', 3), seat('b', 'gem', 1), seat('c', 'cereal')];
  const plan = createPlan(shards(20), seats);
  const given = fill(plan, seats);
  assert.equal(given.length, 6);
  for (const s of seats) {
    assert.equal(given.filter((g) => g.host === s.host).length, s.slots);
    assert.equal(plan.running(s.host), s.slots);
    assert.equal(plan.next(s.host), null);
  }
  assert.equal(plan.running(), 6);
  for (const g of given) plan.done(g.job.id, 'h', 1);
  const ran = [...given, ...sail(plan, seats)];
  assert.deepEqual(ran.map((g) => g.job.shard).sort(), shards(20).sort());
  assert.equal(plan.left(), 0);
  const o = plan.outcome();
  assert.equal(o.runs.length, 20);
  assert.deepEqual([o.lost, o.differing, o.retired], [[], [], []]);
});

test('plan: a host not of the batch is given nothing', () => {
  const plan = createPlan(shards(3), [seat('a')]);
  assert.equal(plan.next('stranger'), null);
});

test('retry: a run that fails goes to a host it has not failed on', () => {
  const seats = [seat('a', 'gem', 1), seat('b', 'gem', 1), seat('c', 'gem', 1)];
  const plan = createPlan(['only'], seats);
  assert.equal(plan.next('a')?.shard, 'only');
  plan.failed('only#0', 'exit', 'boom');
  assert.equal(plan.next('a'), null);
  assert.equal(plan.next('b')?.shard, 'only');
  plan.failed('only#0', 'timeout');
  assert.equal(plan.next('a'), null);
  assert.equal(plan.next('b'), null);
  assert.equal(plan.next('c')?.shard, 'only');
  plan.done('only#0', 'h', 5);
  assert.deepEqual(plan.outcome().runs, [
    {
      id: 'only#0',
      shard: 'only',
      copy: 0,
      host: 'c',
      kind: 'gem',
      hash: 'h',
      ms: 5,
    },
  ]);
  assert.deepEqual(plan.outcome().lost, []);
});

test(`retry: after ${RETRY.attempts} failed runs a shard is lost, with why`, () => {
  const seats = shards(RETRY.attempts + 1).map((h) => seat(h));
  const plan = createPlan(['doomed', 'fine'], seats);
  for (let k = 0; k < RETRY.attempts; k++) {
    assert.equal(plan.next(seats[k].host)?.shard, 'doomed', `run ${k}`);
    plan.failed('doomed#0', 'exit', `no ${k}`);
  }
  sail(plan, seats);
  const o = plan.outcome();
  assert.deepEqual(
    o.runs.map((r) => r.shard),
    ['fine']
  );
  assert.equal(o.lost.length, 1);
  assert.equal(o.lost[0].shard, 'doomed');
  assert.deepEqual(
    o.lost[0].failures.map((f) => [f.host, f.why, f.note]),
    seats.slice(0, RETRY.attempts).map((s, k) => [s.host, 'exit', `no ${k}`])
  );
  assert.equal(plan.left(), 0);
});

test('retry: a host that drops has its shards run again elsewhere, and is given no more', () => {
  const seats = [seat('a', 'gem', 2), seat('b', 'gem', 2)];
  const plan = createPlan(shards(6), seats);
  const given = fill(plan, seats);
  const lost = given.filter((g) => g.host === 'a').map((g) => g.job.shard);
  plan.drop('a', 'ssh closed');
  assert.equal(plan.next('a'), null);
  assert.equal(plan.running('a'), 0);
  for (const g of given.filter((g) => g.host === 'b'))
    plan.done(g.job.id, 'h', 1);
  const after = sail(plan, seats);
  assert.ok(after.every((g) => g.host === 'b'));
  // what a had is run again first
  assert.deepEqual(
    after.slice(0, 2).map((g) => g.job.shard),
    lost
  );
  const o = plan.outcome();
  assert.equal(o.runs.length, 6);
  assert.deepEqual(o.lost, []);
  assert.deepEqual(o.retired, ['a']);
});

test(`retry: a host is retired after ${RETRY.hostFailures} failures in a row, not if a run between them came back`, () => {
  const seats = [seat('bad', 'gem', 1), seat('good', 'gem', 1)];
  const plan = createPlan(shards(20), seats);
  const retire: boolean[] = [];
  for (let k = 0; k < RETRY.hostFailures; k++) {
    const job = plan.next('bad');
    assert.ok(job);
    retire.push(plan.failed(job.id, 'exit'));
  }
  assert.deepEqual(retire, [
    ...Array.from({ length: RETRY.hostFailures - 1 }, () => false),
    true,
  ]);
  // a run come back between failures starts the count again
  const other = createPlan(shards(20), seats);
  for (let k = 0; k < RETRY.hostFailures * 2; k++) {
    const job = other.next('bad');
    assert.ok(job);
    if (k % 2) other.done(job.id, 'h', 1);
    else assert.equal(other.failed(job.id, 'exit'), false);
  }
});

test('retry: with no host left that may run it, what waits is lost', () => {
  const plan = createPlan(shards(3), [seat('a', 'gem', 1)]);
  assert.equal(plan.next('a')?.shard, 's0');
  plan.drop('a');
  assert.equal(plan.next('a'), null);
  assert.equal(plan.running(), 0);
  assert.equal(plan.left(), 3);
  plan.strand();
  assert.equal(plan.left(), 0);
  assert.equal(plan.outcome().lost.length, 3);
});

test('verify: every shard runs on two different hosts, a gem and a cereal', () => {
  const seats = [
    seat('g1'),
    seat('g2'),
    seat('c1', 'cereal'),
    seat('c2', 'cereal'),
  ];
  const plan = createPlan(shards(12), seats, { verify: true });
  const ran = sail(plan, seats);
  assert.equal(ran.length, 24);
  const o = plan.outcome();
  for (const s of shards(12)) {
    const kinds = o.runs.filter((r) => r.shard === s).map((r) => r.kind);
    assert.deepEqual(kinds.sort(), ['cereal', 'gem'], s);
  }
  assert.equal(o.verified, 12);
  assert.deepEqual(o.differing, []);
});

test('verify: a shard whose two runs differ is told, with both', () => {
  const seats = [seat('g1'), seat('c1', 'cereal')];
  const plan = createPlan(shards(4), seats, { verify: true });
  sail(plan, seats, (job, host) =>
    job.shard === 's2' ? `${job.shard}@${host}` : job.shard
  );
  const o = plan.outcome();
  assert.equal(o.verified, 3);
  assert.equal(o.differing.length, 1);
  assert.equal(o.differing[0].shard, 's2');
  assert.deepEqual(
    o.differing[0].runs.map((r) => [r.host, r.hash]),
    [
      ['g1', 's2@g1'],
      ['c1', 's2@c1'],
    ]
  );
});

test('verify: with one make of host, still two different hosts a shard', () => {
  for (const kind of ['gem', 'cereal', 'mac'] as const) {
    const seats = [seat('x', kind), seat('y', kind), seat('z', kind)];
    const plan = createPlan(shards(9), seats, { verify: true });
    sail(plan, seats);
    const o = plan.outcome();
    assert.equal(o.verified, 9, kind);
    for (const s of shards(9)) {
      const on = o.runs.filter((r) => r.shard === s).map((r) => r.host);
      assert.equal(new Set(on).size, 2, `${kind} ${s}`);
    }
  }
});

test('verify: the cereals gone, the second runs go to gems, never the first run’s own', () => {
  const seats = [seat('g1'), seat('g2'), seat('c1', 'cereal')];
  const plan = createPlan(shards(6), seats, { verify: true });
  const given = fill(plan, seats);
  // while a cereal lives, a gem takes no second run
  assert.ok(given.every((g) => (g.host === 'c1') === (g.job.copy === 1)));
  plan.drop('c1');
  for (const g of given.filter((g) => g.host !== 'c1'))
    plan.done(g.job.id, g.job.shard, 1);
  sail(plan, seats);
  const o = plan.outcome();
  assert.equal(o.verified, 6);
  assert.deepEqual(o.lost, []);
  for (const s of shards(6)) {
    const on = o.runs.filter((r) => r.shard === s).map((r) => r.host);
    assert.deepEqual(on.sort(), ['g1', 'g2'], s);
  }
});

test('verify: a second run that failed is never run where the first one ran', () => {
  const seats = [
    seat('g1', 'gem', 1),
    seat('c1', 'cereal', 1),
    seat('c2', 'cereal', 1),
  ];
  const plan = createPlan(['s'], seats, { verify: true });
  assert.equal(plan.next('g1')?.id, 's#0');
  assert.equal(plan.next('c1')?.id, 's#1');
  plan.done('s#0', 'h', 1);
  plan.failed('s#1', 'exit');
  assert.equal(plan.next('g1'), null);
  assert.equal(plan.next('c1'), null);
  assert.equal(plan.next('c2')?.id, 's#1');
});

test('plan: a shard’s name is plain and its own; verifying takes two hosts', () => {
  assert.throws(() => createPlan(['a', 'a'], [seat('x')]), /twice/);
  assert.throws(() => createPlan(['a/b'], [seat('x')]), /cannot be named/);
  assert.throws(() => createPlan(['a b'], [seat('x')]), /cannot be named/);
  assert.throws(
    () => createPlan(['a'], [seat('x')], { verify: true }),
    /two hosts/
  );
});
