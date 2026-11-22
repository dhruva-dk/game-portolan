// Suppliers (Phase B section 8.7, D18): in the off-season each crew chooses one each of timber (hull, keel), canvas
// (sails, rigging) and cordage (rudder, mounts) from three cards a trade, dealt by seed from this table. Each gives a
// trade-off for its parts for the season, and costs Coin once. The window is the off-season up to the season's first
// race (the founding included). Rivals choose by personality (career/works.ts).

import type { PartType } from '../race.ts';
import type { Personality, Trade } from '../office.ts';
import { canSpend, paid } from './coin.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { seeded, shuffled } from './dice.ts';
import { mine } from './post.ts';
import type { CareerState } from './state.ts';

/** What a supplier's goods do to its parts for the season: performance at a design's start and its maximum (added),
 *  reliability (added), condition lost a race (×), the yard's points on them (×), and a design's cost (×). */
export interface Terms {
  start: number;
  max: number;
  reliability: number;
  wear: number;
  yard: number;
  cost: number;
}

export interface Supplier {
  id: string;
  name: string;
  trade: Trade;
  coin: number;
  terms: Terms;
}

export const TRADES: readonly Trade[] = ['timber', 'canvas', 'cordage'];

/** The part types each trade supplies. */
export const SUPPLIES: Readonly<Record<Trade, readonly PartType[]>> = {
  timber: ['hull', 'keel'],
  canvas: ['sails', 'rigging'],
  cordage: ['rudder', 'mounts'],
};

/** A part type's trade. */
export const tradeOf = (type: PartType): Trade =>
  TRADES.find((t) => SUPPLIES[t].includes(type)) ?? 'timber';

const T = (
  start: number,
  max: number,
  reliability: number,
  wear: number,
  yard: number,
  cost: number
): Terms => ({ start, max, reliability, wear, yard, cost });

/** Five a trade: a fast starter that tops out lower, a sound one that wears faster, a cheap and slow one, a dear one
 *  with headroom, and an even one. */
export const SUPPLIERS: readonly Supplier[] = [
  {
    id: 'timber.0',
    name: 'Halloway Sawmills',
    trade: 'timber',
    coin: 300,
    terms: T(30, -40, 0, 1, 1, 1),
  },
  {
    id: 'timber.1',
    name: 'Greyoak & Daughters',
    trade: 'timber',
    coin: 260,
    terms: T(0, 0, 0.06, 1.3, 1, 1),
  },
  {
    id: 'timber.2',
    name: 'Bracken Yard Seconds',
    trade: 'timber',
    coin: 80,
    terms: T(0, 0, 0, 1, 0.8, 0.8),
  },
  {
    id: 'timber.3',
    name: 'Ironwood Consolidated',
    trade: 'timber',
    coin: 600,
    terms: T(-10, 60, 0.02, 1, 1, 1.2),
  },
  {
    id: 'timber.4',
    name: 'Fenwick Timber Co.',
    trade: 'timber',
    coin: 200,
    terms: T(10, 10, 0.01, 1, 1, 1),
  },
  {
    id: 'canvas.0',
    name: 'Saltmarsh Weavers',
    trade: 'canvas',
    coin: 300,
    terms: T(30, -40, 0, 1, 1, 1),
  },
  {
    id: 'canvas.1',
    name: 'Lindqvist Duck Cloth',
    trade: 'canvas',
    coin: 260,
    terms: T(0, 0, 0.06, 1.3, 1, 1),
  },
  {
    id: 'canvas.2',
    name: 'Harbour Remnants',
    trade: 'canvas',
    coin: 80,
    terms: T(0, 0, 0, 1, 0.8, 0.8),
  },
  {
    id: 'canvas.3',
    name: 'Albatross Laminates',
    trade: 'canvas',
    coin: 600,
    terms: T(-10, 60, 0.02, 1, 1, 1.2),
  },
  {
    id: 'canvas.4',
    name: 'Pell & Rowe Sailcloth',
    trade: 'canvas',
    coin: 200,
    terms: T(10, 10, 0.01, 1, 1, 1),
  },
  {
    id: 'cordage.0',
    name: 'Quickline Ropeworks',
    trade: 'cordage',
    coin: 300,
    terms: T(30, -40, 0, 1, 1, 1),
  },
  {
    id: 'cordage.1',
    name: 'Tarbrook Hawsers',
    trade: 'cordage',
    coin: 260,
    terms: T(0, 0, 0.06, 1.3, 1, 1),
  },
  {
    id: 'cordage.2',
    name: 'Dockside Cordage',
    trade: 'cordage',
    coin: 80,
    terms: T(0, 0, 0, 1, 0.8, 0.8),
  },
  {
    id: 'cordage.3',
    name: 'Kestrel Braided Lines',
    trade: 'cordage',
    coin: 600,
    terms: T(-10, 60, 0.02, 1, 1, 1.2),
  },
  {
    id: 'cordage.4',
    name: 'Moorgate Chandlers',
    trade: 'cordage',
    coin: 200,
    terms: T(10, 10, 0.01, 1, 1, 1),
  },
];

