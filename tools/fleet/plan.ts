// A batch's plan: which shard runs on which host next, and what becomes of one
// that fails. Pure, and all of a batch's choosing: the dispatcher asks it for a
// host's next job, tells it what came back, and reads the outcome.
//
// - A host is never given more jobs at once than its slots (hosts.ts slotsOf).
// - A run that fails (its job exits badly, runs past its time, or its host
//   drops) is run again on a host it has not failed on, RETRY.attempts runs at
//   most; then the shard is lost, and the outcome says so.
// - A host that fails RETRY.hostFailures runs in a row is retired.
// - Verifying, every shard is run twice, on two different hosts: one a gem and
//   one not (a cereal) while the batch has both, and the two hashes compared.
//
// Node only (tools/).

import type { Kind, Seat } from './hosts.ts';
import { RETRY } from './limits.ts';

/** One run of a shard to do: `copy` 1 is the second run of a verified shard. */
export interface Job {
  id: string;
  shard: string;
  copy: number;
}

/** Why a run failed. */
export type Why = 'exit' | 'timeout' | 'dropped' | 'unreadable';

/** A run that came back: where, its result's hash, how long it took (ms). */
export interface Run extends Job {
  host: string;
  kind: Kind;
  hash: string;
  ms: number;
}

/** A run that failed. */
export interface Failure {
  host: string;
  why: Why;
  note: string;
}

/** What a batch came to. */
export interface Outcome {
  runs: Run[];
  /** Shards (by copy) given up on, each with its failures. */
  lost: { shard: string; copy: number; failures: Failure[] }[];
  /** Verifying: the shards both of whose runs came back alike, and those that differ. */
  verified: number;
  differing: { shard: string; runs: [Run, Run] }[];
  /** Hosts retired or dropped during the batch. */
  retired: string[];
}

interface Entry {
  job: Job;
  state: 'waiting' | 'running' | 'done' | 'lost';
  /** The host it runs on, or ran on. */
  on: string | null;
  failures: Failure[];
  run: Run | null;
}

interface Host {
  seat: Seat;
  running: number;
  failures: number;
  live: boolean;
}

/** A shard's name goes into a file's: letters, digits, dot, dash, underscore. */
const NAME = /^[\w.-]+$/;

