// The lab fleet's choosing (tools/fleet/hosts.ts), held to the owner's limits
// (tools/fleet/limits.ts LIMITS): which hosts a batch takes and
// how many jobs each is given; and the reading of what the lab says (the hosts
// listed, a probe's answer, the keys published).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowed,
  choose,
  free,
  hostsOf,
  kindOf,
  PROBE,
  probeOf,
  slotsOf,
  type Probe,
} from '../tools/fleet/hosts.ts';
import { EXCLUDE, LIMITS, MARK, MARKED } from '../tools/fleet/limits.ts';
import { keysOf } from '../tools/fleet/remote.ts';

const GEM = 'Intel(R) Core(TM) i5-14600',
  XEON = 'Intel(R) Xeon(R) W-2245 CPU @ 3.90GHz';

/** An idle gem, but for what is given. */
const host = (name: string, over: Partial<Probe> = {}): Probe => ({
  host: name,
  kind: 'gem',
  cpu: GEM,
  threads: 20,
  load: [0, 0],
  freeMB: 64000,
  ours: 0,
  users: 0,
  ...over,
});
const gems = (n: number, over: Partial<Probe> = {}) =>
  Array.from({ length: n }, (_, i) => host(`gem-${i}`, over));
const cereals = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    host(`cereal-${i}`, { kind: 'cereal', cpu: XEON, threads: 16 })
  );

test('limits: the table is the owner’s', () => {
  assert.equal(LIMITS.machines, 30);
  assert.equal(LIMITS.machinesWhileFree, 50);
  assert.equal(LIMITS.load, 2);
  assert.equal(LIMITS.nice, 19);
  assert.equal(LIMITS.spare, 4);
});

test('limits: no secret, key or build is copied to the lab', () => {
  for (const never of ['.git', '.env*', '.claude', 'node_modules'])
    assert.ok((EXCLUDE as readonly string[]).includes(never), never);
});

test('limits: the mark’s pattern matches the mark and not itself', () => {
  assert.match(`/u/someone/${MARK}node/bin/node`, new RegExp(MARKED));
  assert.doesNotMatch(MARKED, new RegExp(MARKED));
});

test('hosts: a listing is read a name a line, once each', () => {
  assert.deepEqual(hostsOf('agate\nalpha-bits\n\nagate\n  jet \n'), [
    'agate',
    'alpha-bits',
    'jet',
  ]);
  // nothing but a plain name is ever taken for a host
  assert.deepEqual(hostsOf('a;b $(x) ok-1 -bad UPPER x.y\n'), ['ok-1']);
});

test('hosts: a probe’s answer is read; one not whole is not used', () => {
  const answer = [
    'threads=20',
    'load=0.50 1.25',
    `cpu= ${GEM}`,
    'free=29000',
    'ours=0',
    'users=2',
  ].join('\n');
  assert.deepEqual(probeOf('agate', answer), {
    host: 'agate',
    kind: 'gem',
    cpu: GEM,
    threads: 20,
    load: [0.5, 1.25],
    freeMB: 29000,
    ours: 0,
    users: 2,
  });
  assert.equal(probeOf('agate', answer.replace('threads=20', '')), null);
  assert.equal(
    probeOf('agate', answer.replace('load=0.50 1.25', 'load=')),
    null
  );
  assert.equal(probeOf('agate', ''), null);
  // every fact the reading wants is asked for
  for (const key of ['threads', 'load', 'cpu', 'free', 'ours', 'users'])
    assert.ok(PROBE.includes(`echo ${key}=`), key);
});

test('hosts: a CPU’s make', () => {
  assert.equal(kindOf(GEM), 'gem');
  assert.equal(kindOf(XEON), 'cereal');
  assert.equal(kindOf('AMD EPYC 7313'), 'other');
});

test('slots: four threads are left free, and those its load already uses', () => {
  assert.equal(slotsOf(host('a')), 16);
  assert.equal(slotsOf(host('a', { threads: 16 })), 12);
  assert.equal(slotsOf(host('a', { load: [0.2, 1.4] })), 14);
  assert.equal(slotsOf(host('a', { threads: 4 })), 0);
  assert.equal(slotsOf(host('a', { threads: 2 })), 0);
});

test('slots: no more jobs than half its free memory holds', () => {
  const each = LIMITS.jobMB / LIMITS.memory;
  assert.equal(slotsOf(host('a', { freeMB: 5 * each })), 5);
  assert.equal(slotsOf(host('a', { freeMB: each - 1 })), 0);
});

