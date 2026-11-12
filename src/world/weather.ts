// The weather: the wind's speed, the cloud cover and the haze, drifting slowly over a match about their means.
//
// Each is its mean plus a sum of slow swells, each a sine of its own period (TERMS of them, between SHORTEST and
// LONGEST) and phase drawn from the match's seed. Their weights sum to one, so a value never strays further from its
// mean than its SWING; it takes minutes to cross its range, and nothing in it is an event, nor knows where anyone is.
// It is a function of the seed and the match's clock alone, so every player sees the same sky at the same moment.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { random } from './random.ts';

/** What drifts: the wind's speed over the sea (m/s), the cloud cover (0–1), the aerosol (a multiple of a clear day's). */
export interface Weather { wind: number; cloud: number; haze: number }

/**
 * The means a match's weather drifts about. The haze is a hazy trade-wind day's: an aerosol column of 0.13 (clear
 * maritime air is 0.05–0.1, a tropical marine one up to 0.2), enough to pale the horizon while the zenith stays blue;
 * past twice a clear day's the whole sky greys before the band at the horizon grows (both are the one column).
 */
export const MEAN: Weather = { wind: 7.6, cloud: 0.37, haze: 1.6 };
/** How far each strays from its mean at most: the wind and the cover by so much, the haze by so much of itself. */
export const SWING: Weather = { wind: 1.6, cloud: 0.12, haze: 0.25 };
/** The swells in each, and the shortest and longest of their periods, seconds. */
const TERMS = 3, SHORTEST = 360, LONGEST = 1200;

/** A seeded sum of slow sines in −1…1 for each quantity. */
function swells(seed: number) {
  const rand = random(seed * 7919 + 17);
  const draw = () => {
    const weights = Array.from({ length: TERMS }, () => 0.5 + rand());
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => ({
      weight: w / sum,
      rate: (2 * Math.PI) / (SHORTEST + (LONGEST - SHORTEST) * rand()),
      phase: 2 * Math.PI * rand(),
    }));
  };
  const terms = { wind: draw(), cloud: draw(), haze: draw() };
  const at = (k: keyof Weather, t: number) => terms[k].reduce((s, w) => s + w.weight * Math.sin(w.rate * t + w.phase), 0);
  return at;
}

/**
 * The match's weather: weather(seconds) at that time on its clock, about `mean`; a quantity whose `swing` is 0 holds
 * at its mean (a debug pin).
 */
export function createWeather(seed: number, mean: Weather = MEAN, swing: Weather = SWING) {
  const at = swells(seed);
  return (seconds: number): Weather => ({
    wind: mean.wind + swing.wind * at('wind', seconds),
    cloud: Math.min(Math.max(mean.cloud + swing.cloud * at('cloud', seconds), 0), 1),
    haze: mean.haze * (1 + swing.haze * at('haze', seconds)),
  });
}
