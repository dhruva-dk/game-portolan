// What every command handler is: a pure function of the state, the command and the dice, returning the new state or
// a typed refusal (Phase B section 1). Each section's module exports a table of handlers by command kind;
// career/career.ts joins them. A rule a screen needs (is this allowed, what does it cost) is a pure function beside
// its handler, which the handler and the view models both call.

import type { CommandKind, CommandOf, Refusal } from '../office.ts';
import type { Dice } from './dice.ts';
import type { CareerState } from './state.ts';

export type Applied =
  | { ok: true; state: CareerState }
  | { ok: false; reason: Refusal };

export type Handler<K extends CommandKind> = (
  s: CareerState,
  command: CommandOf<K>,
  roll: Dice
) => Applied;

/** A section's handlers, by the kinds it takes. */
export type Handlers = { readonly [K in CommandKind]?: Handler<K> };

/** A refusal. */
export const refuse = (code: string, sentence: string): Applied => ({
  ok: false,
  reason: { code, sentence },
});

/** An accepted command's new state. */
export const accept = (state: CareerState): Applied => ({ ok: true, state });

/** A check: null if it holds, else the refusal. Rules return these so screens can show why before the player taps. */
export type Check = Refusal | null;
export const why = (code: string, sentence: string): Refusal => ({
  code,
  sentence,
});

/** Whether a number is a whole number in lo..hi. */
export const whole = (x: unknown, lo: number, hi: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
