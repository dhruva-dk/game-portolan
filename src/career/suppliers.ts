// Suppliers: in the off-season each team chooses one each of composites (hull, keel), sailmaker
// (sails, rigging) and hydraulics (rudder, mounts) from three cards a trade, dealt by seed from this table. Each gives a
// trade-off for its parts for the season, and costs money once. The window is the off-season up to the season's first
// race (the founding included). Rivals choose by personality (career/works.ts).

import { known } from './canon.ts';
import type { PartType } from '../race.ts';
import type { Personality, Trade } from '../office/command.ts';
import { canSpend, paid } from './balance.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { seeded, shuffled } from './dice.ts';
import { mine } from './post.ts';
import type { CareerState } from './state.ts';

/** What a supplier's goods do to its parts for the season: performance at a design's start and its maximum (added),
 *  reliability (added), condition lost a race (×), the improvement's points on them (×), and a design's cost (×). */
interface Terms {
  start: number;
  max: number;
  reliability: number;
  wear: number;
  improvement: number;
  cost: number;
}

interface Supplier {
  id: string;
  name: string;
  trade: Trade;
  balance: number;
  terms: Terms;
}

export const TRADES: readonly Trade[] = [
  'composites',
  'sailmaker',
  'hydraulics',
];

/** The part types each trade supplies. */
const SUPPLIES: Readonly<Record<Trade, readonly PartType[]>> = {
  composites: ['hull', 'keel'],
  sailmaker: ['sails', 'rigging'],
  hydraulics: ['rudder', 'mounts'],
};

/** A part type's trade. */
export const tradeOf = (type: PartType): Trade =>
  TRADES.find((t) => SUPPLIES[t].includes(type)) ?? 'composites';

const T = (
  start: number,
  max: number,
  reliability: number,
  wear: number,
  improvement: number,
  cost: number
): Terms => ({ start, max, reliability, wear, improvement, cost });

/** Five a trade: a fast starter that tops out lower, a sound one that wears faster, a cheap and slow one, a dear one
 *  with headroom, and an even one. */
export const SUPPLIERS: readonly Supplier[] = [
  {
    id: 'composites.0',
    name: 'Halloway Composites',
    trade: 'composites',
    balance: 300,
    terms: T(30, -40, 0, 1, 1, 1),
  },
  {
    id: 'composites.1',
    name: 'Greyoak Structures',
    trade: 'composites',
    balance: 260,
    terms: T(0, 0, 0.06, 1.3, 1, 1),
  },
  {
    id: 'composites.2',
    name: 'Bracken Fibre Works',
    trade: 'composites',
    balance: 80,
    terms: T(0, 0, 0, 1, 0.8, 0.8),
  },
  {
    id: 'composites.3',
    name: 'Ironwood Advanced Materials',
    trade: 'composites',
    balance: 600,
    terms: T(-10, 60, 0.02, 1, 1, 1.2),
  },
  {
    id: 'composites.4',
    name: 'Fenwick Carbon',
    trade: 'composites',
    balance: 200,
    terms: T(10, 10, 0.01, 1, 1, 1),
  },
  {
    id: 'sailmaker.0',
    name: 'Saltmarsh Wing Systems',
    trade: 'sailmaker',
    balance: 300,
    terms: T(30, -40, 0, 1, 1, 1),
  },
  {
    id: 'sailmaker.1',
    name: 'Lindqvist Membranes',
    trade: 'sailmaker',
    balance: 260,
    terms: T(0, 0, 0.06, 1.3, 1, 1),
  },
  {
    id: 'sailmaker.2',
    name: 'Harbour Sail Supply',
    trade: 'sailmaker',
    balance: 80,
    terms: T(0, 0, 0, 1, 0.8, 0.8),
  },
  {
    id: 'sailmaker.3',
    name: 'Albatross Laminates',
    trade: 'sailmaker',
    balance: 600,
    terms: T(-10, 60, 0.02, 1, 1, 1.2),
  },
  {
    id: 'sailmaker.4',
    name: 'Pell & Rowe Sails',
    trade: 'sailmaker',
    balance: 200,
    terms: T(10, 10, 0.01, 1, 1, 1),
  },
  {
    id: 'hydraulics.0',
    name: 'Quickline Hydraulics',
    trade: 'hydraulics',
    balance: 300,
    terms: T(30, -40, 0, 1, 1, 1),
  },
  {
    id: 'hydraulics.1',
    name: 'Tarbrook Actuation',
    trade: 'hydraulics',
    balance: 260,
    terms: T(0, 0, 0.06, 1.3, 1, 1),
  },
  {
    id: 'hydraulics.2',
    name: 'Dockside Fluid Power',
    trade: 'hydraulics',
    balance: 80,
    terms: T(0, 0, 0, 1, 0.8, 0.8),
  },
  {
    id: 'hydraulics.3',
    name: 'Kestrel Motion Control',
    trade: 'hydraulics',
    balance: 600,
    terms: T(-10, 60, 0.02, 1, 1, 1.2),
  },
  {
    id: 'hydraulics.4',
    name: 'Moorgate Systems',
    trade: 'hydraulics',
    balance: 200,
    terms: T(10, 10, 0.01, 1, 1, 1),
  },
];

