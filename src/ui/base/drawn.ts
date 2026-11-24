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
