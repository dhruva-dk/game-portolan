import { hash, random } from './random.ts';

export interface Weather {
  wind: number;
  cloud: number;
  haze: number;
}

export const MEAN: Weather = { wind: 7.6, cloud: 0.37, haze: 1.6 };
export const SWING: Weather = { wind: 1.6, cloud: 0.12, haze: 0.25 };
const TERMS = 3,
  SHORTEST = 360,
  LONGEST = 1200;

function swells(seed: number) {
  const rand = random(hash(seed, 0x77656174));
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
  const at = (k: keyof Weather, t: number) => {
    let s = 0;
    for (const w of terms[k]) s += w.weight * Math.sin(w.rate * t + w.phase);
    return s;
  };
  return at;
}

export function createWeather(
  seed: number,
  mean: Weather = MEAN,
  swing: Weather = SWING
) {
  const at = swells(seed);
  return (
    seconds: number,
    out: Weather = { wind: 0, cloud: 0, haze: 0 }
  ): Weather => {
    out.wind = mean.wind + swing.wind * at('wind', seconds);
    out.cloud = Math.min(
      Math.max(mean.cloud + swing.cloud * at('cloud', seconds), 0),
      1
    );
    out.haze = mean.haze * (1 + swing.haze * at('haze', seconds));
    return out;
  };
}
