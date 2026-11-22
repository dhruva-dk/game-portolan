// What a gull asks of a crew (Phase B section 5): their wants, drawn by seed and weighted by age and traits, and their
// ask: wage a race, signing fee, contract length. The scoring of offers against these is the market's (section 5).

import type { Role, Want } from '../office.ts';
import { weighted, type Rand } from './dice.ts';
import { marketability, wageTrait } from './effective.ts';
import { modifier } from './traits.ts';
import { stars } from './stars.ts';
import type { Gull } from './roles.ts';
import { TUNING } from './tuning.ts';

const W = TUNING.wage;
const WANTS: readonly Want[] = [
  'money',
  'status',
  'league',
  'ambition',
  'security',
  'facilities',
  'home',
];

/** Each want's weight in the draw at an age: the young lean to status and ambition, the old to security and money. */
export function wantWeights(role: Role, years: number): Record<Want, number> {
  const young = Math.min(1, Math.max(0, (30 - years) / 12));
  const old = Math.min(1, Math.max(0, (years - 28) / 14));
  return {
    money: 1 + 1.5 * old,
    status: role === 'captain' ? 1 + 2 * young : 0,
    league: 1,
    ambition: 1 + 1.5 * young,
    security: 0.6 + 2 * old,
    facilities: role === 'manager' || role === 'elder' ? 0 : 0.8,
    home: 0.6,
  };
}

/** A gull's three ranked wants, drawn without repeats; a trait's want (Homebody's home) ranks first. */
export function drawWants(
  role: Role,
  years: number,
  traits: readonly string[],
  rand: Rand
): Want[] {
  const weights = wantWeights(role, years);
  const first = modifier(traits, null).wants;
  const out: Want[] = first ? [first] : [];
  while (out.length < 3) {
    const open = WANTS.filter((w) => !out.includes(w) && weights[w] > 0);
    out.push(
      open[
        weighted(
          rand,
          open.map((w) => weights[w])
        )
      ]
    );
  }
  return out;
}

/** A gull's ask a race at a league (0..2): base(role) × 1.6^stars × league scale × (1 + marketability / 200), by traits. */
export function askWage(g: Gull, league: number): number {
  const base =
    W.base[g.role] *
    Math.pow(W.growth, stars(g)) *
    W.league[league] *
    (1 + marketability(g) / W.market) *
    wageTrait(g);
  return Math.round(base);
}

/** A signing fee: four races' wage. */
export const askFee = (wage: number): number => wage * W.feeRaces;

/** The contract length a gull of an age asks, in seasons: the young short, the old long. */
export const askSeasons = (years: number): 1 | 2 | 3 => {
  const [young, middle, old] = W.lengths;
  return (years < W.young ? young : years < W.old ? middle : old) as 1 | 2 | 3;
};
