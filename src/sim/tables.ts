export type Widen<T> = T extends number
  ? number
  : T extends string
    ? string
    : { readonly [K in keyof T]: Widen<T[K]> };

export function weighed(weights: readonly number[], u: number): number {
  let r = u * weights.reduce((a, b) => a + b, 0),
    k = 0;
  while (k < weights.length - 1 && r >= weights[k]) r -= weights[k++];
  return k;
}

export type Changes<T> = { readonly [S in keyof T]?: Partial<T[S]> };

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
