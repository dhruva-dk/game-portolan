// Helpers for the career's tests (not a test file itself: the runner takes tests/*.test.ts). Later sections add their
// commands to `someCommand` and their rules to `invariants`.
import assert from 'node:assert/strict';
import type { Command } from '../src/office.ts';
import { apply, start, type CareerState } from '../src/career/career.ts';
import { random } from '../src/world/random.ts';
import { allowed, fullName, words } from '../src/career/names.ts';
import { ordered } from '../src/career/queue.ts';
import { ROLE_STATS } from '../src/career/roles.ts';
import { staffOf } from '../src/career/state.ts';
import type { Job } from '../src/race.ts';

/** The Found command of the tests' usual career. */
export const FOUND: Extract<Command, { kind: 'Found' }> = {
  kind: 'Found', seed: 20261115, crew: 'Portolan Quills', colours: { first: 2, second: 7 }, emblem: 3, given: 'Ottoline', family: 'Wrackham', headshot: 99,
};

/** A founded career; the world is made once a seed and shared (states are immutable). */
const made = new Map<number, CareerState>();
export function founded(seed = FOUND.seed): CareerState {
  const hit = made.get(seed);
  if (hit) return hit;
  const r = apply(start(), { ...FOUND, seed });
  assert.ok(r.ok, r.ok ? '' : r.reason.sentence);
  made.set(seed, r.state);
  return r.state;
}

/** Applies a command that must be accepted. */
export function must(s: CareerState, c: Command): CareerState {
  const r = apply(s, c, { debug: true });
  assert.ok(r.ok, `${c.kind} refused: ${r.ok ? '' : r.reason.sentence}`);
  return r.state;
}

/** Applies a command that must be refused, with a code. */
export function refused(s: CareerState, c: Command, code: string): void {
  const r = apply(s, c, { debug: true });
  assert.equal(r.ok, false, `${c.kind} should be refused (${code})`);
  if (!r.ok) assert.equal(r.reason.code, code, r.reason.sentence);
}

const JOBS: readonly Job[] = ['mend', 'gust', 'stores', 'part'];

/** A command a player might send in this state, good or bad, drawn from a generator. */
export function someCommand(s: CareerState, rand: () => number): Command {
  const r = rand();
  if (r < 0.25) return { kind: 'Advance' };
  if (r < 0.3) return { kind: 'Snapshot' };
  const flight = s.player ? s.crews[s.player.crew].staff.flight : [];
  if (r < 0.85 && flight.length > 0) return { kind: 'MoveFlightJob', gull: flight[Math.floor(rand() * flight.length)], job: JOBS[Math.floor(rand() * 4)] };
  if (r < 0.9) return { kind: 'MoveFlightJob', gull: Math.floor(rand() * s.gulls.length), job: JOBS[Math.floor(rand() * 4)] };
  return { kind: 'DebugCoin', coin: 100 };
}

/** A seeded run of commands for a session. */
export function script(seed: number, length: number): Command[] {
  const rand = random(seed);
  const out: Command[] = [FOUND];
  let s = founded();
  for (let i = 1; i < length; i++) {
    const c = someCommand(s, rand);
    out.push(c);
    const r = apply(s, c, { debug: true });
    if (r.ok) s = r.state;
  }
  return out;
}

/** The rules every state holds to (Phase B acceptance's property tests): one gull on at most one crew, staff and
 *  contracts agreeing, the queue in order, no two living gulls sharing a full name, no banned or shared crew words,
 *  each gull's stats their role's. */
export function invariants(s: CareerState): void {
  const on = new Map<number, number>();
  for (const c of s.crews) {
    for (const id of staffOf(c)) {
      assert.ok(!on.has(id), `gull ${id} is on crews ${on.get(id)} and ${c.id}`);
      on.set(id, c.id);
      assert.equal(s.gulls[id].contract?.crew, c.id, `gull ${id} is on crew ${c.id}'s staff without its contract`);
    }
    assert.equal(c.staff.flight.length, 4, `crew ${c.id} has ${c.staff.flight.length} flight gulls`);
    assert.deepEqual(new Set(c.staff.flight.map((id) => s.gulls[id].job)).size, 4, `crew ${c.id}'s flight do not cover the four jobs`);
  }
  for (const g of s.gulls) {
    if (g.contract) assert.equal(on.get(g.id), g.contract.crew, `gull ${g.id} holds a contract with crew ${g.contract.crew} but is not on its staff`);
    assert.deepEqual(Object.keys(g.stats).sort(), [...ROLE_STATS[g.role]].sort(), `gull ${g.id}'s stats are not a ${g.role}'s`);
    for (const v of Object.values(g.stats)) assert.ok(v >= 0 && v <= 20, `gull ${g.id} has a stat ${v}`);
    assert.ok(allowed(g.given) && allowed(g.family), `gull ${g.id} has a banned name`);
  }
  const living = s.gulls.filter((g) => g.retired === null).map(fullName);
  assert.equal(new Set(living).size, living.length, 'two living gulls share a full name');
  const seen = new Set<string>();
  for (const c of s.crews) for (const w of words(c.name)) {
    assert.ok(!seen.has(w), `the word '${w}' is in two crews' names`);
    seen.add(w);
  }
  assert.ok(ordered(s.queue), 'the queue is out of order');
}