const BY_ID: ReadonlyMap<string, Supplier> = new Map(
  SUPPLIERS.map((x) => [x.id, x])
);
export const supplier = (id: string | null): Supplier | null =>
  id === null ? null : (BY_ID.get(id) ?? null);

const EVEN: Terms = T(0, 0, 0, 1, 1, 1);

/** A part type's terms for a crew this season (even, with no supplier chosen). */
export const termsFor = (
  suppliers: Readonly<Record<Trade, string | null>>,
  type: PartType
): Terms => supplier(suppliers[tradeOf(type)])?.terms ?? EVEN;

/** The three cards of a trade dealt to a crew for a season, by seed. */
export function supplierCards(
  seed: number,
  crew: number,
  season: number,
  trade: Trade
): Supplier[] {
  const rand = seeded(
    seed ^ (season * 2654435761),
    crew * 3 + TRADES.indexOf(trade)
  );
  return shuffled(
    rand,
    SUPPLIERS.filter((x) => x.trade === trade)
  ).slice(0, 3);
}

/** Whether suppliers may be chosen now: before the season's first race. */
export const supplierWindow = (s: CareerState): boolean =>
  s.round === 0 && s.race === null;

/** Whether a crew may choose a supplier of a trade. */
export function supplierCheck(
  s: CareerState,
  crew: number,
  trade: Trade,
  id: string
): Check {
  if (!TRADES.includes(trade)) return why('trade', 'No such trade.');
  if (!supplierWindow(s))
    return why(
      'season',
      'Suppliers are chosen in the off-season, before the first race.'
    );
  const c = s.crews[crew];
  if (c.suppliers[trade] !== null)
    return why('chosen', "That trade's supplier is chosen for the season.");
  const x = supplierCards(s.seed, crew, s.season, trade).find(
    (k) => k.id === id
  );
  if (!x) return why('card', "That supplier is not among this season's cards.");
  if (!canSpend(c, x.coin))
    return why('coin', 'The elder will not let the coin fall that far.');
  return null;
}

/** A state with a crew's supplier chosen (checked first) and paid. */
export function chosen(
  s: CareerState,
  crew: number,
  trade: Trade,
  id: string
): CareerState {
  const x = supplier(id)!;
  const c = s.crews[crew];
  const crews = [...s.crews];
  crews[crew] = { ...c, suppliers: { ...c.suppliers, [trade]: id } };
  return paid({ ...s, crews }, crew, x.coin, {
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

/** A supplier's worth to a personality, less its Coin at a weight. */
export function supplierWorth(personality: Personality, x: Supplier): number {
  const w = WEIGHT[personality];
  return (
    w.start * x.terms.start +
    w.max * x.terms.max +
    w.reliability * x.terms.reliability +
    w.wear * (x.terms.wear - 1) +
    w.yard * (x.terms.yard - 1) * 10 +
    w.cost * (x.terms.cost - 1) * 10 -
    x.coin / 20
  );
}

/** A state with the crew's suppliers reset for a new season's choice (section 13 calls it at the season's end). */
export function suppliersCleared(s: CareerState): CareerState {
  return {
    ...s,
    crews: s.crews.map((c) => ({
      ...c,
      suppliers: { timber: null, canvas: null, cordage: null },
    })),
  };
}

export const SUPPLYING: Handlers = {
  ChooseSupplier: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no crew: take one of the posts offered.'
      );
    const no = supplierCheck(s, me, c.trade, c.supplier);
    return no
      ? refuse(no.code, no.sentence)
      : accept(chosen(s, me, c.trade, c.supplier));
  },
};
