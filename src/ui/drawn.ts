// What each piece of the UI shows, as last drawn: a piece is drawn again only
// when what it shows changes (hud.ts: its clock, its bolt filled or hollow,
// its gust, its slots).

/**
 * A watch over pieces: changed(piece, a…f) is true, and keeps a…f as what the
 * piece shows, when it has not been drawn or any of them differs from what it
 * was drawn with; false otherwise. Makes nothing after a piece's first.
 */
export function createChanged<K extends object>() {
  const drawn = new WeakMap<K, unknown[]>();
  return (
    el: K,
    a: unknown,
    b?: unknown,
    c?: unknown,
    d?: unknown,
    e?: unknown,
    f?: unknown
  ) => {
    let was = drawn.get(el);
    if (
      was &&
      was[0] === a &&
      was[1] === b &&
      was[2] === c &&
      was[3] === d &&
      was[4] === e &&
      was[5] === f
    )
      return false;
    if (!was) drawn.set(el, (was = [a, b, c, d, e, f]));
    was[0] = a;
    was[1] = b;
    was[2] = c;
    was[3] = d;
    was[4] = e;
    was[5] = f;
    return true;
  };
}
