// The lab fleet's limits, the owner's (MANAGER.md 6), and where the fleet is:
// every number the dispatcher is held to, in one table each. Nothing in
// tools/fleet/ uses a machine, a thread or a second these do not allow; the
// choosing (hosts.ts) and the plan (plan.ts) are tested against them.
//
// Node only (tools/).

/** The owner's limits: never exceeded. */
export const LIMITS = {
  /** Machines used at once, at most. */
  machines: 30,
  /** Machines at once while the lab has machines free (leftFree of them). */
  machinesWhileFree: 50,
  /** Idle machines left untouched for a batch to go past `machines`. */
  leftFree: 30,
  /** A machine is used only with its load (1 and 5 minutes) under this. */
  load: 2,
  /** Every job's niceness. */
  nice: 19,
  /** Threads left free on each machine. */
  spare: 4,
  /** Memory a job may take (MB), and the share of a machine's free memory ours may. */
  jobMB: 1024,
  memory: 0.5,
} as const;

/** How the dispatcher gives up: on a shard, on a host, on a batch. */
export const RETRY = {
  /** Runs a shard is given before it is lost (each on a host it has not failed on). */
  attempts: 3,
  /** Failures in a row before a host is retired from its batch. */
  hostFailures: 3,
} as const;

/** Seconds: nothing waits on a prompt, and nothing of ours outlives these. */
export const TIMES = {
  /** ssh's ConnectTimeout. */
  connect: 8,
  /** A probe of one host, a `stop` on one host. */
  probe: 25,
  /** One job, unless its batch says otherwise. */
  job: 600,
  /** A whole batch: its runners end themselves past this. */
  batch: 4 * 3600,
  /** The dispatcher's heartbeat to each runner, and the silence a runner ends itself after. */
  beat: 15,
  silence: 90,
  /** ssh's keepalive: its interval, and how many may go unanswered. */
  alive: 15,
  aliveCount: 4,
  /** How long a host waits for the code's folder to show over NFS. */
  nfs: 90,
} as const;

/** The fleet: who logs in, where, and the one folder of ours in the NFS home. */
export const FLEET = {
  user: 'dkumar',
  domain: 'cs.utexas.edu',
  /** The host asked for the list of hosts, and the one files go through. */
  gate: 'garnet',
  /** The command there that lists the public Linux hosts. */
  list: '/lusr/bin/cshosts publinux',
  /** Our folder under the home directory: the code a commit, Node, results. */
  root: 'portolan-fleet',
  /** Commit folders and result batches kept when pruning. */
  keep: 4,
  keepBatches: 12,
  /** ssh sessions opened at once when probing or stopping. */
  fan: 32,
} as const;

/**
 * What is never copied to the lab: what is built, what is large, what is
 * local, and anything that may hold a secret.
 */
export const EXCLUDE = [
  'node_modules',
  'dist',
  'ios',
  'reference',
  'captures',
  '.git',
  '.claude',
  '.cache',
  '.vercel',
  '.env*',
  'out',
  '.DS_Store',
] as const;

/** Every process of ours on a lab host has this in its command line (the Node under our folder). */
export const MARK = `${FLEET.root}/`;

/** `MARK` as a pgrep pattern that does not match the shell searching for it. */
export const MARKED = `${FLEET.root.slice(0, -1)}[${FLEET.root.slice(-1)}]/`;
