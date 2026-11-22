// The lab fleet's provisioning and dispatch, their pure parts
// (tools/fleet/provision.ts, tools/fleet/dispatch.ts): what is copied and what
// never is, what is pruned and what never is, how a runner is started (niced,
// on our own Node, bounded), a batch's names, and the kinds of job there are
// (tools/fleet/jobs.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import {
  argvOf,
  batchName,
  fileOf,
  hereSeats,
  runnerCommand,
  shardsOf,
} from '../tools/fleet/dispatch.ts';
import { JOBS } from '../tools/fleet/jobs.ts';
import { FLEET, LIMITS, MARK, TIMES } from '../tools/fleet/limits.ts';
import {
  BATCH,
  berthOf,
  copyArgs,
  nodeScript,
  stale,
  TREE,
} from '../tools/fleet/provision.ts';

const TREES = Array.from(
  { length: 9 },
  (_, i) => `${String(i).repeat(12)}${i % 2 ? '-wip' : ''}`
);
const berth = berthOf(TREES[0], 'v26.11.1');

test('berth: the code a folder a commit, Node under our folder, both in the home’s one folder of ours', () => {
  assert.deepEqual(berth, {
    tree: '000000000000',
    code: `${FLEET.root}/000000000000`,
    node: `${FLEET.root}/node/v26.11.1/bin/node`,
  });
  assert.throws(() => berthOf('../elsewhere', 'v26.11.1'), /tree/);
  assert.throws(() => berthOf('main', 'v26.11.1'), /tree/);
  assert.throws(() => berthOf(TREES[0], '26; rm -rf ~'), /Node/);
});

test('provision: Node is the official build of the version asked, checked against its published sums, under our folder', () => {
  const script = nodeScript('v26.11.1');
  assert.match(
    script,
    /https:\/\/nodejs\.org\/dist\/v26\.11\.1\/node-v26\.11\.1-linux-x64\.tar\.xz/
  );
  assert.match(script, /SHASUMS256\.txt/);
  assert.match(script, /sha256sum -c/);
  assert.ok(script.startsWith('set -euo pipefail'));
  assert.ok(script.includes(`D="$HOME/${FLEET.root}/node"`));
  // installed once: nothing is fetched if it is there
  assert.ok(
    script.indexOf('exit 0') < script.indexOf('curl'),
    'the check comes first'
  );
  assert.throws(() => nodeScript('latest'), /Node/);
});

test('provision: the tree goes to its berth on the gate, and no secret, key or build with it', () => {
  const args = copyArgs('/work/tree', berth);
  assert.equal(args.at(-2), '/work/tree/');
  assert.equal(
    args.at(-1),
    `${FLEET.user}@${FLEET.gate}.${FLEET.domain}:${berth.code}/`
  );
  for (const never of [
    '.git',
    '.env*',
    '.claude',
    'node_modules',
    'reference',
    'captures',
    'ios',
    'dist',
  ])
    assert.ok(args.includes(`--exclude=${never}`), never);
  // ssh as everywhere: no prompt, a bounded connect
  const ssh = args[args.indexOf('-e') + 1];
  assert.match(ssh, /BatchMode=yes/);
  assert.match(ssh, new RegExp(`ConnectTimeout=${TIMES.connect}`));
});

test(`prune: the newest ${FLEET.keep} trees are kept, and the current one always; only a tree's or a batch's name is ever removed`, () => {
  const batches = Array.from(
    { length: FLEET.keepBatches + 3 },
    (_, i) => `20261121-0000${String(i).padStart(2, '0')}-match`
  );
  const gone = stale(
    [...TREES.slice(0, 2), 'node', 'results', 'notes.txt', ...TREES.slice(2)],
    [...batches, 'keep-me', '..'],
    TREES[8]
  );
  assert.deepEqual(gone.trees, TREES.slice(FLEET.keep, 8));
  assert.deepEqual(gone.batches, batches.slice(FLEET.keepBatches));
  for (const name of [...gone.trees, ...gone.batches])
    assert.ok(TREE.test(name) || BATCH.test(name), name);
  // nothing to prune while there are few
  assert.deepEqual(stale(TREES.slice(0, FLEET.keep), [], TREES[0]), {
    trees: [],
    batches: [],
  });
});

test('runner: started niced, on the Node under our folder (so it bears our mark), with its slots and its batch’s end', () => {
  const command = runnerCommand(
    { host: 'agate', kind: 'gem', slots: 14 },
    berth,
    TIMES.batch
  );
  assert.ok(
    command.includes(`exec nice -n ${LIMITS.nice} "$HOME/${berth.node}"`)
  );
  assert.ok(command.includes(MARK));
  assert.ok(command.includes(`cd "$HOME/${berth.code}"`));
  assert.ok(
    command.endsWith(`--name agate --slots 14 --seconds ${TIMES.batch}`)
  );
  // nothing is put in the background, nor detached from the session
  assert.doesNotMatch(command, /&\s*$|nohup|setsid|disown|screen|tmux/);
});

test('batch: its name is when and what, and is a name the pruning knows', () => {
  const name = batchName('match', new Date(Date.UTC(2026, 10, 21, 9, 5, 7)));
  assert.equal(name, '20261121-090507-match');
  assert.match(name, BATCH);
  assert.throws(() => batchName('../x', new Date()), /batch/);
  assert.throws(() => batchName('Has Space', new Date()), /batch/);
});

test('batch: a job’s words are its command’s, the shard and the result’s file filled in', () => {
  assert.deepEqual(
    argvOf('node tools/fleet/job.ts match {shard} {out}', '7', '/r/a b/7.json'),
    ['node', 'tools/fleet/job.ts', 'match', '7', '/r/a b/7.json']
  );
  assert.deepEqual(argvOf('x  --seed={shard}', '9', 'o'), ['x', '--seed=9']);
  assert.equal(
    fileOf({ id: '7#1', shard: '7', copy: 1 }, 'agate'),
    '7.1.agate.json'
  );
});

test('shards: names apart by commas, a..b every whole number between', () => {
  assert.deepEqual(shardsOf('1..4'), ['1', '2', '3', '4']);
  assert.deepEqual(shardsOf('dealt,mixed,gold-rush'), [
    'dealt',
    'mixed',
    'gold-rush',
  ]);
  assert.deepEqual(shardsOf('3..3,9,11..12'), ['3', '9', '11', '12']);
  assert.deepEqual(shardsOf('5..4'), []);
});

test('here: this machine’s seats leave its spare threads free, however many runners share it', () => {
  const room = availableParallelism() - LIMITS.spare;
  if (room < 2) return;
  for (const runners of [1, 2]) {
    const seats = hereSeats(runners);
    assert.equal(seats.length, runners);
    assert.ok(seats.reduce((n, s) => n + s.slots, 0) <= room);
    assert.ok(seats.every((s) => s.kind === 'mac' && s.slots >= 1));
    assert.equal(new Set(seats.map((s) => s.host)).size, runners);
  }
  assert.throws(() => hereSeats(room + 1), /no room/);
});

test('jobs: every kind says what a shard is and is bounded', () => {
  for (const [name, kind] of Object.entries(JOBS)) {
    assert.ok(kind.shard.length > 0, name);
    assert.ok(kind.seconds > 0 && kind.seconds <= TIMES.batch, name);
    assert.match(batchName(name, new Date()), BATCH);
  }
});
