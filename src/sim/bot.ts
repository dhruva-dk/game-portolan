// A bot: a captain's mind for a ship, as a pure function from what she can see
// to her helm's and her gun's orders. Her temperament is temper.ts's and her
// weighing of what to do utility.ts's; what needs hearing or wind is left out
// until those are here (loot and mending are purser.ts's, territory
// claimer.ts's).
//
// Every BOT.every steps she thinks:
// - perceive: the nearest ship she can see within her notice (land between
// hides one), a ship that just rammed her
//   seen as twice as near; a foe out of sight is followed to where she was lost, and let go after `forget` seconds;
// - decide: utility scoring (utility.ts) over the storm, flee, fight and roam,
// the one in hand kept while it is good
//   enough.
//   The storm comes first: close to its edge or outside it, or with the next cap closing or nearly due and her not
//   well inside it, she makes for the water her temperament's margin inside the cap she must be in; roaming, her
//   marks are kept that margin inside the edge and drift in toward the middle as it closes, and running she runs no
//   nearer the edge than that.
//   Fighting is ramming: her will to is her temperament and mood, the odds (hull, a seam for health.ts), being rammed,
//   and the crowd round her where a third ship would finish whoever won; close aboard she fights whatever her will;
//   and she lets a ship sailing away from her go once it is past reach, as a ram can't catch a ship as fast as she is.
//   She runs from a fight she is losing, or from a ship that rams her that she won't fight.
// Every step she steers (helmsman.ts) for what she is about, and, armed, fights
// with her guns instead of ramming (gunner.ts aimAndFire and ring): she takes
// in hand the one for the range, holds its range round her foe, and lays and
// fires it, a gun reaching a ship however fast she sails. Mending (weighed 3.5
// among her options) and loot (1.8) are purser.ts's, with what she asks of her
// hold and her gust each step.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import {
  R,
  add,
  apart,
  along,
  distance,
  dot,
  normalize,
  toward,
  type Vec3,
} from '../world/sphere.ts';
import { inHand, type Order } from './battle.ts';
import { STEP } from './fixed.ts';
import { aimAndFire, armFor, reactTime } from './gunner.ts';
import type { Helm } from './ship.ts';
import { STORM, toEdge, type Cap } from './storm.ts';
import { temper } from './temper.ts';
import {
  choose,
  logistic,
  momentum,
  ramp,
  utility,
  type Option,
} from './utility.ts';
import {
  BOT,
  between,
  inSight,
  open,
  roll,
  rotate,
  type Ctx,
  type Memory,
  type Mode,
  type Sea,
  type Seen,
} from './captain.ts';
import { deepest, steer } from './helmsman.ts';
import { healUrge, lootAct, lootUrge, purse, PURSER } from './purser.ts';
import {
  claimAct,
  claimUrge,
  cutAct,
  cutUrge,
  homeAct,
  homeUrge,
  sound,
} from './claimer.ts';
import { NOTHING, type Ask } from './stores.ts';

export {
  BOT,
  mind,
  rammed,
  shot,
  type Memory,
  type Mode,
  type Sea,
  type Seen,
} from './captain.ts';

/**
 * One step of dt seconds of a bot's mind: what she orders her helm and her gun,
 * what she asks of her stores, and her memory after. `own` is her own ship,
 * `others` every other ship afloat (she sees only those in her sight), `sea`
 * what she knows of the water, the storm and the loot, `seed` hers for good.
 */
export function think(
  own: Seen,
  others: readonly Seen[],
  sea: Sea,
  memory: Memory,
  seed: number,
  dt = STEP
): { helm: Helm; order: Order; ask: Ask; memory: Memory } {
  const m: Memory = {
    ...memory,
    clock: memory.clock + dt,
    since: memory.since + dt,
    think: memory.think - 1,
    lootT: memory.mode === 'loot' ? memory.lootT + dt : memory.lootT,
  };
  const c: Ctx = {
    own,
    others,
    sea,
    m,
    t: temper(seed),
    foe: null,
    foeD: Infinity,
    seed,
  };
  sound(c);
  if (m.think <= 0) {
    m.think = BOT.every;
    perceive(c);
    decide(c);
  }
  c.foe = m.foe >= 0 ? (others.find((o) => o.id === m.foe) ?? null) : null;
  c.foeD = c.foe ? distance(own.ship.at, c.foe.ship.at) : Infinity;
  const helm = steer(c, dt);
  const held = own.crew ? inHand(own.crew) : null,
    seen = inSight(c) ? c.foe : null;
  const order: Order = held
    ? aimAndFire(
        m,
        own.ship,
        seen,
        held.kind,
        m.clock,
        c.t.skill,
        () => roll(m),
        dt,
        holdsFire(c)
      )
    : { aim: null, fire: false };
  m.was = own.ship.at;
  // her stores asked on the steps she thinks; the gun for the range taken in
  // hand whenever it changes
  const ask = m.think === BOT.every ? purse(c) : NOTHING;
  const arm =
    own.crew && ask.take === null && ask.tap === null && !own.crew.hold.using
      ? armFor(own.crew, seen ? c.foeD : null)
      : null;
  return { helm, order, ask: arm === null ? ask : { ...ask, arm }, memory: m };
}

