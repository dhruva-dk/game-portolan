import type { Sponsor, Team } from '../state.ts';

type Slots = Team['sponsors'];

const perSlot = (f: (slot: number) => Sponsor | null): Slots => [
  f(0),
  f(1),
  f(2),
];

export const mapSlots = (
  slots: Slots,
  f: (sponsor: Sponsor | null) => Sponsor | null
): Slots => perSlot((slot) => f(slots[slot]));

export const fillSlot = (slots: Slots, slot: number, sponsor: Sponsor): Slots =>
  perSlot((i) => (i === slot ? sponsor : slots[i]));

export const slotsOf = (sponsors: readonly Sponsor[]): Slots =>
  perSlot((slot) => sponsors.at(slot) ?? null);

export const signed = (slots: Slots): Sponsor[] =>
  slots.filter((sponsor) => sponsor !== null);
