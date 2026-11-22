// The pit stop (sim/pit.ts, MANAGER.md 3 point 7): its rule, a bot's own stops
// (sim/pitting.ts), and the pit in a race sailed by a card (play/state.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/environment.ts';
import type { Job, Zones } from '../src/kinds.ts';
import { fitted } from '../src/play/fitted.ts';
import { raceOf, runRace, specField } from '../src/play/race.ts';
import { createState } from '../src/play/state.ts';
import type { RaceCard } from '../src/race.ts';
import { crewOf, type Crew } from '../src/sim/battle.ts';
import { mind, think } from '../src/sim/bot.ts';
import { DEFAULT_BRAIN } from '../src/sim/brain.ts';
import type { Ctx, Seen } from '../src/sim/captain.ts';
import { UNWORN } from '../src/sim/faults.ts';
import { STEP } from '../src/sim/fixed.ts';
import { GUST } from '../src/sim/handling.ts';
import { nature } from '../src/sim/persona.ts';
import { PIT, pitted } from '../src/sim/pit.ts';
import { PITTING, pitAct, pitAsk, pitUrge } from '../src/sim/pitting.ts';
import { chart } from '../src/sim/route.ts';
import { shipAt, step } from '../src/sim/ship.ts';
import { berthing } from '../src/sim/spawn.ts';
import { NOTHING, type Ask } from '../src/sim/stores.ts';
import { temper } from '../src/sim/temper.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import {
  R,
  along,
  dot,
  frameAt,
  fromLatLon,
  type Vec3,
} from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

// ------------------------------------------------------------------ the rule

/** Her crew at `hull`, her zones' tallies `zones`, her gust spent, no stores. */
const hurt = (hull: number, zones: Zones<number>, id = 1): Crew => {
  const c = crewOf(id);
  return {
    ...c,
    health: { hull, shield: 0 },
    wear: { ...UNWORN, zones },
    gust: { ...c.gust, charges: 0 },
  };
};
const asking = (id: number, pit: readonly Job[]) =>
  new Map<number, Ask>([[id, { ...NOTHING, pit }]]);
const NONE = new Map<number, Ask>();

/**
 * Her crew served `seconds` from the stop she asks at the first step: by a pit
 * crew of `pace` and `slip`, in team water till `leaves` s. The crew after, the
 * stops told, and the second each of her jobs was done by.
 */
function served(
  c: Crew,
  jobs: readonly Job[],
  seconds: number,
  { pace = 1, slip = 0, leaves = Infinity, seed = 5 } = {}
) {
  const stops: ReturnType<typeof pitted>['stops'] = [],
    done: number[] = [];
  let crew = c;
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) {
    const r = pitted(
      [crew],
      tick === 0 ? asking(c.id, jobs) : NONE,
      () => tick * STEP < leaves,
      { seed, tick, crew: () => ({ pace, slip }) },
      STEP
    );
    const was = crew.pit?.done ?? 0;
    crew = r.crews[0];
    if ((crew.pit?.done ?? was) > was || (r.stops[0]?.jobs ?? was) > was)
      done.push((tick + 1) * STEP);
    stops.push(...r.stops);
  }
  return { crew, stops, done };
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const kits = (c: Crew) =>
  c.hold.items.reduce((n, s) => n + (s?.kind === 'repairKit' ? s.count : 0), 0);

test('a stop does its jobs in the order asked, each in its time: a zone repaired (its tally cleared, the hull it took given back), her gust taken on, a kit taken on', () => {
  const c = hurt(40, [20, 0, 30, 0]),
    r = served(c, ['waterline', 'gust', 'kit'], 20);
  assert.ok(near(r.done[0], PIT.zone));
  assert.ok(near(r.done[1], PIT.zone + PIT.gust));
  assert.ok(near(r.done[2], PIT.zone + PIT.gust + PIT.kit));
  assert.deepEqual(r.crew.wear.zones, [20, 0, 0, 0]);
  assert.equal(r.crew.health.hull, 70);
  assert.equal(r.crew.gust.charges, GUST.charges);
  assert.equal(kits(r.crew), 1);
  assert.equal(r.crew.pit, undefined, 'the stop is over');
  assert.equal(r.stops.length, 1);
  assert.equal(r.stops[0].id, 1);
  assert.ok(near(r.stops[0].seconds, 14));
  assert.deepEqual([r.stops[0].jobs, r.stops[0].slips], [3, 0]);
  // part way, the job in hand is not done
  const part = served(c, ['waterline', 'gust', 'kit'], 5);
  assert.equal(part.crew.health.hull, 40);
  assert.deepEqual(part.crew.wear.zones, [20, 0, 30, 0]);
  assert.deepEqual(
    [part.crew.pit?.at, part.crew.pit?.done, part.stops.length],
    [0, 0, 0]
  );
  assert.ok(near(part.crew.pit?.left ?? 0, 1));
});