// ---------------------------------------------------------------- seeing

/** Whether land stands between a and b, high enough to hide a ship. */
function hidden(c: Ctx, a: Vec3, b: Vec3): boolean {
  const d = distance(a, b),
    t = toward(a, b);
  if (!t) return false;
  for (let s = BOT.sightStep; s < d; s += BOT.sightStep)
    if (-c.sea.depth(along(a, t, s).p) > BOT.sightLine) return true;
  return false;
}

/**
 * Notes the nearest ship she can see; a foe out of sight is followed to where
 * she was last seen, then let go.
 */
function perceive(c: Ctx): void {
  const { m, own } = c;
  let best: Seen | null = null,
    bd = c.t.notice * (0.8 + 0.4 * c.t.skill);
  for (const o of c.others) {
    if (apart(own.ship.at, o.ship.at, BOT.sightMax)) continue;
    const d = distance(own.ship.at, o.ship.at);
    if (d > BOT.sightMax) continue;
    const score =
      o.id === m.hitBy && m.clock - m.hitT < BOT.grudge ? d * BOT.nearer : d;
    if (score >= bd || hidden(c, own.ship.at, o.ship.at)) continue;
    [bd, best] = [score, o];
  }
  if (best && best.id !== m.foe) m.react = m.clock + reactTime(c.t.skill);
  if (best) [m.foe, m.seen, m.last] = [best.id, m.clock, best.ship.at];
  else if (
    m.foe >= 0 &&
    (m.clock - m.seen > BOT.forget || !c.others.some((o) => o.id === m.foe))
  )
    m.foe = -1;
}

// ---------------------------------------------------------------- the storm

/** Metres the cap reaches along the surface from its centre. */
const reach = (cap: Cap) => cap.radius * R;

/** Whether the next cap is closing, or will start to within BOT.late s. */
const late = (c: Ctx) =>
  !!c.sea.storm &&
  (c.sea.storm.closing || c.sea.storm.secondsToNext < BOT.late);

/**
 * How urgently she must get inside: from nothing `ease[0]` of her margin in
 * from the edge to wholly at `ease[1]` of it (and outside); and wholly while
 * the next cap is late and she isn't `inNext` of her margin inside it, until
 * the last has closed.
 */
function stormUrge(c: Ctx): number {
  const s = c.sea.storm;
  if (!s) return 0;
  const p = c.own.ship.at,
    margin = c.t.margin;
  const pressed =
    late(c) &&
    toEdge(p, s.next) < margin * BOT.inNext &&
    s.phase < STORM.phases.length;
  return Math.max(
    ramp(toEdge(p, s), margin * BOT.ease[0], margin * BOT.ease[1]),
    pressed ? 1 : 0
  );
}

/**
 * Open water at q, or the nearest to it in rings `ring` m apart out to `shore`
 * m, 16 ways round each; q itself if there is none.
 */
function openNear(c: Ctx, q: Vec3): Vec3 {
  if (open(c, q)) return q;
  const t = toward(q, c.own.ship.at) ?? c.own.ship.heading;
  for (let d = BOT.ring; d <= BOT.shore; d += BOT.ring) {
    for (let k = 0; k < 16; k++) {
      const p = along(q, rotate(q, t, (k * Math.PI) / 8), d).p;
      if (open(c, p)) return p;
    }
  }
  return q;
}

/**
 * Where she makes for to be within `r` m of `centre`: where she is, if she is;
 * else open water `inward` of the way out from the centre toward her.
 */
function inward(c: Ctx, p: Vec3, centre: Vec3, r: number): Vec3 {
  if (distance(p, centre) <= r) return p;
  const t = toward(centre, p);
  return openNear(c, t ? along(centre, t, r * BOT.inward).p : centre);
}

/**
 * The cap she makes for in the storm: the one she is in, while it isn't late or
 * she is near its edge; else the next.
 */