const BY_ID: ReadonlyMap<string, Supplier> = new Map(
  SUPPLIERS.map((x) => [x.id, x])
);
export const supplier = (id: string | null): Supplier | null =>
  id === null ? null : (BY_ID.get(id) ?? null);

const EVEN: Terms = T(0, 0, 0, 1, 1, 1);

/** A part type's terms for a team this season (even, with no supplier chosen). */
export const termsFor = (
  suppliers: Readonly<Record<Trade, string | null>>,
  type: PartType
): Terms => supplier(suppliers[tradeOf(type)])?.terms ?? EVEN;

/** The three cards of a trade dealt to a team for a season, by seed. */
export function supplierCards(
  seed: number,
  team: number,
  season: number,
  trade: Trade
): Supplier[] {
  const rand = seeded(
    seed ^ (season * 2654435761),
    team * 3 + TRADES.indexOf(trade)
  );
  return shuffled(
    rand,
    SUPPLIERS.filter((x) => x.trade === trade)
  ).slice(0, 3);
}

/** Whether suppliers may be chosen now: before the season's first race. */
export const supplierWindow = (s: CareerState): boolean =>
  s.round === 0 && s.race === null;

/** Whether a team may choose a supplier of a trade. */
export function supplierCheck(
  s: CareerState,
  team: number,
  trade: Trade,
  id: string
): Check {
  if (!TRADES.includes(trade)) return why('trade', 'No such trade.');
  if (!supplierWindow(s))
    return why(
      'season',
      'Suppliers are chosen in the off-season, before the first race.'
    );
  const c = s.teams[team];
  if (c.suppliers[trade] !== null)
    return why('chosen', "That trade's supplier is chosen for the season.");
  const x = supplierCards(s.seed, team, s.season, trade).find(
    (k) => k.id === id
  );
  if (!x) return why('card', "That supplier is not among this season's cards.");
  if (!canSpend(c, x.balance))
    return why(
      'balance',
      'The chairman will not let the balance fall that far.'
    );
  return null;
}

/** A state with a team's supplier chosen (checked first) and paid. */
export function chosen(
  s: CareerState,
  team: number,
  trade: Trade,
  id: string
): CareerState {
  const x = known(supplier(id));
  const c = s.teams[team];
  const teams = [...s.teams];
  teams[team] = { ...c, suppliers: { ...c.suppliers, [trade]: id } };
  return paid({ ...s, teams }, team, x.balance, {
    kind: 'supplier',
    what: x.name,
  });
}

/** How a personality weighs a supplier's terms (rivals' choice). */
const WEIGHT: Readonly<Record<Personality, Terms>> = {
  spender: T(1, 0.6, 300, -40, 30, -20),
  youthBuilder: T(0.4, 1, 300, -40, 40, -30),
  poacher: T(1, 0.3, 200, -30, 20, -60),
  engineer: T(0.6, 1.2, 300, -30, 60, -20),
  gambler: T(1.4, 0.4, 100, -20, 20, -20),
  steady: T(0.3, 0.5, 600, -80, 40, -40),
};

/** A supplier's worth to a personality, less its money at a weight. */
export function supplierWorth(personality: Personality, x: Supplier): number {
  const w = WEIGHT[personality];
  return (
    w.start * x.terms.start +
    w.max * x.terms.max +
    w.reliability * x.terms.reliability +
    w.wear * (x.terms.wear - 1) +
    w.improvement * (x.terms.improvement - 1) * 10 +
    w.cost * (x.terms.cost - 1) * 10 -
    x.balance / 20
  );
}

/** A state with the team's suppliers reset for a new season's choice (section 13 calls it at the season's end). */
export function suppliersCleared(s: CareerState): CareerState {
  return {
    ...s,
    teams: s.teams.map((c) => ({
      ...c,
      suppliers: { composites: null, sailmaker: null, hydraulics: null },
    })),
  };
}

export const SUPPLYING: Handlers = {
  ChooseSupplier: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = supplierCheck(s, me, c.trade, c.supplier);
    return no
      ? refuse(no.code, no.sentence)
      : accept(chosen(s, me, c.trade, c.supplier));
  },
};
