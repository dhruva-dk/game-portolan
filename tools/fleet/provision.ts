// The lab made ready to run this tree: this machine's own Node installed once
// under our folder in the NFS home (the lab's is too old to run TypeScript),
// the working tree copied to a folder named for its commit, and the folders of
// old commits and old batches pruned. All through the gate; every host shares
// the home directory. No credential, key or token is copied (limits.ts
// EXCLUDE), and nothing outside our folder is written or removed.
//
// Node only (tools/).

import { EXCLUDE, FLEET, TIMES } from './limits.ts';
import { address, on, ROOT, RSH, run } from './remote.ts';

/** Where the lab's copy of a tree is, each path from the home directory. */
export interface Berth {
  /** The tree's name: its commit, and `-wip` if it had changes not committed. */
  tree: string;
  /** The folder of the code, and the Node that runs it. */
  code: string;
  node: string;
}

/** A tree's folder is named so, and a batch's results so: nothing else is ever pruned. */
export const TREE = /^[0-9a-f]{12}(-wip)?$/,
  BATCH = /^\d{8}-\d{6}-[a-z0-9-]+$/;

/** The newest file there is to wait for: written when a tree is wholly copied. */
export const SYNCED = '.synced';

/** A Node version as its folder is named: `v` and three numbers. */
const VERSION = /^v\d+\.\d+\.\d+$/;

export const berthOf = (tree: string, version: string): Berth => {
  if (!TREE.test(tree)) throw new Error(`not a tree's name: ${tree}`);
  if (!VERSION.test(version)) throw new Error(`not a Node: ${version}`);
  return {
    tree,
    code: `${FLEET.root}/${tree}`,
    node: `${FLEET.root}/node/${version}/bin/node`,
  };
};

/**
 * The script that installs a Node under our folder, if it is not there: the
 * official linux-x64 build, checked against the checksums published with it.
 * (Every path is whole, so each step bears our mark and `stop` ends it.)
 */
export function nodeScript(version: string): string {
  if (!VERSION.test(version)) throw new Error(`not a Node: ${version}`);
  const name = `node-${version}-linux-x64`,
    from = `https://nodejs.org/dist/${version}`;
  return [
    'set -euo pipefail',
    `D="$HOME/${FLEET.root}/node"`,
    `if [ -x "$D/${version}/bin/node" ]; then echo had; exit 0; fi`,
    'mkdir -p "$D"',
    `curl -fsSL -o "$D/${name}.tar.xz" "${from}/${name}.tar.xz"`,
    `curl -fsSL -o "$D/${name}.sums" "${from}/SHASUMS256.txt"`,
    `(cd "$D" && grep " ${name}.tar.xz\\$" "$D/${name}.sums" | sha256sum -c - >/dev/null)`,
    `rm -rf "$D/${name}"`,
    `nice tar -xJf "$D/${name}.tar.xz" -C "$D"`,
    `mv "$D/${name}" "$D/${version}"`,
    `rm -f "$D/${name}.tar.xz" "$D/${name}.sums"`,
    `"$D/${version}/bin/node" --version`,
  ].join('\n');
}

/** rsync's arguments to copy the tree at `from` to its berth on the gate. */
export const copyArgs = (from: string, berth: Berth): string[] => [
  '-az',
  '--delete',
  ...EXCLUDE.map((e) => `--exclude=${e}`),
  '-e',
  RSH,
  `${from}/`,
  `${address(FLEET.gate)}:${berth.code}/`,
];

/**
 * Of the names in our folder, newest first: the trees and batches to remove,
 * keeping the newest FLEET.keep trees (and `current`, always) and the newest
 * FLEET.keepBatches batches. A name that is not a tree's or a batch's is never
 * removed.
 */
export function stale(
  trees: readonly string[],
  batches: readonly string[],
  current: string
): { trees: string[]; batches: string[] } {
  const old = (names: readonly string[], shape: RegExp, keep: number) =>
    names.filter((n) => shape.test(n)).slice(keep);
  return {
    trees: old(trees, TREE, FLEET.keep).filter((t) => t !== current),
    batches: old(batches, BATCH, FLEET.keepBatches),
  };
}

const git = async (...args: string[]) => {
  const r = await run('git', args);
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.err}`);
  return r.out;
};

/** This working tree's name: its commit, `-wip` with changes not committed. */
export async function treeName(): Promise<string> {
  const commit = (await git('rev-parse', '--short=12', 'HEAD')).trim(),
    dirty = (await git('status', '--porcelain')).trim() !== '';
  return commit + (dirty ? '-wip' : '');
}

const must = async (what: string, r: ReturnType<typeof on>) => {
  const ran = await r;
  if (ran.code !== 0)
    throw new Error(`${what}: ${ran.err.trim() || `exit ${ran.code}`}`);
  return ran.out;
};

/**
 * The lab made ready for this tree: Node there, the tree copied, the old
 * pruned. `modules`: its node_modules installed there too (npm ci, once a
 * tree; the sim's tools need none).
 */
export async function provision({
  modules = false,
  say = (_: string) => {},
} = {}): Promise<Berth> {
  const berth = berthOf(await treeName(), process.version),
    gate = FLEET.gate,
    home = `$HOME/${berth.code}`;
  const had = await must(
    'installing Node',
    on(gate, nodeScript(process.version), 600)
  );
  say(
    `Node ${process.version} ${had.startsWith('had') ? 'is there' : 'installed'}`
  );
  await must('making our folder', on(gate, `mkdir -p "${home}"\n`));
  const copied = await run('rsync', copyArgs(ROOT, berth), { seconds: 600 });
  if (copied.code !== 0) throw new Error(`copying the tree: ${copied.err}`);
  if (modules)
    await must(
      'npm ci',
      on(
        gate,
        `cd "${home}" && PATH="$HOME/${berth.node.replace(/\/node$/, '')}:$PATH" nice npm ci --ignore-scripts --no-audit --no-fund\n`,
        1200
      )
    );
  // the tree is whole: say so (hosts wait on it), and list what is there
  const [trees, batches] = (
    await must(
      'listing our folder',
      on(
        gate,
        `date > "${home}/${SYNCED}"\ntouch "${home}"\nls -1t "$HOME/${FLEET.root}"\necho ---\nls -1t "$HOME/${FLEET.root}/results" 2>/dev/null\ntrue\n`
      )
    )
  )
    .split('---\n')
    .map((part) => part.split('\n').filter(Boolean));
  const gone = stale(trees, batches ?? [], berth.tree);
  const remove = [
    ...gone.trees.map((t) => `${FLEET.root}/${t}`),
    ...gone.batches.map((b) => `${FLEET.root}/results/${b}`),
  ];
  if (remove.length)
    await must(
      'pruning',
      on(
        gate,
        remove.map((p) => `rm -rf -- "$HOME/${p}"`).join('\n') + '\n',
        TIMES.probe * 4
      )
    );
  say(
    `tree ${berth.tree} copied to ${gate}:~/${berth.code}` +
      (remove.length
        ? `; pruned ${gone.trees.length} trees, ${gone.batches.length} batches`
        : '')
  );
  return berth;
}