function stormGoal(c: Ctx): Vec3 {
  const s = c.sea.storm!,
    margin = c.t.margin,
    p = c.own.ship.at;
  const cap: Cap =
    toEdge(p, s) < margin * BOT.nearEdge || !late(c) ? s : s.next;
  return inward(c, p, cap.centre, Math.max(0, reach(cap) - margin));
}

/**
 * Pulls a mark she would make for that lies nearer the edge than her margin in
 * to that margin inside it.
 */
const keptInside = (c: Ctx, q: Vec3): Vec3 => {
  const s = c.sea.storm;
  return s && toEdge(q, s) < c.t.margin
    ? inward(c, q, s.centre, Math.max(0, reach(s) - c.t.margin))
    : q;
};

// ---------------------------------------------------------------- deciding

/** How much she wants to ram the ship she sees, a ram her weapon. */
function fightUrge(c: Ctx): number {
  const { m, t, foe, own } = c;
  if (!foe) return 0;
  const d = c.foeD;
  let will = t.fight * (0.6 + 0.4 * t.aggro);
  const strength = (s: Seen) => (s.hull ?? 100) + (s.shield ?? 0);
  will += ((0.1 + 0.5 * t.skill) * (strength(own) - strength(foe))) / 100;
  if (m.hitBy === foe.id)
    will +=
      BOT.roused * ramp(m.clock - m.hitT, BOT.grudge + BOT.cool, BOT.cool);
  for (const o of c.others)
    if (o.id !== foe.id && distance(own.ship.at, o.ship.at) < BOT.crowd)
      will -= BOT.crowding * t.skill;
  const restraint = holdBack(c);
  will -= restraint;
  // close aboard she fights whatever her will, from nearer while she holds back
  const close = ramp(
    d,
    BOT.closeFrom - 50 * restraint,
    BOT.closeAt - 50 * restraint
  );
  if (close >= 1) return 1;
  // past reach, a ship sailing away is let go: in a fight, once she is clearly
  // away; out of one, she is not taken up while she nearly is, so it doesn't
  // flicker as she weaves. Armed, while she holds back, by her heading alone,
  // as a gun reaches a ship however fast she sails; ramming, always, by her
  // speed away, as a ram must catch her
  const from = toward(foe.ship.at, own.ship.at),
    off = from ? -dot(foe.ship.heading, from) : 0;
  const past = ramp(d, BOT.letGo - 10, BOT.letGo + 15);
  const go = !own.armed
    ? 1 -
      past *
        ramp(
          off * foe.ship.speed,
          ...(m.mode === 'fight' ? BOT.outrun : BOT.outran)
        )
    : restraint > 0
      ? 1 -
        past *
          (m.mode === 'fight' ? ramp(off, 0, 0.35) : ramp(off, -0.45, -0.15))
      : 1;
  return Math.max(close, utility(logistic(will, BOT.will, BOT.willWidth), go));
}

/**
 * How much she holds back from a fight now: by the storm's phase, and more
 * among the last few afloat (her and the others she is given). None without a
 * storm.
 */
function holdBack(c: Ctx): number {
  const s = c.sea.storm;
  const by = s ? BOT.restraint[Math.min(s.phase, BOT.restraint.length - 1)] : 0;
  if (by <= 0) return 0;
  return c.others.length + 1 <= BOT.lastFew ? by + BOT.more : by;
}

/**
 * Whether she holds her fire: while she holds back, outside a fight she chose,
 * but at a ship close by that has just shot her.
 */
const holdsFire = (c: Ctx) =>
  c.m.mode !== 'fight' &&
  holdBack(c) > 0 &&
  !(
    c.foe &&
    c.m.shotBy === c.foe.id &&
    c.m.clock - c.m.shotT < BOT.shotFresh &&
    c.foeD < BOT.letGo
  );

/**
 * Losing a fight: her hull down past where her temperament runs, with the foe
 * close (a seam for health.ts).
 */
const losing = (c: Ctx) =>
  c.foe
    ? utility(
        ramp(c.own.hull ?? 100, c.t.run + 8, c.t.run - 4),
        ramp(c.foeD, 160, 130)
      )
    : 0;

/**
 * Rammed by a ship she doesn't want to fight: the less she wants to, and the
 * sharper she is, the more she gets clear.
 */
function evading(c: Ctx): number {
  const { m } = c;
  if (
    !c.foe ||
    c.foeD >= 140 ||
    m.hitBy !== c.foe.id ||
    m.clock - m.hitT > BOT.fresh
  )
    return 0;
  return utility(1 - fightUrge(c), 0.3 + 0.7 * c.t.skill);
}

interface Choice extends Option<Ctx> {
  readonly mode: Mode;
  act(c: Ctx): void;
}

