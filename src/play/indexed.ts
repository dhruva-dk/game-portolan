export function indexed<T extends { id: number }>() {
  const byId = new Map<number, T>();
  let list: readonly T[] | null = null;
  return {
    of(of: readonly T[]): ReadonlyMap<number, T> {
      if (of === list) return byId;
      byId.clear();
      for (const t of of) byId.set(t.id, t);
      list = of;
      return byId;
    },
    stale() {
      list = null;
    },
  };
}