test("her crew's pace times every job; the hull given back never passes her most", () => {
  const c = hurt(40, [20, 0, 30, 0]),
    jobs: Job[] = ['waterline', 'rigging'];
  assert.ok(near(served(c, jobs, 40, { pace: 0.5 }).stops[0].seconds, 6));
  assert.ok(near(served(c, jobs, 40).stops[0].seconds, 12));
  assert.ok(near(served(c, jobs, 40, { pace: 2 }).stops[0].seconds, 24));
  assert.equal(served(c, jobs, 40, { pace: 2 }).crew.health.hull, 90);
  const full = served(hurt(60, [0, 0, 80, 0]), ['waterline'], 10);
  assert.equal(full.crew.health.hull, 100);
  // a stouter hull's most is her own (play/fitted.ts)
  const ship = specField(5, 1).ships[1],
    parts = { ...ship.parts, hull: { ...ship.parts.hull, performance: 1.2 } },
    stout = fitted(crewOf(1), { ...ship, parts }),
    blown: Crew = {
      ...stout,
      health: { ...stout.health, hull: 60 },
      wear: { ...UNWORN, zones: [0, 0, 80, 0] },
    };
  assert.equal(served(blown, ['waterline'], 10).crew.health.hull, 120);
});

test('a slip adds its delay to the job and harms nothing; the draw is seeded', () => {
  const c = hurt(40, [20, 0, 30, 0]),
    jobs: Job[] = ['waterline', 'gust', 'kit'];
  const clean = served(c, jobs, 30),
    slipped = served(c, jobs, 30, { slip: 1 });
  assert.ok(near(slipped.stops[0].seconds, 14 + 3 * PIT.slip));
  assert.deepEqual([slipped.stops[0].jobs, slipped.stops[0].slips], [3, 3]);
  assert.deepEqual(slipped.crew, clean.crew, 'the same ship after');
  // by her crew's chance, over many stops; the same stop slips the same
  let slips = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = served(c, ['waterline'], 10, { slip: 0.3, seed });
    assert.deepEqual(served(c, ['waterline'], 10, { slip: 0.3, seed }), a);
    slips += a.stops[0].slips;
    assert.ok(near(a.stops[0].seconds, PIT.zone + a.stops[0].slips * PIT.slip));
  }
  assert.ok(slips > 40 && slips < 80, `${slips} of 200`);
});

test('a job with nothing to do is passed over, taking no time; a stop of nothing to do is none', () => {
  const c = { ...hurt(40, [0, 0, 30, 0]), gust: crewOf(1).gust };
  const r = served(c, ['rudder', 'gust', 'waterline'], 10);
  assert.ok(near(r.stops[0].seconds, PIT.zone));
  assert.equal(r.stops[0].jobs, 1);
  assert.equal(r.crew.health.hull, 70);
  const none = served(c, ['rudder', 'gust'], 10);
  assert.deepEqual(none.stops, []);
  assert.deepEqual(none.crew, c);
});

test('the work runs while she stays in team water: leaving ends it, what is done kept; out of it no stop begins; a stop of no jobs asked ends the one she is at', () => {
  const c = hurt(40, [20, 0, 30, 0]),
    jobs: Job[] = ['waterline', 'rigging', 'kit'];
  const left = served(c, jobs, 30, { leaves: 8 });
  assert.equal(left.stops.length, 1);
  assert.ok(near(left.stops[0].seconds, 8));
  assert.equal(left.stops[0].jobs, 1);
  assert.equal(left.crew.health.hull, 70, 'the waterline done is kept');
  assert.deepEqual(left.crew.wear.zones, [20, 0, 0, 0]);
  assert.equal(left.crew.pit, undefined);
  assert.equal(kits(left.crew), 0);
  const out = served(c, jobs, 30, { leaves: 0 });
  assert.deepEqual(out.stops, []);
  assert.deepEqual(out.crew, c);
  // called off by her own ask, 4 s in
  let crew = c;
  const told = [];
  for (let tick = 0; tick < 300; tick++) {
    const asks =
      tick === 0 ? asking(1, jobs) : tick === 120 ? asking(1, []) : NONE;
    const r = pitted(
      [crew],
      asks,
      () => true,
      { seed: 5, tick, crew: () => ({ pace: 1, slip: 0 }) },
      STEP
    );
    crew = r.crews[0];
    told.push(...r.stops);
  }
  assert.equal(told.length, 1);
  assert.ok(near(told[0].seconds, 4));
  assert.equal(told[0].jobs, 0);
  assert.deepEqual(crew, c);
  // a ship asking nothing is left as she is
  const idle = pitted(
    [c],
    NONE,
    () => true,
    { seed: 5, tick: 0, crew: () => ({ pace: 1, slip: 0 }) },
    STEP
  );
  assert.equal(idle.crews[0], c);
});

