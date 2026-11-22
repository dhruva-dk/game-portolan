// A bot: a captain's mind for a ship, as a pure function from what she can see
// to her helm's and her gun's orders (BOTS.md 1.1). This file is the captain:
// it gathers her crew's memory, runs a think every BOT.every steps and a step
// of sailing every step, and chooses among her options. The options are each
// their part's:
// - the storm (storming.ts), weighed first: inside the cap by her margin;
// - mending and loot (purser.ts), with what she asks of her hold and her gust;
// - flight and fight (fighting.ts): ramming, or her guns once armed;
// - hunting to the sound of guns (hunter.ts), and claiming water (claimer.ts);
// - her team's pit, in a race sailed in teams (pitting.ts);
// - and roaming (roaming.ts) when nothing better calls, to her place for the
//   phase when it is time (placing.ts: she looks places over as she thinks).
// Each scores 0..1 with named factors (utility.ts), multiplied by its weight
// (her brain's `choice`, so a brain or a persona may rank them otherwise), and
// the one in hand is kept while it is good enough. Her lookout (lookout.ts)
// tells her which ship she has her eye on. Every step she steers (tactician,
// pilot, helmsman) for what she is about, and, armed, lays and fires her gun
// (gunner.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { distance, type Vec3 } from '../world/sphere.ts';
import { inHand, type Order } from './battle.ts';
import type { Brain } from './brain.ts';
import type { Nature } from './persona.ts';
import { STEP } from './fixed.ts';
import { aimAndFire, armFor, gunner } from './gunner.ts';
import type { Helm } from './ship.ts';
import { choose, momentum, type Option } from './utility.ts';
import {
  BOT,
  inSight,
  roll,
  type Ctx,
  type Intent,
  type Memory,
  type Mode,
  type Sea,
  type Seen,
} from './captain.ts';
import { helmMemory, steer } from './helmsman.ts';
import { lookMemory, perceive } from './lookout.ts';
import { lose, navigate, pilotMemory } from './pilot.ts';
import { mark, tacticMemory } from './tactician.ts';
import {
  healAct,
  healUrge,
  lootAct,
  lootTime,
  lootUrge,
  purse,
  purseMemory,
} from './purser.ts';
import { claimAct, claimMemory, claimUrge } from './claimer.ts';
import { huntAct, huntMemory, huntUrge } from './hunter.ts';
import {
  away,
  fightUrge,
  fleeGoal,
  fleeUrge,
  holdsFire,
  mood,
  moodMemory,
  wounded,
} from './fighting.ts';
import { logMemory, note } from './logbook.ts';
import { pitAct, pitAsk, pitUrge } from './pitting.ts';
import { placeMemory, survey } from './placing.ts';
import { roamGoal } from './roaming.ts';
import { keptInside, stormGoal, stormUrge } from './storming.ts';
import { NOTHING, type Ask } from './stores.ts';
import { tempered } from './temper.ts';

/**
 * Her options' weights, their ranks: what each option's score is multiplied by
 * before they are compared (utility.ts choose). The storm first; then mending,
 * flight and fight; then hunting, loot and claiming water; roaming last.
 */
export const CHOICE = {
  storm: 6,
  heal: 3.5,
  flee: 3.3,
  fight: 2.6,
  hunt: 2,
  loot: 1.8,
  claim: 1.5,
  pit: 3.4,
  roam: 1,
} as const satisfies Record<Mode, number>;

export { BOT, type Memory, type Mode, type Sea, type Seen } from './captain.ts';
export { sank } from './fighting.ts';

/**
 * What her mind carries: seconds she has been afloat, and steps to her next
 * think; what she is about, since when (s), and where she makes for; who last
 * rammed her (-1: none) and when, and who last shot her and when.
 */
export interface MindMemory {
  clock: number;
  think: number;
  mode: Mode;
  since: number;
  goal: Vec3;
  hitBy: number;
  hitT: number;
  shotBy: number;
  shotT: number;
}

/**
 * A new mind for a ship at `at`, by her seed: every part's memory as she puts
 * to sea. Bots think on different steps, by their seeds.
 */
export const mind = (seed: number, at: Vec3): Memory => ({
  rand: (seed * 0x9e3779b1) >>> 0,
  clock: 0,
  think: 1 + ((seed >>> 0) % BOT.every),
  mode: 'roam',
  since: 0,
  goal: at,
  ...lookMemory(at),
  hitBy: -1,
  hitT: -Infinity,
  shotBy: -1,
  shotT: -Infinity,
  ...moodMemory(),
  ...tacticMemory(),
  ...pilotMemory(),
  ...helmMemory(at),
  ...purseMemory(),
  ...claimMemory(),
  ...huntMemory(),
  ...placeMemory(),
  ...logMemory(),
  ...gunner(),
});

/**
 * Her memory once `by` has rammed her (the game tells her, from contact.ts's
 * blows).
 */
export const rammed = (m: Memory, by: number): Memory => ({
  ...m,
  hitBy: by,
  hitT: m.clock,
});

/**
 * Her memory once a ram has struck her, taking `damage` hit points (the game
 * tells her, from battle.ts's strikes that are rams; who rammed her she knows
 * from the blow: rammed).
 */
export const bruised = (m: Memory, damage: number): Memory =>
  wounded(m, damage);

/**
 * Her memory once a ball of `by`'s has struck her, taking `damage` hit points
 * (the game tells her, from battle.ts's strikes that aren't rams).
 */
export const shot = (m: Memory, by: number, damage = 0): Memory => ({
  ...wounded(m, damage),
  shotBy: by,
  shotT: m.clock,
});

