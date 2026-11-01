// How each of the 16 regions sounds: its bed, the life the mixer scatters over it, the acoustic space it lends to
// gunfire (the Narrows' walls throw every shot back), and how loud the open sea, the wind and the night insects are
// there. Each one follows its portrait's "Sound" line in PLAN.md.
import type { RegionId } from '../sim/world/index.ts';
import type { SoundName } from './bank.ts';

export interface Life {
  sound: SoundName;
  /** Mean seconds between calls while you are deep in the region. */
  every: number;
  /** How far from the listener, in metres. */
  dist: readonly [number, number];
  /** Height above the sea, in metres. */
  height?: number;
  /** Only by day (birds) or only by night. */
  when?: 'day' | 'night';
  gain?: number;
}

export interface RegionSound {
  bed: SoundName;
  gain: number;
  life: readonly Life[];
  /** The hall and the echo on gunfire, and how long the echo takes to come back. */
  reverb: number;
  echo: number;
  echoTime: number;
  /** Scales on the shared beds: the open sea, the wind, and insects ashore at night. */
  sea: number;
  wind: number;
  night: number;
}

const gulls: Life = { sound: 'gullCall', every: 16, dist: [40, 150], height: 15, when: 'day' };
const terns: Life = { sound: 'tern', every: 12, dist: [30, 120], height: 8, when: 'day' };