export function createPlan(
  shards: readonly string[],
  seats: readonly Seat[],
  { verify = false } = {}
) {
  if (new Set(shards).size !== shards.length)
    throw new Error('a shard is named twice');
  for (const s of shards)
    if (!NAME.test(s)) throw new Error(`a shard cannot be named "${s}"`);
  if (verify && seats.length < 2)
    throw new Error('verifying takes two hosts: every shard runs on two');

  const hosts = new Map<string, Host>(
    seats.map((seat) => [
      seat.host,
      { seat, running: 0, failures: 0, live: true },
    ])
  );
  const entries = new Map<string, Entry>();
  // those waiting: first runs by copy, and those to run again (anywhere new)
  const first: Set<Entry>[] = [new Set(), new Set()],
    again = new Set<Entry>();
  for (const shard of shards)
    for (let copy = 0; copy < (verify ? 2 : 1); copy++) {
      const e: Entry = {
        job: { id: `${shard}#${copy}`, shard, copy },
        state: 'waiting',
        on: null,
        failures: [],
        run: null,
      };
      entries.set(e.job.id, e);
      first[copy].add(e);
    }
  const other = (e: Entry) =>
    entries.get(`${e.job.shard}#${1 - e.job.copy}`) ?? null;

  /** Whether a host may run this entry at all: not where it failed, nor where its other run is. */
  const may = (e: Entry, host: string) =>
    !e.failures.some((f) => f.host === host) && other(e)?.on !== host;
  /** The kind of host a first run goes to, verifying: copy 0 a gem, copy 1 not. */
  const suits = (copy: number, kind: Kind) =>
    !verify || (copy === 0 ? kind === 'gem' : kind !== 'gem');
  const firstOf = (from: Set<Entry>, host: string) => {
    for (const e of from) if (may(e, host)) return e;
    return null;
  };

  const take = (h: Host): Entry | null => {
    const host = h.seat.host;
    const retry = firstOf(again, host);
    if (retry) return retry;
    for (const copy of [0, 1])
      if (suits(copy, h.seat.kind)) {
        const e = firstOf(first[copy], host);
        if (e) return e;
      }
    // a copy no live host suits goes to whoever is free
    for (const copy of [0, 1])
      if (
        ![...hosts.values()].some((o) => o.live && suits(copy, o.seat.kind))
      ) {
        const e = firstOf(first[copy], host);
        if (e) return e;
      }
    return null;
  };
  /** Runs still to come back (waiting or running). */
  let left = entries.size;

  const fail = (e: Entry, why: Why, note: string) => {
    const h = hosts.get(e.on ?? '');
    if (e.state !== 'running' || !h) throw new Error(`${e.job.id} not running`);
    h.running--;
    h.failures++;
    e.failures.push({ host: h.seat.host, why, note });
    e.on = null;
    if (e.failures.length >= RETRY.attempts) {
      e.state = 'lost';
      left--;
    } else {
      e.state = 'waiting';
      again.add(e);
    }
    return h;
  };

  return {
    /** The next job for this host, now running on it; null if it has no slot free or none is for it. */
    next(host: string): Job | null {
      const h = hosts.get(host);
      if (!h || !h.live || h.running >= h.seat.slots) return null;
      const e = take(h);
      if (!e) return null;
      again.delete(e);
      first[e.job.copy].delete(e);
      e.state = 'running';
      e.on = host;
      h.running++;
      return e.job;
    },

    /** A run came back whole. */
    done(id: string, hash: string, ms: number) {
      const e = entries.get(id),
        h = hosts.get(e?.on ?? '');
      if (!e || e.state !== 'running' || !h)
        throw new Error(`${id} not running`);
      h.running--;
      h.failures = 0;
      left--;
      e.state = 'done';
      e.run = { ...e.job, host: h.seat.host, kind: h.seat.kind, hash, ms };
    },

    /** A run failed; true if its host is to be retired (drop it). */
    failed(id: string, why: Why, note = ''): boolean {
      const e = entries.get(id);
      if (!e) throw new Error(`no job ${id}`);
      return fail(e, why, note).failures >= RETRY.hostFailures;
    },

    /** A host is gone (or retired): no more goes to it, and what ran on it failed. */
    drop(host: string, note = '') {
      const h = hosts.get(host);
      if (!h || !h.live) return;
      h.live = false;
      for (const e of entries.values())
        if (e.state === 'running' && e.on === host) fail(e, 'dropped', note);
    },

    /** Jobs running now, on a host or on all. */
    running: (host?: string) =>
      host === undefined
        ? [...hosts.values()].reduce((n, h) => n + h.running, 0)
        : (hosts.get(host)?.running ?? 0),

    left: () => left,

    /**
     * Nothing running and nothing more can be given out: what still waits is
     * lost (no host left that may run it).
     */
    strand() {
      for (const e of entries.values())
        if (e.state === 'waiting') {
          e.state = 'lost';
          left--;
          e.failures.push({ host: '', why: 'dropped', note: 'no host left' });
          again.delete(e);
          first[e.job.copy].delete(e);
        }
    },

    outcome(): Outcome {
      const all = [...entries.values()];
      const runs = all.flatMap((e) => (e.run ? [e.run] : []));
      const pairs = verify
        ? shards.flatMap((s) => {
            const a = entries.get(`${s}#0`)?.run,
              b = entries.get(`${s}#1`)?.run;
            return a && b ? [[a, b] as [Run, Run]] : [];
          })
        : [];
      return {
        runs,
        lost: all
          .filter((e) => e.state === 'lost')
          .map((e) => ({
            shard: e.job.shard,
            copy: e.job.copy,
            failures: e.failures,
          })),
        verified: pairs.filter(([a, b]) => a.hash === b.hash).length,
        differing: pairs
          .filter(([a, b]) => a.hash !== b.hash)
          .map(([a, b]) => ({ shard: a.shard, runs: [a, b] })),
        retired: [...hosts.values()]
          .filter((h) => !h.live)
          .map((h) => h.seat.host),
      };
    },
  };
}

export type Plan = ReturnType<typeof createPlan>;
