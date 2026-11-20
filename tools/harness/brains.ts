// The brains the harness can sail a fleet with, by name: the game's own, and
// variants, each a few numbers changed from it. A variant is written as only
// what it changes (`Over`), and made whole by `variant`, every slice and key in
// the default's order (one shape for every brain, so the hot loops stay as
// fast with a variant as without and the harness's timings are honest).
//
// Node only (tools/).

import { DEFAULT_BRAIN, type Brain } from '../../src/sim/brain.ts';

/** The slices of a brain that are tables of numbers (the styles are a list). */
type Table = Exclude<keyof Brain, 'styles'>;

/**
 * What a variant changes: any keys of any table, and the styles whole.
 */
export type Over = { readonly [S in Table]?: Partial<Brain[S]> } & {
  readonly styles?: Brain['styles'];
};

/** A table with `o`'s changes, every key in `b`'s order. */
function merged<T extends object>(name: string, b: T, o?: Partial<T>): T {
  if (!o) return b;
  for (const k of Object.keys(o))
    if (!(k in b)) throw new Error(`brain has no ${name}.${k}`);
  const out = { ...b };
  for (const k of Object.keys(b) as (keyof T)[]) {
    const v = o[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** A whole brain: the default with `over`'s changes, keys in the default's order. */
export function variant(over: Over, base: Brain = DEFAULT_BRAIN): Brain {
  return {
    sight: merged('sight', base.sight, over.sight),
    mind: merged('mind', base.mind, over.mind),
    roaming: merged('roaming', base.roaming, over.roaming),
    storming: merged('storming', base.storming, over.storming),
    ramming: merged('ramming', base.ramming, over.ramming),
    helm: merged('helm', base.helm, over.helm),
    purser: merged('purser', base.purser, over.purser),
    claimer: merged('claimer', base.claimer, over.claimer),
    styles: over.styles ?? base.styles,
  };
}

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
  /** Backing off at a crawl. */
  crawl: variant({ helm: { slow: 0.35 } }),
  /** The helm and purser before E3: no side given up, loot however inshore. */
  before: variant({ helm: { budge: 1e9 }, purser: { room: 0 } }),
};

/** The brain of this name, or an error naming those there are. */
export function brainNamed(name: string): Brain {
  const b = BRAINS[name];
  if (!b)
    throw new Error(`no brain "${name}" (${Object.keys(BRAINS).join(', ')})`);
  return b;
}
