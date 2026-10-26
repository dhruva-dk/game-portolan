import { bytes, decode, encode, hash64, int, list, rec, type Format, type Value } from '../sim/codec.ts';
import { hash32, rngFrom, rngInt } from '../sim/math.ts';
import { FITTING_SLOT, FORM } from '../sim/tables.ts';
import { REGIONS } from '../sim/world/regions.ts';

export const LEAGUE = 30;

export const RANK = {
  winds: ['Greco', 'Levante', 'Scirocco', 'Ostro', 'Libeccio', 'Ponente', 'Maestro', 'Tramontana'],
  tier: 100,
  top: 799,
  forms: [1, 2, 4, 6],
  place: 20,
  sea: 8,
  sink: 5,
} as const;

const GULL_LEVELS = rec(['talons', int], ['wings', int], ['eye', int], ['beak', int], ['dive', int]);

const PLAYER = rec(
  ['points', int],
  ['tier', int],
  ['treasure', int],
  ['form', int],
  ['gull', GULL_LEVELS],
);

const CAPTAIN = rec(['points', int]);

export const LEARNING = { learn: 40, fade: 15, known: 500, full: 1000 } as const;

export const BINS = { loop: [10, 20, 35], raid: [1, 3], run: [30, 60], storm: [0, 20] } as const;

export const GRUDGE = { max: 3 } as const;

export const CHART = { n: 64, sketch: 15 } as const;
export const CHART_CELLS = 6 * CHART.n * CHART.n;
export const FIND_SITES = REGIONS.reduce((n, r) => n + r.finds.length, 0);
export const FITTINGS = FITTING_SLOT.length;

const HABITS = rec(
  ['breakOff', list(int, REGIONS.length)],
  ['loop', list(int, BINS.loop.length + 1)],
  ['raid', list(int, BINS.raid.length + 1)],
  ['run', list(int, BINS.run.length + 2)],
  ['storm', list(int, BINS.storm.length + 1)],
  ['fittings', list(int, FITTINGS)],
  ['loopU', int],
  ['raids', int],
  ['runAt', int],
  ['stormU', int],
);

const MIND = rec(['habits', HABITS], ['shared', int], ['sank', int], ['sunk', int], ['grudge', int]);

const CHART_STATE = rec(['seen', bytes(CHART_CELLS >> 3)], ['found', bytes(FIND_SITES)], ['named', list(rec(['match', int], ['tick', int]), REGIONS.length)]);

const CAREER = rec(
  ['seed', int],
  ['match', int],
  ['player', PLAYER],
  ['captains', list(CAPTAIN, LEAGUE)],
  ['profile', HABITS],
  ['minds', list(MIND, LEAGUE)],
  ['chart', CHART_STATE],
);

export const CAREER_FORMAT: Format<typeof CAREER> = { magic: 'PTLC', version: 2, schema: CAREER };
export type Career = Value<typeof CAREER>;
export type GullLevels = Career['player']['gull'];
export type Learned = Career['profile'];

const zeros = (n: number): number[] => new Array<number>(n).fill(0);
export const newHabits = (): Learned => ({
  breakOff: zeros(REGIONS.length), loop: zeros(BINS.loop.length + 1), raid: zeros(BINS.raid.length + 1), run: zeros(BINS.run.length + 2),
  storm: zeros(BINS.storm.length + 1), fittings: zeros(FITTINGS), loopU: 0, raids: 0, runAt: 0, stormU: 0,
});

export const encodeCareer = (c: Career): Uint8Array => encode(CAREER_FORMAT, c);
export const decodeCareer = (bytes: Uint8Array): Career => decode(CAREER_FORMAT, bytes);
export const careerHash = (c: Career): string => hash64(encodeCareer(c));
export const copyCareer = (c: Career): Career => decodeCareer(encodeCareer(c));

const SPREAD = { from: 10, step: 26, jitter: 16 };
const NEW = 0x6e657721;

export function newCareer(seed: number): Career {
  const rng = rngFrom(hash32(seed >>> 0, NEW)), order = Array.from({ length: LEAGUE }, (_, i) => i);
  for (let i = LEAGUE - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const captains = order.map(() => ({ points: 0 }));
  order.forEach((id, k) => {
    captains[id].points = SPREAD.from + k * SPREAD.step + rngInt(rng, SPREAD.jitter);
  });
  return {
    seed: seed >>> 0,
    match: 0,
    player: { points: 0, tier: 1, treasure: 0, form: FORM.pinnace, gull: { talons: 0, wings: 0, eye: 0, beak: 0, dive: 0 } },
    captains,
    profile: newHabits(),
    minds: Array.from({ length: LEAGUE }, () => ({ habits: newHabits(), shared: 0, sank: 0, sunk: 0, grudge: 0 })),
    chart: { seen: new Uint8Array(CHART_CELLS >> 3), found: new Uint8Array(FIND_SITES), named: REGIONS.map(() => ({ match: -1, tick: -1 })) },
  };
}

export const tierOf = (points: number): number => Math.min(RANK.winds.length, Math.floor(points / RANK.tier) + 1);

export const unlockedForms = (tier: number): number[] => RANK.forms.flatMap((at, form) => (at <= tier ? [form] : []));

export const clampPoints = (points: number): number => Math.max(0, Math.min(RANK.top, points));

const round = (x: number): number => (x < 0 ? -Math.floor(0.5 - x) : Math.floor(x + 0.5)) + 0;

export interface Outcome {
  readonly place: number;
  readonly claimed: number;
  readonly sank: number;
  readonly by: number;
}

export function rankDeltas(ships: readonly Outcome[]): number[] {
  const n = ships.length;
  let total = 0;
  for (const s of ships) total += s.claimed;
  return ships.map((s) => {
    const sea = total > 0 ? Math.max(-RANK.sea, Math.min(2 * RANK.sea, round((RANK.sea * (n * s.claimed - total)) / total))) : 0;
    return round((RANK.place * (n + 1 - 2 * s.place)) / (n - 1)) + sea + RANK.sink * (s.sank - (s.by >= 0 ? 1 : 0));
  });
}
