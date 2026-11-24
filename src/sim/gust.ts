import { GUST_METER } from './tuning.ts';

export interface Gust {
  meter: number;
  on: boolean;
}

export const gustOf = (capacity: number): Gust => ({
  meter: capacity,
  on: false,
});

export const startable = (g: Gust, capacity: number) =>
  g.meter >= GUST_METER.least * capacity;

export function toggled(g: Gust, capacity: number): Gust {
  if (g.on) return { ...g, on: false };
  return startable(g, capacity) ? { ...g, on: true } : g;
}

export function stepGust(g: Gust, capacity: number, dt: number): Gust {
  if (g.on) {
    const meter = g.meter - GUST_METER.drain * dt;
    return meter > 1e-9 ? { meter, on: true } : { meter: 0, on: false };
  }
  if (g.meter >= capacity) return g;
  return {
    meter: Math.min(
      capacity,
      g.meter + GUST_METER.refill * GUST_METER.drain * dt
    ),
    on: false,
  };
}

export const charged = (g: Gust, capacity: number) => g.meter / capacity;
