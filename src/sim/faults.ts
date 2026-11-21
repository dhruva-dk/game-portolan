// A ship's faults: what her wounds make of her handling (handling.ts
// Handling). Every ship sails by the tables' own (SPEC) till she is faulted.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import type { Crew } from './battle.ts';
import { SPEC, type Handling } from './handling.ts';

/** Her handling as she is now. */
export const fitOf = (_c: Crew | undefined): Handling => SPEC;