/**
 * One step of dt seconds of a bot's mind: what she orders her helm and her gun,
 * what she asks of her stores, and her memory after. `own` is her own ship,
 * `others` every other ship afloat (she sees only those in her sight), `sea`
 * what she knows of the water, the storm and the loot, `who` her nature (her
 * seed, brain and temperament: brain.ts), hers for good.
 */
export function think(
  own: Seen,
  others: readonly Seen[],
  sea: Sea,
  memory: Memory,
  who: Nature,
  dt = STEP
): { helm: Helm; order: Order; ask: Ask; memory: Memory } {
  const m: Memory = {
    ...memory,
    clock: memory.clock + dt,
    since: memory.since + dt,
    think: memory.think - 1,
  };
  const c: Ctx = {
    own,
    others,
    sea,
    m,
    b: who.brain,
    t: tempered(who.temper, m.clock),
    foe: null,
    foeD: Infinity,
    seed: who.seed,
  };
  lootTime(c, dt);
  mood(c, dt);
  if (m.think <= 0) {
    m.think = BOT.every;
    perceive(c);
    note(c);
    survey(c);
    decide(c);
  }
  c.foe = m.foe >= 0 ? (others.find((o) => o.id === m.foe) ?? null) : null;
  c.foeD = c.foe ? distance(own.ship.at, c.foe.ship.at) : Infinity;
  // what she means, where she makes for this step, the way there, her helm
  const intent = intentOf(m),
    way = navigate(c, mark(c, intent, dt), intent.foe, dt),
    { helm, lost } = steer(c, way, dt);
  if (lost) lose(m);
  const held = own.crew ? inHand(own.crew) : null,
    seen = inSight(c) ? c.foe : null;
  const order: Order = held
    ? aimAndFire(c, seen, held.kind, holdsFire(c), dt)
    : { aim: null, fire: false };
  // her stores asked on the steps she thinks; the gun for the range taken in
  // hand whenever it changes
  const ask = m.think === BOT.every ? pitAsk(c, purse(c)) : NOTHING;
  const arm =
    own.crew && ask.take === null && ask.tap === null && !own.crew.hold.using
      ? armFor(c, seen ? c.foeD : null)
      : null;
  return { helm, order, ask: arm === null ? ask : { ...ask, arm }, memory: m };
}

/**
 * What she means, from what she is about: her goal, her foe while she fights,
 * and gently to loot or a mending.
 */
const intentOf = (m: Memory): Intent => ({
  goal: m.goal,
  foe: m.mode === 'fight' ? m.foe : -1,
  arrive:
    m.mode === 'loot' || m.mode === 'heal' || m.mode === 'pit'
      ? 'gently'
      : 'through',
});

// ---------------------------------------------------------------- deciding

/**
 * An option she may take up: its mode, and its act, which gives her goal while
 * she is about it (her mind alone writes her goal). Its weight is her brain's.
 */
interface Choice extends Option<Ctx> {
  readonly mode: Mode;
  act(c: Ctx): Vec3;
}

// (Sheltering from weather, to be weighed after the storm, and raiding wait on
// things this sea hasn't got.)
const roam: Omit<Choice, 'weight'> = {
  name: 'roam',
  mode: 'roam',
  score: () => 0.15,
  act: (c) => {
    const { m } = c;
    if (
      m.mode !== 'roam' ||
      m.since > c.b.roaming.roam ||
      distance(c.own.ship.at, m.goal) < c.b.roaming.arrive
    ) {
      m.since = 0;
      return roamGoal(c);
    }
    return m.goal;
  },
};

/** Her options, in the order they are weighed, their weights aside. */
const OPTIONS: readonly Omit<Choice, 'weight'>[] = [
  { name: 'storm', mode: 'storm', score: stormUrge, act: stormGoal },
  // mending where she is, or clear of a foe about
  {
    name: 'heal',
    mode: 'heal',
    score: healUrge,
    act: (c) => healAct(c, (d) => keptInside(c, away(c, c.m.last, d))),
  },
  { name: 'flee', mode: 'flee', score: fleeUrge, act: fleeGoal },
  { name: 'fight', mode: 'fight', score: fightUrge, act: (c) => c.m.last },
  // to the sound of guns (hunter.ts)
  { name: 'hunt', mode: 'hunt', score: huntUrge, act: huntAct },
  { name: 'loot', mode: 'loot', score: lootUrge, act: lootAct },
  // her water (claimer.ts): a loop to claim more
  { name: 'claim', mode: 'claim', score: claimUrge, act: claimAct },
  // her team's pit, in a race sailed in teams (pitting.ts)
  { name: 'pit', mode: 'pit', score: pitUrge, act: pitAct },
  roam,
];

/** Her options weighed by a brain's `choice`, made once a brain. */
const weighed = new WeakMap<Brain['choice'], readonly Choice[]>();
function optionsOf(b: Brain): readonly Choice[] {
  let o = weighed.get(b.choice);
  if (!o) {
    o = OPTIONS.map((x) => ({ ...x, weight: b.choice[x.mode] }));
    weighed.set(b.choice, o);
  }
  return o;
}

function decide(c: Ctx): void {
  const { m } = c,
    options = optionsOf(c.b);
  c.foe =
    m.foe >= 0 && inSight(c)
      ? (c.others.find((o) => o.id === m.foe) ?? null)
      : null;
  c.foeD = c.foe ? distance(c.own.ship.at, c.foe.ship.at) : Infinity;
  const current = options.findIndex((o) => o.mode === m.mode);
  const o =
    options[
      choose(options, c, current, c.t.skill, () => roll(m), momentum(m.since))
    ] ?? options[options.length - 1];
  if (o.mode !== m.mode) {
    [m.mode, m.since] = [o.mode, 0];
    lose(m);
  }
  m.goal = o.act(c);
}
