// Tables of numbers the game is tuned by, as a match holds them: a bot's brain
// (brain.ts) and the game's rules (rules.ts). A table is written once with the
// numbers it ships with; what
// varies it is written as only what it changes, and made whole by `merged`,
// every key in the table's own order (one shape for every table of a kind, so
// the hot loops stay as fast with a variant as without).
//
// Pure: no three, so it runs in node for the tests.

/**
 * A table as it is held: its numbers any numbers, not the ones it was written
 * with (so a variant may give others), its lists and tables alike.
 */
export type Widen<T> = T extends number
  ? number
  : T extends string
    ? string
    : { readonly [K in keyof T]: Widen<T[K]> };

/** Changes to tables of tables: any keys of any of them. */
export type Changes<T> = { readonly [S in keyof T]?: Partial<T[S]> };

/**
 * Table `b` with `o`'s changes, every key in `b`'s order (a spread keeps the
 * place of a key it overwrites); `b` itself if there are none. A key `b`
 * hasn't got, or one changed to nothing, is an error naming it.
 */
export function merged<T extends object>(
  name: string,
  b: T,
  o?: Partial<T>
): T {
  if (!o) return b;
  for (const [k, v] of Object.entries(o)) {
    if (!(k in b)) throw new Error(`${name} has no ${k}`);
    if (v === undefined) throw new Error(`${name}.${k} is changed to nothing`);
  }
  return { ...b, ...o };
}
