import { DEFAULT_BRAIN } from '../sim/brain.ts';
import { eye } from '../sim/lookout.ts';
import { MIXED, PERSONAS, TYPES, nature, type Nature } from '../sim/persona.ts';
import type { MatchSetup } from '../sim/setup.ts';
import { hash } from '../world/random.ts';
import type { Fleet, Spread, Standout } from './player.ts';

export function naturesOf(setup: MatchSetup): Map<number, Nature> {
  const natures = new Map<number, Nature>();
  setup.ships.forEach((s, id) => {
    if (s.hands !== 'player')
      natures.set(id, nature(hash(setup.match, id), DEFAULT_BRAIN, MIXED.mix));
  });
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

export function fleetOf(setup: MatchSetup): Fleet {
  const type = MIXED,
    natures = naturesOf(setup),
    all = [...natures.values()];
  const counts = PERSONAS.map((p) => all.filter((n) => n.persona === p).length);
  const common = counts.indexOf(Math.max(...counts));
  return {
    type: TYPES.findIndex((t) => t.name === type.name),
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