export const REGION_SOUND: Record<RegionId, RegionSound> = {
  iceCrown: {
    bed: 'bedIceCrown', gain: 0.8, reverb: 0.15, echo: 0, echoTime: 0.3, sea: 0.55, wind: 1.2, night: 0,
    life: [
      { sound: 'iceCreak', every: 6, dist: [15, 70] },
      { sound: 'floeKnock', every: 4, dist: [8, 35] },
      { sound: 'iceBoom', every: 22, dist: [150, 450] },
    ],
  },
  fjords: {
    bed: 'bedFjords', gain: 0.9, reverb: 0.3, echo: 0.22, echoTime: 0.6, sea: 0.7, wind: 0.8, night: 0.15,
    life: [{ sound: 'stoneTrickle', every: 18, dist: [60, 200], height: 30 }, gulls],
  },
  mistwood: {
    bed: 'bedMistwood', gain: 1, reverb: 0.25, echo: 0.04, echoTime: 0.25, sea: 0.35, wind: 0.3, night: 0.2,
    life: [
      { sound: 'drip', every: 2.5, dist: [3, 15], height: 6 },
      { sound: 'woodCreakFar', every: 9, dist: [40, 120], height: 20 },
      { sound: 'plop', every: 14, dist: [10, 40] },
    ],
  },
  spires: {
    bed: 'bedSpires', gain: 0.85, reverb: 0.2, echo: 0.12, echoTime: 0.45, sea: 0.9, wind: 1.1, night: 0.1,
    life: [{ ...gulls, every: 6 }, { sound: 'gullKek', every: 9, dist: [20, 80], height: 25, when: 'day' }],
  },
  narrows: {
    bed: 'bedNarrows', gain: 1, reverb: 0.35, echo: 0.45, echoTime: 0.42, sea: 0.5, wind: 0.4, night: 0.2,
    life: [{ sound: 'stoneTrickle', every: 10, dist: [30, 120], height: 25 }, { sound: 'drip', every: 8, dist: [10, 40], height: 10 }],
  },
  basaltStacks: {
    bed: 'bedBasaltStacks', gain: 0.85, reverb: 0.2, echo: 0.1, echoTime: 0.3, sea: 1.1, wind: 1.1, night: 0.1,
    life: [{ sound: 'caveBoom', every: 7, dist: [40, 150] }, gulls],
  },
  kelpShallows: {
    bed: 'bedKelpShallows', gain: 1, reverb: 0.08, echo: 0, echoTime: 0.3, sea: 0.6, wind: 0.8, night: 0.15,
    life: [{ sound: 'kelpBrush', every: 3, dist: [3, 12] }, terns, { ...gulls, every: 20 }],
  },
  blossomRun: {
    bed: 'bedBlossomRun', gain: 0.9, reverb: 0.1, echo: 0, echoTime: 0.3, sea: 0.6, wind: 0.8, night: 0.6,
    life: [{ sound: 'songbird', every: 4, dist: [20, 80], height: 10, when: 'day' }, { sound: 'petalGust', every: 12, dist: [5, 30], height: 4 }],
  },
  glassSea: {
    bed: 'bedGlassSea', gain: 1, reverb: 0.05, echo: 0, echoTime: 0.3, sea: 0.25, wind: 0.4, night: 0.05,
    life: [{ sound: 'whaleBreath', every: 30, dist: [150, 500], gain: 0.8 }, { sound: 'whaleSong', every: 45, dist: [200, 600] }],
  },
  jadeShoals: {
    bed: 'bedJadeShoals', gain: 1, reverb: 0.05, echo: 0, echoTime: 0.3, sea: 0.6, wind: 0.9, night: 0.3,
    life: [{ sound: 'sandGust', every: 10, dist: [10, 50], height: 3 }, { ...terns, every: 14 }],
  },
  coralAtolls: {
    bed: 'bedCoralAtolls', gain: 0.9, reverb: 0.06, echo: 0, echoTime: 0.3, sea: 0.8, wind: 0.8, night: 0.4,
    life: [{ sound: 'reefBreaker', every: 8, dist: [60, 200] }, { sound: 'palmRustle', every: 7, dist: [15, 60], height: 8 }, { ...terns, every: 18 }],
  },
  spiceIsles: {
    bed: 'bedSpiceIsles', gain: 1, reverb: 0.15, echo: 0, echoTime: 0.3, sea: 0.6, wind: 0.6, night: 0.6,
    life: [{ sound: 'jungleBird', every: 3.5, dist: [30, 120], height: 15, when: 'day' }, { sound: 'frogCroak', every: 6, dist: [20, 80], when: 'night' }],
  },
  fireArchipelago: {
    bed: 'bedFireArchipelago', gain: 1, reverb: 0.15, echo: 0.05, echoTime: 0.35, sea: 0.7, wind: 0.7, night: 0,
    life: [
      { sound: 'rockCrack', every: 5, dist: [20, 80] },
      { sound: 'steamVent', every: 9, dist: [20, 90] },
      { sound: 'lavaBloop', every: 5, dist: [10, 50] },
    ],
  },
  weepingIsle: {
    bed: 'bedWeepingIsle', gain: 0.9, reverb: 0.25, echo: 0.08, echoTime: 0.35, sea: 0.7, wind: 0.6, night: 0.3,
    life: [{ sound: 'fallSplash', every: 6, dist: [15, 60], height: 5 }, { sound: 'drip', every: 3, dist: [3, 15], height: 6 }],
  },
  mangroveLabyrinth: {
    bed: 'bedMangroveLabyrinth', gain: 1, reverb: 0.2, echo: 0.03, echoTime: 0.12, sea: 0.3, wind: 0.3, night: 0.6,
    life: [
      { sound: 'frogCroak', every: 2.5, dist: [10, 50] },
      { sound: 'rootCreak', every: 9, dist: [8, 30], height: 3 },
      { sound: 'drip', every: 3, dist: [3, 12], height: 5 },
      { sound: 'plop', every: 8, dist: [5, 25] },
    ],
  },
  maelstrom: {
    bed: 'bedMaelstrom', gain: 0.8, reverb: 0.2, echo: 0.05, echoTime: 0.5, sea: 1.3, wind: 1.2, night: 0,
    life: [{ sound: 'vortexCrash', every: 6, dist: [50, 200] }],
  },
};

export const REGION_IDS = Object.keys(REGION_SOUND) as RegionId[];
export type { RegionId };
