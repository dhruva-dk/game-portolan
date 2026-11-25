import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/career/apply.ts';
import { fieldsValid } from '../src/career/fields.ts';
import { createMatch, debugOf } from '../src/sim/engine.ts';
import { STEP } from '../src/sim/fixed.ts';
import { STILL } from '../src/sim/hands.ts';
import { sealed, type MatchResult } from '../src/sim/result.ts';
import { rulesOf } from '../src/sim/rules.ts';
import type { MatchSetup } from '../src/sim/setup.ts';
import { calm, closings } from '../src/sim/storm.ts';
import { MATCH_END } from '../src/sim/tuning.ts';
import { startCareer } from '../tools/sim/career.ts';
import { KINDS } from '../src/sim/kinds.ts';
import { EVEN_SHIP, setupOf, valuesAt } from './setups.ts';
import { OPEN, sail, waters } from './small.ts';
import { loosed } from '../src/sim/shot.ts';
import { R, along, bearingAt, scale } from '../src/world/sphere.ts';

interface Watched {
  setup: MatchSetup;
  result: MatchResult;
  closed: readonly number[];
  sampled: (readonly number[])[];
  storms: { id: number; credit: number | null }[];
  teamShare: number[];
  alive: readonly number[];
  seconds: number;
}

function watched(setup: MatchSetup): Watched {
  const m = createMatch(setup, waters),
    view = m.view,
    closed = closings(rulesOf(setup.storm).storm);
  const sampled: (readonly number[])[] = [],
    hit = new Map<number, { by: number; time: number }>(),
    storms: Watched['storms'] = [];
  let read = 0;
  while (!m.done) {
    m.step(STILL);
    const now = view.time();
    for (const h of view.happened()?.fought.hits ?? [])
      hit.set(h.struck, { by: h.shooter, time: now });
    const sunk = view.sinkings();
    for (; read < sunk.length; read++) {
      const k = sunk[read],
        h = hit.get(k.id);
      if (k.cause === 'storm')
        storms.push({
          id: k.id,
          credit: h && k.time - h.time + STEP < MATCH_END.credit ? h.by : null,
        });
    }
    while (sampled.length < closed.length && now >= closed[sampled.length])
      sampled.push([...view.alive()]);
  }
  return {
    setup,
    result: m.result(),
    closed,
    sampled,
    storms,
    teamShare: setup.ships.map((_, id) => view.teamShare(id)),
    alive: [...view.alive()],
    seconds: view.time(),
  };
}

function sound(w: Watched) {
  const { setup, result: r, closed } = w,
    n = setup.ships.length,
    team = (id: number) => setup.ships[id].team,
    teams = Math.max(...setup.ships.map((s) => s.team)) + 1,
    ids = setup.ships.map((_, id) => id);
  assert.deepEqual(
    r.ships.map((s) => s.place).sort((a, b) => a - b),
    ids.map((id) => id + 1),
    'the places are 1 to N'
  );
  const order = [...ids].sort((a, b) => r.ships[a].place - r.ships[b].place),
    afloat = (id: number) => r.ships[id].sunkAt === null;
  assert.deepEqual(
    ids.filter(afloat).sort((a, b) => a - b),
    [...w.alive].sort((a, b) => a - b),
    'afloat in the result as at sea'
  );
  for (let i = 1; i < n; i++) {
    const a = order[i - 1],
      b = order[i],
      [x, y] = [r.ships[a], r.ships[b]];
    if (afloat(a) && afloat(b)) {
      const ahead =
        x.sinkings > y.sinkings ||
        (x.sinkings === y.sinkings &&
          (w.teamShare[a] > w.teamShare[b] ||
            (w.teamShare[a] === w.teamShare[b] && a < b)));
      assert.ok(ahead, `${a} ahead of ${b}`);
    } else if (!afloat(a) && !afloat(b))
      assert.ok(x.sunkAt! >= y.sunkAt!, `${a} sank after ${b}`);
    else assert.ok(afloat(a), `the afloat ahead of the sunk: ${a}, ${b}`);
  }
  for (const id of ids) {
    const s = r.ships[id];
    assert.equal(
      s.sinkings,
      r.ships.filter((k) => k.sunkBy === id).length,
      `ship ${id}'s sinkings are those credited to it`
    );
    if (s.sunkBy !== null) {
      assert.notEqual(s.sunkBy, id);
      assert.notEqual(team(s.sunkBy), team(id), 'never by a mate');
    }
    if (s.sunkAt !== null) assert.ok(s.sunkAt >= 0 && s.sunkAt <= r.seconds);
    assert.ok(
      s.shotsLanded <= s.shotsFired,
      `ship ${id} (${setup.ships[id].gun}) landed ${s.shotsLanded} of ${s.shotsFired}`
    );
  }
  for (const k of w.storms)
    assert.equal(
      r.ships[k.id].sunkBy,
      k.credit,
      `ship ${k.id}: the storm's sinking goes to its last hitter within ${MATCH_END.credit} s, or to nobody`
    );
  assert.ok(Math.abs(r.seconds - w.seconds) < 1e-9, 'seconds sailed');
  if (new Set(w.alive.map(team)).size > 1)
    assert.ok(
      r.seconds >= closed.at(-1)! + MATCH_END.overtime - 1e-9 &&
        r.seconds < closed.at(-1)! + MATCH_END.overtime + STEP + 1e-9,
      'called on its overtime'
    );
  assert.equal(r.sea.length, teams, 'one row of samples a team');
  for (let t = 0; t < teams; t++) {
    assert.equal(r.sea[t].length, closed.length, 'seven samples');
    for (const x of r.sea[t]) assert.ok(x >= 0 && x <= 1, `${x}`);
  }
  for (let k = 0; k < closed.length; k++) {
    const sum = r.sea.reduce((a, t) => a + t[k], 0);
    assert.ok(sum <= 1 + 1e-9, `sample ${k} adds to ${sum}`);
    const at = k < w.sampled.length ? w.sampled[k] : w.alive;
    for (let t = 0; t < teams; t++)
      if (!at.some((id) => team(id) === t))
        assert.equal(r.sea[t][k], 0, `team ${t}, none afloat, at sample ${k}`);
  }
  for (let t = 0; t < teams; t++) {
    const missing = r.sea[t].slice(w.sampled.length);
    assert.ok(
      missing.every((x) => x === missing[0]),
      'every missing sample the share at the end'
    );
  }
  assert.ok(
    r.sea.some((t) => t.some((x) => x > 0)),
    'some team held sea'
  );
  const fourth =
    w.sampled.length >= MATCH_END.afloatAt
      ? w.sampled[MATCH_END.afloatAt - 1]
      : w.alive;
  for (const id of ids)
    assert.equal(
      r.ships[id].afloatAtPhaseFour,
      fourth.includes(id),
      `ship ${id} afloat at phase four`
    );
}

