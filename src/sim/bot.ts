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
import { placeMemory, survey } from './placing.ts';
import { roamGoal } from './roaming.ts';
import { keptInside, stormGoal, stormUrge } from './storming.ts';
import { NOTHING, type Ask } from './stores.ts';
import { tempered } from './temper.ts';

export const CHOICE = {
  storm: 6,
  heal: 3.5,
  flee: 3.3,
  fight: 2.6,
  hunt: 2,
  loot: 1.8,
  claim: 1.5,
  roam: 1,
} as const satisfies Record<Mode, number>;

export { BOT, type Memory, type Mode, type Sea, type Seen } from './captain.ts';
export { sank } from './fighting.ts';

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

export const rammed = (m: Memory, by: number): Memory => ({
  ...m,
  hitBy: by,
  hitT: m.clock,
});

export const bruised = (m: Memory, damage: number): Memory =>
  wounded(m, damage);

export const shot = (m: Memory, by: number, damage = 0): Memory => ({
  ...wounded(m, damage),
  shotBy: by,
  shotT: m.clock,
});

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
  const intent = intentOf(m),
    way = navigate(c, mark(c, intent, dt), intent.foe, dt),
    { helm, lost } = steer(c, way, dt);
  if (lost) lose(m);
  const held = own.crew ? inHand(own.crew) : null,
    seen = inSight(c) ? c.foe : null;
  const order: Order = held
    ? aimAndFire(c, seen, held.kind, holdsFire(c), dt)
    : { aim: null, fire: false };
  const ask = m.think === BOT.every ? purse(c) : NOTHING;
  const arm =
    own.crew && ask.take === null && ask.tap === null && !own.crew.hold.using
      ? armFor(c, seen ? c.foeD : null)
      : null;
  return { helm, order, ask: arm === null ? ask : { ...ask, arm }, memory: m };
}

const intentOf = (m: Memory): Intent => ({
  goal: m.goal,
  foe: m.mode === 'fight' ? m.foe : -1,
  arrive: m.mode === 'loot' || m.mode === 'heal' ? 'gently' : 'through',
});

interface Choice extends Option<Ctx> {
  readonly mode: Mode;
  act(c: Ctx): Vec3;
}

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

const OPTIONS: readonly Omit<Choice, 'weight'>[] = [
  { name: 'storm', mode: 'storm', score: stormUrge, act: stormGoal },
  {
    name: 'heal',
    mode: 'heal',
    score: healUrge,
    act: (c) => healAct(c, (d) => keptInside(c, away(c, c.m.last, d))),
  },
  { name: 'flee', mode: 'flee', score: fleeUrge, act: fleeGoal },
  { name: 'fight', mode: 'fight', score: fightUrge, act: (c) => c.m.last },
  { name: 'hunt', mode: 'hunt', score: huntUrge, act: huntAct },
  { name: 'loot', mode: 'loot', score: lootUrge, act: lootAct },
  { name: 'claim', mode: 'claim', score: claimUrge, act: claimAct },
  roam,
];

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
