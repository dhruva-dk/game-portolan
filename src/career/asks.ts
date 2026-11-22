// What a person asks of a team (Phase B section 5): their wants, drawn by seed and weighted by age and traits, and their
// ask: wage a race, signing fee, contract length. The scoring of offers against these is the market's (section 5).

import type { Role, Want } from '../office.ts';
import { weighted, type Rand } from './dice.ts';
import { marketability, wageTrait } from './effective.ts';
import { modifier } from './traits.ts';
import { stars } from './stars.ts';
import type { Person } from './roles.ts';
import { TUNING } from './tuning.ts';

const W = TUNING.wage;
const WANTS: readonly Want[] = [
  'money',
  'status',
  'tier',
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
    status: role === 'driver' ? 1 + 2 * young : 0,
    tier: 1,
    ambition: 1 + 1.5 * young,
    security: 0.6 + 2 * old,
    facilities: role === 'manager' || role === 'chairman' ? 0 : 0.8,
    home: 0.6,
  };
}

/** A person's three ranked wants, drawn without repeats; a trait's want (Homebody's home) ranks first. */
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

/** A person's ask a race at a tier (0..2): base(role) × 1.6^stars × tier scale × (1 + marketability / 200), by traits. */
export function askWage(g: Person, tier: number): number {
  const base =
    W.base[g.role] *
    Math.pow(W.growth, stars(g)) *
    W.tier[tier] *
    (1 + marketability(g) / W.market) *
    wageTrait(g);
  return Math.round(base);
}

/** A signing fee: four races' wage. */
export const askFee = (wage: number): number => wage * W.feeRaces;

/** The contract length a person of an age asks, in seasons: the young short, the old long. */
export const askSeasons = (years: number): 1 | 2 | 3 => {
  const [young, middle, old] = W.lengths;
  return (years < W.young ? young : years < W.old ? middle : old) as 1 | 2 | 3;
};
