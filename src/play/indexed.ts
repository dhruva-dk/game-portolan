// A list's entries by id, kept: indexed again only when handed another list, or
// told the one it has has changed in place, so that looking a ship or a crew up
// each frame makes nothing.

export function indexed<T extends { id: number }>() {
  const byId = new Map<number, T>();
  let list: readonly T[] | null = null;
  return {
    /** The entries of `of` by id. */
    of(of: readonly T[]): ReadonlyMap<number, T> {
      if (of === list) return byId;
      byId.clear();
      for (const t of of) byId.set(t.id, t);
      list = of;
      return byId;
    },
    /**
     * The list last indexed has changed in place: index it again when next
     * asked.
     */
    stale() {
      list = null;
    },
  };
}
