// A planet's rule (world/biome.ts Rule, #61 section 3): the one thing its biome changes in how a race is sailed, read
// from the planet, its numbers in handling.ts RULES. Every other planet's rule is 'none', and with it each of these
// leaves the race as it was, to the bit (a helm untouched, a factor of exactly 1, a tide of exactly 0).
//
//   reef   a ship slows over the reef's shallow water (ruled: her way)
//   lee    the wind falls in the channels under the cliffs (ruled: her way, by how near a tall island's coast)
//   roots  a gust drives her less in the shallows (ruled: its lift)
//   ash    she sees less far, the more for a poor lookout (sighted)
//   tide   the sea rises and falls fast (tideAt): the depth under her is the floor's plus the tide's
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import type { Rule } from '../world/biome.ts';
import type { Rise } from '../world/planet.ts';
import { distance, type Vec3 } from '../world/sphere.ts';
import { RULES } from './handling.ts';
import type { Depth } from './shoal.ts';
import type { Helm } from './ship.ts';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** What a ship's helm is ruled by where she lies: the water's depth, and the land's rises (the lee's cliffs). */
export interface Ground { depth: Depth; rises: readonly Rise[] }

/** How far a lee reaches past the coast, as a share of the island's own size at most (a small tall rock shelters
 *  little). */
const LEE_SIZE = 1.5;

/** The share of her top the wind lets her make at `at` under the cliffs: 1 clear of every tall island. */
export function leeAt(rises: readonly Rise[], at: Vec3): number {
  const { tall, reach, way } = RULES.lee;
  let share = 1;
  for (const r of rises) {
    if (r.top < tall) continue;
    const off = distance(at, r.at) - r.coast, far = Math.min(reach, LEE_SIZE * r.coast);
    if (off < far) share = Math.min(share, way + (1 - way) * smoothstep(0, far, off));
  }
  return share;
}

/** Her helm as the planet's rule has it where she lies (`at`, a unit vector): the same helm under any other rule. */
export function ruled(rule: Rule, helm: Helm, at: Vec3, ground: Ground): Helm {
  switch (rule) {
    case 'reef': {
      const { depth, way } = RULES.reef, over = ground.depth(at);
      return over < depth + 1 ? { ...helm, way: way + (1 - way) * smoothstep(depth, depth + 1, over) } : helm;
    }
    case 'lee': {
      const way = leeAt(ground.rises, at);
      return way < 1 ? { ...helm, way } : helm;
    }
    case 'roots': {
      const { depth, lift } = RULES.roots, over = ground.depth(at);
      return over < depth + 1 ? { ...helm, lift: lift + (1 - lift) * smoothstep(depth, depth + 1, over) } : helm;
    }
    default:
      return helm;
  }
}

/** The share of her notice range she keeps under the rule, by her Lookout (Temper.lookout, on skill's scale: 0.35 +
 *  0.55 u): 1 but in the ash. */
export function sighted(rule: Rule, lookout: number): number {
  if (rule !== 'ash') return 1;
  const { sight, poor, good } = RULES.ash, u = Math.min(Math.max((lookout - 0.35) / 0.55, 0), 1);
  return sight * (poor + (good - poor) * u);
}

/** How far the sea stands over its mean `seconds` into the race, metres: 0 but where the tide runs. */
export function tideAt(rule: Rule, seconds: number): number {
  if (rule !== 'tide') return 0;
  const { range, period } = RULES.tide;
  return range * Math.sin((2 * Math.PI * seconds) / period);
}