// ------------------------------------------------------------------ a bot's stops

const centre = fromLatLon(0.2, 0.3),
  east = frameAt(centre).east;
/** Her team's (team 0's) water: the sea more than `from` m east of the centre. */
const holdings = (from: number) => ({
  ownerAt: () => -1,
  teamAt: (p: Vec3) => (dot(p, east) * R > from ? 0 : -1),
});
/**
 * A think of her crew `c`: of team `team` (none: a match with no teams), a foe
 * `foeD` m to her north (or none), her team's water `water` m east of her.
 */
const ctx = (
  c: Crew,
  { team = 0 as number | null, foeD = Infinity, water = 100, speed = 0 } = {}
): Ctx => {
  const ship = { ...shipAt(centre, east), speed },
    own: Seen = {
      id: 1,
      ship,
      hull: c.health.hull,
      crew: c,
      ...(team !== null && { team }),
    },
    foe: Seen | null = Number.isFinite(foeD)
      ? {
          id: 2,
          ship: shipAt(along(centre, frameAt(centre).north, foeD).p, east),
        }
      : null;
  return {
    own,
    others: foe ? [foe] : [],
    sea: { depth: () => 30, holdings: holdings(water) },
    m: mind(1, centre),
    b: DEFAULT_BRAIN,
    t: temper(1),
    foe,
    foeD,
    seed: 1,
  };
};

test('a bot hurt, with a zone worth repairing, her team’s water near and no foe close, wants the pit, and makes for that water; a match with no teams has no pit', () => {
  const c = hurt(40, [0, 12, 30, 0]);
  const urge = pitUrge(ctx(c));
  assert.ok(urge > 0.5, `${urge}`);
  assert.equal(pitUrge(ctx(c, { team: null })), 0, 'no teams, no pit');
  const to = pitAct(ctx(c));
  assert.equal(holdings(100).teamAt(to), 0, 'the goal is team water');
  // well in it, she stays where she is; at its edge, she makes further in
  const there = ctx(c, { water: -100 });
  assert.equal(pitAct(there), there.own.ship.at);
  const edge = ctx(c, { water: -10 });
  assert.ok(dot(pitAct(edge), east) * R > -10 + PITTING.room - 1e-6);
  // none within reach; a foe close; no zone worth a job; her hull whole enough
  assert.equal(pitUrge(ctx(c, { water: PITTING.reach + 50 })), 0);
  assert.equal(pitUrge(ctx(c, { foeD: PITTING.close - 5 })), 0);
  assert.equal(pitUrge(ctx(hurt(40, [0, 3, 5, 0]))), 0);
  assert.equal(pitUrge(ctx(hurt(70, [0, 12, 18, 0]))), 0);
  // the more hurt, the more; a major fault, wholly
  assert.ok(pitUrge(ctx(hurt(50, [0, 12, 30, 0]))) < urge);
  assert.equal(pitUrge(ctx(hurt(20, [0, 12, 30, 0]))), 1);
  // served, she stays while no foe presses her
  const pit = { jobs: [], at: 0, left: 1, done: 0, slips: 0, spent: 1 };
  assert.equal(pitUrge(ctx({ ...hurt(90, [0, 0, 0, 0]), pit })), 1);
  assert.equal(pitUrge(ctx({ ...c, pit }, { foeD: PITTING.close - 5 })), 0);
});

test('her stop is her own: the zones worth it, the most-hit first, a kit if she has none, her gust if it is spent; asked once she lies slow in team water, making for the pit', () => {
  const c = hurt(40, [0, 12, 30, 3]),
    at = (over: Parameters<typeof ctx>[1]) => {
      const x = ctx(c, { water: -10, ...over });
      x.m.mode = 'pit';
      return x;
    };
  assert.deepEqual(pitAsk(at({}), NOTHING), {
    ...NOTHING,
    pit: ['waterline', 'rudder', 'kit', 'gust'],
  });
  // her gust in hand and a kit aboard: the zones alone
  const stocked: Crew = {
    ...c,
    gust: crewOf(1).gust,
    hold: { ...c.hold, items: [{ kind: 'repairKit', count: 1 }, null, null] },
  };
  const x = ctx(stocked, { water: -10 });
  x.m.mode = 'pit';
  assert.deepEqual(pitAsk(x, NOTHING).pit, ['waterline', 'rudder']);
  // not yet: still making way, out of team water, about something else, served
  assert.equal(pitAsk(at({ speed: PITTING.slow + 1 }), NOTHING), NOTHING);
  assert.equal(pitAsk(at({ water: 50 }), NOTHING), NOTHING);
  assert.equal(pitAsk(ctx(c, { water: -10 }), NOTHING), NOTHING);
  const pit = { jobs: [], at: 0, left: 1, done: 0, slips: 0, spent: 1 };
  const busy = ctx({ ...c, pit }, { water: -10 });
  busy.m.mode = 'pit';
  assert.equal(pitAsk(busy, NOTHING), NOTHING);
});