const SMALL: MatchSetup[] = [
  setupOf(21, { teams: 4 }),
  setupOf(22, { teams: 8, perTeam: 1 }),
  setupOf(23, { teams: 2, perTeam: 1, storm: 5 }),
  setupOf(24, { teams: 3, storm: 1 }),
  setupOf(25, {
    teams: 5,
    values: (ship) => valuesAt(50, KINDS[Math.floor(ship / 2) % KINDS.length]),
  }),
];

const WATCHED = SMALL.map(watched);

test('the result of small matches: places in their order, the samples, afloat at phase four, credit for the storm, seconds', () => {
  for (const w of WATCHED) sound(w);
  const storms = WATCHED.flatMap((w) => w.storms);
  console.log(
    `# ${storms.length} storm sinkings, ${storms.filter((k) => k.credit !== null).length} credited; ${WATCHED.filter((w) => w.sampled.length >= MATCH_END.afloatAt).length} of ${WATCHED.length} matches to phase four`
  );
});

test('the same setup gives the same result and hash; any field of the result changes the hash', () => {
  const first = WATCHED[2].result;
  assert.deepEqual(watched(SMALL[2]).result, first);
  assert.notEqual(WATCHED[0].result.hash, first.hash);
  const rest = { seconds: first.seconds, ships: first.ships, sea: first.sea },
    base = sealed(rest, []).hash;
  assert.equal(sealed(rest, []).hash, base);
  assert.notEqual(sealed(rest, [1]).hash, base, 'the state');
  assert.notEqual(
    sealed({ ...rest, seconds: rest.seconds + 1 }, []).hash,
    base
  );
  const ship = rest.ships[1];
  const changed: Partial<typeof ship>[] = [
    { place: ship.place + 1 },
    { sunkAt: (ship.sunkAt ?? 0) + 1 },
    { sunkBy: ship.sunkBy === 0 ? 2 : 0 },
    { sinkings: ship.sinkings + 1 },
    { shotsFired: ship.shotsFired + 1 },
    { shotsLanded: ship.shotsLanded + 1 },
    { damageDealt: ship.damageDealt + 1 },
    { damageTaken: ship.damageTaken + 1 },
    { afloatAtPhaseFour: !ship.afloatAtPhaseFour },
  ];
  for (const c of changed) {
    const ships = rest.ships.map((s, id) => (id === 1 ? { ...s, ...c } : s));
    assert.notEqual(
      sealed({ ...rest, ships }, []).hash,
      base,
      Object.keys(c).join()
    );
  }
  const sea = rest.sea.map((t, i) => (i === 1 ? [...t.slice(0, 6), 0.5] : t));
  assert.notEqual(sealed({ ...rest, sea }, []).hash, base, 'a sample');
});