test('free: only a machine with its load under 2, over one minute and five', () => {
  assert.ok(free(host('a', { load: [1.99, 1.99] })));
  assert.ok(!free(host('a', { load: [2, 0] })));
  assert.ok(!free(host('a', { load: [0, 2] })));
  assert.ok(!free(host('a', { load: [5.01, 5.01] })));
});

test('free: not a machine with a batch of ours on it, nor one with no room', () => {
  assert.ok(!free(host('a', { ours: 3 })));
  assert.ok(!free(host('a', { threads: 4 })));
});

test('allowed: 30 machines at most; up to 50 only while 30 idle are left untouched', () => {
  assert.equal(allowed(30, 200), 30);
  assert.equal(allowed(50, 200), 50);
  assert.equal(allowed(80, 200), 50);
  assert.equal(allowed(50, 80), 50);
  assert.equal(allowed(50, 79), 49);
  assert.equal(allowed(50, 65), 35);
  assert.equal(allowed(50, 60), 30);
  assert.equal(allowed(50, 40), 30);
  assert.equal(allowed(50, 12), 12);
  assert.equal(allowed(5, 100), 5);
  assert.equal(allowed(30, 0), 0);
  for (let idle = 0; idle < 200; idle++)
    for (const asked of [1, 30, 31, 50, 137]) {
      const n = allowed(asked, idle);
      assert.ok(n <= Math.min(asked, idle, LIMITS.machinesWhileFree));
      assert.ok(n <= LIMITS.machines || idle - n >= LIMITS.leftFree);
    }
});

test('choose: no host over its load, none with ours on it, never past the limit', () => {
  const probes = [
    ...gems(60),
    host('busy', { load: [3, 3] }),
    host('ours', { ours: 2 }),
  ];
  const seats = choose(probes);
  assert.equal(seats.length, LIMITS.machines);
  assert.ok(seats.every((s) => s.host.startsWith('gem-')));
  assert.ok(seats.every((s) => s.slots === 16));
  assert.equal(choose(probes, { machines: 500 }).length, 30);
  assert.equal(choose([...gems(100)], { machines: 500 }).length, 50);
  assert.equal(choose(gems(3), { machines: 50 }).length, 3);
  assert.deepEqual(choose([host('busy', { load: [2.5, 2.5] })]), []);
});

test('choose: gems before cereals, nobody at it before somebody, the lighter load first', () => {
  const seats = choose(
    [
      ...cereals(3),
      host('sat-at', { users: 1 }),
      host('working', { load: [1.5, 0.2] }),
      host('idle'),
    ],
    { machines: 4 }
  );
  assert.deepEqual(
    seats.map((s) => s.host),
    ['idle', 'working', 'sat-at', 'cereal-0']
  );
});

test('choose: the cereals asked for are taken, the rest gems', () => {
  const seats = choose([...gems(40), ...cereals(20)], {
    machines: 10,
    cereals: 4,
  });
  assert.equal(seats.length, 10);
  assert.equal(seats.filter((s) => s.kind === 'cereal').length, 4);
  assert.equal(seats.filter((s) => s.kind === 'gem').length, 6);
  assert.ok(
    seats.filter((s) => s.kind === 'cereal').every((s) => s.slots === 12)
  );
  // no more cereals than the batch, and no host twice
  const all = choose([...gems(2), ...cereals(20)], { machines: 5, cereals: 9 });
  assert.equal(all.length, 5);
  assert.equal(new Set(all.map((s) => s.host)).size, 5);
});

test('keys: a host’s published keys become its known_hosts lines; no other host’s do', () => {
  const published = [
    'agate.cs.utexas.edu_ecdsa ecdsa-sha2-nistp256 AAAAE2',
    'agate.cs.utexas.edu_ed25519 ssh-ed25519 AAAAC3',
    'agate.cs.utexas.edu_dsa ssh-dss AAAAB3',
    'jade.cs.utexas.edu_rsa,128.83.144.212,jade,jade.cs.utexas.edu ssh-rsa AAAAB4',
    'elsewhere.cs.utexas.edu_ed25519 ssh-ed25519 AAAAC4',
    '',
  ].join('\n');
  assert.deepEqual(keysOf(published, ['agate', 'jade', 'absent']), [
    'agate.cs.utexas.edu ecdsa-sha2-nistp256 AAAAE2',
    'agate.cs.utexas.edu ssh-ed25519 AAAAC3',
    'jade.cs.utexas.edu ssh-rsa AAAAB4',
  ]);
});