// (Sheltering from weather, to be weighed 5.2, after the storm, hunting to the
// sound of guns, and raiding wait on things this sea hasn't got; claiming is
// claimer.ts's.)
const ROAM: Choice = {
  name: 'roam',
  weight: 1,
  mode: 'roam',
  score: () => 0.15,
  act: (c) => {
    const { m } = c;
    if (
      m.mode !== 'roam' ||
      m.since > BOT.roam ||
      distance(c.own.ship.at, m.goal) < BOT.arrive
    ) {
      m.since = 0;
      m.goal = roamGoal(c);
    }
  },
};
const OPTIONS: readonly Choice[] = [
  {
    name: 'storm',
    weight: 6,
    mode: 'storm',
    score: stormUrge,
    act: (c) => {
      c.m.goal = stormGoal(c);
    },
  },
  // mending where she is, or clear of a foe about
  {
    name: 'heal',
    weight: 3.5,
    mode: 'heal',
    score: healUrge,
    act: (c) => {
      c.m.goal = c.foe
        ? keptInside(c, away(c, c.m.last, PURSER.clear))
        : c.own.ship.at;
    },
  },
  {
    name: 'flee',
    weight: 3.3,
    mode: 'flee',
    score: (c) => Math.max(losing(c), evading(c)),
    act: (c) => {
      c.m.goal = keptInside(c, away(c, c.m.last, BOT.run));
    },
  },
  {
    name: 'fight',
    weight: 2.6,
    mode: 'fight',
    score: fightUrge,
    act: (c) => {
      c.m.goal = c.m.last;
    },
  },
  { name: 'loot', weight: 1.8, mode: 'loot', score: lootUrge, act: lootAct },
  // her water (claimer.ts): home to get her shield back, across another's
  // trail, a loop to claim more
  { name: 'home', weight: 2, mode: 'home', score: homeUrge, act: homeAct },
  { name: 'cut', weight: 2, mode: 'cut', score: cutUrge, act: cutAct },
  {
    name: 'claim',
    weight: 1.5,
    mode: 'claim',
    score: claimUrge,
    act: claimAct,
  },
  ROAM,
];

function decide(c: Ctx): void {
  const { m } = c;
  c.foe =
    m.foe >= 0 && inSight(c)
      ? (c.others.find((o) => o.id === m.foe) ?? null)
      : null;
  c.foeD = c.foe ? distance(c.own.ship.at, c.foe.ship.at) : Infinity;
  const current = OPTIONS.findIndex((o) => o.mode === m.mode);
  const o =
    OPTIONS[
      choose(OPTIONS, c, current, c.t.skill, () => roll(m), momentum(m.since))
    ] ?? ROAM;
  if (o.mode !== m.mode) [m.mode, m.since, m.route] = [o.mode, 0, null];
  o.act(c);
}

/**
 * Open water `d` m from p away from `from`: straight away, or swung a little
 * further round each way until open.
 */
function away(c: Ctx, from: Vec3, d: number): Vec3 {
  const p = c.own.ship.at,
    t = toward(from, p) ?? c.own.ship.heading;
  const out =
    toward(p, along(from, t, distance(from, p) + 1).p) ?? c.own.ship.heading;
  for (let k = 0; k <= 8; k++) {
    const q = along(
      p,
      rotate(p, out, (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8)),
      d
    ).p;
    if (open(c, q)) return q;
  }
  return along(p, out, d).p;
}

/**
 * A mark to roam to: open water a random way off, drawn in toward the storm's
 * middle once its cap is under `drift` m and kept her margin inside its edge
 * (inside the next cap's while that is late, as the storm's edge closes at up
 * to 8 m/s); failing that, in from the edge if she is near it, or else toward
 * the deepest water round her.
 */
function roamGoal(c: Ctx): Vec3 {
  const p = c.own.ship.at,
    f = c.own.ship.heading,
    s = c.sea.storm,
    margin = c.t.margin;
  const keep = s && (late(c) ? s.next : s);
  for (let tries = 0; tries < 8; tries++) {
    let q = along(
      p,
      rotate(p, f, between(c.m, -Math.PI, Math.PI)),
      between(c.m, BOT.near, BOT.far)
    ).p;
    if (s && reach(s) < BOT.drift)
      q = normalize(add(q, add(s.centre, q, -1), BOT.drawn));
    if (open(c, q) && (!keep || toEdge(q, keep) > margin)) return q;
  }
  if (s && toEdge(p, s) < 2 * margin)
    return inward(c, p, s.centre, Math.max(0, reach(s) - 2 * margin));
  return along(p, rotate(p, f, deepest(c)), BOT.near).p;
}