test('places, arranged: sinkings first, then the team’s sea, then the ship id; the sunk last sunk first', () => {
  const m = sail(createMatch(setupOf(31, { teams: 4 }), waters), 3),
    debug = debugOf(m);
  debug.sink(7, 2);
  debug.sink(6, null);
  const r = m.result(),
    place = (id: number) => r.ships[id].place,
    share = (id: number) => m.view.teamShare(id);
  assert.equal(place(2), 1, 'the ship with a sinking first');
  assert.deepEqual([place(6), place(7)], [7, 8], 'the last sunk ahead');
  assert.ok(share(0) === share(1) && share(4) === share(5));
  assert.ok(place(0) < place(1) && place(4) < place(5), 'mates by id');
  const rest = [0, 1, 3, 4, 5].sort((a, b) => share(b) - share(a) || a - b);
  assert.ok(new Set([share(0), share(3), share(4)]).size > 1);
  assert.deepEqual(
    rest.map(place),
    [2, 3, 4, 5, 6],
    'then by their team’s sea, then by id'
  );
  assert.equal(r.ships[2].sinkings, 1);
  assert.equal(r.ships[7].sunkBy, 2);
  assert.equal(r.ships[6].sunkBy, null);
});

test('two ships hit a third in one step: the sinking goes to the ship and gun whose hit took its hull to 0', () => {
  const setup = setupOf(33, {
      teams: 3,
      perTeam: 1,
      values: (ship) => valuesAt(50, ship === 1 ? 'scatter' : 'cannon'),
    }),
    m = createMatch(setup, waters),
    debug = debugOf(m),
    [V, A, B] = [0, 1, 2];
  debug.rig({ storm: () => calm(OPEN) });
  debug.atSea(
    { at: OPEN, bearing: 0 },
    [80, -80].map((x) => {
      const at = along(OPEN, bearingAt(OPEN, Math.PI / 2), x).p;
      return { at, heading: bearingAt(at, 0), lashed: null };
    })
  );
  const hull = setup.ships[V].hullPoints;
  debug.hurt(V, hull - 25);
  const on = m.view.vessel(V)!.ship.at,
    falling = (shooter: number, round: number) =>
      loosed(
        shooter,
        setup.ships[shooter].gun,
        scale(on, R + 3),
        scale(on, -1),
        90,
        10,
        on,
        round
      );
  debug.volley([falling(A, 0), falling(B, 0), falling(A, 0)]);
  m.step(STILL);
  assert.deepEqual(
    m.view.last().strikes.map((s) => [s.shooter, s.hull]),
    [
      [A, 15],
      [B, 10],
    ],
    "A's pellet, B's ball, A's second pellet"
  );
  const r = m.result(),
    k = m.view.sinking(V);
  assert.equal(r.ships[V].sunkBy, A, 'A struck last');
  assert.equal(k?.cause, 'shot');
  assert.equal(k?.gun, 'scatter', "with A's gun");
  assert.equal(r.ships[A].sinkings, 1);
  assert.equal(r.ships[B].sinkings, 0);
});

test('a match always ends: where nobody can sink anybody, 180 s after the last phase closes', () => {
  const setup = setupOf(41, {
      teams: 2,
      perTeam: 1,
      storm: 5,
      values: { ...EVEN_SHIP, hullPoints: 1e9 },
    }),
    m = createMatch(setup, waters);
  debugOf(m).rig({ storm: () => calm(OPEN) });
  const closed = closings(rulesOf(setup.storm).storm),
    end = closed.at(-1)! + MATCH_END.overtime;
  while (!m.done && m.view.time() < end + 1) m.step(STILL);
  assert.ok(m.done, 'it ended');
  const r = m.result();
  assert.ok(r.seconds >= end - 1e-9 && r.seconds < end + STEP + 1e-9);
  assert.ok(r.ships.every((s) => s.sunkAt === null));
  assert.ok(r.ships.every((s) => s.afloatAtPhaseFour));
  assert.ok(r.sea.every((t) => t.length === closed.length));
});

test('a full race of 80 ships: its result is sound, and passes RecordRace’s check', () => {
  const w = watched(setupOf(51));
  sound(w);
  const racing = apply(startCareer('result'), { type: 'StartRace', team: 0 });
  assert.ok(racing.ok);
  const command = { type: 'RecordRace', team: 0, result: w.result } as const;
  assert.ok(fieldsValid(racing.state, command));
  assert.equal(apply(racing.state, command).ok, true);
  console.log(
    `# ${w.result.seconds.toFixed(1)} s, ${w.storms.length} storm sinkings (${w.storms.filter((k) => k.credit !== null).length} credited), ${w.sampled.length} samples taken`
  );
});
