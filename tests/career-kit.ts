// Helpers for the career's tests (not a test file itself: the runner takes tests/*.test.ts). Later sections add their
// commands to `someCommand` and their rules to `invariants`.
import assert from 'node:assert/strict';
import type { Command, Offer } from '../src/office.ts';
import { askOf } from '../src/career/market.ts';
import { TUNING } from '../src/career/tuning.ts';
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

/** One of a list, or a default if empty. */
const one = <T>(rand: () => number, list: readonly T[], or: T): T => (list.length === 0 ? or : list[Math.floor(rand() * list.length)]);

/** An offer a player might make to a gull: about their ask, sometimes low, sometimes naming whom they replace. */
export function someOffer(s: CareerState, gull: number, rand: () => number): Offer {
  const g = s.gulls[gull];
  const crew = s.player ? s.crews[s.player.crew] : s.crews[0];
  const ask = g ? askOf(s, g, crew) : { wage: 50, fee: 200, seasons: 1 as const };
  const wage = Math.max(0, Math.round(ask.wage * (0.6 + rand() * 0.8)));
  const role = g?.role ?? 'flight';
  const status = role === 'captain' ? (rand() < 0.5 ? 'ship' : 'reserve') : 'staff';
  const mine = staffOf(crew).filter((id) => s.gulls[id].role === role && !s.gulls[id].player);
  return { role, status, wage, fee: Math.round(wage * 4 * rand()), seasons: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3, podium: 0, sinking: 0,
    breakClause: rand() < 0.5 ? null : wage * 10, replaces: rand() < 0.5 ? one(rand, mine, null) : null };
}

/** A command a player might send in this state, good or bad, drawn from a generator. */
export function someCommand(s: CareerState, rand: () => number): Command {
  const r = rand();
  if (r < 0.15) return { kind: 'Advance' };
  if (r < 0.18) return { kind: 'Snapshot' };
  const crew = s.player ? s.crews[s.player.crew] : null;
  const flight = crew ? crew.staff.flight : [];
  const anyGull = () => Math.floor(rand() * s.gulls.length);
  if (r < 0.5 && flight.length > 0) return { kind: 'MoveFlightJob', gull: flight[Math.floor(rand() * flight.length)], job: JOBS[Math.floor(rand() * 4)] };
  if (r < 0.52) return { kind: 'MoveFlightJob', gull: anyGull(), job: JOBS[Math.floor(rand() * 4)] };
  if (r < 0.6) return { kind: 'StartScout', scout: one(rand, crew?.staff.scouts ?? [], anyGull()), gull: anyGull() };
  if (r < 0.63) return { kind: 'CancelScout', scout: one(rand, crew?.staff.scouts ?? [], anyGull()) };
  if (r < 0.75) {
    const free = s.gulls.filter((g) => g.contract === null && g.retired === null && !g.player).map((g) => g.id);
    const gull = rand() < 0.6 ? one(rand, free, anyGull()) : anyGull();
    return { kind: 'OfferContract', gull, offer: someOffer(s, gull, rand) };
  }
  const talks = s.talks.filter((t) => t.crew === crew?.id).map((t) => t.gull);
  if (r < 0.78) return { kind: 'AcceptCounter', gull: one(rand, talks, anyGull()) };
  if (r < 0.81) return { kind: 'WithdrawOffer', gull: one(rand, talks, anyGull()) };
  if (r < 0.85) return { kind: 'Dismiss', gull: rand() < 0.7 && crew ? one(rand, staffOf(crew), anyGull()) : anyGull() };
  const offers = s.player?.offers.map((o) => o.crew) ?? [];
  if (r < 0.88) return { kind: 'TakeJob', crew: one(rand, offers, Math.floor(rand() * s.crews.length)) };
  if (r < 0.9) return { kind: 'DeclineJob', crew: one(rand, offers, Math.floor(rand() * s.crews.length)) };
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
    assert.ok(c.staff.flight.length <= 4, `crew ${c.id} has ${c.staff.flight.length} flight gulls`);
    assert.equal(new Set(c.staff.flight.map((id) => s.gulls[id].job)).size, c.staff.flight.length, `two of crew ${c.id}'s flight work one job`);
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
  market(s);
}

/** The market's rules (sections 4, 5, 7): talks and patience consistent, scouts at work on their own crew's staff,
 *  the player's post and offers as the player's state says. */
function market(s: CareerState): void {
  const pairs = new Set<string>();
  for (const t of s.talks) {
    const key = `${t.crew}:${t.gull}`;
    assert.ok(!pairs.has(key), `crew ${t.crew} holds two talks with gull ${t.gull}`);
    pairs.add(key);
    const g = s.gulls[t.gull];
    assert.ok(g && g.retired === null && !g.player, `talk ${t.id} is with gull ${t.gull}, who cannot be signed`);
    assert.equal(t.offer.role, g.role, `talk ${t.id} offers a ${t.offer.role} post to a ${g.role}`);
    const kind = t.counter === null ? 'answer' : 'lapse';
    assert.ok(s.queue.some((e) => e.kind === kind && e.talk === t.id), `talk ${t.id} has no ${kind} on the queue`);
    assert.ok(t.counter !== null || t.answer >= s.day, `talk ${t.id} was due on day ${t.answer}`);
  }
  for (const g of s.gulls) {
    assert.ok(g.patience >= 1 && g.patience <= TUNING.market.patienceMost, `gull ${g.id} has patience ${g.patience}`);
    if (g.retired !== null) assert.ok(g.contract === null || g.role === 'manager' || g.role === 'elder', `retired gull ${g.id} holds a contract`);
  }
  const busy = new Set<number>();
  for (const x of s.scouting) {
    assert.ok(!busy.has(x.scout), `scout ${x.scout} is on two jobs`);
    busy.add(x.scout);
    assert.ok(s.crews[x.crew].staff.scouts.includes(x.scout), `scout ${x.scout} works for crew ${x.crew} but is not on its staff`);
    assert.ok(s.queue.some((e) => e.kind === 'report' && e.crew === x.crew && e.scout === x.scout), `scout ${x.scout}'s report is not on the queue`);
  }
  for (const c of s.crews) assert.ok(c.staff.scouts.length <= c.buildings.crowsNest.level, `crew ${c.id} has more scouts than its crow's nest has places`);
  const p = s.player;
  if (!p) return;
  const crewsOfPlayer = s.crews.filter((c) => c.player);
  if (p.sacked) {
    assert.equal(crewsOfPlayer.length, 0, 'a sacked player has no crew');
    assert.equal(s.gulls[p.gull].contract, null);
    assert.ok(p.offers.length > 0, 'a sacked player is shown at least one offer');
    assert.ok(p.offers.some((o) => s.crews[o.crew].league === s.leagues.length - 1), 'a sacked player is offered a post in League Three');
  } else {
    assert.deepEqual(crewsOfPlayer.map((c) => c.id), [p.crew], 'the player\'s crew is the one crew marked theirs');
    assert.equal(s.crews[p.crew].staff.manager, p.gull);
    assert.equal(s.crews[p.crew].staff.ships[0].captain, null, 'the player sails ship one');
  }
  for (const o of p.offers) assert.ok(!s.crews[o.crew].player, 'the player is offered their own crew\'s post');
}
