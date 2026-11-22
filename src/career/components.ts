// The components a design is made of (Phase B section 8.2, D11): six part types × three tiers × three components, as
// data. Each has a name, a type, a tier, and its effects on the design: performance and its maximum, reliability and
// its maximum, days to design and to build, risk, and Coin. Tiers 2 and 3 of sails, rigging and keel are unlocked by
// the test tank's level; of rudder, hull and mounts by the foundry's. Every tier has a grey component: risk for a
// large gain. A shipwright knows some of them (dealt by seed from tiers 1 and 2) and may learn more (Innovation).

import type { PartType } from '../race.ts';
import type { Building } from '../office.ts';
import { shuffled, type Rand } from './dice.ts';
import { componentsKnown } from './staff.ts';

/** What a component does to a design. Any effect it lacks is 0. */
export interface Effects {
  perf: number;
  perfMax: number;
  reliability: number;
  reliabilityMax: number;
  designDays: number;
  buildDays: number;
  risk: number;
  coin: number;
}

export interface Component {
  id: string;
  name: string;
  type: PartType;
  tier: 1 | 2 | 3;
  effects: Effects;
}

const NONE: Effects = {
  perf: 0,
  perfMax: 0,
  reliability: 0,
  reliabilityMax: 0,
  designDays: 0,
  buildDays: 0,
  risk: 0,
  coin: 0,
};

/** The three kinds every tier has, each tier's numbers × the tier's scale: a steady gain, a sound one (reliability),
 *  and a grey one (risk for a large gain). One type in two trades days for the steady gain's Coin. */
const KINDS: readonly Partial<Effects>[] = [
  { perf: 22, perfMax: 30, coin: 40, designDays: 1 },
  { perf: 6, reliability: 0.05, reliabilityMax: 0.04, coin: 50 },
  {
    perf: 45,
    perfMax: 60,
    reliability: -0.03,
    risk: 0.08,
    coin: 30,
    buildDays: 1,
  },
];
const QUICK: Partial<Effects> = {
  perf: 14,
  perfMax: 22,
  coin: 70,
  designDays: -2,
  buildDays: -1,
};
const SCALE = [1, 1.8, 2.8] as const;

/** Each type's components' names, tier by tier, in KINDS' order. */
const NAMES: Readonly<
  Record<PartType, readonly (readonly [string, string, string])[]>
> = {
  sails: [
    ['Flax Canvas', 'Double-Stitched Luff', 'Cut-Down Leech'],
    ['Glass-Fibre Battens', 'Bonded Seams', 'Paper-Thin Laminate'],
    ['Wind-Tunnel Cut', 'Kevlar Clew Patches', 'Membrane Mainsail'],
  ],
  rigging: [
    ['Tarred Hemp', 'Doubled Shrouds', 'Shaved Blocks'],
    ['Steel Wire Stays', 'Swaged Terminals', 'Hollow Spars'],
    ['Rod Rigging', 'Titanium Chainplates', 'Carbon Mast'],
  ],
  rudder: [
    ['Oak Blade', 'Bronze Pintles', 'Thinned Trailing Edge'],
    ['Balanced Rudder', 'Sealed Gudgeons', 'Spade Rudder'],
    ['Foil-Section Blade', 'Self-Aligning Bearings', 'Twin Rudders'],
  ],
  hull: [
    ['Clinker Planking', 'Doubled Frames', 'Lightened Garboards'],
    ['Carvel Planking', 'Copper Sheathing', 'Cold-Moulded Skin'],
    ['Glued Strip Planking', 'Iron Knees', 'Hollow-Keel Hull'],
  ],
  keel: [
    ['Iron Ballast', 'Bolted Keelson', 'Shifting Ballast'],
    ['Lead Bulb', 'Through-Bolts', 'Fin Keel'],
    ['Winged Keel', 'Forged Keel Bolts', 'Canting Keel'],
  ],
  mounts: [
    ['Oak Carriages', 'Breeching Ropes', 'Lightened Trucks'],
    ['Iron Slides', 'Recoil Springs', 'Swivel Mounts'],
    ['Hydraulic Buffers', 'Gimballed Cradles', 'Pivot Rails'],
  ],
};

export const TYPES: readonly PartType[] = [
  'sails',
  'rigging',
  'rudder',
  'hull',
  'keel',
  'mounts',
];

/** The building whose level unlocks a type's tiers. */
export const UNLOCKS: Readonly<Record<PartType, Building>> = {
  sails: 'testTank',
  rigging: 'testTank',
  keel: 'testTank',
  rudder: 'foundry',
  hull: 'foundry',
  mounts: 'foundry',
};

const scaled = (e: Partial<Effects>, k: number): Effects => {
  const out: Effects = { ...NONE };
  for (const key of Object.keys(e) as (keyof Effects)[]) {
    const v = (e[key] ?? 0) * k;
    out[key] =
      key === 'designDays' || key === 'buildDays'
        ? Math.round(e[key] ?? 0)
        : Math.round(v * 1000) / 1000;
  }
  return out;
};

/** Every component, in type, tier and kind order. */
export const COMPONENTS: readonly Component[] = TYPES.flatMap((type, ti) =>
  NAMES[type].flatMap((names, t) =>
    names.map((name, k): Component => {
      const kind = k === 0 && ti % 2 === 1 ? QUICK : KINDS[k];
      return {
        id: `${type}.${t + 1}.${k}`,
        name,
        type,
        tier: (t + 1) as 1 | 2 | 3,
        effects: scaled(kind, SCALE[t]),
      };
    })
  )
);

const BY_ID: ReadonlyMap<string, Component> = new Map(
  COMPONENTS.map((c) => [c.id, c])
);

/** A component by id, or null. */
export const component = (id: string): Component | null =>
  BY_ID.get(id) ?? null;

/** The highest tier of a type a crew's buildings unlock (its test tank's or foundry's level). */
export const tierOpen = (
  buildings: Readonly<Record<Building, { level: number }>>,
  type: PartType
): number => buildings[UNLOCKS[type]].level;

/** The sum of some components' effects. */
export function summed(ids: readonly string[]): Effects {
  const out: Effects = { ...NONE };
  for (const id of ids) {
    const c = component(id);
    if (!c) continue;
    for (const k of Object.keys(out) as (keyof Effects)[])
      out[k] += c.effects[k];
  }
  return out;
}

/** The components a new shipwright of so many stars knows: `3 + round(stars)`, dealt by seed from tiers 1 and 2. */
export function dealtKnown(rand: Rand, stars: number): string[] {
  const pool = COMPONENTS.filter((c) => c.tier <= 2).map((c) => c.id);
  return shuffled(rand, pool).slice(0, componentsKnown(stars)).sort();
}

/** The components a shipwright does not know of the tiers a crew's buildings unlock, in id order. */
export const unknownOpen = (
  known: readonly string[],
  buildings: Readonly<Record<Building, { level: number }>>
): string[] =>
  COMPONENTS.filter(
    (c) => !known.includes(c.id) && c.tier <= tierOpen(buildings, c.type)
  ).map((c) => c.id);
