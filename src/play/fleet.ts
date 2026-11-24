import { DEFAULT_BRAIN } from '../sim/brain.ts';
import { eye } from '../sim/lookout.ts';
import { PLAYER, SHIPS } from '../sim/match.ts';
import { PERSONAS, TYPES, dealt, nature, type Nature } from '../sim/persona.ts';
import { hash } from '../world/random.ts';
import type { Fleet, Spread, Standout } from './player.ts';

export function naturesOf(seed: number): Map<number, Nature> {
  const mix = dealt(seed).mix,
    natures = new Map<number, Nature>();
  for (let id = 0; id < SHIPS; id++)
    if (id !== PLAYER)
      natures.set(id, nature(hash(seed, id), DEFAULT_BRAIN, mix));
  return natures;
}

const aggression = (n: Nature) => n.temper.fight * (0.6 + 0.4 * n.temper.aggro);
const notice = (n: Nature) => Math.min(eye(n.temper), n.brain.sight.sightMax);

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