test('a hurt bot sails to her team’s water, asks her stop there, and stays till it is done', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const who = nature(seed),
      sea = { depth: () => 30, holdings: holdings(80) };
    let crew = hurt(35, [0, 12, 30, 0]),
      ship = shipAt(centre, frameAt(centre).north),
      m = mind(seed, centre),
      asked = -1;
    const stops = [];
    for (let tick = 0; tick < 60 / STEP && stops.length === 0; tick++) {
      const own: Seen = { id: 1, ship, hull: crew.health.hull, crew, team: 0 },
        r = think(own, [], sea, m, who);
      m = r.memory;
      if (r.ask.pit && asked < 0) asked = tick * STEP;
      ship = step(ship, r.helm, STEP, sea.depth);
      const p = pitted(
        [crew],
        new Map([[1, r.ask]]),
        () => sea.holdings.teamAt(ship.at) === 0,
        { seed, tick, crew: () => ({ pace: 1, slip: 0 }) },
        STEP
      );
      crew = p.crews[0];
      stops.push(...p.stops);
    }
    assert.ok(asked >= 0 && asked < 40, `${seed}: asked at ${asked}`);
    assert.equal(stops.length, 1, `${seed}: one stop`);
    assert.equal(stops[0].jobs, 4, `${seed}: waterline, rudder, kit, gust`);
    assert.equal(crew.gust.charges, GUST.charges);
    assert.deepEqual(crew.wear.zones, [0, 0, 0, 0]);
    assert.equal(crew.health.hull, 77);
    assert.equal(kits(crew), 1);
  }
});

// ------------------------------------------------------------------ the race

const planet = planetOf(SEED, landOf(SEED)),
  depth = (p: Vec3) => -planet.height(p),
  waters = { chart: chart(depth), water: berthing(depth) };
const IDLE = {
  helm: { course: null, throttle: 0 },
  gun: { aim: null, fire: false },
};

test('in a race sailed by a card the bots pit by the same rule, each stop in the result; and the water mends no one', () => {
  const base = specField(SEED, 3),
    card: RaceCard = { ...base, rules: { ...base.rules, storm: 1.5 } };
  const match = raceOf(card, planet),
    state = createState(planet, flat, waters, match);
  state.start(match);
  const pitting = new Set<number>();
  let mended = 0;
  for (;;) {
    state.advance(IDLE.helm, IDLE.gun);
    for (const id of state.alive()) {
      const c = state.crew(id);
      if (c.pit) pitting.add(id);
      if (c.wear.mending) mended++;
    }
    if (state.result()) break;
  }
  const r = state.result();
  assert.ok(r);
  assert.equal(mended, 0, 'no ship mended by her water');
  assert.ok(r.pits.length > 0, 'bots pitted');
  assert.ok(r.pits.some((p) => p.jobs > 0));
  for (const p of r.pits) {
    assert.ok(pitting.has(p.id));
    assert.ok(p.second >= 0 && p.second + p.seconds <= r.seconds + 1e-6);
    assert.ok(p.jobs >= 0 && p.slips >= 0 && p.seconds > 0);
    assert.ok(
      p.seconds >= p.jobs * PIT.gust + p.slips * PIT.slip - 1e-6,
      'no job quicker than the quickest'
    );
  }
  assert.deepEqual(runRace(card, planet, waters), r, 'and the same headless');
});

test('her hands ask a stop like the bots: at her berth, her team’s water, a kit taken on by her own pit crew', () => {
  const base = specField(SEED, 3, true),
    card: RaceCard = {
      ...base,
      rules: { ...base.rules, storm: 3 },
      ships: base.ships.map((s) =>
        s.id === 0 ? { ...s, pit: { pace: 2, slip: 0 } } : s
      ),
    };
  const r = runRace(card, planet, waters, (second) =>
    Math.abs(second - 1) < STEP / 2
      ? { ...IDLE, ask: { ...NOTHING, pit: ['rigging', 'kit'] } }
      : IDLE
  );
  const hers = r.pits.filter((p) => p.id === 0);
  assert.equal(hers.length, 1);
  assert.ok(near(hers[0].second, 1));
  assert.ok(near(hers[0].seconds, PIT.kit * 2), `${hers[0].seconds}`);
  assert.deepEqual([hers[0].jobs, hers[0].slips], [1, 0]);
  assert.throws(
    () =>
      runRace(
        {
          ...card,
          ships: card.ships.map((s) => ({ ...s, pit: { pace: 0, slip: 0 } })),
        },
        planet,
        waters
      ),
    /pit crew/
  );
});
