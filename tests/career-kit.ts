// Helpers for the career's tests (not a test file itself: the runner takes tests/*.test.ts). Later sections add their
// commands to `someCommand` and their rules to `invariants`.
import assert from 'node:assert/strict';
import {
  SHIPS,
  type Building,
  type Command,
  type Offer,
  type Plan,
  type Ship,
} from '../src/office/command.ts';
import { raceCards } from '../src/career/card.ts';
import { lineups } from '../src/career/lineup.ts';
import { TEMPLATES } from '../src/career/mail.ts';
import { standIn } from './career-results.ts';
import { askOf } from '../src/career/market.ts';
import { TUNING } from '../src/career/tuning.ts';
import { apply, start, type CareerState } from '../src/career/career.ts';
import { random } from '../src/world/random.ts';
import { allowed, fullName, words } from '../src/career/names.ts';
import { ordered } from '../src/career/queue.ts';
import { ROLE_STATS } from '../src/career/roles.ts';
import { staffOf, type Team } from '../src/career/state.ts';
import { CALLS, PARTS } from '../src/race.ts';
import { TRADES, supplierCards } from '../src/career/suppliers.ts';

/** The Found command of the tests' usual career. */
export const FOUND: Extract<Command, { kind: 'Found' }> = {
  kind: 'Found',
  seed: 20261115,
  team: 'Portolan Quills',
  colours: { dye: 2, pattern: 1 },
  emblem: 3,
  given: 'Ottoline',
  family: 'Wrackham',
  headshot: 99,
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

/** A state with a team changed. */
export const withTeam = (
  s: CareerState,
  id: number,
  f: (c: Team) => Team
): CareerState => {
  const teams = [...s.teams];
  teams[id] = f(s.teams[id]);
  return { ...s, teams };
};

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

/** One of a list, or a default if empty. */
const one = <T>(rand: () => number, list: readonly T[], or: T): T =>
  list.length === 0 ? or : list[Math.floor(rand() * list.length)];

/** An offer a player might make to a person: about their ask, sometimes low, sometimes naming whom they replace. */
export function someOffer(
  s: CareerState,
  person: number,
  rand: () => number
): Offer {
  const g = s.people[person];
  const team = s.player ? s.teams[s.player.team] : s.teams[0];
  const ask = g
    ? askOf(s, g, team)
    : { wage: 50, fee: 200, seasons: 1 as const };
  const wage = Math.max(0, Math.round(ask.wage * (0.6 + rand() * 0.8)));
  const role = g?.role ?? 'pit';
  const status =
    role === 'driver' ? (rand() < 0.5 ? 'ship' : 'reserve') : 'staff';
  const mine = staffOf(team).filter(
    (id) => s.people[id].role === role && !s.people[id].player
  );
  return {
    role,
    status,
    wage,
    fee: Math.round(wage * 4 * rand()),
    seasons: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3,
    podium: 0,
    sinking: 0,
    breakClause: rand() < 0.5 ? null : wage * 10,
    replaces: rand() < 0.5 ? one(rand, mine, null) : null,
  };
}

/** A command a player might send in this state, good or bad, drawn from a generator. */
export function someCommand(s: CareerState, rand: () => number): Command {
  // on race day, mostly the race's own commands (Advance waits for it to be sailed)
  if (s.race !== null && rand() < (s.race.started ? 0.85 : 0.5))
    return raceCommand(s, rand);
  const r = rand();
  if (r < 0.15) return { kind: 'Advance' };
  if (r < 0.18) return { kind: 'Snapshot' };
  const team = s.player ? s.teams[s.player.team] : null;
  const anyPerson = () => Math.floor(rand() * s.people.length);
  if (r < 0.36) return worksCommand(s, rand);
  if (r < 0.52) return { kind: 'SetPlan', plan: somePlan(s, rand) };
  if (r < 0.6)
    return {
      kind: 'StartScout',
      scout: one(rand, team?.staff.scouts ?? [], anyPerson()),
      person: anyPerson(),
    };
  if (r < 0.63)
    return {
      kind: 'CancelScout',
      scout: one(rand, team?.staff.scouts ?? [], anyPerson()),
    };
  if (r < 0.75) {
    const free = s.people
      .filter((g) => g.contract === null && g.retired === null && !g.player)
      .map((g) => g.id);
    const person = rand() < 0.6 ? one(rand, free, anyPerson()) : anyPerson();
    return { kind: 'OfferContract', person, offer: someOffer(s, person, rand) };
  }
  const talks = s.talks.filter((t) => t.team === team?.id).map((t) => t.person);
  if (r < 0.78)
    return { kind: 'AcceptCounter', person: one(rand, talks, anyPerson()) };
  if (r < 0.81)
    return { kind: 'WithdrawOffer', person: one(rand, talks, anyPerson()) };
  if (r < 0.85)
    return {
      kind: 'Dismiss',
      person:
        rand() < 0.7 && team
          ? one(rand, staffOf(team), anyPerson())
          : anyPerson(),
    };
  const offers = s.player?.offers.map((o) => o.team) ?? [];
  if (r < 0.88)
    return {
      kind: 'TakeJob',
      team: one(rand, offers, Math.floor(rand() * s.teams.length)),
    };
  if (r < 0.9)
    return {
      kind: 'DeclineJob',
      team: one(rand, offers, Math.floor(rand() * s.teams.length)),
    };
  if (r < 0.91) return { kind: 'DebugBalance', balance: 100 };
  if (r < 0.95) return raceCommand(s, rand);
  return worksCommand(s, rand);
}

/** One of the ships of a team, drawn. */
const someShip = (rand: () => number): Ship =>
  SHIPS[Math.floor(rand() * SHIPS.length)] ?? 0;

/** A race plan the player might set: mostly sound, its driver sometimes another's or unfit. */
export function somePlan(s: CareerState, rand: () => number): Plan {
  const c = s.player ? s.teams[s.player.team] : s.teams[0];
  const free = s.people
    .filter(
      (g) =>
        g.role === 'driver' &&
        g.contract === null &&
        g.retired === null &&
        !g.player
    )
    .map((g) => g.id);
  const mine = [...c.staff.ships.map((h) => h.driver), c.staff.reserve].filter(
    (x): x is number => x !== null
  );
  // mostly her own drivers in a drawn order; sometimes a free agent, or anyone at all
  const pool = [...mine].sort(() => rand() - 0.5);
  const drivers = SHIPS.slice(1).map((_, k) =>
    rand() < 0.85
      ? (pool[k] ?? one(rand, free, 0))
      : rand() < 0.5
        ? one(rand, free, 0)
        : Math.floor(rand() * s.people.length)
  );
  const parts = c.parts
    .filter((p) => !p.forNext && rand() < 0.3)
    .map((p) => ({ part: p.id, ship: someShip(rand) }));
  return {
    drivers,
    parts,
    objectives: c.sponsors.map((p) =>
      p && p.objectives.length > 0
        ? Math.floor(rand() * p.objectives.length)
        : null
    ),
    call: CALLS[Math.floor(rand() * CALLS.length)] ?? 'free',
  };
}

/** A race day's command: the plan, the start, a tier's result, a forfeit, the mail. */
function raceCommand(s: CareerState, rand: () => number): Command {
  const r = rand();
  if (r < 0.2 && !s.race?.started)
    return { kind: 'SetPlan', plan: somePlan(s, rand) };
  if (r < 0.4 && !s.race?.started)
    return { kind: 'RaceStarted', round: s.race?.round ?? s.round };
  if (r < 0.75 && s.race) {
    // mostly a tier not yet recorded, sometimes any (a second result is refused)
    const cards = raceCards(s),
      open = cards.filter((_, tier) => s.race!.results[tier] === null);
    return {
      kind: 'RecordRace',
      result: standIn(
        rand() < 0.85
          ? one(rand, open, cards[0])
          : cards[Math.floor(rand() * cards.length)]
      ),
    };
  }
  if (r < 0.8) return { kind: 'Forfeit', round: s.race?.round ?? s.round };
  const dilemmas = s.mail.filter((m) => m.dilemma && m.dilemma.answer === null);
  if (r < 0.9 && dilemmas.length > 0) {
    const m = one(rand, dilemmas, dilemmas[0]);
    return {
      kind: 'AnswerDilemma',
      mail: m.id,
      option: Math.floor(rand() * (m.dilemma!.options.length + 1)),
    };
  }
  return { kind: 'MarkRead', mail: Math.floor(rand() * (s.mail.length + 2)) };
}

/** A race day sailed: the player's race begun, the three championships' stand-in results recorded. */
export function sailed(s: CareerState, player = 0.5): CareerState {
  let out = s.race?.started
    ? s
    : must(s, { kind: 'RaceStarted', round: s.race!.round });
  const cards = raceCards(out);
  for (const card of cards)
    out = must(out, { kind: 'RecordRace', result: standIn(card, player) });
  return out;
}

/** A state advanced to the next race day (answering nothing on the way: dilemmas lapse, offers stand). */
export function toRaceDay(s: CareerState): CareerState {
  let out = s;
  for (let i = 0; i < 200 && out.race === null; i++) {
    if (out.player?.sacked)
      out = must(out, { kind: 'TakeJob', team: out.player.offers[0].team });
    out = must(out, { kind: 'Advance' });
  }
  return out;
}

const BUILDINGS: readonly Building[] = [
  'factory',
  'drawingLoft',
  'testTank',
  'foundry',
  'sailingSchool',
  'pitHouse',
  'crowsNest',
  'fishMarket',
  'landingPad',
];

/** A command of sections 8–11 a player might send: the improvement, fitting, designing, building, suppliers, sponsors, votes. */
function worksCommand(s: CareerState, rand: () => number): Command {
  const team = s.player && !s.player.sacked ? s.teams[s.player.team] : null;
  const parts = team?.parts ?? [];
  const part = () =>
    one(
      rand,
      parts.map((p) => p.id),
      Math.floor(rand() * 2000)
    );
  const type = () => PARTS[Math.floor(rand() * PARTS.length)] ?? 'sails';
  const r = rand();
  if (r < 0.12) {
    const fitted = parts.filter((p) => p.ship !== null && rand() < 0.4);
    let left = 1;
    return {
      kind: 'SetImprovement',
      shares: fitted.map((p) => {
        const perf = Math.floor(rand() * left * 100) / 100;
        left -= perf;
        const reliability = Math.floor(rand() * left * 100) / 100;
        left -= reliability;
        return { part: p.id, perf, reliability };
      }),
    };
  }
  if (r < 0.24)
    return {
      kind: 'FitPart',
      part: part(),
      ship: rand() < 0.1 ? null : someShip(rand),
    };
  if (r < 0.38)
    return {
      kind: 'DealComponents',
      type: type(),
      slot: Math.floor(rand() * 4),
    };
  if (r < 0.5) {
    const t = team?.draft?.type ?? type();
    const cards = (team?.draft?.deals ?? []).map((d) =>
      one(rand, d.cards, 'x')
    );
    return {
      kind: 'StartDesign',
      type: t,
      components: cards,
      forNext: rand() < 0.2,
    };
  }
  if (r < 0.62)
    return {
      kind: 'Build',
      building: BUILDINGS[Math.floor(rand() * BUILDINGS.length)],
    };
  if (r < 0.72) {
    const trade = TRADES[Math.floor(rand() * TRADES.length)];
    const cards = team
      ? supplierCards(s.seed, team.id, s.season, trade).map((x) => x.id)
      : [];
    return {
      kind: 'ChooseSupplier',
      trade,
      supplier: one(rand, cards, 'nobody'),
    };
  }
  if (r < 0.84)
    return {
      kind: 'SignSponsor',
      offer: one(rand, team?.offers.map((o) => o.sponsor.id) ?? [], 0),
      slot: Math.floor(rand() * 4),
    };
  const proposals = team
    ? s.championships[team.tier].proposals.map((p) => p.id)
    : [];
  const side = (['for', 'against', 'abstain'] as const)[Math.floor(rand() * 3)];
  if (r < 0.92)
    return { kind: 'Vote', proposal: one(rand, proposals, 0), side };
  return {
    kind: 'Lobby',
    proposal: one(rand, proposals, 0),
    side: side === 'abstain' ? 'for' : side,
    balance: Math.floor(rand() * 400),
  };
}

/** No accepted command but Advance and the debug ones takes a team's balance past its chairman's floor: owed payments
 *  (wages, upkeep, fines) are made on Advance and may, but a spend never does. */
export function spendKept(
  before: CareerState,
  after: CareerState,
  c: Command
): void {
  // Advance and a race's close pay what is owed (wages, upkeep, fines, stand-ins' fees), past the floor if need be; on
  // TakeJob and DeclineJob the teams the player leaves or turns down have their chairmen hire a manager, as an chairman's
  // hire on Advance does
  if (
    ['Advance', 'RecordRace', 'TakeJob', 'DeclineJob'].includes(c.kind) ||
    c.kind.startsWith('Debug')
  )
    return;
  for (const x of after.teams) {
    const was = before.teams[x.id]?.balance ?? x.balance;
    if (x.balance < was)
      assert.ok(
        x.balance >= x.debtFloor,
        `${c.kind} took team ${x.id}'s balance to ${x.balance}, past its floor ${x.debtFloor}`
      );
  }
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

/** The rules every state holds to (Phase B acceptance's property tests): one person on at most one team, staff and
 *  contracts agreeing, the queue in order, no two living people sharing a full name, no banned or shared team words,
 *  each person's stats their role's. */
export function invariants(s: CareerState): void {
  const on = new Map<number, number>();
  for (const c of s.teams) {
    for (const id of staffOf(c)) {
      assert.ok(
        !on.has(id),
        `person ${id} is on teams ${on.get(id)} and ${c.id}`
      );
      on.set(id, c.id);
      assert.equal(
        s.people[id].contract?.team,
        c.id,
        `person ${id} is on team ${c.id}'s staff without its contract`
      );
    }
    assert.ok(
      c.staff.pit.length <= TUNING.world.pit,
      `team ${c.id} has ${c.staff.pit.length} pit crew members`
    );
    assert.equal(
      c.staff.ships.length,
      SHIPS.length,
      `team ${c.id} has ${c.staff.ships.length} ships`
    );
  }
  for (const g of s.people) {
    if (g.contract)
      assert.equal(
        on.get(g.id),
        g.contract.team,
        `person ${g.id} holds a contract with team ${g.contract.team} but is not on its staff`
      );
    assert.deepEqual(
      Object.keys(g.stats).sort(),
      [...ROLE_STATS[g.role]].sort(),
      `person ${g.id}'s stats are not a ${g.role}'s`
    );
    for (const v of Object.values(g.stats))
      assert.ok(v >= 0 && v <= 20, `person ${g.id} has a stat ${v}`);
    assert.ok(
      allowed(g.given) && allowed(g.family),
      `person ${g.id} has a banned name`
    );
  }
  const living = s.people.filter((g) => g.retired === null).map(fullName);
  assert.equal(
    new Set(living).size,
    living.length,
    'two living people share a full name'
  );
  const seen = new Set<string>();
  for (const c of s.teams)
    for (const w of words(c.name)) {
      assert.ok(!seen.has(w), `the word '${w}' is in two teams' names`);
      seen.add(w);
    }
  assert.ok(ordered(s.queue), 'the queue is out of order');
  market(s);
  works(s);
  raceDay(s);
}

/** Race day's and the mail's rules (sections 12, 13): on race day every ship has someone to sail her (the player's ship
 *  one the player), no person sails two ships, none sails unfit; every message has its words; a dilemma's answer is one
 *  of its options; the standings name each tier's teams once. */
function raceDay(s: CareerState): void {
  if (s.race !== null) {
    const aboard = new Set<number>();
    for (const x of lineups(s)) {
      x.ships.forEach((a, ship) => {
        const theirs = s.teams[x.team].player && ship === 0;
        assert.ok(
          theirs ? a.driver === null : a.driver !== null && !a.forfeit,
          `team ${x.team}'s ship ${ship} has no one to sail her`
        );
        if (a.driver === null) return;
        assert.ok(!aboard.has(a.driver), `person ${a.driver} sails two ships`);
        aboard.add(a.driver);
        assert.equal(
          s.people[a.driver].unfit,
          0,
          `person ${a.driver} sails unfit`
        );
      });
    }
  }
  for (const m of s.mail) {
    assert.ok(
      TEMPLATES[m.kind],
      `mail ${m.id} of kind '${m.kind}' has no template`
    );
    if (m.dilemma && m.dilemma.answer !== null)
      assert.ok(
        m.dilemma.answer >= 0 && m.dilemma.answer < m.dilemma.options.length,
        `dilemma ${m.id}'s answer`
      );
  }
  for (const l of s.championships) {
    assert.deepEqual(
      l.standings.map((x) => x.team).sort((a, b) => a - b),
      [...l.teams].sort((a, b) => a - b),
      `tier ${l.id}'s standings`
    );
    for (const id of l.teams)
      assert.equal(
        s.teams[id].tier,
        l.id,
        `team ${id} is listed in tier ${l.id}`
      );
  }
}

/** The parts' and money's rules (sections 8–11): each part on at most one ship and each ship one of each type; spec
 *  parts never improved past the standard; a team's sponsors in three slots. */
function works(s: CareerState): void {
  const ids = new Set<number>();
  for (const c of s.teams) {
    for (const ship of SHIPS) {
      const types = c.parts
        .filter((p) => p.ship === ship)
        .map((p) => p.type)
        .sort();
      assert.deepEqual(
        types,
        [...PARTS].sort(),
        `team ${c.id}'s ship ${ship} carries ${types.join(', ')}`
      );
    }
    for (const p of c.parts) {
      assert.ok(!ids.has(p.id), `part ${p.id} is held twice`);
      ids.add(p.id);
      assert.ok(
        p.ship === null || SHIPS.includes(p.ship),
        `part ${p.id} is fitted to ship ${p.ship}`
      );
      assert.ok(
        p.condition >= 0 && p.condition <= 1,
        `part ${p.id} has condition ${p.condition}`
      );
      assert.ok(
        p.perf <= p.perfMax && p.reliability <= p.reliabilityMax + 1e-9,
        `part ${p.id} is past its ceiling`
      );
      if (p.spec) {
        const st = TUNING.parts.standard;
        assert.ok(
          p.perf <= st.perf && p.reliability <= st.reliability,
          `spec part ${p.id} was improved to ${p.perf}/${p.reliability}`
        );
      }
    }
    assert.equal(
      c.sponsors.length,
      TUNING.sponsors.slots,
      `team ${c.id} has ${c.sponsors.length} sponsor slots`
    );
  }
}

/** The market's rules (sections 4, 5, 7): talks and patience consistent, scouts at work on their own team's staff,
 *  the player's post and offers as the player's state says. */
function market(s: CareerState): void {
  const pairs = new Set<string>();
  for (const t of s.talks) {
    const key = `${t.team}:${t.person}`;
    assert.ok(
      !pairs.has(key),
      `team ${t.team} holds two talks with person ${t.person}`
    );
    pairs.add(key);
    const g = s.people[t.person];
    assert.ok(
      g && g.retired === null && !g.player,
      `talk ${t.id} is with person ${t.person}, who cannot be signed`
    );
    assert.equal(
      t.offer.role,
      g.role,
      `talk ${t.id} offers a ${t.offer.role} post to a ${g.role}`
    );
    const kind = t.counter === null ? 'answer' : 'lapse';
    assert.ok(
      s.queue.some((e) => e.kind === kind && e.talk === t.id),
      `talk ${t.id} has no ${kind} on the queue`
    );
    assert.ok(
      t.counter !== null || t.answer >= s.day,
      `talk ${t.id} was due on day ${t.answer}`
    );
  }
  for (const g of s.people) {
    assert.ok(
      g.patience >= 1 && g.patience <= TUNING.market.patienceMost,
      `person ${g.id} has patience ${g.patience}`
    );
    if (g.retired !== null)
      assert.ok(
        g.contract === null || g.role === 'manager' || g.role === 'chairman',
        `retired person ${g.id} holds a contract`
      );
  }
  const busy = new Set<number>();
  for (const x of s.scouting) {
    assert.ok(!busy.has(x.scout), `scout ${x.scout} is on two jobs`);
    busy.add(x.scout);
    assert.ok(
      s.teams[x.team].staff.scouts.includes(x.scout),
      `scout ${x.scout} works for team ${x.team} but is not on its staff`
    );
    assert.ok(
      s.queue.some(
        (e) => e.kind === 'report' && e.team === x.team && e.scout === x.scout
      ),
      `scout ${x.scout}'s report is not on the queue`
    );
  }
  for (const c of s.teams)
    assert.ok(
      c.staff.scouts.length <= c.buildings.crowsNest.level,
      `team ${c.id} has more scouts than its crow's nest has places`
    );
  const p = s.player;
  if (!p) return;
  const teamsOfPlayer = s.teams.filter((c) => c.player);
  if (p.sacked) {
    assert.equal(teamsOfPlayer.length, 0, 'a sacked player has no team');
    assert.equal(s.people[p.person].contract, null);
    assert.ok(
      p.offers.length > 0,
      'a sacked player is shown at least one offer'
    );
    assert.ok(
      p.offers.some((o) => s.teams[o.team].tier === s.championships.length - 1),
      'a sacked player is offered a post in Tier 3'
    );
  } else {
    assert.deepEqual(
      teamsOfPlayer.map((c) => c.id),
      [p.team],
      "the player's team is the one team marked theirs"
    );
    assert.equal(s.teams[p.team].staff.manager, p.person);
    assert.equal(
      s.teams[p.team].staff.ships[0].driver,
      null,
      'the player sails ship one'
    );
  }
  for (const o of p.offers)
    assert.ok(
      !s.teams[o.team].player,
      "the player is offered their own team's post"
    );
}
