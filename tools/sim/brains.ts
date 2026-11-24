import { DEFAULT_BRAIN, variant, type Brain } from '../../src/sim/brain.ts';
export const BRAINS: Record<string, Brain> = {
  default: DEFAULT_BRAIN,
  keen: variant({ sight: { sightMax: 360, forget: 8 } }),
  wary: variant({ helm: { feel: 24, stuck: 1.5 } }),
  noCover: variant({ mind: { cover: 0 } }),
  shoreBites: variant({ claimer: { room: 0 } }),
  noCramp: variant({ helm: { cramp: 9 } }),
  deaf: variant({ hunting: { earshot: 0 } }),
  keenEar: variant({ hunting: { earshot: 800, far: 750, near: 250 } }),
  crawl: variant({ helm: { slow: 0.35 } }),
  before: variant({ helm: { budge: 1e9 }, purser: { room: 0 } }),
  rushScatter: variant({
    gunnery: { rush: { ...DEFAULT_BRAIN.gunnery.rush, scatter: 2 } },
  }),
  holdRepeater: variant({
    gunnery: { reach: { ...DEFAULT_BRAIN.gunnery.reach, repeater: 0.75 } },
  }),
  stances: variant({
    gunnery: {
      rush: { ...DEFAULT_BRAIN.gunnery.rush, scatter: 2 },
      reach: { ...DEFAULT_BRAIN.gunnery.reach, repeater: 0.75 },
    },
  }),
};

export function brainNamed(name: string): Brain {
  const b = BRAINS[name];
  if (!b)
    throw new Error(`no brain "${name}" (${Object.keys(BRAINS).join(', ')})`);
  return b;
}
