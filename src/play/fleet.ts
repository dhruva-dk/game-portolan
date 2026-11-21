// A seed's fleet as the seed panel shows it: the race that seed deals (its
// match type, sim/persona.ts dealt) and every bot's nature, drawn as the match
// draws them as her ships are launched (state.ts: each by hash(the match's
// seed, her id), the game's own brain, the type's mix), summed up in plain
// numbers. Ship 0 is hers; the rest are the bots.
//
// Pure arithmetic: no three, so it runs in node for the tests, and in well
// under a millisecond, so on the main thread as she types.

import { DEFAULT_BRAIN } from '../sim/brain.ts';
import { eye } from '../sim/lookout.ts';
import { PLAYER, SHIPS } from '../sim/match.ts';
import { PERSONAS, TYPES, dealt, nature, type Nature } from '../sim/persona.ts';
import { hash } from '../world/random.ts';
import type { Fleet, Spread, Standout } from '../player.ts';

/** Every bot's nature in the race of this seed, by her ship's id. */
export function naturesOf(seed: number): Map<number, Nature> {
  const mix = dealt(seed).mix,
    natures = new Map<number, Nature>();
  for (let id = 0; id < SHIPS; id++)
    if (id !== PLAYER)
      natures.set(id, nature(hash(seed, id), DEFAULT_BRAIN, mix));
  return natures;
}

/** Her will to fight at rest (fighting.ts: her fight, by her mood). */
const aggression = (n: Nature) => n.temper.fight * (0.6 + 0.4 * n.temper.aggro);
/** How far off she notices a ship, m: her eye, as far as her lookout sees. */
const notice = (n: Nature) => Math.min(eye(n.temper), n.brain.sight.sightMax);

/** The average and the spread of `read` over `all`. */
function spread(all: readonly Nature[], read: (n: Nature) => number): Spread {
  let sum = 0,
    squares = 0;
  for (const n of all) {
    const v = read(n);
    sum += v;
    squares += v * v;
  }
  const mean = sum / Math.max(1, all.length);
  return {
    mean,
    spread: Math.sqrt(
      Math.max(0, squares / Math.max(1, all.length) - mean * mean)
    ),
  };
}

/** The captain `read` makes the most of, the first of them on a tie. */
function most(
  natures: Map<number, Nature>,
  read: (n: Nature) => number
): Standout {
  let best: Standout = { id: -1, persona: 0, by: -Infinity };
  for (const [id, n] of natures) {
    const by = read(n);
    if (by > best.by) best = { id, persona: PERSONAS.indexOf(n.persona), by };
  }
  return best;
}

/** The fleet of the race of this seed. */
export function fleetOf(seed: number): Fleet {
  const type = dealt(seed),
    natures = naturesOf(seed),
    all = [...natures.values()];
  const counts = PERSONAS.map((p) => all.filter((n) => n.persona === p).length);
  const common = counts.indexOf(Math.max(...counts));
  return {
    type: TYPES.findIndex((t) => t === type),
    name: type.name,
    counts,
    common,
    skill: spread(all, (n) => n.temper.skill),
    aggression: spread(all, aggression),
    notice: spread(all, notice),
    margin: spread(all, (n) => n.temper.margin),
    flee: spread(all, (n) => n.temper.run),
    sharpest: most(natures, (n) => n.temper.skill),
    reckless: most(
      natures,
      (n) => (aggression(n) * (100 - n.temper.run)) / 100
    ),
  };
}
