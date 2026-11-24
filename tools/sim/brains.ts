// The brains the harness can sail a fleet with, by name: the game's own, and
// variants, each a few numbers changed from it (sim/brain.ts variant).
//
// Node only (tools/).

import { DEFAULT_BRAIN, variant, type Brain } from '../../src/sim/brain.ts';
/**
 * The brains by name. `default` is the game's; the rest are variants kept for
 * comparing against it (add one here to run it: `--brains default,name`).
 */
export const BRAINS: Record<string, Brain> = {
  default: DEFAULT_BRAIN,
  /** Sees further and forgets slower. */
  keen: variant({ sight: { sightMax: 360, forget: 8 } }),
  /** Feels further ahead for land, and backs off a bank sooner. */
  wary: variant({ helm: { feel: 24, stuck: 1.5 } }),
  /** Runs straight away, never for cover behind land. */
  noCover: variant({ mind: { cover: 0 } }),
  /** Sets her claim's marks anywhere open, hard by a shore too. */
  shoreBites: variant({ claimer: { room: 0 } }),
  /** Comes about at full whatever lies ahead. */
  noCramp: variant({ helm: { cramp: 9 } }),
  /** Hears no guns (hunts nothing). */
  deaf: variant({ hunting: { earshot: 0 } }),
  /** Hears guns further off, and is drawn to them from further. */
  keenEar: variant({ hunting: { earshot: 800, far: 750, near: 250 } }),
  /** Backing off at a crawl. */
  crawl: variant({ helm: { slow: 0.35 } }),
  /** The helm and purser before E3: no side given up, loot however inshore. */
  before: variant({ helm: { budge: 1e9 }, purser: { room: 0 } }),
  /** Rushes in with a loaded scatter, and stands off at twice its ring reloading (PLAN W3). */
  rushScatter: variant({
    gunnery: { rush: { ...DEFAULT_BRAIN.gunnery.rush, scatter: 2 } },
  }),
  /** Holds a repeater's fire till within 0.75 of its range (PLAN W3). */
  holdRepeater: variant({
    gunnery: { reach: { ...DEFAULT_BRAIN.gunnery.reach, repeater: 0.75 } },
  }),
  /** Both stances (PLAN W3). */
  stances: variant({
    gunnery: {
      rush: { ...DEFAULT_BRAIN.gunnery.rush, scatter: 2 },
      reach: { ...DEFAULT_BRAIN.gunnery.reach, repeater: 0.75 },
    },
  }),
};

/** The brain of this name, or an error naming those there are. */
export function brainNamed(name: string): Brain {
  const b = BRAINS[name];
  if (!b)
    throw new Error(`no brain "${name}" (${Object.keys(BRAINS).join(', ')})`);
  return b;
}
