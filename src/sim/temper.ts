import { random } from '../world/random.ts';
import { weighed } from './tables.ts';

export interface Temper {
  fight: number;
  notice: number;
  run: number;
  margin: number;
  standoff: number;
  loot: number;
  lootReach: number;
  mend: number;
  claim: number;
  skill: number;
  aggro: number;
  gunnery: number;
  helm: number;
  lookout: number;
  late?: Late;
}

interface Late {
  from: number;
  to: number;
  gunnery: number;
  helm: number;
}

type Style = Omit<
  Temper,
  'skill' | 'aggro' | 'gunnery' | 'helm' | 'lookout' | 'late'
>;

export const STYLES: readonly Style[] = [
  {
    fight: 0.8,
    notice: 200,
    run: 25,
    margin: 25,
    standoff: 0.9,
    loot: 0.4,
    lootReach: 120,
    mend: 50,
    claim: 0.35,
  },
  {
    fight: 0.3,
    notice: 110,
    run: 45,
    margin: 35,
    standoff: 1.1,
    loot: 0.5,
    lootReach: 130,
    mend: 65,
    claim: 1,
  },
  {
    fight: 0.55,
    notice: 120,
    run: 35,
    margin: 25,
    standoff: 0.9,
    loot: 0.5,
    lootReach: 120,
    mend: 55,
    claim: 0.6,
  },
  {
    fight: 0.35,
    notice: 85,
    run: 30,
    margin: 45,
    standoff: 1.25,
    loot: 0.6,
    lootReach: 110,
    mend: 70,
    claim: 0.8,
  },
  {
    fight: 0.3,
    notice: 60,
    run: 30,
    margin: 30,
    standoff: 1.15,
    loot: 0.75,
    lootReach: 140,
    mend: 60,
    claim: 0.5,
  },
  {
    fight: 1,
    notice: 220,
    run: 32,
    margin: 15,
    standoff: 0.7,
    loot: 0.6,
    lootReach: 90,
    mend: 60,
    claim: 0.2,
  },
];

const SKILL: readonly (readonly [number, number])[] = [
  [0.55, 1],
  [0.35, 0.9],
  [0.2, 0.75],
  [0.3, 0.85],
  [0.15, 0.7],
  [0.55, 1],
];

export function temper(
  seed: number,
  styles: readonly Style[] = STYLES,
  weights: readonly number[] = styles.map(() => 1)
): Temper & { style: number } {
  const u = random(seed ^ 0x51a7e);
  const style = weighed(weights, u()),
    t = styles[style],
    [lo, hi] = SKILL[style] ?? SKILL[1];
  const drawn = {
    style,
    fight: Math.min(1, Math.max(0, t.fight + 0.2 * (u() - 0.5))),
    notice: t.notice * (0.85 + 0.3 * u()),
    run: t.run * (0.8 + 0.4 * u()),
    margin: t.margin * (0.8 + 0.4 * u()),
    standoff: t.standoff * (0.9 + 0.2 * u()),
    loot: t.loot,
    lootReach: t.lootReach,
    mend: t.mend,
    claim: t.claim,
    skill: lo + (hi - lo) * u(),
    aggro: 0.2 + 0.8 * u(),
  };
  const { skill } = drawn;
  return { ...drawn, gunnery: skill, helm: skill, lookout: skill };
}

export function tempered(t: Temper, seconds: number): Temper {
  const l = t.late;
  if (!l || seconds <= l.from) return t;
  const f = Math.min(1, (seconds - l.from) / (l.to - l.from));
  return {
    ...t,
    gunnery: t.gunnery + (l.gunnery - t.gunnery) * f,
    helm: t.helm + (l.helm - t.helm) * f,
  };
}
