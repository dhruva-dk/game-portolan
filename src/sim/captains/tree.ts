// Behaviour trees: how a captain carries out what it chose. After Isla, "Handling Complexity in the Halo 2 AI"
// (GDC 2005): a behaviour is a tree whose inner nodes decide among their children and whose leaves act, so that
// choosing what to do (utility.ts) is kept apart from how to do it, and a new way of doing something is one more leaf
// rather than one more branch in a tangle of ifs. Halo 2's trees were run afresh on every think, with the children of a
// prioritised list tried in their order and the first that could run taking over from whatever ran before; these are
// too. Each think, the chosen option's tree is walked from its root:
// - a selector tries its children in order until one succeeds (the first way that works);
// - a sequence runs its children in order until one fails (every step, or none);
// - `when` guards a child with a test (Halo 2's relevancy check), and a leaf acts and says whether it could.
// A tree that fails tells the chooser that the option couldn't be carried out after all, and it takes the next best.
// Each leaf is named, and the last leaf that acted for each captain is kept for anyone watching the captains think.

export const FAIL = 0;
export const DONE = 1;
export type Status = typeof FAIL | typeof DONE;
export type Node<C> = (ctx: C) => Status;

/** The first child that succeeds. */
export const select = <C>(...kids: Node<C>[]): Node<C> => (ctx) => {
  for (const k of kids) if (k(ctx) === DONE) return DONE;
  return FAIL;
};

/** Every child in turn, stopping at the first that fails. */
export const sequence = <C>(...kids: Node<C>[]): Node<C> => (ctx) => {
  for (const k of kids) if (k(ctx) === FAIL) return FAIL;
  return DONE;
};

/** The child, when the test passes. */
export const when = <C>(test: (ctx: C) => boolean, kid: Node<C>): Node<C> => (ctx) => (test(ctx) ? kid(ctx) : FAIL);

/** What the last leaf that acted was called, by ship: for watching, never read by the sim. */
export const LEAF: string[] = [];

/** A leaf: acts, and succeeds unless it says it couldn't (returns false). */
export const leaf = <C extends { i: number }>(name: string, act: (ctx: C) => boolean | void): Node<C> => (ctx) => {
  if (act(ctx) === false) return FAIL;
  LEAF[ctx.i] = name;
  return DONE;
};
